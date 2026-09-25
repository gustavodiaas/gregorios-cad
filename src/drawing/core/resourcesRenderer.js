import {
    resources,
    movementAreas,
    getSelectedResourceIds,
    getSelectedResourceId,
    getHoveredResourceId,
    getIsDragging,
    getIsDrawingResource,
    getCurrentResourceRect,
    getIsDrawingStair,
    getCurrentStairRect,
    getCtx,
    getScale
} from '../../state.js';
import {
    pixelsPerCm,
    dimensionOffset,
    dimensionExtension,
    dimensionLineWidth,
    getDimensionColor,
    DIMENSION_SYSTEM,
    resourceSelectedColor,
    resourceHoverColor,
    getGlobalShowDimensions
} from '../../config.js';
import { formatLength } from '../../measurement-units.js';
import {
    drawAdjacentResourcesDimensions,
    drawInterResourceDimensions,
    drawDimensionLine,
    drawSegmentDimension
} from '../dimensions.js';
import { dimensionDeclutter } from '../dimension-declutter.js';
import { migrateResourceToPolygonal, getPolygonCentroid, isStairResource } from '../../resources.js';
import { getOperatorSpriteMeta } from '../../operators.js';
import { calculateBoundingBox } from '../../areas.js';
import { drawNavMeshNodes, showNavMeshNodes } from './navmeshVisualizer.js';
import { getResourceImage } from '../../resource-image.js';

const STAIR_STEP_SPACING_CM = 20;

function drawAllResources() {
    const selectedResourceIds = getSelectedResourceIds();
    const selectedResourceId = getSelectedResourceId();
    const hoveredResourceId = getHoveredResourceId();
    const selectedResourceSet = new Set(selectedResourceIds);

    const renderOrder = [
        ...resources.filter(resource => resource.machineType !== 'overhead-crane'),
        ...resources.filter(resource => resource.machineType === 'overhead-crane')
    ];

    renderOrder.forEach(resource => {
        if (resource._plannerHidden) {
            return;
        }
        if (resource.visible === false) {
            return;
        }
        const isSelected = selectedResourceSet.has(resource.id);
        const isHovered = resource.id === hoveredResourceId;
        drawResource(resource, isSelected, isHovered);
    });

    resources.forEach(resource => {
        if (resource._plannerHidden) {
            return;
        }
        if (resource.visible === false) {
            return;
        }
        drawResourceDimensionsImproved(resource);
    });

    drawAdjacentResourcesDimensions();

    if (getIsDragging() && selectedResourceId) {
        const movingResource = resources.find(r => r.id === selectedResourceId);
        if (movingResource) {
            drawInterResourceDimensions(movingResource);
        }
    }

    drawResourceCreationPreview();

    if (showNavMeshNodes) {
        movementAreas.forEach(area => {
            drawNavMeshNodes(area);
        });
    }
}

function drawResourceCreationPreview() {
    if (!getIsDrawingResource()) {
        return;
    }

    const ctx = getCtx();
    const currentRect = getCurrentResourceRect();
    if (!currentRect || currentRect.width === 0 || currentRect.height === 0) {
        return;
    }

    ctx.save();

    const finalX = currentRect.width < 0 ? currentRect.x + currentRect.width : currentRect.x;
    const finalY = currentRect.height < 0 ? currentRect.y + currentRect.height : currentRect.y;
    const finalWidth = Math.abs(currentRect.width);
    const finalHeight = Math.abs(currentRect.height);

    ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
    ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)';
    ctx.lineWidth = 2 / getScale();
    ctx.setLineDash([5 / getScale(), 5 / getScale()]);

    ctx.fillRect(finalX, finalY, finalWidth, finalHeight);
    ctx.strokeRect(finalX, finalY, finalWidth, finalHeight);

    const previewWidthCm = Math.round(finalWidth / pixelsPerCm);
    const previewHeightCm = Math.round(finalHeight / pixelsPerCm);
    const offsetVal_world = dimensionOffset;
    const yDimLineY = finalY + finalHeight + offsetVal_world;
    const xDimLineX = finalX + finalWidth + offsetVal_world;
    const extensionScaled = dimensionExtension / getScale();

    ctx.setLineDash([]);
    ctx.strokeStyle = getDimensionColor();
    ctx.lineWidth = dimensionLineWidth / getScale();

    ctx.beginPath();
    ctx.moveTo(finalX, finalY + finalHeight);
    ctx.lineTo(finalX, yDimLineY + extensionScaled);
    ctx.moveTo(finalX + finalWidth, finalY + finalHeight);
    ctx.lineTo(finalX + finalWidth, yDimLineY + extensionScaled);
    ctx.stroke();

    drawDimensionLine(finalX, yDimLineY, finalX + finalWidth, yDimLineY, formatLength(previewWidthCm), 'below');

    ctx.beginPath();
    ctx.moveTo(finalX + finalWidth, finalY);
    ctx.lineTo(xDimLineX + extensionScaled, finalY);
    ctx.moveTo(finalX + finalWidth, finalY + finalHeight);
    ctx.lineTo(xDimLineX + extensionScaled, finalY + finalHeight);
    ctx.stroke();

    drawDimensionLine(xDimLineX, finalY, xDimLineX, finalY + finalHeight, formatLength(previewHeightCm), 'right');

    ctx.restore();
}

