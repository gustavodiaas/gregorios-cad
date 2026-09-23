// Funções para criação e manipulação de recursos
import { 
    resources, 
    getSelectedResourceId, 
    setSelectedResourceId,
    setSelectedResourceIds,
    addSelectedResourceId,
    removeSelectedResourceId,
    isResourceSelected,
    getIsDrawingResource,
    setIsDrawingResource,
    getResourcePreviewPosition,
    setResourcePreviewPosition,
    movementAreas,
    getIsEditingResourcePolygon,
    setIsEditingResourcePolygon,
    getEditingResourceId,
    setEditingResourceId,
    getIsEditingPolygon,
    setIsEditingPolygon,
    setEditingAreaId,
    setMidpointVertices,
    setDraggingMidpointIndex,
    setHoveredMidpointIndex,
    setOriginalVerticesOnDrag,
    getFloorById,
    // PPT handles para recursos
    setActiveResourceResizeHandle,
    setIsRotatingResource,
    setResourceRotationStartAngle,
    setResourceRotationCenter,
    setResourceVerticesBeforeRotation,
    setCurrentResourceRotationAngle,
    setHoveredResourceResizeHandle,
    setOriginalResourceVerticesOnDrag
} from './state.js';
import { isPointInArea, pointInPolygon, rectangleToVertices } from './areas.js';
import { drawAll } from './drawing.js';
import { getCurrentResourceColor } from './color-palette.js';
import { pixelsPerCm, floatTolerance } from './config.js';
import { saveStateToHistory } from './history.js';
import { generateId, ID_PREFIXES } from './utils/idGenerator.js';
import { getHubsForResource, removeAllHubsFromResource, updateHubNamesForResource } from './hubs.js';
import { findClosestEdgePoint, getPolygonCentroid as getHPCentroid } from './hub-placement-helper.js';

/**
 * Calcula o centroide de um polígono
 * @param {Array} vertices - Array de vértices [[x, y], ...]
 * @returns {Array} - Coordenadas [x, y] do centroide
 */
function getPolygonCentroid(vertices) {
    if (!vertices || vertices.length === 0) {
        return [0, 0];
    }
    
    // Calcular o centroide de um polígono usando a fórmula correta
    // para polígonos irregulares (weighted centroid)
    let area = 0;
    let cx = 0;
    let cy = 0;
    
    // Última fórmula para polígonos irregulares:
    // https://en.wikipedia.org/wiki/Centroid#Of_a_polygon
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        const cross = vertices[i][0] * vertices[j][1] - vertices[j][0] * vertices[i][1];
        area += cross;
        cx += (vertices[i][0] + vertices[j][0]) * cross;
        cy += (vertices[i][1] + vertices[j][1]) * cross;
    }
    
    // Finalizar cálculo
    area = area / 2;
    
    // Verificar se a área é zero ou muito pequena
    if (Math.abs(area) < 0.0001) {
        // Fallback para média aritmética simples se área for zero
        let centroidX = 0, centroidY = 0;
        for (const vertex of vertices) {
            centroidX += vertex[0];
            centroidY += vertex[1];
        }
        centroidX /= vertices.length;
        centroidY /= vertices.length;
        
        return [centroidX, centroidY];
    }
    
    cx = cx / (6 * area);
    cy = cy / (6 * area);
    
    // Garantir que o centroide não seja NaN
    if (isNaN(cx) || isNaN(cy)) {
        console.warn("⚠️ Erro no cálculo do centroide! Usando método alternativo.");
        let sumX = 0, sumY = 0;
        for (const vertex of vertices) {
            sumX += vertex[0];
            sumY += vertex[1];
        }
        return [sumX / vertices.length, sumY / vertices.length];
    }
    
    return [cx, cy];
}

/**
 * Calcula os limites de um polígono (substituindo bounding box)
 * @param {Array} vertices - Array de vértices [[x, y], ...]
 * @returns {object} - {x, y, width, height, minX, minY, maxX, maxY}
 */
function calculatePolygonBounds(vertices) {
    if (!vertices || vertices.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    
    let minX = vertices[0][0];
    let maxX = vertices[0][0];
    let minY = vertices[0][1];
    let maxY = vertices[0][1];
    
    for (let i = 1; i < vertices.length; i++) {
        const [x, y] = vertices[i];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        minX,
        minY,
        maxX,
        maxY
    };
}

function normalizeLabelAnchor(anchor) {
    if (!anchor) return null;
    if (Array.isArray(anchor) && anchor.length >= 2) {
        const [x, y] = anchor;
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
        }
        return null;
    }
    if (typeof anchor === 'object' && anchor !== null) {
        const { x, y } = anchor;
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
        }
    }
    return null;
}

function setLabelAnchor(resource, anchor) {
    if (!resource) return;
    if (!anchor) {
        delete resource.labelAnchor;
        return;
    }
    resource.labelAnchor = { x: anchor.x, y: anchor.y };
}

function translateLabelAnchor(resource, deltaX, deltaY) {
    if (!resource) return;
    const anchor = normalizeLabelAnchor(resource.labelAnchor);
    if (!anchor) return;
    setLabelAnchor(resource, { x: anchor.x + deltaX, y: anchor.y + deltaY });
}

function scaleLabelAnchor(resource, centroid, scaleX, scaleY) {
    if (!resource) return;
    const anchor = normalizeLabelAnchor(resource.labelAnchor);
    if (!anchor) return;
    const [cx, cy] = Array.isArray(centroid) ? centroid : [centroid?.x ?? 0, centroid?.y ?? 0];
    const newAnchor = {
        x: cx + (anchor.x - cx) * scaleX,
        y: cy + (anchor.y - cy) * scaleY
    };
    setLabelAnchor(resource, newAnchor);
}

function normalizeAngleValue(angle) {
    if (!Number.isFinite(angle)) return 0;
    while (angle <= -Math.PI) {
        angle += Math.PI * 2;
    }
    while (angle > Math.PI) {
        angle -= Math.PI * 2;
    }
    return angle;
}

function updateLabelAngle(resource, deltaAngleRad) {
    if (!resource || !Number.isFinite(deltaAngleRad) || deltaAngleRad === 0) return;
    const currentAngle = Number.isFinite(resource.labelAngle) ? resource.labelAngle : 0;
    resource.labelAngle = normalizeAngleValue(currentAngle + deltaAngleRad);
}

