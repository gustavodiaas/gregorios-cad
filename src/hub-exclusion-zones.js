/**
 * @fileoverview Sistema de zonas de exclusão retangulares para hubs
 * 
 * @description
 * Cada hub gera automaticamente uma zona de exclusão retangular (projetada para
 * fora das arestas do recurso) que impede outros recursos de bloquear o ponto
 * de entrada/saída do hub. As dimensões (largura × profundidade) são editáveis
 * pelo usuário via right-click → "Editar Zona de Exclusão", que habilita handles
 * de arraste por aresta (estilo edição de polígono de recursos).
 * 
 * A geometria resultante é um retângulo orientado pela normal do hub, recortado
 * contra o polígono do recurso pai (exclui interior) e da área pai.
 * 
 * Integra-se com:
 * - Otimizador (colisão)
 * - Movimentação manual (colisão)
 * - NavMesh baker (bloqueio de nós)
 * - Renderização (visual permanente + animação pulse)
 * - Edição interativa (context menu + drag de arestas)
 * 
 * @module hub-exclusion-zones
 */

import { hubs, getHubsForResource, getAllHubRecords, getHubById } from './hubs.js';
import { resources, getConnections, getCurrentFloorId, movementAreas } from './state.js';
import { pixelsPerCm, polygonClipping, collisionCheckTolerance } from './config.js';
import { anchorToWorldCoordinates, getHubVisualRadius } from './connections/connectionUtils.js';
import { pointInPolygon, rectangleToVertices, calculatePolygonArea } from './areas.js';
import { migrateResourceToPolygonal } from './resources.js';
import {
    getEditingExclusionHubId,
    getDraggingExclusionEdge,
    getHoveredExclusionEdge
} from './state.js';

// ============================================================================
// CONSTANTES
// ============================================================================

/** Largura padrão da zona de exclusão em cm (perpendicular à normal) */
const DEFAULT_EXCLUSION_WIDTH_CM = 60;

/** Profundidade padrão da zona de exclusão em cm (na direção da normal) */
const DEFAULT_EXCLUSION_DEPTH_CM = 70;

/** Margem extra sobre a largura da conexão, em cm */
const EXCLUSION_MARGIN_CM = 10;

/** Período completo do pulso contínuo em ms */
const PULSE_PERIOD_MS = 2200;

/** Número de ondas concêntricas no pulso */
const PULSE_WAVE_COUNT = 2;

/** Intervalo mínimo (ms) entre verificações de invasão de zona de exclusão */
const INVASION_CHECK_INTERVAL_MS = 1000;

/** Distância de hit-test para arestas durante edição (px na tela) */
const EDGE_HIT_DISTANCE = 6;

/** Tamanho mínimo de dimensão em cm */
const MIN_DIMENSION_CM = 20;

/** Timestamp da última verificação de invasão */
let lastInvasionCheckTime = 0;

// ============================================================================
// ANIMAÇÃO RIPPLE
// ============================================================================

/** ID do frame de animação contínua */
let pulseAnimFrameId = null;

/** Indica se o loop de pulso contínuo está rodando */
let pulseLoopRunning = false;

/**
 * Loop de animação contínua — mantém redraws para o pulso sonar.
 * Roda enquanto houver pelo menos 1 hub no sistema.
 */
function pulseAnimationLoop() {
    pulseAnimFrameId = null;
    
    const allHubs = getAllHubRecords();
    if (!allHubs || allHubs.length === 0) {
        pulseLoopRunning = false;
        return;
    }
    
    // Importar drawAll lazily para evitar dependência circular
    import('./drawing.js').then(({ drawAll }) => {
        drawAll(false); // Apenas camada dinâmica
        pulseAnimFrameId = requestAnimationFrame(pulseAnimationLoop);
    });
}

/**
 * Inicia o loop de pulso contínuo se ainda não estiver rodando.
 * Chamado ao criar um hub.
 */
export function ensurePulseLoopRunning() {
    if (pulseLoopRunning) return;
    pulseLoopRunning = true;
    if (!pulseAnimFrameId) {
        pulseAnimFrameId = requestAnimationFrame(pulseAnimationLoop);
    }
}

/**
 * Para o loop de pulso (chamado quando todos os hubs são removidos).
 */
export function stopPulseLoop() {
    pulseLoopRunning = false;
    if (pulseAnimFrameId) {
        cancelAnimationFrame(pulseAnimFrameId);
        pulseAnimFrameId = null;
    }
}

/**
 * Chamado na criação de hub — garante animação contínua rodando.
 * (Mantido como API para hubs.js)
 * @param {string} hubId
 */
export function triggerExclusionRipple(hubId) {
    ensurePulseLoopRunning();
}

/**
 * Verifica se o pulso está ativo (sempre true se há hubs).
 * @returns {boolean}
 */
export function hasActiveRipples() {
    return pulseLoopRunning;
}

// ============================================================================
// CÁLCULO DAS DIMENSÕES (4 ARESTAS INDEPENDENTES)
// ============================================================================

/**
 * Calcula a distância padrão de uma aresta lateral (esquerda ou direita) em cm,
 * baseada na maior largura de conexão do hub.
 * @param {object} hub
 * @returns {number} Distância em cm do centro do hub até a aresta lateral
 */
