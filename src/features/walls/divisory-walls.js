// Funções para gerenciar paredes divisórias durante fusão de áreas
import { walls } from '../../state.js';
import { pointToLineDistance } from '../../areas.js';
/**
 * Detecta arestas compartilhadas entre áreas retangulares adjacentes.
 * @param {Array} areasToMerge - Array de áreas que serão fusionadas
 * @returns {Array} - Array de arestas compartilhadas encontradas
 */
function detectSharedEdges(areasToMerge) {
    const sharedEdges = [];
    const tolerance = 5; // Tolerância em pixels para considerar arestas alinhadas
    // Comparar cada par de áreas
    for (let i = 0; i < areasToMerge.length; i++) {
        const area1 = areasToMerge[i];
        const vertices1 = area1.vertices || rectangleToVertices(area1.x, area1.y, area1.width, area1.height);
        for (let j = i + 1; j < areasToMerge.length; j++) {
            const area2 = areasToMerge[j];
            const vertices2 = area2.vertices || rectangleToVertices(area2.x, area2.y, area2.width, area2.height);
            // Verificar cada aresta da area1 contra cada aresta da area2
            for (let e1 = 0; e1 < vertices1.length; e1++) {
                const edge1Start = vertices1[e1];
                const edge1End = vertices1[(e1 + 1) % vertices1.length];
                for (let e2 = 0; e2 < vertices2.length; e2++) {
                    const edge2Start = vertices2[e2];
                    const edge2End = vertices2[(e2 + 1) % vertices2.length];
                    // Verificar se as arestas são aproximadamente colineares e se sobrepõem
                    const overlap = calculateEdgeOverlap(edge1Start, edge1End, edge2Start, edge2End, tolerance);
                    if (overlap && overlap.length > 0.1) { // Usar uma tolerância mínima para evitar erros de ponto flutuante
                        sharedEdges.push({
                            area1: area1,
                            area2: area2,
                            edge1: { start: edge1Start, end: edge1End, index: e1 },
                            edge2: { start: edge2Start, end: edge2End, index: e2 },
                            overlap: overlap,
                            type: 'shared-edge' // Tipo: aresta compartilhada (borda entre retângulos)
                        });
                    }
                }
            }
        }
    }
    return sharedEdges;
}
/**
 * Calcula a sobreposição entre duas arestas colineares.
 * @param {Array} edge1Start - Início da primeira aresta
 * @param {Array} edge1End - Fim da primeira aresta
 * @param {Array} edge2Start - Início da segunda aresta
 * @param {Array} edge2End - Fim da segunda aresta
 * @param {number} tolerance - Tolerância para considerar arestas colineares
 * @returns {Object|null} - {start: [x,y], end: [x,y], length: number} ou null
 */
function calculateEdgeOverlap(edge1Start, edge1End, edge2Start, edge2End, tolerance = 5) {
    // Verificar se os pontos estão na mesma linha infinita
    const dist1 = pointToLineDistance(edge2Start, edge1Start, edge1End);
    const dist2 = pointToLineDistance(edge2End, edge1Start, edge1End);
    // Se as distâncias forem maiores que a tolerância, elas não são colineares.
    if (dist1 > tolerance || dist2 > tolerance) {
        return null;
    }
    // Determinar direção principal (horizontal ou vertical)
    const dx1 = Math.abs(edge1End[0] - edge1Start[0]);
    const dy1 = Math.abs(edge1End[1] - edge1Start[1]);
    const isHorizontal = dx1 > dy1;
    let coord1Start, coord1End, coord2Start, coord2End;
    if (isHorizontal) {
        // Aresta horizontal - usar coordenadas X
        coord1Start = Math.min(edge1Start[0], edge1End[0]);
        coord1End = Math.max(edge1Start[0], edge1End[0]);
        coord2Start = Math.min(edge2Start[0], edge2End[0]);
        coord2End = Math.max(edge2Start[0], edge2End[0]);
    } else {
        // Aresta vertical - usar coordenadas Y
        coord1Start = Math.min(edge1Start[1], edge1End[1]);
        coord1End = Math.max(edge1Start[1], edge1End[1]);
        coord2Start = Math.min(edge2Start[1], edge2End[1]);
        coord2End = Math.max(edge2Start[1], edge2End[1]);
    }
    // Calcular sobreposição
    const overlapStart = Math.max(coord1Start, coord2Start);
    const overlapEnd = Math.min(coord1End, coord2End);
    if (overlapStart >= overlapEnd) {
        return null; // Sem sobreposição
    }
    // Construir pontos da sobreposição
    let startPoint, endPoint;
    if (isHorizontal) {
        const y = (edge1Start[1] + edge1End[1] + edge2Start[1] + edge2End[1]) / 4; // Y médio
        startPoint = [overlapStart, y];
        endPoint = [overlapEnd, y];
    } else {
        const x = (edge1Start[0] + edge1End[0] + edge2Start[0] + edge2End[0]) / 4; // X médio
        startPoint = [x, overlapStart];
        endPoint = [x, overlapEnd];
    }
    const result = {
        start: startPoint,
        end: endPoint,
        length: overlapEnd - overlapStart
    };
    return result;
}
/**
 * Encontra paredes divisórias entre áreas que serão fusionadas.
 * Uma parede divisória é aquela que tem suas extremidades nas bordas de duas áreas diferentes
 * que estão sendo fusionadas.
 * @param {Array} areasToMerge - Array de áreas que serão fusionadas
 * @returns {Array} - Array de paredes divisórias encontradas
 */