function rotateLabelAnchor(resource, centerX, centerY, cosVal, sinVal, translationDelta = { x: 0, y: 0 }) {
    if (!resource) return;
    const anchor = normalizeLabelAnchor(resource.labelAnchor);
    if (!anchor) return;

    const translatedX = anchor.x - centerX;
    const translatedY = anchor.y - centerY;

    const rotatedX = translatedX * cosVal - translatedY * sinVal;
    const rotatedY = translatedX * sinVal + translatedY * cosVal;

    setLabelAnchor(resource, {
        x: rotatedX + centerX + (translationDelta.x || 0),
        y: rotatedY + centerY + (translationDelta.y || 0)
    });
}

function applyLabelTransformAfterRotation(resource, centerX, centerY, originalVertices, finalVertices, angleRad) {
    if (!resource || !Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        return;
    }

    const cos = Math.cos(angleRad || 0);
    const sin = Math.sin(angleRad || 0);

    const rotatedCentroid = Array.isArray(originalVertices) && originalVertices.length >= 3
        ? getPolygonCentroid(originalVertices)
        : [centerX, centerY];
    const finalCentroid = Array.isArray(finalVertices) && finalVertices.length >= 3
        ? getPolygonCentroid(finalVertices)
        : [centerX, centerY];

    const translationDelta = {
        x: (finalCentroid?.[0] ?? centerX) - (rotatedCentroid?.[0] ?? centerX),
        y: (finalCentroid?.[1] ?? centerY) - (rotatedCentroid?.[1] ?? centerY)
    };

    rotateLabelAnchor(resource, centerX, centerY, cos, sin, translationDelta);

    if (Number.isFinite(angleRad) && angleRad !== 0) {
        updateLabelAngle(resource, angleRad);
    }
}

/**
 * Atualiza as propriedades de compatibilidade de um recurso baseado nos vértices
 * @param {object} resource - O recurso a ser atualizado
 */
function updateResourceCompatibilityProperties(resource) {
    if (!resource.vertices) return;
    
    const bounds = calculatePolygonBounds(resource.vertices);
    resource.x = bounds.x;
    resource.y = bounds.y;
    resource.width = bounds.width;
    resource.height = bounds.height;
}

function generateResourceId() {
    return generateId(ID_PREFIXES.RESOURCE);
}

function cloneVertices(vertices) {
    if (!Array.isArray(vertices)) {
        return [];
    }
    return vertices.map(vertex => Array.isArray(vertex) ? [vertex[0], vertex[1]] : [0, 0]);
}

function buildPolygonalResource(vertices, color, parentAreaId, isRectangular, options = {}, targetCollection = resources) {
    const {
        id: customId,
        name: customName,
        type: customType,
        stairConfig,
        allowConnectionsThrough,
        isConnectionPassThrough,
        vertices: _ignoredVertices,
        color: _ignoredColor,
        parentAreaId: _ignoredParent,
        ...restOptions
    } = options || {};

    const collection = Array.isArray(targetCollection) ? targetCollection : resources;
    const resolvedType = customType || 'resource';
    const defaultBaseName = resolvedType === 'stair' ? 'Escada' : 'Recurso';
    const resolvedName = customName || `${defaultBaseName} ${collection.length + 1}`;

    const resource = {
        id: customId || generateResourceId(),
        vertices: cloneVertices(vertices),
        color,
        parentAreaId,
        name: resolvedName,
        locked: false,
        visible: true,
        isRectangular: Boolean(isRectangular),
        type: resolvedType
    };

    if (restOptions && Object.keys(restOptions).length > 0) {
        Object.assign(resource, restOptions);
    }

    if (typeof allowConnectionsThrough === 'boolean') {
        resource.allowConnectionsThrough = allowConnectionsThrough;
    }

    if (typeof isConnectionPassThrough === 'boolean') {
        resource.isConnectionPassThrough = isConnectionPassThrough;
    } else if (resource.allowConnectionsThrough && resource.isConnectionPassThrough === undefined) {
        resource.isConnectionPassThrough = true;
    }

    if (stairConfig) {
        resource.stairConfig = JSON.parse(JSON.stringify(stairConfig));
    }

    return resource;
}

export function isStairResource(resource) {
    return Boolean(resource && (resource.type === 'stair' || resource.stairConfig));
}

/**
 * Cria um novo recurso em uma posição específica (retangular - para compatibilidade)
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @param {string} color - Cor do recurso (opcional)
 * @param {number} width - Largura do recurso (padrão: 40)
 * @param {number} height - Altura do recurso (padrão: 40)
 * @returns {object|null} - O recurso criado ou null se não puder ser criado
 */
export function createResource(x, y, color = null, width = 40, height = 40) {
    // Verificar se a posição está dentro de uma área de movimentação
    const parentArea = findAreaContainingPoint(x, y);
    if (!parentArea) {
        return null;
    }
    
    // Usar cor da paleta se não especificada
    const resourceColor = color || getCurrentResourceColor();
    
    // Criar vértices para o retângulo
    const vertices = [
        [x, y], // Superior esquerdo
        [x + width, y], // Superior direito
        [x + width, y + height], // Inferior direito
        [x, y + height] // Inferior esquerdo
    ];
    
    // Usar a nova função de criação poligonal
    return createPolygonalResource(vertices, resourceColor, parentArea.id, true);
}
/**
 * Encontra a área de movimentação que contém um ponto específico
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {object|null} - A área encontrada ou null
 */
function findAreaContainingPoint(x, y) {
    for (const area of movementAreas) {
        if (isPointInArea([x, y], area)) {
            return area;
        }
    }
    return null;
}
/**
 * Verifica se um ponto está sobre um recurso
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {object|null} - O recurso encontrado ou null
 */
/**
 * Encontra um recurso na posição especificada
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {object|null} - O recurso encontrado ou null
 */
