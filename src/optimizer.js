/**
 * @fileoverview Sistema de otimização de layout
 * 
 * @description
 * Módulo responsável pela otimização automática do posicionamento de recursos
 * dentro das áreas de movimentação. Implementa algoritmos de busca local
 * para minimizar a distância total das conexões (fitness).
 * 
 * Fase 1: Infraestrutura (evaluateLayout, save/restore, moveResourceBy, isPositionValid)
 * Fase 2: Hill Climbing
 * 
 * @module optimizer
 */

import { resources, movementAreas, getConnections } from './state.js';
import { calculateConnectionDistance, updateConnectionPathsForResource } from './connections/connectionCore.js';
import { getHubsForResource } from './hubs.js';
import { isPointInArea, checkOverlap, pointInPolygon, rectangleToVertices } from './areas.js';
import { layoutChangeNotifier } from './core/layout-change-notifier.js';
import { drawAll } from './drawing.js';
import { updateConnectionDistancesTable } from './flow-metrics.js';
import { saveStateToHistory } from './history.js';
import { pixelsPerCm } from './config.js';
import { updateResourceCompatibilityProperties, getPolygonCentroid, migrateResourceToPolygonal } from './resources.js';
import { collidesWithExclusionZones } from './hub-exclusion-zones.js';
import { collidesWithStandaloneExclusionZones } from './exclusion-zones.js';
import { getMeasurementUnit, parseMeasurementInput } from './measurement-units.js';

// ============================================================================
// CONSTANTES
// ============================================================================

/** Direções de movimento: N, S, E, W, NE, NW, SE, SW */
const DIRECTIONS = [
    { dx:  0, dy: -1, name: 'N'  },
    { dx:  0, dy:  1, name: 'S'  },
    { dx:  1, dy:  0, name: 'E'  },
    { dx: -1, dy:  0, name: 'W'  },
    { dx:  1, dy: -1, name: 'NE' },
    { dx: -1, dy: -1, name: 'NW' },
    { dx:  1, dy:  1, name: 'SE' },
    { dx: -1, dy:  1, name: 'SW' },
];

/** Margem mínima entre recursos (em pixels) */
const MIN_RESOURCE_MARGIN_PX = 1;

/** Ângulos de rotação a testar durante otimização (graus) */
const ROTATION_ANGLES = [90, 180, 270];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Cede controle ao event loop do navegador para manter a UI responsiva.
 * @returns {Promise<void>}
 */
function yieldToMain() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Obtém os vértices efetivos de um recurso (polígono ou bounding box).
 * @param {Object} resource
 * @returns {Array<[number, number]>}
 */
function getResourceVertices(resource) {
    if (resource.vertices && resource.vertices.length >= 3) {
        return resource.vertices;
    }
    // Fallback: retângulo a partir de x, y, width, height
    const { x, y, width, height } = resource;
    return [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
    ];
}

/**
 * Calcula o centroide de um polígono.
 * @param {Array<[number, number]>} vertices
 * @returns {{x: number, y: number}}
 */
function computeCentroid(vertices) {
    if (!vertices || vertices.length === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    for (const [vx, vy] of vertices) {
        sx += vx;
        sy += vy;
    }
    return { x: sx / vertices.length, y: sy / vertices.length };
}

/**
 * Verifica se um recurso deve ser ignorado pela otimização.
 * Recursos locked, stairs e operators não são movidos.
 * @param {Object} resource
 * @returns {boolean} true se deve ser ignorado
 */
function isResourceImmovable(resource) {
    if (resource.locked) return true;
    if (resource.type === 'stair') return true;
    if (resource.type === 'operator') return true;
    return false;
}

/**
 * Rotaciona vértices ao redor de um ponto central.
 * Usa fórmulas exatas para 90°/180°/270° (sem erros de ponto flutuante).
 * @param {Array<[number, number]>} vertices
 * @param {number} cx - Centro X de rotação
 * @param {number} cy - Centro Y de rotação
 * @param {number} angleDeg - Ângulo em graus
 * @returns {Array<[number, number]>}
 */
function rotateVerticesAroundCenter(vertices, cx, cy, angleDeg) {
    const normalized = ((angleDeg % 360) + 360) % 360;
    if (normalized === 90) {
        return vertices.map(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            return [cx + dy, cy - dx];
        });
    }
    if (normalized === 180) {
        return vertices.map(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            return [cx - dx, cy - dy];
        });
    }
    if (normalized === 270) {
        return vertices.map(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            return [cx - dy, cy + dx];
        });
    }
    // Ângulo arbitrário
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return vertices.map(([x, y]) => {
        const dx = x - cx, dy = y - cy;
        return [
            Math.round((cx + dx * cos - dy * sin) * 1e6) / 1e6,
            Math.round((cy + dx * sin + dy * cos) * 1e6) / 1e6,
        ];
    });
}