function findDivisoryWalls(areasToMerge) {
    
    const divisoryWalls = [];
    const areaIds = areasToMerge.map(area => area.id);
    if (walls.length === 0) {
        return divisoryWalls;
    }
    // Primeiro detectar arestas compartilhadas
    const sharedEdges = detectSharedEdges(areasToMerge);
    for (const wall of walls) {
        // Estratégia mais simples: se a parede pertence a uma das áreas sendo unidas,
        // considerar como divisória potencial
        const belongsToMergeArea = areaIds.includes(wall.parentAreaId);
        if (belongsToMergeArea) {
            // Verificar se realmente está entre as áreas
            let touchedAreaIds = new Set();
            for (const area of areasToMerge) {
                if (isWallOnAreaBorder(wall, area)) {
                    touchedAreaIds.add(area.id);
                }
            }
            // Verificar se a parede está sobre uma aresta compartilhada
            let isOnSharedEdge = false;
            for (const sharedEdge of sharedEdges) {
                if (isWallOnSharedEdge(wall, sharedEdge)) {
                    isOnSharedEdge = true;
                    break;
                }
            }
            // Se toca pelo menos uma área OU se pertence a uma das áreas OU está sobre aresta compartilhada, considerar divisória
            if (touchedAreaIds.size > 0 || belongsToMergeArea || isOnSharedEdge) {
                divisoryWalls.push({
                    wall: wall,
                    touchedAreas: touchedAreaIds.size > 0 ? Array.from(touchedAreaIds) : [wall.parentAreaId],
                    isOnSharedEdge: isOnSharedEdge
                });
            }
        } else {
        }
    }
    // Se não encontrou nenhuma pela lógica rigorosa, tentar uma busca mais ampla
    if (divisoryWalls.length === 0) {
        for (const wall of walls) {
            // Se tem parentAreaId indefinido ou null, pode estar entre áreas
            if (!wall.parentAreaId || wall.parentAreaId === null) {
                let nearAreas = 0;
                for (const area of areasToMerge) {
                    if (isWallNearArea(wall, area)) {
                        nearAreas++;
                    }
                }
                if (nearAreas >= 2) {
                    divisoryWalls.push({
                        wall: wall,
                        touchedAreas: areaIds,
                        isOnSharedEdge: false
                    });
                }
            }
        }
    }
    return divisoryWalls;
}
/**
 * Verifica se uma parede está localizada sobre uma aresta compartilhada.
 * @param {Object} wall - Parede a verificar
 * @param {Object} sharedEdge - Aresta compartilhada
 * @returns {boolean} - True se a parede está sobre a aresta compartilhada
 */
function isWallOnSharedEdge(wall, sharedEdge) {
    const tolerance = 10;
    // Verificar se ambos os pontos da parede estão próximos da aresta compartilhada
    const distStart = distancePointToSegment(wall.startPoint, sharedEdge.overlap.start, sharedEdge.overlap.end);
    const distEnd = distancePointToSegment(wall.endPoint, sharedEdge.overlap.start, sharedEdge.overlap.end);
    return distStart <= tolerance && distEnd <= tolerance;
}
/**
 * Verifica se uma parede está na borda de uma área.
 * @param {Object} wall - Parede a verificar
 * @param {Object} area - Área de movimentação
 * @returns {boolean} - True se a parede está na borda da área
 */
