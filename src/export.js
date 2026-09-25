// Módulo de Exportação - Funcionalidades para exportar layouts
// Replicação exata da renderização visual do canvas principal

import { 
    getCanvas, 
    movementAreas,
    walls,
    resources,
    openings,
    freeLines,
    getScale,
    getOffsetXCanvas,
    getOffsetYCanvas,
    getAllFloors,
    getFloorById,
    getCurrentFloorId,
    setActiveFloor,
    getFloorsMeta,
    getConnections
} from './state.js';
import { 
    pixelsPerCm, 
    dimensionLineWidth, 
    dimensionFontSize,
    dimensionOffset,
    dimensionTickSize,
    gridSpacingPx,
    majorGridSpacingPx,
    floatTolerance,
    getGlobalShowDimensions,
    DIMENSION_SYSTEM,
    getDimensionColor,
    wallDimensionColor
} from './config.js';
import { calculateBoundingBox, rectangleToVertices } from './areas.js';
import { computeResourceLabelGeometry } from './drawing.js';
import { getResourceImage } from './resource-image.js';
import { formatLength } from './measurement-units.js';

/**
 * Configurações de exportação
 */
const EXPORT_CONFIG = {
    pdf: {
        format: 'a4',
        orientation: 'landscape',
        margin: 10, // mm
        quality: 1.0,
        maxWidth: 277, // mm (A4 landscape width - margens)
        maxHeight: 190, // mm (A4 landscape height - margens)
        dpi: 300,
        maxScale: 50, // Aumentado para permitir expansão em formatos maiores
        formats: {
            'a4': { width: 210, height: 297 },
            'a3': { width: 297, height: 420 },
            'a2': { width: 420, height: 594 },
            'a1': { width: 594, height: 841 }
        }
    },
    image: {
        format: 'png',
        quality: 1.0,
        maxWidth: 3508, // pixels (A4 at 300 DPI)
        maxHeight: 2480,
        background: '#ffffff',
        maxScale: 8
    }
};

const EXPORT_DIMENSION_FONT_SCALE = 1.4;

let CURRENT_EXPORT_VIEW_SCALE = 1;

function updateExportViewScale() {
    const scaleValue = typeof getScale === 'function' ? Number(getScale()) : 1;
    if (Number.isFinite(scaleValue) && scaleValue > 0) {
        CURRENT_EXPORT_VIEW_SCALE = scaleValue;
    } else {
        CURRENT_EXPORT_VIEW_SCALE = 1;
    }
    return CURRENT_EXPORT_VIEW_SCALE;
}

function getExportViewScale() {
    return CURRENT_EXPORT_VIEW_SCALE || 1;
}

function getScaledLineWidth(value, minimum = 0) {
    const viewScale = getExportViewScale();
    const scaled = value / viewScale;
    return minimum > 0 ? Math.max(minimum, scaled) : scaled;
}

function getScaledFontSize(value) {
    const viewScale = getExportViewScale();
    return Math.max(1, value / viewScale);
}

function getScaledPadding(value = 2) {
    const viewScale = getExportViewScale();
    return Math.max(1, value / viewScale);
}

/**
 * Calcula os limites exatos do conteúdo incluindo paredes e recursos
 * @returns {Object} Objeto com minX, minY, maxX, maxY, width, height
 */
