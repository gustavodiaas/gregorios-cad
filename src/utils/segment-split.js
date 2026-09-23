/**
 * @fileoverview Utilitários para divisão de segmentos por interseções
 * 
 * @description
 * Permite selecionar sub-segmentos de paredes e linhas livres,
 * divididos nos pontos de interseção com outros segmentos (paredes,
 * bordas de áreas, linhas livres). Isso permite que o usuário
 * selecione e delete apenas uma parte de uma parede que foi cortada
 * por um segmento transversal (junção em "T" ou cruzamento).
 * 
 * @module utils/segment-split
 */

import { walls, movementAreas } from '../state.js';
import { freeLines } from '../state.js';
import { floatTolerance } from '../config.js';

// Tolerância para considerar dois pontos como coincidentes
const POINT_TOLERANCE = 0.5;

// Tolerância mínima para parâmetro t (evita sub-segmentos degenerados nos extremos)
const T_ENDPOINT_TOLERANCE = 0.005;

/**
 * Calcula a interseção entre dois segmentos de reta.
 * Retorna o parâmetro t no segmento 1 e o ponto de interseção,
 * ou null se não há interseção.
 * 
 * @param {number[]} p1 - Início do segmento 1 [x, y]
 * @param {number[]} p2 - Fim do segmento 1 [x, y]
 * @param {number[]} p3 - Início do segmento 2 [x, y]
 * @param {number[]} p4 - Fim do segmento 2 [x, y]
 * @returns {{ t: number, u: number, point: number[] } | null}
 */
function segmentIntersection(p1, p2, p3, p4) {
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < (floatTolerance || 1e-10)) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // Ambos os parâmetros devem estar dentro do intervalo [0, 1]
    if (t >= -POINT_TOLERANCE && t <= 1 + POINT_TOLERANCE &&
        u >= -POINT_TOLERANCE && u <= 1 + POINT_TOLERANCE) {
        const clampedT = Math.max(0, Math.min(1, t));
        return {
            t: clampedT,
            u: Math.max(0, Math.min(1, u)),
            point: [
                x1 + clampedT * (x2 - x1),
                y1 + clampedT * (y2 - y1)
            ]
        };
    }
    return null;
}

/**
 * Encontra todos os pontos de interseção no segmento dado,
 * provenientes de paredes, bordas de áreas e linhas livres.
 * 
 * @param {number[]} startPoint - [x, y] início do segmento
 * @param {number[]} endPoint - [x, y] fim do segmento
 * @param {string|null} excludeId - ID do segmento a excluir (ele mesmo)
 * @param {string} excludeType - 'wall' ou 'freeline' - tipo do segmento a excluir
 * @returns {number[]} Array de valores t (0-1) ordenados, representando posições de interseção
 */
export function findAllIntersections(startPoint, endPoint, excludeId = null, excludeType = 'wall') {
    const intersectionTs = [];

    // 1. Interseções com paredes internas
    for (const wall of walls) {
        if (excludeType === 'wall' && wall.id === excludeId) continue;
        if (!wall.startPoint || !wall.endPoint) continue;

        const result = segmentIntersection(startPoint, endPoint, wall.startPoint, wall.endPoint);
        if (result && result.t > T_ENDPOINT_TOLERANCE && result.t < 1 - T_ENDPOINT_TOLERANCE) {
            intersectionTs.push(result.t);
        }
    }

    // 2. Interseções com bordas de áreas de movimentação
    for (const area of movementAreas) {
        const vertices = area.vertices || [];
        if (vertices.length < 3) continue;

        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];

            const result = segmentIntersection(startPoint, endPoint, p1, p2);
            if (result && result.t > T_ENDPOINT_TOLERANCE && result.t < 1 - T_ENDPOINT_TOLERANCE) {
                intersectionTs.push(result.t);
            }
        }
    }

    // 3. Interseções com linhas livres (apenas tipo 'line')
    for (const line of freeLines) {
        if (excludeType === 'freeline' && line.id === excludeId) continue;
        if (!line.startPoint || !line.endPoint) continue;
        if (line.shapeType && line.shapeType !== 'line') continue;

        const result = segmentIntersection(startPoint, endPoint, line.startPoint, line.endPoint);
        if (result && result.t > T_ENDPOINT_TOLERANCE && result.t < 1 - T_ENDPOINT_TOLERANCE) {
            intersectionTs.push(result.t);
        }
    }

    // Remover duplicatas (interseções muito próximas)
    const uniqueTs = deduplicateTs(intersectionTs);

    // Ordenar
    uniqueTs.sort((a, b) => a - b);

    return uniqueTs;
}

/**
 * Remove valores de t duplicados (muito próximos entre si).
 * @param {number[]} ts - Array de valores t
 * @returns {number[]} Array sem duplicatas
 */
function deduplicateTs(ts) {
    if (ts.length <= 1) return [...ts];

    const sorted = [...ts].sort((a, b) => a - b);
    const result = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i] - result[result.length - 1]) > T_ENDPOINT_TOLERANCE) {
            result.push(sorted[i]);
        }
    }

    return result;
}

