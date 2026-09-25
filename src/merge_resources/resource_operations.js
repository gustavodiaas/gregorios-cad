// src/merge_resources/resource_operations.js

import { resources, setSelectedResourceId, movementAreas } from '../state.js';
import { polygonClipping, collisionCheckTolerance, floatTolerance } from '../config.js';
import { createPolygonalResource, removeResource, migrateResourceToPolygonal, updateResourceCompatibilityProperties, calculatePolygonBounds, getPolygonCentroid, translateLabelAnchor } from '../resources.js';
import { drawAll } from '../drawing.js';
import { rectangleToVertices, pointInPolygon, calculatePolygonArea, normalizePolygon } from '../areas.js';
import { getHubsForResource } from '../hubs.js';
import { collidesWithExclusionZones } from '../hub-exclusion-zones.js';
import { collidesWithStandaloneExclusionZones } from '../exclusion-zones.js';

function normalizeAngle(angle) {
    if (!Number.isFinite(angle)) return 0;
    while (angle <= -Math.PI) {
        angle += Math.PI * 2;
    }
    while (angle > Math.PI) {
        angle -= Math.PI * 2;
    }
    return angle;
}

function getLongestEdgeAngle(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 2) {
        return 0;
    }
    let longest = 0;
    let angle = 0;
    for (let i = 0; i < vertices.length; i++) {
        const start = vertices[i];
        const end = vertices[(i + 1) % vertices.length];
        if (!start || !end) continue;
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const length = Math.hypot(dx, dy);
        if (length > longest) {
            longest = length;
            angle = Math.atan2(dy, dx);
        }
    }
    return normalizeAngle(angle);
}

/**
 * Verifica sobreposição entre dois recursos usando a mesma lógica das áreas.
 */
function checkResourceOverlap(resource1Vertices, resource2Vertices) {
    if (!resource1Vertices || !resource2Vertices || resource1Vertices.length < 3 || resource2Vertices.length < 3) {
        return false;
    }
    try {
        // Usar polygon-clipping para verificar interseção
        const poly1 = [resource1Vertices];
        const poly2 = [resource2Vertices];
        
        // Normalizar polígonos antes da operação (mesma lógica das áreas)
        const normalizedPoly1 = normalizePolygon(poly1);
        const normalizedPoly2 = normalizePolygon(poly2);
        
        const intersection = polygonClipping.intersection(normalizedPoly1, normalizedPoly2);
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
    // Se polygon-clipping falhar, usar algoritmo manual (paridade com areas)
        try {
            return polygonsIntersect(resource1Vertices, resource2Vertices);
        } catch (_) {
            return false;
        }
    }
}

/**
 * Verifica se um recurso pode ser movido para determinada posição - EXATAMENTE como áreas.
 */
export function canMoveResourceTo(resourceToMove, potentialVertices, options = {}) {
    if (!resourceToMove || !potentialVertices) return false;

    const movingIsOperator = resourceToMove?.type === 'operator';
    const movingIsOverheadCrane = resourceToMove?.machineType === 'overhead-crane';

    const ignoreResourceIds = Array.isArray(options.ignoreResourceIds)
        ? new Set(options.ignoreResourceIds.filter(id => id !== null && id !== undefined))
        : new Set();
    
    // Primeiro, verificar se permanece dentro da área pai
    const parentArea = movementAreas.find(area => area.id === resourceToMove.parentAreaId);
    if (parentArea) {
        const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
        
        // Verificar se todos os vértices estão dentro da área ou sobre a borda
        // Tolerância de 0.25px² (~0.5px ≈ 1cm) para aceitar pontos no contorno
        // Evita bloqueio falso quando recurso está encostado na borda da área
        const BOUNDARY_TOLERANCE_SQ = 0.25;
        const allPointsInside = potentialVertices.every(vertex => {
            if (pointInPolygon(vertex, areaVertices)) return true;
            // Ponto fora do polígono — verificar se está muito próximo da borda
            for (let i = 0; i < areaVertices.length; i++) {
                const j = (i + 1) % areaVertices.length;
                if (distToSegmentSq(vertex, areaVertices[i], areaVertices[j]) <= BOUNDARY_TOLERANCE_SQ) {
                    return true;
                }
            }
            return false;
        });
        
        if (!allPointsInside) {
            return false; // Recurso sairia da área pai
        }
    }
    
    // Depois, verificar colisão com outros recursos - EXATAMENTE como áreas fazem
    if (movingIsOperator) {
        return true;
    }

    // A ponte rolante ocupa um plano aéreo: respeita os limites da área,
    // mas não colide com máquinas, recursos ou zonas no piso.
    if (movingIsOverheadCrane) {
        return true;
    }

    for (let otherResource of resources) {
        if (otherResource.id === resourceToMove.id) continue;
        if (ignoreResourceIds.has(otherResource.id)) continue;
        if (otherResource?.type === 'operator') continue;
        if (otherResource?.machineType === 'overhead-crane') continue;
        
        const otherResourceMigrated = migrateResourceToPolygonal(otherResource);
        if (checkResourceOverlap(potentialVertices, otherResourceMigrated.vertices)) {
            return false;
        }
    }

    // Verificar colisão com zonas de exclusão de hubs de outros recursos
    // NOTA: para zonas de exclusão, apenas ignoramos os hubs do próprio recurso,
    // NÃO os de outros recursos co-selecionados. Isso impede que um recurso
    // invada a zona de exclusão de outro recurso durante arraste multi-seleção.
    // Se houver delta de co-movimentação, ajustar posições dos hubs correspondentes.
    const exclusionOptions = {};
    if (options.coMovingResourceIds && options.coMovingResourceIds.length > 0) {
        exclusionOptions.coMovingResourceIds = new Set(options.coMovingResourceIds);
        exclusionOptions.deltaX = options.coMovingDeltaX || 0;
        exclusionOptions.deltaY = options.coMovingDeltaY || 0;
    }
    if (collidesWithExclusionZones(potentialVertices, resourceToMove.id, [], exclusionOptions)) {
        return false;
    }

    // Verificar colisão com zonas de exclusão standalone
    if (collidesWithStandaloneExclusionZones(potentialVertices, resourceToMove.parentAreaId)) {
        return false;
    }

    return true;
}