function getDefaultSideDistCm(hub) {
    const connectionIds = hub?.connectionIds || [];
    if (connectionIds.length === 0) return DEFAULT_EXCLUSION_WIDTH_CM / 2;
    
    const connections = getConnections();
    let maxWidth = 0;
    for (const connId of connectionIds) {
        const conn = connections.find(c => c.id === connId);
        if (conn && conn.width > maxWidth) maxWidth = conn.width;
    }
    if (maxWidth === 0) return DEFAULT_EXCLUSION_WIDTH_CM / 2;
    return maxWidth / 2;
}

/**
 * Calcula a distância padrão da aresta far (distante, na direção da normal) em cm.
 * @param {object} hub
 * @returns {number} Distância em cm
 */
function getDefaultFarDistCm(hub) {
    const connectionIds = hub?.connectionIds || [];
    if (connectionIds.length === 0) return DEFAULT_EXCLUSION_DEPTH_CM;
    
    const connections = getConnections();
    let maxWidth = 0;
    for (const connId of connectionIds) {
        const conn = connections.find(c => c.id === connId);
        if (conn && conn.width > maxWidth) maxWidth = conn.width;
    }
    if (maxWidth === 0) return DEFAULT_EXCLUSION_DEPTH_CM;
    return maxWidth + EXCLUSION_MARGIN_CM;
}

/**
 * Retorna as 4 distâncias de aresta do retângulo de exclusão em cm.
 * Cada aresta pode ter valor customizado (salvo no hub) ou usar o padrão.
 * 
 * @param {object} hub
 * @returns {{far: number, near: number, right: number, left: number}} Distâncias em cm
 */
export function getExclusionEdgeDistances(hub) {
    if (!hub) {
        return {
            far: DEFAULT_EXCLUSION_DEPTH_CM,
            near: 0,
            right: DEFAULT_EXCLUSION_WIDTH_CM / 2,
            left: DEFAULT_EXCLUSION_WIDTH_CM / 2
        };
    }
    
    const defaultSide = getDefaultSideDistCm(hub);
    const defaultFar = getDefaultFarDistCm(hub);
    
    return {
        far:   hub.exclusionFar   ?? defaultFar,
        near:  hub.exclusionNear  ?? 0,
        right: hub.exclusionRight ?? defaultSide,
        left:  hub.exclusionLeft  ?? defaultSide
    };
}

/**
 * Retorna as 4 distâncias de aresta em pixels.
 * @param {object} hub
 * @returns {{farPx: number, nearPx: number, rightPx: number, leftPx: number}}
 */
export function getExclusionEdgeDistancesPx(hub) {
    const d = getExclusionEdgeDistances(hub);
    return {
        farPx:   d.far   * pixelsPerCm,
        nearPx:  d.near  * pixelsPerCm,
        rightPx: d.right * pixelsPerCm,
        leftPx:  d.left  * pixelsPerCm
    };
}

/**
 * Compat: largura total em cm (left + right).
 */
export function getExclusionWidthCm(hub) {
    const d = getExclusionEdgeDistances(hub);
    return d.left + d.right;
}

/**
 * Compat: profundidade total em cm (far + near).
 */
export function getExclusionDepthCm(hub) {
    const d = getExclusionEdgeDistances(hub);
    return d.far + d.near;
}

/**
 * Compat: retorna dimensões totais em pixels.
 */
export function getExclusionDimsPx(hub) {
    const d = getExclusionEdgeDistancesPx(hub);
    return {
        widthPx: d.leftPx + d.rightPx,
        depthPx: d.farPx + d.nearPx
    };
}

/**
 * Raio de exclusão em pixels para fast-reject.
 * Retorna a distância do hub ao vértice mais distante do retângulo,
 * considerando que o hub NÃO está no centro (near pode ser 0).
 */
export function getExclusionRadiusPx(hub) {
    const d = getExclusionEdgeDistancesPx(hub);
    const maxNorm = Math.max(d.farPx, d.nearPx);
    const maxPerp = Math.max(d.leftPx, d.rightPx);
    return Math.sqrt(maxNorm * maxNorm + maxPerp * maxPerp);
}

/**
 * Raio de exclusão em cm (compat).
 */
export function getExclusionRadiusCm(hub) {
    const d = getExclusionEdgeDistances(hub);
    const maxNorm = Math.max(d.far, d.near);
    const maxPerp = Math.max(d.left, d.right);
    return Math.sqrt(maxNorm * maxNorm + maxPerp * maxPerp);
}

// ============================================================================
// GEOMETRIA — RETÂNGULO ORIENTADO PELA NORMAL
// ============================================================================

/**
 * Resolve a posição mundial de um hub, considerando se está ancorado.
 * @param {object} hub
 * @param {object} [resourceOverride]
 * @returns {{x: number, y: number}|null}
 */
function resolveHubWorldPosition(hub, resourceOverride) {
    let hubX = hub.x;
    let hubY = hub.y;
    if (hub.isAnchored && hub.resourceId) {
        const resource = resourceOverride || resources.find(r => r.id === hub.resourceId);
        if (resource) {
            const wc = anchorToWorldCoordinates(resource, { x: hub.localX, y: hub.localY });
            hubX = wc.x;
            hubY = wc.y;
        }
    }
    if (hubX == null || hubY == null) return null;
    return { x: hubX, y: hubY };
}