export function findResourceAtPosition(x, y) {
    for (let i = resources.length - 1; i >= 0; i--) {
        const resource = resources[i];
        if (resource._plannerHidden) continue;
        if (resource.visible === false) continue;
        
        // Migrar recurso se necessário
        const migratedResource = migrateResourceToPolygonal(resource);
        
        // Verificar se o ponto está dentro do polígono
        if (migratedResource.vertices && migratedResource.vertices.length > 0) {
            if (pointInPolygon([x, y], migratedResource.vertices)) {
                return resource;
            }
        } else {
            // Tratamento para recursos retangulares antigos
            const inside = x >= resource.x && x <= resource.x + resource.width &&
                          y >= resource.y && y <= resource.y + resource.height;
            if (inside) {
                return resource;
            }
        }
    }
    return null;
}
/**
 * Remove um recurso pelo ID
 * @param {string} resourceId - ID do recurso
 * @returns {boolean} - True se removido com sucesso
 */
export function removeResource(resourceId) {
    const index = resources.findIndex(r => r.id === resourceId);
    if (index !== -1) {
        // 1. Obter todos os hubs fixados neste recurso
        const { removeConnection, getConnections } = window.ConnectionsModule || {};
        
        if (removeConnection && getConnections) {
            const resourceHubs = getHubsForResource(resourceId);
            
            // 2. Coletar todas as conexões que precisam ser removidas
            const connectionIdsToRemove = new Set();
            resourceHubs.forEach(hub => {
                if (hub.connectionIds && hub.connectionIds.length > 0) {
                    hub.connectionIds.forEach(connId => connectionIdsToRemove.add(connId));
                }
            });
            
            // 3. Remover todas as conexões fixadas nos hubs do recurso
            connectionIdsToRemove.forEach(connId => {
                removeConnection(connId);
            });
            
            // 4. Remover todos os hubs do recurso
            if (removeAllHubsFromResource) {
                removeAllHubsFromResource(resourceId, { skipRedraw: true });
            }
        }
        
        // 5. Remover o recurso em si
        resources.splice(index, 1);        
        removeSelectedResourceId(resourceId);
        
        // OTIMIZAÇÃO: Não invalidar mais o grafo aqui - updateNavMeshWithObstacles será chamado
        // automaticamente na próxima busca de pathfinding, atualizando apenas os nós afetados
        
        return true;
    }
    return false;
}
/**
 * Move um recurso para uma nova posição
 * @param {string} resourceId - ID do recurso
 * @param {number} newX - Nova coordenada X
 * @param {number} newY - Nova coordenada Y
 * @returns {boolean} - True se movido com sucesso
 */
// Função utilitária debounce
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Função para atualizar apenas conexões ligadas a um recurso
function updateConnectionsForResource(resourceId) {
    if (typeof window.getConnections === 'function') {
        const connections = window.getConnections();
        if (Array.isArray(connections)) {
            connections.forEach(connection => {
                if (
                    (connection.start && connection.start.resourceId === resourceId) ||
                    (connection.end && connection.end.resourceId === resourceId)
                ) {
                    if (typeof window.updateConnectionPath === 'function') {
                        window.updateConnectionPath(connection);
                    }
                }
            });
        }
    }
}

// Debounced version para evitar múltiplos recálculos por movimento
const debouncedUpdateConnectionsForResource = debounce(updateConnectionsForResource, 60);

export async function moveResource(resourceId, newX, newY) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return false;

    // Migrar recurso para formato poligonal se necessário
    const migratedResource = migrateResourceToPolygonal(resource);

    // Calcular deslocamento baseado no centroide atual
    let deltaX, deltaY;

    if (resource.vertices) {
        // Para recursos já poligonais, usar centroide
        const centroid = getPolygonCentroid(resource.vertices);
        deltaX = newX - centroid[0];
        deltaY = newY - centroid[1];
    } else {
        // Para recursos retangulares, usar posição direta (centro)
        deltaX = newX - (resource.x + resource.width / 2);
        deltaY = newY - (resource.y + resource.height / 2);
    }

    // Calcular novos vértices baseados no deslocamento
    const newVertices = migratedResource.vertices.map(([x, y]) => [x + deltaX, y + deltaY]);

    // Verificar se a nova posição está dentro de uma área de movimentação
    const newParentArea = findAreaContainingPoint(newX, newY);
    if (!newParentArea) {
        return false;
    }

    // Verificar se todos os vértices estão dentro da área
    const areaVertices = newParentArea.vertices || rectangleToVertices(newParentArea.x, newParentArea.y, newParentArea.width, newParentArea.height);
    const allPointsInside = newVertices.every(vertex => pointInPolygon(vertex, areaVertices));

    if (!allPointsInside) {
        return false;
    }

    // Verificar colisão com zonas de exclusão de hubs (import dinâmico para evitar dependência circular)
    try {
        const mod = await import('./hub-exclusion-zones.js');
        if (mod.collidesWithExclusionZones(newVertices, resource.id)) {
            return false;
        }
    } catch (_) { /* módulo ainda não carregado */ }

    // Verificar colisão com zonas de exclusão standalone
    try {
        const mod = await import('./exclusion-zones.js');
        if (mod.collidesWithStandaloneExclusionZones(newVertices, newParentArea.id)) {
            return false;
        }
    } catch (_) { /* módulo ainda não carregado */ }

    // Atualizar o recurso
    resource.vertices = newVertices;

    // Atualizar propriedades de compatibilidade
    updateResourceCompatibilityProperties(resource);

    translateLabelAnchor(resource, deltaX, deltaY);

    resource.parentAreaId = newParentArea.id;

    // OTIMIZAÇÃO: Não invalidar mais o grafo aqui - updateNavMeshWithObstacles será chamado
    // automaticamente na próxima busca de pathfinding, atualizando apenas os nós afetados

    // Atualizar apenas conexões ligadas a este recurso, com debounce
    debouncedUpdateConnectionsForResource(resourceId);

    return true;
}
/**
 * Redimensiona um recurso
 * @param {string} resourceId - ID do recurso
 * @param {number} newWidth - Nova largura
 * @param {number} newHeight - Nova altura
 * @returns {boolean} - True se redimensionado com sucesso
 */
