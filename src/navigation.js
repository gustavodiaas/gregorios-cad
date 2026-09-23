// Módulo de Navegação - Sistema de Navigation Mesh para A* Pathfinding
// Responsável por construir e gerenciar o grafo de navegação de alto nível entre áreas

import { movementAreas, openings } from './state.js';

/**
 * Estrutura do Navigation Graph:
 * {
 *   nodes: Map<areaId, AreaNode>,
 *   edges: Map<areaId, Array<Edge>>
 * }
 * 
 * AreaNode: {
 *   id: string,
 *   center: {x, y},
 *   vertices: Array<[x, y]>,
 *   bounds: {minX, maxX, minY, maxY}
 * }
 * 
 * Edge: {
 *   fromAreaId: string,
 *   toAreaId: string,
 *   portal: {
 *     opening: object,
 *     startPoint: {x, y},
 *     endPoint: {x, y},
 *     midpoint: {x, y},
 *     width: number
 *   },
 *   cost: number // Distância entre centros das áreas
 * }
 */

// Cache do grafo de navegação
let navigationGraph = null;
let lastUpdateTimestamp = 0;

/**
 * Constrói o grafo de navegação de alto nível entre áreas
 * Processa movementAreas para criar nós e openings para criar arestas/portais
 * @returns {object} - Grafo de navegação com nós e arestas
 */
export function buildNavigationGraph() {
    
    // Verificar se existem áreas de movimentação disponíveis
    if (!movementAreas || movementAreas.length === 0) {
        console.warn('❌ Nenhuma área de movimentação disponível para construção do grafo');
        return {
            nodes: new Map(),
            edges: new Map()
        };
    }
    
    const graph = {
        nodes: new Map(),
        edges: new Map()
    };
    
    // Passo 1: Criar nós para cada área de movimentação
    for (const area of movementAreas) {
        const node = createAreaNode(area);
        if (node) {
            graph.nodes.set(area.id, node);
            graph.edges.set(area.id, []); // Inicializar array de arestas
        } else {
            console.warn(`⚠️ Não foi possível criar nó para área ${area.id}`);
        }
    }
    
    
    // Passo 2: Processar aberturas para criar portais/arestas entre áreas
    const portalsCreated = processOpeningsAsPortals(graph);
    
    
    // Verificar se o grafo resultante é válido
    if (graph.nodes.size === 0) {
        console.warn('❌ Grafo construído está vazio - não há áreas válidas');
    } else {
    }
    
    // Atualizar cache
    navigationGraph = graph;
    lastUpdateTimestamp = Date.now();
    
    return graph;
}

/**
 * Cria um nó de área para o grafo de navegação
 * @param {object} area - Área de movimentação
 * @returns {object} - Nó de área
 */
function createAreaNode(area) {
    let vertices, center, bounds;
    
    if (area.vertices && area.vertices.length > 0) {
        // Área poligonal
        vertices = area.vertices.slice(); // Copiar array
        center = calculatePolygonCentroid(area.vertices);
        bounds = calculatePolygonBounds(area.vertices);
    } else if (area.x !== undefined && area.y !== undefined && 
               area.width !== undefined && area.height !== undefined) {
        // Área retangular
        vertices = [
            [area.x, area.y],
            [area.x + area.width, area.y],
            [area.x + area.width, area.y + area.height],
            [area.x, area.y + area.height]
        ];
        center = {
            x: area.x + area.width / 2,
            y: area.y + area.height / 2
        };
        bounds = {
            minX: area.x,
            maxX: area.x + area.width,
            minY: area.y,
            maxY: area.y + area.height
        };
    } else {
        console.warn('Área sem geometria válida:', area);
        return null;
    }
    
    return {
        id: area.id,
        center,
        vertices,
        bounds,
        name: area.name || `Área ${area.id}`
    };
}

/**
 * Calcula o centroide de um polígono
 * @param {Array} vertices - Array de vértices [[x, y], ...]
 * @returns {object} - {x, y} coordenadas do centroide
 */
function calculatePolygonCentroid(vertices) {
    if (!vertices || vertices.length === 0) {
        return { x: 0, y: 0 };
    }
    
    let centroidX = 0, centroidY = 0;
    for (const vertex of vertices) {
        centroidX += vertex[0];
        centroidY += vertex[1];
    }
    
    return {
        x: centroidX / vertices.length,
        y: centroidY / vertices.length
    };
}

