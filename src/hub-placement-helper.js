// Hub Placement Helper - Sistema de posicionamento restrito de hubs nas bordas dos recursos
// Os hubs representam entradas/saídas de operadores e devem estar posicionados nas bordas dos recursos

import { resources } from './state.js';
import { pixelsPerCm } from './config.js';
import { closestPointOnLineSegment } from './connections/connectionUtils.js';
import { openings, getBoundaryOpeningAnchorInfo } from './openings.js';
import { hubs, getHubsForBoundaryOpening } from './hubs.js';

// Constantes de configuração
export const HUB_PLACEMENT_MARGIN_CM = 10; // Margem de penetração permitida (10cm = 1 célula do grid menor)
export const HUB_ARROW_SIZE_CM = 20; // Tamanho da seta indicadora de direção (20cm - dobrado)

/**
 * Obtém os vértices de um recurso (normalizado para formato [[x,y], ...])
 * @param {Object} resource - O recurso
 * @returns {Array} Array de vértices [[x,y], ...]
 */
export function getResourceVertices(resource) {
    if (!resource) return [];
    
    if (resource.vertices && resource.vertices.length > 0) {
        return resource.vertices;
    }
    
    // Fallback para recursos retangulares
    if (typeof resource.x === 'number' && typeof resource.width === 'number') {
        return [
            [resource.x, resource.y],
            [resource.x + resource.width, resource.y],
            [resource.x + resource.width, resource.y + resource.height],
            [resource.x, resource.y + resource.height]
        ];
    }
    
    return [];
}

/**
 * Encontra a aresta mais próxima do cursor e o ponto projetado nela
 * @param {number} cursorX - Posição X do cursor
 * @param {number} cursorY - Posição Y do cursor
 * @param {Array} vertices - Vértices do polígono [[x,y], ...]
 * @returns {Object|null} { point: {x,y}, edgeIndex, normal: {x,y}, distance }
 */
export function findClosestEdgePoint(cursorX, cursorY, vertices) {
    if (!vertices || vertices.length < 3) return null;
    
    let closestResult = null;
    let minDistance = Infinity;
    
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        const x1 = vertices[i][0];
        const y1 = vertices[i][1];
        const x2 = vertices[j][0];
        const y2 = vertices[j][1];
        
        // Encontrar ponto mais próximo no segmento
        const closest = closestPointOnLineSegment(cursorX, cursorY, x1, y1, x2, y2);
        const distance = Math.sqrt(
            Math.pow(cursorX - closest.x, 2) + 
            Math.pow(cursorY - closest.y, 2)
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            
            // Calcular normal da aresta (apontando para fora)
            const edgeDx = x2 - x1;
            const edgeDy = y2 - y1;
            const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
            
            // Normal perpendicular (rotação 90° anti-horário)
            let normalX = -edgeDy / edgeLength;
            let normalY = edgeDx / edgeLength;
            
            // Verificar se a normal aponta para fora do polígono
            // Usando o centroide para determinar a direção "para fora"
            const centroid = getPolygonCentroid(vertices);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            // Vetor do centroide para o ponto médio da aresta
            const toCenterX = centroid.x - midX;
            const toCenterY = centroid.y - midY;
            
            // Se a normal aponta para o centro, inverter
            const dotProduct = normalX * toCenterX + normalY * toCenterY;
            if (dotProduct > 0) {
                normalX = -normalX;
                normalY = -normalY;
            }
            
            closestResult = {
                point: closest,
                edgeIndex: i,
                normal: { x: normalX, y: normalY },
                distance: minDistance,
                edgeStart: { x: x1, y: y1 },
                edgeEnd: { x: x2, y: y2 }
            };
        }
    }
    
    return closestResult;
}

/**
 * Calcula o centroide de um polígono
 * @param {Array} vertices - Vértices do polígono [[x,y], ...]
 * @returns {Object} { x, y }
 */
export function getPolygonCentroid(vertices) {
    if (!vertices || vertices.length === 0) {
        return { x: 0, y: 0 };
    }
    
    let sumX = 0;
    let sumY = 0;
    
    for (const vertex of vertices) {
        sumX += vertex[0];
        sumY += vertex[1];
    }
    
    return {
        x: sumX / vertices.length,
        y: sumY / vertices.length
    };
}