function drawStairCreationPreview() {
    if (!getIsDrawingStair()) {
        return;
    }

    const ctx = getCtx();
    const stairRect = getCurrentStairRect();
    if (!stairRect) {
        return;
    }

    const width = stairRect.width;
    const height = stairRect.height;
    if (width === 0 && height === 0) {
        return;
    }

    const finalX = width < 0 ? stairRect.x + width : stairRect.x;
    const finalY = height < 0 ? stairRect.y + height : stairRect.y;
    const finalWidth = Math.abs(width);
    const finalHeight = Math.abs(height);
    if (finalWidth === 0 || finalHeight === 0) {
        return;
    }

    const scaleValue = getScale();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.9)';
    ctx.lineWidth = 1.5 / scaleValue;
    ctx.setLineDash([8 / scaleValue, 4 / scaleValue]);
    ctx.fillRect(finalX, finalY, finalWidth, finalHeight);
    ctx.strokeRect(finalX, finalY, finalWidth, finalHeight);
    ctx.setLineDash([]);

    const isHorizontal = finalWidth >= finalHeight;
    const orientation = {
        axis: isHorizontal ? 'horizontal' : 'vertical',
        direction: isHorizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
        major: Math.max(finalWidth, finalHeight),
        minor: Math.min(finalWidth, finalHeight),
        center: {
            x: finalX + finalWidth / 2,
            y: finalY + finalHeight / 2
        },
        stepSpacing: STAIR_STEP_SPACING_CM * pixelsPerCm
    };

    const bounds = { x: finalX, y: finalY, width: finalWidth, height: finalHeight };

    drawStairSteps(ctx, bounds, orientation);
    drawStairArrow(ctx, orientation);

    ctx.restore();
}

function normalizeLabelAnchorPoint(anchor) {
    if (!anchor) {
        return null;
    }
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

function normalizeAngleForLabel(angle) {
    if (!Number.isFinite(angle)) {
        return 0;
    }
    let result = angle;
    while (result <= -Math.PI) {
        result += Math.PI * 2;
    }
    while (result > Math.PI) {
        result -= Math.PI * 2;
    }
    if (result > Math.PI / 2) {
        result -= Math.PI;
    } else if (result <= -Math.PI / 2) {
        result += Math.PI;
    }
    return result;
}

function projectPolygonOntoAxes(vertices, angle) {
    if (!Array.isArray(vertices) || vertices.length === 0) {
        return { major: 0, minor: 0, centerX: 0, centerY: 0 };
    }

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minAlong = Infinity;
    let maxAlong = -Infinity;
    let minPerp = Infinity;
    let maxPerp = -Infinity;

    for (const vertex of vertices) {
        if (!Array.isArray(vertex) || vertex.length < 2) {
            continue;
        }
        const [x, y] = vertex;
        const along = x * cos + y * sin;
        const perp = -x * sin + y * cos;
        if (along < minAlong) minAlong = along;
        if (along > maxAlong) maxAlong = along;
        if (perp < minPerp) minPerp = perp;
        if (perp > maxPerp) maxPerp = perp;
    }

    const major = Number.isFinite(maxAlong - minAlong) ? Math.max(maxAlong - minAlong, 0) : 0;
    const minor = Number.isFinite(maxPerp - minPerp) ? Math.max(maxPerp - minPerp, 0) : 0;
    const centerAlong = (minAlong + maxAlong) / 2;
    const centerPerp = (minPerp + maxPerp) / 2;

    return {
        major,
        minor,
        centerX: centerAlong * cos - centerPerp * sin,
        centerY: centerAlong * sin + centerPerp * cos
    };
}

function computeLongestEdgeData(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 2) {
        return { length: 0, angle: 0 };
    }

    let longestLength = 0;
    let angle = 0;
    for (let i = 0; i < vertices.length; i++) {
        const current = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        if (!current || !next) {
            continue;
        }
        const dx = next[0] - current[0];
        const dy = next[1] - current[1];
        const length = Math.hypot(dx, dy);
        if (length > longestLength) {
            longestLength = length;
            angle = Math.atan2(dy, dx);
        }
    }

    return { length: longestLength, angle };
}