export function resizeResource(resourceId, newWidth, newHeight) {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return false;
    
    // Verificar se o recurso tem vértices
    if (!resource.vertices) {
        // Para recursos sem vértices (legados), criar vértices primeiro
        resource.vertices = [
            [resource.x, resource.y],
            [resource.x + resource.width, resource.y],
            [resource.x + resource.width, resource.y + resource.height],
            [resource.x, resource.y + resource.height]
        ];
    }
    
    // Calcular fator de escala
    const currentBounds = calculatePolygonBounds(resource.vertices);
    const scaleX = newWidth / currentBounds.width;
    const scaleY = newHeight / currentBounds.height;
    
    // Calcular centroide para manter posição
    const centroid = getPolygonCentroid(resource.vertices);
    
    // Escalar vértices em relação ao centroide
    resource.vertices = resource.vertices.map(([x, y]) => [
        centroid[0] + (x - centroid[0]) * scaleX,
        centroid[1] + (y - centroid[1]) * scaleY
    ]);
    
    // Verificar se o novo tamanho ainda está dentro da área
    const parentArea = movementAreas.find(a => a.id === resource.parentAreaId);
    if (!parentArea) return false;
    
    // Verificar se todos os vértices estão dentro da área
    const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
    const allPointsInside = resource.vertices.every(vertex => pointInPolygon(vertex, areaVertices));
    
    if (!allPointsInside) {
        return false;
    }
    
    // Atualizar propriedades de compatibilidade
    updateResourceCompatibilityProperties(resource);

    scaleLabelAnchor(resource, centroid, scaleX, scaleY);
    
    // Atualizar posições dos hubs ancorados ao recurso — reprojetar nas bordas do novo polígono
    const resourceHubs = getHubsForResource(resourceId);
    if (resourceHubs && resourceHubs.length > 0) {
        // centroid antigo (antes do resize) já foi calculado acima
        const oldCentroidObj = { x: centroid[0], y: centroid[1] };
        const newVertices = resource.vertices;
        const newCentroid = getHPCentroid(newVertices);
        // vertices originais antes de escalar (reconstruir a partir do centroid e scale inverso)
        const oldVertices = newVertices.map(([x, y]) => [
            centroid[0] + (x - centroid[0]) / scaleX,
            centroid[1] + (y - centroid[1]) / scaleY
        ]);
        
        resourceHubs.forEach(hub => {
            if (hub.isAnchored && typeof hub.localX === 'number' && typeof hub.localY === 'number') {
                // 1. Posição mundo original do hub
                const hubWorldX = oldCentroidObj.x + hub.localX;
                const hubWorldY = oldCentroidObj.y + hub.localY;
                
                // 2. Encontrar aresta mais próxima no polígono original
                const oldEdgeResult = findClosestEdgePoint(hubWorldX, hubWorldY, oldVertices);
                if (!oldEdgeResult) return;
                
                // 3. Calcular t paramétrico ao longo da aresta original
                const oldEdgeStart = oldEdgeResult.edgeStart;
                const oldEdgeEnd = oldEdgeResult.edgeEnd;
                const oldEdgeDx = oldEdgeEnd.x - oldEdgeStart.x;
                const oldEdgeDy = oldEdgeEnd.y - oldEdgeStart.y;
                const oldEdgeLen = Math.sqrt(oldEdgeDx * oldEdgeDx + oldEdgeDy * oldEdgeDy);
                let t = 0;
                if (oldEdgeLen > 0.001) {
                    t = ((oldEdgeResult.point.x - oldEdgeStart.x) * oldEdgeDx + 
                         (oldEdgeResult.point.y - oldEdgeStart.y) * oldEdgeDy) / (oldEdgeLen * oldEdgeLen);
                    t = Math.max(0, Math.min(1, t));
                }
                
                // 4. Aplicar t na mesma aresta do polígono NOVO
                const edgeIdx = oldEdgeResult.edgeIndex;
                const newEdgeStart = newVertices[edgeIdx];
                const newEdgeEnd = newVertices[(edgeIdx + 1) % newVertices.length];
                const newPointX = newEdgeStart[0] + t * (newEdgeEnd[0] - newEdgeStart[0]);
                const newPointY = newEdgeStart[1] + t * (newEdgeEnd[1] - newEdgeStart[1]);
                
                // 5. Atualizar coordenadas locais e mundiais
                hub.localX = newPointX - newCentroid.x;
                hub.localY = newPointY - newCentroid.y;
                hub.x = newPointX;
                hub.y = newPointY;
                
                // 6. Calcular nova normal a partir da aresta do novo polígono
                const newEdgeDx = newEdgeEnd[0] - newEdgeStart[0];
                const newEdgeDy = newEdgeEnd[1] - newEdgeStart[1];
                const newEdgeLen = Math.sqrt(newEdgeDx * newEdgeDx + newEdgeDy * newEdgeDy);
                if (newEdgeLen > 0) {
                    let normalX = -newEdgeDy / newEdgeLen;
                    let normalY = newEdgeDx / newEdgeLen;
                    const midX = (newEdgeStart[0] + newEdgeEnd[0]) / 2;
                    const midY = (newEdgeStart[1] + newEdgeEnd[1]) / 2;
                    const toCenterX = newCentroid.x - midX;
                    const toCenterY = newCentroid.y - midY;
                    if (normalX * toCenterX + normalY * toCenterY > 0) {
                        normalX = -normalX;
                        normalY = -normalY;
                    }
                    hub.normalX = normalX;
                    hub.normalY = normalY;
                }
            }
        });
    }
    
    return true;
}

function ensureResourceVertices(resource) {
    if (!resource) return null;
    return migrateResourceToPolygonal(resource);
}

function isAxisAlignedRectangle(vertices) {
    if (!Array.isArray(vertices) || vertices.length !== 4) {
        return false;
    }
    const bounds = calculatePolygonBounds(vertices);
    const expectedCorners = [
        [bounds.minX, bounds.minY],
        [bounds.maxX, bounds.minY],
        [bounds.maxX, bounds.maxY],
        [bounds.minX, bounds.maxY]
    ];
    const remaining = [...expectedCorners];
    const tolerance = floatTolerance || 0.1;
    for (const vertex of vertices) {
        const matchIndex = remaining.findIndex(([x, y]) =>
            Math.abs(vertex[0] - x) <= tolerance && Math.abs(vertex[1] - y) <= tolerance
        );
        if (matchIndex === -1) {
            return false;
        }
        remaining.splice(matchIndex, 1);
    }
    return remaining.length === 0;
}