/**
 * Rotaciona os localX/localY dos hubs de um recurso.
 * Versão leve (síncrona) para o otimizador — não dispara drawAll nem alerts.
 * @param {Array} hubList - Hubs do recurso
 * @param {number} angleDeg - Ângulo em graus
 */
function rotateHubLocals(hubList, angleDeg) {
    const normalized = ((angleDeg % 360) + 360) % 360;
    for (const hub of hubList) {
        let newLX, newLY, newNX, newNY;
        if (normalized === 90) {
            newLX = hub.localY;  newLY = -hub.localX;
            if (hub.normalX !== undefined) { newNX = hub.normalY; newNY = -hub.normalX; }
        } else if (normalized === 180) {
            newLX = -hub.localX; newLY = -hub.localY;
            if (hub.normalX !== undefined) { newNX = -hub.normalX; newNY = -hub.normalY; }
        } else if (normalized === 270) {
            newLX = -hub.localY; newLY = hub.localX;
            if (hub.normalX !== undefined) { newNX = -hub.normalY; newNY = hub.normalX; }
        } else {
            const rad = (angleDeg * Math.PI) / 180;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            newLX = hub.localX * cos - hub.localY * sin;
            newLY = hub.localX * sin + hub.localY * cos;
            if (hub.normalX !== undefined) {
                newNX = hub.normalX * cos - hub.normalY * sin;
                newNY = hub.normalX * sin + hub.normalY * cos;
            }
        }
        hub.localX = Math.round(newLX * 1000) / 1000;
        hub.localY = Math.round(newLY * 1000) / 1000;
        if (newNX !== undefined) {
            hub.normalX = Math.round(newNX * 1000) / 1000;
            hub.normalY = Math.round(newNY * 1000) / 1000;
        }
        // Invalidar cache de coordenadas globais
        delete hub.x;
        delete hub.y;
    }
}

/**
 * Aplica uma rotação leve a um recurso (sem drawAll, sem alert, sem grid-snap).
 * Atualiza vertices, rotation, hubs, e propriedades de compatibilidade.
 * @param {Object} resource
 * @param {number} angleDeg - Ângulo em graus
 * @returns {{ oldVertices, oldRotation, oldHubState }} Estado anterior para revert
 */
function applyResourceRotation(resource, angleDeg) {
    // Salvar estado anterior
    const oldVertices = resource.vertices ? resource.vertices.map(v => [...v]) : null;
    const oldRotation = resource.rotation || 0;
    const oldX = resource.x;
    const oldY = resource.y;
    const oldWidth = resource.width;
    const oldHeight = resource.height;

    const resourceHubs = getHubsForResource(resource.id) || [];
    const oldHubState = resourceHubs.map(h => ({
        id: h.id,
        localX: h.localX, localY: h.localY,
        normalX: h.normalX, normalY: h.normalY,
        x: h.x, y: h.y,
    }));

    // Garantir que o recurso tenha vértices
    const migrated = migrateResourceToPolygonal(resource);
    if (migrated !== resource && migrated.vertices) {
        resource.vertices = migrated.vertices;
    }

    // Calcular centroide e rotacionar
    const centroid = getPolygonCentroid(resource.vertices);
    const cx = centroid[0], cy = centroid[1];
    resource.vertices = rotateVerticesAroundCenter(resource.vertices, cx, cy, angleDeg);
    resource.rotation = ((oldRotation + angleDeg) % 360 + 360) % 360;

    // Atualizar propriedades de compatibilidade (x, y, width, height)
    updateResourceCompatibilityProperties(resource);

    // Rotacionar hubs
    rotateHubLocals(resourceHubs, angleDeg);

    return { oldVertices, oldRotation, oldHubState, oldX, oldY, oldWidth, oldHeight };
}

