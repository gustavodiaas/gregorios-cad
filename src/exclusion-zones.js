/**
 * @fileoverview Zonas de exclusão standalone (desenhadas manualmente pelo usuário).
 * Essas zonas têm a mesma aparência e funcionalidade das zonas de exclusão de hubs:
 * - Operadores podem passar por elas
 * - Recursos NÃO podem ser colocados dentro delas
 * 
 * Suportam formas geométricas: retângulo, círculo e triângulo.
 * 
 * @module exclusion-zones
 */

import {
    exclusionZones,
    getCtx,
    getScale,
    getIsDrawingExclusionZone,
    getExclusionZoneStartPoint,
    getExclusionZonePreviewEnd,
    getExclusionZoneShapeMode,
    getSelectedExclusionZoneId,
    getActiveExclusionZoneResizeHandle
} from './state.js';
import { movementAreas } from './state.js';
import { isPointInAreaWithTolerance } from './events.js';
import { generateId, ID_PREFIXES } from './utils/idGenerator.js';
import { pointInPolygon } from './areas.js';
import { pixelsPerCm } from './config.js';
import { formatLength } from './measurement-units.js';

// ============================================================================
// CONSTANTES
// ============================================================================

/** Cor base das zonas de exclusão (púrpura, igual às de hub) */
const EXCLUSION_ZONE_COLOR = 'rgba(139, 92, 246, 1)';
const EXCLUSION_ZONE_FILL_ALPHA = 0.08;
const EXCLUSION_ZONE_FILL_ALPHA_SELECTED = 0.15;
const EXCLUSION_ZONE_STROKE_ALPHA = 0.25;
const EXCLUSION_ZONE_STROKE_ALPHA_SELECTED = 0.5;

/** Tolerância para hit-testing de formas (em pixels a escala 1:1) */
const BASE_HIT_TOLERANCE = 8;

const AREA_TOLERANCE = 1;

// ============================================================================
// CRIAÇÃO E ARMAZENAMENTO
// ============================================================================

/**
 * Cria uma nova zona de exclusão standalone.
 * @param {number[]} startPoint - [x, y] canto do bounding box
 * @param {number[]} endPoint - [x, y] canto oposto do bounding box
 * @param {string|null} parentAreaId - ID da área pai
 * @param {string} shapeType - 'rectangle' | 'circle' | 'triangle'
 * @returns {object|null}
 */
export function createExclusionZone(startPoint, endPoint, parentAreaId = null, shapeType = 'rectangle') {
    if (!Array.isArray(startPoint) || !Array.isArray(endPoint)) return null;

    return {
        id: generateId(ID_PREFIXES.EXCLUSION_ZONE),
        startPoint: [startPoint[0], startPoint[1]],
        endPoint: [endPoint[0], endPoint[1]],
        shapeType: shapeType || 'rectangle',
        parentAreaId: parentAreaId ?? null
    };
}

/**
 * Adiciona uma zona de exclusão ao estado global.
 */
export function addExclusionZone(zone) {
    if (zone) {
        exclusionZones.push(zone);
    }
}

/**
 * Remove uma zona de exclusão pelo ID.
 */
export function removeExclusionZone(zoneId) {
    const index = exclusionZones.findIndex(z => z.id === zoneId);
    if (index !== -1) {
        exclusionZones.splice(index, 1);
        return true;
    }
    return false;
}

/**
 * Resolve a área pai de uma zona de exclusão.
 */
export function resolveExclusionZoneParentAreaId(startPoint, endPoint) {
    if (!Array.isArray(startPoint) || !Array.isArray(endPoint)) return null;

    for (const area of movementAreas) {
        if (!area) continue;
        const startInside = isPointInAreaWithTolerance(startPoint, area, AREA_TOLERANCE);
        const endInside = isPointInAreaWithTolerance(endPoint, area, AREA_TOLERANCE);
        if (startInside && endInside) return area.id;
    }
    return null;
}

// ============================================================================
// CÁLCULO DE VÉRTICES P/ CADA FORMA
// ============================================================================