function isComplexResource(resource) {
    if (!resource) return false;

    const migrated = ensureResourceVertices(resource);
    if (!migrated || !migrated.vertices) {
        return false;
    }

    const axisAlignedRectangle = isAxisAlignedRectangle(migrated.vertices);

    if (axisAlignedRectangle) {
        migrated.isRectangular = true;
        resource.isRectangular = true;
        return false;
    }

    migrated.isRectangular = false;
    resource.isRectangular = false;
    return true;
}

function formatDimensionValue(value) {
    if (!Number.isFinite(value)) return '';
    const hasFraction = Math.abs(value - Math.round(value)) > 1e-4;
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: hasFraction ? 2 : 0,
        maximumFractionDigits: 2
    });
}

function parseDimensionValue(value) {
    if (typeof value !== 'string') return NaN;
    const sanitized = value.trim().replace(/\s+/g, '').replace(',', '.');
    if (sanitized === '') return NaN;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : NaN;
}

export function promptResourceDimensions(resource) {
    if (!resource) return;

    if (resource.locked) {
        alert('Não é possível editar as dimensões de um recurso bloqueado.');
        return;
    }

    if (isComplexResource(resource)) {
        alert('Recursos poligonais devem ser editados pelo modo Polígono.');
        return;
    }

    const migrated = ensureResourceVertices(resource);
    if (!migrated || !migrated.vertices || migrated.vertices.length < 3) {
        alert('Não foi possível determinar as dimensões atuais do recurso.');
        return;
    }

    const bounds = calculatePolygonBounds(migrated.vertices);
    const currentWidthCm = (bounds.width || resource.width || 0) / pixelsPerCm;
    const currentHeightCm = (bounds.height || resource.height || 0) / pixelsPerCm;

    const widthInput = prompt('Digite a largura em cm:', formatDimensionValue(currentWidthCm));
    if (widthInput === null) return;

    const heightInput = prompt('Digite a altura em cm:', formatDimensionValue(currentHeightCm));
    if (heightInput === null) return;

    const widthCm = parseDimensionValue(widthInput);
    const heightCm = parseDimensionValue(heightInput);

    if (!Number.isFinite(widthCm) || widthCm <= 0) {
        alert('Valor de largura inválido. Informe um número maior que zero.');
        return;
    }

    if (!Number.isFinite(heightCm) || heightCm <= 0) {
        alert('Valor de altura inválido. Informe um número maior que zero.');
        return;
    }

    const newWidthPx = Math.round(widthCm * pixelsPerCm * 100) / 100;
    const newHeightPx = Math.round(heightCm * pixelsPerCm * 100) / 100;

    saveStateToHistory('Atualizar dimensões do recurso');

    const resized = resizeResource(resource.id, newWidthPx, newHeightPx);
    if (!resized) {
        alert('Não foi possível aplicar as novas dimensões. Verifique se o recurso cabe dentro da área.');
        return;
    }

    setSelectedResourceId(resource.id);
    drawAll();
}

/**
 * Solicita ao usuário a quantidade de estoque inicial para um recurso.
 * O estoque inicial é exibido visualmente no recurso e é consumido no início da
 * execução do roteiro do planner.
 * @param {Resource} resource - O recurso alvo
 */
export function promptInitialStock(resource) {
    if (!resource) return;

    const currentStock = resource.initialStock || 0;
    const input = prompt('Definir estoque inicial para "' + (resource.name || 'Recurso') + '":', String(currentStock));
    if (input === null) return;

    const value = parseInt(input, 10);
    if (isNaN(value) || value < 0) {
        alert('Valor inválido. Informe um número inteiro maior ou igual a zero.');
        return;
    }

    saveStateToHistory('Definir estoque inicial do recurso');

    if (value === 0) {
        delete resource.initialStock;
    } else {
        resource.initialStock = value;
    }

    drawAll();
}

export function toggleEditResourcePolygonMode(resource) {
    if (!resource) {
        return;
    }

    if (resource.locked) {
        alert('Não é possível editar o polígono de um recurso bloqueado.');
        return;
    }

    const isCurrentlyEditing = getIsEditingResourcePolygon() && getEditingResourceId() === resource.id;

    if (isCurrentlyEditing) {
        setIsEditingResourcePolygon(false);
        setEditingResourceId(null);
        setMidpointVertices([]);
        setDraggingMidpointIndex(-1);
        setHoveredMidpointIndex(null);
        setOriginalVerticesOnDrag([]);
        drawAll();
        return;
    }

    const migrated = ensureResourceVertices(resource);
    if (!migrated || !migrated.vertices || migrated.vertices.length < 3) {
        alert('Não foi possível ativar a edição poligonal para este recurso.');
        return;
    }

    if (getIsEditingPolygon()) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }

    setIsEditingResourcePolygon(true);
    setEditingResourceId(resource.id);
    setSelectedResourceId(resource.id);
    setMidpointVertices([]);
    setDraggingMidpointIndex(-1);
    setHoveredMidpointIndex(null);
    setOriginalVerticesOnDrag([]);
    drawAll();
}
/**
 * Seleciona um recurso
 * @param {string} resourceId - ID do recurso
 */
export function selectResource(resourceId) {
    if (resourceId === null || resourceId === undefined) {
        setSelectedResourceIds([]);
    } else {
        setSelectedResourceIds([resourceId]);
    }
    // Forçar redraw para mostrar as cotas
    drawAll();
}
/**
 * Deseleciona todos os recursos
 */
export function deselectAllResources() {
    setSelectedResourceIds([]);
    // Forçar redraw para esconder as cotas
    drawAll();
}

export function toggleResourceSelection(resourceId, { makePrimary = false } = {}) {
    if (resourceId === null || resourceId === undefined) {
        return;
    }

    if (isResourceSelected(resourceId)) {
        removeSelectedResourceId(resourceId);
    } else {
        addSelectedResourceId(resourceId, makePrimary);
    }
    drawAll();
}

export function addResourceToSelection(resourceId, { makePrimary = false } = {}) {
    if (resourceId === null || resourceId === undefined) {
        return;
    }
    addSelectedResourceId(resourceId, makePrimary);
    drawAll();
}