function getResourceVerticesForLabel(resource, migratedResource) {
    if (resource && Array.isArray(resource.rings) && resource.rings.length > 0) {
        const outer = resource.rings[0];
        if (Array.isArray(outer) && outer.length >= 3) {
            return outer;
        }
    }
    if (migratedResource && Array.isArray(migratedResource.vertices) && migratedResource.vertices.length >= 3) {
        return migratedResource.vertices;
    }
    if (resource && Array.isArray(resource.vertices) && resource.vertices.length >= 3) {
        return resource.vertices;
    }
    return null;
}

function computeResourceLabelGeometry(resource, migratedResource) {
    const fallbackBox = migratedResource?.boundingBox || {
        x: resource?.x ?? 0,
        y: resource?.y ?? 0,
        width: resource?.width ?? 0,
        height: resource?.height ?? 0
    };

    const fallbackCenterX = fallbackBox.x + (fallbackBox.width || 0) / 2;
    const fallbackCenterY = fallbackBox.y + (fallbackBox.height || 0) / 2;

    const fallbackGeometry = {
        centerX: fallbackCenterX,
        centerY: fallbackCenterY,
        major: Math.max(fallbackBox.width || 0, 0),
        minor: Math.max(fallbackBox.height || 0, 0),
        angle: 0
    };

    const vertices = getResourceVerticesForLabel(resource, migratedResource);
    const anchor = normalizeLabelAnchorPoint(resource?.labelAnchor);

    if (!vertices) {
        if (anchor) {
            fallbackGeometry.centerX = anchor.x;
            fallbackGeometry.centerY = anchor.y;
        }
        if (Number.isFinite(resource?.labelAngle)) {
            fallbackGeometry.angle = normalizeAngleForLabel(resource.labelAngle);
        }
        return fallbackGeometry;
    }

    const longestEdge = computeLongestEdgeData(vertices);
    const hasStoredAngle = Number.isFinite(resource?.labelAngle);
    let angle = hasStoredAngle ? resource.labelAngle : longestEdge.angle;
    angle = normalizeAngleForLabel(angle);

    let projected = projectPolygonOntoAxes(vertices, angle);
    if (!hasStoredAngle && projected.minor > projected.major) {
        angle = normalizeAngleForLabel(angle + Math.PI / 2);
        projected = projectPolygonOntoAxes(vertices, angle);
    }

    const centerPoint = anchor || (() => {
        const centroid = getPolygonCentroid(vertices);
        if (Array.isArray(centroid) && centroid.length >= 2) {
            return { x: centroid[0], y: centroid[1] };
        }
        return { x: fallbackCenterX, y: fallbackCenterY };
    })();

    const fallbackMajor = Math.max(fallbackGeometry.major, fallbackGeometry.minor);
    const fallbackMinor = Math.min(fallbackGeometry.major, fallbackGeometry.minor);

    const major = projected.major > 0 ? projected.major : fallbackMajor;
    const minor = projected.minor > 0 ? projected.minor : (fallbackMinor > 0 ? fallbackMinor : fallbackMajor);

    return {
        centerX: centerPoint.x,
        centerY: centerPoint.y,
        major,
        minor,
        angle
    };
}

/**
 * Returns true if the given hex color is light (high luminance)
 */
function isLightColor(hex) {
    if (!hex) return false;
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    // Relative luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
}