/**
 * Retorna os vértices de uma zona de exclusão (polígono fechado).
 * Usado para hit-testing, colisão com recursos, e navmesh.
 * @param {object} zone
 * @returns {Array<[number,number]>}
 */
export function getExclusionZoneVertices(zone) {
    const sx = zone.startPoint[0];
    const sy = zone.startPoint[1];
    const ex = zone.endPoint[0];
    const ey = zone.endPoint[1];
    const shape = zone.shapeType || 'rectangle';

    switch (shape) {
        case 'rectangle': {
            const x = Math.min(sx, ex);
            const y = Math.min(sy, ey);
            const w = Math.abs(ex - sx);
            const h = Math.abs(ey - sy);
            return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
        }
        case 'triangle': {
            const midTopX = (sx + ex) / 2;
            return [
                [midTopX, Math.min(sy, ey)],
                [Math.min(sx, ex), Math.max(sy, ey)],
                [Math.max(sx, ex), Math.max(sy, ey)]
            ];
        }
        case 'circle': {
            // Approximate ellipse as polygon with 32 segments
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const rx = Math.abs(ex - sx) / 2;
            const ry = Math.abs(ey - sy) / 2;
            const segments = 32;
            const verts = [];
            for (let i = 0; i < segments; i++) {
                const angle = (2 * Math.PI * i) / segments;
                verts.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
            }
            return verts;
        }
        default:
            return [];
    }
}

// ============================================================================
// HIT TESTING
// ============================================================================

/**
 * Verifica se um ponto está dentro de uma zona de exclusão.
 */
export function isPointInExclusionZone(x, y, zone) {
    const verts = getExclusionZoneVertices(zone);
    if (verts.length < 3) return false;
    return pointInPolygon([x, y], verts);
}

/**
 * Encontra a zona de exclusão standalone sob um ponto.
 * @param {number} px - X mundo
 * @param {number} py - Y mundo
 * @returns {object|null} Zona encontrada ou null
 */
export function findStandaloneExclusionZoneAtPoint(px, py) {
    for (let i = exclusionZones.length - 1; i >= 0; i--) {
        const zone = exclusionZones[i];
        if (isPointInExclusionZone(px, py, zone)) {
            return zone;
        }
    }
    return null;
}

/**
 * Retorna a distância de um ponto ao contorno de uma zona.
 */
