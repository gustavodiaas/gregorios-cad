// Funções relacionadas às linhas livres decorativas
import {
    freeLines,
    getCtx,
    getScale,
    getSelectedFreeLineId,
    getHoveredFreeLineId,
    getIsDrawingFreeLine,
    getFreeLineStartPoint,
    getFreeLinePreviewEnd,
    getIsCtrlPressed,
    getFreeLineShapeMode,
    getSelectedFreeLineSubSegment,
    getHoveredFreeLineSubSegment
} from './state.js';
import {
    freeLineDefaultColor,
    freeLineHoverColor,
    freeLineSelectedColor,
    freeLinePreviewColor,
    freeLineLineWidth,
    freeLineSnapRadius,
    freeLineAngleSnapEnabled,
    freeLineAngleSnapIncrementDeg,
    freeLineAngleSnapToleranceDeg,
    freeLineMinAngleSnapLength,
    freeLineSnapIndicatorColor,
    freeLineSnapIndicatorRadius,
    freeLineClosureSnapRadius,
    freeLineClosureGuideColor,
    pixelsPerCm
} from './config.js';
import { formatLength } from './measurement-units.js';
import { pointInPolygon } from './areas.js';
import { movementAreas } from './state.js';
import { isPointInAreaWithTolerance } from './events.js';
import { generateId, ID_PREFIXES } from './utils/idGenerator.js';
import { computeSubSegment, getRemainingSubSegments } from './utils/segment-split.js';
import { attachDimensionEndpoints, findDimensionAnchor, syncDimensionEndpoints } from './dimension-anchors.js';

const FREE_LINE_AREA_TOLERANCE = 1;

export function resolveFreeLineParentAreaId(startPoint, endPoint) {
    if (!Array.isArray(startPoint) || !Array.isArray(endPoint)) {
        return null;
    }

    for (const area of movementAreas) {
        if (!area) continue;

        const startInside = isPointInAreaWithTolerance(startPoint, area, FREE_LINE_AREA_TOLERANCE);
        const endInside = isPointInAreaWithTolerance(endPoint, area, FREE_LINE_AREA_TOLERANCE);

        if (startInside && endInside) {
            return area.id;
        }
    }

    return null;
}

const BASE_SELECTION_TOLERANCE = 8; // pixels na escala 1:1
let currentSnapIndicator = null;
let currentClosureIndicator = null;

/**
 * Cria uma nova linha livre decorativa (ou forma geométrica).
 * @param {number[]} startPoint - [x, y] inicial
 * @param {number[]} endPoint - [x, y] final
 * @param {string} [color] - Cor da linha
 * @param {string|null} [parentAreaId] - ID da área pai
 * @param {string} [shapeType] - Tipo: 'line', 'rectangle', 'circle', 'triangle'
 * @returns {object}
 */
export function createFreeLine(startPoint, endPoint, color = freeLineDefaultColor, parentAreaId = null, shapeType = 'line') {
    if (!Array.isArray(startPoint) || !Array.isArray(endPoint)) {
        return null;
    }

    const line = {
        id: generateId(ID_PREFIXES.FREE_LINE),
        startPoint: [startPoint[0], startPoint[1]],
        endPoint: [endPoint[0], endPoint[1]],
        color: color || freeLineDefaultColor,
        width: freeLineLineWidth,
        shapeType: shapeType || 'line',
        parentAreaId: parentAreaId ?? null
    };
    return shapeType === 'dimension' ? attachDimensionEndpoints(line, startPoint, endPoint) : line;
}

/**
 * Adiciona uma linha ao estado global.
 * @param {object} line
 */
export function addFreeLine(line) {
    if (line) {
        freeLines.push(line);
    }
}

/**
 * Remove uma linha livre pelo ID.
 * @param {number} lineId
 * @returns {boolean}
 */
export function removeFreeLine(lineId) {
    const index = freeLines.findIndex(line => line.id === lineId);
    if (index !== -1) {
        freeLines.splice(index, 1);
        return true;
    }
    return false;
}

/**
 * Remove uma linha livre ou apenas o sub-segmento selecionado.
 * Se há um sub-segmento ativo, remove apenas essa porção e cria 
 * novas linhas para as partes restantes.
 * @param {string} lineId - ID da linha livre
 * @param {{ tStart: number, tEnd: number }|null} subSegment - Sub-segmento a remover
 * @returns {boolean}
 */