/**
 * Calcula os limites de um polígono
 * @param {Array} vertices - Array de vértices [[x, y], ...]
 * @returns {object} - {minX, maxX, minY, maxY}
 */
function calculatePolygonBounds(vertices) {
    if (!vertices || vertices.length === 0) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    
    let minX = vertices[0][0], maxX = vertices[0][0];
    let minY = vertices[0][1], maxY = vertices[0][1];
    
    for (let i = 1; i < vertices.length; i++) {
        const [x, y] = vertices[i];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    
    return { minX, maxX, minY, maxY };
}

/**
 * Processa as aberturas para criar portais/arestas entre áreas
 * @param {object} graph - Grafo de navegação em construção
 * @returns {number} - Número de portais criados
 */
function processOpeningsAsPortals(graph) {
    let portalsCreated = 0;
    
    for (const opening of openings) {
        if (!opening.startPoint || !opening.endPoint) {
            continue; // Abertura inválida
        }
        
        // Encontrar áreas que a abertura conecta
        const connectedAreas = findAreasConnectedByOpening(opening, graph);
        
        if (connectedAreas.length === 2) {
            // Criar portal bidirecional entre as duas áreas
            const areaA = connectedAreas[0];
            const areaB = connectedAreas[1];
            
            const portal = createPortal(opening, areaA, areaB);
            
            // Adicionar arestas bidirecionais
            graph.edges.get(areaA.id).push({
                fromAreaId: areaA.id,
                toAreaId: areaB.id,
                portal: portal,
                cost: calculateDistanceBetweenAreas(areaA, areaB)
            });
            
            graph.edges.get(areaB.id).push({
                fromAreaId: areaB.id,
                toAreaId: areaA.id,
                portal: portal,
                cost: calculateDistanceBetweenAreas(areaA, areaB)
            });
            
            portalsCreated++;
        }
    }
    
    return portalsCreated;
}

/**
 * Encontra as áreas conectadas por uma abertura
 * @param {object} opening - Abertura
 * @param {object} graph - Grafo de navegação
 * @returns {Array} - Array de nós de área conectados
 */
function findAreasConnectedByOpening(opening, graph) {
    const connectedAreas = [];
    const tolerance = 10; // Tolerância para detecção de proximidade
    
    // Pontos da abertura
    const openingStart = { x: opening.startPoint[0], y: opening.startPoint[1] };
    const openingEnd = { x: opening.endPoint[0], y: opening.endPoint[1] };
    const openingMidpoint = {
        x: (openingStart.x + openingEnd.x) / 2,
        y: (openingStart.y + openingEnd.y) / 2
    };
    
    for (const [areaId, node] of graph.nodes) {
        // Verificar se a abertura está próxima ou na borda da área
        if (isOpeningNearArea(opening, node, tolerance)) {
            connectedAreas.push(node);
        }
    }
    
    return connectedAreas;
}

/**
 * Verifica se uma abertura está próxima ou conectada a uma área
 * @param {object} opening - Abertura
 * @param {object} areaNode - Nó da área
 * @param {number} tolerance - Tolerância de proximidade
 * @returns {boolean} - True se a abertura estiver conectada à área
 */
function isOpeningNearArea(opening, areaNode, tolerance) {
    const openingStart = { x: opening.startPoint[0], y: opening.startPoint[1] };
    const openingEnd = { x: opening.endPoint[0], y: opening.endPoint[1] };
    
    // Verificar se os pontos da abertura estão dentro ou próximos da área
    return isPointNearPolygon(openingStart, areaNode.vertices, tolerance) ||
           isPointNearPolygon(openingEnd, areaNode.vertices, tolerance) ||
           isLineIntersectingPolygon(openingStart, openingEnd, areaNode.vertices);
}

/**
 * Verifica se um ponto está próximo de um polígono
 * @param {object} point - {x, y}
 * @param {Array} vertices - Vértices do polígono
 * @param {number} tolerance - Tolerância
 * @returns {boolean}
 */
function isPointNearPolygon(point, vertices, tolerance) {
    // Verificar se o ponto está dentro do polígono
    if (isPointInPolygon(point, vertices)) {
        return true;
    }
    
    // Verificar se o ponto está próximo das arestas
    for (let i = 0; i < vertices.length; i++) {
        const v1 = { x: vertices[i][0], y: vertices[i][1] };
        const v2 = { x: vertices[(i + 1) % vertices.length][0], y: vertices[(i + 1) % vertices.length][1] };
        
        const distance = distancePointToLineSegment(point, v1, v2);
        if (distance <= tolerance) {
            return true;
        }
    }
    
    return false;
}

/**
 * Verifica se um ponto está dentro de um polígono
 * @param {object} point - {x, y}
 * @param {Array} vertices - Vértices do polígono [[x, y], ...]
 * @returns {boolean}
 */
function isPointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i][0], yi = vertices[i][1];
        const xj = vertices[j][0], yj = vertices[j][1];
        
        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Verifica se uma linha intersecta com um polígono
 * @param {object} p1 - Ponto inicial da linha
 * @param {object} p2 - Ponto final da linha
 * @param {Array} vertices - Vértices do polígono
 * @returns {boolean}
 */