export function setResourceSelection(resourceIds, { primaryId = null } = {}) {
    setSelectedResourceIds(resourceIds, primaryId || undefined);
    drawAll();
}
/**
 * Move recursos junto com uma área quando ela é movida
 * @param {string} areaId - ID da área que está sendo movida
 * @param {number} deltaX - Deslocamento em X
 * @param {number} deltaY - Deslocamento em Y
 */
/**
 * Move recursos junto com uma área quando ela é movida
 * @param {string} areaId - ID da área que está sendo movida
 * @param {number} deltaX - Deslocamento em X
 * @param {number} deltaY - Deslocamento em Y
 */
export function moveResourcesWithArea(areaId, deltaX, deltaY) {
    // Filtrar recursos que pertencem à área específica usando comparação flexível
    const areaResources = resources.filter(r => {
        // Comparação estrita
        if (r.parentAreaId === areaId) return true;
        
        // Comparação flexível (== para diferentes tipos)
        if (r.parentAreaId == areaId) return true;
        
        // Comparação como string
        if (r.parentAreaId?.toString() === areaId?.toString()) return true;
        
        return false;
    });
    
    // Mover cada recurso encontrado
    areaResources.forEach((resource, index) => {
        // Atualizar vertices se existirem (para recursos poligonais)
        if (resource.vertices && resource.vertices.length > 0) {
            resource.vertices = resource.vertices.map(([x, y]) => [x + deltaX, y + deltaY]);
        }
        
        translateLabelAnchor(resource, deltaX, deltaY);

        if (isStairResource(resource) && typeof window !== 'undefined' && window.applyStairTranslation) {
            window.applyStairTranslation(resource, deltaX, deltaY, { skipGeometry: true });
        }

        // Atualizar propriedades de compatibilidade
        updateResourceCompatibilityProperties(resource);
    });
    
    return areaResources.length;
}
/**
 * Remove todos os recursos de uma área quando ela é removida
 * @param {string} areaId - ID da área removida
 */
export function removeResourcesFromArea(areaId) {
    const initialCount = resources.length;
    // Remover recursos da área
    for (let i = resources.length - 1; i >= 0; i--) {
        if (resources[i].parentAreaId === areaId) {
            const removedResource = resources.splice(i, 1)[0];
            // Limpar seleção se necessário
            if (getSelectedResourceId() === removedResource.id) {
                setSelectedResourceId(null);
            }
        }
    }
    const removedCount = initialCount - resources.length;
    
    // OTIMIZAÇÃO: Não invalidar mais o grafo aqui - updateNavMeshWithObstacles será chamado
    // automaticamente na próxima busca de pathfinding, atualizando apenas os nós afetados
}
/**
 * Inicia o preview de criação de recurso
 * @param {number} x - Coordenada X do mouse
 * @param {number} y - Coordenada Y do mouse
 */
export function startResourcePreview(x, y) {
    const parentArea = findAreaContainingPoint(x, y);
    if (parentArea) {
        setResourcePreviewPosition({
            x: x,
            y: y,
            parentAreaId: parentArea.id
        });
        setIsDrawingResource(true);
    } else {
        setResourcePreviewPosition(null);
        setIsDrawingResource(false);
    }
}
/**
 * Atualiza a posição do preview de recurso
 * @param {number} x - Coordenada X do mouse
 * @param {number} y - Coordenada Y do mouse
 */
export function updateResourcePreview(x, y) {
    const parentArea = findAreaContainingPoint(x, y);
    if (parentArea && getIsDrawingResource()) {
        setResourcePreviewPosition({
            x: x,
            y: y,
            parentAreaId: parentArea.id
        });
    } else {
        setResourcePreviewPosition(null);
    }
}
/**
 * Para o preview de criação de recurso
 */
export function stopResourcePreview() {
    setIsDrawingResource(false);
    setResourcePreviewPosition(null);
}
/**
 * Finaliza a criação de um recurso
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {object|null} - O recurso criado ou null
 */
export function finishResourceCreation(x, y) {
    const preview = getResourcePreviewPosition();
    if (preview && preview.parentAreaId) {
        stopResourcePreview();
        return createResource(x, y);
    }
    return null;
}
// Rotation and duplication helpers live in `src/merge_resources/`.

/**
 * Tenta rotacionar um recurso com sistema de ajuste automático (pull system)
 * @param {object} resource - O recurso sendo rotacionado
 * @param {Array} rotatedVertices - Vértices após rotação
 * @returns {Array|null} - Vértices ajustados ou null se não conseguiu ajustar
 */
async function tryRotateWithPullSystem(resource, rotatedVertices) {
    const { canMoveResourceTo } = await import('./merge_resources/resource_operations.js');
    
    // Primeiro, verificar se a rotação é válida sem ajuste
    if (canMoveResourceTo(resource, rotatedVertices)) {
        return rotatedVertices; // Rotação OK, sem necessidade de ajuste
    }
    
    // Se não passou na verificação, tentar ajustar com o sistema de "pull"
    const parentArea = movementAreas.find(area => area.id === resource.parentAreaId);
    if (!parentArea) {
        return null; // Sem área pai, não pode ajustar
    }
    
    const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
    
    // Calcular limites da área pai
    const areaBounds = calculateResourceBounds(areaVertices);
    
    // Calcular limites do recurso rotacionado
    const resourceBounds = calculateResourceBounds(rotatedVertices);
    
    // Calcular deslocamentos necessários para manter dentro da área
    let adjustX = 0;
    let adjustY = 0;
    
    // Ajustar X se necessário
    if (resourceBounds.minX < areaBounds.minX) {
        adjustX = areaBounds.minX - resourceBounds.minX + 5; // margem de 5px
    } else if (resourceBounds.maxX > areaBounds.maxX) {
        adjustX = areaBounds.maxX - resourceBounds.maxX - 5; // margem de 5px
    }
    
    // Ajustar Y se necessário
    if (resourceBounds.minY < areaBounds.minY) {
        adjustY = areaBounds.minY - resourceBounds.minY + 5; // margem de 5px
    } else if (resourceBounds.maxY > areaBounds.maxY) {
        adjustY = areaBounds.maxY - resourceBounds.maxY - 5; // margem de 5px
    }
    
    // Aplicar ajuste se necessário
    let adjustedVertices = rotatedVertices;
    if (adjustX !== 0 || adjustY !== 0) {
        adjustedVertices = rotatedVertices.map(vertex => [
            vertex[0] + adjustX,
            vertex[1] + adjustY
        ]);
        
        // Verificar se o ajuste funcionou
        if (!canMoveResourceTo(resource, adjustedVertices)) {
            // Tentar ajustes mais refinados
            const result = await tryAdvancedPullAdjustment(resource, rotatedVertices, areaVertices);
            if (result) {
                return result;
            }
            return null; // Não conseguiu ajustar
        }
    }
    
    return adjustedVertices;
}