/**
 * Calcula os 4 vértices do retângulo de exclusão orientado pela normal do hub.
 * Cada aresta é independentemente controlável:
 *   - far:   distância ao longo da normal (para fora do recurso)
 *   - near:  distância oposta à normal (em direção ao recurso, geralmente 0)
 *   - right: distância à direita (perpendicular à normal)
 *   - left:  distância à esquerda (perpendicular à normal)
 * 
 * Os 4 vértices são retornados em ordem: TL, TR, BR, BL (sentido horário)
 * onde "top" = lado distante (far) e "bottom" = lado próximo (near).
 * 
 * @param {object} hub
 * @param {object} [resourceOverride]
 * @returns {Array<[number,number]>|null}
 */
export function computeExclusionRectVertices(hub, resourceOverride) {
    if (!hub) return null;
    
    const pos = resolveHubWorldPosition(hub, resourceOverride);
    if (!pos) return null;
    
    const nx = hub.normalX ?? 0;
    const ny = hub.normalY ?? 0;
    if (nx === 0 && ny === 0) return null;
    
    // Normalizar a normal
    const len = Math.sqrt(nx * nx + ny * ny);
    const dnx = nx / len; // Direção far (normal)
    const dny = ny / len;
    const pwx = -dny;     // Direção right (perpendicular)
    const pwy = dnx;
    
    const { farPx, nearPx, rightPx, leftPx } = getExclusionEdgeDistancesPx(hub);
    
    // 4 vértices com arestas independentes
    const vertices = [
        [pos.x + dnx * farPx  - pwx * leftPx,  pos.y + dny * farPx  - pwy * leftPx],  // TL (far-left)
        [pos.x + dnx * farPx  + pwx * rightPx, pos.y + dny * farPx  + pwy * rightPx], // TR (far-right)
        [pos.x - dnx * nearPx + pwx * rightPx, pos.y - dny * nearPx + pwy * rightPx], // BR (near-right)
        [pos.x - dnx * nearPx - pwx * leftPx,  pos.y - dny * nearPx - pwy * leftPx]   // BL (near-left)
    ];
    
    return vertices;
}

/**
 * Calcula os vértices do polígono de exclusão de um hub.
 * Mantém assinatura compatível com código existente (alias).
 * @param {object} hub
 * @param {object} [resourceOverride]
 * @returns {Array<[number,number]>|null}
 */
export function computeExclusionArcVertices(hub, resourceOverride) {
    return computeExclusionRectVertices(hub, resourceOverride);
}

/**
 * Calcula as 4 arestas do retângulo de exclusão para hit-testing.
 * Retorna as arestas como segmentos nomeados: top, right, bottom, left.
 * 
 * @param {object} hub
 * @param {object} [resourceOverride]
 * @returns {{top: [[number,number],[number,number]], right: ..., bottom: ..., left: ...}|null}
 */
export function computeExclusionRectEdges(hub, resourceOverride) {
    const verts = computeExclusionRectVertices(hub, resourceOverride);
    if (!verts || verts.length !== 4) return null;
    
    // TL=0, TR=1, BR=2, BL=3
    return {
        top:    [verts[0], verts[1]], // Aresta distante (longe do recurso)
        right:  [verts[1], verts[2]], // Aresta direita
        bottom: [verts[2], verts[3]], // Aresta próxima (perto do recurso)
        left:   [verts[3], verts[0]]  // Aresta esquerda
    };
}

/**
 * Detecta em qual aresta do retângulo de exclusão um ponto está (para edição).
 * @param {number} px - Coordenada X do ponto (mundo)
 * @param {number} py - Coordenada Y do ponto (mundo)
 * @param {object} hub
 * @param {number} currentScale - Escala atual do canvas
 * @returns {string|null} 'top' | 'right' | 'bottom' | 'left' | null
 */
export function getExclusionEdgeAtPoint(px, py, hub, currentScale) {
    const edges = computeExclusionRectEdges(hub);
    if (!edges) return null;
    
    const threshold = EDGE_HIT_DISTANCE / currentScale;
    let bestEdge = null;
    let bestDist = Infinity;
    
    for (const [edgeName, [p1, p2]] of Object.entries(edges)) {
        const dist = distanceToSegment(px, py, p1[0], p1[1], p2[0], p2[1]);
        if (dist < threshold && dist < bestDist) {
            bestDist = dist;
            bestEdge = edgeName;
        }
    }
    
    return bestEdge;
}

/**
 * Detecta se um ponto está dentro de alguma zona de exclusão (para context menu).
 * @param {number} px - Coordenada X (mundo)
 * @param {number} py - Coordenada Y (mundo)
 * @returns {object|null} Hub cuja zona contém o ponto, ou null
 */
export function findExclusionZoneAtPoint(px, py) {
    const allHubs = getAllHubRecords();
    if (!allHubs || allHubs.length === 0) return null;
    
    const currentFloorId = getCurrentFloorId();
    
    for (const hub of allHubs) {
        if (hub.floorId && hub.floorId !== currentFloorId) continue;
        if (!hub.resourceId && !hub.boundaryOpeningId) continue;
        
        const verts = computeExclusionRectVertices(hub);
        if (!verts || verts.length < 3) continue;
        
        if (pointInPolygon([px, py], verts)) {
            // Verificar que não está dentro do recurso pai
            if (hub.resourceId) {
                const res = resources.find(r => r.id === hub.resourceId);
                if (res) {
                    const migrated = migrateResourceToPolygonal(res);
                    if (pointInPolygon([px, py], migrated.vertices)) continue;
                }
            }
            return hub;
        }
    }
    return null;
}

