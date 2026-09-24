// Funções auxiliares para áreas de movimentação, colisão, adjacência, etc.
import { movementAreas } from './state.js';
import { polygonClipping, collisionCheckTolerance, floatTolerance } from './config.js';
import { generateId, ID_PREFIXES } from './utils/idGenerator.js';
import { layoutChangeNotifier } from './core/layout-change-notifier.js';

/**
 * NOVA FUNÇÃO: Normaliza as coordenadas de um polígono para evitar erros de ponto flutuante.
 * @param {Array} polygon - Polígono no formato para polygon-clipping, ex: [[[x, y], ...]]
 * @returns {Array} - Polígono com vértices arredondados para incrementos de 0.5 pixels (sistema centimétrico da aplicação).
 */
function normalizePolygon(polygon) {
    if (!polygon || !Array.isArray(polygon)) return polygon;
    return polygon.map(ring =>
        ring.map(vertex => [
            Math.round(vertex[0] * 2) / 2,  // Arredonda para múltiplos de 0.5
            Math.round(vertex[1] * 2) / 2   // Arredonda para múltiplos de 0.5
        ])
    );
}

/**
 * Verifica sobreposição entre dois polígonos.
 */
function checkOverlap(poly1Vertices, poly2Vertices) {
    if (!poly1Vertices || !poly2Vertices || poly1Vertices.length < 3 || poly2Vertices.length < 3) {
        return false;
    }
    try {
        // Usar polygon-clipping para verificar interseção
        const poly1 = [poly1Vertices];
        const poly2 = [poly2Vertices];
        const intersection = polygonClipping.intersection(poly1, poly2);
        if (intersection.length > 0) {
            // Calcular área da interseção
            let area = 0;
            for (let polygon of intersection) {
                for (let ring of polygon) {
                    area += Math.abs(calculatePolygonArea(ring));
                }
            }
            return area > collisionCheckTolerance;
        }
        return false;
    } catch (error) {
        console.warn('Erro na verificação de sobreposição com polygon-clipping:', error);
        // Fallback para algoritmo manual se polygon-clipping falhar
        return polygonsIntersect(poly1Vertices, poly2Vertices);
    }
}

/**
 * Verifica sobreposição entre duas áreas considerando polígonos compostos.
 */
function checkAreaOverlap(area1, area2) {
    if (!area1 || !area2 || area1.id === area2.id) {
        return false;
    }
    
    // Obter vértices das áreas
    let area1Vertices, area2Vertices;
    
    if (area1.rings && area1.rings.length > 0) {
        area1Vertices = area1.rings[0]; // Contorno externo
    } else if (area1.vertices && area1.vertices.length > 0) {
        area1Vertices = area1.vertices;
    } else {
        area1Vertices = rectangleToVertices(area1.x, area1.y, area1.width, area1.height);
    }
    
    if (area2.rings && area2.rings.length > 0) {
        area2Vertices = area2.rings[0]; // Contorno externo
    } else if (area2.vertices && area2.vertices.length > 0) {
        area2Vertices = area2.vertices;
    } else {
        area2Vertices = rectangleToVertices(area2.x, area2.y, area2.width, area2.height);
    }
    
    return checkOverlap(area1Vertices, area2Vertices);
}
/**
 * Verifica se uma área pode ser movida para determinada posição.
 */
function canMoveTo(areaToMove, potentialVertices) {
    if (!areaToMove || !potentialVertices) return false;
    for (let otherArea of movementAreas) {
        if (otherArea.id === areaToMove.id) continue;
        if (checkOverlap(potentialVertices, otherArea.vertices)) {
            return false;
        }
    }
    return true;
}
/**
 * Verifica adjacência entre áreas com tolerância melhorada.
 */