/**
 * Verifica se um ponto está dentro do polígono
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @param {Array} vertices - Vértices do polígono
 * @returns {boolean}
 */
export function isPointInsidePolygon(x, y, vertices) {
    if (!vertices || vertices.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i][0], yi = vertices[i][1];
        const xj = vertices[j][0], yj = vertices[j][1];
        
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
}

/**
 * Calcula a posição válida do hub considerando a margem de penetração
 * Se o cursor estiver além da margem, projeta perpendicularmente para a borda
 * 
 * @param {number} cursorX - Posição X do cursor (mundo)
 * @param {number} cursorY - Posição Y do cursor (mundo)
 * @param {Object} resource - O recurso alvo
 * @returns {Object|null} { 
 *   position: {x, y},      // Posição válida do hub
 *   normal: {x, y},        // Direção da seta (para fora)
 *   isConstrained: boolean, // Se a posição foi restringida
 *   edgeIndex: number       // Índice da aresta mais próxima
 * }
 */
export function calculateValidHubPosition(cursorX, cursorY, resource) {
    if (!resource) return null;
    
    const vertices = getResourceVertices(resource);
    if (vertices.length < 3) return null;
    
    const marginPx = HUB_PLACEMENT_MARGIN_CM * pixelsPerCm;
    const isInside = isPointInsidePolygon(cursorX, cursorY, vertices);
    
    // Encontrar a aresta mais próxima
    const edgeResult = findClosestEdgePoint(cursorX, cursorY, vertices);
    if (!edgeResult) return null;
    
    let finalPosition;
    let isConstrained = false;
    
    if (isInside) {
        // Cursor está dentro do recurso
        if (edgeResult.distance > marginPx) {
            // Além da margem permitida - projetar para a borda + margem
            // Mover o ponto da borda para dentro pela margem
            finalPosition = {
                x: edgeResult.point.x - edgeResult.normal.x * marginPx,
                y: edgeResult.point.y - edgeResult.normal.y * marginPx
            };
            isConstrained = true;
        } else {
            // Dentro da margem permitida - usar posição do cursor
            finalPosition = { x: cursorX, y: cursorY };
        }
    } else {
        // Cursor está fora do recurso - projetar para a borda
        finalPosition = {
            x: edgeResult.point.x,
            y: edgeResult.point.y
        };
        isConstrained = true;
    }
    
    return {
        position: finalPosition,
        normal: edgeResult.normal,
        isConstrained,
        edgeIndex: edgeResult.edgeIndex,
        edgeStart: edgeResult.edgeStart,
        edgeEnd: edgeResult.edgeEnd,
        cursorDistance: edgeResult.distance
    };
}

/**
 * Gera os pontos do polígono da zona válida (faixa de 10cm ao redor da borda interna)
 * @param {Array} vertices - Vértices do recurso
 * @returns {Array} Array de vértices da zona válida (para desenho)
 */
export function generateValidZonePolygon(vertices) {
    if (!vertices || vertices.length < 3) return [];
    
    const marginPx = HUB_PLACEMENT_MARGIN_CM * pixelsPerCm;
    const innerVertices = [];
    
    // Calcular o polígono interno (offset para dentro)
    const centroid = getPolygonCentroid(vertices);
    
    for (let i = 0; i < vertices.length; i++) {
        const prev = vertices[(i - 1 + vertices.length) % vertices.length];
        const curr = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        
        // Vetores das arestas adjacentes
        const v1x = curr[0] - prev[0];
        const v1y = curr[1] - prev[1];
        const v2x = next[0] - curr[0];
        const v2y = next[1] - curr[1];
        
        // Normalizar
        const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
        
        if (len1 === 0 || len2 === 0) {
            innerVertices.push([curr[0], curr[1]]);
            continue;
        }
        
        // Normais das arestas (apontando para dentro)
        const n1x = v1y / len1;
        const n1y = -v1x / len1;
        const n2x = v2y / len2;
        const n2y = -v2x / len2;
        
        // Verificar direção das normais (devem apontar para o centro)
        const toCenterX = centroid.x - curr[0];
        const toCenterY = centroid.y - curr[1];
        
        let finalN1x = n1x, finalN1y = n1y;
        let finalN2x = n2x, finalN2y = n2y;
        
        if (n1x * toCenterX + n1y * toCenterY < 0) {
            finalN1x = -n1x;
            finalN1y = -n1y;
        }
        if (n2x * toCenterX + n2y * toCenterY < 0) {
            finalN2x = -n2x;
            finalN2y = -n2y;
        }
        
        // Média das normais para o vértice
        const avgNx = (finalN1x + finalN2x) / 2;
        const avgNy = (finalN1y + finalN2y) / 2;
        const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy);
        
        if (avgLen > 0) {
            // Offset ajustado pelo ângulo do canto
            const dotProduct = finalN1x * finalN2x + finalN1y * finalN2y;
            const angleFactor = Math.max(0.5, Math.min(2, 1 / Math.max(0.1, Math.sqrt((1 + dotProduct) / 2))));
            const adjustedMargin = marginPx * angleFactor;
            
            innerVertices.push([
                curr[0] + (avgNx / avgLen) * adjustedMargin,
                curr[1] + (avgNy / avgLen) * adjustedMargin
            ]);
        } else {
            innerVertices.push([curr[0], curr[1]]);
        }
    }
    
    return innerVertices;
}