/**
 * Distância de um ponto a um segmento de reta.
 */
function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Aplica um delta de drag a uma aresta individual do retângulo de exclusão.
 * Cada aresta é controlada independentemente.
 * 
 * @param {object} hub
 * @param {string} edge - 'top' | 'right' | 'bottom' | 'left'
 * @param {number} deltaWorld - Delta em pixels mundo na direção da aresta
 */
export function applyExclusionEdgeDrag(hub, edge, deltaWorld) {
    const deltaCm = deltaWorld / pixelsPerCm;
    const d = getExclusionEdgeDistances(hub);
    
    if (edge === 'top') {
        hub.exclusionFar = Math.max(MIN_DIMENSION_CM, d.far + deltaCm);
    } else if (edge === 'bottom') {
        hub.exclusionNear = Math.max(0, d.near + deltaCm);
    } else if (edge === 'right') {
        hub.exclusionRight = Math.max(MIN_DIMENSION_CM, d.right + deltaCm);
    } else if (edge === 'left') {
        hub.exclusionLeft = Math.max(MIN_DIMENSION_CM, d.left + deltaCm);
    }
}

// ============================================================================
// DETECÇÃO DE COLISÃO COM ZONAS DE EXCLUSÃO
// ============================================================================

/**
 * Verifica se um polígono (vértices de um recurso) invade alguma zona de
 * exclusão retangular de hubs pertencentes a OUTROS recursos.
 * 
 * @param {Array<[number,number]>} candidateVertices - Vértices do recurso que está se movendo
 * @param {string} resourceId - ID do recurso em movimento (para ignorar seus próprios hubs)
 * @param {string[]} [ignoreResourceIds=[]] - IDs adicionais a ignorar
 * @param {object} [options={}] - Opções adicionais
 * @param {Set<string>} [options.coMovingResourceIds] - IDs de recursos co-movendo (mesmo delta)
 * @param {number} [options.deltaX=0] - Delta X aplicado aos recursos co-movendo
 * @param {number} [options.deltaY=0] - Delta Y aplicado aos recursos co-movendo
 * @returns {boolean} true se colide com alguma zona de exclusão
 */