/**
 * Reverte uma rotação aplicada via applyResourceRotation.
 * @param {Object} resource
 * @param {Object} savedState - Estado retornado por applyResourceRotation
 */
function revertResourceRotation(resource, savedState) {
    resource.vertices = savedState.oldVertices ? savedState.oldVertices.map(v => [...v]) : resource.vertices;
    resource.rotation = savedState.oldRotation;
    resource.x = savedState.oldX;
    resource.y = savedState.oldY;
    resource.width = savedState.oldWidth;
    resource.height = savedState.oldHeight;

    // Restaurar estado dos hubs
    const resourceHubs = getHubsForResource(resource.id) || [];
    for (const saved of savedState.oldHubState) {
        const hub = resourceHubs.find(h => h.id === saved.id);
        if (!hub) continue;
        hub.localX = saved.localX;
        hub.localY = saved.localY;
        hub.normalX = saved.normalX;
        hub.normalY = saved.normalY;
        hub.x = saved.x;
        hub.y = saved.y;
    }
}

/**
 * Verifica se os vértices rotacionados resultam em posição válida
 * (dentro da área pai, sem colisão com outros recursos).
 * @param {Object} resource - O recurso (já com vertices rotacionados)
 * @returns {boolean}
 */
function isCurrentPositionValid(resource) {
    const vertices = getResourceVertices(resource);

    // 1. Verificar se está dentro da área pai
    const parentArea = resource.parentAreaId
        ? movementAreas.find(a => a.id === resource.parentAreaId)
        : null;

    if (parentArea) {
        const areaVertices = parentArea.vertices
            || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
        for (const vertex of vertices) {
            if (!pointInPolygon(vertex, areaVertices)) {
                return false;
            }
        }
    }

    // 2. Verificar colisão com outros recursos
    for (const other of resources) {
        if (other.id === resource.id) continue;
        const otherVertices = getResourceVertices(other);
        if (checkOverlap(vertices, otherVertices)) {
            return false;
        }
    }

    // 3. Verificar colisão com zonas de exclusão de hubs
    if (collidesWithExclusionZones(vertices, resource.id)) {
        return false;
    }

    // 4. Verificar colisão com zonas de exclusão standalone
    if (collidesWithStandaloneExclusionZones(vertices, resource.parentAreaId)) {
        return false;
    }

    return true;
}

/**
 * Verifica colisão de bounding boxes (AABB) com margem.
 * @param {Object} a - {x, y, width, height}
 * @param {Object} b - {x, y, width, height}
 * @param {number} margin
 * @returns {boolean}
 */
function aabbOverlap(a, b, margin = 0) {
    return !(
        a.x + a.width + margin  <= b.x ||
        b.x + b.width + margin  <= a.x ||
        a.y + a.height + margin <= b.y ||
        b.y + b.height + margin <= a.y
    );
}

// ============================================================================
// FASE 1: INFRAESTRUTURA
// ============================================================================

/**
 * Calcula a fitness atual do layout = soma das distâncias de todas as conexões.
 * Quanto menor, melhor.
 * @returns {number} Distância total em pixels
 */
export function evaluateLayout() {
    const connections = getConnections();
    if (!connections || connections.length === 0) return 0;

    let totalDistance = 0;
    for (const conn of connections) {
        totalDistance += calculateConnectionDistance(conn);
    }
    return totalDistance;
}

/**
 * Salva snapshot das posições atuais de todos os recursos.
 * @returns {Array<Object>} Snapshot com id, x, y, vertices de cada recurso
 */
export function saveResourcePositions() {
    return resources.map(r => {
        // Salvar estado dos hubs também (para restaurar após rotações)
        const hubList = getHubsForResource(r.id) || [];
        const hubState = hubList.map(h => ({
            id: h.id,
            localX: h.localX, localY: h.localY,
            normalX: h.normalX, normalY: h.normalY,
            x: h.x, y: h.y,
        }));
        return {
            id: r.id,
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            rotation: r.rotation || 0,
            vertices: r.vertices ? r.vertices.map(v => [...v]) : null,
            hubState,
        };
    });
}

/**
 * Restaura recursos para as posições salvas no snapshot.
 * @param {Array<Object>} snapshot
 */