/**
 * Calcula os pontos da seta de direção do hub
 * @param {Object} position - Posição do hub {x, y}
 * @param {Object} normal - Normal da borda {x, y} (direção para fora)
 * @returns {Object} { tip: {x,y}, left: {x,y}, right: {x,y} }
 */
export function calculateArrowPoints(position, normal) {
    const arrowSizePx = HUB_ARROW_SIZE_CM * pixelsPerCm;
    const arrowWidth = arrowSizePx * 0.6; // Largura da base da seta
    
    // Ponta da seta (na direção da normal, para fora do recurso)
    const tip = {
        x: position.x + normal.x * arrowSizePx,
        y: position.y + normal.y * arrowSizePx
    };
    
    // Perpendicular à normal para a base da seta
    const perpX = -normal.y;
    const perpY = normal.x;
    
    // Pontos da base da seta (na posição do hub)
    const left = {
        x: position.x + perpX * (arrowWidth / 2),
        y: position.y + perpY * (arrowWidth / 2)
    };
    
    const right = {
        x: position.x - perpX * (arrowWidth / 2),
        y: position.y - perpY * (arrowWidth / 2)
    };
    
    return { tip, left, right };
}

/**
 * Encontra o recurso sob o cursor (para uso no helper)
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {Object|null} Recurso encontrado ou null
 */
export function findResourceUnderCursor(x, y) {
    // Procurar do mais recente para o mais antigo (último desenhado está no topo)
    for (let i = resources.length - 1; i >= 0; i--) {
        const resource = resources[i];
        if (resource._plannerHidden) continue;
        if (resource.visible === false) continue;
        
        const vertices = getResourceVertices(resource);
        if (vertices.length < 3) continue;
        
        if (isPointInsidePolygon(x, y, vertices)) {
            return resource;
        }
    }
    return null;
}

/**
 * Encontra o recurso mais próximo do cursor (mesmo que não esteja sobre ele)
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @param {number} maxDistance - Distância máxima de busca (pixels)
 * @returns {Object|null} { resource, distance }
 */
export function findNearestResourceToCursor(x, y, maxDistance = Infinity) {
    let nearest = null;
    let minDistance = maxDistance;
    
    for (let i = resources.length - 1; i >= 0; i--) {
        const resource = resources[i];
        if (resource._plannerHidden) continue;
        if (resource.visible === false) continue;
        
        const vertices = getResourceVertices(resource);
        if (vertices.length < 3) continue;
        
        // Verificar se está dentro
        if (isPointInsidePolygon(x, y, vertices)) {
            return { resource, distance: 0 };
        }
        
        // Calcular distância até a borda mais próxima
        const edgeResult = findClosestEdgePoint(x, y, vertices);
        if (edgeResult && edgeResult.distance < minDistance) {
            minDistance = edgeResult.distance;
            nearest = { resource, distance: edgeResult.distance };
        }
    }
    
    return nearest;
}

/**
 * Calcula a normal (direção para fora) em uma posição específica de um recurso
 * Usado para determinar a direção da ponta do hub em forma de gota
 * 
 * @param {number} x - Posição X (mundo)
 * @param {number} y - Posição Y (mundo)
 * @param {Object} resource - O recurso
 * @returns {Object|null} { x, y } - Normal unitária apontando para fora
 */