export function collidesWithExclusionZones(candidateVertices, resourceId, ignoreResourceIds = [], options = {}) {
    if (!candidateVertices || candidateVertices.length < 3) return false;
    
    const allHubs = getAllHubRecords();
    if (!allHubs || allHubs.length === 0) return false;
    
    const ignoreSet = new Set(ignoreResourceIds);
    ignoreSet.add(resourceId);

    const coMovingSet = options.coMovingResourceIds || null;
    const deltaX = options.deltaX || 0;
    const deltaY = options.deltaY || 0;

    const candidateRes = resources.find(r => r.id === resourceId);
    const candidateAreaId = candidateRes ? candidateRes.parentAreaId : null;

    // Bounding box do candidato para fast-reject
    let cMinX = Infinity, cMaxX = -Infinity, cMinY = Infinity, cMaxY = -Infinity;
    for (const [vx, vy] of candidateVertices) {
        if (vx < cMinX) cMinX = vx;
        if (vx > cMaxX) cMaxX = vx;
        if (vy < cMinY) cMinY = vy;
        if (vy > cMaxY) cMaxY = vy;
    }
    const cCx = (cMinX + cMaxX) / 2;
    const cCy = (cMinY + cMaxY) / 2;
    const cHalfDiag = Math.sqrt((cMaxX - cMinX) ** 2 + (cMaxY - cMinY) ** 2) / 2;

    for (const hub of allHubs) {
        if (hub.resourceId && ignoreSet.has(hub.resourceId)) continue;
        if (!hub.resourceId && !hub.boundaryOpeningId) continue;

        if (hub.resourceId && candidateAreaId) {
            const hubParentRes = resources.find(r => r.id === hub.resourceId);
            if (hubParentRes && hubParentRes.parentAreaId !== candidateAreaId) continue;
        }
        
        const radiusPx = getExclusionRadiusPx(hub);

        const pos = resolveHubWorldPosition(hub);
        if (!pos) continue;
        let hubX = pos.x;
        let hubY = pos.y;

        // Ajustar se co-movendo
        const isCoMoving = coMovingSet && hub.resourceId && coMovingSet.has(hub.resourceId);
        if (isCoMoving) {
            hubX += deltaX;
            hubY += deltaY;
        }

        // Fast-reject por distância
        const dx = cCx - hubX;
        const dy = cCy - hubY;
        if (Math.sqrt(dx * dx + dy * dy) > radiusPx + cHalfDiag) continue;

        // Computar polígono da zona de exclusão (retângulo orientado)
        let rectVertices;
        if (isCoMoving && hub.resourceId) {
            const parentRes = resources.find(r => r.id === hub.resourceId);
            if (parentRes) {
                const virtualRes = {
                    ...parentRes,
                    vertices: migrateResourceToPolygonal(parentRes).vertices.map(([px, py]) => [px + deltaX, py + deltaY]),
                    x: (parentRes.x || 0) + deltaX,
                    y: (parentRes.y || 0) + deltaY,
                    boundingBox: parentRes.boundingBox ? {
                        ...parentRes.boundingBox,
                        x: parentRes.boundingBox.x + deltaX,
                        y: parentRes.boundingBox.y + deltaY
                    } : undefined
                };
                const virtualHub = { ...hub, x: hubX, y: hubY };
                rectVertices = computeExclusionRectVertices(virtualHub, virtualRes);
            } else {
                rectVertices = computeExclusionRectVertices(hub);
            }
        } else {
            rectVertices = computeExclusionRectVertices(hub);
        }

        if (!rectVertices || rectVertices.length < 3) continue;

        if (checkPolygonOverlap(candidateVertices, rectVertices)) {
            return true;
        }
    }

    // =========================================================================
    // VERIFICAÇÃO REVERSA: as zonas de exclusão do próprio recurso em movimento
    // colidem com algum recurso estacionário?
    // =========================================================================
    const ownHubs = getHubsForResource(resourceId);
    if (ownHubs && ownHubs.length > 0) {
        const movingRes = resources.find(r => r.id === resourceId);
        if (movingRes) {
            const virtualRes = {
                ...movingRes,
                vertices: candidateVertices,
                parentAreaId: movingRes.parentAreaId,
                boundingBox: { x: cMinX, y: cMinY, width: cMaxX - cMinX, height: cMaxY - cMinY }
            };
            if (typeof movingRes.x === 'number') {
                virtualRes.x = cMinX;
                virtualRes.y = cMinY;
            }

            for (const hub of ownHubs) {
                let hubX, hubY;
                if (hub.isAnchored) {
                    const wc = anchorToWorldCoordinates(virtualRes, { x: hub.localX, y: hub.localY });
                    hubX = wc.x;
                    hubY = wc.y;
                } else {
                    const origMigrated = migrateResourceToPolygonal(movingRes);
                    const origBB = movingRes.boundingBox || {
                        x: Math.min(...origMigrated.vertices.map(v => v[0])),
                        y: Math.min(...origMigrated.vertices.map(v => v[1]))
                    };
                    hubX = hub.x + (cMinX - origBB.x);
                    hubY = hub.y + (cMinY - origBB.y);
                }
                if (hubX == null || hubY == null) continue;

                const virtualHub = { ...hub, x: hubX, y: hubY };
                const rectVertices = computeExclusionRectVertices(virtualHub, virtualRes);
                if (!rectVertices || rectVertices.length < 3) continue;

                // Verificar se a zona de exclusão extravasa as paredes da área pai
                if (candidateAreaId) {
                    const parentArea = movementAreas.find(a => a.id === candidateAreaId);
                    if (parentArea) {
                        const areaVerts = parentArea.vertices ||
                            rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
                        if (areaVerts && areaVerts.length >= 3) {
                            const rectExceedsArea = rectVertices.some(v => !pointInPolygon(v, areaVerts));
                            if (rectExceedsArea) {
                                return true;
                            }
                        }
                    }
                }

                const radiusPx = getExclusionRadiusPx(hub);

                for (const otherRes of resources) {
                    if (otherRes.id === resourceId) continue;
                    if (ignoreSet.has(otherRes.id)) continue;
                    if (otherRes.type === 'operator') continue;
                    if (candidateAreaId && otherRes.parentAreaId !== candidateAreaId) continue;

                    let otherVertices;
                    const otherIsCoMoving = coMovingSet && coMovingSet.has(otherRes.id);
                    if (otherIsCoMoving) {
                        otherVertices = migrateResourceToPolygonal(otherRes).vertices
                            .map(([px, py]) => [px + deltaX, py + deltaY]);
                    } else {
                        otherVertices = migrateResourceToPolygonal(otherRes).vertices;
                    }
                    if (!otherVertices || otherVertices.length < 3) continue;

                    // Fast-reject por distância
                    let oMinX = Infinity, oMaxX = -Infinity, oMinY = Infinity, oMaxY = -Infinity;
                    for (const [vx, vy] of otherVertices) {
                        if (vx < oMinX) oMinX = vx;
                        if (vx > oMaxX) oMaxX = vx;
                        if (vy < oMinY) oMinY = vy;
                        if (vy > oMaxY) oMaxY = vy;
                    }
                    const oCx = (oMinX + oMaxX) / 2;
                    const oCy = (oMinY + oMaxY) / 2;
                    const oHalfDiag = Math.sqrt((oMaxX - oMinX) ** 2 + (oMaxY - oMinY) ** 2) / 2;
                    const ddx = oCx - hubX;
                    const ddy = oCy - hubY;
                    if (Math.sqrt(ddx * ddx + ddy * ddy) > radiusPx + oHalfDiag) continue;

                    if (checkPolygonOverlap(otherVertices, rectVertices)) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

/**
 * Verifica sobreposição entre dois polígonos usando polygon-clipping.
 * Mesma abordagem de checkResourceOverlap / checkOverlap das áreas.
 * @param {Array<[number,number]>} poly1Vertices
 * @param {Array<[number,number]>} poly2Vertices
 * @returns {boolean}
 */
function checkPolygonOverlap(poly1Vertices, poly2Vertices) {
    if (!poly1Vertices || !poly2Vertices || poly1Vertices.length < 3 || poly2Vertices.length < 3) {
        return false;
    }
    try {
        const poly1 = [normalizeRing(poly1Vertices)];
        const poly2 = [normalizeRing(poly2Vertices)];
        const intersection = polygonClipping.intersection(poly1, poly2);
        if (intersection.length > 0) {
            let area = 0;
            for (const polygon of intersection) {
                for (const ring of polygon) {
                    area += Math.abs(calculatePolygonArea(ring));
                }
            }
            return area > collisionCheckTolerance;
        }
        return false;
    } catch (_) {
        // Fallback: verificar se algum vértice de um polígono está dentro do outro
        return poly1Vertices.some(v => pointInPolygon(v, poly2Vertices)) ||
               poly2Vertices.some(v => pointInPolygon(v, poly1Vertices));
    }
}

/**
 * Normaliza coordenadas de um anel de vértices (arredonda para 0.5px).
 */
function normalizeRing(vertices) {
    return vertices.map(([x, y]) => [
        Math.round(x * 2) / 2,
        Math.round(y * 2) / 2
    ]);
}

// ============================================================================
// VERIFICAÇÃO PARA NAVMESH
// ============================================================================

/**
 * Verifica se um nó da NavMesh (ponto) está dentro de alguma zona de exclusão
 * retangular de hub. Usado pelo navmeshbaker para bloquear nós.
 * 
 * @param {number} x - Coordenada X do nó
 * @param {number} y - Coordenada Y do nó
 * @param {string} areaId - ID da área sendo processada
 * @returns {boolean} true se o ponto está numa zona de exclusão
 */
export function isPointInHubExclusionZone(x, y, areaId) {
    const allHubs = getAllHubRecords();
    if (!allHubs || allHubs.length === 0) return false;
    
    for (const hub of allHubs) {
        if (!hub.resourceId && !hub.boundaryOpeningId) continue;
        
        // Filtrar por área
        if (hub.isAnchored && hub.resourceId) {
            const parentRes = resources.find(r => r.id === hub.resourceId);
            if (!parentRes || parentRes.parentAreaId !== areaId) continue;
        }
        
        // Fast-reject por distância (usando diagonal como raio)
        const pos = resolveHubWorldPosition(hub);
        if (!pos) continue;
        
        const radiusPx = getExclusionRadiusPx(hub);
        const dx = x - pos.x;
        const dy = y - pos.y;
        if (dx * dx + dy * dy >= radiusPx * radiusPx) continue;
        
        // Verificar com o retângulo real
        const verts = computeExclusionRectVertices(hub);
        if (!verts || verts.length < 3) continue;
        
        if (!pointInPolygon([x, y], verts)) continue;
        
        // Verificar que não está dentro do recurso pai
        if (hub.resourceId) {
            const parentRes = resources.find(r => r.id === hub.resourceId);
            if (parentRes) {
                const migrated = migrateResourceToPolygonal(parentRes);
                if (pointInPolygon([x, y], migrated.vertices)) continue;
            }
        }
        
        return true;
    }
    
    return false;
}

// ============================================================================
// RENDERIZAÇÃO
// ============================================================================

/**
 * Desenha todas as zonas de exclusão retangulares de hubs no canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} currentScale - Escala atual do canvas
 */
export function drawExclusionZones(ctx, currentScale) {
    if (!ctx) return;
    
    const allHubs = getAllHubRecords();
    if (!allHubs || allHubs.length === 0) return;
    
    const currentFloorId = getCurrentFloorId();
    const now = performance.now();
    const editingHubId = getEditingExclusionHubId();
    const hoveredEdge = getHoveredExclusionEdge();
    
    // Verificação periódica de invasões
    checkAndLogExclusionInvasions();

    for (const hub of allHubs) {
        if (hub.floorId && hub.floorId !== currentFloorId) continue;
        
        const verts = computeExclusionRectVertices(hub);
        if (!verts || verts.length < 3) continue;
        
        // Obter polígono do recurso pai para clipping (excluir interior)
        let resourceVertices = null;
        let areaVertices = null;
        if (hub.resourceId) {
            const resource = resources.find(r => r.id === hub.resourceId);
            if (resource) {
                const migrated = migrateResourceToPolygonal(resource);
                resourceVertices = migrated.vertices;
                if (resource.parentAreaId) {
                    const parentArea = movementAreas.find(a => a.id === resource.parentAreaId);
                    if (parentArea) {
                        areaVertices = parentArea.vertices ||
                            rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
                    }
                }
            }
        }
        
        const isEditing = editingHubId === hub.id;
        
        // --- Zona de exclusão permanente ---
        drawExclusionRect(ctx, verts, resourceVertices, areaVertices, currentScale, isEditing);
        
        // --- Pulso sonar contínuo ---
        const pos = resolveHubWorldPosition(hub);
        if (pos) {
            const edgeDists = getExclusionEdgeDistancesPx(hub);
            drawContinuousPulse(ctx, pos, hub, edgeDists, resourceVertices, areaVertices, now, currentScale);
        }
        
        // --- Handles de edição (se em modo de edição) ---
        if (isEditing) {
            drawExclusionEdgeHandles(ctx, hub, currentScale, hoveredEdge);
        }
    }
}

/**
 * Desenha o retângulo de exclusão permanente de um hub.
 * Recorta contra o recurso pai (exclui interior) e contra a área pai.
 */
function drawExclusionRect(ctx, verts, resourceVertices, areaVertices, currentScale, isEditing) {
    ctx.save();

    // Clip à área pai (paredes)
    if (areaVertices && areaVertices.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(areaVertices[0][0], areaVertices[0][1]);
        for (let i = 1; i < areaVertices.length; i++) {
            ctx.lineTo(areaVertices[i][0], areaVertices[i][1]);
        }
        ctx.closePath();
        ctx.clip();
    }
    
    // Clip ao retângulo de exclusão para evitar que o even-odd pinte o interior do recurso
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(verts[i][0], verts[i][1]);
    }
    ctx.closePath();
    ctx.clip();
    
    // Desenhar o retângulo
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(verts[i][0], verts[i][1]);
    }
    ctx.closePath();
    
    // Se tiver recurso pai, recortar a parte interna
    if (resourceVertices && resourceVertices.length >= 3) {
        // Sub-path no sentido inverso para criar "furo"
        ctx.moveTo(resourceVertices[resourceVertices.length - 1][0], resourceVertices[resourceVertices.length - 1][1]);
        for (let i = resourceVertices.length - 1; i >= 0; i--) {
            ctx.lineTo(resourceVertices[i][0], resourceVertices[i][1]);
        }
        ctx.closePath();
    }
    
    // Preencher
    const alpha = isEditing ? 0.15 : 0.08;
    ctx.fillStyle = `rgba(139, 92, 246, ${alpha})`;
    ctx.fill('evenodd');
    
    // Borda tracejada
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(verts[i][0], verts[i][1]);
    }
    ctx.closePath();
    
    const dashSize = 3 / currentScale;
    ctx.setLineDash([dashSize, dashSize]);
    ctx.strokeStyle = isEditing ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.25)';
    ctx.lineWidth = (isEditing ? 1.5 : 1) / currentScale;
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.restore();
}

/**
 * Desenha o pulso sonar contínuo — ondas retangulares expandindo.
 */
function drawContinuousPulse(ctx, hubPos, hub, edgeDists, resourceVertices, areaVertices, now, currentScale) {
    ctx.save();

    // Clip à área pai (paredes)
    if (areaVertices && areaVertices.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(areaVertices[0][0], areaVertices[0][1]);
        for (let i = 1; i < areaVertices.length; i++) {
            ctx.lineTo(areaVertices[i][0], areaVertices[i][1]);
        }
        ctx.closePath();
        ctx.clip();
    }
    
    // Clipping invertido (excluir recurso pai)
    const maxExtent = Math.max(edgeDists.farPx, edgeDists.nearPx, edgeDists.rightPx, edgeDists.leftPx);
    if (resourceVertices && resourceVertices.length >= 3) {
        ctx.beginPath();
        const margin = maxExtent + 200;
        ctx.rect(hubPos.x - margin, hubPos.y - margin, margin * 2, margin * 2);
        ctx.moveTo(resourceVertices[resourceVertices.length - 1][0], resourceVertices[resourceVertices.length - 1][1]);
        for (let i = resourceVertices.length - 1; i >= 0; i--) {
            ctx.lineTo(resourceVertices[i][0], resourceVertices[i][1]);
        }
        ctx.closePath();
        ctx.clip('evenodd');
    }
    
    const nx = hub.normalX ?? 0;
    const ny = hub.normalY ?? 0;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len === 0) { ctx.restore(); return; }
    
    const dnx = nx / len;
    const dny = ny / len;
    const pwx = -dny;
    const pwy = dnx;
    
    // Progresso cíclico global (0→1 repete)
    const cycleProgress = (now % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
    
    for (let w = 0; w < PULSE_WAVE_COUNT; w++) {
        const wavePhase = (cycleProgress + w / PULSE_WAVE_COUNT) % 1.0;
        const easedPhase = 1 - Math.pow(1 - wavePhase, 2);
        
        // Escalar cada aresta independentemente pela fase
        const wFar   = edgeDists.farPx   * easedPhase;
        const wNear  = edgeDists.nearPx  * easedPhase;
        const wRight = edgeDists.rightPx * easedPhase;
        const wLeft  = edgeDists.leftPx  * easedPhase;
        
        if (wFar < 1 && wRight < 1) continue;
        
        const opacity = (1 - wavePhase) * 0.3;
        
        // Desenhar retângulo orientado na fase atual (assimétrico)
        ctx.beginPath();
        ctx.moveTo(
            hubPos.x + dnx * wFar - pwx * wLeft,
            hubPos.y + dny * wFar - pwy * wLeft
        );
        ctx.lineTo(
            hubPos.x + dnx * wFar + pwx * wRight,
            hubPos.y + dny * wFar + pwy * wRight
        );
        ctx.lineTo(
            hubPos.x - dnx * wNear + pwx * wRight,
            hubPos.y - dny * wNear + pwy * wRight
        );
        ctx.lineTo(
            hubPos.x - dnx * wNear - pwx * wLeft,
            hubPos.y - dny * wNear - pwy * wLeft
        );
        ctx.closePath();
        
        ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
        ctx.lineWidth = (1.5 + (1 - wavePhase) * 1.5) / currentScale;
        ctx.stroke();
    }
    
    ctx.restore();
}

/**
 * Desenha os handles de edição das arestas do retângulo de exclusão.
 * Arestas ficam destacadas para indicar que podem ser arrastadas.
 * A aresta hovered fica ainda mais destacada.
 */
function drawExclusionEdgeHandles(ctx, hub, currentScale, hoveredEdge) {
    const edges = computeExclusionRectEdges(hub);
    if (!edges) return;
    
    const draggingEdge = getDraggingExclusionEdge();
    
    ctx.save();
    
    for (const [edgeName, [p1, p2]] of Object.entries(edges)) {
        const isHovered = edgeName === hoveredEdge;
        const isDragging = edgeName === draggingEdge;
        
        // Desenhar aresta
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        
        if (isDragging) {
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.9)';
            ctx.lineWidth = 3 / currentScale;
        } else if (isHovered) {
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)';
            ctx.lineWidth = 2.5 / currentScale;
        } else {
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
            ctx.lineWidth = 1.5 / currentScale;
        }
        ctx.setLineDash([]);
        ctx.stroke();
        
        // Desenhar handle no ponto médio da aresta
        const midX = (p1[0] + p2[0]) / 2;
        const midY = (p1[1] + p2[1]) / 2;
        const handleSize = (isHovered || isDragging ? 5 : 3.5) / currentScale;
        
        ctx.beginPath();
        ctx.arc(midX, midY, handleSize, 0, Math.PI * 2);
        ctx.fillStyle = isDragging ? '#8b5cf6' : (isHovered ? 'rgba(139, 92, 246, 0.8)' : 'rgba(139, 92, 246, 0.5)');
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / currentScale;
        ctx.stroke();
    }
    
    ctx.restore();
}