/**
 * Determina qual sub-segmento contém o ponto clicado.
 * 
 * @param {number[]} segStart - [x, y] início do segmento original
 * @param {number[]} segEnd - [x, y] fim do segmento original
 * @param {number[]} clickPoint - [x, y] ponto clicado
 * @param {number[]} intersectionTs - Array ordenado de valores t das interseções
 * @returns {{ tStart: number, tEnd: number, startPoint: number[], endPoint: number[] }}
 */
export function getSubSegmentAtPoint(segStart, segEnd, clickPoint, intersectionTs) {
    // Se não há interseções, retornar segmento inteiro
    if (!intersectionTs || intersectionTs.length === 0) {
        return null; // null = segmento inteiro, sem divisão
    }

    // Calcular t do ponto clicado no segmento
    const dx = segEnd[0] - segStart[0];
    const dy = segEnd[1] - segStart[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return null;

    const clickT = Math.max(0, Math.min(1,
        ((clickPoint[0] - segStart[0]) * dx + (clickPoint[1] - segStart[1]) * dy) / lenSq
    ));

    // Construir lista completa de divisões: [0, ...intersections, 1]
    const allTs = [0, ...intersectionTs, 1];

    // Encontrar em qual intervalo o clickT cai
    for (let i = 0; i < allTs.length - 1; i++) {
        if (clickT >= allTs[i] - T_ENDPOINT_TOLERANCE && clickT <= allTs[i + 1] + T_ENDPOINT_TOLERANCE) {
            const tStart = allTs[i];
            const tEnd = allTs[i + 1];

            return {
                tStart,
                tEnd,
                startPoint: [
                    segStart[0] + tStart * dx,
                    segStart[1] + tStart * dy
                ],
                endPoint: [
                    segStart[0] + tEnd * dx,
                    segStart[1] + tEnd * dy
                ]
            };
        }
    }

    // Fallback: retornar o primeiro sub-segmento mais próximo
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < allTs.length - 1; i++) {
        const midT = (allTs[i] + allTs[i + 1]) / 2;
        const dist = Math.abs(clickT - midT);
        if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
        }
    }

    const tStart = allTs[closestIdx];
    const tEnd = allTs[closestIdx + 1];

    return {
        tStart,
        tEnd,
        startPoint: [
            segStart[0] + tStart * dx,
            segStart[1] + tStart * dy
        ],
        endPoint: [
            segStart[0] + tEnd * dx,
            segStart[1] + tEnd * dy
        ]
    };
}

/**
 * Calcula o sub-segmento selecionado para uma parede ou linha livre, 
 * dado o ponto de clique.
 * 
 * @param {{ startPoint: number[], endPoint: number[], id: string }} segment - Parede ou linha livre
 * @param {number[]} clickPoint - [x, y] ponto clicado
 * @param {string} type - 'wall' ou 'freeline'
 * @returns {{ tStart: number, tEnd: number, startPoint: number[], endPoint: number[] } | null}
 */
export function computeSubSegment(segment, clickPoint, type = 'wall') {
    if (!segment || !segment.startPoint || !segment.endPoint) return null;

    const intersections = findAllIntersections(
        segment.startPoint,
        segment.endPoint,
        segment.id,
        type
    );

    if (intersections.length === 0) return null;

    return getSubSegmentAtPoint(
        segment.startPoint,
        segment.endPoint,
        clickPoint,
        intersections
    );
}

/**
 * Divide um segmento em vários sub-segmentos, excluindo o sub-segmento indicado.
 * Retorna os sub-segmentos restantes que devem ser mantidos.
 * 
 * @param {{ startPoint: number[], endPoint: number[], id: string }} segment - Segmento original
 * @param {{ tStart: number, tEnd: number }} subSegToRemove - Sub-segmento a remover
 * @param {string} type - 'wall' ou 'freeline'
 * @returns {Array<{ startPoint: number[], endPoint: number[] }>} Sub-segmentos restantes
 */
export function getRemainingSubSegments(segment, subSegToRemove, type = 'wall') {
    if (!segment || !subSegToRemove) return [];

    const intersections = findAllIntersections(
        segment.startPoint,
        segment.endPoint,
        segment.id,
        type
    );

    const dx = segment.endPoint[0] - segment.startPoint[0];
    const dy = segment.endPoint[1] - segment.startPoint[1];

    // Construir todos os sub-segmentos
    const allTs = [0, ...intersections, 1];
    const remaining = [];

    for (let i = 0; i < allTs.length - 1; i++) {
        const tStart = allTs[i];
        const tEnd = allTs[i + 1];

        // Verificar se este é o sub-segmento a remover
        if (Math.abs(tStart - subSegToRemove.tStart) < T_ENDPOINT_TOLERANCE &&
            Math.abs(tEnd - subSegToRemove.tEnd) < T_ENDPOINT_TOLERANCE) {
            continue; // Pular — este é o que será removido
        }

        remaining.push({
            startPoint: [
                segment.startPoint[0] + tStart * dx,
                segment.startPoint[1] + tStart * dy
            ],
            endPoint: [
                segment.startPoint[0] + tEnd * dx,
                segment.startPoint[1] + tEnd * dy
            ]
        });
    }

    return remaining;
}