/**
 * Verifica adjacência entre recursos - COPIADO EXATAMENTE de checkAdjacency das áreas.
 */
function checkResourceAdjacency(resource1, resource2) {
    if (!resource1 || !resource2 || resource1.id === resource2.id) return false;
    
    const vertices1 = resource1.vertices || rectangleToVertices(resource1.x, resource1.y, resource1.width, resource1.height);
    const vertices2 = resource2.vertices || rectangleToVertices(resource2.x, resource2.y, resource2.width, resource2.height);
    
    if (!vertices1 || !vertices2) return false;
    
    // Usar tolerância maior para detecção de adjacência - IGUAL ÀS ÁREAS
    const adjacencyTolerance = 0; // Tolerância rigorosa: apenas recursos que se tocam (IGUAL ÀS ÁREAS)
    
    // Verificar se há segmentos adjacentes ou muito próximos
    for (let i = 0; i < vertices1.length; i++) {
        const p1 = vertices1[i];
        const p2 = vertices1[(i + 1) % vertices1.length];
        
        for (let j = 0; j < vertices2.length; j++) {
            const q1 = vertices2[j];
            const q2 = vertices2[(j + 1) % vertices2.length];
            
            // Verificar se segmentos são adjacentes ou muito próximos - IGUAL ÀS ÁREAS
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
 * Verifica se dois segmentos são adjacentes (compartilham parte do comprimento) - COPIADO das áreas.
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
 * Calcula a orientação de três pontos ordenados - COPIADO das áreas.
 * @param {Array} p - Primeiro ponto [x, y]
 * @param {Array} q - Segundo ponto [x, y]
 * @param {Array} r - Terceiro ponto [x, y]
 * @returns {number} 0 = colineares, 1 = horário, 2 = anti-horário
 */
function orientation(p, q, r) {
    const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
    if (Math.abs(val) < floatTolerance) return 0;
    return (val > 0) ? 1 : 2;
}

/**
 * Verifica se o ponto q está no segmento pr - COPIADO das áreas.
 * @param {Array} p - Ponto inicial do segmento
 * @param {Array} q - Ponto a verificar
 * @param {Array} r - Ponto final do segmento
 * @returns {boolean}
 */
function onSegment(p, q, r) {
    return q[0] <= Math.max(p[0], r[0]) && q[0] >= Math.min(p[0], r[0]) &&
           q[1] <= Math.max(p[1], r[1]) && q[1] >= Math.min(p[1], r[1]);
}

/**
 * Verifica se dois segmentos se intersectam - COPIADO das áreas.
 * @param {Array} p1 - Início do primeiro segmento
 * @param {Array} q1 - Fim do primeiro segmento
 * @param {Array} p2 - Início do segundo segmento
 * @param {Array} q2 - Fim do segundo segmento
 * @returns {boolean}
 */
function segmentsIntersect(p1, q1, p2, q2) {
    const d1 = orientation(q1, q2, p1);
    const d2 = orientation(q1, q2, p2);
    const d3 = orientation(p1, p2, q1);
    const d4 = orientation(p1, p2, q2);
    
    // Caso geral
    if (d1 !== d2 && d3 !== d4) return true;
    
    // Casos especiais de colinearidade
    if (d1 === 0 && onSegment(q1, p1, q2)) return true;
    if (d2 === 0 && onSegment(q1, p2, q2)) return true;
    if (d3 === 0 && onSegment(p1, q1, p2)) return true;
    if (d4 === 0 && onSegment(p1, q2, p2)) return true;
    
    return false;
}

/**
 * Verifica se dois polígonos se intersectam - COPIADO das áreas.
 * @param {Array} poly1 - Vértices do primeiro polígono
 * @param {Array} poly2 - Vértices do segundo polígono
 * @returns {boolean}
 */
function polygonsIntersect(poly1, poly2) {
    // Verificar se algum vértice de um polígono está dentro do outro
    for (const vertex of poly1) {
        if (pointInPolygon(vertex, poly2)) return true;
    }
    for (const vertex of poly2) {
        if (pointInPolygon(vertex, poly1)) return true;
    }
    
    // Verificar se alguma aresta se intersecta
    for (let i = 0; i < poly1.length; i++) {
        const p1 = poly1[i];
        const q1 = poly1[(i + 1) % poly1.length];
        
        for (let j = 0; j < poly2.length; j++) {
            const p2 = poly2[j];
            const q2 = poly2[(j + 1) % poly2.length];
            
            if (segmentsIntersect(p1, q1, p2, q2)) return true;
        }
    }
    
    return false;
}

/**
 * Verifica se um ponto está dentro de um anel/contorno - COPIADO das áreas.
 * @param {Array} point - Ponto [x, y]
 * @param {Array} ringVertices - Vértices do anel
 * @returns {boolean}
 */
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
 * Calcula a distância ao quadrado entre dois pontos - COPIADO das áreas.
 * @param {Array} p1 - Primeiro ponto [x, y]
 * @param {Array} p2 - Segundo ponto [x, y]
 * @returns {number}
 */
function distSq(p1, p2) {
    return Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2);
}

/**
 * Calcula a distância ao quadrado de um ponto a um segmento - COPIADO das áreas.
 * @param {Array} point - Ponto [x, y]
 * @param {Array} segStart - Início do segmento [x, y]
 * @param {Array} segEnd - Fim do segmento [x, y]
 * @returns {number}
 */
function distToSegmentSq(point, segStart, segEnd) {
    const A = point[0] - segStart[0];
    const B = point[1] - segStart[1];
    const C = segEnd[0] - segStart[0];
    const D = segEnd[1] - segStart[1];
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return A * A + B * B;
    
    const param = dot / lenSq;
    let xx, yy;
    
    if (param < 0) {
        xx = segStart[0];
        yy = segStart[1];
    } else if (param > 1) {
        xx = segEnd[0];
        yy = segEnd[1];
    } else {
        xx = segStart[0] + param * C;
        yy = segStart[1] + param * D;
    }
    
    const dx = point[0] - xx;
    const dy = point[1] - yy;
    return dx * dx + dy * dy;
}
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
 * Calcula a distância de um ponto a uma linha definida por dois pontos.
 */
function pointToLineDistance(point, lineStart, lineEnd) {
    // Paridade com áreas.js: distância até a LINHA infinita (não o segmento)
    const A = lineEnd[1] - lineStart[1];
    const B = lineStart[0] - lineEnd[0];
    const C = lineEnd[0] * lineStart[1] - lineStart[0] * lineEnd[1];
    return Math.abs(A * point[0] + B * point[1] + C) / Math.sqrt(A * A + B * B);
}

/**
 * Projeta um ponto em uma linha definida por dois pontos.
 */
function projectPointOnLine(point, lineStart, lineEnd) {
    // Paridade com áreas.js: parâmetro t não clampado (linha infinita)
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
 * Encontra recursos adjacentes a um recurso específico - IGUAL ÀS ÁREAS.
 * @param {Object} targetResource - Recurso de referência
 * @returns {Array} - Array de recursos adjacentes
 */
function findAdjacentResources(targetResource) {
    return resources.filter(resource => 
        resource.id !== targetResource.id && 
        resource.parentAreaId === targetResource.parentAreaId &&
        checkResourceAdjacency(targetResource, resource)
    );
}

/**
 * Calcula a menor distância entre dois recursos e os pontos mais próximos.
 * @param {Object} resource1 
 * @param {Object} resource2 
 * @returns {Object|null} - {distance, point1, point2, edge1, edge2} ou null
 */
function getClosestPointsBetweenResources(resource1, resource2) {
    if (!resource1 || !resource2 || resource1.id === resource2.id) return null;
    
    const vertices1 = resource1.vertices || rectangleToVertices(resource1.x, resource1.y, resource1.width, resource1.height);
    const vertices2 = resource2.vertices || rectangleToVertices(resource2.x, resource2.y, resource2.width, resource2.height);
    
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
 * Encontra todos os recursos próximos ao recurso sendo movido.
 * @param {Object} movingResource - Recurso sendo movido
 * @param {number} maxDistance - Distância máxima para considerar recursos próximos
 * @returns {Array} - Array de objetos com recurso e informações de proximidade
 */
function getNearbyResources(movingResource, maxDistance) {
    const nearbyResources = [];
    
    for (const resource of resources) {
        if (resource.id === movingResource.id || resource.locked) continue;
        if (resource.parentAreaId !== movingResource.parentAreaId) continue; // Só recursos na mesma área
        
        const proximity = getClosestPointsBetweenResources(movingResource, resource);
        if (proximity && proximity.distance <= maxDistance) {
            nearbyResources.push({
                resource: resource,
                proximity: proximity
            });
        }
    }
    
    // Ordenar por distância (mais próximos primeiro)
    nearbyResources.sort((a, b) => a.proximity.distance - b.proximity.distance);
    
    return nearbyResources;
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
 * Verifica se um ponto está dentro de um recurso (considerando buracos).
 */
function isPointInResource(point, resource) {
    if (!point || !resource) return false;
    
    // Converter point para array se necessário
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    
    // Verificar se tem vertices ou rings
    let mainContour = null;
    if (resource.rings && resource.rings.length > 0) {
        mainContour = resource.rings[0];
    } else if (resource.vertices && resource.vertices.length > 0) {
        mainContour = resource.vertices;
    } else {
    // Tratamento para recurso retangular simples
        return (x >= resource.x && x <= resource.x + resource.width && 
                y >= resource.y && y <= resource.y + resource.height);
    }
    
    if (!mainContour || mainContour.length < 3) return false;
    
    // Verificar se está dentro do contorno principal
    if (!isPointInRing([x, y], mainContour)) return false;
    
    // Verificar se não está dentro de nenhum buraco
    if (resource.rings && resource.rings.length > 1) {
        for (let i = 1; i < resource.rings.length; i++) {
            const holeRing = resource.rings[i];
            if (holeRing && isPointInRing([x, y], holeRing)) {
                return false; // Está dentro de um buraco
            }
        }
    }
    
    return true;
}

/**
 * Sincroniza as coordenadas legadas (x, y, width, height) com os vértices do recurso.
 * Esta função deve ser chamada após qualquer operação que modifique os vértices
 * para manter a consistência entre coordenadas visuais e lógicas.
 */
function syncResourceCoordinates(resource) {
    // Determinar quais coordenadas usar para o bounding box
    let coordsToUse = null;
    if (resource.rings && resource.rings.length > 0 && resource.rings[0].length > 0) {
        coordsToUse = resource.rings[0]; // Usar primeiro ring (contorno externo)
    } else if (resource.vertices && resource.vertices.length > 0) {
        coordsToUse = resource.vertices;
    } else {
        // Recurso inválido - sem rings nem vertices válidos
        return resource;
    }
    
    // Atualizar propriedades de compatibilidade baseado nos vértices
    updateResourceCompatibilityProperties(resource);
    
    return resource;
}

/**
 * Verifica se dois recursos podem ser unidos (são adjacentes ou se sobrepõem) - IGUAL ÀS ÁREAS.
 */
function canMergeResources(resource1, resource2) {
    const res1 = migrateResourceToPolygonal(resource1);
    const res2 = migrateResourceToPolygonal(resource2);

    // Regra mais estrita que evita "aproximação" com gap: só permite
    // - sobreposição real; ou
    // - bordas efetivamente compartilhadas (colinear + sobreposição projetada)
    return checkResourceOverlap(res1.vertices, res2.vertices) || resourcesShareEdge(res1, res2);
}

/**
 * Obtém recursos selecionáveis para união com um recurso específico - IGUAL ÀS ÁREAS.
 */
function getMergeableResources(baseResource) {
    return resources.filter(resource => 
        resource.id !== baseResource.id && 
        !resource.locked && 
        resource.parentAreaId === baseResource.parentAreaId &&
        canMergeResources(baseResource, resource)
    );
}

/**
 * Une múltiplos recursos em um único recurso - COPIADO EXATAMENTE de mergeAreas.
 * @param {Object} baseResource - Recurso base para união
 * @returns {Object|null} - Novo recurso unido ou null se falhar
 */
export async function mergeResources(baseResource) {
    if (baseResource.locked) {
        alert('Não é possível unir um recurso bloqueado.');
        return null;
    }
    
    // Encontrar recursos que podem ser unidos
    let mergeableResources = getMergeableResources(baseResource);
    
    // Tentativa de SNAP inteligente: alinhar arestas paralelas próximas ao recurso base
    // para promover o contato quando estiverem a poucos pixels de distância.
    try {
        // Procurar recursos próximos (mesma área) até 12px
        const nearby = getNearbyResources(baseResource, 12)
            .map(n => n.resource)
            .filter(r => r.parentAreaId === baseResource.parentAreaId);

        // Evitar duplicatas e pular os já mergeáveis
        const toTrySnap = nearby.filter(r =>
            r.id !== baseResource.id && !mergeableResources.some(m => m.id === r.id)
        );

        // Tentar snap em cada um; se encostar após snap, incluir no merge
        for (const candidate of toTrySnap) {
            const snapped = trySnapResourceToBase(baseResource, candidate, 12, 10);
            if (snapped && canMergeResources(baseResource, candidate)) {
                mergeableResources.push(candidate);
            }
        }
    } catch (e) {
        // snap é best-effort; não interromper fluxo
    }

    if (mergeableResources.length === 0) {
        alert('Não há recursos adjacentes ou sobrepostos disponíveis para união.');
        return null;
    }
    
    // Incluir o recurso base
    const allResources = [baseResource, ...mergeableResources];
    
    try {
        // Preparar polígonos para union - EXATAMENTE como áreas
        let unionResult = null;
        
        for (let i = 0; i < allResources.length; i++) {
            const resource = allResources[i];
            const migratedResource = migrateResourceToPolygonal(resource);
            let resourcePolygon;
            
            // Converter recurso para formato polygon-clipping - IGUAL ÀS ÁREAS
            if (migratedResource.rings && migratedResource.rings.length > 0) {
                // Se tem rings (buracos), usar diretamente
                resourcePolygon = migratedResource.rings;
            } else if (migratedResource.vertices && migratedResource.vertices.length > 0) {
                resourcePolygon = [migratedResource.vertices];
            } else {
                // Converter retângulo para vértices
                const vertices = rectangleToVertices(resource.x, resource.y, resource.width, resource.height);
                resourcePolygon = [vertices];
            }
            
            // MODIFICAÇÃO AQUI: Adicionar normalização igual às áreas
            if (i === 0) {
                unionResult = normalizePolygon(resourcePolygon);
            } else {
                const normalizedUnionResult = normalizePolygon(unionResult);
                const normalizedResourcePolygon = normalizePolygon(resourcePolygon);
                unionResult = polygonClipping.union(normalizedUnionResult, normalizedResourcePolygon);
            }
        }
        
        if (!unionResult || unionResult.length === 0) {
            throw new Error('União resultou em polígono vazio');
        }

        // Se os recursos estavam apenas "próximos" (sem tocar/sem sobrepor), a união
        // pode retornar múltiplos polígonos (disjuntos). Nesse caso, abortar para não
        // perder partes (o código atual manteria apenas o primeiro polígono).
        if (Array.isArray(unionResult) && unionResult.length > 1) {
            alert('Não foi possível unir: os recursos não estão encostados ou sobrepostos. Aproximar até tocarem (ou sobrepor) e tentar novamente.');
            return null;
        }
        
        // Usar o primeiro polígono do resultado (igual às áreas)
        const mainPolygon = unionResult[0];
        const outerRing = mainPolygon[0];
        const holes = mainPolygon.slice(1); // Buracos internos (se houver)

        // Encontrar o menor id entre os recursos originais (igual às áreas)
        // Suporta tanto IDs numéricos quanto strings
        const allIds = allResources.map(r => r.id);
        const numericIds = allIds.filter(id => typeof id === 'number' && Number.isFinite(id));
        const minId = numericIds.length > 0 
            ? Math.min(...numericIds) 
            : allIds[0]; // Se todos são strings, usar o primeiro

        // Solicitar nome ANTES de remover os recursos originais (evita perda ao cancelar)
        const resourceNames = allResources.map(r => r.name || `Recurso ${r.id}`);
        const defaultName = `União de ${resourceNames.join(', ')}`;
        const newName = prompt(`Digite o nome para o novo recurso unido:`, defaultName);
        if (newName === null) {
            return null; // Usuário cancelou, nada é removido
        }

        let largestComponentAnchor = null;
        let largestComponentAngle = 0;
        let largestComponentArea = -Infinity;

        for (const originalResource of allResources) {
            const migratedOriginal = migrateResourceToPolygonal(originalResource);
            if (!migratedOriginal.vertices || migratedOriginal.vertices.length < 3) {
                continue;
            }
            const area = Math.abs(calculatePolygonArea(migratedOriginal.vertices));
            if (area > largestComponentArea) {
                largestComponentArea = area;
                const centroid = getPolygonCentroid(migratedOriginal.vertices);
                if (Array.isArray(centroid) && centroid.length >= 2) {
                    largestComponentAnchor = { x: centroid[0], y: centroid[1] };
                }
                largestComponentAngle = getLongestEdgeAngle(migratedOriginal.vertices);
            }
        }

        // IMPORTANTE: Coletar os IDs dos recursos originais ANTES de criar o novo,
        // para evitar conflito quando o novo recurso receber o minId
        const originalResourceIds = allResources.map(r => r.id);

        // NOVO: Remover hubs de todos os recursos que serão unidos
        // O novo recurso terá um novo centroide, então coordenadas locais antigas seriam inválidas
        // O usuário deverá criar novos hubs no recurso unido
        try {
            const { removeAllHubsFromResource } = await import('../hubs.js');
            let totalHubsRemoved = 0;
            for (const res of allResources) {
                const removed = removeAllHubsFromResource(res.id, { skipRedraw: true });
                totalHubsRemoved += removed;
            }
            if (totalHubsRemoved > 0) {
            }
        } catch (e) {
            console.warn('[MergeResources] Não foi possível remover hubs:', e);
        }

        // Remover recursos originais ANTES de criar o novo recurso
        // Isso evita que o novo recurso (com minId) seja removido acidentalmente
        originalResourceIds.forEach(id => {
            removeResource(id);
        });

        // Criar novo recurso usando a função correta (que já adiciona ao array)
        const mergedResource = createPolygonalResource(
            outerRing,
            baseResource.color,
            baseResource.parentAreaId
        );

        // Aplicar ID menor e configurações adicionais (igual às áreas)
        mergedResource.id = minId;
        // Adicionar suporte a rings/holes se existirem
        if (holes.length > 0) {
            mergedResource.rings = [outerRing, ...holes];
        }
        // Usar nome fornecido ou padrão se vazio
        mergedResource.name = (newName.trim() || defaultName);
        // Marcar como não retangular (união raramente resulta em retângulo)
        mergedResource.isRectangular = false;

        if (largestComponentAnchor) {
            mergedResource.labelAnchor = largestComponentAnchor;
        }
        if (Number.isFinite(largestComponentAngle)) {
            mergedResource.labelAngle = normalizeAngle(largestComponentAngle);
        }
        
        // Selecionar novo recurso
        setSelectedResourceId(mergedResource.id);
        drawAll();
        
        return mergedResource;
        
    } catch (error) {
        alert('Erro ao unir recursos: ' + error.message);
        return null;
    }
}

// Função createResourceFromPolygon removida - usando createPolygonalResource() diretamente

// Funções de validação removidas - comportamento igual às áreas (sem validação extra)

// Funções de tolerância ajustada removidas - comportamento igual às áreas (tolerância fixa)

/**
 * Consolida recursos após rotação da área para manter uniões
 * @param {string} areaId - ID da área que foi rotacionada
 */
/**
 * Valida e corrige as posições dos hubs de conexão de um recurso
 * UNIFICADO: Busca hubs do registro global
 * @param {Object} resource - O recurso a ser validado
 */
function validateAndFixHubPositions(resource) {
    // Buscar hubs do registro global via import direto
    const resourceHubs = getHubsForResource(resource.id) || [];
    
    if (!resourceHubs.length) {
        return; // Recurso não tem hubs, nada a fazer
    }
    
    
    // Importar funções necessárias
    const { anchorToWorldCoordinates } = window.connectionUtils || {};
    if (!anchorToWorldCoordinates) {
        console.warn('⚠️ Função anchorToWorldCoordinates não encontrada, pulando validação de hubs');
        return;
    }
    
    // Obter todos os vértices do recurso
    const vertices = resource.vertices || rectangleToVertices(resource.x, resource.y, resource.width, resource.height);
    
    // Para cada hub, verificar se suas coordenadas mundiais correspondem ao esperado
    for (const hub of resourceHubs) {
        // Obter coordenadas mundiais do hub
        const worldCoords = anchorToWorldCoordinates(resource, {
            x: hub.localX,
            y: hub.localY
        });
        
        // Verificar se o ponto está dentro ou muito próximo do recurso
        const isInside = isPointInResource(worldCoords, resource);
        if (!isInside) {
            console.warn(`⚠️ Hub ${hub.id} está fora do recurso ${resource.id}. Ajustando...`);
            
            // Obter centroide do recurso
            const centroid = getPolygonCentroid(vertices);
            
            // Calcular um ponto entre o hub e o centroide (75% em direção ao centroide)
            const dx = centroid[0] - worldCoords.x;
            const dy = centroid[1] - worldCoords.y;
            
            // Novo ponto mundial ajustado (75% em direção ao centroide)
            const newWorldX = worldCoords.x + dx * 0.75;
            const newWorldY = worldCoords.y + dy * 0.75;
            
            // Converter de volta para coordenadas locais
            const { calculateAnchorPoint } = window.connectionUtils || {};
            if (calculateAnchorPoint) {
                const newLocalCoords = calculateAnchorPoint(resource, newWorldX, newWorldY);
                hub.localX = Math.round(newLocalCoords.x * 1000) / 1000;
                hub.localY = Math.round(newLocalCoords.y * 1000) / 1000;
            }
        }
    }
}

function consolidateResourcesAfterAreaRotation(areaId) {
    const resourcesInArea = resources.filter(r => r.parentAreaId === areaId);
    const area = movementAreas.find(a => a.id === areaId);
    
    if (!area) {
        console.warn(`⚠️ Não foi possível encontrar a área ${areaId} para consolidação de recursos`);
        return;
    }
    
    // Limpar vértices de todos os recursos na área
    resourcesInArea.forEach(resource => {
        if (resource.vertices) {
            // Limpar vértices com maior precisão (4 casas decimais)
            resource.vertices = cleanVerticesAfterRotation(resource.vertices, 4);
            
            // Verificar se o recurso está completamente dentro da área
            const areaVertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
            const allPointsInside = resource.vertices.every(vertex => 
                pointInPolygon(vertex, areaVertices)
            );
            
            if (!allPointsInside) {
                console.warn(`⚠️ Recurso ${resource.id} parcialmente fora da área após rotação. Tentando ajustar...`);
                
                // Obter centroide da área para reposicionamento
                const areaCentroid = getPolygonCentroid(areaVertices);
                const resourceCentroid = getPolygonCentroid(resource.vertices);
                
                // Calcular distância do centro do recurso ao centro da área
                const dx = areaCentroid[0] - resourceCentroid[0];
                const dy = areaCentroid[1] - resourceCentroid[1];
                
                // Mover recurso 10% em direção ao centro da área
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    const adjustFactor = 0.1; // 10% de movimento em direção ao centro
                    resource.vertices = resource.vertices.map(([x, y]) => [
                        x + dx * adjustFactor,
                        y + dy * adjustFactor
                    ]);
                    translateLabelAnchor(resource, dx * adjustFactor, dy * adjustFactor);
                }
            }
            
            // Atualizar propriedades de compatibilidade
            updateResourceCompatibilityProperties(resource);
            
            // NOVO: Validar e corrigir posições dos hubs após ajustes
            validateAndFixHubPositions(resource);
        }
    });
    
}

/**
 * Limpa e normaliza vértices após operações de rotação para evitar imprecisões
 * @param {Array} vertices - Vértices a serem limpos
 * @param {number} precision - Número de casas decimais (padrão: 2)
 * @returns {Array} Vértices limpos
 */
function cleanVerticesAfterRotation(vertices, precision = 2) {
    if (!vertices || !Array.isArray(vertices)) {
        return vertices;
    }
    
    const factor = Math.pow(10, precision);
    
    // Primeira passada: arredondar coordenadas
    let cleanedVertices = vertices.map(vertex => {
        if (!Array.isArray(vertex) || vertex.length !== 2) {
            return vertex;
        }
        
        return [
            Math.round(vertex[0] * factor) / factor,
            Math.round(vertex[1] * factor) / factor
        ];
    });
    
    // Segunda passada: remover vértices muito próximos (< 0.1 pixel)
    const filteredVertices = [];
    const minDistance = 0.1;
    
    for (let i = 0; i < cleanedVertices.length; i++) {
        const current = cleanedVertices[i];
        const next = cleanedVertices[(i + 1) % cleanedVertices.length];
        
        const distance = Math.sqrt(
            Math.pow(next[0] - current[0], 2) + 
            Math.pow(next[1] - current[1], 2)
        );
        
        // Só adicionar se a distância for significativa
        if (distance >= minDistance) {
            filteredVertices.push(current);
        }
    }
    
    // Garantir que temos pelo menos 3 vértices para um polígono válido
    return filteredVertices.length >= 3 ? filteredVertices : cleanedVertices;
}

// calculateResourceBoundingBox removed; use calculatePolygonBounds() from resources.js

// Exportar funções necessárias - PARIDADE COMPLETA COM ÁREAS
export { 
    // Funções principais de recursos
    checkResourceAdjacency, 
    getMergeableResources, 
    canMergeResources, 
    findAdjacentResources, 
    getClosestPointsBetweenResources,
    getNearbyResources,
    isPointInResource,
    syncResourceCoordinates,
    consolidateResourcesAfterAreaRotation,
    validateAndFixHubPositions,
    
    // Funções geométricas auxiliares (igual às áreas)
    areEdgesParallel,
    orientation,
    onSegment,
    segmentsIntersect,
    polygonsIntersect,
    isPointInRing,
    distSq,
    distToSegmentSq,
    pointToLineDistance,
    projectPointOnLine,
    segmentOverlap,
    
    // Funções de sobreposição e verificação (já existentes)
    checkResourceOverlap,
    
    // Aliases para manter compatibilidade com nomenclatura das áreas
    checkResourceOverlap as checkOverlap,
    canMoveResourceTo as canMoveTo,
    // deprecated aliases removed - use calculatePolygonBounds() and helpers in resources.js
};

/**
 * Tenta alinhar (snap) um recurso ao recurso base, movendo-o na direção
 * perpendicular às arestas mais próximas se forem paralelas e estiverem
 * a uma distância pequena.
 * Move o recurso alvo no local (atualiza vertices) se válido.
 *
 * @param {object} baseResource
 * @param {object} targetResource
 * @param {number} maxDistance - distância máxima para snap (px)
 * @param {number} angleTolerance - tolerância angular (graus) para paralelismo
 * @returns {boolean} true se moveu com sucesso e ficou válido
 */
function trySnapResourceToBase(baseResource, targetResource, maxDistance = 12, angleTolerance = 10) {
    if (!baseResource || !targetResource) return false;
    if (baseResource.parentAreaId !== targetResource.parentAreaId) return false;

    // Migrar ambos
    const base = migrateResourceToPolygonal(baseResource);
    const target = migrateResourceToPolygonal(targetResource);

    // Encontrar arestas e pontos mais próximos
    const proximity = getClosestPointsBetweenResources(base, target);
    if (!proximity || !proximity.edge1 || !proximity.edge2) return false;

    // Verificar paralelismo
    if (!areEdgesParallel(proximity.edge1, proximity.edge2, angleTolerance)) return false;

    // Verificar distância
    if (proximity.distance <= floatTolerance || proximity.distance > maxDistance) return false;

    // Vetor de deslocamento necessário para encostar: point1 - point2
    const dx = proximity.point1[0] - proximity.point2[0];
    const dy = proximity.point1[1] - proximity.point2[1];

    // Calcular vertices candidatos
    const candidateVertices = (target.vertices || []).map(v => [v[0] + dx, v[1] + dy]);

    // Validar: todos os vértices dentro da área pai
    const parentArea = movementAreas.find(a => a.id === target.parentAreaId);
    if (!parentArea) return false;
    const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
    const inside = candidateVertices.every(v => pointInPolygon(v, areaVertices));
    if (!inside) return false;

    // Validar: não colidir com outros recursos (exceto com o base, pois vamos encostar)
    for (const other of resources) {
        if (other.id === target.id || other.id === base.id) continue;
        if (other.parentAreaId !== target.parentAreaId) continue;
        const otherPoly = migrateResourceToPolygonal(other);
        if (checkResourceOverlap(candidateVertices, otherPoly.vertices)) {
            return false; // criaria sobreposição com terceiros
        }
    }

    // Aplicar
    target.vertices = candidateVertices;
    updateResourceCompatibilityProperties(target);
    return true;
}

/**
 * Verifica se dois recursos compartilham uma borda (encostam de fato).
 * Usada para permitir união apenas quando há contato real (sem gaps).
 */
function resourcesShareEdge(resource1, resource2) {
    const v1 = resource1.vertices || rectangleToVertices(resource1.x, resource1.y, resource1.width, resource1.height);
    const v2 = resource2.vertices || rectangleToVertices(resource2.x, resource2.y, resource2.width, resource2.height);
    if (!v1 || !v2) return false;
    for (let i = 0; i < v1.length; i++) {
        const p1 = v1[i];
        const p2 = v1[(i + 1) % v1.length];
        for (let j = 0; j < v2.length; j++) {
            const q1 = v2[j];
            const q2 = v2[(j + 1) % v2.length];
            if (segmentsAdjacent(p1, p2, q1, q2)) {
                return true;
            }
        }
    }
    return false;
}