function distanceToZoneBorder(px, py, zone) {
    const verts = getExclusionZoneVertices(zone);
    if (verts.length < 3) return Infinity;

    let minDist = Infinity;
    for (let i = 0; i < verts.length; i++) {
        const [x1, y1] = verts[i];
        const [x2, y2] = verts[(i + 1) % verts.length];
        const dist = distancePointToSegment(px, py, x1, y1, x2, y2);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Testa se um ponto está perto do contorno (para hover).
 */
export function findExclusionZoneNearBorder(px, py, scale) {
    const tolerance = BASE_HIT_TOLERANCE / Math.max(scale, 0.01);
    for (let i = exclusionZones.length - 1; i >= 0; i--) {
        const zone = exclusionZones[i];
        if (distanceToZoneBorder(px, py, zone) <= tolerance) {
            return zone;
        }
        if (isPointInExclusionZone(px, py, zone)) {
            return zone;
        }
    }
    return null;
}

// ============================================================================
// DESENHO
// ============================================================================

/**
 * Desenha uma forma no canvas (preenchimento + borda tracejada).
 * Aparência idêntica às zonas de exclusão de hubs.
 */
function drawExclusionShape(ctx, zone, scale, isSelected, isHovered) {
    const sx = zone.startPoint[0];
    const sy = zone.startPoint[1];
    const ex = zone.endPoint[0];
    const ey = zone.endPoint[1];
    const shape = zone.shapeType || 'rectangle';

    ctx.save();

    // Build path
    ctx.beginPath();
    switch (shape) {
        case 'rectangle': {
            const x = Math.min(sx, ex);
            const y = Math.min(sy, ey);
            const w = Math.abs(ex - sx);
            const h = Math.abs(ey - sy);
            ctx.rect(x, y, w, h);
            break;
        }
        case 'circle': {
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const rx = Math.abs(ex - sx) / 2;
            const ry = Math.abs(ey - sy) / 2;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            break;
        }
        case 'triangle': {
            const midTopX = (sx + ex) / 2;
            ctx.moveTo(midTopX, Math.min(sy, ey));
            ctx.lineTo(Math.min(sx, ex), Math.max(sy, ey));
            ctx.lineTo(Math.max(sx, ex), Math.max(sy, ey));
            ctx.closePath();
            break;
        }
    }

    // Fill
    const fillAlpha = (isSelected || isHovered) ? EXCLUSION_ZONE_FILL_ALPHA_SELECTED : EXCLUSION_ZONE_FILL_ALPHA;
    ctx.fillStyle = `rgba(139, 92, 246, ${fillAlpha})`;
    ctx.fill();

    // Dashed border
    const dashSize = 3 / scale;
    ctx.setLineDash([dashSize, dashSize]);
    const strokeAlpha = (isSelected || isHovered) ? EXCLUSION_ZONE_STROKE_ALPHA_SELECTED : EXCLUSION_ZONE_STROKE_ALPHA;
    ctx.strokeStyle = `rgba(139, 92, 246, ${strokeAlpha})`;
    ctx.lineWidth = ((isSelected || isHovered) ? 1.5 : 1) / scale;
    ctx.stroke();
    ctx.setLineDash([]);

    // Selection indicator
    if (isSelected) {
        ctx.beginPath();
        switch (shape) {
            case 'rectangle': {
                const x = Math.min(sx, ex);
                const y = Math.min(sy, ey);
                const w = Math.abs(ex - sx);
                const h = Math.abs(ey - sy);
                ctx.rect(x, y, w, h);
                break;
            }
            case 'circle': {
                const cx = (sx + ex) / 2;
                const cy = (sy + ey) / 2;
                const rx = Math.abs(ex - sx) / 2;
                const ry = Math.abs(ey - sy) / 2;
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                break;
            }
            case 'triangle': {
                const midTopX = (sx + ex) / 2;
                ctx.moveTo(midTopX, Math.min(sy, ey));
                ctx.lineTo(Math.min(sx, ex), Math.max(sy, ey));
                ctx.lineTo(Math.max(sx, ex), Math.max(sy, ey));
                ctx.closePath();
                break;
            }
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Desenha todas as zonas de exclusão standalone existentes.
 * Chamada no drawing pipeline (camada estática).
 */
export function drawStandaloneExclusionZones(selectedId, hoveredId) {
    const ctx = getCtx();
    if (!ctx || exclusionZones.length === 0) return;

    const scale = getScale();

    for (const zone of exclusionZones) {
        const isSelected = zone.id === selectedId;
        const isHovered = zone.id === hoveredId;
        drawExclusionShape(ctx, zone, scale, isSelected, isHovered);
    }
}

/**
 * Desenha o preview da zona de exclusão enquanto o usuário está desenhando.
 */
export function drawExclusionZonePreview() {
    if (!getIsDrawingExclusionZone()) return;

    const ctx = getCtx();
    if (!ctx) return;

    const start = getExclusionZoneStartPoint();
    const end = getExclusionZonePreviewEnd();
    if (!start || !end) return;

    const scale = getScale();
    const shapeMode = getExclusionZoneShapeMode();

    const previewZone = {
        startPoint: start,
        endPoint: end,
        shapeType: shapeMode
    };

    ctx.save();
    ctx.globalAlpha = 0.6;
    drawExclusionShape(ctx, previewZone, scale, false, true);
    ctx.restore();
}

// ============================================================================
// INTEGRAÇÃO COM COLISÃO DE RECURSOS
// ============================================================================

/**
 * Retorna as zonas de exclusão standalone que pertencem a uma área.
 * Formato compatível com o navmeshbaker.
 * @param {string} areaId
 * @returns {Array<{vertices: Array<[number,number]>}>}
 */
export function getStandaloneExclusionZonesForArea(areaId) {
    const result = [];
    for (const zone of exclusionZones) {
        if (zone.parentAreaId === areaId || !zone.parentAreaId) {
            const vertices = getExclusionZoneVertices(zone);
            if (vertices.length >= 3) {
                result.push({ vertices, zoneId: zone.id });
            }
        }
    }
    return result;
}

/**
 * Verifica se um polígono de recurso colide com alguma zona de exclusão standalone.
 * @param {Array<[number,number]>} candidateVertices
 * @param {string} [areaId] - Filtrar por área
 * @returns {boolean}
 */
export function collidesWithStandaloneExclusionZones(candidateVertices, areaId) {
    if (!candidateVertices || candidateVertices.length < 3) return false;
    if (exclusionZones.length === 0) return false;

    for (const zone of exclusionZones) {
        if (areaId && zone.parentAreaId && zone.parentAreaId !== areaId) continue;

        const zoneVerts = getExclusionZoneVertices(zone);
        if (zoneVerts.length < 3) continue;

        if (checkPolygonOverlap(candidateVertices, zoneVerts)) {
            return true;
        }
    }
    return false;
}

/**
 * Verifica overlap entre dois polígonos usando SAT simplificado.
 */
function checkPolygonOverlap(polyA, polyB) {
    // Check if any vertex of A is inside B
    for (const v of polyA) {
        if (pointInPolygon(v, polyB)) return true;
    }
    // Check if any vertex of B is inside A
    for (const v of polyB) {
        if (pointInPolygon(v, polyA)) return true;
    }
    // Check edge intersections
    for (let i = 0; i < polyA.length; i++) {
        const a1 = polyA[i];
        const a2 = polyA[(i + 1) % polyA.length];
        for (let j = 0; j < polyB.length; j++) {
            const b1 = polyB[j];
            const b2 = polyB[(j + 1) % polyB.length];
            if (segmentsIntersect(a1, a2, b1, b2)) return true;
        }
    }
    return false;
}

function segmentsIntersect(p1, p2, p3, p4) {
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

function direction(pi, pj, pk) {
    return (pk[0] - pi[0]) * (pj[1] - pi[1]) - (pj[0] - pi[0]) * (pk[1] - pi[1]);
}

// ============================================================================
// VINCULAÇÃO COM ÁREAS (mover, rotacionar, deletar)
// ============================================================================

/**
 * Move todas as zonas de exclusão que pertencem a uma área.
 * @param {string} areaId - ID da área pai
 * @param {number} dx - Deslocamento em X
 * @param {number} dy - Deslocamento em Y
 */
export function moveExclusionZonesWithArea(areaId, dx, dy) {
    if (dx === 0 && dy === 0) return;
    for (const zone of exclusionZones) {
        if (zone.parentAreaId === areaId) {
            zone.startPoint[0] += dx;
            zone.startPoint[1] += dy;
            zone.endPoint[0] += dx;
            zone.endPoint[1] += dy;
        }
    }
}

/**
 * Rotaciona todas as zonas de exclusão que pertencem a uma área (90° anti-horário).
 * @param {string} areaId - ID da área pai
 * @param {number} centerX - Centro de rotação X
 * @param {number} centerY - Centro de rotação Y
 */
export function rotateExclusionZonesWithArea(areaId, centerX, centerY) {
    for (const zone of exclusionZones) {
        if (zone.parentAreaId === areaId) {
            const sx = zone.startPoint[0];
            const sy = zone.startPoint[1];
            zone.startPoint[0] = centerX + (sy - centerY);
            zone.startPoint[1] = centerY - (sx - centerX);

            const ex = zone.endPoint[0];
            const ey = zone.endPoint[1];
            zone.endPoint[0] = centerX + (ey - centerY);
            zone.endPoint[1] = centerY - (ex - centerX);
        }
    }
}

/**
 * Remove todas as zonas de exclusão que pertencem a uma área.
 * @param {string} areaId - ID da área pai
 */
export function removeExclusionZonesFromArea(areaId) {
    for (let i = exclusionZones.length - 1; i >= 0; i--) {
        if (exclusionZones[i].parentAreaId === areaId) {
            exclusionZones.splice(i, 1);
        }
    }
}

// ============================================================================
// RESIZE HANDLES
// ============================================================================

const HANDLE_RADIUS = 5;
const HANDLE_HIT_RADIUS = 10;

/**
 * Retorna as 4 alças de redimensionamento (cantos do bounding box).
 * @param {object} zone
 * @returns {{nw:[number,number], ne:[number,number], sw:[number,number], se:[number,number]}}
 */
export function getExclusionZoneHandles(zone) {
    const sx = zone.startPoint[0], sy = zone.startPoint[1];
    const ex = zone.endPoint[0], ey = zone.endPoint[1];
    const minX = Math.min(sx, ex), minY = Math.min(sy, ey);
    const maxX = Math.max(sx, ex), maxY = Math.max(sy, ey);
    return {
        nw: [minX, minY],
        ne: [maxX, minY],
        sw: [minX, maxY],
        se: [maxX, maxY]
    };
}

/**
 * Testa se um ponto está sobre um handle de redimensionamento.
 * @returns {string|null} 'nw'|'ne'|'sw'|'se' ou null
 */
export function getExclusionZoneHandleAtPos(px, py, zone, scale) {
    const handles = getExclusionZoneHandles(zone);
    const hitRadius = HANDLE_HIT_RADIUS / Math.max(scale, 0.01);
    for (const [key, [hx, hy]] of Object.entries(handles)) {
        if (Math.hypot(px - hx, py - hy) <= hitRadius) {
            return key;
        }
    }
    return null;
}

/**
 * Retorna o cursor apropriado para um handle.
 */
export function getExclusionZoneHandleCursor(handle) {
    switch (handle) {
        case 'nw': case 'se': return 'nwse-resize';
        case 'ne': case 'sw': return 'nesw-resize';
        default: return 'default';
    }
}

/**
 * Desenha os handles PPT sobre a zona selecionada.
 */
export function drawExclusionZoneHandles(zone) {
    const ctx = getCtx();
    if (!ctx) return;
    const scale = getScale();
    const handles = getExclusionZoneHandles(zone);
    const r = HANDLE_RADIUS / scale;
    const activeHandle = getActiveExclusionZoneResizeHandle();

    ctx.save();
    for (const [key, [hx, hy]] of Object.entries(handles)) {
        const isActive = (activeHandle === key);
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#E3F2FD' : '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
    }
    ctx.restore();
}

/**
 * Aplica o redimensionamento baseado no handle arrastado.
 * @param {object} zone
 * @param {string} handle - 'nw'|'ne'|'sw'|'se'
 * @param {number} mx - posição mouse X mundo
 * @param {number} my - posição mouse Y mundo
 * @param {number[]} origStart - startPoint original
 * @param {number[]} origEnd - endPoint original
 */
export function applyExclusionZoneResize(zone, handle, mx, my, origStart, origEnd) {
    // Snap para grid de centímetros
    const snappedX = Math.round(mx / pixelsPerCm) * pixelsPerCm;
    const snappedY = Math.round(my / pixelsPerCm) * pixelsPerCm;

    const oMinX = Math.min(origStart[0], origEnd[0]);
    const oMinY = Math.min(origStart[1], origEnd[1]);
    const oMaxX = Math.max(origStart[0], origEnd[0]);
    const oMaxY = Math.max(origStart[1], origEnd[1]);

    let newMinX = oMinX, newMinY = oMinY, newMaxX = oMaxX, newMaxY = oMaxY;

    switch (handle) {
        case 'nw': newMinX = snappedX; newMinY = snappedY; break;
        case 'ne': newMaxX = snappedX; newMinY = snappedY; break;
        case 'sw': newMinX = snappedX; newMaxY = snappedY; break;
        case 'se': newMaxX = snappedX; newMaxY = snappedY; break;
    }

    // Tamanho mínimo: 5cm (2.5 pixels)
    const minSize = 5 * pixelsPerCm;
    if (Math.abs(newMaxX - newMinX) < minSize || Math.abs(newMaxY - newMinY) < minSize) {
        return; // Não redimensionar abaixo do mínimo
    }

    zone.startPoint = [newMinX, newMinY];
    zone.endPoint = [newMaxX, newMaxY];
}

// ============================================================================
// COTAS (DIMENSÕES)
// ============================================================================

/**
 * Desenha as cotas (largura × altura) da zona de exclusão selecionada/hovered.
 */
export function drawExclusionZoneDimensions(zone) {
    const ctx = getCtx();
    if (!ctx) return;
    const scale = getScale();

    const sx = zone.startPoint[0], sy = zone.startPoint[1];
    const ex = zone.endPoint[0], ey = zone.endPoint[1];
    const minX = Math.min(sx, ex), minY = Math.min(sy, ey);
    const maxX = Math.max(sx, ex), maxY = Math.max(sy, ey);
    const w = maxX - minX;
    const h = maxY - minY;

    const widthCm = Math.round(w / pixelsPerCm);
    const heightCm = Math.round(h / pixelsPerCm);

    if (widthCm <= 0 && heightCm <= 0) return;

    const offset = 12 / scale;
    const fontSize = Math.max(9, Math.min(12, 11 / scale));
    const tickLen = 4 / scale;

    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const dimColor = 'rgba(139, 92, 246, 0.85)';
    ctx.strokeStyle = dimColor;
    ctx.fillStyle = dimColor;
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([3 / scale, 2 / scale]);

    // Cota inferior (largura)
    if (widthCm > 0) {
        const ly = maxY + offset;
        ctx.beginPath();
        ctx.moveTo(minX, ly); ctx.lineTo(maxX, ly);
        ctx.stroke();
        // Ticks
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(minX, ly - tickLen); ctx.lineTo(minX, ly + tickLen);
        ctx.moveTo(maxX, ly - tickLen); ctx.lineTo(maxX, ly + tickLen);
        ctx.stroke();
        // Extension lines
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.beginPath();
        ctx.moveTo(minX, maxY); ctx.lineTo(minX, ly + tickLen);
        ctx.moveTo(maxX, maxY); ctx.lineTo(maxX, ly + tickLen);
        ctx.stroke();
        // Text
        ctx.setLineDash([]);
        const textW = formatLength(widthCm);
        const tw = ctx.measureText(textW).width;
        const tx = (minX + maxX) / 2;
        const ty = ly + fontSize * 0.8;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(tx - tw / 2 - 2 / scale, ty - fontSize / 2 - 1 / scale, tw + 4 / scale, fontSize + 2 / scale);
        ctx.fillStyle = dimColor;
        ctx.fillText(textW, tx, ty);
    }

    // Cota lateral (altura)
    if (heightCm > 0) {
        const lx = maxX + offset;
        ctx.setLineDash([3 / scale, 2 / scale]);
        ctx.beginPath();
        ctx.moveTo(lx, minY); ctx.lineTo(lx, maxY);
        ctx.stroke();
        // Ticks
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(lx - tickLen, minY); ctx.lineTo(lx + tickLen, minY);
        ctx.moveTo(lx - tickLen, maxY); ctx.lineTo(lx + tickLen, maxY);
        ctx.stroke();
        // Extension lines
        ctx.setLineDash([2 / scale, 2 / scale]);
        ctx.beginPath();
        ctx.moveTo(maxX, minY); ctx.lineTo(lx + tickLen, minY);
        ctx.moveTo(maxX, maxY); ctx.lineTo(lx + tickLen, maxY);
        ctx.stroke();
        // Text
        ctx.setLineDash([]);
        const textH = formatLength(heightCm);
        const th = ctx.measureText(textH).width;
        const txH = lx + fontSize * 0.8;
        const tyH = (minY + maxY) / 2;
        ctx.save();
        ctx.translate(txH, tyH);
        ctx.rotate(-Math.PI / 2);
        const thBg = ctx.measureText(textH).width;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(-thBg / 2 - 2 / scale, -fontSize / 2 - 1 / scale, thBg + 4 / scale, fontSize + 2 / scale);
        ctx.fillStyle = dimColor;
        ctx.fillText(textH, 0, 0);
        ctx.restore();
    }

    ctx.setLineDash([]);
    ctx.restore();
}