function isLineIntersectingPolygon(p1, p2, vertices) {
    for (let i = 0; i < vertices.length; i++) {
        const v1 = { x: vertices[i][0], y: vertices[i][1] };
        const v2 = { x: vertices[(i + 1) % vertices.length][0], y: vertices[(i + 1) % vertices.length][1] };
        
        if (doLinesIntersect(p1, p2, v1, v2)) {
            return true;
        }
    }
    return false;
}

/**
 * Verifica se duas linhas se intersectam
 * @param {object} p1 - Início da linha 1
 * @param {object} p2 - Fim da linha 1
 * @param {object} p3 - Início da linha 2
 * @param {object} p4 - Fim da linha 2
 * @returns {boolean}
 */
function doLinesIntersect(p1, p2, p3, p4) {
    const d1 = direction(p3, p4, p1);
    const d2 = direction(p3, p4, p2);
    const d3 = direction(p1, p2, p3);
    const d4 = direction(p1, p2, p4);
    
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }
    
    return false;
}

/**
 * Calcula a direção/orientação de três pontos
 */
function direction(a, b, c) {
    return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

/**
 * Calcula a distância de um ponto a um segmento de linha
 */
function distancePointToLineSegment(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
        return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
    }
    
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (length * length)));
    const projection = {
        x: lineStart.x + t * dx,
        y: lineStart.y + t * dy
    };
    
    return Math.sqrt(Math.pow(point.x - projection.x, 2) + Math.pow(point.y - projection.y, 2));
}

/**
 * Cria um portal entre duas áreas baseado em uma abertura
 * @param {object} opening - Abertura
 * @param {object} areaA - Primeira área
 * @param {object} areaB - Segunda área
 * @returns {object} - Portal
 */
function createPortal(opening, areaA, areaB) {
    const startPoint = { x: opening.startPoint[0], y: opening.startPoint[1] };
    const endPoint = { x: opening.endPoint[0], y: opening.endPoint[1] };
    const midpoint = {
        x: (startPoint.x + endPoint.x) / 2,
        y: (startPoint.y + endPoint.y) / 2
    };
    
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const width = Math.sqrt(dx * dx + dy * dy);
    
    return {
        opening: opening,
        startPoint,
        endPoint,
        midpoint,
        width,
        type: opening.type || 'door'
    };
}

/**
 * Calcula a distância entre os centros de duas áreas
 * @param {object} areaA - Primeira área
 * @param {object} areaB - Segunda área
 * @returns {number} - Distância euclidiana
 */