export function removeFreeLineSubSegment(lineId, subSegment) {
    const index = freeLines.findIndex(line => line.id === lineId);
    if (index === -1) return false;

    const line = freeLines[index];

    if (subSegment && (!line.shapeType || line.shapeType === 'line')) {
        const remaining = getRemainingSubSegments(line, subSegment, 'freeline');
        
        // Remover a linha original
        freeLines.splice(index, 1);
        
        // Criar novas linhas para os segmentos restantes
        for (const seg of remaining) {
            const newLine = createFreeLine(
                seg.startPoint, seg.endPoint,
                line.color, line.parentAreaId, line.shapeType
            );
            if (newLine) {
                newLine.width = line.width;
                freeLines.push(newLine);
            }
        }
        return true;
    } else {
        // Sem sub-segmento — remover a linha inteira
        freeLines.splice(index, 1);
        return true;
    }
}

/**
 * Atualiza a largura de uma linha livre.
 * @param {object} line
 * @returns {number}
 */
function getLineWidth(line) {
    return line?.width || freeLineLineWidth;
}

/**
 * Desenha uma forma geométrica individual no canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} line - Objeto da linha/forma
 * @param {number} scale
 */
function drawShape(ctx, line, scale) {
    if (line.shapeType === 'dimension') syncDimensionEndpoints(line);
    const shapeType = line.shapeType || 'line';
    const sx = line.startPoint[0];
    const sy = line.startPoint[1];
    const ex = line.endPoint[0];
    const ey = line.endPoint[1];

    ctx.beginPath();

    switch (shapeType) {
        case 'dimension': {
            drawDimensionShape(ctx, sx, sy, ex, ey, scale, line);
            return;
        }
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
        case 'line':
        default:
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            break;
    }
    ctx.stroke();
}

function drawDimensionShape(ctx, sx, sy, ex, ey, scale, line = null) {
    const dx = ex - sx;
    const dy = ey - sy;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;

    const angle = Math.atan2(dy, dx);
    const arrowSize = 9 / scale;
    const text = formatLength(length / pixelsPerCm);
    const previousStroke = ctx.strokeStyle;

    ctx.save();
    ctx.strokeStyle = '#007aff';
    ctx.fillStyle = '#007aff';
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    [
        [sx, sy, angle],
        [ex, ey, angle + Math.PI]
    ].forEach(([x, y, direction]) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(direction - 0.55) * arrowSize, y + Math.sin(direction - 0.55) * arrowSize);
        ctx.lineTo(x + Math.cos(direction + 0.55) * arrowSize, y + Math.sin(direction + 0.55) * arrowSize);
        ctx.closePath();
        ctx.fill();
    });

    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;
    const fontSize = 12 / scale;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const paddingX = 7 / scale;
    const paddingY = 4 / scale;
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fillRect(midX - textWidth / 2 - paddingX, midY - fontSize / 2 - paddingY, textWidth + paddingX * 2, fontSize + paddingY * 2);
    ctx.strokeStyle = 'rgba(0, 122, 255, 0.28)';
    ctx.strokeRect(midX - textWidth / 2 - paddingX, midY - fontSize / 2 - paddingY, textWidth + paddingX * 2, fontSize + paddingY * 2);
    ctx.fillStyle = '#0a63c9';
    ctx.fillText(text, midX, midY);
    [
        [sx, sy, Boolean(line?.startAnchor)],
        [ex, ey, Boolean(line?.endAnchor)]
    ].forEach(([x, y, linked]) => {
        if (!linked) return;
        ctx.beginPath();
        ctx.arc(x, y, 4.5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = '#007aff';
        ctx.stroke();
    });
    ctx.restore();
    ctx.strokeStyle = previousStroke;
}

/**
 * Desenha todas as linhas livres existentes.
 */
export function drawFreeLines() {
    const ctx = getCtx();
    if (!ctx || freeLines.length === 0) {
        return;
    }

    const scale = getScale();
    const selectedId = getSelectedFreeLineId();
    const hoveredId = getHoveredFreeLineId();
    const selectedSub = getSelectedFreeLineSubSegment();
    const hoveredSub = getHoveredFreeLineSubSegment();

    ctx.save();
    ctx.lineCap = 'round';

    for (const line of freeLines) {
        if (line.shapeType === 'dimension') syncDimensionEndpoints(line);
        const isSelected = line.id === selectedId;
        const isHovered = line.id === hoveredId;
        const isLine = !line.shapeType || line.shapeType === 'line';
        const activeSub = isSelected ? selectedSub : (isHovered ? hoveredSub : null);

        if (activeSub && isLine) {
            // Desenhar a linha inteira na cor base
            const width = getLineWidth(line) / scale;
            ctx.strokeStyle = line.color || freeLineDefaultColor;
            ctx.lineWidth = width;
            drawShape(ctx, line, scale);

            // Sobrepor o sub-segmento com a cor de destaque
            const highlightColor = isSelected ? freeLineSelectedColor : freeLineHoverColor;
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = width * 1.3;
            ctx.beginPath();
            ctx.moveTo(activeSub.startPoint[0], activeSub.startPoint[1]);
            ctx.lineTo(activeSub.endPoint[0], activeSub.endPoint[1]);
            ctx.stroke();
        } else {
            const strokeColor = isSelected
                ? freeLineSelectedColor
                : isHovered
                    ? freeLineHoverColor
                    : line.color || freeLineDefaultColor;
            const width = getLineWidth(line) / scale;

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = width;
            drawShape(ctx, line, scale);
        }
    }

    ctx.restore();
}