export function calculateNormalAtPosition(x, y, resource) {
    if (!resource) return null;
    
    const vertices = getResourceVertices(resource);
    if (vertices.length < 3) return null;
    
    const edgeResult = findClosestEdgePoint(x, y, vertices);
    if (!edgeResult) return null;
    
    return edgeResult.normal;
}

/**
 * Encontra um hub de abertura de borda (doca) próximo ao cursor.
 * Retorna o hub mais próximo que esteja associado a uma boundaryOpening.
 * @param {number} x - Coordenada X do cursor (mundo)
 * @param {number} y - Coordenada Y do cursor (mundo)
 * @param {number} maxDistance - Distância máxima em pixels
 * @returns {Object|null} { hub, distance } ou null
 */
export function findBoundaryOpeningHubNearCursor(x, y, maxDistance = 30) {
    let nearest = null;
    let minDist = maxDistance;
    
    for (const hub of hubs) {
        if (!hub.boundaryOpeningId) continue;
        const dx = x - hub.x;
        const dy = y - hub.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
            minDist = dist;
            nearest = { hub, distance: dist };
        }
    }
    
    return nearest;
}

/**
 * Encontra uma abertura de borda (doca) próxima ao cursor que ainda NÃO tem hub.
 * Retorna a abertura mais próxima para permitir criação automática de hub.
 * @param {number} x - Coordenada X do cursor (mundo)
 * @param {number} y - Coordenada Y do cursor (mundo)
 * @param {number} maxDistance - Distância máxima em pixels
 * @returns {Object|null} { opening, anchorInfo, distance } ou null
 */
export function findBoundaryOpeningWithoutHubNearCursor(x, y, maxDistance = 30) {
    let nearest = null;
    let minDist = maxDistance;
    
    for (const opening of openings) {
        if (!opening.isBoundaryOpening) continue;
        
        // Verificar se já tem hub
        const existingHubs = getHubsForBoundaryOpening(opening.id);
        if (existingHubs.length > 0) continue;
        
        const midX = (opening.startPoint[0] + opening.endPoint[0]) / 2;
        const midY = (opening.startPoint[1] + opening.endPoint[1]) / 2;
        const dx = x - midX;
        const dy = y - midY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
            minDist = dist;
            const anchorInfo = getBoundaryOpeningAnchorInfo(opening.id);
            if (anchorInfo) {
                nearest = { opening, anchorInfo, distance: dist };
            }
        }
    }
    
    return nearest;
}

/**
 * Encontra qualquer abertura de borda (doca) próxima ao cursor (com ou sem hub).
 * Prioridade: hub existente > abertura sem hub.
 * @param {number} x - Coordenada X do cursor (mundo)
 * @param {number} y - Coordenada Y do cursor (mundo)
 * @param {number} maxDistance - Distância máxima em pixels
 * @returns {Object|null} { type: 'hub'|'opening', hub?, opening?, anchorInfo?, distance }
 */
export function findNearestDockTarget(x, y, maxDistance = 30) {
    // Prioridade 1: hub existente de doca
    const hubResult = findBoundaryOpeningHubNearCursor(x, y, maxDistance);
    if (hubResult) {
        return {
            type: 'hub',
            hub: hubResult.hub,
            distance: hubResult.distance
        };
    }
    
    // Prioridade 2: abertura sem hub
    const openingResult = findBoundaryOpeningWithoutHubNearCursor(x, y, maxDistance);
    if (openingResult) {
        return {
            type: 'opening',
            opening: openingResult.opening,
            anchorInfo: openingResult.anchorInfo,
            distance: openingResult.distance
        };
    }
    
    return null;
}

// Exportar para uso global (debug e testes)
if (typeof window !== 'undefined') {
    window.HubPlacementHelper = {
        calculateValidHubPosition,
        findClosestEdgePoint,
        generateValidZonePolygon,
        calculateArrowPoints,
        calculateNormalAtPosition,
        findResourceUnderCursor,
        findNearestResourceToCursor,
        getResourceVertices,
        findBoundaryOpeningHubNearCursor,
        findBoundaryOpeningWithoutHubNearCursor,
        findNearestDockTarget,
        HUB_PLACEMENT_MARGIN_CM,
        HUB_ARROW_SIZE_CM
    };
}