function drawResourceNameAdaptive(ctx, resourceName, labelGeometry, scaleValue, resourceColor) {
    if (!resourceName || !resourceName.trim() || !labelGeometry) {
        return;
    }

    const padding = 4 / scaleValue;
    const availableAlong = (labelGeometry.major || 0) - padding * 2;
    const availableAcross = (labelGeometry.minor || 0) - padding * 2;

    if (availableAlong <= 0 || availableAcross <= 0) {
        return;
    }

    const minAlongThreshold = 20 / scaleValue;
    const minAcrossThreshold = 8 / scaleValue;

    if (availableAlong < minAlongThreshold || availableAcross < minAcrossThreshold) {
        return;
    }

    const maxFontSize = Math.min(availableAcross * 0.6, DIMENSION_SYSTEM.maxFontSize / scaleValue);
    const minFontSize = Math.max(6 / scaleValue, DIMENSION_SYSTEM.minFontSize / scaleValue);

    let fontSize = maxFontSize;
    let textWidth;

    do {
        ctx.font = `${fontSize}px Arial`;
        textWidth = ctx.measureText(resourceName).width;
        if (textWidth <= availableAlong || fontSize <= minFontSize) {
            break;
        }
        fontSize *= 0.9;
    } while (fontSize > minFontSize);

    let finalText = resourceName;
    if (textWidth > availableAlong && fontSize <= minFontSize) {
        const ellipsis = '...';
        const ellipsisWidth = ctx.measureText(ellipsis).width;
        const availableForText = availableAlong - ellipsisWidth;

        let truncatedText = resourceName;
        let truncatedWidth = ctx.measureText(truncatedText).width;

        while (truncatedWidth > availableForText && truncatedText.length > 1) {
            truncatedText = truncatedText.slice(0, -1);
            truncatedWidth = ctx.measureText(truncatedText).width;
        }

        finalText = truncatedText.length > 1 ? truncatedText + ellipsis : resourceName.charAt(0);
    }

    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(labelGeometry.centerX, labelGeometry.centerY);
    ctx.rotate(labelGeometry.angle || 0);

    const light = isLightColor(resourceColor);
    ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(finalText, 1 / scaleValue, 1 / scaleValue);

    ctx.fillStyle = light ? '#000000' : '#ffffff';
    ctx.fillText(finalText, 0, 0);
    ctx.restore();
}