// ============================================================================
// UTILITÁRIOS PARA INTEGRAÇÃO
// ============================================================================

/**
 * Retorna todas as zonas de exclusão ativas para pré-computação no navmesh.
 * Cada entrada contém os vértices do retângulo e vértices do recurso pai.
 * @param {string} areaId - Filtrar por área
 * @returns {Array<{hubX: number, hubY: number, radiusPx: number, rectVertices: Array|null, parentVertices: Array|null}>}
 */
export function getExclusionZonesForArea(areaId) {
    const allHubs = getAllHubRecords();
    if (!allHubs || allHubs.length === 0) return [];
    
    const zones = [];
    
    for (const hub of allHubs) {
        if (!hub.resourceId && !hub.boundaryOpeningId) continue;
        
        const radiusPx = getExclusionRadiusPx(hub);
        const pos = resolveHubWorldPosition(hub);
        if (!pos) continue;
        
        let parentVertices = null;
        
        if (hub.isAnchored && hub.resourceId) {
            const resource = resources.find(r => r.id === hub.resourceId);
            if (!resource) continue;
            if (resource.parentAreaId !== areaId) continue;
            
            const migrated = migrateResourceToPolygonal(resource);
            parentVertices = migrated.vertices;
        } else if (hub.boundaryOpeningId) {
            // Boundary hubs: incluir todos
        } else {
            continue;
        }
        
        const rectVertices = computeExclusionRectVertices(hub);
        
        zones.push({ hubX: pos.x, hubY: pos.y, radiusPx, rectVertices, parentVertices });
    }
    
    return zones;
}