export function restoreResourcePositions(snapshot) {
    if (!snapshot || !Array.isArray(snapshot)) return;

    for (const snap of snapshot) {
        const resource = resources.find(r => r.id === snap.id);
        if (!resource) continue;
        resource.x = snap.x;
        resource.y = snap.y;
        resource.width = snap.width;
        resource.height = snap.height;
        resource.rotation = snap.rotation;
        if (snap.vertices) {
            resource.vertices = snap.vertices.map(v => [...v]);
        }
        // Restaurar estado dos hubs
        if (snap.hubState) {
            const hubList = getHubsForResource(resource.id) || [];
            for (const saved of snap.hubState) {
                const hub = hubList.find(h => h.id === saved.id);
                if (!hub) continue;
                hub.localX = saved.localX;
                hub.localY = saved.localY;
                hub.normalX = saved.normalX;
                hub.normalY = saved.normalY;
                hub.x = saved.x;
                hub.y = saved.y;
            }
        }
    }
}

/**
 * Move um recurso por (dx, dy) em pixels, atualizando x, y, vertices,
 * e notificando o sistema para recalcular paths.
 * @param {Object} resource - O recurso a mover
 * @param {number} dx - Deslocamento X em pixels
 * @param {number} dy - Deslocamento Y em pixels
 */
export function moveResourceBy(resource, dx, dy) {
    if (!resource) return;

    // Atualizar posição
    resource.x += dx;
    resource.y += dy;

    // Atualizar vértices do polígono
    if (resource.vertices) {
        resource.vertices = resource.vertices.map(([vx, vy]) => [vx + dx, vy + dy]);
    }

    // Notificar o sistema (recalcula navmesh + paths das conexões afetadas)
    layoutChangeNotifier.notifyChange('resource', { action: 'move', entity: resource });
}

/**
 * Verifica se uma nova posição é válida para um recurso:
 * 1. Todos os vértices devem estar dentro da área pai
 * 2. Não pode colidir com outros recursos (com margem)
 * @param {Object} resource - O recurso a verificar
 * @param {number} newX - Nova posição X
 * @param {number} newY - Nova posição Y
 * @returns {boolean}
 */
export function isPositionValidForResource(resource, newX, newY) {
    const dx = newX - resource.x;
    const dy = newY - resource.y;

    // Calcular novos vértices
    const currentVertices = getResourceVertices(resource);
    const newVertices = currentVertices.map(([vx, vy]) => [vx + dx, vy + dy]);

    // 1. Verificar se está dentro da área pai
    const parentArea = resource.parentAreaId
        ? movementAreas.find(a => a.id === resource.parentAreaId)
        : null;

    if (parentArea) {
        // Todos os vértices devem estar dentro da área
        for (const vertex of newVertices) {
            if (!isPointInArea(vertex, parentArea)) {
                return false;
            }
        }
    }

    // 2. Verificar colisão com outros recursos
    // Primeiro teste rápido com AABB
    const newBBox = {
        x: newX,
        y: newY,
        width: resource.width,
        height: resource.height,
    };

    for (const other of resources) {
        if (other.id === resource.id) continue;

        const otherBBox = {
            x: other.x,
            y: other.y,
            width: other.width,
            height: other.height,
        };

        // Teste AABB rápido
        if (!aabbOverlap(newBBox, otherBBox, MIN_RESOURCE_MARGIN_PX)) {
            continue; // Sem sobreposição, próximo
        }

        // Teste refinado com polígonos (checkOverlap usa polygon-clipping)
        const otherVertices = getResourceVertices(other);
        if (checkOverlap(newVertices, otherVertices)) {
            return false;
        }
    }

    // 3. Verificar colisão com zonas de exclusão de hubs de outros recursos
    if (collidesWithExclusionZones(newVertices, resource.id)) {
        return false;
    }

    // 4. Verificar colisão com zonas de exclusão standalone
    if (collidesWithStandaloneExclusionZones(newVertices, resource.parentAreaId)) {
        return false;
    }

    return true;
}

// ============================================================================
// FASE 2: HILL CLIMBING
// ============================================================================