function drawResource(resource, isSelected = false, isHovered = false) {
    const ctx = getCtx();
    const migratedResource = migrateResourceToPolygonal(resource);
    const stairResource = isStairResource(resource);
    const operatorResource = resource?.type === 'operator';
    const machineResource = Boolean(resource?.machineType);
    const bb = getResourceBoundsForRendering(migratedResource, resource);

    ctx.save();

    // Determinar cor de preenchimento baseado no estado
    let fillColor = resource.color || '#ff6b35';
    if (isSelected) {
        fillColor = 'rgba(239, 68, 68, 0.85)'; // Vermelho para selecionado
    } else if (isHovered) {
        fillColor = 'rgba(245, 158, 11, 0.85)'; // Laranja para hover
    }

    if (operatorResource) {
        drawOperatorResource(ctx, bb, resource, isSelected, isHovered);
    } else if (migratedResource.vertices && migratedResource.vertices.length > 0) {
        ctx.beginPath();
        ctx.moveTo(migratedResource.vertices[0][0], migratedResource.vertices[0][1]);
        for (let i = 1; i < migratedResource.vertices.length; i++) {
            ctx.lineTo(migratedResource.vertices[i][0], migratedResource.vertices[i][1]);
        }
        ctx.closePath();
        if (!machineResource) {
            ctx.fillStyle = fillColor;
            ctx.fill();
        }

        // Desenhar imagem colada (clipped ao polígono, com rotação)
        const resourceImg = getResourceImage(resource);
        if (resourceImg) {
            ctx.save();
            if (resource.machineType && resource.machineType !== 'overhead-crane') {
                ctx.filter = 'grayscale(1) contrast(1.08)';
            }
            ctx.beginPath();
            ctx.moveTo(migratedResource.vertices[0][0], migratedResource.vertices[0][1]);
            for (let i = 1; i < migratedResource.vertices.length; i++) {
                ctx.lineTo(migratedResource.vertices[i][0], migratedResource.vertices[i][1]);
            }
            ctx.closePath();
            ctx.clip();

            const rotation = (resource.rotation || 0) * Math.PI / 180;
            if (Math.abs(rotation) > 0.001) {
                // Recurso rotacionado: calcular BB local (des-rotacionado) e desenhar com rotação
                const centroidArr = getPolygonCentroid(migratedResource.vertices);
                const cx = centroidArr[0];
                const cy = centroidArr[1];
                const cosR = Math.cos(-rotation);
                const sinR = Math.sin(-rotation);
                let minLX = Infinity, maxLX = -Infinity, minLY = Infinity, maxLY = -Infinity;
                for (const v of migratedResource.vertices) {
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

        if (isSelected) {
            ctx.strokeStyle = resourceSelectedColor;
            ctx.lineWidth = 3 / getScale();
        } else if (isHovered) {
            ctx.strokeStyle = resourceHoverColor;
            ctx.lineWidth = 2.5 / getScale();
        } else if (!machineResource) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1 / getScale();
        }
        if (isSelected || isHovered || !machineResource) ctx.stroke();
    } else {
        if (!machineResource) {
            ctx.fillStyle = fillColor;
            ctx.fillRect(resource.x, resource.y, resource.width, resource.height);
        }

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

        if (isSelected) {
            ctx.strokeStyle = resourceSelectedColor;
            ctx.lineWidth = 3 / getScale();
        } else if (isHovered) {
            ctx.strokeStyle = resourceHoverColor;
            ctx.lineWidth = 2.5 / getScale();
        } else if (!machineResource) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1 / getScale();
        }
        if (isSelected || isHovered || !machineResource) {
            ctx.strokeRect(resource.x, resource.y, resource.width, resource.height);
        }
    }

    if (stairResource) {
        drawStairDetails(ctx, migratedResource, resource);
    }

    if (!stairResource && resource.type !== 'operator' && resource.name && resource.name.trim()) {
        const labelGeometry = computeResourceLabelGeometry(resource, migratedResource);
        drawResourceNameAdaptive(ctx, resource.name, labelGeometry, getScale(), resource.color);
    }

    if (resource.locked) {
        const iconSize = 12 / getScale();
        const padding = 5 / getScale();
        const iconX = bb.x + bb.width - iconSize - padding;
        const iconY = bb.y + padding;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 / getScale();
        ctx.fillRect(iconX, iconY + iconSize * 0.4, iconSize, iconSize * 0.6);
        ctx.strokeRect(iconX, iconY + iconSize * 0.4, iconSize, iconSize * 0.6);
        ctx.beginPath();
        ctx.arc(iconX + iconSize / 2, iconY + iconSize * 0.4, iconSize * 0.3, Math.PI, 0);
        ctx.stroke();
    }

    // Desenhar badge de estoque (unificado: _liveStock do planner ou initialStock estático)
    const effectiveStock = resource._liveStock !== undefined ? resource._liveStock : (resource.initialStock || 0);
    if (effectiveStock > 0) {
        drawInitialStockBadge(ctx, bb, effectiveStock, getScale());
    }

    ctx.restore();
}

/**
 * Desenha o badge de estoque inicial no canto superior-direito do recurso.
 * Visual: fundo com borda arredondada contendo triângulo preto + número,
 * idêntico ao estilo dos tokens de acabados do planner.
 * Todas as dimensões são compensadas pela escala para manter tamanho constante na tela.
 */
function drawInitialStockBadge(ctx, bb, stockCount, scaleValue) {
    ctx.save();

    // Escala adaptativa: manter tamanho constante na tela, mas limitar
    // proporcionalmente ao tamanho do recurso para não dominar visualmente
    const resourceMinDim = Math.min(bb.width, bb.height);
    let s = scaleValue;

    // Altura aproximada do badge com escala pura: (paddingV*2 + fontSize) / s ≈ 21 / s
    const approxBadgeHeight = 21 / s;
    // Limitar badge a no máximo 40% da menor dimensão do recurso
    const maxBadgeHeight = resourceMinDim * 0.4;
    if (approxBadgeHeight > maxBadgeHeight && maxBadgeHeight > 0) {
        s = 21 / maxBadgeHeight;
    }

    // Verificar legibilidade mínima: fonte deve ter pelo menos 7px na tela
    const screenFont = 13 / s * scaleValue;
    if (screenFont < 7) {
        ctx.restore();
        return;
    }

    const fontSize = 13 / s;
    const triangleSize = 10 / s;
    const paddingH = 7 / s;
    const paddingV = 4 / s;
    const gap = 4 / s;
    const borderRadius = 6 / s;
    const borderWidth = 1.5 / s;

    const text = String(stockCount);
    ctx.font = `bold ${fontSize}px Arial`;
    const textWidth = ctx.measureText(text).width;

    // Largura total do badge: padding + triângulo + gap + texto + padding
    const badgeWidth = paddingH + triangleSize + gap + textWidth + paddingH;
    const badgeHeight = paddingV + Math.max(triangleSize, fontSize) + paddingV;

    // Posicionar no canto inferior-direito do bounding box, com leve offset para dentro
    const offsetFromEdge = 4 / s;
    const badgeX = bb.x + bb.width - badgeWidth - offsetFromEdge;
    const badgeY = bb.y + bb.height - badgeHeight - offsetFromEdge;

    // Fundo do badge (semi-transparente com borda)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = borderWidth;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, borderRadius);
    ctx.fill();
    ctx.stroke();

    // Triângulo preto (apontando para cima)
    const triCenterX = badgeX + paddingH + triangleSize / 2;
    const triCenterY = badgeY + badgeHeight / 2;
    const triHalf = triangleSize / 2;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(triCenterX, triCenterY - triHalf);           // topo
    ctx.lineTo(triCenterX + triHalf, triCenterY + triHalf);  // canto inferior direito
    ctx.lineTo(triCenterX - triHalf, triCenterY + triHalf);  // canto inferior esquerdo
    ctx.closePath();
    ctx.fill();

    // Número do estoque
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, badgeX + paddingH + triangleSize + gap, badgeY + badgeHeight / 2);

    ctx.restore();
}