// ============================================================================
// VERIFICAÇÃO CONTÍNUA DE INVASÃO DE ZONA DE EXCLUSÃO
// ============================================================================

/**
 * Verifica se algum recurso (ou parte dele) está atualmente invadindo alguma
 * zona de exclusão de hubs de OUTROS recursos. Faz log no console com detalhes.
 * Chamado periodicamente durante o draw loop (throttled).
 * Usa o mesmo mecanismo polygon-clipping de collidesWithExclusionZones.
 */
export function checkAndLogExclusionInvasions() {
    const now = performance.now();
    if (now - lastInvasionCheckTime < INVASION_CHECK_INTERVAL_MS) return;
    lastInvasionCheckTime = now;

    const allHubs = getAllHubRecords();
    if (!allHubs || allHubs.length === 0) return;
    if (!resources || resources.length === 0) return;

    for (const res of resources) {
        if (!res || res.type === 'operator') continue;

        const migrated = migrateResourceToPolygonal(res);
        const vertices = migrated.vertices;
        if (!vertices || vertices.length < 3) continue;

        for (const hub of allHubs) {
            if (hub.resourceId && hub.resourceId === res.id) continue;
            if (!hub.resourceId && !hub.boundaryOpeningId) continue;

            const widthCm = getExclusionWidthCm(hub);
            const depthCm = getExclusionDepthCm(hub);
            const rectVertices = computeExclusionRectVertices(hub);
            if (!rectVertices || rectVertices.length < 3) continue;

            if (checkPolygonOverlap(vertices, rectVertices)) {
                console.log(
                    `[ExclusionZone‑INVASÃO] Recurso "${res.name || res.id}" (id=${res.id}) ` +
                    `invade zona de exclusão do hub ${hub.id} (${widthCm.toFixed(0)}×${depthCm.toFixed(0)}cm, ` +
                    `recurso-pai do hub=${hub.resourceId || 'boundary'})`
                );
            }
        }
    }
}