function isWallOnAreaBorder(wall, area) {
    const tolerance = 10; // Tolerância em pixels
    // Verificar se a parede está ao longo de alguma aresta da área
    const vertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
    for (let i = 0; i < vertices.length; i++) {
        const edgeStart = vertices[i];
        const edgeEnd = vertices[(i + 1) % vertices.length];
        const isAlong = isWallAlongEdge(wall, edgeStart, edgeEnd, tolerance);
        if (isAlong) {
            return true;
        }
    }
    return false;
}
/**
 * Verifica se uma parede está ao longo de uma aresta específica.
 * @param {Object} wall - Parede a verificar
 * @param {Array} edgeStart - Ponto inicial da aresta
 * @param {Array} edgeEnd - Ponto final da aresta
 * @param {number} tolerance - Tolerância em pixels
 * @returns {boolean} - True se a parede está ao longo da aresta
 */
function isWallAlongEdge(wall, edgeStart, edgeEnd, tolerance = 10) {
    // Verificar se ambos os pontos da parede estão próximos da aresta
    const distStart = distancePointToSegment(wall.startPoint, edgeStart, edgeEnd);
    const distEnd = distancePointToSegment(wall.endPoint, edgeStart, edgeEnd);
    return distStart <= tolerance && distEnd <= tolerance;
}
/**
 * Calcula a distância de um ponto a um segmento de linha.
 * @param {Array} point - Ponto [x, y]
 * @param {Array} segStart - Início do segmento [x, y]
 * @param {Array} segEnd - Fim do segmento [x, y]
 * @returns {number} - Distância em pixels
 */
function distancePointToSegment(point, segStart, segEnd) {
    const A = point[0] - segStart[0];
    const B = point[1] - segStart[1];
    const C = segEnd[0] - segStart[0];
    const D = segEnd[1] - segStart[1];
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    if (lenSq === 0) {
        // Segmento de comprimento zero
        return Math.sqrt(A * A + B * B);
    }
    let param = dot / lenSq;
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
    return Math.sqrt(dx * dx + dy * dy);
}
/**
 * Remove paredes divisórias especificadas.
 * @param {Array} divisoryWallsToRemove - Array de objetos {wall, touchedAreas}
 */
function removeDivisoryWalls(divisoryWallsToRemove) {
    
    // Verificar se todas foram removidas
    const remainingIds = wallIdsToRemove.filter(id => walls.some(w => w.id === id));
    if (remainingIds.length > 0) {
        console.error('DEBUG - ALGUMAS PAREDES NÃO FORAM REMOVIDAS:', remainingIds);
    }
}
/**
 * Verifica se uma parede está próxima de uma área (menos rigoroso que estar na borda).
 * @param {Object} wall - Parede a verificar
 * @param {Object} area - Área de movimentação
 * @returns {boolean} - True se a parede está próxima da área
 */
function isWallNearArea(wall, area) {
    const tolerance = 25; // Tolerância maior para proximidade
    const vertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
    // Verificar se pelo menos um ponto da parede está próximo da área
    for (let i = 0; i < vertices.length; i++) {
        const edgeStart = vertices[i];
        const edgeEnd = vertices[(i + 1) % vertices.length];
        const distStart = distancePointToSegment(wall.startPoint, edgeStart, edgeEnd);
        const distEnd = distancePointToSegment(wall.endPoint, edgeStart, edgeEnd);
        if (distStart <= tolerance || distEnd <= tolerance) {
            return true;
        }
    }
    return false;
}
/**
 * Converte retângulo para vértices (função auxiliar).
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y  
 * @param {number} width - Largura
 * @param {number} height - Altura
 * @returns {Array} - Array de vértices [[x,y], ...]
 */
function rectangleToVertices(x, y, width, height) {
    return [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height]
    ];
}
export {
    findDivisoryWalls,
    removeDivisoryWalls,
    isWallOnAreaBorder,
    isWallAlongEdge,
    distancePointToSegment,
    isWallNearArea,
    detectSharedEdges,
    calculateEdgeOverlap,
    isWallOnSharedEdge
};