function drawOperatorResource(ctx, bounds, resource, isSelected, isHovered = false) {
    const { image, loaded } = getOperatorSpriteMeta(resource?.spriteKey);

    // Desenhar overlay de fundo colorido para hover/seleção (antes da imagem)
    if (isSelected || isHovered) {
        if (isSelected) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'; // Vermelho semi-transparente
        } else {
            ctx.fillStyle = 'rgba(245, 158, 11, 0.5)'; // Laranja semi-transparente
        }
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    if (loaded && image) {
        ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
    } else {
        ctx.fillStyle = 'rgba(55, 65, 81, 0.35)';
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // Borda para selecionado/hover
    if (isSelected) {
        ctx.strokeStyle = resourceSelectedColor;
        ctx.lineWidth = 3 / getScale();
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    } else if (isHovered) {
        ctx.strokeStyle = resourceHoverColor;
        ctx.lineWidth = 2.5 / getScale();
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // Desenhar número do operador ao lado do sprite
    const operatorNumber = getOperatorNumber(resource);
    if (operatorNumber) {
        const currentScale = getScale();
        const fontSize = 10 / currentScale;
        const labelX = bounds.x + bounds.width + (4 / currentScale);
        const labelY = bounds.y + (fontSize / 2) + (2 / currentScale);

        ctx.save();
        
        // Fundo para melhor legibilidade
        ctx.font = `bold ${fontSize}px Arial`;
        const textWidth = ctx.measureText(operatorNumber).width;
        const padding = 2 / currentScale;
        
        ctx.fillStyle = 'rgba(99, 102, 241, 0.85)';
        ctx.beginPath();
        ctx.roundRect(
            labelX - padding,
            labelY - fontSize / 2 - padding,
            textWidth + padding * 2,
            fontSize + padding * 2,
            3 / currentScale
        );
        ctx.fill();

        // Texto do número
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(operatorNumber, labelX, labelY);
        
        ctx.restore();
    }
}

function getOperatorNumber(resource) {
    if (!resource?.name) {
        return null;
    }
    // Extrair número do nome "Operador X"
    const match = resource.name.match(/Operador\s*(\d+)/i);
    if (match) {
        return match[1];
    }
    // Se não encontrar padrão, retornar nome completo se for curto
    if (resource.name.length <= 3) {
        return resource.name;
    }
    return null;
}

function getResourceBoundsForRendering(migratedResource, fallbackResource) {
    if (migratedResource?.boundingBox && migratedResource.boundingBox.width && migratedResource.boundingBox.height) {
        return migratedResource.boundingBox;
    }
    if (migratedResource?.vertices && migratedResource.vertices.length >= 3) {
        return calculateBoundingBox(migratedResource.vertices);
    }
    return {
        x: fallbackResource?.x ?? 0,
        y: fallbackResource?.y ?? 0,
        width: fallbackResource?.width ?? 0,
        height: fallbackResource?.height ?? 0
    };
}

function drawStairDetails(ctx, migratedResource, originalResource) {
    const stairConfig = originalResource?.stairConfig;
    const orientation = stairConfig?.orientation;
    if (!orientation) {
        return;
    }

    const bounds = migratedResource?.boundingBox && migratedResource.boundingBox.width && migratedResource.boundingBox.height
        ? migratedResource.boundingBox
        : calculateBoundingBox(migratedResource.vertices);
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
        return;
    }

    ctx.save();
    drawStairPortalShade(ctx, orientation, stairConfig.role);
    drawStairSteps(ctx, bounds, orientation);
    drawStairArrow(ctx, orientation);
    ctx.restore();
}

function drawStairPortalShade(ctx, orientation, role = 'lower') {
    const portal = role === 'lower' ? orientation.exitPortal : orientation.entryPortal;
    if (!portal || portal.length < 3) {
        return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(portal[0][0], portal[0][1]);
    for (let i = 1; i < portal.length; i++) {
        ctx.lineTo(portal[i][0], portal[i][1]);
    }
    ctx.closePath();

    ctx.fillStyle = role === 'lower'
        ? 'rgba(0, 0, 0, 0.08)'
        : 'rgba(0, 0, 0, 0.05)';
    ctx.fill();
    ctx.restore();
}

function drawStairSteps(ctx, bounds, orientation) {
    if (!orientation) {
        return;
    }

    const scaleValue = getScale();
    const margin = Math.min(orientation.minor * 0.12, 8);
    const length = orientation.axis === 'horizontal' ? bounds.width : bounds.height;
    if (length <= 0) {
        return;
    }

    const stepSpacing = orientation.stepSpacing || (STAIR_STEP_SPACING_CM * pixelsPerCm);
    const startDistance = margin + stepSpacing * 0.5;
    const endDistance = length - margin;
    const hasSpacing = endDistance > margin;

    const positiveDirection = orientation.axis === 'horizontal'
        ? orientation.direction.x >= 0
        : orientation.direction.y >= 0;

    ctx.save();
    ctx.strokeStyle = 'rgba(31, 41, 55, 0.85)';
    ctx.lineWidth = Math.max(1.5 / scaleValue, 1.2);

    let drewLine = false;
    if (hasSpacing) {
        for (let distance = startDistance; distance <= endDistance + 0.1; distance += stepSpacing) {
            const offset = Math.min(distance, endDistance);
            const along = positiveDirection
                ? (orientation.axis === 'horizontal' ? bounds.x + offset : bounds.y + offset)
                : (orientation.axis === 'horizontal' ? bounds.x + bounds.width - offset : bounds.y + bounds.height - offset);

            ctx.beginPath();
            if (orientation.axis === 'horizontal') {
                ctx.moveTo(along, bounds.y + margin);
                ctx.lineTo(along, bounds.y + bounds.height - margin);
            } else {
                ctx.moveTo(bounds.x + margin, along);
                ctx.lineTo(bounds.x + bounds.width - margin, along);
            }
            ctx.stroke();
            drewLine = true;
        }
    }

    if (!drewLine) {
        const alongCenter = orientation.axis === 'horizontal'
            ? orientation.center.x
            : orientation.center.y;
        const clampedAlong = Math.max(
            orientation.axis === 'horizontal' ? bounds.x + margin : bounds.y + margin,
            Math.min(
                alongCenter,
                orientation.axis === 'horizontal'
                    ? bounds.x + bounds.width - margin
                    : bounds.y + bounds.height - margin
            )
        );

        ctx.beginPath();
        if (orientation.axis === 'horizontal') {
            ctx.moveTo(clampedAlong, bounds.y + margin);
            ctx.lineTo(clampedAlong, bounds.y + bounds.height - margin);
        } else {
            ctx.moveTo(bounds.x + margin, clampedAlong);
            ctx.lineTo(bounds.x + bounds.width - margin, clampedAlong);
        }
        ctx.stroke();
    }

    ctx.restore();
}

function drawStairArrow(ctx, orientation) {
    if (!orientation) {
        return;
    }

    const scaleValue = getScale();
    const arrowLength = Math.min(orientation.major * 0.6, 60);
    const halfLength = arrowLength / 2;
    const headSize = Math.min(orientation.minor * 0.45, 18);

    const tail = {
        x: orientation.center.x - orientation.direction.x * halfLength,
        y: orientation.center.y - orientation.direction.y * halfLength
    };
    const head = {
        x: orientation.center.x + orientation.direction.x * halfLength,
        y: orientation.center.y + orientation.direction.y * halfLength
    };
    const perpendicular = {
        x: -orientation.direction.y,
        y: orientation.direction.x
    };

    ctx.save();
    ctx.strokeStyle = 'rgba(55, 65, 81, 0.85)';
    ctx.fillStyle = 'rgba(55, 65, 81, 0.85)';
    ctx.lineWidth = 2 / scaleValue;

    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    ctx.lineTo(
        head.x - orientation.direction.x * headSize + perpendicular.x * (headSize / 2),
        head.y - orientation.direction.y * headSize + perpendicular.y * (headSize / 2)
    );
    ctx.lineTo(
        head.x - orientation.direction.x * headSize - perpendicular.x * (headSize / 2),
        head.y - orientation.direction.y * headSize - perpendicular.y * (headSize / 2)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawResourceDimensions(resource) {
    drawResourceDimensionsImproved(resource);
}

function drawResourceDimensionsRobust(resource) {
    if (!getGlobalShowDimensions()) {
        return;
    }

    const ctx = getCtx();
    if (!ctx) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = getDimensionColor();
    ctx.lineWidth = dimensionLineWidth / getScale();
    ctx.fillStyle = getDimensionColor();

    const fontConfig = DIMENSION_SYSTEM.getFontConfig('resources', getScale());
    ctx.font = fontConfig.string;

    const offsetVal = dimensionOffset * 0.6;
    const extensionVal = dimensionExtension / getScale();

    if (resource.vertices && resource.vertices.length > 0) {
        drawResourcePolygonDimensionsRobust(resource, ctx, offsetVal, extensionVal);
    } else {
        drawResourceRectangleDimensionsRobust(resource, ctx, offsetVal, extensionVal);
    }

    ctx.restore();
}

function drawResourcePolygonDimensionsRobust(resource) {
    drawResourceDimensionsImproved(resource);
}

function drawResourceRectangleDimensionsRobust(resource) {
    drawResourceDimensionsImproved(resource);
}

function drawResourceDimensionsImproved(resource) {
    if (!getGlobalShowDimensions() || (resource && resource.type === 'operator')) {
        return;
    }

    const ctx = getCtx();
    if (!ctx) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = getDimensionColor();
    ctx.lineWidth = dimensionLineWidth / getScale();
    ctx.fillStyle = getDimensionColor();

    const fontConfig = DIMENSION_SYSTEM.getFontConfig('resources', getScale());
    ctx.font = fontConfig.string;

    if (resource.vertices && resource.vertices.length > 0) {
        const offsetVal = dimensionOffset * 0.6;
        for (let i = 0; i < resource.vertices.length; i++) {
            const p1 = resource.vertices[i];
            const p2 = resource.vertices[(i + 1) % resource.vertices.length];
            const segmentLength = Math.sqrt(
                Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2)
            );
            if (segmentLength < 1e-6) {
                continue;
            }
            const segmentLengthCm = Math.round(segmentLength / pixelsPerCm * 10) / 10;
            if (segmentLengthCm >= 1 && dimensionDeclutter.shouldDrawByLOD(segmentLength)) {
                const textValue = formatLength(segmentLengthCm);
                drawSegmentDimension(p1, p2, textValue, offsetVal, resource.vertices, false, i);
            }
        }
    } else {
        const x = resource.x;
        const y = resource.y;
        const width = resource.width;
        const height = resource.height;
        const widthCm = Math.round(width / pixelsPerCm * 10) / 10;
        const heightCm = Math.round(height / pixelsPerCm * 10) / 10;
        const offsetVal = dimensionOffset * 0.6;

        if (widthCm >= 1) {
            const p1 = [x, y + height];
            const p2 = [x + width, y + height];
            const textValue = formatLength(widthCm);
            drawSegmentDimension(p1, p2, textValue, offsetVal, [], true, -1);
        }

        if (heightCm >= 1) {
            const p1 = [x + width, y];
            const p2 = [x + width, y + height];
            const textValue = formatLength(heightCm);
            drawSegmentDimension(p1, p2, textValue, offsetVal, [], true, -1);
        }
    }

    ctx.restore();
}

export {
    drawAllResources,
    drawResourceCreationPreview,
    drawStairCreationPreview,
    computeResourceLabelGeometry,
    drawResourceDimensions,
    drawResourceDimensionsImproved,
    drawResourceDimensionsRobust
};