/**
 * Executa o algoritmo Hill Climbing para otimizar o layout.
 * 
 * Lógica:
 * - Calcula fitness atual (distância total de todas as conexões)
 * - Para cada recurso movível, tenta mover stepSize em 8 direções
 * - Se algum movimento melhora a fitness E a posição é válida → aceita
 * - Senão → reverte
 * - Repete até uma rodada completa sem nenhuma melhoria (convergiu)
 * - Usa yieldToMain() entre iterações para não travar a UI
 * - Respeita signal.aborted para cancelamento
 * 
 * @param {Object} options
 * @param {number} options.stepSize - Tamanho do passo em centímetros
 * @param {function} [options.onProgress] - callback(info) chamado a cada iteração
 * @param {function} [options.onComplete] - callback(result) chamado ao finalizar
 * @param {AbortSignal} [options.signal] - AbortSignal para cancelamento
 * @returns {Promise<Object>} Resultado com fitness inicial/final, iterações, etc.
 */
export async function runHillClimbing(options = {}) {
    const { stepSize = 10, onProgress, onComplete, signal } = options;

    // Validações de entrada
    if (stepSize <= 0) {
        const result = { 
            success: false, 
            reason: 'Step size deve ser maior que 0',
            initialFitness: 0, 
            finalFitness: 0, 
            iterations: 0 
        };
        console.warn('[Optimizer] Step size inválido:', stepSize);
        if (onComplete) onComplete(result);
        return result;
    }

    const stepPx = stepSize * pixelsPerCm;

    // Filtrar recursos movíveis
    const movableResources = resources.filter(r => !isResourceImmovable(r));
    if (movableResources.length === 0) {
        const result = { 
            success: false, 
            reason: 'Nenhum recurso movível encontrado',
            initialFitness: 0, 
            finalFitness: 0, 
            iterations: 0 
        };
        console.warn('[Optimizer] Nenhum recurso movível');
        if (onComplete) onComplete(result);
        return result;
    }

    const connections = getConnections();
    if (!connections || connections.length === 0) {
        const result = { 
            success: false, 
            reason: 'Nenhuma conexão encontrada',
            initialFitness: 0, 
            finalFitness: 0, 
            iterations: 0 
        };
        console.warn('[Optimizer] Nenhuma conexão para otimizar');
        if (onComplete) onComplete(result);
        return result;
    }

    // Salvar estado no histórico para undo
    saveStateToHistory('Antes da otimização');

    let currentFitness = evaluateLayout();
    const initialFitness = currentFitness;
    let iteration = 0;
    let improved = true;
    const MAX_ITERATIONS = 500; // Safety cap

    console.log(`[Optimizer] Iniciando Hill Climbing — fitness inicial: ${currentFitness.toFixed(2)} px, step: ${stepSize} cm (${stepPx.toFixed(2)} px), recursos movíveis: ${movableResources.length}`);

    while (improved && iteration < MAX_ITERATIONS) {
        // Verificar cancelamento
        if (signal && signal.aborted) {
            console.log(`[Optimizer] Cancelado na iteração ${iteration}`);
            break;
        }

        improved = false;
        iteration++;

        for (const resource of movableResources) {
            if (signal && signal.aborted) break;

            let bestDx = 0;
            let bestDy = 0;
            let bestRotationAngle = 0;
            let bestFitness = currentFitness;

            // Salvar estado completo do recurso (posição + rotação + hubs)
            const origX = resource.x;
            const origY = resource.y;
            const origWidth = resource.width;
            const origHeight = resource.height;
            const origRotation = resource.rotation || 0;
            const origVertices = resource.vertices ? resource.vertices.map(v => [...v]) : null;
            const origHubs = (getHubsForResource(resource.id) || []).map(h => ({
                id: h.id,
                localX: h.localX, localY: h.localY,
                normalX: h.normalX, normalY: h.normalY,
                x: h.x, y: h.y,
            }));

            /** Restaura recurso ao estado original completo */
            const restoreOriginal = () => {
                resource.x = origX;
                resource.y = origY;
                resource.width = origWidth;
                resource.height = origHeight;
                resource.rotation = origRotation;
                if (origVertices) {
                    resource.vertices = origVertices.map(v => [...v]);
                }
                const hubList = getHubsForResource(resource.id) || [];
                for (const saved of origHubs) {
                    const hub = hubList.find(h => h.id === saved.id);
                    if (!hub) continue;
                    hub.localX = saved.localX;
                    hub.localY = saved.localY;
                    hub.normalX = saved.normalX;
                    hub.normalY = saved.normalY;
                    hub.x = saved.x;
                    hub.y = saved.y;
                }
            };

            // Posições candidatas: posição original (dx=0,dy=0) + 8 direções
            const candidatePositions = [
                { dx: 0, dy: 0, name: 'O' },  // posição original
                ...DIRECTIONS.map(d => ({ dx: d.dx * stepPx, dy: d.dy * stepPx, name: d.name })),
            ];

            for (const pos of candidatePositions) {
                if (signal && signal.aborted) break;

                const newX = origX + pos.dx;
                const newY = origY + pos.dy;

                // Para posições deslocadas, verificar validade da translação
                if (pos.dx !== 0 || pos.dy !== 0) {
                    if (!isPositionValidForResource(resource, newX, newY)) {
                        continue;
                    }
                }

                // Aplicar translação temporária
                resource.x = newX;
                resource.y = newY;
                if (origVertices) {
                    resource.vertices = origVertices.map(([vx, vy]) => [vx + pos.dx, vy + pos.dy]);
                }

                // --- Testar sem rotação (translação pura) ---
                updateConnectionPathsForResource(resource.id);
                const fitnessPure = evaluateLayout();

                if (fitnessPure < bestFitness) {
                    bestFitness = fitnessPure;
                    bestDx = pos.dx;
                    bestDy = pos.dy;
                    bestRotationAngle = 0;
                }

                // --- Testar 3 rotações NESTA posição deslocada ---
                // Salvar estado pós-translação para reverter rotações
                const postTransX = resource.x;
                const postTransY = resource.y;
                const postTransVertices = resource.vertices ? resource.vertices.map(v => [...v]) : null;

                for (const angle of ROTATION_ANGLES) {
                    // Aplicar rotação temporária a partir da posição deslocada
                    const savedRotState = applyResourceRotation(resource, angle);

                    // Verificar se a posição rotacionada+deslocada é válida
                    if (isCurrentPositionValid(resource)) {
                        updateConnectionPathsForResource(resource.id);
                        const rotFitness = evaluateLayout();

                        if (rotFitness < bestFitness) {
                            bestFitness = rotFitness;
                            bestDx = pos.dx;
                            bestDy = pos.dy;
                            bestRotationAngle = angle;
                        }
                    }

                    // Reverter rotação (volta ao estado pós-translação)
                    revertResourceRotation(resource, savedRotState);
                    // Restaurar posição pós-translação exata
                    resource.x = postTransX;
                    resource.y = postTransY;
                    if (postTransVertices) {
                        resource.vertices = postTransVertices.map(v => [...v]);
                    }
                }

                // Restaurar ao estado original para testar próxima posição
                restoreOriginal();
                updateConnectionPathsForResource(resource.id);
            }

            // === APLICAR MELHOR AÇÃO ENCONTRADA ===
            if (bestFitness < currentFitness) {
                // 1. Aplicar translação (se houver)
                if (bestDx !== 0 || bestDy !== 0) {
                    resource.x = origX + bestDx;
                    resource.y = origY + bestDy;
                    if (origVertices) {
                        resource.vertices = origVertices.map(([vx, vy]) => [vx + bestDx, vy + bestDy]);
                    }
                }

                // 2. Aplicar rotação (se houver)
                if (bestRotationAngle !== 0) {
                    applyResourceRotation(resource, bestRotationAngle);
                }

                // 3. Notificar o sistema
                layoutChangeNotifier.notifyChange('resource', { action: 'move', entity: resource });
                updateConnectionPathsForResource(resource.id);

                const oldFitness = currentFitness;
                currentFitness = bestFitness;
                improved = true;

                // Log descritivo
                const parts = [];
                if (bestDx !== 0 || bestDy !== 0) parts.push('transladou');
                if (bestRotationAngle !== 0) parts.push(`rotacionou ${bestRotationAngle}°`);
                console.log(`[Optimizer] Iteração ${iteration}: ${parts.join(' + ')} ${resource.name || resource.id} → fitness ${oldFitness.toFixed(2)} → ${currentFitness.toFixed(2)} (melhoria: ${(oldFitness - currentFitness).toFixed(2)})`);
            }
        }

        // Reportar progresso
        if (onProgress) {
            onProgress({
                iteration,
                currentFitness,
                initialFitness,
                improvement: initialFitness - currentFitness,
                improvementPercent: initialFitness > 0 
                    ? ((initialFitness - currentFitness) / initialFitness * 100).toFixed(1) 
                    : '0.0',
            });
        }

        // Ceder ao event loop
        await yieldToMain();
    }

    // Resultado final
    const result = {
        success: true,
        reason: signal && signal.aborted ? 'Cancelado pelo usuário' : (iteration >= MAX_ITERATIONS ? 'Limite de iterações atingido' : 'Convergiu'),
        initialFitness,
        finalFitness: currentFitness,
        improvement: initialFitness - currentFitness,
        improvementPercent: initialFitness > 0 
            ? ((initialFitness - currentFitness) / initialFitness * 100).toFixed(1) 
            : '0.0',
        iterations: iteration,
    };

    console.log(`[Optimizer] Concluído — ${result.reason}. Fitness: ${initialFitness.toFixed(2)} → ${currentFitness.toFixed(2)} (${result.improvementPercent}% melhoria) em ${iteration} iterações`);

    // Atualizar canvas e métricas
    drawAll();
    updateConnectionDistancesTable();

    if (onComplete) onComplete(result);
    return result;
}