/**
 * Tenta ajustes mais refinados usando múltiplas tentativas
 * @param {object} resource - O recurso sendo ajustado
 * @param {Array} rotatedVertices - Vértices rotacionados originais
 * @param {Array} areaVertices - Vértices da área pai
 * @returns {Array|null} - Vértices ajustados ou null
 */
async function tryAdvancedPullAdjustment(resource, rotatedVertices, areaVertices) {
    const { canMoveResourceTo } = await import('./merge_resources/resource_operations.js');
    
    // Definir diferentes estratégias de ajuste
    const adjustmentStrategies = [
        // Ajustes pequenos em todas as direções
        { x: 5, y: 0 },
        { x: -5, y: 0 },
        { x: 0, y: 5 },
        { x: 0, y: -5 },
        { x: 5, y: 5 },
        { x: -5, y: 5 },
        { x: 5, y: -5 },
        { x: -5, y: -5 },
        // Ajustes médios
        { x: 10, y: 0 },
        { x: -10, y: 0 },
        { x: 0, y: 10 },
        { x: 0, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
        { x: 10, y: -10 },
        { x: -10, y: -10 },
        // Ajustes maiores
        { x: 20, y: 0 },
        { x: -20, y: 0 },
        { x: 0, y: 20 },
        { x: 0, y: -20 }
    ];
    
    // Testar cada estratégia
    for (const strategy of adjustmentStrategies) {
        const candidateVertices = rotatedVertices.map(vertex => [
            vertex[0] + strategy.x,
            vertex[1] + strategy.y
        ]);
        
        // Verificar se todos os vértices estão dentro da área
        const allVerticesInside = candidateVertices.every(vertex => 
            pointInPolygon(vertex, areaVertices)
        );
        
        if (allVerticesInside && canMoveResourceTo(resource, candidateVertices)) {
            return candidateVertices;
        }
    }
    
    return null; // Nenhuma estratégia funcionou
}

/**
 * Rotaciona um recurso por um ângulo específico com sistema de ajuste automático
 * @param {object} resource - O recurso a ser rotacionado
 * @param {number} angle - Ângulo em graus (positivo = horário, negativo = anti-horário)
 * @param {number} centerX - X do centro de rotação (opcional, usa centro do recurso)
 * @param {number} centerY - Y do centro de rotação (opcional, usa centro do recurso)
 */
export async function rotateResource(resource, angle, centerX = null, centerY = null) {
    if (!resource) {
        return;
    }
    
    if (resource.locked) {
        alert('Não é possível rotacionar um recurso bloqueado.');
        return;
    }
    
    // Migrar para formato poligonal se necessário
    const migratedResource = migrateResourceToPolygonal(resource);
    if (!migratedResource || !migratedResource.vertices) {
        return;
    }
    
    // Calcular centro de rotação se não fornecido
    if (centerX === null || centerY === null) {
        const bounds = calculateResourceBounds(migratedResource.vertices);
        centerX = (bounds.minX + bounds.maxX) / 2;
        centerY = (bounds.minY + bounds.maxY) / 2;
    }
    
    // Converter ângulo para radianos
    const angleRad = (angle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    // Rotacionar cada vértice
    const rotatedVertices = migratedResource.vertices.map(vertex => {
        const [x, y] = vertex;
        
        // Transladar para origem
        const translatedX = x - centerX;
        const translatedY = y - centerY;
        
        // Aplicar rotação
        const rotatedX = translatedX * cos - translatedY * sin;
        const rotatedY = translatedX * sin + translatedY * cos;
        
        // Transladar de volta
        return [rotatedX + centerX, rotatedY + centerY];
    });
    
    // Tentar aplicar rotação com sistema de ajuste automático
    const adjustedVertices = await tryRotateWithPullSystem(resource, rotatedVertices);
    
    if (adjustedVertices) {
        // Aplicar rotação com ajuste (se houve)
        migratedResource.vertices = adjustedVertices;
        
        // Atualizar coordenadas do bounding box para compatibilidade
        const newBounds = calculateResourceBounds(adjustedVertices);
        migratedResource.x = newBounds.minX;
        migratedResource.y = newBounds.minY;
        migratedResource.width = newBounds.maxX - newBounds.minX;
        migratedResource.height = newBounds.maxY - newBounds.minY;

        // Recurso rotacionado deixa de ser retangular alinhado
        migratedResource.isRectangular = false;

        applyLabelTransformAfterRotation(resource, centerX, centerY, rotatedVertices, adjustedVertices, angleRad);
        
        // Armazenar ângulo de rotação acumulado
        migratedResource.rotation = (migratedResource.rotation || 0) + angle;
        migratedResource.rotation = migratedResource.rotation % 360; // Manter entre 0-360
        
        // TASK 4: Atualizar caminhos de conexão após rotação do recurso
        // Importar a função dinamicamente para evitar dependência circular
        try {
            if (typeof window !== 'undefined' && window.updateConnectionPathsForResource) {
                window.updateConnectionPathsForResource(migratedResource.id);
            }
        } catch (error) {
            console.warn('⚠️ Erro ao atualizar conexões após rotação:', error);
        }
        
        drawAll();
    } else {
        // Só mostra aviso se não conseguiu ajustar
        alert('Não é possível rotacionar: o recurso não cabe na área mesmo com ajuste automático.');
    }
}

/**
 * Calcula os limites de um polígono (bounding box)
 * @param {Array} vertices - Array de vértices [[x,y], [x,y], ...]
 * @returns {object} - {minX, minY, maxX, maxY}
 */
function calculateResourceBounds(vertices) {
    if (!vertices || vertices.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    
    let minX = vertices[0][0];
    let minY = vertices[0][1];
    let maxX = vertices[0][0];
    let maxY = vertices[0][1];
    
    for (let i = 1; i < vertices.length; i++) {
        const [x, y] = vertices[i];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    
    return { minX, minY, maxX, maxY };
}

/**
 * Cria um novo recurso poligonal
 * @param {array} vertices - Array de vértices [[x, y], ...]
 * @param {string} color - Cor do recurso (opcional)
 * @param {string} parentAreaId - ID da área pai
 * @returns {object} - O recurso criado
 */
export function createPolygonalResource(vertices, color = null, parentAreaId = null, isRectangular = false, options = {}) {
    let extraOptions = options;
    let rectangularFlag = isRectangular;

    if (typeof isRectangular === 'object' && options === undefined) {
        extraOptions = isRectangular || {};
        rectangularFlag = false;
    }

    const resourceColor = color || getCurrentResourceColor();
    const resource = buildPolygonalResource(vertices, resourceColor, parentAreaId, rectangularFlag, extraOptions, resources);

    updateResourceCompatibilityProperties(resource);
    resources.push(resource);

    return resource;
}

export function createPolygonalResourceOnFloor(vertices, color = null, parentAreaId = null, floorId = null, isRectangular = false, options = {}) {
    if (!floorId) {
        return createPolygonalResource(vertices, color, parentAreaId, isRectangular, options);
    }

    const floor = getFloorById(floorId);
    if (!floor) {
        console.warn(`⚠️ Pavimento não encontrado: ${floorId}`);
        return null;
    }

    let extraOptions = options;
    let rectangularFlag = isRectangular;

    if (typeof isRectangular === 'object' && options === undefined) {
        extraOptions = isRectangular || {};
        rectangularFlag = false;
    }

    const resourceColor = color || getCurrentResourceColor();
    const targetCollection = Array.isArray(floor.resources) ? floor.resources : resources;
    const resource = buildPolygonalResource(vertices, resourceColor, parentAreaId, rectangularFlag, extraOptions, targetCollection);

    updateResourceCompatibilityProperties(resource);
    targetCollection.push(resource);

    return resource;
}

/**
 * Migra todos os recursos existentes para a nova estrutura poligonal
 * Esta função deve ser chamada uma vez para migrar dados existentes
 */
// Note: Global migration helpers were removed; use data-migration scripts if required.
/**
 * Converte um recurso antigo (retangular) para a nova estrutura poligonal
 * @param {object} resource - O recurso antigo
 * @returns {object} - O recurso convertido
 */
export function migrateResourceToPolygonal(resource) {
    // Se já tem vertices, não precisa migrar
    if (resource.vertices) {
        return resource;
    }
    
    // Converter retângulo para vértices
    const vertices = [
        [resource.x, resource.y], // Superior esquerdo
        [resource.x + resource.width, resource.y], // Superior direito
        [resource.x + resource.width, resource.y + resource.height], // Inferior direito
        [resource.x, resource.y + resource.height] // Inferior esquerdo
    ];
    
    // Manter compatibilidade com propriedades antigas
    const migratedResource = {
        ...resource,
        vertices: vertices,
        isRectangular: true, // Flag para indicar origem retangular
        // Manter x, y, width, height para compatibilidade
    };
    
    // Atualizar propriedades de compatibilidade
    updateResourceCompatibilityProperties(migratedResource);
    
    return migratedResource;
}

// Deprecated helpers removed. Use `calculatePolygonBounds()` and `calculateResourceBounds()`.
/**
 * Alterna o estado de bloqueio de um recurso
 * @param {object} resource - O recurso a ser bloqueado/desbloqueado
 */
export function toggleLockResource(resource) {
    if (!resource) {
        return;
    }
    
    resource.locked = !resource.locked;
    drawAll();
}

/**
 * Exclui um recurso através do menu de contexto
 * @param {object} resource - O recurso a ser excluído
 */
export function deleteResourceFromMenu(resource) {
    if (!resource) {
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir "${resource.name}"?`)) {
        const success = removeResource(resource.id);
        if (success) {
            drawAll();
        }
    }
}

// Duplicate/legacy duplication helpers moved to `src/merge_resources/duplicateResource.js`.

/**
 * Renomeia um recurso
 * @param {object} resource - O recurso a ser renomeado
 */
export function renameResource(resource) {
    if (!resource) {
        return;
    }
    
    const currentName = resource.name || `Recurso ${resource.id}`;
    const newName = prompt(`Renomear recurso:\nNome atual: ${currentName}\n\nDigite o novo nome:`, currentName);
    
    if (newName === null) return; // Cancelado
    
    if (newName.trim() === '') {
        alert('O nome não pode estar vazio.');
        return;
    }
    
    // Verificar se já existe um recurso com esse nome
    const existingResource = resources.find(r => r.id !== resource.id && r.name === newName.trim());
    if (existingResource) {
        alert(`Já existe um recurso com o nome "${newName.trim()}".`);
        return;
    }
    
    const oldName = resource.name;
    resource.name = newName.trim();
    
    // Atualizar nomes dos hubs associados a este recurso
    updateHubNamesForResource(resource.id, oldName, resource.name);
    
    drawAll();
}

// Exportar funções auxiliares usadas por outros módulos
export { 
    getPolygonCentroid, 
    calculatePolygonBounds, 
    updateResourceCompatibilityProperties,
    isComplexResource,
    translateLabelAnchor,
    applyLabelTransformAfterRotation
};

export function stopResourcePolygonEditing() {
    if (!getIsEditingResourcePolygon()) {
        return;
    }

    setIsEditingResourcePolygon(false);
    setEditingResourceId(null);
    setMidpointVertices([]);
    setDraggingMidpointIndex(-1);
    setHoveredMidpointIndex(null);
    setOriginalVerticesOnDrag([]);
    
    // Limpar estados PPT
    setActiveResourceResizeHandle(null);
    setIsRotatingResource(false);
    setResourceRotationStartAngle(null);
    setResourceRotationCenter(null);
    setResourceVerticesBeforeRotation(null);
    setCurrentResourceRotationAngle(0);
    setHoveredResourceResizeHandle(null);
    setOriginalResourceVerticesOnDrag(null);
}