function calculateDistanceBetweenAreas(areaA, areaB) {
    const dx = areaB.center.x - areaA.center.x;
    const dy = areaB.center.y - areaA.center.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Obtém o grafo de navegação (constrói se necessário)
 * @param {boolean} forceRebuild - Força reconstrução do grafo
 * @returns {object} - Grafo de navegação
 */
export function getNavigationGraph(forceRebuild = false) {
    if (!navigationGraph || forceRebuild) {
        navigationGraph = buildNavigationGraph();
    }
    return navigationGraph;
}

/**
 * Invalida o cache do grafo de navegação
 * Deve ser chamado quando áreas ou aberturas são modificadas
 */
export function invalidateNavigationGraph() {
    const wasValid = navigationGraph !== null;
    navigationGraph = null;
    lastUpdateTimestamp = 0;
    
    if (wasValid) {
    } else {
    }
}

/**
 * Encontra uma sequência de áreas para navegar de um ponto a outro
 * @param {number} startX - Coordenada X inicial
 * @param {number} startY - Coordenada Y inicial
 * @param {number} endX - Coordenada X final
 * @param {number} endY - Coordenada Y final
 * @returns {Array} - Array de IDs de área ou null se não houver caminho
 */
export function findAreaSequence(startX, startY, endX, endY) {
    const graph = getNavigationGraph();
    
    // Encontrar áreas de origem e destino
    const startArea = findAreaContainingPoint(startX, startY, graph);
    const endArea = findAreaContainingPoint(endX, endY, graph);
    
    if (!startArea || !endArea) {
        console.warn('Não foi possível encontrar áreas para os pontos de início ou fim');
        return null;
    }
    
    if (startArea.id === endArea.id) {
        // Mesmo área - caminho direto
        return [startArea.id];
    }
    
    // Usar algoritmo BFS para encontrar sequência de áreas
    return findShortestAreaPath(startArea.id, endArea.id, graph);
}

/**
 * Encontra a área que contém um ponto específico
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @param {object} graph - Grafo de navegação
 * @returns {object|null} - Nó da área ou null
 */
function findAreaContainingPoint(x, y, graph) {
    const point = { x, y };
    
    for (const [areaId, node] of graph.nodes) {
        if (isPointInPolygon(point, node.vertices)) {
            return node;
        }
    }
    
    return null;
}

/**
 * Encontra o caminho mais curto entre duas áreas usando BFS
 * @param {string} startAreaId - ID da área inicial
 * @param {string} endAreaId - ID da área final
 * @param {object} graph - Grafo de navegação
 * @returns {Array|null} - Array de IDs de área ou null
 */
function findShortestAreaPath(startAreaId, endAreaId, graph) {
    const queue = [{ areaId: startAreaId, path: [startAreaId] }];
    const visited = new Set([startAreaId]);
    
    while (queue.length > 0) {
        const { areaId, path } = queue.shift();
        
        if (areaId === endAreaId) {
            return path;
        }
        
        // Explorar vizinhos
        const edges = graph.edges.get(areaId) || [];
        for (const edge of edges) {
            if (!visited.has(edge.toAreaId)) {
                visited.add(edge.toAreaId);
                queue.push({
                    areaId: edge.toAreaId,
                    path: [...path, edge.toAreaId]
                });
            }
        }
    }
    
    return null; // Nenhum caminho encontrado
}

/**
 * Obtém informações detalhadas sobre os portais ao longo de um caminho de áreas
 * @param {Array} areaSequence - Sequência de IDs de área
 * @returns {Array} - Array de portais
 */
export function getPortalsAlongPath(areaSequence) {
    if (!areaSequence || areaSequence.length < 2) {
        return [];
    }
    
    const graph = getNavigationGraph();
    const portals = [];
    
    for (let i = 0; i < areaSequence.length - 1; i++) {
        const fromAreaId = areaSequence[i];
        const toAreaId = areaSequence[i + 1];
        
        const edges = graph.edges.get(fromAreaId) || [];
        const edge = edges.find(e => e.toAreaId === toAreaId);
        
        if (edge && edge.portal) {
            portals.push(edge.portal);
        }
    }
    
    return portals;
}

/**
 * Obtém estatísticas do grafo de navegação
 * @returns {object} - Estatísticas
 */
export function getNavigationGraphStats() {
    const graph = getNavigationGraph();
    
    let totalEdges = 0;
    for (const [areaId, edges] of graph.edges) {
        totalEdges += edges.length;
    }
    
    return {
        nodes: graph.nodes.size,
        edges: totalEdges / 2, // Dividir por 2 porque as arestas são bidirecionais
        lastUpdate: lastUpdateTimestamp,
        isValid: navigationGraph !== null
    };
}

// Exportar funções utilitárias
export {
    calculatePolygonCentroid,
    calculatePolygonBounds,
    isPointInPolygon
};

// Disponibilizar funções globalmente para fácil acesso de outros módulos
if (typeof window !== 'undefined') {
    window.getNavigationGraph = getNavigationGraph;
    window.invalidateNavigationGraph = invalidateNavigationGraph;
    window.findAreaSequence = findAreaSequence;
    window.getNavigationGraphStats = getNavigationGraphStats;
}