function getContentBounds() {
    const canvas = getCanvas();
    if (!canvas || (movementAreas.length === 0 && walls.length === 0 && resources.length === 0)) {
        return {
            minX: 0,
            minY: 0,
            maxX: canvas ? canvas.width : 800,
            maxY: canvas ? canvas.height : 600,
            width: canvas ? canvas.width : 800,
            height: canvas ? canvas.height : 600
        };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Calcular limites das áreas de movimentação
    movementAreas.forEach(area => {
        if (area.vertices && area.vertices.length > 0) {
            area.vertices.forEach(([x, y]) => {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            });
        } else {
            // Tratamento para áreas retangulares
            minX = Math.min(minX, area.x);
            minY = Math.min(minY, area.y);
            maxX = Math.max(maxX, area.x + area.width);
            maxY = Math.max(maxY, area.y + area.height);
        }
    });

    // Calcular limites das paredes
    if (walls && walls.length > 0) {
        walls.forEach(wall => {
            if (wall.startPoint && wall.endPoint) {
                minX = Math.min(minX, wall.startPoint[0], wall.endPoint[0]);
                minY = Math.min(minY, wall.startPoint[1], wall.endPoint[1]);
                maxX = Math.max(maxX, wall.startPoint[0], wall.endPoint[0]);
                maxY = Math.max(maxY, wall.startPoint[1], wall.endPoint[1]);
            }
        });
    }

    // Calcular limites dos recursos
    if (resources && resources.length > 0) {
        resources.forEach(resource => {
            if (!resource.visible) return;
            
            if (resource.vertices && resource.vertices.length > 0) {
                resource.vertices.forEach(([x, y]) => {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                });
            } else {
                minX = Math.min(minX, resource.x);
                minY = Math.min(minY, resource.y);
                maxX = Math.max(maxX, resource.x + resource.width);
                maxY = Math.max(maxY, resource.y + resource.height);
            }
        });
    }

    // Adicionar margem para cotas e elementos extras
    const margin = 80; // pixels - margem maior para acomodar cotas
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function getViewportBounds() {
    const canvas = getCanvas();
    if (!canvas) {
        return getContentBounds();
    }

    const scaleValue = typeof getScale === 'function' ? Number(getScale()) : 1;
    const viewScale = Number.isFinite(scaleValue) && scaleValue > 0 ? scaleValue : 1;
    const offsetX = typeof getOffsetXCanvas === 'function' ? Number(getOffsetXCanvas()) : 0;
    const offsetY = typeof getOffsetYCanvas === 'function' ? Number(getOffsetYCanvas()) : 0;

    const widthWorld = canvas.width / viewScale;
    const heightWorld = canvas.height / viewScale;

    let minX = -offsetX;
    let minY = -offsetY;
    let maxX = minX + widthWorld;
    let maxY = minY + heightWorld;

    const margin = dimensionOffset * 2;
    if (margin > 0) {
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;
    }

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function getExportBounds(options = {}) {
    const matchViewport = options.matchViewport ?? true;
    if (matchViewport) {
        const viewportBounds = getViewportBounds();
        if (viewportBounds && viewportBounds.width > 0 && viewportBounds.height > 0) {
            return viewportBounds;
        }
    }
    // Multi-floor bounds
    if (options.floorIds && options.floorIds.length > 1) {
        return getMultiFloorContentBounds(options.floorIds);
    }
    return getContentBounds();
}

/**
 * Desenha grid exatamente como aparece no canvas principal
 */
function drawExportGrid(ctx, area, scale) {
    if (!area || !area.vertices || area.vertices.length < 3) return;
    
    ctx.save();
    
    // Criar path de clipping para confinar o grid à área
    ctx.beginPath();
    ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
    for (let i = 1; i < area.vertices.length; i++) {
        ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
    }
    ctx.closePath();
    ctx.clip();
    
    // Usar a área como bounding box
    const bb = calculateBoundingBox(area.vertices);
    
    // Calcular limites do grid
    const scaledGridSpacingPx = gridSpacingPx;
    const scaledMajorGridSpacingPx = majorGridSpacingPx;
    
    const startGridX = Math.floor((bb.x - 1) / scaledGridSpacingPx) * scaledGridSpacingPx;
    const endGridX = Math.ceil((bb.x + bb.width + 1) / scaledGridSpacingPx) * scaledGridSpacingPx;
    const startGridY = Math.floor((bb.y - 1) / scaledGridSpacingPx) * scaledGridSpacingPx;
    const endGridY = Math.ceil((bb.y + bb.height + 1) / scaledGridSpacingPx) * scaledGridSpacingPx;
    
    // Linhas verticais do grid
    for (let x = startGridX; x <= endGridX; x += scaledGridSpacingPx) {
        const isMajor = (Math.abs(x % scaledMajorGridSpacingPx) < floatTolerance || 
                        Math.abs(scaledMajorGridSpacingPx - (x % scaledMajorGridSpacingPx)) < floatTolerance);
        
    ctx.beginPath(); 
    ctx.moveTo(x, bb.y); 
    ctx.lineTo(x, bb.y + bb.height);
    ctx.lineWidth = getScaledLineWidth(isMajor ? 1 : 0.5, 0.15);
        ctx.strokeStyle = isMajor ? "#CCCCCC" : "#E0E0E0"; 
        ctx.stroke();
    }
    
    // Linhas horizontais do grid
    for (let y = startGridY; y <= endGridY; y += scaledGridSpacingPx) {
        const isMajor = (Math.abs(y % scaledMajorGridSpacingPx) < floatTolerance || 
                        Math.abs(scaledMajorGridSpacingPx - (y % scaledMajorGridSpacingPx)) < floatTolerance);
        
    ctx.beginPath(); 
    ctx.moveTo(bb.x, y); 
    ctx.lineTo(bb.x + bb.width, y);
    ctx.lineWidth = getScaledLineWidth(isMajor ? 1 : 0.5, 0.15);
        ctx.strokeStyle = isMajor ? "#CCCCCC" : "#E0E0E0"; 
        ctx.stroke();
    }
    
    ctx.restore();
}

/**
 * Desenha áreas exatamente como no canvas principal
 */
function drawExportMovementArea(ctx, area, scale) {
    if (!area) return;
    
    ctx.save();
    
    // Verificar vértices válidos
    if (area.vertices && area.vertices.length < 3) {
        ctx.restore();
        return;
    }
    
    // Definir cores e preenchimento
    ctx.fillStyle = '#FFFFFF';
    
    if (area.rings && area.rings.length > 0) {
        // 1. Primeiro desenhar apenas o contorno externo preenchido
        ctx.beginPath();
        const outerRing = area.rings[0];
        if (outerRing && outerRing.length > 0) {
            ctx.moveTo(outerRing[0][0], outerRing[0][1]);
            for (let i = 1; i < outerRing.length; i++) {
                ctx.lineTo(outerRing[i][0], outerRing[i][1]);
            }
            ctx.closePath();
            ctx.fill();
        }
        
        // 2. Desenhar o grid APENAS no contorno externo
        drawExportGrid(ctx, area, scale);
        
        // 3. "Cortar" os buracos usando composite operation
        if (area.rings.length > 1) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = '#000000';
            
            for (let i = 1; i < area.rings.length; i++) {
                const holeRing = area.rings[i];
                if (holeRing && holeRing.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(holeRing[0][0], holeRing[0][1]);
                    for (let j = 1; j < holeRing.length; j++) {
                        ctx.lineTo(holeRing[j][0], holeRing[j][1]);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            }
            ctx.restore();
        }
    } else if (area.vertices && area.vertices.length > 0) {
        // Para áreas definidas apenas por vértices (sem rings)
        ctx.beginPath();
        ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) {
            ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        
        // Desenhar grid APÓS o preenchimento, mas ANTES do contorno
        drawExportGrid(ctx, area, scale);
    } else {
        // Fallback para retângulos simples
        ctx.fillRect(area.x, area.y, area.width, area.height);
        // Para retângulos, criar vértices temporários para o grid
        const tempArea = { vertices: rectangleToVertices(area.x, area.y, area.width, area.height) };
        drawExportGrid(ctx, tempArea, scale);
    }
    
    ctx.strokeStyle = area.locked ? '#A0A0A0' : '#333333';
    ctx.lineWidth = getScaledLineWidth(2, 0.3);
    
    // O stroke deve ser apenas no contorno externo
    ctx.beginPath();
    if (area.vertices && area.vertices.length > 0) {
        ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) {
            ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
    } else if (!area.rings) {
        ctx.strokeRect(area.x, area.y, area.width, area.height);
    }
    
    // Desenhar contorno dos buracos se existirem
    if (area.rings && area.rings.length > 1) {
        for (let i = 1; i < area.rings.length; i++) {
            const holeRing = area.rings[i];
            if (holeRing && holeRing.length > 0) {
                ctx.beginPath();
                ctx.moveTo(holeRing[0][0], holeRing[0][1]);
                for (let j = 1; j < holeRing.length; j++) {
                    ctx.lineTo(holeRing[j][0], holeRing[j][1]);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
    }
    
    ctx.restore();
}

/**
 * Desenha paredes exatamente como no canvas principal
 */
function drawExportWalls(ctx, walls, scale) {
    if (!walls || walls.length === 0) return;
    
    ctx.save();
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = getScaledLineWidth(3, 0.4);
    
    walls.forEach(wall => {
        if (wall.startPoint && wall.endPoint) {
            ctx.beginPath();
            ctx.moveTo(wall.startPoint[0], wall.startPoint[1]);
            ctx.lineTo(wall.endPoint[0], wall.endPoint[1]);
            ctx.stroke();
        }
    });
    
    ctx.restore();
}

/**
 * Desenha as cotas das paredes na exportação
 */
function drawExportWallDimensions(ctx, wallsList, scale) {
    if (!getGlobalShowDimensions() || !wallsList || wallsList.length === 0) return;

    ctx.save();
    const dimColor = '#555555';
    ctx.strokeStyle = dimColor;
    ctx.fillStyle = dimColor;

    const fontConfig = DIMENSION_SYSTEM.getFontConfig('walls', 1.0);
    const wallFontFamily = fontConfig.family || 'Arial';
    const wallFontBaseSize = fontConfig.size;

    const arrowSize = dimensionTickSize;
    const offset = dimensionOffset * 0.8;

    wallsList.forEach(wall => {
        if (!wall || !wall.startPoint || !wall.endPoint) return;

        const [x1, y1] = wall.startPoint;
        const [x2, y2] = wall.endPoint;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const segmentLength = Math.sqrt(dx * dx + dy * dy);

        if (segmentLength < floatTolerance) return;

        const lengthCm = Math.round((segmentLength / pixelsPerCm) * 10) / 10;
        if (lengthCm < 1) return; // Skip very small walls for cleaner output

        const label = formatLength(lengthCm);
        drawExportTickDimension(ctx, [x1, y1], [x2, y2], label, {
            offset,
            arrowSize,
            color: dimColor,
            fontSize: wallFontBaseSize,
            fontFamily: wallFontFamily,
            lineWidth: Math.max(0.5, dimensionLineWidth)
        });
    });

    ctx.restore();
}

function drawExportTickDimension(ctx, startPoint, endPoint, label, options = {}) {
    if (!startPoint || !endPoint || !label) return;

    const viewScale = getExportViewScale();
    const {
        offset = dimensionOffset,
        arrowSize = dimensionTickSize,
        color = '#555555',
        lineWidth = Math.max(0.5, dimensionLineWidth),
        fontSize = dimensionFontSize,
        fontFamily = 'Arial',
        padding = 3,
        _normalOverride = null
    } = options;

    const [x1, y1] = startPoint;
    const [x2, y2] = endPoint;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (!isFinite(segmentLength) || segmentLength < floatTolerance) return;

    // Direction along the segment
    const ux = dx / segmentLength;
    const uy = dy / segmentLength;
    // Normal (perpendicular) to the segment - use override if provided
    let nx = _normalOverride ? _normalOverride.nx : -uy;
    let ny = _normalOverride ? _normalOverride.ny : ux;

    const scaledOffset = offset / viewScale;
    const extensionGap = 2 / viewScale; // gap between element and extension line
    const extensionOvershoot = 3 / viewScale; // overshoot past dimension line

    // Dimension line endpoints (offset from segment)
    const c1x = x1 + nx * scaledOffset;
    const c1y = y1 + ny * scaledOffset;
    const c2x = x2 + nx * scaledOffset;
    const c2y = y2 + ny * scaledOffset;

    ctx.save();
    const dimColor = color;
    ctx.strokeStyle = dimColor;
    ctx.fillStyle = dimColor;
    ctx.lineWidth = getScaledLineWidth(lineWidth, 0.15);
    ctx.lineCap = 'round';

    // Extension lines (with gap near element)
    const gapStartX1 = x1 + nx * extensionGap;
    const gapStartY1 = y1 + ny * extensionGap;
    const gapStartX2 = x2 + nx * extensionGap;
    const gapStartY2 = y2 + ny * extensionGap;
    const extEndX1 = c1x + nx * extensionOvershoot;
    const extEndY1 = c1y + ny * extensionOvershoot;
    const extEndX2 = c2x + nx * extensionOvershoot;
    const extEndY2 = c2y + ny * extensionOvershoot;

    ctx.beginPath();
    ctx.moveTo(gapStartX1, gapStartY1);
    ctx.lineTo(extEndX1, extEndY1);
    ctx.moveTo(gapStartX2, gapStartY2);
    ctx.lineTo(extEndX2, extEndY2);
    ctx.stroke();

    // Dimension line
    ctx.beginPath();
    ctx.moveTo(c1x, c1y);
    ctx.lineTo(c2x, c2y);
    ctx.stroke();

    // Tick marks (oblique 45° ticks at each end — CAD standard)
    const tickLen = Math.max(3, arrowSize * 0.9) / viewScale;
    ctx.lineWidth = getScaledLineWidth(lineWidth * 1.5, 0.25);
    ctx.beginPath();
    // Tick at c1 — 45° oblique line crossing the dimension line
    ctx.moveTo(c1x - (ux + nx) * tickLen * 0.5, c1y - (uy + ny) * tickLen * 0.5);
    ctx.lineTo(c1x + (ux + nx) * tickLen * 0.5, c1y + (uy + ny) * tickLen * 0.5);
    // Tick at c2
    ctx.moveTo(c2x - (ux + nx) * tickLen * 0.5, c2y - (uy + ny) * tickLen * 0.5);
    ctx.lineTo(c2x + (ux + nx) * tickLen * 0.5, c2y + (uy + ny) * tickLen * 0.5);
    ctx.stroke();

    // Text label — centered on dimension line, rotated to follow it
    const scaledFontSize = getScaledFontSize(fontSize * EXPORT_DIMENSION_FONT_SCALE);
    const scaledPadding = getScaledPadding(padding);
    ctx.font = `600 ${scaledFontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const midX = (c1x + c2x) / 2;
    const midY = (c1y + c2y) / 2;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(midX, midY);

    // Rotate to follow the line but keep text readable (never upside-down)
    let textAngle = angle;
    if (textAngle > Math.PI / 2) textAngle -= Math.PI;
    if (textAngle < -Math.PI / 2) textAngle += Math.PI;
    ctx.rotate(textAngle);

    // Offset text slightly above the dimension line
    const textYOffset = -(scaledFontSize * 0.65);

    const metrics = ctx.measureText(label);
    const textW = metrics.width;
    const textH = scaledFontSize;

    // Background pill for readability
    const pillR = scaledPadding;
    const rx = -textW / 2 - scaledPadding;
    const ry = textYOffset - textH / 2 - scaledPadding;
    const rw = textW + scaledPadding * 2;
    const rh = textH + scaledPadding * 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, pillR);
    } else {
        // Fallback for browsers without roundRect
        const r = Math.min(pillR, rw / 2, rh / 2);
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + rw - r, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
        ctx.lineTo(rx + rw, ry + rh - r);
        ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
        ctx.lineTo(rx + r, ry + rh);
        ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
        ctx.lineTo(rx, ry + r);
        ctx.arcTo(rx, ry, rx + r, ry, r);
        ctx.closePath();
    }
    ctx.fill();

    ctx.fillStyle = dimColor;
    ctx.fillText(label, 0, textYOffset);

    ctx.restore();
    ctx.restore();
}

function getResourceBounds(resource) {
    if (!resource) return null;
    if (resource.vertices && resource.vertices.length > 0) {
        return calculateBoundingBox(resource.vertices);
    }
    if (typeof resource.x === 'number' && typeof resource.y === 'number' &&
        typeof resource.width === 'number' && typeof resource.height === 'number') {
        return {
            x: resource.x,
            y: resource.y,
            width: resource.width,
            height: resource.height
        };
    }
    return null;
}

function drawExportResourceDimensions(ctx, resourcesList, scale) {
    if (!getGlobalShowDimensions()) return;
    if (!resourcesList || resourcesList.length === 0) return;

    ctx.save();
    const offset = dimensionOffset * 0.6;
    const arrowSize = dimensionTickSize;
    const lineWidth = Math.max(0.5, dimensionLineWidth);
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('resources', 1.0);
    const resourceFontFamily = fontConfig.family || 'Arial';
    const resourceFontBaseSize = fontConfig.size;
    const dimColor = '#777777';

    resourcesList.forEach(resource => {
        if (!resource || resource.visible === false) return;

        // For polygon resources, only show width & height of bounding box (cleaner)
        const bounds = getResourceBounds(resource);
        if (!bounds) return;

        const widthCm = Math.round((bounds.width / pixelsPerCm) * 10) / 10;
        const heightCm = Math.round((bounds.height / pixelsPerCm) * 10) / 10;

        // Only annotate resources large enough to be meaningful
        if (widthCm < 5 && heightCm < 5) return;

        if (widthCm >= 5) {
            const p1 = [bounds.x, bounds.y + bounds.height];
            const p2 = [bounds.x + bounds.width, bounds.y + bounds.height];
            const text = formatLength(widthCm);
            drawExportTickDimension(ctx, p1, p2, text, {
                offset,
                arrowSize,
                color: dimColor,
                fontSize: resourceFontBaseSize,
                fontFamily: resourceFontFamily,
                lineWidth
            });
        }

        if (heightCm >= 5) {
            const p1 = [bounds.x + bounds.width, bounds.y];
            const p2 = [bounds.x + bounds.width, bounds.y + bounds.height];
            const text = formatLength(heightCm);
            drawExportTickDimension(ctx, p1, p2, text, {
                offset,
                arrowSize,
                color: dimColor,
                fontSize: resourceFontBaseSize,
                fontFamily: resourceFontFamily,
                lineWidth
            });
        }
    });

    ctx.restore();
}

/**
 * Desenha o nome de um recurso com fonte adaptativa para exportação
 * @param {CanvasRenderingContext2D} ctx - Contexto do canvas
 * @param {string} resourceName - Nome do recurso
 * @param {object} boundingBox - Bounding box do recurso {x, y, width, height}
 */
function isLightColorExport(hex) {
    if (!hex) return false;
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
}

function drawResourceNameAdaptiveExport(ctx, resourceName, boundingBox, resourceColor) {
    if (!resourceName || !resourceName.trim()) return;
    const viewScale = getExportViewScale();
    
    const padding = 4 / viewScale;
    const availableWidth = boundingBox.width - (padding * 2);
    const availableHeight = boundingBox.height - (padding * 2);
    
    // Área mínima necessária para mostrar texto
    if (availableWidth < 20 / viewScale || availableHeight < 12 / viewScale) {
        return; // Recurso muito pequeno para mostrar texto
    }
    
    // Calcular tamanho de fonte ideal
    const maxFontSize = Math.min(
        availableHeight * 0.6, // 60% da altura disponível
        DIMENSION_SYSTEM.maxFontSize / viewScale // Limite máximo ajustado
    );
    
    const minFontSize = Math.max(6 / viewScale, DIMENSION_SYSTEM.minFontSize / viewScale);
    
    let fontSize = maxFontSize;
    let textWidth;
    
    // Ajustar fonte iterativamente até caber
    do {
        ctx.font = `${fontSize}px Arial`;
        const metrics = ctx.measureText(resourceName);
        textWidth = metrics.width;
        
        if (textWidth <= availableWidth || fontSize <= minFontSize) {
            break;
        }
        
        fontSize *= 0.9; // Reduzir 10% a cada iteração
    } while (fontSize > minFontSize);
    
    // Se ainda não cabe, truncar o texto
    let finalText = resourceName;
    if (textWidth > availableWidth && fontSize <= minFontSize) {
        // Truncar texto com reticências
        const ellipsis = '...';
        const ellipsisWidth = ctx.measureText(ellipsis).width;
        const availableForText = availableWidth - ellipsisWidth;
        
        let truncatedText = resourceName;
        let truncatedWidth = ctx.measureText(truncatedText).width;
        
        while (truncatedWidth > availableForText && truncatedText.length > 1) {
            truncatedText = truncatedText.slice(0, -1);
            truncatedWidth = ctx.measureText(truncatedText).width;
        }
        
        finalText = truncatedText.length > 1 ? truncatedText + ellipsis : resourceName.charAt(0);
    }
    
    // Posicionamento centralizado
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const centerX = boundingBox.x + boundingBox.width / 2;
    const centerY = boundingBox.y + boundingBox.height / 2;
    
    // Desenhar sombra do texto para melhor legibilidade
    const shadowOffset = Math.max(1 / viewScale, 0.2);
    const light = isLightColorExport(resourceColor);
    ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(finalText, centerX + shadowOffset, centerY + shadowOffset);
    
    // Desenhar texto principal
    ctx.fillStyle = light ? '#000000' : '#ffffff';
    ctx.fillText(finalText, centerX, centerY);
}

/**
 * Desenha recursos exatamente como no canvas principal
 */
function drawExportResources(ctx, resources, scale) {
    if (!resources || resources.length === 0) return;
    
    ctx.save();
    const viewScale = getExportViewScale();
    
    const renderOrder = [
        ...resources.filter(resource => resource.machineType !== 'overhead-crane'),
        ...resources.filter(resource => resource.machineType === 'overhead-crane')
    ];

    renderOrder.forEach(resource => {
        if (!resource.visible) return;
        const machineResource = Boolean(resource.machineType);
        
        // Cor do recurso
        ctx.fillStyle = resource.color || '#ff6b35';
        
        // Desenhar o corpo do recurso
        if (resource.vertices && resource.vertices.length > 0) {
            // Desenhar como polígono
            ctx.beginPath();
            ctx.moveTo(resource.vertices[0][0], resource.vertices[0][1]);
            for (let i = 1; i < resource.vertices.length; i++) {
                ctx.lineTo(resource.vertices[i][0], resource.vertices[i][1]);
            }
            ctx.closePath();
            if (!machineResource) ctx.fill();
            
            // Desenhar imagem colada (clipped ao polígono)
            const resourceImg = getResourceImage(resource);
            if (resourceImg) {
                ctx.save();
                if (resource.machineType && resource.machineType !== 'overhead-crane') {
                    ctx.filter = 'grayscale(1) contrast(1.08)';
                }
                ctx.beginPath();
                ctx.moveTo(resource.vertices[0][0], resource.vertices[0][1]);
                for (let i = 1; i < resource.vertices.length; i++) {
                    ctx.lineTo(resource.vertices[i][0], resource.vertices[i][1]);
                }
                ctx.closePath();
                ctx.clip();

                const bb = calculateBoundingBox(resource.vertices);
                const rotation = (resource.rotation || 0) * Math.PI / 180;
                if (Math.abs(rotation) > 0.001) {
                    // Recurso rotacionado: calcular BB local (des-rotacionado)
                    let sumX = 0, sumY = 0;
                    for (const v of resource.vertices) { sumX += v[0]; sumY += v[1]; }
                    const cx = sumX / resource.vertices.length;
                    const cy = sumY / resource.vertices.length;
                    const cosR = Math.cos(-rotation);
                    const sinR = Math.sin(-rotation);
                    let minLX = Infinity, maxLX = -Infinity, minLY = Infinity, maxLY = -Infinity;
                    for (const v of resource.vertices) {
                        const dx = v[0] - cx;
                        const dy = v[1] - cy;
                        const lx = dx * cosR - dy * sinR;
                        const ly = dx * sinR + dy * cosR;
                        minLX = Math.min(minLX, lx);
                        maxLX = Math.max(maxLX, lx);
                        minLY = Math.min(minLY, ly);
                        maxLY = Math.max(maxLY, ly);
                    }
                    const localW = maxLX - minLX;
                    const localH = maxLY - minLY;
                    const localCX = (minLX + maxLX) / 2;
                    const localCY = (minLY + maxLY) / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate(rotation);
                    ctx.drawImage(resourceImg, localCX - localW / 2, localCY - localH / 2, localW, localH);
                } else {
                    ctx.drawImage(resourceImg, bb.x, bb.y, bb.width, bb.height);
                }
                ctx.restore();
            }
            
            // Borda do recurso
            if (!machineResource) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = getScaledLineWidth(1, 0.2);
                ctx.stroke();
            }
        } else {
            // Fallback para recursos retangulares
            if (!machineResource) ctx.fillRect(resource.x, resource.y, resource.width, resource.height);
            
            // Desenhar imagem colada (retangular)
            const resourceImgRect = getResourceImage(resource);
            if (resourceImgRect) {
                ctx.save();
                if (resource.machineType && resource.machineType !== 'overhead-crane') {
                    ctx.filter = 'grayscale(1) contrast(1.08)';
                }
                ctx.drawImage(resourceImgRect, resource.x, resource.y, resource.width, resource.height);
                ctx.restore();
            }
            
            if (!machineResource) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = getScaledLineWidth(1, 0.2);
                ctx.strokeRect(resource.x, resource.y, resource.width, resource.height);
            }
        }
        
        // Nome do recurso com sistema adaptativo
        if (resource.name) {
            const bb = resource.vertices && resource.vertices.length > 0 
                ? calculateBoundingBox(resource.vertices)
                : { x: resource.x, y: resource.y, width: resource.width, height: resource.height };
            
            drawResourceNameAdaptiveExport(ctx, resource.name, bb, resource.color);
            
            // Desenhar ícone de cadeado para recursos bloqueados na exportação
            if (resource.locked) {
                const iconSize = 12 / viewScale;
                const padding = 5 / viewScale;
                
                const iconX = bb.x + bb.width - iconSize - padding;
                const iconY = bb.y + padding;
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = getScaledLineWidth(1.5, 0.3);
                
                // Desenhar corpo do cadeado
                ctx.fillRect(iconX, iconY + iconSize * 0.4, iconSize, iconSize * 0.6);
                ctx.strokeRect(iconX, iconY + iconSize * 0.4, iconSize, iconSize * 0.6);
                
                // Desenhar arco do cadeado
                ctx.beginPath();
                ctx.arc(iconX + iconSize / 2, iconY + iconSize * 0.4, iconSize * 0.3, Math.PI, 0);
                ctx.stroke();
            }
        }
    });
    
    ctx.restore();
}

/**
 * Desenha as dimensões (cotas) exatamente como no canvas principal
 */
function drawExportDimensions(ctx, area, scale) {
    if (!getGlobalShowDimensions() || !area || !area.vertices || area.vertices.length < 3) return;
    
    ctx.save();
    
    // Configurações de estilo para cotas — use a softer gray for cleanliness
    const dimColor = '#555555';
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = getScaledLineWidth(dimensionLineWidth, 0.15);
    ctx.fillStyle = dimColor;
    
    // Sistema unificado de cotas para áreas em exportação
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('areas', 1.0);
    const fontFamily = fontConfig.family || 'Arial';
    const fontBaseSize = fontConfig.size;
    const exportFontSize = getScaledFontSize(fontBaseSize * EXPORT_DIMENSION_FONT_SCALE);
    ctx.font = `600 ${exportFontSize}px ${fontFamily}`;
    
    // Desenhar dimensões do contorno principal
    drawExportRingDimensions(ctx, area.vertices, false, area, scale, fontBaseSize, fontFamily);
    
    // Desenhar dimensões dos buracos se existirem
    if (area.rings && area.rings.length > 1) {
        for (let i = 1; i < area.rings.length; i++) {
            const holeRing = area.rings[i];
            if (holeRing && holeRing.length >= 3) {
                drawExportRingDimensions(ctx, holeRing, true, area, scale, fontBaseSize, fontFamily);
            }
        }
    }
    
    ctx.restore();
}

/**
 * Desenha as dimensões de um anel de vértices (contorno ou buraco)
 */
function drawExportRingDimensions(ctx, ringVertices, isHole = false, area = null, scale = 1, fontSizeBase = null, fontFamily = 'Arial') {
    if (!ringVertices || ringVertices.length < 3) return;
    
    for (let i = 0; i < ringVertices.length; i++) {
        const p1 = ringVertices[i];
        const p2 = ringVertices[(i + 1) % ringVertices.length];
        
        const segmentLength = Math.sqrt(
            Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2)
        );
        
        if (segmentLength < floatTolerance) continue;
        
        const segmentLengthCm = Math.round(segmentLength / pixelsPerCm * 10) / 10;
        
        // Só desenhar cotas para segmentos maiores que 10cm (reduce visual noise)
        if (segmentLengthCm >= 10) {
            const textValue = formatLength(segmentLengthCm);
            drawExportSingleSegmentDimension(ctx, p1, p2, textValue, dimensionOffset, ringVertices, isHole, i, scale, fontSizeBase, fontFamily);
        }
    }
}

/**
 * Desenha uma dimensão de segmento individual
 */
function drawExportSingleSegmentDimension(ctx, p1, p2, textValue, offsetVal_world, polygonVertices = null, isHole = false, segmentIndex = null, scale = 1, fontSizeOverride = null, fontFamily = 'Arial') {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    
    if (segmentLength < floatTolerance) return;
    
    // Vetor normal ao segmento
    let nx = -dy / segmentLength;
    let ny = dx / segmentLength;
    
    // Determinar direção da normal baseada no centroide do polígono
    if (polygonVertices && polygonVertices.length >= 3) {
        let centroidX = 0, centroidY = 0;
        for (const vertex of polygonVertices) {
            centroidX += vertex[0];
            centroidY += vertex[1];
        }
        centroidX /= polygonVertices.length;
        centroidY /= polygonVertices.length;
        
        const midX = (p1[0] + p2[0]) / 2;
        const midY = (p1[1] + p2[1]) / 2;
        const toCenterX = centroidX - midX;
        const toCenterY = centroidY - midY;
        const dotProduct = nx * toCenterX + ny * toCenterY;
        
        if (isHole) {
            if (dotProduct < 0) { nx = -nx; ny = -ny; }
        } else {
            if (dotProduct > 0) { nx = -nx; ny = -ny; }
        }
    }

    // Delegate to the unified tick dimension renderer
    const fontBase = fontSizeOverride ?? dimensionFontSize;
    drawExportTickDimension(ctx, p1, p2, textValue, {
        offset: Math.abs(offsetVal_world),
        arrowSize: dimensionTickSize,
        color: '#555555',
        fontSize: fontBase,
        fontFamily,
        lineWidth: Math.max(0.5, dimensionLineWidth),
        _normalOverride: { nx, ny }
    });
}

/**
 * Desenha linhas livres na exportação
 */
function drawExportFreeLines(ctx, freeLinesList, scale) {
    if (!freeLinesList || freeLinesList.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';

    for (const line of freeLinesList) {
        const strokeColor = line.color || '#4A5568';
        const width = getScaledLineWidth(line.width || 2, 0.3);

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = width;

        const shapeType = line.shapeType || 'line';
        const sx = line.startPoint[0];
        const sy = line.startPoint[1];
        const ex = line.endPoint[0];
        const ey = line.endPoint[1];

        if (shapeType === 'dimension') {
            const lengthCm = Math.round((Math.hypot(ex - sx, ey - sy) / pixelsPerCm) * 10) / 10;
            drawExportTickDimension(ctx, [sx, sy], [ex, ey], formatLength(lengthCm), {
                offset: 0,
                arrowSize: dimensionTickSize,
                color: '#007aff',
                fontSize: dimensionFontSize,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                lineWidth: Math.max(0.5, dimensionLineWidth)
            });
            continue;
        }

        ctx.beginPath();
        switch (shapeType) {
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
                if (rx > 0 && ry > 0) ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
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

    ctx.restore();
}

/**
 * Desenha aberturas (docas) na exportação
 */
function drawExportOpenings(ctx, openingsList, scale) {
    if (!openingsList || openingsList.length === 0) return;

    ctx.save();

    openingsList.forEach(opening => {
        if (!opening.visible) return;
        if (!opening.startPoint || !opening.endPoint) return;

        const isBoundary = opening.isBoundaryOpening || false;

        // Gap visual (fundo limpando a parede)
        const gapWidth = getScaledLineWidth(12, 1.5);
        const bgColor = isBoundary ? '#e8f5e9' : '#f8f9fa';

        ctx.save();
        ctx.strokeStyle = bgColor;
        ctx.lineWidth = gapWidth;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(opening.startPoint[0], opening.startPoint[1]);
        ctx.lineTo(opening.endPoint[0], opening.endPoint[1]);
        ctx.stroke();
        ctx.restore();

        // Indicador de doca para aberturas de borda
        if (isBoundary) {
            drawExportBoundaryIndicator(ctx, opening);
        }

        // Cubos de controle nos extremos
        const cubeSize = getScaledLineWidth(8, 1);
        const cubeColor = isBoundary ? '#2e7d32' : '#666666';
        ctx.fillStyle = cubeColor;
        ctx.fillRect(
            opening.startPoint[0] - cubeSize / 2,
            opening.startPoint[1] - cubeSize / 2,
            cubeSize, cubeSize
        );
        ctx.fillRect(
            opening.endPoint[0] - cubeSize / 2,
            opening.endPoint[1] - cubeSize / 2,
            cubeSize, cubeSize
        );
    });

    ctx.restore();
}

/**
 * Desenha indicador de doca (seta + label + linhas laterais) na exportação
 */
function drawExportBoundaryIndicator(ctx, opening) {
    const midX = (opening.startPoint[0] + opening.endPoint[0]) / 2;
    const midY = (opening.startPoint[1] + opening.endPoint[1]) / 2;

    let nx, ny;
    if (opening.outwardNormal) {
        nx = opening.outwardNormal.x;
        ny = opening.outwardNormal.y;
    } else {
        const dx = opening.endPoint[0] - opening.startPoint[0];
        const dy = opening.endPoint[1] - opening.startPoint[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;
        nx = -dy / len;
        ny = dx / len;
    }

    ctx.save();
    const arrowColor = '#2e7d32';

    // Seta
    const arrowLen = getScaledLineWidth(20, 3);
    const arrowWidth = getScaledLineWidth(6, 1);
    const tipX = midX + nx * arrowLen;
    const tipY = midY + ny * arrowLen;

    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = getScaledLineWidth(3, 0.4);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Ponta da seta
    const perpX = -ny;
    const perpY = nx;
    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - nx * arrowWidth + perpX * arrowWidth * 0.5, tipY - ny * arrowWidth + perpY * arrowWidth * 0.5);
    ctx.lineTo(tipX - nx * arrowWidth - perpX * arrowWidth * 0.5, tipY - ny * arrowWidth - perpY * arrowWidth * 0.5);
    ctx.closePath();
    ctx.fill();

    // Label
    const displayName = opening.name || 'DOCA';
    const labelOffset = arrowLen + getScaledLineWidth(10, 1.5);
    const fontSize = getScaledFontSize(dimensionFontSize * 1.1);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = arrowColor;
    ctx.fillText(displayName, midX + nx * labelOffset, midY + ny * labelOffset);

    // Linhas laterais tracejadas
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = getScaledLineWidth(2, 0.3);
    const dashLen = getScaledLineWidth(4, 0.5);
    const dashGap = getScaledLineWidth(3, 0.4);
    ctx.setLineDash([dashLen, dashGap]);

    const dockDepth = getScaledLineWidth(10, 1.5);
    ctx.beginPath();
    ctx.moveTo(opening.startPoint[0], opening.startPoint[1]);
    ctx.lineTo(opening.startPoint[0] + nx * dockDepth, opening.startPoint[1] + ny * dockDepth);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(opening.endPoint[0], opening.endPoint[1]);
    ctx.lineTo(opening.endPoint[0] + nx * dockDepth, opening.endPoint[1] + ny * dockDepth);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
}

/**
 * Desenha conexões na exportação
 */
function drawExportConnections(ctx, connectionsList, scale) {
    if (!connectionsList || connectionsList.length === 0) return;

    ctx.save();

    connectionsList.forEach(connection => {
        if (!connection.path || connection.path.length < 2) return;
        if (connection.isCreating) return;

        const strokeColor = connection.color || '#6366f1';
        const connectionWidth = connection.width || 60;
        const pavementWidth = connectionWidth * pixelsPerCm;

        // Pavimento (fundo semi-transparente)
        ctx.save();
        ctx.lineWidth = pavementWidth;
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 0.18;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(connection.path[0].x, connection.path[0].y);
        for (let i = 1; i < connection.path.length; i++) {
            ctx.lineTo(connection.path[i].x, connection.path[i].y);
        }
        ctx.stroke();
        ctx.restore();

        // Linha central
        ctx.save();
        ctx.lineWidth = getScaledLineWidth(3, 0.4);
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 0.7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(connection.path[0].x, connection.path[0].y);
        for (let i = 1; i < connection.path.length; i++) {
            ctx.lineTo(connection.path[i].x, connection.path[i].y);
        }
        ctx.stroke();
        ctx.restore();
    });

    ctx.restore();
}

/**
 * Captura o painel de métricas da sidebar direita e renderiza num canvas lateral
 * @returns {HTMLCanvasElement|null}
 */
function renderMetricsPanel() {
    const rightSidebar = document.querySelector('.right-sidebar');
    if (!rightSidebar) return null;

    // Coletar dados das métricas do DOM
    const metrics = [];

    // Análise de Conexões - tabela
    const analysisPanel = document.getElementById('connectionAnalysisPanel');
    const noMsg = analysisPanel ? analysisPanel.querySelector('.no-connections-message') : null;
    const hasConnTable = analysisPanel && !noMsg;

    // Métricas de Otimização
    const totalDist = document.getElementById('totalDistanceMetric');
    const totalConn = document.getElementById('totalConnectionsMetric');
    const cycleTime = document.getElementById('cycleTimeMetric');
    const cycleRange = document.getElementById('cycleTimeRange');
    const vaTime = document.getElementById('valueAddedTimeMetric');
    const nvaTime = document.getElementById('nonValueAddedTimeMetric');

    metrics.push({ icon: '📏', label: 'Distância Total', value: totalDist ? totalDist.textContent : '0 km' });
    metrics.push({ icon: '🔗', label: 'Conexões', value: totalConn ? totalConn.textContent : '0' });
    metrics.push({ icon: '⏱', label: 'Tempo do Ciclo', value: cycleTime ? cycleTime.textContent : '--', sub: cycleRange ? cycleRange.textContent : '' });
    metrics.push({ icon: '⚙', label: 'Tempo Agrega', value: vaTime ? vaTime.textContent : '--', color: '#43a047' });
    metrics.push({ icon: '🚶', label: 'Tempo Não Agrega', value: nvaTime ? nvaTime.textContent : '--', color: '#e53935' });

    // Tabela de conexões
    const connTable = analysisPanel ? analysisPanel.querySelector('.data-table') : null;
    let tableRows = [];
    if (connTable) {
        const tbody = connTable.querySelector('tbody');
        const tfoot = connTable.querySelector('tfoot');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(tr => {
                const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
                if (cells.length >= 2) tableRows.push(cells);
            });
        }
        if (tfoot) {
            const footCells = Array.from(tfoot.querySelectorAll('td, th')).map(td => td.textContent.trim());
            if (footCells.length >= 2) tableRows.push(footCells);
        }
    }

    // Produtividade por operador
    const opPanel = document.getElementById('operatorCyclesPanel');
    let operatorRows = [];
    if (opPanel) {
        const opTable = opPanel.querySelector('.data-table');
        if (opTable) {
            const tbody = opTable.querySelector('tbody');
            if (tbody) {
                tbody.querySelectorAll('tr').forEach(tr => {
                    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
                    if (cells.length >= 2) operatorRows.push(cells);
                });
            }
        }
    }

    // Calcular dimensões do painel
    const panelWidth = 320;
    const padding = 20;
    const lineHeight = 22;
    const sectionGap = 18;
    const cardHeight = 52;
    const titleHeight = 28;

    let totalHeight = padding;
    // Título "Métricas de Otimização"  
    totalHeight += titleHeight + 8;
    totalHeight += metrics.length * (cardHeight + 8) + sectionGap;
    
    // Tabela de conexões
    if (tableRows.length > 0) {
        totalHeight += titleHeight + 8;
        totalHeight += (tableRows.length + 1) * lineHeight + sectionGap;
    }

    // Tabela de operadores
    if (operatorRows.length > 0) {
        totalHeight += titleHeight + 8;
        totalHeight += (operatorRows.length + 1) * lineHeight + sectionGap;
    }

    totalHeight += padding;
    totalHeight = Math.max(totalHeight, 300);

    const canvas = document.createElement('canvas');
    canvas.width = panelWidth * 2; // 2x para alta resolução
    canvas.height = totalHeight * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, panelWidth, totalHeight);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, panelWidth, totalHeight);

    let y = padding;

    // Título "Métricas de Otimização"
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Métricas de Otimização', padding, y + 14);
    y += titleHeight + 8;

    // Metric cards
    metrics.forEach(m => {
        // Card background
        ctx.fillStyle = '#ffffff';
        _roundRect(ctx, padding - 4, y, panelWidth - padding * 2 + 8, cardHeight, 6);
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.5;
        _roundRect(ctx, padding - 4, y, panelWidth - padding * 2 + 8, cardHeight, 6);
        ctx.stroke();

        // Icon
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#334155';
        ctx.fillText(m.icon, padding + 4, y + 22);

        // Label
        ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(m.label, padding + 30, y + 18);

        // Value
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = m.color || '#1e293b';
        ctx.fillText(m.value, padding + 30, y + 38);

        // Sub text
        if (m.sub) {
            ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(m.sub, padding + 30 + ctx.measureText(m.value).width + 6, y + 38);
        }

        y += cardHeight + 8;
    });

    y += sectionGap - 8;

    // Tabela de análise de conexões
    if (tableRows.length > 0) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Análise de Conexões', padding, y + 14);
        y += titleHeight + 8;

        // Header row
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(padding - 4, y, panelWidth - padding * 2 + 8, lineHeight);
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText('Recursos', padding + 2, y + 15);
        ctx.fillText('Dist.', padding + 150, y + 15);
        ctx.fillText('Linhas', padding + 220, y + 15);
        y += lineHeight;

        // Data rows
        tableRows.forEach((row, idx) => {
            if (idx % 2 === 0) {
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.fillStyle = '#f8fafc';
            }
            ctx.fillRect(padding - 4, y, panelWidth - padding * 2 + 8, lineHeight);

            ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = '#334155';
            const maxLabelWidth = 140;
            let label = row[0] || '';
            if (ctx.measureText(label).width > maxLabelWidth) {
                while (ctx.measureText(label + '…').width > maxLabelWidth && label.length > 5) {
                    label = label.slice(0, -1);
                }
                label += '…';
            }
            ctx.fillText(label, padding + 2, y + 15);
            if (row[1]) ctx.fillText(row[1], padding + 150, y + 15);
            if (row[2]) ctx.fillText(row[2], padding + 220, y + 15);
            y += lineHeight;
        });
    }

    y += sectionGap;

    // Tabela de operadores
    if (operatorRows.length > 0) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Produtividade por Operador', padding, y + 14);
        y += titleHeight + 8;

        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(padding - 4, y, panelWidth - padding * 2 + 8, lineHeight);
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText('Operador', padding + 2, y + 15);
        ctx.fillText('Ciclos', padding + 150, y + 15);
        y += lineHeight;

        operatorRows.forEach((row, idx) => {
            ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            ctx.fillRect(padding - 4, y, panelWidth - padding * 2 + 8, lineHeight);
            ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = '#334155';
            ctx.fillText(row[0] || '', padding + 2, y + 15);
            if (row[1]) ctx.fillText(row[1], padding + 150, y + 15);
            y += lineHeight;
        });
    }

    return { canvas, width: panelWidth, height: totalHeight };
}

/** Helper para retângulos arredondados */
function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Renderiza todo o conteúdo no canvas de exportação
 * @param {Object} opts - Extra options { showDimensions, showGrid, background }
 */
async function renderContentToCanvas(ctx, bounds, exportScale, opts = {}) {
    const previousViewScale = CURRENT_EXPORT_VIEW_SCALE;
    const viewScale = updateExportViewScale();

    const showDims = opts.showDimensions !== undefined ? opts.showDimensions : true;
    const showGrid = opts.showGrid !== undefined ? opts.showGrid : true;
    const showConns = opts.showConnections || false;
    const bg = opts.background || '#ffffff';

    // Limpar canvas
    if (bg === 'transparent') {
        ctx.clearRect(0, 0, bounds.width * exportScale * viewScale, bounds.height * exportScale * viewScale);
    } else {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, bounds.width * exportScale * viewScale, bounds.height * exportScale * viewScale);
    }
    
    try {
        // Determine which floor data to render
        const floorIds = opts.floorIds || null; // null = current floor only
        const floorsToRender = _getFloorsToRender(floorIds);
        
        floorsToRender.forEach(floorData => {
            const fAreas = floorData.movementAreas || [];
            const fWalls = floorData.walls || [];
            const fResources = floorData.resources || [];

            // Desenhar áreas de movimentação
            fAreas.forEach(area => {
                if (showGrid) {
                    drawExportMovementArea(ctx, area, exportScale);
                } else {
                    _drawAreaNoGrid(ctx, area, exportScale);
                }
                if (showDims) drawExportDimensions(ctx, area, exportScale);
            });
            
            // Desenhar paredes
            if (fWalls.length > 0) {
                drawExportWalls(ctx, fWalls, exportScale);
                if (showDims) drawExportWallDimensions(ctx, fWalls, exportScale);
            }

            // Desenhar linhas livres
            const fFreeLines = floorData.freeLines || [];
            if (fFreeLines.length > 0) {
                drawExportFreeLines(ctx, fFreeLines, exportScale);
            }

            // Desenhar aberturas (docas)
            const fOpenings = floorData.openings || [];
            if (fOpenings.length > 0) {
                drawExportOpenings(ctx, fOpenings, exportScale);
            }
            
            // Desenhar recursos
            const visibleResources = fResources.filter(r => r.visible !== false);
            if (visibleResources.length > 0) {
                drawExportResources(ctx, visibleResources, exportScale);
                if (showDims) drawExportResourceDimensions(ctx, visibleResources, exportScale);
            }

            // Desenhar conexões
            if (showConns) {
                const fConnections = floorData.connections || ((!opts.floorIds || opts.floorIds.length === 0) ? getConnections() : []);
                if (fConnections.length > 0) {
                    drawExportConnections(ctx, fConnections, exportScale);
                }
            }
        });
    } finally {
        CURRENT_EXPORT_VIEW_SCALE = previousViewScale;
    }
}

/**
 * Determines which floor data objects to render
 * @param {string[]|null} floorIds - specific floor IDs or null for current floor
 * @returns {Array} array of floor data objects
 */
function _getFloorsToRender(floorIds) {
    if (!floorIds || floorIds.length === 0) {
        // Current floor — use imported live arrays
        return [{ movementAreas, walls, resources, openings, freeLines }];
    }
    const allFloors = getAllFloors();
    if (!allFloors || allFloors.length === 0) {
        return [{ movementAreas, walls, resources, openings, freeLines }];
    }
    return floorIds
        .map(id => allFloors.find(f => f.id === id))
        .filter(Boolean);
}

/**
 * Computes unified content bounds across multiple floors
 */
function getMultiFloorContentBounds(floorIds) {
    if (!floorIds || floorIds.length === 0) return getContentBounds();
    
    const allFloors = getAllFloors();
    if (!allFloors || allFloors.length === 0) return getContentBounds();
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    floorIds.forEach(fid => {
        const floor = allFloors.find(f => f.id === fid);
        if (!floor) return;
        
        (floor.movementAreas || []).forEach(area => {
            if (area.vertices && area.vertices.length > 0) {
                area.vertices.forEach(([x, y]) => {
                    minX = Math.min(minX, x); minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                });
            } else if (area.x != null) {
                minX = Math.min(minX, area.x); minY = Math.min(minY, area.y);
                maxX = Math.max(maxX, area.x + area.width); maxY = Math.max(maxY, area.y + area.height);
            }
        });
        
        (floor.walls || []).forEach(wall => {
            if (wall.startPoint && wall.endPoint) {
                minX = Math.min(minX, wall.startPoint[0], wall.endPoint[0]);
                minY = Math.min(minY, wall.startPoint[1], wall.endPoint[1]);
                maxX = Math.max(maxX, wall.startPoint[0], wall.endPoint[0]);
                maxY = Math.max(maxY, wall.startPoint[1], wall.endPoint[1]);
            }
        });
        
        (floor.resources || []).forEach(resource => {
            if (resource.visible === false) return;
            if (resource.vertices && resource.vertices.length > 0) {
                resource.vertices.forEach(([x, y]) => {
                    minX = Math.min(minX, x); minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                });
            } else if (resource.x != null) {
                minX = Math.min(minX, resource.x); minY = Math.min(minY, resource.y);
                maxX = Math.max(maxX, resource.x + resource.width); maxY = Math.max(maxY, resource.y + resource.height);
            }
        });
    });
    
    if (!isFinite(minX)) return getContentBounds();
    
    const margin = 80;
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Internal helper: draw area without grid */
function _drawAreaNoGrid(ctx, area, scale) {
    if (!area) return;
    ctx.save();
    if (area.vertices && area.vertices.length < 3) { ctx.restore(); return; }
    ctx.fillStyle = '#FFFFFF';
    if (area.rings && area.rings.length > 0) {
        ctx.beginPath();
        const outerRing = area.rings[0];
        if (outerRing && outerRing.length > 0) {
            ctx.moveTo(outerRing[0][0], outerRing[0][1]);
            for (let i = 1; i < outerRing.length; i++) ctx.lineTo(outerRing[i][0], outerRing[i][1]);
            ctx.closePath(); ctx.fill();
        }
        if (area.rings.length > 1) {
            ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
            for (let i = 1; i < area.rings.length; i++) {
                const h = area.rings[i]; if (!h || h.length === 0) continue;
                ctx.beginPath(); ctx.moveTo(h[0][0], h[0][1]);
                for (let j = 1; j < h.length; j++) ctx.lineTo(h[j][0], h[j][1]);
                ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        }
    } else if (area.vertices && area.vertices.length > 0) {
        ctx.beginPath(); ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        ctx.closePath(); ctx.fill();
    } else {
        ctx.fillRect(area.x, area.y, area.width, area.height);
    }
    ctx.strokeStyle = area.locked ? '#A0A0A0' : '#333333';
    ctx.lineWidth = getScaledLineWidth(2, 0.3);
    ctx.beginPath();
    if (area.vertices && area.vertices.length > 0) {
        ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        ctx.closePath(); ctx.stroke();
    } else if (!area.rings) { ctx.strokeRect(area.x, area.y, area.width, area.height); }
    if (area.rings && area.rings.length > 1) {
        for (let i = 1; i < area.rings.length; i++) {
            const h = area.rings[i]; if (!h || h.length === 0) continue;
            ctx.beginPath(); ctx.moveTo(h[0][0], h[0][1]);
            for (let j = 1; j < h.length; j++) ctx.lineTo(h[j][0], h[j][1]);
            ctx.closePath(); ctx.stroke();
        }
    }
    ctx.restore();
}
/**
 * Cria um canvas temporário com o conteúdo para exportação
 * @param {Object} bounds - Limites do conteúdo
 * @param {number} exportScale - Escala para o canvas temporário
 * @param {number} viewScale - Escala da view
 * @param {Object} opts - Extra options { background, showDimensions, showGrid }
 * @returns {Promise<HTMLCanvasElement>} Canvas temporário
 */
async function createExportCanvas(bounds, exportScale = 1, viewScale = 1, opts = {}) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // Definir tamanho do canvas temporário
    const layoutW = Math.ceil(bounds.width * exportScale * viewScale);
    const layoutH = Math.ceil(bounds.height * exportScale * viewScale);
    tempCanvas.width = layoutW;
    tempCanvas.height = layoutH;
    
    // Salvar contexto e aplicar transformações
    tempCtx.save();
    tempCtx.scale(exportScale * viewScale, exportScale * viewScale);
    tempCtx.translate(-bounds.minX, -bounds.minY);
    
    try {
        // Renderizar conteúdo usando as funções específicas de exportação
        await renderContentToCanvas(tempCtx, bounds, exportScale, {
            ...opts,
            floorIds: opts.floorIds || [],
        });
        
    } catch (error) {
        console.warn('Erro ao renderizar conteúdo para exportação:', error);
        const bg = opts.background || '#ffffff';
        if (bg !== 'transparent') {
            tempCtx.fillStyle = bg;
            tempCtx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
        }
    }
    
    tempCtx.restore();

    // Se showMetrics, compor layout + painel de métricas lado a lado
    if (opts.showMetrics) {
        const metricsResult = renderMetricsPanel();
        if (metricsResult) {
            const metricsScale = layoutH / metricsResult.height;
            const metricsDrawW = Math.ceil(metricsResult.width * metricsScale);
            const metricsDrawH = layoutH;
            const gap = 2;

            const compositeCanvas = document.createElement('canvas');
            compositeCanvas.width = layoutW + gap + metricsDrawW;
            compositeCanvas.height = layoutH;
            const cCtx = compositeCanvas.getContext('2d');

            // Background
            const bg = opts.background || '#ffffff';
            if (bg !== 'transparent') {
                cCtx.fillStyle = bg;
                cCtx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
            }

            // Layout
            cCtx.drawImage(tempCanvas, 0, 0);

            // Métricas
            cCtx.drawImage(metricsResult.canvas, 0, 0, metricsResult.canvas.width, metricsResult.canvas.height,
                layoutW + gap, 0, metricsDrawW, metricsDrawH);

            return compositeCanvas;
        }
    }
    
    return tempCanvas;
}

/**
 * Exporta para PDF
 * @param {string} filename - Nome do arquivo
 * @param {Object} options - Opções de exportação
 */
async function exportToPDF(filename = 'layout.pdf', options = {}) {
    try {
        
        // Verificar se jsPDF está disponível de diferentes formas
        let PDFLib;
        
        if (typeof window.jsPDF !== 'undefined') {
            if (typeof window.jsPDF.jsPDF === 'function') {
                PDFLib = window.jsPDF.jsPDF;
            } else if (typeof window.jsPDF === 'function') {
                PDFLib = window.jsPDF;
            } else {
                PDFLib = window.jsPDF.default || window.jsPDF;
            }
        } else if (typeof window.jspdf !== 'undefined') {
            PDFLib = window.jspdf.jsPDF || window.jspdf;
        } else if (typeof jsPDF !== 'undefined') {
            PDFLib = jsPDF;
        } else {
            // Fallback: tentar exportar como imagem
            console.warn('jsPDF não disponível, exportando como imagem PNG');
            return await exportToImage(filename.replace('.pdf', '.png'), options);
        }


        const config = { ...EXPORT_CONFIG.pdf, ...options };
        const bounds = getExportBounds(options);
        const scaleValue = typeof getScale === 'function' ? Number(getScale()) : 1;
        const viewScale = Number.isFinite(scaleValue) && scaleValue > 0 ? scaleValue : 1;
        
        // Determinar dimensões da página baseadas no formato e orientação
        const formatKey = (config.format || 'a4').toLowerCase();
        const formatDims = EXPORT_CONFIG.pdf.formats[formatKey] || EXPORT_CONFIG.pdf.formats['a4'];
        const isLandscape = config.orientation === 'landscape';
        
        const pageWidthMm = isLandscape ? Math.max(formatDims.width, formatDims.height) : Math.min(formatDims.width, formatDims.height);
        const pageHeightMm = isLandscape ? Math.min(formatDims.width, formatDims.height) : Math.max(formatDims.width, formatDims.height);
        
        // Calcular área útil (descontando margens)
        const maxWidthMm = pageWidthMm - (config.margin * 2);
        const maxHeightMm = pageHeightMm - (config.margin * 2);
        
        const dpi = options.dpi || config.dpi || 300;
        const pixelsPerMm = dpi / 25.4;
        
        const maxWidthPixels = maxWidthMm * pixelsPerMm;
        const maxHeightPixels = maxHeightMm * pixelsPerMm;
        const maxScale = config.maxScale || 50;
        
        const scaleX = maxWidthPixels / (bounds.width * viewScale || 1);
        const scaleY = maxHeightPixels / (bounds.height * viewScale || 1);
        
        // Usar o menor scale para garantir que cabe na página, mas sem limitar artificialmente se for menor que maxScale
        // A remoção da limitação severa de maxScale permite que o desenho expanda
        const exportScale = Math.min(scaleX, scaleY, maxScale);
        
        // Criar canvas temporário
        const tempCanvas = await createExportCanvas(bounds, exportScale, viewScale, {
            background: options.background || '#ffffff',
            showDimensions: options.showDimensions !== undefined ? options.showDimensions : true,
            showGrid: options.showGrid !== undefined ? options.showGrid : true,
            showConnections: options.showConnections || false,
            showMetrics: options.showMetrics || false,
            floorIds: options.floorIds || [],
        });
        
        // Converter para imagem
        const imgData = tempCanvas.toDataURL('image/png', config.quality);
        
        // Criar PDF
        const pdf = new PDFLib({
            orientation: config.orientation,
            unit: 'mm',
            format: config.format
        });
        
        // Calcular dimensões finais no PDF (usar dimensão real do canvas que pode incluir métricas)
        const finalWidth = tempCanvas.width / pixelsPerMm;
        const finalHeight = tempCanvas.height / pixelsPerMm;
        
        // Centralizar no PDF
        const x = (pageWidthMm - finalWidth) / 2;
        const y = (pageHeightMm - finalHeight) / 2;
        
        // Adicionar título
        pdf.setFontSize(16);
        pdf.text("Layout - Gregório's CAD", config.margin, config.margin);
        
        // Adicionar data
        pdf.setFontSize(10);
        const date = new Date().toLocaleDateString('pt-BR');
        pdf.text(`Gerado em: ${date}`, config.margin, config.margin + 10);
        
        // Adicionar imagem
        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
        
        // Adicionar informações na parte inferior
        pdf.setFontSize(8);
        pdf.text("Gregório's CAD - Layouts industriais inteligentes",
                config.margin, pageHeightMm - config.margin);
        
        // Salvar PDF
        pdf.save(filename);
        
        // Feedback visual
        showExportSuccess('PDF exportado com sucesso!');
        
    } catch (error) {
        console.error('Erro ao exportar PDF:', error);
        showExportError('Erro ao exportar PDF: ' + error.message);
    }
}

/**
 * Exporta para imagem (PNG/JPEG)
 * @param {string} filename - Nome do arquivo
 * @param {Object} options - Opções de exportação
 */
async function exportToImage(filename = 'layout.png', options = {}) {
    try {
        const config = { ...EXPORT_CONFIG.image, ...options };
        const bounds = getExportBounds(options);
        const scaleValue = typeof getScale === 'function' ? Number(getScale()) : 1;
        const viewScale = Number.isFinite(scaleValue) && scaleValue > 0 ? scaleValue : 1;

        // Use scaleFactor from new UI (1-4x) or fallback to old logic
        const scaleFactor = options.scaleFactor || 2;
        const exportScale = Math.min(scaleFactor, config.maxScale || 8);

        const fmt = options.format || 'png';
        const background = options.background || '#ffffff';

        // Criar canvas temporário
        const tempCanvas = await createExportCanvas(bounds, exportScale, viewScale, {
            background,
            showDimensions: options.showDimensions !== undefined ? options.showDimensions : true,
            showGrid: options.showGrid !== undefined ? options.showGrid : true,
            showConnections: options.showConnections || false,
            showMetrics: options.showMetrics || false,
            floorIds: options.floorIds || [],
        });
        
        // Baixar imagem
        const mimeType = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
        const quality = fmt === 'jpeg' ? (config.quality || 0.92) : 1.0;
        const link = document.createElement('a');
        link.download = filename;
        link.href = tempCanvas.toDataURL(mimeType, quality);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showExportSuccess(`Imagem ${fmt.toUpperCase()} exportada com sucesso!`);
        
    } catch (error) {
        console.error('Erro ao exportar imagem:', error);
        showExportError('Erro ao exportar imagem: ' + error.message);
    }
}

/**
 * Mostra modal de opções de exportação — Redesigned
 */
function showExportModal() {
    const pdfAvailable = typeof window.jsPDF !== 'undefined' || typeof window.jspdf !== 'undefined';

    // Get floors info
    const allFloors = getAllFloors();
    const currentFloor = getCurrentFloorId();
    const hasMultipleFloors = allFloors && allFloors.length > 1;

    // State
    const state = {
        format: 'png',
        scope: 'content',
        background: '#ffffff',
        filename: 'layout',
        quality: 1.0,
        scaleFactor: 2,
        dpi: 150,
        paperSize: 'a4',
        orientation: 'landscape',
        showDimensions: true,
        showGrid: true,
        showConnections: false,
        showMetrics: false,
        selectedFloorIds: currentFloor ? [currentFloor] : [],
        exportMode: 'single', // 'single' | 'all' | 'select'
    };

    let previewDebounce = null;

    // Build floor checkboxes HTML
    let floorCheckboxesHTML = '';
    if (hasMultipleFloors) {
        const floorsReversed = [...allFloors].reverse();
        floorCheckboxesHTML = floorsReversed.map(f => {
            const checked = f.id === currentFloor ? 'checked' : '';
            return `<label class="export-floor-check-label">
                <input type="checkbox" class="export-floor-check" data-floor-id="${f.id}" ${checked}>
                <span>${f.name}</span>
            </label>`;
        }).join('');
    }

    const modal = document.createElement('div');
    modal.className = 'export-modal-overlay';
    modal.innerHTML = `
        <div class="export-modal">
            <div class="export-modal-header">
                <h3><i class="fas fa-file-export"></i> Exportar Layout</h3>
                <button class="export-modal-close" title="Fechar">&times;</button>
            </div>

            <div class="export-modal-body">
                <div class="export-panel-settings">
                    <div class="export-format-tabs">
                        <button class="export-format-tab active" data-format="png"><i class="fas fa-image"></i> PNG</button>
                        <button class="export-format-tab" data-format="jpeg"><i class="fas fa-file-image"></i> JPEG</button>
                        <button class="export-format-tab ${!pdfAvailable ? 'disabled' : ''}" data-format="pdf"><i class="fas fa-file-pdf"></i> PDF</button>
                    </div>

                    ${hasMultipleFloors ? `
                    <!-- Floor selection -->
                    <div class="export-settings-section">
                        <div class="export-section-title">Pavimentos</div>
                        <div class="export-scope-pills" style="margin-bottom:0.6rem">
                            <button class="export-scope-pill export-floor-mode active" data-mode="single">Atual</button>
                            <button class="export-scope-pill export-floor-mode" data-mode="all">Todos</button>
                            <button class="export-scope-pill export-floor-mode" data-mode="select">Selecionar</button>
                        </div>
                        <div id="export-floor-checklist" style="display:none">
                            ${floorCheckboxesHTML}
                        </div>
                    </div>
                    ` : ''}

                    <div class="export-settings-section">
                        <div class="export-section-title">Área de exportação</div>
                        <div class="export-scope-pills">
                            <button class="export-scope-pill active" data-scope="content"><i class="fas fa-expand"></i> Todo conteúdo</button>
                            <button class="export-scope-pill" data-scope="viewport"><i class="fas fa-desktop"></i> Viewport</button>
                        </div>
                    </div>

                    <div class="export-settings-section" id="export-image-settings">
                        <div class="export-section-title">Qualidade da imagem</div>
                        <div class="export-setting-row">
                            <label>Escala</label>
                            <div class="export-scale-slider-container">
                                <input type="range" id="export-scale-slider" min="1" max="4" step="0.5" value="2">
                                <span class="export-scale-value" id="export-scale-label">2×</span>
                            </div>
                        </div>
                        <div class="export-setting-row" id="export-jpeg-quality-row" style="display:none">
                            <label>Qualidade JPEG</label>
                            <div class="export-scale-slider-container">
                                <input type="range" id="export-jpeg-quality" min="0.5" max="1" step="0.05" value="0.92">
                                <span class="export-scale-value" id="export-jpeg-quality-label">92%</span>
                            </div>
                        </div>
                    </div>

                    <div class="export-settings-section" id="export-pdf-settings" style="display:none">
                        <div class="export-section-title">Configuração do PDF</div>
                        <div class="export-setting-inline">
                            <div class="export-setting-row">
                                <label>Papel</label>
                                <select id="export-paper-size">
                                    <option value="a4" selected>A4</option>
                                    <option value="a3">A3</option>
                                    <option value="a2">A2</option>
                                    <option value="a1">A1</option>
                                </select>
                            </div>
                            <div class="export-setting-row">
                                <label>Orientação</label>
                                <select id="export-pdf-orientation">
                                    <option value="landscape" selected>Paisagem</option>
                                    <option value="portrait">Retrato</option>
                                </select>
                            </div>
                        </div>
                        <div class="export-setting-row">
                            <label>Resolução (DPI)</label>
                            <div class="export-dpi-pills">
                                <button class="export-dpi-pill" data-dpi="72">72</button>
                                <button class="export-dpi-pill active" data-dpi="150">150</button>
                                <button class="export-dpi-pill" data-dpi="300">300</button>
                            </div>
                        </div>
                    </div>

                    <div class="export-settings-section" id="export-bg-section">
                        <div class="export-section-title">Fundo</div>
                        <div class="export-bg-options">
                            <div class="export-bg-swatch white-swatch active" data-bg="#ffffff" title="Branco"></div>
                            <div class="export-bg-swatch light-swatch" data-bg="#f3f4f6" title="Cinza claro"></div>
                            <div class="export-bg-swatch dark-swatch" data-bg="#1f2937" title="Escuro"></div>
                            <div class="export-bg-swatch transparent-swatch" data-bg="transparent" title="Transparente"></div>
                            <div class="export-bg-swatch custom-swatch" data-bg="custom" title="Cor personalizada">
                                <i class="fas fa-eyedropper"></i>
                                <input type="color" class="export-bg-color-input" id="export-custom-bg-color" value="#e0f2fe">
                            </div>
                        </div>
                    </div>

                    <div class="export-settings-section">
                        <div class="export-section-title">Opções</div>
                        <div class="export-toggle-row">
                            <label for="export-toggle-dims">Mostrar cotas</label>
                            <div class="export-toggle">
                                <input type="checkbox" id="export-toggle-dims" checked>
                                <span class="export-toggle-slider"></span>
                            </div>
                        </div>
                        <div class="export-toggle-row">
                            <label for="export-toggle-grid">Mostrar grid</label>
                            <div class="export-toggle">
                                <input type="checkbox" id="export-toggle-grid" checked>
                                <span class="export-toggle-slider"></span>
                            </div>
                        </div>
                        <div class="export-toggle-row">
                            <label for="export-toggle-connections">Mostrar conexões</label>
                            <div class="export-toggle">
                                <input type="checkbox" id="export-toggle-connections">
                                <span class="export-toggle-slider"></span>
                            </div>
                        </div>
                        <div class="export-toggle-row">
                            <label for="export-toggle-metrics">Mostrar métricas</label>
                            <div class="export-toggle">
                                <input type="checkbox" id="export-toggle-metrics">
                                <span class="export-toggle-slider"></span>
                            </div>
                        </div>
                    </div>

                    <div class="export-settings-section">
                        <div class="export-section-title">Arquivo</div>
                        <div class="export-setting-row">
                            <label>Nome do arquivo</label>
                            <input type="text" id="export-filename" value="layout" placeholder="layout">
                        </div>
                    </div>
                </div>

                <div class="export-panel-preview">
                    <div class="export-preview-header">
                        <span class="export-preview-title">Pré-visualização</span>
                        <span class="export-preview-info" id="export-preview-info">--</span>
                    </div>
                    <div class="export-preview-container">
                        <div class="export-preview-canvas-wrapper" id="export-preview-wrapper">
                            <canvas id="export-preview-canvas"></canvas>
                        </div>
                        <div class="export-preview-loading" id="export-preview-loading">
                            <i class="fas fa-circle-notch"></i>
                            <span>Gerando preview...</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="export-modal-footer">
                <div class="export-footer-info">
                    <span class="export-info-badge" id="export-badge-size"><i class="fas fa-ruler-combined"></i> <span>--</span></span>
                    <span class="export-info-badge" id="export-badge-format"><i class="fas fa-file"></i> <span>PNG</span></span>
                    ${hasMultipleFloors ? '<span class="export-info-badge" id="export-badge-floors"><i class="fas fa-layer-group"></i> <span>1 pav.</span></span>' : ''}
                </div>
                <div class="export-footer-actions">
                    <button class="export-btn-cancel">Cancelar</button>
                    <button class="export-btn-export" id="export-btn-go"><i class="fas fa-download"></i> Exportar</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // DOM refs
    const closeBtn = modal.querySelector('.export-modal-close');
    const cancelBtn = modal.querySelector('.export-btn-cancel');
    const exportBtn = modal.querySelector('#export-btn-go');
    const formatTabs = modal.querySelectorAll('.export-format-tab');
    const scopePills = modal.querySelectorAll('.export-scope-pill');
    const bgSwatches = modal.querySelectorAll('.export-bg-swatch');
    const customBgInput = modal.querySelector('#export-custom-bg-color');
    const scaleSlider = modal.querySelector('#export-scale-slider');
    const scaleLabel = modal.querySelector('#export-scale-label');
    const jpegQualitySlider = modal.querySelector('#export-jpeg-quality');
    const jpegQualityLabel = modal.querySelector('#export-jpeg-quality-label');
    const jpegQualityRow = modal.querySelector('#export-jpeg-quality-row');
    const imageSettingsSection = modal.querySelector('#export-image-settings');
    const pdfSettingsSection = modal.querySelector('#export-pdf-settings');
    const bgSection = modal.querySelector('#export-bg-section');
    const paperSizeSelect = modal.querySelector('#export-paper-size');
    const pdfOrientationSelect = modal.querySelector('#export-pdf-orientation');
    const dpiPills = modal.querySelectorAll('.export-dpi-pill');
    const filenameInput = modal.querySelector('#export-filename');
    const toggleDims = modal.querySelector('#export-toggle-dims');
    const toggleGrid = modal.querySelector('#export-toggle-grid');
    const toggleConnections = modal.querySelector('#export-toggle-connections');
    const toggleMetrics = modal.querySelector('#export-toggle-metrics');
    const previewCanvas = modal.querySelector('#export-preview-canvas');
    const previewInfo = modal.querySelector('#export-preview-info');
    const previewLoading = modal.querySelector('#export-preview-loading');
    const badgeSize = modal.querySelector('#export-badge-size span');
    const badgeFormat = modal.querySelector('#export-badge-format span');
    const badgeFloors = modal.querySelector('#export-badge-floors span');
    const floorModePills = modal.querySelectorAll('.export-floor-mode');
    const floorChecklist = modal.querySelector('#export-floor-checklist');
    const floorChecks = modal.querySelectorAll('.export-floor-check');

    // Helper: resolves which floor IDs to export based on exportMode
    function getSelectedFloorIds() {
        if (!hasMultipleFloors) return [];
        if (state.exportMode === 'all') {
            return allFloors.map(f => f.id);
        }
        if (state.exportMode === 'select') {
            return state.selectedFloorIds;
        }
        // 'single' => current floor
        return currentFloor ? [currentFloor] : [];
    }

    function updateFloorBadge() {
        if (!badgeFloors) return;
        const ids = getSelectedFloorIds();
        badgeFloors.textContent = ids.length === 1 ? '1 pav.' : `${ids.length} pav.`;
    }

    // Close
    const closeModal = () => {
        if (previewDebounce) clearTimeout(previewDebounce);
        modal.classList.add('closing');
        setTimeout(() => {
            if (modal.parentNode) document.body.removeChild(modal);
        }, 150);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onEsc); }
    });

    // --- Format tabs ---
    formatTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('disabled')) return;
            formatTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.format = tab.dataset.format;
            updateUIForFormat();
            schedulePreview();
        });
    });

    function updateUIForFormat() {
        const isPDF = state.format === 'pdf';
        const isJPEG = state.format === 'jpeg';

        imageSettingsSection.style.display = isPDF ? 'none' : '';
        pdfSettingsSection.style.display = isPDF ? '' : 'none';
        jpegQualityRow.style.display = isJPEG ? '' : 'none';

        // Transparent not available for jpeg/pdf
        const transpSwatch = modal.querySelector('.transparent-swatch');
        if (isJPEG || isPDF) {
            transpSwatch.style.opacity = '0.3';
            transpSwatch.style.pointerEvents = 'none';
            if (state.background === 'transparent') {
                state.background = '#ffffff';
                bgSwatches.forEach(s => s.classList.remove('active'));
                modal.querySelector('.white-swatch').classList.add('active');
            }
        } else {
            transpSwatch.style.opacity = '';
            transpSwatch.style.pointerEvents = '';
        }

        badgeFormat.textContent = state.format.toUpperCase();
    }

    // --- Scope pills ---
    scopePills.forEach(pill => {
        pill.addEventListener('click', () => {
            if (pill.classList.contains('export-floor-mode')) return; // handled separately
            scopePills.forEach(p => {
                if (!p.classList.contains('export-floor-mode')) p.classList.remove('active');
            });
            pill.classList.add('active');
            state.scope = pill.dataset.scope;
            schedulePreview();
        });
    });

    // --- Floor mode pills ---
    floorModePills.forEach(pill => {
        pill.addEventListener('click', () => {
            floorModePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.exportMode = pill.dataset.mode;

            // Show/hide checklist
            if (floorChecklist) {
                floorChecklist.style.display = state.exportMode === 'select' ? '' : 'none';
            }

            // If switching to 'select' and nothing selected, select current
            if (state.exportMode === 'select' && state.selectedFloorIds.length === 0) {
                state.selectedFloorIds = currentFloor ? [currentFloor] : [];
                floorChecks.forEach(cb => {
                    cb.checked = state.selectedFloorIds.includes(cb.dataset.floorId);
                });
            }

            updateFloorBadge();
            schedulePreview();
        });
    });

    // --- Floor checkboxes ---
    floorChecks.forEach(cb => {
        cb.addEventListener('change', () => {
            const fid = cb.dataset.floorId;
            if (cb.checked) {
                if (!state.selectedFloorIds.includes(fid)) state.selectedFloorIds.push(fid);
            } else {
                state.selectedFloorIds = state.selectedFloorIds.filter(id => id !== fid);
            }
            // Ensure at least one floor is selected
            if (state.selectedFloorIds.length === 0) {
                cb.checked = true;
                state.selectedFloorIds.push(fid);
            }
            updateFloorBadge();
            schedulePreview();
        });
    });

    // --- Scale slider ---
    scaleSlider.addEventListener('input', () => {
        state.scaleFactor = parseFloat(scaleSlider.value);
        scaleLabel.textContent = `${state.scaleFactor}×`;
        schedulePreview();
    });

    // --- JPEG quality ---
    jpegQualitySlider.addEventListener('input', () => {
        state.quality = parseFloat(jpegQualitySlider.value);
        jpegQualityLabel.textContent = `${Math.round(state.quality * 100)}%`;
    });

    // --- Background swatches ---
    bgSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const bgVal = swatch.dataset.bg;
            if (bgVal === 'custom') {
                customBgInput.click();
                return;
            }
            bgSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            state.background = bgVal;
            schedulePreview();
        });
    });

    customBgInput.addEventListener('input', () => {
        state.background = customBgInput.value;
        bgSwatches.forEach(s => s.classList.remove('active'));
        modal.querySelector('.custom-swatch').classList.add('active');
        modal.querySelector('.custom-swatch').style.background = customBgInput.value;
        schedulePreview();
    });

    // --- DPI pills ---
    dpiPills.forEach(pill => {
        pill.addEventListener('click', () => {
            dpiPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.dpi = parseInt(pill.dataset.dpi);
            schedulePreview();
        });
    });

    // --- Toggles ---
    toggleDims.addEventListener('change', () => { state.showDimensions = toggleDims.checked; schedulePreview(); });
    toggleGrid.addEventListener('change', () => { state.showGrid = toggleGrid.checked; schedulePreview(); });
    toggleConnections.addEventListener('change', () => { state.showConnections = toggleConnections.checked; schedulePreview(); });
    toggleMetrics.addEventListener('change', () => { state.showMetrics = toggleMetrics.checked; schedulePreview(); });

    // --- PDF selects ---
    paperSizeSelect.addEventListener('change', () => { state.paperSize = paperSizeSelect.value; schedulePreview(); });
    pdfOrientationSelect.addEventListener('change', () => { state.orientation = pdfOrientationSelect.value; schedulePreview(); });

    // --- Filename ---
    filenameInput.addEventListener('input', () => { state.filename = filenameInput.value.trim() || 'layout'; });

    // =========== PREVIEW RENDERING ===========
    function schedulePreview() {
        if (previewDebounce) clearTimeout(previewDebounce);
        previewLoading.classList.add('visible');
        previewDebounce = setTimeout(() => renderPreview(), 250);
    }

    async function renderPreview() {
        try {
            const floorIds = getSelectedFloorIds();

            // Get bounds - multi-floor aware
            let bounds;
            if (state.scope === 'viewport') {
                bounds = getViewportBounds();
            } else if (floorIds.length > 1) {
                bounds = getMultiFloorContentBounds(floorIds);
            } else {
                bounds = getContentBounds();
            }

            if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
                previewLoading.classList.remove('visible');
                return;
            }

            const scaleValue = typeof getScale === 'function' ? Number(getScale()) : 1;
            const viewScale = Number.isFinite(scaleValue) && scaleValue > 0 ? scaleValue : 1;

            // Use a small preview scale to keep it fast
            const maxPreviewDim = 600;
            const previewScale = Math.min(
                maxPreviewDim / (bounds.width * viewScale),
                maxPreviewDim / (bounds.height * viewScale),
                2
            );

            const previousViewScale = CURRENT_EXPORT_VIEW_SCALE;
            updateExportViewScale();

            const tempCanvas = document.createElement('canvas');
            const pw = Math.ceil(bounds.width * previewScale * viewScale);
            const ph = Math.ceil(bounds.height * previewScale * viewScale);
            tempCanvas.width = pw;
            tempCanvas.height = ph;

            const tempCtx = tempCanvas.getContext('2d');

            // Background
            if (state.background === 'transparent') {
                tempCtx.clearRect(0, 0, pw, ph);
            } else {
                tempCtx.fillStyle = state.background;
                tempCtx.fillRect(0, 0, pw, ph);
            }

            tempCtx.save();
            tempCtx.scale(previewScale * viewScale, previewScale * viewScale);
            tempCtx.translate(-bounds.minX, -bounds.minY);

            // Get the floors to render
            const floorsData = _getFloorsToRender(floorIds);

            for (const floor of floorsData) {
                const floorAreas = floor.movementAreas || [];
                const floorWalls = floor.walls || [];
                const floorResources = floor.resources || [];

                // Render areas
                floorAreas.forEach(area => {
                    if (state.showGrid) {
                        drawExportMovementArea(tempCtx, area, previewScale);
                    } else {
                        drawExportMovementAreaNoGrid(tempCtx, area, previewScale);
                    }
                    if (state.showDimensions) {
                        drawExportDimensions(tempCtx, area, previewScale);
                    }
                });

                // Walls
                if (floorWalls.length > 0) {
                    drawExportWalls(tempCtx, floorWalls, previewScale);
                    if (state.showDimensions) drawExportWallDimensions(tempCtx, floorWalls, previewScale);
                }

                // Free lines
                const floorFreeLines = floor.freeLines || [];
                if (floorFreeLines.length > 0) {
                    drawExportFreeLines(tempCtx, floorFreeLines, previewScale);
                }

                // Openings (docas)
                const floorOpenings = floor.openings || [];
                if (floorOpenings.length > 0) {
                    drawExportOpenings(tempCtx, floorOpenings, previewScale);
                }

                // Resources
                if (floorResources.length > 0) {
                    drawExportResources(tempCtx, floorResources, previewScale);
                    if (state.showDimensions) drawExportResourceDimensions(tempCtx, floorResources, previewScale);
                }

                // Connections
                if (state.showConnections) {
                    const floorConnections = floor.connections || ((!floorIds || floorIds.length === 0) ? getConnections() : []);
                    if (floorConnections.length > 0) {
                        drawExportConnections(tempCtx, floorConnections, previewScale);
                    }
                }
            }

            tempCtx.restore();
            CURRENT_EXPORT_VIEW_SCALE = previousViewScale;

            // Composite with metrics panel if enabled
            let finalCanvas = tempCanvas;
            let finalW = pw;
            let finalH = ph;

            if (state.showMetrics) {
                const metricsResult = renderMetricsPanel();
                if (metricsResult) {
                    const metricsScale = ph / metricsResult.height;
                    const metricsDrawW = Math.ceil(metricsResult.width * metricsScale);
                    const gap = 2;

                    finalW = pw + gap + metricsDrawW;
                    finalH = ph;

                    finalCanvas = document.createElement('canvas');
                    finalCanvas.width = finalW;
                    finalCanvas.height = finalH;
                    const fCtx = finalCanvas.getContext('2d');

                    if (state.background !== 'transparent') {
                        fCtx.fillStyle = state.background;
                        fCtx.fillRect(0, 0, finalW, finalH);
                    }

                    fCtx.drawImage(tempCanvas, 0, 0);
                    fCtx.drawImage(metricsResult.canvas, 0, 0, metricsResult.canvas.width, metricsResult.canvas.height,
                        pw + gap, 0, metricsDrawW, ph);
                }
            }

            // Display on preview canvas
            previewCanvas.width = finalW;
            previewCanvas.height = finalH;
            const pCtx = previewCanvas.getContext('2d');
            pCtx.clearRect(0, 0, finalW, finalH);
            pCtx.drawImage(finalCanvas, 0, 0);

            // Update info
            const exportW = Math.round(bounds.width * state.scaleFactor * viewScale);
            const exportH = Math.round(bounds.height * state.scaleFactor * viewScale);
            previewInfo.textContent = `${exportW} × ${exportH} px`;
            badgeSize.textContent = `${exportW} × ${exportH}`;
        } catch (err) {
            console.warn('Erro ao gerar preview:', err);
        }
        previewLoading.classList.remove('visible');
    }

    // Helper: draw area without grid (for toggle)
    function drawExportMovementAreaNoGrid(ctx, area, scale) {
        if (!area) return;
        ctx.save();
        if (area.vertices && area.vertices.length < 3) { ctx.restore(); return; }

        ctx.fillStyle = state.background === 'transparent' ? '#FFFFFF' : '#FFFFFF';

        if (area.rings && area.rings.length > 0) {
            ctx.beginPath();
            const outerRing = area.rings[0];
            if (outerRing && outerRing.length > 0) {
                ctx.moveTo(outerRing[0][0], outerRing[0][1]);
                for (let i = 1; i < outerRing.length; i++) ctx.lineTo(outerRing[i][0], outerRing[i][1]);
                ctx.closePath();
                ctx.fill();
            }
            if (area.rings.length > 1) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.fillStyle = '#000000';
                for (let i = 1; i < area.rings.length; i++) {
                    const holeRing = area.rings[i];
                    if (holeRing && holeRing.length > 0) {
                        ctx.beginPath();
                        ctx.moveTo(holeRing[0][0], holeRing[0][1]);
                        for (let j = 1; j < holeRing.length; j++) ctx.lineTo(holeRing[j][0], holeRing[j][1]);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
        } else if (area.vertices && area.vertices.length > 0) {
            ctx.beginPath();
            ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
            for (let i = 1; i < area.vertices.length; i++) ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillRect(area.x, area.y, area.width, area.height);
        }

        ctx.strokeStyle = area.locked ? '#A0A0A0' : '#333333';
        ctx.lineWidth = getScaledLineWidth(2, 0.3);

        ctx.beginPath();
        if (area.vertices && area.vertices.length > 0) {
            ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
            for (let i = 1; i < area.vertices.length; i++) ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
            ctx.closePath();
            ctx.stroke();
        } else if (!area.rings) {
            ctx.strokeRect(area.x, area.y, area.width, area.height);
        }

        if (area.rings && area.rings.length > 1) {
            for (let i = 1; i < area.rings.length; i++) {
                const holeRing = area.rings[i];
                if (holeRing && holeRing.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(holeRing[0][0], holeRing[0][1]);
                    for (let j = 1; j < holeRing.length; j++) ctx.lineTo(holeRing[j][0], holeRing[j][1]);
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    // =========== EXPORT ACTION ===========
    exportBtn.addEventListener('click', async () => {
        const fname = state.filename || 'layout';
        const floorIds = getSelectedFloorIds();
        exportBtn.classList.add('exporting');
        exportBtn.querySelector('i').className = 'fas fa-spinner';

        try {
            if (state.format === 'pdf') {
                await exportToPDF(`${fname}.pdf`, {
                    quality: state.quality,
                    format: state.paperSize,
                    orientation: state.orientation,
                    dpi: state.dpi,
                    matchViewport: state.scope === 'viewport',
                    background: state.background,
                    showDimensions: state.showDimensions,
                    showGrid: state.showGrid,
                    showConnections: state.showConnections,
                    showMetrics: state.showMetrics,
                    floorIds: floorIds,
                });
            } else {
                await exportToImage(`${fname}.${state.format}`, {
                    quality: state.format === 'jpeg' ? state.quality : 1.0,
                    format: state.format,
                    matchViewport: state.scope === 'viewport',
                    background: state.background,
                    scaleFactor: state.scaleFactor,
                    showDimensions: state.showDimensions,
                    showGrid: state.showGrid,
                    showConnections: state.showConnections,
                    showMetrics: state.showMetrics,
                    floorIds: floorIds,
                });
            }
            closeModal();
        } catch (err) {
            console.error('Export error:', err);
            showExportError('Erro ao exportar: ' + err.message);
        }

        exportBtn.classList.remove('exporting');
        exportBtn.querySelector('i').className = 'fas fa-download';
    });

    // Initial render
    updateUIForFormat();
    updateFloorBadge();
    schedulePreview();
    filenameInput.focus();
    filenameInput.select();
}

/**
 * Mostra feedback de sucesso
 */
function showExportSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'export-toast export-toast-success';
    toast.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('export-toast-show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('export-toast-show');
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Mostra feedback de erro
 */
function showExportError(message) {
    const toast = document.createElement('div');
    toast.className = 'export-toast export-toast-error';
    toast.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('export-toast-show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('export-toast-show');
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 5000);
}

/**
 * Inicializa o sistema de exportação
 */
function initializeExport() {
    const exportBtn = document.getElementById('exportImgBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', showExportModal);
    }
}

// Exportar funções
export {
    exportToPDF,
    exportToImage,
    showExportModal,
    initializeExport,
    getContentBounds
};