function checkAdjacency(area1, area2) {
    if (!area1 || !area2 || area1.id === area2.id) return false;
    const vertices1 = area1.vertices || rectangleToVertices(area1.x, area1.y, area1.width, area1.height);
    const vertices2 = area2.vertices || rectangleToVertices(area2.x, area2.y, area2.width, area2.height);
    if (!vertices1 || !vertices2) return false;
    // Usar tolerância maior para detecção de adjacência
    const adjacencyTolerance = 0; // Tolerância rigorosa: apenas áreas que se tocam
    // Verificar se há segmentos adjacentes ou muito próximos
    for (let i = 0; i < vertices1.length; i++) {
        const p1 = vertices1[i];
        const p2 = vertices1[(i + 1) % vertices1.length];
        for (let j = 0; j < vertices2.length; j++) {
            const q1 = vertices2[j];
            const q2 = vertices2[(j + 1) % vertices2.length];
            // Verificar se segmentos são adjacentes ou muito próximos
            if (segmentsAdjacent(p1, p2, q1, q2) || segmentsNearby(p1, p2, q1, q2, adjacencyTolerance)) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Verifica se dois segmentos estão próximos o suficiente para serem considerados adjacentes.
 */
function segmentsNearby(p1, p2, q1, q2, tolerance = 10) {
    const result = getClosestPointsBetweenSegments(p1, p2, q1, q2);
    return result && result.distance <= tolerance;
}
/**
 * Verifica se dois segmentos são adjacentes (compartilham parte do comprimento) com tolerância melhorada.
 */
function segmentsAdjacent(p1, p2, q1, q2) {
    // Verificar se os segmentos são aproximadamente colineares
    const tolerance = 5; // Aumentar tolerância para 5 pixels
    // Calcular distâncias dos pontos de um segmento à linha do outro
    const dist1 = pointToLineDistance(q1, p1, p2);
    const dist2 = pointToLineDistance(q2, p1, p2);
    const dist3 = pointToLineDistance(p1, q1, q2);
    const dist4 = pointToLineDistance(p2, q1, q2);
    // Se nem todos os pontos estão próximos das linhas, não são colineares
    if (Math.max(dist1, dist2) > tolerance && Math.max(dist3, dist4) > tolerance) {
        return false;
    }
    // Verificar sobreposição projetada
    const proj1 = projectPointOnLine(p1, q1, q2);
    const proj2 = projectPointOnLine(p2, q1, q2);
    const proj3 = projectPointOnLine(q1, p1, p2);
    const proj4 = projectPointOnLine(q2, p1, p2);
    // Verificar se há sobreposição nos segmentos projetados
    const overlap1 = segmentOverlap(proj3, proj4, 0, 1);
    const overlap2 = segmentOverlap(proj1, proj2, 0, 1);
    return overlap1 > 0.001 || overlap2 > 0.001; // Reduzir threshold para 0.1% de sobreposição
}
/**
 * Calcula o bounding box de um conjunto de vértices.
 */
function calculateBoundingBox(vertices) {
    if (!vertices || vertices.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = vertices[0][0], maxX = vertices[0][0];
    let minY = vertices[0][1], maxY = vertices[0][1];
    for (let i = 1; i < vertices.length; i++) {
        minX = Math.min(minX, vertices[i][0]);
        maxX = Math.max(maxX, vertices[i][0]);
        minY = Math.min(minY, vertices[i][1]);
        maxY = Math.max(maxY, vertices[i][1]);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
/**
 * Converte um retângulo em um array de vértices.
 */
function rectangleToVertices(x, y, width, height) {
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
}
/**
 * Verifica se um ponto está dentro de um anel de vértices (polígono simples).
 */
function pointInPolygon(point, vertices) {
    if (!point || !vertices || vertices.length < 3) return false;
    const x = point[0], y = point[1];
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
 * Calcula a área de um polígono usando a fórmula do shoelace.
 */
function calculatePolygonArea(vertices) {
    if (!vertices || vertices.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        area += vertices[i][0] * vertices[j][1];
        area -= vertices[j][0] * vertices[i][1];
    }
    return Math.abs(area) / 2;
}
/**
 * Verifica se dois polígonos se intersectam (algoritmo de fallback).
 */
function polygonsIntersect(poly1, poly2) {
    // Verificar se algum vértice de um polígono está dentro do outro
    for (let vertex of poly1) {
        if (pointInPolygon(vertex, poly2)) return true;
    }
    for (let vertex of poly2) {
        if (pointInPolygon(vertex, poly1)) return true;
    }
    // Verificar se algum segmento se intersecta
    for (let i = 0; i < poly1.length; i++) {
        const p1 = poly1[i];
        const p2 = poly1[(i + 1) % poly1.length];
        for (let j = 0; j < poly2.length; j++) {
            const q1 = poly2[j];
            const q2 = poly2[(j + 1) % poly2.length];
            if (segmentsIntersect(p1, p2, q1, q2)) return true;
        }
    }
    return false;
}
/**
 * Verifica se dois segmentos se intersectam.
 */
function segmentsIntersect(p1, p2, q1, q2) {
    const d1 = orientation(q1, q2, p1);
    const d2 = orientation(q1, q2, p2);
    const d3 = orientation(p1, p2, q1);
    const d4 = orientation(p1, p2, q2);
    if (d1 !== d2 && d3 !== d4) return true;
    if (d1 === 0 && onSegment(q1, p1, q2)) return true;
    if (d2 === 0 && onSegment(q1, p2, q2)) return true;
    if (d3 === 0 && onSegment(p1, q1, p2)) return true;
    if (d4 === 0 && onSegment(p1, q2, p2)) return true;
    return false;
}
/**
 * Calcula a orientação de três pontos ordenados.
 */
function orientation(p, q, r) {
    const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
    if (Math.abs(val) < floatTolerance) return 0;
    return (val > 0) ? 1 : 2;
}
/**
 * Verifica se o ponto q está no segmento pr.
 */
function onSegment(p, q, r) {
    return q[0] <= Math.max(p[0], r[0]) && q[0] >= Math.min(p[0], r[0]) &&
           q[1] <= Math.max(p[1], r[1]) && q[1] >= Math.min(p[1], r[1]);
}
function isPointInRing(point, ringVertices) {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    let isInside = false;
    for (let i = 0, j = ringVertices.length - 1; i < ringVertices.length; j = i++) {
        const xi = ringVertices[i][0], yi = ringVertices[i][1];
        const xj = ringVertices[j][0], yj = ringVertices[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}
/**
 * Verifica se um ponto está dentro de uma área (considerando buracos).
 */
function isPointInArea(point, area) {
    if (!point || !area) return false;
    // Converter point para array se necessário
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    // Verificar se tem vertices ou rings
    let mainContour = null;
    if (area.rings && area.rings.length > 0) {
        mainContour = area.rings[0];
    } else if (area.vertices && area.vertices.length > 0) {
        mainContour = area.vertices;
    } else {
        // Fallback para área retangular simples
        return (x >= area.x && x <= area.x + area.width && 
                y >= area.y && y <= area.y + area.height);
    }
    if (!mainContour || mainContour.length < 3) return false;
    // Verificar se está dentro do contorno principal
    if (!isPointInRing([x, y], mainContour)) return false;
    // Verificar se não está dentro de nenhum buraco
    if (area.rings && area.rings.length > 1) {
        for (let i = 1; i < area.rings.length; i++) {
            const holeRing = area.rings[i];
            if (holeRing && isPointInRing([x, y], holeRing)) {
                return false; // Está dentro de um buraco
            }
        }
    }
    return true;
}
/**
 * Calcula o quadrado da distância entre dois pontos.
 */
function distSq(p1, p2) {
    return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2;
}
/**
 * Encontra o ponto mais próximo na borda de um polígono a partir de um ponto de referência.
 * @param {Array<Array<number>>} polygonVertices - Os vértices do polígono.
 * @param {object} referencePoint - O ponto de referência {x, y}.
 * @returns {object} O ponto mais próximo na borda {x, y}.
 */
function getClosestPointOnPolygonEdge(polygonVertices, referencePoint) {
    let closestPoint = null;
    let minDistanceSq = Infinity;

    for (let i = 0; i < polygonVertices.length; i++) {
        const p1 = polygonVertices[i];
        const p2 = polygonVertices[(i + 1) % polygonVertices.length];
        
        // Usando a lógica de distToSegmentSq
        const l2 = distSq(p1, p2);
        if (l2 === 0) continue; // Pontos coincidentes
        
        let t = ((referencePoint.x - p1[0]) * (p2[0] - p1[0]) + (referencePoint.y - p1[1]) * (p2[1] - p1[1])) / l2;
        t = Math.max(0, Math.min(1, t));
        
        const projection = {
            x: p1[0] + t * (p2[0] - p1[0]),
            y: p1[1] + t * (p2[1] - p1[1])
        };
        
        const dSq = distSq([referencePoint.x, referencePoint.y], [projection.x, projection.y]);
        
        if (dSq < minDistanceSq) {
            minDistanceSq = dSq;
            closestPoint = projection;
        }
    }
    return closestPoint;
}

/**
 * Calcula o quadrado da distância de um ponto p a um segmento [a, b].
 */
function distToSegmentSq(p, a, b) {
    const l2 = distSq(a, b);
    if (l2 === 0) return distSq(p, a);
    let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    return distSq(p, projection);
}
/**
 * Retorna todas as áreas de movimentação.
 */
function getAllMovementAreas() {
    return movementAreas;
}
// Variável para prevenir execução simultânea
let isMerging = false;

/**
 * Une múltiplas áreas em uma única área.
 * @param {Array} areas - Array de áreas para unir
 * @returns {Object|null} - Nova área unida ou null se falhar
 */
async function mergeAreas(areas) {
    // Proteção contra execução dupla
    if (isMerging) {
        console.warn('⚠️ Operação de união já em andamento. Ignorando chamada duplicada.');
        return null;
    }
    
    isMerging = true;
    
    try {

        if (!areas || areas.length < 2) {
            console.warn('⚠️ Pelo menos 2 áreas são necessárias para união');
            return null;
        }
        
        // Importar walls do state.js se não estiver importado
        const { walls } = await import('./state.js');
        // Logar estado global das paredes antes do merge
        // Logar estado inicial das paredes relacionadas
        const originalAreaIds = areas.map(area => area.id);
        const wallsBefore = walls.filter(wall => originalAreaIds.includes(wall.parentAreaId));
        // Preparar polígonos para union
        let unionResult = null;
        for (let i = 0; i < areas.length; i++) {
            const area = areas[i];
            let areaPolygon;
            // Converter área para formato polygon-clipping
            if (area.rings && area.rings.length > 0) {
                areaPolygon = area.rings;
            } else if (area.vertices && area.vertices.length > 0) {
                areaPolygon = [area.vertices];
            } else {
                // Converter retângulo para vértices
                const vertices = rectangleToVertices(area.x, area.y, area.width, area.height);
                areaPolygon = [vertices];
            }
            
            // MODIFICAÇÃO AQUI:
            if (i === 0) {
                unionResult = normalizePolygon(areaPolygon);
            } else {
                const normalizedUnionResult = normalizePolygon(unionResult);
                const normalizedAreaPolygon = normalizePolygon(areaPolygon);
                unionResult = polygonClipping.union(normalizedUnionResult, normalizedAreaPolygon);
            }
        }

        if (!unionResult || unionResult.length === 0) {
            throw new Error('União resultou em polígono vazio');
        }
        // Criar nova área a partir do resultado
        const mergedArea = createAreaFromPolygon(unionResult, areas);
        // Reatribuir paredes que pertencem às áreas originais para a nova área
        let reassignedWalls = 0;
        let reassignedWallIds = [];
        walls.forEach(wall => {
            if (originalAreaIds.includes(wall.parentAreaId)) {
                wall.parentAreaId = mergedArea.id;
                reassignedWalls++;
                reassignedWallIds.push(wall.id);
            }
        });
        // Logar paredes "órfãs" (sem parentAreaId válido)
        const orphanWalls = walls.filter(w => !movementAreas.some(a => a.id === w.parentAreaId));
        
        // Logar estado final das paredes relacionadas
        const wallsAfter = walls.filter(wall => wall.parentAreaId === mergedArea.id);
        // Logar estado global das paredes depois do merge
        // Logar se alguma parede foi removida do array walls
        const allWallIds = walls.map(w => w.id);
        const removedWallIds = wallsBefore.map(w => w.id).filter(id => !allWallIds.includes(id));
        if (removedWallIds.length > 0) {
            // Some walls were removed during merge
        }
        // 🎯 CORREÇÃO: Reatribuir recursos das áreas originais para a nova área unida
        let reassignedResources = 0;
        // Importar resources do state.js
        const { resources } = await import('./state.js');
        resources.forEach(resource => {
            if (originalAreaIds.includes(resource.parentAreaId)) {
                resource.parentAreaId = mergedArea.id;
                reassignedResources++;
            }
        });

        // Remover áreas originais da lista
        areas.forEach(area => {
            const index = movementAreas.findIndex(a => a.id === area.id);
            if (index !== -1) {
                movementAreas.splice(index, 1);
            }
        });
        // Adicionar nova área
        movementAreas.push(mergedArea);
        // Gera a NavMesh imediatamente para a nova área unida
        const { ensureAreaHasNavMesh } = await import('./navMeshBaker.js');
        ensureAreaHasNavMesh(mergedArea);
        return mergedArea;
    } catch (error) {
        console.error('❌ Erro CRÍTICO durante a união de áreas:', error);
        alert('Erro ao unir áreas: ' + error.message);
        return null;
    } finally {
        // Sempre resetar a flag para permitir próximas operações
        isMerging = false;
    }
}
/**
 * Cria uma área a partir de um resultado de união de polígonos.
 * @param {Array} polygonResult - Resultado da união de polígonos
 * @param {Array} originalAreas - Áreas originais para herdar propriedades
 * @returns {Object} - Nova área
 */
function createAreaFromPolygon(polygonResult, originalAreas) {
    // Usar o primeiro polígono do resultado (maior componente)
    const mainPolygon = polygonResult[0];
    const outerRing = mainPolygon[0];
    const holes = mainPolygon.slice(1);
    // Calcular bounding box
    const bb = calculateBoundingBox(outerRing);
    // Gerar novo ID semântico para a área unida (NÃO herda minId)
    const newId = generateId(ID_PREFIXES.AREA);
    // Herdar propriedades da primeira área
    const firstArea = originalAreas[0];
    return {
        id: newId,
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
        vertices: outerRing,
        rings: holes.length > 0 ? [outerRing, ...holes] : [outerRing],
        locked: false,
        isRectangular: false // União raramente resulta em retângulo
    };
}
/**
 * Encontra áreas adjacentes a uma área específica.
 * @param {Object} targetArea - Área de referência
 * @returns {Array} - Array de áreas adjacentes
 */
function findAdjacentAreas(targetArea) {
    return movementAreas.filter(area => 
        area.id !== targetArea.id && checkAdjacency(targetArea, area)
    );
}
/**
 * Verifica se duas áreas podem ser unidas (são adjacentes ou se sobrepõem).
 * @param {Object} area1
 * @param {Object} area2
 * @returns {boolean}
 */
function canMergeAreas(area1, area2) {
    return checkAdjacency(area1, area2) || checkOverlap(area1.vertices, area2.vertices);
}
/**
 * Obtém áreas selecionáveis para união com uma área específica.
 * @param {Object} baseArea - Área base para união
 * @returns {Array} - Array de áreas que podem ser unidas
 */
function getMergeableAreas(baseArea) {
    return movementAreas.filter(area => 
        area.id !== baseArea.id && !area.locked && canMergeAreas(baseArea, area)
    );
}
/**
 * Calcula a menor distância entre duas áreas e os pontos mais próximos.
 * @param {Object} area1 
 * @param {Object} area2 
 * @returns {Object|null} - {distance, point1, point2, edge1, edge2} ou null
 */
function getClosestPointsBetweenAreas(area1, area2) {
    if (!area1 || !area2 || area1.id === area2.id) return null;
    const vertices1 = area1.vertices || rectangleToVertices(area1.x, area1.y, area1.width, area1.height);
    const vertices2 = area2.vertices || rectangleToVertices(area2.x, area2.y, area2.width, area2.height);
    let minDistance = Infinity;
    let closestPoint1 = null;
    let closestPoint2 = null;
    let closestEdge1 = null;
    let closestEdge2 = null;
    // Verificar distância entre todos os segmentos
    for (let i = 0; i < vertices1.length; i++) {
        const p1 = vertices1[i];
        const p2 = vertices1[(i + 1) % vertices1.length];
        for (let j = 0; j < vertices2.length; j++) {
            const q1 = vertices2[j];
            const q2 = vertices2[(j + 1) % vertices2.length];
            const result = getClosestPointsBetweenSegments(p1, p2, q1, q2);
            if (result && result.distance < minDistance) {
                minDistance = result.distance;
                closestPoint1 = result.point1;
                closestPoint2 = result.point2;
                closestEdge1 = { start: p1, end: p2, index: i };
                closestEdge2 = { start: q1, end: q2, index: j };
            }
        }
    }
    if (minDistance === Infinity) return null;
    return {
        distance: minDistance,
        point1: closestPoint1,
        point2: closestPoint2,
        edge1: closestEdge1,
        edge2: closestEdge2
    };
}
/**
 * Calcula os pontos mais próximos entre dois segmentos.
 * @param {Array} p1 - Início do primeiro segmento
 * @param {Array} p2 - Fim do primeiro segmento  
 * @param {Array} q1 - Início do segundo segmento
 * @param {Array} q2 - Fim do segundo segmento
 * @returns {Object|null} - {distance, point1, point2}
 */
function getClosestPointsBetweenSegments(p1, p2, q1, q2) {
    const d1 = [p2[0] - p1[0], p2[1] - p1[1]]; // Direção do primeiro segmento
    const d2 = [q2[0] - q1[0], q2[1] - q1[1]]; // Direção do segundo segmento
    const w = [p1[0] - q1[0], p1[1] - q1[1]];  // Vetor entre os inícios
    const a = d1[0] * d1[0] + d1[1] * d1[1]; // |d1|²
    const b = d1[0] * d2[0] + d1[1] * d2[1]; // d1 · d2
    const c = d2[0] * d2[0] + d2[1] * d2[1]; // |d2|²
    const d = d1[0] * w[0] + d1[1] * w[1];   // d1 · w
    const e = d2[0] * w[0] + d2[1] * w[1];   // d2 · w
    const denom = a * c - b * b;
    let t1, t2;
    if (Math.abs(denom) < floatTolerance) {
        // Segmentos paralelos
        t1 = 0;
        t2 = (b > c ? d / b : e / c);
    } else {
        t1 = (b * e - c * d) / denom;
        t2 = (a * e - b * d) / denom;
    }
    // Clampar aos segmentos
    t1 = Math.max(0, Math.min(1, t1));
    t2 = Math.max(0, Math.min(1, t2));
    const point1 = [p1[0] + t1 * d1[0], p1[1] + t1 * d1[1]];
    const point2 = [q1[0] + t2 * d2[0], q1[1] + t2 * d2[1]];
    const distance = Math.sqrt(
        Math.pow(point2[0] - point1[0], 2) + 
        Math.pow(point2[1] - point1[1], 2)
    );
    return { distance, point1, point2 };
}
/**
 * Encontra todas as áreas próximas à área sendo movida.
 * @param {Object} movingArea - Área sendo movida
 * @param {number} maxDistance - Distância máxima para considerar áreas próximas
 * @returns {Array} - Array de objetos com área e informações de proximidade
 */
function getNearbyAreas(movingArea, maxDistance) {
    const nearbyAreas = [];
    for (const area of movementAreas) {
        if (area.id === movingArea.id || area.locked) continue;
        const proximity = getClosestPointsBetweenAreas(movingArea, area);
        if (proximity && proximity.distance <= maxDistance) {
            nearbyAreas.push({
                area: area,
                proximity: proximity
            });
        }
    }
    // Ordenar por distância (mais próximas primeiro)
    nearbyAreas.sort((a, b) => a.proximity.distance - b.proximity.distance);
    return nearbyAreas;
}
/**
 * Verifica se duas arestas são aproximadamente paralelas.
 * @param {Object} edge1 
 * @param {Object} edge2 
 * @param {number} tolerance - Tolerância angular em graus
 * @returns {boolean}
 */
function areEdgesParallel(edge1, edge2, tolerance = 10) {
    const v1 = [edge1.end[0] - edge1.start[0], edge1.end[1] - edge1.start[1]];
    const v2 = [edge2.end[0] - edge2.start[0], edge2.end[1] - edge2.start[1]];
    const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
    const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
    if (len1 < floatTolerance || len2 < floatTolerance) return false;
    // Normalizar vetores
    v1[0] /= len1; v1[1] /= len1;
    v2[0] /= len2; v2[1] /= len2;
    // Calcular produto escalar
    const dot = Math.abs(v1[0] * v2[0] + v1[1] * v2[1]);
    const angleRad = Math.acos(Math.min(1, dot));
    const angleDeg = angleRad * 180 / Math.PI;
    return angleDeg <= tolerance || Math.abs(angleDeg - 180) <= tolerance;
}
/**
 * Calcula a distância de um ponto a uma linha definida por dois pontos.
 */
function pointToLineDistance(point, lineStart, lineEnd) {
    const A = lineEnd[1] - lineStart[1];
    const B = lineStart[0] - lineEnd[0];
    const C = lineEnd[0] * lineStart[1] - lineStart[0] * lineEnd[1];
    return Math.abs(A * point[0] + B * point[1] + C) / Math.sqrt(A * A + B * B);
}
/**
 * Projeta um ponto em uma linha e retorna o parâmetro t (0 = início, 1 = fim).
 */
function projectPointOnLine(point, lineStart, lineEnd) {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < floatTolerance) return 0;
    const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lengthSq;
    return t;
}
/**
 * Calcula a sobreposição entre dois segmentos 1D.
 */
function segmentOverlap(start1, end1, start2, end2) {
    const min1 = Math.min(start1, end1);
    const max1 = Math.max(start1, end1);
    const min2 = Math.min(start2, end2);
    const max2 = Math.max(start2, end2);
    const overlapStart = Math.max(min1, min2);
    const overlapEnd = Math.min(max1, max2);
    if (overlapEnd <= overlapStart) return 0;
    const overlap = overlapEnd - overlapStart;
    const length1 = max1 - min1;
    const length2 = max2 - min2;
    const minLength = Math.min(length1, length2);
    return minLength > 0 ? overlap / minLength : 0;
}
/**
 * Sincroniza as coordenadas legadas (x, y, width, height) com os vértices da área.
 * Esta função deve ser chamada após qualquer operação que modifique os vértices
 * para manter a consistência entre coordenadas visuais e lógicas.
 */
function syncAreaCoordinates(area) {
    // Determinar quais coordenadas usar para o bounding box
    let coordsToUse = null;
    if (area.rings && area.rings.length > 0 && area.rings[0].length > 0) {
        coordsToUse = area.rings[0]; // Usar primeiro ring (contorno externo)
    } else if (area.vertices && area.vertices.length > 0) {
        coordsToUse = area.vertices;
    } else {
        // Área inválida - sem rings nem vertices válidos
    }
    const bb = calculateBoundingBox(coordsToUse);
    // Atualizar coordenadas legadas para consistência
    area.x = bb.x;
    area.y = bb.y;
    area.width = bb.width;
    area.height = bb.height;
    return area;
}

/**
 * Cria uma área retangular nova.
 * @param {number} x - Coordenada X do canto superior esquerdo
 * @param {number} y - Coordenada Y do canto superior esquerdo
 * @param {number} width - Largura da área
 * @param {number} height - Altura da área
 * @returns {Object|null} - A nova área criada ou null se houver sobreposição
 */
export function createArea(x, y, width, height) {
    const newVertices = rectangleToVertices(x, y, width, height);
    const hasOverlap = movementAreas.some(area => 
        checkOverlap(newVertices, area.vertices)
    );
    
    if (!hasOverlap) {
        const newArea = {
            id: generateId(ID_PREFIXES.AREA),
            x: x,
            y: y,
            width: width,
            height: height,
            vertices: newVertices,
            rings: null,
            locked: false,
            showDimensions: true
        };
        movementAreas.push(newArea);
        
        // Gerar NavMesh automaticamente para a nova área (lazy import para evitar dependência circular)
        import('./navMeshBaker.js').then(mod => {
            mod.ensureAreaHasNavMesh(newArea);
        });
        
        // Atualizar opções de NavMesh na interface
        import('./navmesh-controls.js').then(mod => {
            mod.refreshNavMeshOptions();
        });
        
        // Invalidar grafo de navegação quando nova área é criada
        if (window.invalidateNavigationGraph) {
            window.invalidateNavigationGraph();
        }
        
        // Notificar o sistema de mudança de layout
        layoutChangeNotifier.notifyChange('area', { action: 'create', entity: newArea });

        return newArea;
    } else {
        alert("Sobreposição com área existente");
        return null;
    }
}

export {
    normalizePolygon,
    checkOverlap,
    checkAreaOverlap,
    canMoveTo,
    checkAdjacency,
    calculateBoundingBox,
    rectangleToVertices,
    isPointInRing,
    isPointInArea,
    distSq,
    distToSegmentSq,
    getAllMovementAreas,
    pointInPolygon,
    calculatePolygonArea,
    polygonsIntersect,
    segmentsIntersect,
    segmentsAdjacent,
    segmentsNearby,
    orientation,    onSegment,
    mergeAreas,
    createAreaFromPolygon,
    findAdjacentAreas,
    canMergeAreas,
    getMergeableAreas,
    getClosestPointsBetweenAreas,
    getClosestPointsBetweenSegments,
    getNearbyAreas,
    areEdgesParallel,
    pointToLineDistance,
    syncAreaCoordinates,
    projectPointOnLine,
    segmentOverlap,
    getClosestPointOnPolygonEdge
};