// ============================================================================
// INTEGRAÇÃO COM A UI
// ============================================================================

/** @type {AbortController|null} */
let activeOptimizationController = null;

/**
 * Inicializa o sistema de otimização: liga event listeners ao DOM.
 * Deve ser chamado após o DOM estar pronto.
 */
export function initializeOptimizer() {
    const btn = document.getElementById('optimizeLayoutBtn');
    const algorithmSelect = document.getElementById('algorithmSelect');
    const passLevelInput = document.getElementById('passLevelInput');

    if (!btn) {
        console.warn('[Optimizer] Botão #optimizeLayoutBtn não encontrado');
        return;
    }

    btn.addEventListener('click', async () => {
        // Se já está otimizando, cancelar
        if (activeOptimizationController) {
            activeOptimizationController.abort();
            activeOptimizationController = null;
            setButtonState(btn, 'idle');
            console.log('[Optimizer] Otimização cancelada pelo usuário');
            return;
        }

        // Ler parâmetros da UI
        const algorithm = algorithmSelect ? algorithmSelect.value : 'hill';
        const stepSizeCm = passLevelInput ? parseMeasurementInput(passLevelInput.value) : 0;

        // Validação: apenas Hill Climbing está implementado por enquanto
        if (algorithm !== 'hill') {
            alert(`Algoritmo "${algorithm}" ainda está em desenvolvimento. Selecione "Hill Climbing".`);
            return;
        }

        // Validação do step size
        if (!stepSizeCm || stepSizeCm <= 0) {
            alert(`Informe um Nível de Passe válido (maior que 0 ${getMeasurementUnit().symbol}).`);
            return;
        }

        // Configurar AbortController
        activeOptimizationController = new AbortController();
        setButtonState(btn, 'running');

        try {
            await runHillClimbing({
                stepSize: stepSizeCm,
                signal: activeOptimizationController.signal,
                onProgress(info) {
                    // Atualizar texto do botão com progresso
                    const span = btn.querySelector('span');
                    if (span) {
                        span.textContent = `Iteração ${info.iteration} | -${info.improvementPercent}%`;
                    }
                },
                onComplete(result) {
                    // Mostrar resumo
                    const pxPerCm = pixelsPerCm;
                    const initialM = (result.initialFitness / pxPerCm / 100).toFixed(2);
                    const finalM = (result.finalFitness / pxPerCm / 100).toFixed(2);
                    console.log(`[Optimizer] Resumo: ${initialM} m → ${finalM} m (${result.improvementPercent}% melhoria, ${result.iterations} iterações, ${result.reason})`);
                },
            });
        } catch (err) {
            console.error('[Optimizer] Erro durante otimização:', err);
        } finally {
            activeOptimizationController = null;
            setButtonState(btn, 'idle');
        }
    });

    console.log('[Optimizer] Sistema de otimização inicializado');
}

/**
 * Alterna o estado visual do botão de otimização.
 * @param {HTMLElement} btn
 * @param {'idle'|'running'} state
 */
function setButtonState(btn, state) {
    const span = btn.querySelector('span');
    const loadingIcon = btn.querySelector('.loading-icon');

    if (state === 'running') {
        btn.classList.add('running');
        if (span) span.textContent = 'Cancelar otimização';
        if (loadingIcon) loadingIcon.style.display = 'inline-block';
    } else {
        btn.classList.remove('running');
        if (span) span.textContent = 'Otimizar Layout';
        if (loadingIcon) loadingIcon.style.display = 'none';
    }
}