/**
 * Desenha o preview da linha/forma enquanto o usuário está desenhando.
 */
export function drawFreeLinePreview() {
    if (!getIsDrawingFreeLine()) {
        return;
    }

    const ctx = getCtx();
    if (!ctx) {
        return;
    }

    const start = getFreeLineStartPoint();
    const end = getFreeLinePreviewEnd();
    if (!start || !end) {
        return;
    }

    const scale = getScale();
    const shapeMode = getFreeLineShapeMode();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = freeLinePreviewColor;
    ctx.lineWidth = freeLineLineWidth / scale;
    ctx.setLineDash([6 / scale, 6 / scale]);

    // Draw shape preview
    const previewObj = { startPoint: start, endPoint: end, shapeType: shapeMode };
    drawShape(ctx, previewObj, scale);

    // Snap/closure indicators only for line mode
    if (shapeMode === 'line') {
        const snapInfo = currentSnapIndicator;
        const closureInfo = currentClosureIndicator;
        const showIndicator = Boolean(snapInfo && snapInfo.snapped);
        const showClosure = Boolean(closureInfo && closureInfo.visible);

        if (showIndicator) {
            ctx.setLineDash([]);
            ctx.fillStyle = freeLineSnapIndicatorColor;
            ctx.strokeStyle = freeLineSnapIndicatorColor;
            const radius = freeLineSnapIndicatorRadius / scale;

            ctx.beginPath();
            ctx.arc(end[0], end[1], radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(start[0], start[1]);
            ctx.lineTo(end[0], end[1]);
            ctx.stroke();
        }

        if (showClosure) {
            const closureStart = closureInfo.start || start;
            const closureTarget = closureInfo.target || end;
            const highlightPoint = closureInfo.highlight || closureTarget;

            ctx.setLineDash([6 / scale, 6 / scale]);
            ctx.strokeStyle = freeLineClosureGuideColor;
            ctx.beginPath();
            ctx.moveTo(closureStart[0], closureStart[1]);
            ctx.lineTo(closureTarget[0], closureTarget[1]);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.fillStyle = freeLineClosureGuideColor;
            ctx.beginPath();
            ctx.arc(highlightPoint[0], highlightPoint[1], freeLineSnapIndicatorRadius / scale, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

/**
 * Calcula a distância de um ponto a um segmento de reta.
 */
function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
        return Math.hypot(px - x1, py - y1);
    }

    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    const projX = x1 + clampedT * dx;
    const projY = y1 + clampedT * dy;
    return Math.hypot(px - projX, py - projY);
}

/**
 * Calcula a distância mínima de um ponto ao contorno de uma forma.
 */
function distanceToShape(px, py, line) {
    const shapeType = line.shapeType || 'line';
    const sx = line.startPoint[0];
    const sy = line.startPoint[1];
    const ex = line.endPoint[0];
    const ey = line.endPoint[1];

    switch (shapeType) {
        case 'rectangle': {
            const x = Math.min(sx, ex);
            const y = Math.min(sy, ey);
            const w = Math.abs(ex - sx);
            const h = Math.abs(ey - sy);
            // Distance to 4 edges
            const edges = [
                [x, y, x + w, y],
                [x + w, y, x + w, y + h],
                [x + w, y + h, x, y + h],
                [x, y + h, x, y]
            ];
            let minDist = Infinity;
            for (const [x1, y1, x2, y2] of edges) {
                minDist = Math.min(minDist, distancePointToSegment(px, py, x1, y1, x2, y2));
            }
            return minDist;
        }
        case 'circle': {
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const rx = Math.abs(ex - sx) / 2;
            const ry = Math.abs(ey - sy) / 2;
            if (rx === 0 || ry === 0) return Math.hypot(px - cx, py - cy);
            // Normalized distance to ellipse border
            const normX = (px - cx) / rx;
            const normY = (py - cy) / ry;
            const normDist = Math.sqrt(normX * normX + normY * normY);
            if (normDist === 0) return Math.min(rx, ry);
            const borderX = cx + rx * normX / normDist;
            const borderY = cy + ry * normY / normDist;
            return Math.hypot(px - borderX, py - borderY);
        }
        case 'triangle': {
            const midTopX = (sx + ex) / 2;
            const topY = Math.min(sy, ey);
            const bottomY = Math.max(sy, ey);
            const leftX = Math.min(sx, ex);
            const rightX = Math.max(sx, ex);
            const edges = [
                [midTopX, topY, leftX, bottomY],
                [leftX, bottomY, rightX, bottomY],
                [rightX, bottomY, midTopX, topY]
            ];
            let minDist = Infinity;
            for (const [x1, y1, x2, y2] of edges) {
                minDist = Math.min(minDist, distancePointToSegment(px, py, x1, y1, x2, y2));
            }
            return minDist;
        }
        case 'dimension':
        case 'line':
        default:
            return distancePointToSegment(px, py, sx, sy, ex, ey);
    }
}

/**
 * Encontra uma linha livre próxima a um ponto.
 * @param {number} x
 * @param {number} y
 * @param {number} [tolerancePx=BASE_SELECTION_TOLERANCE]
 * @returns {object|null}
 */
export function findFreeLineAtPosition(x, y, tolerancePx = BASE_SELECTION_TOLERANCE) {
    const scale = getScale();
    const effectiveTolerance = tolerancePx / scale;
    let closestLine = null;
    let closestDistance = Infinity;

    for (const line of freeLines) {
        if (line.shapeType === 'dimension') syncDimensionEndpoints(line);
        const distance = distanceToShape(x, y, line);

        if (distance <= effectiveTolerance && distance < closestDistance) {
            closestLine = line;
            closestDistance = distance;
        }
    }

    return closestLine;
}

export function getDimensionAnchorSnap(point) {
    const match = findDimensionAnchor(point);
    if (!match) return null;
    return {
        point: [...match.point],
        snapped: true,
        type: 'dimension-anchor',
        data: match
    };
}

/**
 * Atualiza a cor de uma linha livre selecionada.
 * @param {number} lineId
 * @param {string} color
 */
export function updateFreeLineColor(lineId, color) {
    const line = freeLines.find(l => l.id === lineId);
    if (line && typeof color === 'string') {
        line.color = color;
        return true;
    }

    return false;
}

export function setFreeLineSnapIndicator(info) {
    currentSnapIndicator = info;
}

export function clearFreeLineSnapIndicator() {
    currentSnapIndicator = null;
}

export function setFreeLineClosureIndicator(info) {
    currentClosureIndicator = info;
}

export function clearFreeLineClosureIndicator() {
    currentClosureIndicator = null;
}

function isPointInsideAreaGeometry(point, vertices, rings) {
    if (!point || !vertices || vertices.length < 3) {
        return false;
    }

    const insideOuter = pointInPolygon(point, vertices);
    if (!insideOuter) {
        return false;
    }

    if (!Array.isArray(rings) || rings.length === 0) {
        return true;
    }

    for (const ring of rings) {
        if (Array.isArray(ring) && ring.length >= 3 && pointInPolygon(point, ring)) {
            return false;
        }
    }

    return true;
}

export function moveFreeLinesWithArea(areaId, deltaX, deltaY, options = {}) {
    if (!deltaX && !deltaY) {
        return 0;
    }

    const {
        verticesBeforeMove = null,
        ringsBeforeMove = null
    } = options;

    const areaIdString = areaId !== null && areaId !== undefined ? String(areaId) : null;
    let movedCount = 0;

    for (const line of freeLines) {
        if (!line) continue;

        let belongsToArea = false;

        if (areaIdString !== null && line.parentAreaId !== undefined && line.parentAreaId !== null) {
            if (String(line.parentAreaId) === areaIdString) {
                belongsToArea = true;
            }
        }

        if (!belongsToArea && verticesBeforeMove && verticesBeforeMove.length >= 3) {
            const startInside = isPointInsideAreaGeometry(line.startPoint, verticesBeforeMove, ringsBeforeMove);
            const endInside = isPointInsideAreaGeometry(line.endPoint, verticesBeforeMove, ringsBeforeMove);
            if (startInside && endInside) {
                belongsToArea = true;
                if (areaIdString !== null && (line.parentAreaId === null || line.parentAreaId === undefined)) {
                    line.parentAreaId = areaId;
                }
            }
        }

        if (belongsToArea) {
            line.startPoint[0] += deltaX;
            line.startPoint[1] += deltaY;
            line.endPoint[0] += deltaX;
            line.endPoint[1] += deltaY;
            movedCount++;
        }
    }

    return movedCount;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function normalizeAngle(angle) {
    let normalized = angle % (Math.PI * 2);
    if (normalized > Math.PI) {
        normalized -= Math.PI * 2;
    } else if (normalized <= -Math.PI) {
        normalized += Math.PI * 2;
    }
    return normalized;
}

function getFreeLineEndpointSnap(currentPoint, startPoint) {
    const scale = getScale();
    const threshold = freeLineSnapRadius / Math.max(scale, 0.0001);
    let closest = null;
    let closestDistance = threshold + 1;

    for (const line of freeLines) {
        const endpoints = [line.startPoint, line.endPoint];
        for (const endpoint of endpoints) {
            if (startPoint && Math.hypot(endpoint[0] - startPoint[0], endpoint[1] - startPoint[1]) < 0.01) {
                continue;
            }

            const distance = Math.hypot(currentPoint[0] - endpoint[0], currentPoint[1] - endpoint[1]);
            if (distance <= threshold && distance < closestDistance) {
                closest = {
                    point: [endpoint[0], endpoint[1]],
                    lineId: line.id,
                    distance
                };
                closestDistance = distance;
            }
        }
    }

    return closest;
}

function getAngleSnappedPoint(startPoint, currentPoint) {
    if (!freeLineAngleSnapEnabled || !startPoint) {
        return { point: currentPoint, snapped: false };
    }

    const dx = currentPoint[0] - startPoint[0];
    const dy = currentPoint[1] - startPoint[1];
    const length = Math.hypot(dx, dy);
    if (length < freeLineMinAngleSnapLength) {
        return { point: currentPoint, snapped: false };
    }

    const angle = Math.atan2(dy, dx);
    const increment = toRadians(freeLineAngleSnapIncrementDeg);
    const tolerance = toRadians(freeLineAngleSnapToleranceDeg);

    if (increment <= 0) {
        return { point: currentPoint, snapped: false };
    }

    const snappedMultiple = Math.round(angle / increment);
    const snappedAngle = snappedMultiple * increment;
    const angleDiff = normalizeAngle(angle - snappedAngle);

    if (Math.abs(angleDiff) > tolerance) {
        return { point: currentPoint, snapped: false };
    }

    const snappedPoint = [
        startPoint[0] + Math.cos(snappedAngle) * length,
        startPoint[1] + Math.sin(snappedAngle) * length
    ];

    return {
        point: snappedPoint,
        snapped: true,
        angle: snappedAngle,
        difference: angleDiff
    };
}

export function getSnappedFreeLinePoint(startPoint, currentPoint, options = {}) {
    const {
        allowEndpointSnap = true,
        allowAngleSnap = true,
        ignoreSameAsStart = true
    } = options;

    if (!Array.isArray(currentPoint)) {
        return { point: currentPoint, snapped: false };
    }

    if (getIsCtrlPressed()) {
        return { point: currentPoint, snapped: false, bypassed: true };
    }

    if (allowEndpointSnap) {
        const referenceStart = ignoreSameAsStart ? startPoint : null;
        const endpointSnap = getFreeLineEndpointSnap(currentPoint, referenceStart);
        if (endpointSnap) {
            return {
                point: endpointSnap.point,
                snapped: true,
                type: 'endpoint',
                data: endpointSnap
            };
        }
    }

    if (allowAngleSnap && startPoint) {
        const angleSnap = getAngleSnappedPoint(startPoint, currentPoint);
        if (angleSnap.snapped) {
            return {
                point: angleSnap.point,
                snapped: true,
                type: 'angle',
                data: angleSnap
            };
        }
    }

    if (startPoint) {
        const scale = getScale();
        const threshold = freeLineClosureSnapRadius / Math.max(scale, 0.0001);
        const distance = Math.hypot(currentPoint[0] - startPoint[0], currentPoint[1] - startPoint[1]);

        if (distance <= threshold && distance > 0.0001) {
            return {
                point: [startPoint[0], startPoint[1]],
                snapped: true,
                type: 'closure',
                data: { distance }
            };
        }
    }

    return { point: currentPoint, snapped: false };
}
