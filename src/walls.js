// Funções relacionadas a paredes (criação, desenho, preview, interseções, etc)
// Modularização baseada nos comentários do script.js
import { walls, selectedWallId, hoveredWallId, isDrawingWall, wallStartPoint, wallPreviewEnd, movementAreas, scale, getCtx, getCanvas, setActiveGuideLines, getIsCtrlPressed, setSelectedWallId, getIsEditingWall, getEditingWallId, getEditingWallHandle, setIsEditingWall, setEditingWallId, setEditingWallHandle, getWallSnapPreviewActive, getWallSnapPreviewPoint, getWallSnapPreviewWall, getWallSnapPreviewDimensions, getWallSnapPreviewType, updateWallSnapPreview, clearWallSnapPreview, getSelectedWallSubSegment, getHoveredWallSubSegment, setSelectedWallSubSegment } from './state.js';
import { wallColor, wallHoverColor, wallSelectedColor, wallPreviewColor, wallVisualLineWidth, wallDimensionColor, dimensionFontSize, dimensionOffset, dimensionLineWidth, dimensionTickSize, DIMENSION_SYSTEM, pixelsPerCm, floatTolerance, rightAngleSnapEnabled, rightAngleGuideColor, cardinalAngleGuideColor, angleGuideLineWidth, angleGuideLength, snapRadius, wallMinLength, rightAngleSnapTolerance, cardinalAngleSnapTolerance, vertexSnapPriority, wallSnapRadius, virtualDimensionsEnabled, virtualDimensionColor, virtualDimensionSecondaryColor, virtualDimensionAlpha, virtualDimensionFontSize, virtualDimensionLineWidth, virtualDimensionMaxDistance, virtualDimensionMaxCount, getGlobalShowDimensions, openingFontMinSize, openingFontMaxSize, getScaledSizeWithLimits, vertexRadius, polygonVertexColor, vertexHoverColor, polygonVertexHoverColor, midpointRadius, midpointColor, midpointHoverColor } from './config.js';
import { generateId, ID_PREFIXES } from './utils/idGenerator.js';
import { smartSnapSystem } from './smart-snap.js';
import { pointInPolygon, rectangleToVertices } from './areas.js';
import { 
    validateOpeningsAlignment,
    synchronizeOpeningsMovement,
    synchronizeOpeningsRotation
} from './openings.js';
import { syncBoundaryOpeningHubs, syncBoundaryOpeningHubsRotation } from './hubs.js';
import { layoutChangeNotifier } from './core/layout-change-notifier.js';
import { computeSubSegment, getRemainingSubSegments } from './utils/segment-split.js';
/**
 * Cria uma nova parede.
 * @param {Array} startPoint
 * @param {Array} endPoint
 * @param {number|null} parentAreaId
 * @returns {Object|null}
 */
function createWall(startPoint, endPoint, parentAreaId = null) {
    if (!startPoint || !endPoint) {
        return null;
    }
    const dx = endPoint[0] - startPoint[0];
    const dy = endPoint[1] - startPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < wallMinLength) {
        return null;
    }
      const wall = {
        id: generateId(ID_PREFIXES.WALL),
        startPoint: [startPoint[0], startPoint[1]],
        endPoint: [endPoint[0], endPoint[1]],
        parentAreaId: parentAreaId,
        length: length,
        angle: Math.atan2(dy, dx),
        showDimensions: true // Por padrão, mostrar cotas das paredes
    };
    // Calcular cotas de divisão automáticas se a parede for interna
    if (parentAreaId) {
        setTimeout(() => {
            autoDivisionDimensionsSystem.calculateDivisionDimensions(wall);
        }, 100); // Pequeno delay para garantir que a parede foi adicionada ao array
        // 🔔 Notificar sistema sobre criação de parede interna
        if (typeof layoutChangeNotifier !== 'undefined') {
            layoutChangeNotifier.notifyChange('wallCreated', {
                wall: wall,
                parentAreaId: parentAreaId,
                isInternal: true
            });
        }
    }
    return wall;
}
// Helper functions for angle calculations
function distSq(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return dx * dx + dy * dy;
}
function normalizeAngle(degrees) {
    while (degrees < 0) degrees += 360;
    while (degrees >= 360) degrees -= 360;
    return degrees;
}
function getAngleDegrees(p1, p2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const angle = normalizeAngle(Math.atan2(dy, dx) * 180 / Math.PI);
    return angle;
}
function isCardinalAngle(angle) {
    const cardinals = [0, 90, 180, 270];
    for (let cardinal of cardinals) {
        const diff = Math.abs(normalizeAngle(angle) - cardinal);
        if (diff <= cardinalAngleSnapTolerance) {
            return cardinal;
        }
    }
    return null;
}
function isRightAngle(angle1, angle2) {
    const diff = Math.abs(normalizeAngle(angle1) - normalizeAngle(angle2));
    const rightAngleDiff = Math.min(diff, 360 - diff);
    return Math.abs(rightAngleDiff - 90) <= rightAngleSnapTolerance;
}
function findRightAngleSnapPoints(startPoint, currentPos) {
    const snapPoints = [];
    if (!rightAngleSnapEnabled || !isDrawingWall || !wallStartPoint) {
        return snapPoints;
    }
    // Check for right angles with existing walls
    for (let wall of walls) {
        const existingAngle = getAngleDegrees(wall.startPoint, wall.endPoint);
        const currentAngle = getAngleDegrees(startPoint, currentPos);
        if (isRightAngle(existingAngle, currentAngle)) {
            // Snap to make a perfect right angle
            const targetAngle = normalizeAngle(existingAngle + 90);
            const distance = Math.sqrt(distSq(startPoint, currentPos));
            const snapX = startPoint[0] + Math.cos(targetAngle * Math.PI / 180) * distance;
            const snapY = startPoint[1] + Math.sin(targetAngle * Math.PI / 180) * distance;
            snapPoints.push({
                point: [snapX, snapY],
                type: 'right-angle',
                referenceWall: wall,
                angle: targetAngle
            });
        }
    }
    // Check for cardinal direction snap
    const currentAngle = getAngleDegrees(startPoint, currentPos);
    const cardinalSnap = isCardinalAngle(currentAngle);
    if (cardinalSnap !== null) {
        const distance = Math.sqrt(distSq(startPoint, currentPos));
        const snapX = startPoint[0] + Math.cos(cardinalSnap * Math.PI / 180) * distance;
        const snapY = startPoint[1] + Math.sin(cardinalSnap * Math.PI / 180) * distance;
        snapPoints.push({
            point: [snapX, snapY],
            type: 'cardinal-angle',
            angle: cardinalSnap
        });
    }
    return snapPoints;
}
function distToSegmentSq(p, a, b) {
    const l2 = distSq(a, b);
    if (l2 === 0) return distSq(p, a);
    let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    return distSq(p, projection);
}
function autoSnapWallToWall(point) {
    // Enhanced snap that considers perpendicular and parallel alignment
    let bestSnap = null;
    let bestDistance = Infinity;
    const snapRadius = wallSnapRadius;
    for (let wall of walls) {
        // Snap to endpoints
        const startDist = Math.sqrt(distSq(point, wall.startPoint));
        const endDist = Math.sqrt(distSq(point, wall.endPoint));
        if (startDist <= snapRadius && startDist < bestDistance) {
            bestDistance = startDist;
            bestSnap = {
                point: [...wall.startPoint],
                type: 'wall-end',
                wallId: wall.id,
                distance: startDist
            };
        }
        if (endDist <= snapRadius && endDist < bestDistance) {
            bestDistance = endDist;
            bestSnap = {
                point: [...wall.endPoint],
                type: 'wall-end',
                wallId: wall.id,
                distance: endDist
            };
        }
        // Snap perpendicular to wall
        const wallDx = wall.endPoint[0] - wall.startPoint[0];
        const wallDy = wall.endPoint[1] - wall.startPoint[1];
        const wallLength = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
        if (wallLength > 0) {
            const wallDirX = wallDx / wallLength;
            const wallDirY = wallDy / wallLength;
            // Project point onto wall line
            const pointToStart = [point[0] - wall.startPoint[0], point[1] - wall.startPoint[1]];
            const projection = pointToStart[0] * wallDirX + pointToStart[1] * wallDirY;
            if (projection >= 0 && projection <= wallLength) {
                const projectedPoint = [
                    wall.startPoint[0] + projection * wallDirX,
                    wall.startPoint[1] + projection * wallDirY
                ];
                const perpDist = Math.sqrt(distSq(point, projectedPoint));
                if (perpDist <= snapRadius && perpDist < bestDistance) {
                    bestDistance = perpDist;
                    bestSnap = {
                        point: projectedPoint,
                        type: 'wall-perpendicular',
                        wallId: wall.id,
                        distance: perpDist
                    };
                }
            }
        }
    }
    return bestSnap;
}
/**
 * Enhanced findSnapPoint function with right angle assistance and vertex prioritization.
 */
function findSnapPoint(x, y) {
    const snapRadius = wallSnapRadius;
    let closestPoint = null;
    let closestDistance = Infinity;
    // 1. HIGHEST PRIORITY: Vértices de áreas (com multiplicador de prioridade)
    for (let area of movementAreas) {
        if (area.vertices) {
            for (let vertex of area.vertices) {
                const distance = Math.sqrt(distSq([x, y], vertex));
                // Apply vertex priority multiplier to effectively increase snap range
                const prioritizedDistance = distance / vertexSnapPriority;
                if (distance <= snapRadius && prioritizedDistance < closestDistance) {
                    closestDistance = prioritizedDistance;
                    closestPoint = {
                        point: [...vertex],
                        type: 'vertex',
                        areaId: area.id,
                        actualDistance: distance
                    };
                }
            }
        }
    }
    // 2. RIGHT ANGLE ASSISTANCE: Check for right angle snap points when drawing walls
    if (rightAngleSnapEnabled && isDrawingWall && wallStartPoint) {
        const rightAngleSnaps = findRightAngleSnapPoints(wallStartPoint, [x, y]);
        for (let snapPoint of rightAngleSnaps) {
            const distance = Math.sqrt(distSq([x, y], snapPoint.point));
            if (distance <= snapRadius * 1.5 && distance < closestDistance) { // Slightly larger radius for angle snaps
                closestDistance = distance;
                closestPoint = snapPoint;
                closestPoint.actualDistance = distance;
            }
        }
    }
    // 3. Wall-to-wall snapping
    if (walls.length > 0) {
        const wallSnap = autoSnapWallToWall([x, y]);
        if (wallSnap && wallSnap.distance !== undefined && wallSnap.distance < closestDistance) {
            closestDistance = wallSnap.distance;
            closestPoint = wallSnap;
        }
    }
    // 4. Extremidades de paredes existentes
    for (let wall of walls) {
        const startDistance = Math.sqrt(distSq([x, y], wall.startPoint));
        const endDistance = Math.sqrt(distSq([x, y], wall.endPoint));
        if (startDistance <= snapRadius && startDistance < closestDistance) {
            closestDistance = startDistance;
            closestPoint = {
                point: [...wall.startPoint],
                type: 'wall-end',
                wallId: wall.id,
                actualDistance: startDistance
            };
        }
        if (endDistance <= snapRadius && endDistance < closestDistance) {
            closestDistance = endDistance;
            closestPoint = {
                point: [...wall.endPoint],
                type: 'wall-end',
                wallId: wall.id,
                actualDistance: endDistance
            };
        }
    }
    // 5. Arestas de áreas
    for (let area of movementAreas) {
        if (area.vertices && area.vertices.length > 1) {
            for (let i = 0; i < area.vertices.length; i++) {
                const p1 = area.vertices[i];
                const p2 = area.vertices[(i + 1) % area.vertices.length];
                const distToEdge = Math.sqrt(distToSegmentSq([x, y], p1, p2));
                if (distToEdge <= snapRadius && distToEdge < closestDistance) {
                    // Calcular o ponto mais próximo na aresta
                    const l2 = distSq(p1, p2);
                    if (l2 > 0) {
                        let t = ((x - p1[0]) * (p2[0] - p1[0]) + (y - p1[1]) * (p2[1] - p1[1])) / l2;
                        t = Math.max(0, Math.min(1, t));
                        const closestOnEdge = [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
                        closestDistance = distToEdge;
                        closestPoint = {
                            point: closestOnEdge,
                            type: 'edge',
                            areaId: area.id,
                            actualDistance: distToEdge
                        };
                    }
                }
            }
        }
    }
    // 6. Snap para grade (último recurso)
    if (!closestPoint) {
        const snappedX = Math.round(x / pixelsPerCm) * pixelsPerCm;
        const snappedY = Math.round(y / pixelsPerCm) * pixelsPerCm;
        closestPoint = {
            point: [snappedX, snappedY],
            type: 'grid',
            areaId: null
        };
    }
    return closestPoint;
}
/**
 * Calcula a distância entre dois pontos.
 */
function distance(p1, p2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return Math.sqrt(dx * dx + dy * dy);
}
/**
 * Desenha uma parede.
 * @param {Object} wall
 */
function drawWall(wall) {
    if (!wall || !wall.startPoint || !wall.endPoint) return;
    const ctx = getCtx();
    const isSelected = selectedWallId === wall.id;
    const isHovered = hoveredWallId === wall.id;

    // Verificar se há sub-segmento ativo (seleção/hover parcial)
    const selectedSub = isSelected ? getSelectedWallSubSegment() : null;
    const hoveredSub = isHovered ? getHoveredWallSubSegment() : null;

    // Paredes internas (com parentAreaId) usam 'butt' para não extravazar além da fronteira da área
    const capStyle = wall.parentAreaId ? 'butt' : 'round';

    if (selectedSub || hoveredSub) {
        // Desenhar a parede inteira na cor base
        ctx.strokeStyle = wallColor;
        ctx.lineWidth = wallVisualLineWidth;
        ctx.lineCap = capStyle;
        ctx.beginPath();
        ctx.moveTo(wall.startPoint[0], wall.startPoint[1]);
        ctx.lineTo(wall.endPoint[0], wall.endPoint[1]);
        ctx.stroke();

        // Sobrepor apenas o sub-segmento com a cor de destaque
        const sub = selectedSub || hoveredSub;
        const highlightColor = selectedSub ? wallSelectedColor : wallHoverColor;
        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = wallVisualLineWidth * 1.3;
        ctx.lineCap = capStyle;
        ctx.beginPath();
        ctx.moveTo(sub.startPoint[0], sub.startPoint[1]);
        ctx.lineTo(sub.endPoint[0], sub.endPoint[1]);
        ctx.stroke();
    } else {
        // Manter cores originais profissionais (comportamento padrão)
        ctx.strokeStyle = isSelected ? wallSelectedColor : (isHovered ? wallHoverColor : wallColor);
        ctx.lineWidth = wallVisualLineWidth;
        ctx.lineCap = capStyle;
        ctx.beginPath();
        ctx.moveTo(wall.startPoint[0], wall.startPoint[1]);
        ctx.lineTo(wall.endPoint[0], wall.endPoint[1]);
        ctx.stroke();
    }

    // Desenhar dimensão da parede
    drawWallDimension(wall);
    
    // Desenhar handles de edição se a parede estiver sendo editada
    if (getIsEditingWall() && getEditingWallId() === wall.id) {
        drawWallHandles(wall);
    }
}
/**
 * Desenha as dimensões de uma parede.
 */
function drawWallDimension(wall) {
    if (!wall || !wall.startPoint || !wall.endPoint) return;
    
    // Verificar controle global de cotas
    if (!getGlobalShowDimensions()) {
        return;
    }
    
    const ctx = getCtx();
    const dx = wall.endPoint[0] - wall.startPoint[0];
    const dy = wall.endPoint[1] - wall.startPoint[1];
    const lengthPx = Math.sqrt(dx * dx + dy * dy);
    const lengthCm = Math.round(lengthPx / pixelsPerCm * 10) / 10; // Precisão de 1 casa decimal
    if (lengthCm >= 0.1) { // Mostrar dimensões para paredes >= 1mm
        // Sistema unificado de cotas para paredes
        const fontConfig = DIMENSION_SYSTEM.getFontConfig('walls', scale);
        const scaledDimensionTickSize = getScaledSizeWithLimits(dimensionTickSize, scale, 2, 8); // Entre 2 e 8 pixels
        
        // Estilo visual - cor especial para paredes selecionadas
        const isSelected = selectedWallId === wall.id;
        const dimensionColor = isSelected ? wallSelectedColor : wallDimensionColor;
        ctx.strokeStyle = dimensionColor;
        ctx.fillStyle = dimensionColor;
        ctx.lineWidth = Math.max(0.5, dimensionLineWidth / scale); // Espessura mínima de 0.5 pixels
        ctx.font = fontConfig.string;
        // Calcular vetor normal (perpendicular) à parede
        const segmentLength = lengthPx;
        let nx = -dy / segmentLength;  // Normal perpendicular
        let ny = dx / segmentLength;
        // Offset da dimensão (menor que áreas para não sobrepor)
        const actualOffset = dimensionOffset * 0.8; // 80% do offset das áreas
        // Pontos das linhas de extensão
        const c1x = wall.startPoint[0] + nx * actualOffset;
        const c1y = wall.startPoint[1] + ny * actualOffset;
        const c2x = wall.endPoint[0] + nx * actualOffset;
        const c2y = wall.endPoint[1] + ny * actualOffset;
        // Desenhar linhas de extensão (do ponto da parede até a linha de dimensão)
        ctx.beginPath();
        ctx.moveTo(wall.startPoint[0], wall.startPoint[1]);
        ctx.lineTo(c1x, c1y);
        ctx.moveTo(wall.endPoint[0], wall.endPoint[1]);
        ctx.lineTo(c2x, c2y);
        ctx.stroke();
        // Desenhar linha principal da dimensão
        ctx.beginPath();
        ctx.moveTo(c1x, c1y);
        ctx.lineTo(c2x, c2y);
        ctx.stroke();
        // Desenhar ticks nas extremidades
        ctx.beginPath();
        ctx.moveTo(c1x - ny * scaledDimensionTickSize, c1y + nx * scaledDimensionTickSize);
        ctx.lineTo(c1x + ny * scaledDimensionTickSize, c1y - nx * scaledDimensionTickSize);
        ctx.moveTo(c2x - ny * scaledDimensionTickSize, c2y + nx * scaledDimensionTickSize);
        ctx.lineTo(c2x + ny * scaledDimensionTickSize, c2y - nx * scaledDimensionTickSize);
        ctx.stroke();
        // Posição do texto (no meio da linha de dimensão)
        const midCx = (c1x + c2x) / 2;
        const midCy = (c1y + c2y) / 2;
        let angle = Math.atan2(dy, dx);
        // Offset do texto (mesmo padrão das áreas)
        const textOffsetMultiplier = 1.5;
        const textPosX = midCx + nx * (fontConfig.size * 0.5 * textOffsetMultiplier);
        const textPosY = midCy + ny * (fontConfig.size * 0.5 * textOffsetMultiplier);
        // Desenhar texto rotacionado
        ctx.save();
        ctx.translate(textPosX, textPosY);
        ctx.rotate(angle);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Ajustar orientação do texto para evitar ficar de cabeça para baixo
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
            ctx.rotate(Math.PI);
            ctx.textBaseline = 'top';
        }
        // Texto da dimensão
        const textValue = `${lengthCm} cm`;
        ctx.fillText(textValue, 0, 0);
        ctx.restore();
    }
}
/**
 * Desenha o preview da parede em criação.
 */
function drawWallPreview() {
    const ctx = getCtx();
    if (!isDrawingWall || !wallStartPoint || !wallPreviewEnd) {
        return;
    }
    // Calculate distance to show preview even for very short lines
    const distance = Math.sqrt(Math.pow(wallPreviewEnd[0] - wallStartPoint[0], 2) + 
                             Math.pow(wallPreviewEnd[1] - wallStartPoint[1], 2));
    // Always draw preview line, even if very short
    ctx.strokeStyle = wallPreviewColor;
    ctx.lineWidth = wallVisualLineWidth;
    ctx.lineCap = 'round';
    ctx.setLineDash([5 / scale, 3 / scale]);
    ctx.beginPath();
    ctx.moveTo(wallStartPoint[0], wallStartPoint[1]);
    ctx.lineTo(wallPreviewEnd[0], wallPreviewEnd[1]);
    ctx.stroke();
    // If distance is very small, also draw a circle to indicate start point
    if (distance < 1) {
        ctx.fillStyle = wallPreviewColor;
        ctx.beginPath();
        ctx.arc(wallStartPoint[0], wallStartPoint[1], 4 / scale, 0, 2 * Math.PI);
        ctx.fill();
    }
      ctx.setLineDash([]); // Reset dash
    // Mostrar comprimento em preview (mantido para compatibilidade)
    const lengthPx = Math.sqrt(Math.pow(wallPreviewEnd[0] - wallStartPoint[0], 2) + 
                             Math.pow(wallPreviewEnd[1] - wallStartPoint[1], 2));
    const lengthCm = Math.round(lengthPx / pixelsPerCm);
    if (lengthCm >= wallMinLength) {
        const midX = (wallStartPoint[0] + wallPreviewEnd[0]) / 2;
        const midY = (wallStartPoint[1] + wallPreviewEnd[1]) / 2;
        ctx.fillStyle = wallDimensionColor;
        
        // Sistema unificado de cotas para preview de paredes
        const fontConfig = DIMENSION_SYSTEM.getFontConfig('walls', scale);
        ctx.font = fontConfig.string;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${lengthCm} cm`, midX, midY - getScaledSizeWithLimits(10, scale, 5, 15));
    }
    // --- PREVIEW ANGLE INDICATORS ---
    if (rightAngleSnapEnabled) {
        // Show angle information during preview
        const currentAngle = getAngleDegrees(wallStartPoint, wallPreviewEnd);
        const cardinalSnap = isCardinalAngle(currentAngle);
        // Show cardinal direction indicator
        if (cardinalSnap !== null) {
            const directionNames = { 0: 'EAST (0°)', 90: 'NORTH (90°)', 180: 'WEST (180°)', 270: 'SOUTH (270°)' };
            const directionText = directionNames[cardinalSnap];
            ctx.save();
            ctx.fillStyle = cardinalAngleGuideColor;
            
            // Sistema unificado de cotas para indicadores de direção
            const fontConfig = DIMENSION_SYSTEM.getFontConfig('angles', scale);
            ctx.font = fontConfig.string;
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(directionText, wallPreviewEnd[0], wallPreviewEnd[1] + 15 / scale);
            ctx.restore();
        }
        // Check for right angles with existing walls and show indicators
        for (let wall of walls) {
            const existingAngle = getAngleDegrees(wall.startPoint, wall.endPoint);
            if (isRightAngle(existingAngle, currentAngle)) {
                // Draw right angle indicator
                ctx.save();
                ctx.strokeStyle = rightAngleGuideColor;
                ctx.fillStyle = rightAngleGuideColor;
                ctx.lineWidth = 2 / scale;
                
                // Sistema unificado de cotas para indicadores de ângulo reto
                const fontConfig = DIMENSION_SYSTEM.getFontConfig('angles', scale);
                ctx.font = fontConfig.string;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                // Draw "90°" text near the end point
                ctx.fillText('RIGHT ANGLE (90°)', wallPreviewEnd[0], wallPreviewEnd[1] - 15 / scale);
                // Draw small right angle symbol
                const symbolSize = 8 / scale;
                const angle1Rad = existingAngle * Math.PI / 180;
                const angle2Rad = currentAngle * Math.PI / 180;
                // Find closest point on existing wall to current preview end
                const dx = wall.endPoint[0] - wall.startPoint[0];
                const dy = wall.endPoint[1] - wall.startPoint[1];
                const wallLength = Math.sqrt(dx * dx + dy * dy);
                if (wallLength > 0) {
                    const wallDir = [dx / wallLength, dy / wallLength];
                    const toPreview = [wallPreviewEnd[0] - wall.startPoint[0], wallPreviewEnd[1] - wall.startPoint[1]];
                    const projection = toPreview[0] * wallDir[0] + toPreview[1] * wallDir[1];
                    if (projection >= 0 && projection <= wallLength) {
                        const intersectionPoint = [
                            wall.startPoint[0] + projection * wallDir[0],
                            wall.startPoint[1] + projection * wallDir[1]
                        ];
                        // Draw right angle corner symbol
                        ctx.beginPath();
                        ctx.moveTo(intersectionPoint[0] + symbolSize * Math.cos(angle1Rad), 
                                 intersectionPoint[1] + symbolSize * Math.sin(angle1Rad));
                        ctx.lineTo(intersectionPoint[0] + symbolSize * Math.cos(angle1Rad) + symbolSize * Math.cos(angle2Rad), 
                                 intersectionPoint[1] + symbolSize * Math.sin(angle1Rad) + symbolSize * Math.sin(angle2Rad));
                        ctx.lineTo(intersectionPoint[0] + symbolSize * Math.cos(angle2Rad), 
                                 intersectionPoint[1] + symbolSize * Math.sin(angle2Rad));
                        ctx.stroke();
                    }
                }
                ctx.restore();
                break; // Only show one right angle indicator at a time
            }
        }
    }
    // --- EXISTING: Desenhar ângulos do preview ---
    // 1. Com outras paredes
    const previewWall = { startPoint: wallStartPoint, endPoint: wallPreviewEnd };
    for (let otherWall of walls) {
        const intersection = findWallIntersections(previewWall, otherWall);
        if (intersection) {
            const angle = calculateAngle(wallStartPoint, intersection, wallPreviewEnd);
            const angle2 = calculateAngle(otherWall.startPoint, intersection, otherWall.endPoint);
            drawAngle(intersection, wallStartPoint, wallPreviewEnd, angle);
            // drawAngle(intersection, otherWall.startPoint, otherWall.endPoint, angle2);
        }
    }
    // 2. Com arestas das áreas de movimentação
    for (let area of movementAreas) {
        if (!area.vertices || area.vertices.length < 2) continue;
        for (let i = 0; i < area.vertices.length; i++) {
            const p1 = area.vertices[i];
            const p2 = area.vertices[(i + 1) % area.vertices.length];
            const areaEdge = { startPoint: p1, endPoint: p2 };
            const intersection = findWallIntersections(previewWall, areaEdge);
            if (intersection) {
                const angle = calculateAngle(wallStartPoint, intersection, wallPreviewEnd);
                const angle2 = calculateAngle(p1, intersection, p2);
                drawAngle(intersection, wallStartPoint, wallPreviewEnd, angle);
                // drawAngle(intersection, p1, p2, angle2);
            }
        }
    }
}
// Helper function to calculate angles (imported from drawing.js logic)
function calculateAngle(p1, vertex, p2) {
    const v1 = [p1[0] - vertex[0], p1[1] - vertex[1]];
    const v2 = [p2[0] - vertex[0], p2[1] - vertex[1]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
    const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
    if (mag1 === 0 || mag2 === 0) return 0;
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
    angle = angle * (180 / Math.PI);
    return angle;
}
// Helper function to draw angles (simplified version)
function drawAngle(vertex, p1, p2, angle) {
    const ctx = getCtx();
    // Skip if angle is too close to 180 degrees (straight line)
    if (Math.abs(angle - 180) < 1) return;
    const radius = 15 / scale;
    const color = '#666666';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1 / scale;
    
    // Sistema unificado de cotas para ângulos de paredes
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('angles', scale);
    ctx.font = fontConfig.string;
    // Calculate angle vectors
    const v1 = [p1[0] - vertex[0], p1[1] - vertex[1]];
    const v2 = [p2[0] - vertex[0], p2[1] - vertex[1]];
    // Normalize vectors
    const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
    const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
    if (len1 === 0 || len2 === 0) return;
    v1[0] /= len1; v1[1] /= len1;
    v2[0] /= len2; v2[1] /= len2;
    // Check if it's a 90-degree angle (with tolerance)
    const isRightAngle = Math.abs(angle - 90) < 5; // 5-degree tolerance
    if (isRightAngle) {
        // Draw square symbol for 90-degree angles
        const squareSize = radius * 0.7; // Make square slightly smaller than arc radius
        // Calculate corner point of the square
        const cornerX = vertex[0] + (v1[0] + v2[0]) * squareSize * 0.7;
        const cornerY = vertex[1] + (v1[1] + v2[1]) * squareSize * 0.7;
        // Draw square
        ctx.beginPath();
        ctx.moveTo(vertex[0] + v1[0] * squareSize, vertex[1] + v1[1] * squareSize);
        ctx.lineTo(cornerX, cornerY);
        ctx.lineTo(vertex[0] + v2[0] * squareSize, vertex[1] + v2[1] * squareSize);
        ctx.stroke();
    } else {
        // Draw circular arc for non-90-degree angles
        const startAngle = Math.atan2(v1[1], v1[0]);
        const endAngle = Math.atan2(v2[1], v2[0]);
        ctx.beginPath();
        ctx.arc(vertex[0], vertex[1], radius, startAngle, endAngle);
        ctx.stroke();
    }
    // Calculate text position
    let midAngle = (Math.atan2(v1[1], v1[0]) + Math.atan2(v2[1], v2[0])) / 2;
    let textRadius = radius + 5 / scale;
    const textX = vertex[0] + Math.cos(midAngle) * textRadius;
    const textY = vertex[1] + Math.sin(midAngle) * textRadius;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(angle)}°`, textX, textY);
}
/**
 * Encontra interseção entre duas paredes.
 */
function findWallIntersections(wall1, wall2) {
    return lineIntersection(
        wall1.startPoint,
        wall1.endPoint,
        wall2.startPoint,
        wall2.endPoint
    );
}
/**
 * Calcula interseção entre duas linhas.
 */
function lineIntersection(p1, p2, p3, p4) {
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < floatTolerance) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - x3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - x3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return [
            x1 + t * (x2 - x1),
            y1 + t * (y2 - y1)
        ];
    }
    return null;
}
/**
 * Desenha indicadores de snap.
 * @param {Object} snapPoint - O ponto de snap com propriedades { point: [x, y], type: string, ... }
 */
function drawSnapIndicators(snapPoint) {
    if (!snapPoint) return;
    const ctx = getCtx();
    // Save context state to ensure proper rendering
    ctx.save();
    const [x, y] = snapPoint.point;
    const radius = 6 / scale;
    // Set base drawing properties
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([]);
    // Choose colors and styles based on snap type
    let strokeColor = '#00ff00';  // Default green
    let fillColor = 'rgba(0, 255, 0, 0.3)';
    let drawCross = true;
    let drawAngleGuide = false;
    switch (snapPoint.type) {
        case 'vertex':
            strokeColor = '#ff9900';  // Orange for vertices
            fillColor = 'rgba(255, 153, 0, 0.4)';
            break;
        case 'wall-end':
            strokeColor = '#0099ff';  // Blue for wall endpoints
            fillColor = 'rgba(0, 153, 255, 0.3)';
            break;
        case 'right-angle':
            strokeColor = rightAngleGuideColor;  // Orange for right angles
            fillColor = rightAngleGuideColor.replace('#', 'rgba(').replace('ff6b00', '255, 107, 0, 0.3').replace(')', ')');
            drawAngleGuide = true;
            break;
        case 'cardinal-angle':
            strokeColor = cardinalAngleGuideColor;  // Blue for cardinal directions
            fillColor = cardinalAngleGuideColor.replace('#', 'rgba(').replace('0066ff', '0, 102, 255, 0.3').replace(')', ')');
            drawAngleGuide = true;
            break;
        case 'wall-perpendicular':
            strokeColor = '#ff00ff';  // Magenta for perpendicular snaps
            fillColor = 'rgba(255, 0, 255, 0.3)';
            break;
        case 'edge':
            strokeColor = '#ffff00';  // Yellow for area edges
            fillColor = 'rgba(255, 255, 0, 0.3)';
            break;
        case 'grid':
            strokeColor = '#cccccc';  // Gray for grid
            fillColor = 'rgba(204, 204, 204, 0.2)';
            drawCross = false;  // No cross for grid snaps
            break;
    }
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    // Draw main snap indicator circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    // Draw cross indicator if needed
    if (drawCross) {
        const crossSize = 8 / scale;
        ctx.beginPath();
        ctx.moveTo(x - crossSize, y);
        ctx.lineTo(x + crossSize, y);
        ctx.moveTo(x, y - crossSize);
        ctx.lineTo(x, y + crossSize);
        ctx.stroke();
    }
    // Draw angle guide lines for angle snaps
    if (drawAngleGuide && isDrawingWall && wallStartPoint) {
        ctx.lineWidth = angleGuideLineWidth / scale;
        ctx.setLineDash([10 / scale, 5 / scale]);
        const guideLength = angleGuideLength / scale;
        if (snapPoint.type === 'right-angle' && snapPoint.referenceWall) {
            // Draw reference to the wall that forms the right angle
            const refWall = snapPoint.referenceWall;
            const refAngle = getAngleDegrees(refWall.startPoint, refWall.endPoint);
            // Draw guide line along reference wall direction
            const refDx = Math.cos(refAngle * Math.PI / 180) * guideLength;
            const refDy = Math.sin(refAngle * Math.PI / 180) * guideLength;
            ctx.strokeStyle = strokeColor;
            ctx.beginPath();
            ctx.moveTo(x - refDx, y - refDy);
            ctx.lineTo(x + refDx, y + refDy);
            ctx.stroke();
            // Draw perpendicular guide line
            const perpAngle = refAngle + 90;
            const perpDx = Math.cos(perpAngle * Math.PI / 180) * guideLength;
            const perpDy = Math.sin(perpAngle * Math.PI / 180) * guideLength;
            ctx.beginPath();
            ctx.moveTo(x - perpDx, y - perpDy);
            ctx.lineTo(x + perpDx, y + perpDy);
            ctx.stroke();
        }
        if (snapPoint.type === 'cardinal-angle' && snapPoint.angle !== undefined) {
            // Draw guide line for cardinal direction
            const angle = snapPoint.angle;
            const dx = Math.cos(angle * Math.PI / 180) * guideLength;
            const dy = Math.sin(angle * Math.PI / 180) * guideLength;
            ctx.strokeStyle = strokeColor;
            ctx.beginPath();
            ctx.moveTo(x - dx, y - dy);
            ctx.lineTo(x + dx, y + dy);
            ctx.stroke();
            // Draw text indicator for the cardinal direction
            const directionNames = { 0: 'E', 90: 'N', 180: 'W', 270: 'S' };
            const directionText = directionNames[angle] || `${angle}°`;
            
            // Sistema unificado de cotas para direções cardinais
            const fontConfig = DIMENSION_SYSTEM.getFontConfig('angles', scale);
            ctx.font = fontConfig.string;
            
            ctx.fillStyle = strokeColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(directionText, x + dx * 0.7, y + dy * 0.7);
        }
    }
    // Draw connection line from wall start to snap point when drawing
    if (isDrawingWall && wallStartPoint && snapPoint.type !== 'grid') {
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([5 / scale, 5 / scale]);
        ctx.beginPath();
        ctx.moveTo(wallStartPoint[0], wallStartPoint[1]);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
    // Restore context state
    ctx.restore();
}
/**
 * Alterna a exibição de cotas para todas as paredes.
 * REMOVIDO - usar apenas controle global
 */
function toggleAllWallDimensions() {
    // Função removida - usar apenas o controle global do header
}
/**
 * Move todas as paredes que pertencem a uma área específica.
 * @param {number|string} areaId - ID da área
 * @param {number} dx - Deslocamento horizontal
 * @param {number} dy - Deslocamento vertical
 */
function moveWallsWithArea(areaId, dx, dy) {
    if (dx === 0 && dy === 0) return 0;
    let movedWalls = 0;
    walls.forEach((wall, index) => {
        if (wall.parentAreaId === areaId) {
            // Mover pontos inicial e final
            wall.startPoint[0] += dx;
            wall.startPoint[1] += dy;
            wall.endPoint[0] += dx;
            wall.endPoint[1] += dy;
            movedWalls++;
        }
    });
    // Atualizar posições das aberturas junto com as paredes (chamada única via synchronize)
    const syncResult = synchronizeOpeningsMovement(areaId, dx, dy);
    // Sincronizar hubs de boundary openings
    const movedIds = syncResult.movedIds || [];
    if (movedIds.length > 0) {
        syncBoundaryOpeningHubs(dx, dy, movedIds);
    }
    return movedWalls;
}
/**
 * Rotaciona todas as paredes que pertencem a uma área específica.
 * @param {number|string} areaId - ID da área
 * @param {number} centerX - Centro de rotação X
 * @param {number} centerY - Centro de rotação Y
 * @param {number} angleDegrees - Ângulo de rotação em graus (padrão: 90)
 */
function rotateWallsWithArea(areaId, centerX, centerY, angleDegrees = 90) {
    const angleRad = angleDegrees * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    let rotatedWalls = 0;
    walls.forEach((wall, index) => {
        if (wall.parentAreaId === areaId) {
            // Rotacionar ponto inicial
            const startRelX = wall.startPoint[0] - centerX;
            const startRelY = wall.startPoint[1] - centerY;
            wall.startPoint[0] = centerX + startRelX * cos - startRelY * sin;
            wall.startPoint[1] = centerY + startRelX * sin + startRelY * cos;
            // Rotacionar ponto final
            const endRelX = wall.endPoint[0] - centerX;
            const endRelY = wall.endPoint[1] - centerY;
            wall.endPoint[0] = centerX + endRelX * cos - endRelY * sin;
            wall.endPoint[1] = centerY + endRelX * sin + endRelY * cos;
            // Atualizar ângulo da parede se existir
            if (wall.angle !== undefined) {
                wall.angle += angleRad;
                // Normalizar para -PI a PI
                while (wall.angle > Math.PI) wall.angle -= 2 * Math.PI;
                while (wall.angle < -Math.PI) wall.angle += 2 * Math.PI;
            }
            rotatedWalls++;
        }
    });
    // Atualizar posições das aberturas junto com as paredes rotacionadas (chamada única via synchronize)
    const syncResult = synchronizeOpeningsRotation(areaId, centerX, centerY, angleDegrees);
    // Sincronizar hubs de boundary openings após rotação
    const rotatedIds = syncResult.rotatedIds || [];
    if (rotatedIds.length > 0) {
        syncBoundaryOpeningHubsRotation(centerX, centerY, angleDegrees, rotatedIds);
    }
    // Validar alinhamento das aberturas após rotação
    if (syncResult.count > 0) {
        const validation = validateOpeningsAlignment(areaId);
        if (!validation.allAligned) {
            // Aberturas podem não estar corretamente alinhadas após a rotação
        }
    }
    return rotatedWalls;
}
/**
 * Enhanced findSnapPoint function with smart snap integration
 * Funciona tanto no primeiro clique quanto durante o movimento do mouse
 */
function findSnapPointWithSmartSnap(x, y) {
    // Se Ctrl estiver pressionado, desabilitar smart snap e usar apenas snap tradicional
    if (getIsCtrlPressed()) {
        const traditionalSnap = findSnapPoint(x, y);
        // Limpar guias ativas quando Ctrl está pressionado
        setActiveGuideLines([]);
        return traditionalSnap;
    }
      // Sempre tentar aplicar o sistema de snap inteligente
    // Se não estivermos desenhando ainda, usar null como startPoint (para push no primeiro clique)
    const startPoint = (isDrawingWall && wallStartPoint) ? wallStartPoint : null;
    const smartSnapResult = smartSnapSystem.processSmartSnap([x, y], startPoint);
    // Calcular cotas virtuais se estivermos desenhando uma parede
    if (isDrawingWall && startPoint) {
        const virtualDims = virtualDimensionsSystem.calculateVirtualDimensions(
            [x, y], 
            startPoint, 
            smartSnapResult
        );
    }
    // Atualizar as guias ativas no estado global
    setActiveGuideLines(smartSnapResult.guides || []);
    // Se o smart snap encontrou uma posição melhor, usar ela
    if (smartSnapResult.point && (smartSnapResult.point[0] !== x || smartSnapResult.point[1] !== y)) {
        return {
            point: smartSnapResult.point,
            type: smartSnapResult.snapType || 'smart-snap',
            smartSnapData: smartSnapResult
        };
    }
    // Caso contrário, usar o sistema de snap tradicional
    const traditionalSnap = findSnapPoint(x, y);
    return traditionalSnap;
}
/**
 * Reagrupa paredes órfãs que estão dentro de áreas mas não têm parentAreaId.
 * Útil para corrigir paredes criadas antes da implementação da associação automática.
 */
function reassignOrphanWalls() {
    let reassignedCount = 0;
    walls.forEach((wall, index) => {
        if (!wall.parentAreaId) {
            // Verificar se a parede está dentro de alguma área
            for (let area of movementAreas) {
                const areaVertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
                const startInside = pointInPolygon(wall.startPoint, areaVertices);
                const endInside = pointInPolygon(wall.endPoint, areaVertices);
                const midPoint = [(wall.startPoint[0] + wall.endPoint[0]) / 2, (wall.startPoint[1] + wall.endPoint[1]) / 2];
                const midInside = pointInPolygon(midPoint, areaVertices);
                // Verificar se pelo menos um ponto (início, fim ou meio) está dentro da área
                if (startInside || endInside || midInside) {
                    wall.parentAreaId = area.id;
                    reassignedCount++;
                    break;
                }
            }
            if (!wall.parentAreaId) {
            }
        }
    });
    return reassignedCount;
}
// Adicionar função global para reagrupamento
window.reassignWalls = reassignOrphanWalls;
/**
 * Força a associação de uma parede específica a uma área específica.
 * @param {string} wallId - ID da parede
 * @param {string} areaId - ID da área
 */
function forceWallToArea(wallId, areaId) {
    const wall = walls.find(w => w.id.toString() === wallId.toString());
    const area = movementAreas.find(a => a.id.toString() === areaId.toString());
    if (!wall) {
        return false;
    }
    if (!area) {
        return false;
    }
    const oldAreaId = wall.parentAreaId;
    wall.parentAreaId = areaId;
    return true;
}
// Expor função globalmente
window.forceWallToArea = forceWallToArea;
/**
 * Sistema de cotas virtuais durante criação de paredes com snap ativo
 */
// Classe VirtualDimensionsSystem movida para src/virtual-dimensions.js
import { VirtualDimensionsSystem } from './virtual-dimensions.js';
// Criar instância global do sistema
const virtualDimensionsSystem = new VirtualDimensionsSystem();
// Exportar globalmente para acesso fácil de outros módulos
window.virtualDimensionsSystem = virtualDimensionsSystem;
// Registrar o sistema de cotas virtuais como listener
layoutChangeNotifier.addListener((changeType, data) => {
    if (changeType === 'wallCreated' && data.parentAreaId) {
        // Virtual dimensions are calculated on-demand, no need to recalculate here
        // The system will automatically update when needed during drawing
    }
});
/**
 * Desenha as cotas virtuais na tela durante a criação de paredes
 */
function drawVirtualDimensions() {
    // Verificar se as cotas virtuais estão habilitadas
    const enabled = (window.config && window.config.virtualDimensionsEnabled !== undefined) 
        ? window.config.virtualDimensionsEnabled 
        : virtualDimensionsEnabled;
    if (!enabled) {
        return;
    }
    if (!isDrawingWall) {
        return;
    }
    if (!wallStartPoint) {
        return;
    }
    // Get current virtual dimensions or use existing ones
    const virtualDims = virtualDimensionsSystem.virtualDimensions || [];
    if (virtualDims.length === 0) {
        return;
    }
    virtualDims.forEach((dim, index) => {
        drawVirtualDimension(dim, index);
    });
}
/**
 * Desenha uma única cota virtual
 * @param {Object} dimension - Objeto da cota virtual com propriedades: startPoint, endPoint, label, color, type
 * @param {number} index - Índice da dimensão para controle de transparência
 */
function drawVirtualDimension(dimension, index = 0) {
    if (!dimension || !dimension.startPoint || !dimension.endPoint) {
        return;
    }
    const ctx = getCtx();
    if (!ctx) {
        return;
    }
    
    // Sistema unificado de cotas para dimensões virtuais de paredes
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('virtual', scale);
    const scaledDimensionTickSize = getScaledSizeWithLimits(dimensionTickSize, scale, 2, 8); // Entre 2 e 8 pixels
    
    // Usar cor específica da dimensão ou cor padrão
    const color = dimension.color || virtualDimensionColor || '#FF0000'; // Vermelho forte para teste
    const alpha = 1.0; // Alpha máximo para máxima visibilidade
    // Converter cor para rgba se necessário
    let strokeColor = color;
    if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        strokeColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = Math.max(1, 3 / scale); // Espessura mínima de 1 pixel
    ctx.font = fontConfig.string;
    ctx.setLineDash([Math.max(2, 8 / scale), Math.max(2, 6 / scale)]); // Linha tracejada com tamanho mínimo
    const startPoint = dimension.startPoint;
    const endPoint = dimension.endPoint;
    const dx = endPoint[0] - startPoint[0];
    const dy = endPoint[1] - startPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < floatTolerance) return;
    // Desenhar linha principal da cota virtual
    ctx.beginPath();
    ctx.moveTo(startPoint[0], startPoint[1]);
    ctx.lineTo(endPoint[0], endPoint[1]);
    ctx.stroke();
    // Reset line dash para indicadores
    ctx.setLineDash([]);
    // Desenhar indicadores nas extremidades (círculos pequenos)
    const indicatorRadius = 5 / scale; // Círculos maiores para teste
    // Indicador início
    ctx.beginPath();
    ctx.arc(startPoint[0], startPoint[1], indicatorRadius, 0, 2 * Math.PI);
    ctx.fill();
    // Indicador fim
    ctx.beginPath();
    ctx.arc(endPoint[0], endPoint[1], indicatorRadius, 0, 2 * Math.PI);
    ctx.fill();
    // Desenhar texto da dimensão
    const midX = (startPoint[0] + endPoint[0]) / 2;
    const midY = (startPoint[1] + endPoint[1]) / 2;
    let angle = Math.atan2(dy, dx);
    // Calcular posição do texto com offset pequeno
    const textOffsetMultiplier = 1.2;
    const nx = -dy / length;
    const ny = dx / length;
    const textPosX = midX + nx * (fontConfig.size * 0.5 * textOffsetMultiplier);
    const textPosY = midY + ny * (fontConfig.size * 0.5 * textOffsetMultiplier);
    // Fundo semi-transparente para o texto
    const textMetrics = ctx.measureText(dimension.label);
    const textWidth = textMetrics.width;
    const textHeight = fontConfig.size * 0.9;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(
        textPosX - textWidth / 2 - 2 / scale,
        textPosY - textHeight / 2 - 1 / scale,
        textWidth + 4 / scale,
        textHeight + 2 / scale
    );
    // Desenhar texto rotacionado
    ctx.save();
    ctx.translate(textPosX, textPosY);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Ajustar orientação do texto para evitar ficar de cabeça para baixo
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        ctx.rotate(Math.PI);
    }
    // Texto da dimensão
    ctx.fillStyle = strokeColor;
    ctx.fillText(dimension.label, 0, 0);
    ctx.restore();
}
/**
 * Desenha uma única cota de divisão automática
 * @param {Object} dimension - Objeto da cota de divisão com propriedades: startPoint, endPoint, label, color
 */
function drawDivisionDimension(dimension) {
    if (!dimension || !dimension.startPoint || !dimension.endPoint) return;
    const ctx = getCtx();
    
    // Sistema unificado de cotas para divisões automáticas
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('divisions', scale);
    const scaledDimensionTickSize = getScaledSizeWithLimits(dimensionTickSize, scale, 2, 8); // Entre 2 e 8 pixels
    
    // Usar cor específica da divisão ou cor padrão
    const color = dimension.color || '#00C853'; // Verde padrão para divisões
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(0.5, dimensionLineWidth / scale); // Espessura mínima de 0.5 pixels
    ctx.font = fontConfig.string;
    const startPoint = dimension.startPoint;
    const endPoint = dimension.endPoint;
    const dx = endPoint[0] - startPoint[0];
    const dy = endPoint[1] - startPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < floatTolerance) return;
    // Desenhar linha principal da cota
    ctx.beginPath();
    ctx.moveTo(startPoint[0], startPoint[1]);
    ctx.lineTo(endPoint[0], endPoint[1]);
    ctx.stroke();
    // Calcular vetor normal para desenhar ticks
    const nx = -dy / length;
    const ny = dx / length;
    // Desenhar ticks nas extremidades
    ctx.beginPath();
    ctx.moveTo(startPoint[0] - ny * scaledDimensionTickSize, startPoint[1] + nx * scaledDimensionTickSize);
    ctx.lineTo(startPoint[0] + ny * scaledDimensionTickSize, startPoint[1] - nx * scaledDimensionTickSize);
    ctx.moveTo(endPoint[0] - ny * scaledDimensionTickSize, endPoint[1] + nx * scaledDimensionTickSize);
    ctx.lineTo(endPoint[0] + ny * scaledDimensionTickSize, endPoint[1] - nx * scaledDimensionTickSize);
    ctx.stroke();
    // Desenhar texto da dimensão
    const midX = (startPoint[0] + endPoint[0]) / 2;
    const midY = (startPoint[1] + endPoint[1]) / 2;
    let angle = Math.atan2(dy, dx);
    // Offset do texto para não sobrepor a linha
    const textOffsetMultiplier = 1.5;
    const textPosX = midX + nx * (fontConfig.size * 0.5 * textOffsetMultiplier);
    const textPosY = midY + ny * (fontConfig.size * 0.5 * textOffsetMultiplier);
    ctx.save();
    ctx.translate(textPosX, textPosY);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Inverter texto se estiver de cabeça para baixo
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        ctx.rotate(Math.PI);
        ctx.textBaseline = 'top';
    }
    ctx.fillText(dimension.label, 0, 0);
    ctx.restore();
}
/**
 * Desenha as cotas de divisão automáticas
 */
function drawDivisionDimensions() {
    const divisionDims = autoDivisionDimensionsSystem.getDivisionDimensions();
    if (divisionDims.length === 0) return;
    divisionDims.forEach(dimension => {
        drawDivisionDimension(dimension);
    });
}
/**
 * Desenha as cotas virtuais de hover sobre áreas
 * @param {Array} hoverDimensions - Array de dimensões virtuais para hover
 */
function drawAreaHoverDimensions(hoverDimensions) {
    // Verificar se as cotas virtuais estão habilitadas
    const enabled = (window.config && window.config.virtualDimensionsEnabled !== undefined) 
        ? window.config.virtualDimensionsEnabled 
        : virtualDimensionsEnabled;
    if (!enabled || !hoverDimensions || hoverDimensions.length === 0) return;
    const ctx = getCtx();
    hoverDimensions.forEach((dimension, index) => {
        const { startPoint, endPoint, label, color, type } = dimension;
        ctx.save();
        // Configuração do estilo baseada no tipo
        const alpha = type === 'area-hover-edge-distance' ? 0.85 : 0.75;
        const lineWidth = (virtualDimensionLineWidth * 1.2) / scale;
        // Converter cor para rgba se necessário
        let strokeColor = color;
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            strokeColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([4 / scale, 3 / scale]); // Linha tracejada
        // Desenhar linha principal
        ctx.beginPath();
        ctx.moveTo(startPoint[0], startPoint[1]);
        ctx.lineTo(endPoint[0], endPoint[1]);
        ctx.stroke();
        // Reset line dash para indicadores
        ctx.setLineDash([]);
        // Desenhar indicadores nas extremidades (círculos pequenos)
        const indicatorRadius = 3 / scale;
        // Indicador início
        ctx.beginPath();
        ctx.arc(startPoint[0], startPoint[1], indicatorRadius, 0, 2 * Math.PI);
        ctx.fill();
        // Indicador fim
        ctx.beginPath();
        ctx.arc(endPoint[0], endPoint[1], indicatorRadius, 0, 2 * Math.PI);
        ctx.fill();
        // Desenhar texto da dimensão
        const midX = (startPoint[0] + endPoint[0]) / 2;
        const midY = (startPoint[1] + endPoint[1]) / 2;
        
        // Sistema unificado de cotas para cotas virtuais temporárias
        const fontConfig = DIMENSION_SYSTEM.getFontConfig('virtual', scale);
        ctx.font = fontConfig.string;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Fundo semi-transparente para o texto
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = (virtualDimensionFontSize * 0.9) / scale;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(
            midX - textWidth / 2 - 2 / scale,
            midY - textHeight / 2 - 1 / scale,
            textWidth + 4 / scale,
            textHeight + 2 / scale
        );
        // Texto da dimensão
        ctx.fillStyle = strokeColor;
        ctx.fillText(label, midX, midY);
        ctx.restore();
    });
}
/**
 * Sistema de cotas automáticas para divisões criadas por paredes internas
 */
class AutoDivisionDimensionsSystem {
    constructor() {
        this.divisionDimensions = [];
    }
    /**
     * Detecta e calcula cotas para divisões criadas por uma nova parede interna
     * @param {Object} newWall - Parede recém-criada
     */
    calculateDivisionDimensions(newWall) {
        if (!newWall || !newWall.parentAreaId) return;
        // Encontrar a área pai da parede
        const parentArea = movementAreas.find(area => area.id === newWall.parentAreaId);
        if (!parentArea) return;
        // Limpar dimensões anteriores desta área
        this.divisionDimensions = this.divisionDimensions.filter(dim => 
            dim.areaId !== parentArea.id || dim.wallId !== newWall.id
        );
        // Para áreas retangulares, verificar se a parede cria divisões
        if (!parentArea.vertices) {
            const tolerance = 5; // pixels
            // Verificar se é parede vertical (divide horizontalmente)
            if (Math.abs(newWall.startPoint[1] - newWall.endPoint[1]) < tolerance) {
                this.calculateHorizontalDivision(newWall, parentArea, tolerance);
            }
            // Verificar se é parede horizontal (divide verticalmente)
            else if (Math.abs(newWall.startPoint[0] - newWall.endPoint[0]) < tolerance) {
                this.calculateVerticalDivision(newWall, parentArea, tolerance);
            }
        }
    }
    /**
     * Calcula divisões para parede vertical (divisão horizontal do espaço)
     * @param {Object} wall - Parede vertical
     * @param {Object} area - Área pai
     * @param {number} tolerance - Tolerância em pixels
     */
    calculateVerticalDivision(wall, area, tolerance) {
        const wallX = (wall.startPoint[0] + wall.endPoint[0]) / 2; // X médio da parede
        // Verificar se a parede atravessa a área verticalmente
        const areaLeft = area.x;
        const areaRight = area.x + area.width;
        const areaTop = area.y;
        const areaBottom = area.y + area.height;
        // Verificar se a parede está dentro dos limites da área
        if (wallX >= areaLeft + tolerance && wallX <= areaRight - tolerance &&
            wall.startPoint[1] >= areaTop - tolerance && wall.endPoint[1] <= areaBottom + tolerance) {
            // Calcular larguras das divisões
            const leftWidth = wallX - areaLeft;
            const rightWidth = areaRight - wallX;
            const leftWidthCm = Math.round(leftWidth / pixelsPerCm);
            const rightWidthCm = Math.round(rightWidth / pixelsPerCm);
            // Criar cotas para a divisão esquerda
            if (leftWidthCm >= 10) { // Mínimo 10cm para mostrar cota
                this.divisionDimensions.push({
                    id: `division-left-${wall.id}`,
                    type: 'division-width',
                    areaId: area.id,
                    wallId: wall.id,
                    startPoint: [areaLeft, areaTop - 20],
                    endPoint: [wallX, areaTop - 20],
                    value: leftWidth,
                    label: `${leftWidthCm} cm`,
                    color: '#00C853', // Verde para divisões
                    side: 'left'
                });
            }
            // Criar cotas para a divisão direita
            if (rightWidthCm >= 10) { // Mínimo 10cm para mostrar cota
                this.divisionDimensions.push({
                    id: `division-right-${wall.id}`,
                    type: 'division-width',
                    areaId: area.id,
                    wallId: wall.id,
                    startPoint: [wallX, areaTop - 40],
                    endPoint: [areaRight, areaTop - 40],
                    value: rightWidth,
                    label: `${rightWidthCm} cm`,
                    color: '#00C853', // Verde para divisões
                    side: 'right'
                });
            }
        }
    }
    /**
     * Calcula divisões para parede horizontal (divisão vertical do espaço)
     * @param {Object} wall - Parede horizontal
     * @param {Object} area - Área pai
     * @param {number} tolerance - Tolerância em pixels
     */
    calculateHorizontalDivision(wall, area, tolerance) {
        const wallY = (wall.startPoint[1] + wall.endPoint[1]) / 2; // Y médio da parede
        // Verificar se a parede atravessa a área horizontalmente
        const areaLeft = area.x;
        const areaRight = area.x + area.width;
        const areaTop = area.y;
        const areaBottom = area.y + area.height;
        // Verificar se a parede está dentro dos limites da área
        if (wallY >= areaTop + tolerance && wallY <= areaBottom - tolerance &&
            wall.startPoint[0] >= areaLeft - tolerance && wall.endPoint[0] <= areaRight + tolerance) {
            // Calcular alturas das divisões
            const topHeight = wallY - areaTop;
            const bottomHeight = areaBottom - wallY;
            const topHeightCm = Math.round(topHeight / pixelsPerCm);
            const bottomHeightCm = Math.round(bottomHeight / pixelsPerCm);
            // Criar cotas para a divisão superior
            if (topHeightCm >= 10) { // Mínimo 10cm para mostrar cota
                this.divisionDimensions.push({
                    id: `division-top-${wall.id}`,
                    type: 'division-height',
                    areaId: area.id,
                    wallId: wall.id,
                    startPoint: [areaLeft - 20, areaTop],
                    endPoint: [areaLeft - 20, wallY],
                    value: topHeight,
                    label: `${topHeightCm} cm`,
                    color: '#00C853', // Verde para divisões
                    side: 'top'
                });
            }
            // Criar cotas para a divisão inferior
            if (bottomHeightCm >= 10) { // Mínimo 10cm para mostrar cota
                this.divisionDimensions.push({
                    id: `division-bottom-${wall.id}`,
                    type: 'division-height',
                    areaId: area.id,
                    wallId: wall.id,
                    startPoint: [areaLeft - 40, wallY],
                    endPoint: [areaLeft - 40, areaBottom],
                    value: bottomHeight,
                    label: `${bottomHeightCm} cm`,
                    color: '#00C853', // Verde para divisões
                    side: 'bottom'
                });
            }
        }
    }
    /**
     * Remove cotas de divisão quando uma parede é removida
     * @param {string} wallId - ID da parede removida
     */
    removeDivisionDimensions(wallId) {
        this.divisionDimensions = this.divisionDimensions.filter(dim => dim.wallId !== wallId);
    }
    /**
     * Obtém todas as cotas de divisão ativas
     * @returns {Array} Array de cotas de divisão
     */
    getDivisionDimensions() {
        return this.divisionDimensions;
    }
}
// Criar instância global do sistema de cotas de divisão
const autoDivisionDimensionsSystem = new AutoDivisionDimensionsSystem();

/**
 * Deleta uma parede do sistema, ou apenas o sub-segmento selecionado.
 * Se há um sub-segmento selecionado (parede cortada por interseções),
 * remove apenas essa porção e cria novas paredes para as partes restantes.
 * @param {Object} wall - A parede a ser deletada
 */
function deleteWall(wall) {
    const wallIndex = walls.findIndex(w => w.id === wall.id);
    if (wallIndex < 0) return;

    // Verificar se há sub-segmento selecionado
    const subSegment = getSelectedWallSubSegment();
    
    if (subSegment && selectedWallId === wall.id) {
        // Deletar apenas o sub-segmento: manter as partes restantes
        const remaining = getRemainingSubSegments(wall, subSegment, 'wall');
        
        // Remover a parede original
        walls.splice(wallIndex, 1);
        
        // Criar novas paredes para os segmentos restantes
        for (const seg of remaining) {
            const newWall = createWall(seg.startPoint, seg.endPoint, wall.parentAreaId);
            if (newWall) {
                newWall.showDimensions = wall.showDimensions;
                walls.push(newWall);
            }
        }
        
        setSelectedWallId(null);
        setSelectedWallSubSegment(null);
    } else {
        // Comportamento original: deletar a parede inteira
        walls.splice(wallIndex, 1);
        setSelectedWallId(null);
    }
    
    // Importar drawAll dinâmicamente para evitar dependência circular
    import('./drawing.js').then(({ drawAll }) => {
        drawAll();
    });
}

/**
 * Inicia o modo de edição visual de uma parede
 * @param {string} wallId - ID da parede a ser editada
 */
function startWallEdit(wallId) {
    setIsEditingWall(true);
    setEditingWallId(wallId);
    setEditingWallHandle(null);
}

/**
 * Para o modo de edição visual de parede
 */
function stopWallEdit() {
    setIsEditingWall(false);
    setEditingWallId(null);
    setEditingWallHandle(null);
}

/**
 * Verifica se um ponto está sobre um handle de edição de parede
 * @param {number} x - Coordenada X do ponto
 * @param {number} y - Coordenada Y do ponto
 * @param {Object} wall - A parede
 * @returns {string|null} - 'start', 'end' ou null
 */
function isPointOnWallHandle(x, y, wall) {
    if (!wall || !wall.startPoint || !wall.endPoint) return null;
    
    const handleRadius = 8 / scale; // Raio do handle em pixels na tela
    
    // Verificar handle do ponto inicial
    const startDist = Math.sqrt(
        Math.pow(x - wall.startPoint[0], 2) + 
        Math.pow(y - wall.startPoint[1], 2)
    );
    
    if (startDist <= handleRadius) {
        return 'start';
    }
    
    // Verificar handle do ponto final
    const endDist = Math.sqrt(
        Math.pow(x - wall.endPoint[0], 2) + 
        Math.pow(y - wall.endPoint[1], 2)
    );
    
    if (endDist <= handleRadius) {
        return 'end';
    }
    
    return null;
}

/**
 * Desenha os handles de edição para uma parede selecionada
 * @param {Object} wall - A parede
 */
function drawWallHandles(wall) {
    if (!wall || !wall.startPoint || !wall.endPoint) return;
    
    const ctx = getCtx();
    const editingWallId = getEditingWallId();
    const editingHandle = getEditingWallHandle();
    
    // Salvar estado do contexto
    ctx.save();
    
    // Desenhar handle do ponto inicial (usando as mesmas configurações dos midpoints verdes)
    const isStartActive = editingWallId === wall.id && editingHandle === 'start';
    ctx.fillStyle = isStartActive ? midpointHoverColor : midpointColor;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5 / scale;
    
    // Desenhar círculo do handle
    ctx.beginPath();
    ctx.arc(wall.startPoint[0], wall.startPoint[1], midpointRadius / scale, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // Desenhar um pequeno '+' no centro
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1 / scale;
    const crossSize = 3 / scale;
    
    ctx.beginPath();
    ctx.moveTo(wall.startPoint[0] - crossSize, wall.startPoint[1]);
    ctx.lineTo(wall.startPoint[0] + crossSize, wall.startPoint[1]);
    ctx.moveTo(wall.startPoint[0], wall.startPoint[1] - crossSize);
    ctx.lineTo(wall.startPoint[0], wall.startPoint[1] + crossSize);
    ctx.stroke();
    
    // Desenhar handle do ponto final (usando as mesmas configurações dos midpoints verdes)
    const isEndActive = editingWallId === wall.id && editingHandle === 'end';
    ctx.fillStyle = isEndActive ? midpointHoverColor : midpointColor;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.5 / scale;
    
    // Desenhar círculo do handle
    ctx.beginPath();
    ctx.arc(wall.endPoint[0], wall.endPoint[1], midpointRadius / scale, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // Desenhar um pequeno '+' no centro
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1 / scale;
    
    ctx.beginPath();
    ctx.moveTo(wall.endPoint[0] - crossSize, wall.endPoint[1]);
    ctx.lineTo(wall.endPoint[0] + crossSize, wall.endPoint[1]);
    ctx.moveTo(wall.endPoint[0], wall.endPoint[1] - crossSize);
    ctx.lineTo(wall.endPoint[0], wall.endPoint[1] + crossSize);
    ctx.stroke();
    
    // Restaurar estado do contexto
    ctx.restore();
}

/**
 * Atualiza o endpoint de uma parede durante o arrastar
 * @param {Object} wall - A parede
 * @param {string} handle - 'start' ou 'end'
 * @param {number} x - Nova coordenada X
 * @param {number} y - Nova coordenada Y
 */
function updateWallEndpoint(wall, handle, x, y) {
    if (!wall || !handle) return;
    
    if (handle === 'start') {
        wall.startPoint = [x, y];
    } else if (handle === 'end') {
        wall.endPoint = [x, y];
    }
}

/**
 * Edita o comprimento de uma parede com interface visual aprimorada
 * @param {Object} wall - A parede a ser editada
 */
function editWallLength(wall) {
    // Se já está editando, para a edição
    if (getIsEditingWall() && getEditingWallId() === wall.id) {
        stopWallEdit();
        return;
    }
    
    // Inicia o modo de edição visual
    startWallEdit(wall.id);
    
    // Força redesenho para mostrar os handles
    import('./drawing.js').then(({ drawAll }) => {
        drawAll();
    });
}

/**
 * Toggle de dimensões de parede individual (função mantida para compatibilidade)
 * @param {Object} wall - A parede
 */
function toggleWallDimensions(wall) {
    // Função removida - usar apenas controle global toggleAllWallDimensions
    console.warn('toggleWallDimensions está deprecada. Use toggleAllWallDimensions()');
}

/**
 * Determina o cursor apropriado para um handle de parede baseado na orientação da parede
 * @param {Object} wall - A parede
 * @param {string} handleType - Tipo do handle ('start' ou 'end')
 * @returns {string} - O tipo de cursor CSS
 */
function getWallHandleCursor(wall, handleType) {
    if (!wall || !wall.startPoint || !wall.endPoint) {
        return 'grab';
    }
    
    // Calcular vetor da parede
    const wallVector = [
        wall.endPoint[0] - wall.startPoint[0], 
        wall.endPoint[1] - wall.startPoint[1]
    ];
    
    // Calcular ângulo da parede em radianos
    const angle = Math.atan2(wallVector[1], wallVector[0]);
    
    // Converter para graus e normalizar para 0-180
    let angleDegrees = (angle * 180 / Math.PI) % 180;
    if (angleDegrees < 0) angleDegrees += 180;
    
    // Determinar cursor baseado no ângulo da parede
    // Para handles de parede, o movimento é paralelo à parede (não perpendicular como nos midpoints)
    // 0-22.5° ou 157.5-180°: parede horizontal → movimento horizontal (ew-resize)
    // 22.5-67.5°: parede diagonal NE-SW → movimento NE-SW (nesw-resize)
    // 67.5-112.5°: parede vertical → movimento vertical (ns-resize)
    // 112.5-157.5°: parede diagonal NW-SE → movimento NW-SE (nwse-resize)
    
    if (angleDegrees <= 22.5 || angleDegrees >= 157.5) {
        return 'ew-resize'; // Parede horizontal → movimento horizontal
    } else if (angleDegrees <= 67.5) {
        return 'nesw-resize'; // Parede diagonal NE-SW → movimento NE-SW
    } else if (angleDegrees <= 112.5) {
        return 'ns-resize'; // Parede vertical → movimento vertical
    } else {
        return 'nwse-resize'; // Parede diagonal NW-SE → movimento NW-SE
    }
}

// ============================================================================
// WALL SNAP PREVIEW SYSTEM
// Preview de interseção e divisão de cotas quando o cursor está próximo de uma parede
// durante a criação de uma nova parede (ferramenta wall ativa)
// ============================================================================

/** Raio de detecção para snap preview em paredes (em pixels na escala do canvas) */
const WALL_SNAP_PREVIEW_RADIUS = 15; // px no canvas - um pouco maior que wallSnapRadius para dar feedback antecipado

/**
 * Calcula o ponto mais próximo na reta de uma parede (projeção perpendicular),
 * o parâmetro t ao longo do segmento, e a distância.
 * @param {Array} point - [x, y]
 * @param {Object} wall - Parede com startPoint e endPoint
 * @returns {Object|null} { projectedPoint, t, distance, wallLength }
 */
function projectPointOntoWall(point, wall) {
    if (!point || !wall || !wall.startPoint || !wall.endPoint) return null;

    const ax = point[0] - wall.startPoint[0];
    const ay = point[1] - wall.startPoint[1];
    const bx = wall.endPoint[0] - wall.startPoint[0];
    const by = wall.endPoint[1] - wall.startPoint[1];
    const lenSq = bx * bx + by * by;
    if (lenSq === 0) return null;

    let t = (ax * bx + ay * by) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = wall.startPoint[0] + t * bx;
    const projY = wall.startPoint[1] + t * by;
    const dx = point[0] - projX;
    const dy = point[1] - projY;

    return {
        projectedPoint: [projX, projY],
        t: t,
        distance: Math.sqrt(dx * dx + dy * dy),
        wallLength: Math.sqrt(lenSq)
    };
}

/**
 * Calcula as cotas de divisão (preview) para um ponto de interseção na parede.
 * Gera duas dimensões: do startPoint ao ponto, e do ponto ao endPoint.
 * @param {Array} intersectionPoint - [x, y] ponto de interseção
 * @param {Object} wall - Parede alvo
 * @param {number} t - Parâmetro ao longo do segmento (0-1)
 * @returns {Array} Array de objetos de cota de divisão
 */
function calculateWallSnapDivisionDimensions(intersectionPoint, wall, t) {
    if (!intersectionPoint || !wall) return [];

    const dims = [];
    const wallDx = wall.endPoint[0] - wall.startPoint[0];
    const wallDy = wall.endPoint[1] - wall.startPoint[1];
    const wallLength = Math.sqrt(wallDx * wallDx + wallDy * wallDy);

    // Comprimento da primeira divisão (startPoint → intersectionPoint)
    const seg1Length = t * wallLength;
    const seg1Cm = Math.round(seg1Length / pixelsPerCm * 10) / 10;

    // Comprimento da segunda divisão (intersectionPoint → endPoint)
    const seg2Length = (1 - t) * wallLength;
    const seg2Cm = Math.round(seg2Length / pixelsPerCm * 10) / 10;

    // Normal da parede para offset das cotas
    const nx = -wallDy / wallLength;
    const ny = wallDx / wallLength;
    const offsetDist = dimensionOffset * 1.2;

    // Primeira cota (start → interseção)
    if (seg1Cm >= 1) { // mínimo 1cm
        const s1x = wall.startPoint[0] + nx * offsetDist;
        const s1y = wall.startPoint[1] + ny * offsetDist;
        const e1x = intersectionPoint[0] + nx * offsetDist;
        const e1y = intersectionPoint[1] + ny * offsetDist;
        dims.push({
            startPoint: [s1x, s1y],
            endPoint: [e1x, e1y],
            anchorStart: wall.startPoint,
            anchorEnd: intersectionPoint,
            label: `${seg1Cm} cm`,
            color: '#FF9800', // Laranja para preview
            value: seg1Length,
            side: 'first'
        });
    }

    // Segunda cota (interseção → end)
    if (seg2Cm >= 1) { // mínimo 1cm
        const s2x = intersectionPoint[0] + nx * offsetDist;
        const s2y = intersectionPoint[1] + ny * offsetDist;
        const e2x = wall.endPoint[0] + nx * offsetDist;
        const e2y = wall.endPoint[1] + ny * offsetDist;
        dims.push({
            startPoint: [s2x, s2y],
            endPoint: [e2x, e2y],
            anchorStart: intersectionPoint,
            anchorEnd: wall.endPoint,
            label: `${seg2Cm} cm`,
            color: '#FF9800', // Laranja para preview
            value: seg2Length,
            side: 'second'
        });
    }

    return dims;
}

/**
 * Calcula o snap preview para o cursor atual.
 * Procura a parede mais próxima e calcula ponto de interseção + cotas de divisão.
 * Para ser chamado pelo WallTool no onMouseMove quando NÃO está desenhando.
 * 
 * @param {number} cursorX - Posição X do cursor (mundo)
 * @param {number} cursorY - Posição Y do cursor (mundo)
 * @returns {boolean} true se um preview foi ativado
 */
function calculateWallSnapPreview(cursorX, cursorY) {
    let bestWall = null;
    let bestProjection = null;
    let bestDistance = Infinity;
    const maxDist = WALL_SNAP_PREVIEW_RADIUS;

    // 1. Verificar paredes existentes
    for (const wall of walls) {
        if (!wall || !wall.startPoint || !wall.endPoint) continue;
        const proj = projectPointOntoWall([cursorX, cursorY], wall);
        if (!proj) continue;

        if (proj.distance < maxDist && proj.distance < bestDistance) {
            // Descartar se está muito perto de um endpoint (endpoint já tem seu próprio snap)
            const distToStart = Math.sqrt(
                Math.pow(cursorX - wall.startPoint[0], 2) +
                Math.pow(cursorY - wall.startPoint[1], 2)
            );
            const distToEnd = Math.sqrt(
                Math.pow(cursorX - wall.endPoint[0], 2) +
                Math.pow(cursorY - wall.endPoint[1], 2)
            );
            const endpointThreshold = 5; // não mostrar divisão se muito perto da ponta
            if (distToStart < endpointThreshold || distToEnd < endpointThreshold) continue;

            bestDistance = proj.distance;
            bestWall = wall;
            bestProjection = proj;
        }
    }

    // 2. Verificar arestas de áreas de movimentação
    for (const area of movementAreas) {
        if (!area.vertices || area.vertices.length < 2) continue;
        for (let i = 0; i < area.vertices.length; i++) {
            const p1 = area.vertices[i];
            const p2 = area.vertices[(i + 1) % area.vertices.length];
            const edgeWall = { startPoint: p1, endPoint: p2, id: `edge-${area.id}-${i}` };
            const proj = projectPointOntoWall([cursorX, cursorY], edgeWall);
            if (!proj) continue;

            if (proj.distance < maxDist && proj.distance < bestDistance) {
                const distToStart = Math.sqrt(
                    Math.pow(cursorX - p1[0], 2) + Math.pow(cursorY - p1[1], 2)
                );
                const distToEnd = Math.sqrt(
                    Math.pow(cursorX - p2[0], 2) + Math.pow(cursorY - p2[1], 2)
                );
                const endpointThreshold = 5;
                if (distToStart < endpointThreshold || distToEnd < endpointThreshold) continue;

                bestDistance = proj.distance;
                bestWall = edgeWall;
                bestProjection = proj;
            }
        }
    }

    if (bestWall && bestProjection) {
        const dims = calculateWallSnapDivisionDimensions(
            bestProjection.projectedPoint,
            bestWall,
            bestProjection.t
        );
        const snapType = bestDistance < wallSnapRadius ? 'perpendicular' : 'preview';
        updateWallSnapPreview(
            bestProjection.projectedPoint,
            bestWall,
            dims,
            snapType
        );
        return true;
    }

    clearWallSnapPreview();
    return false;
}

/**
 * Desenha o preview de snap de parede: ponto de interseção + cotas de divisão
 * Para ser chamado pela função drawAll em drawing.js
 */
function drawWallSnapPreview() {
    const isActive = getWallSnapPreviewActive();
    if (!isActive) return;

    const ctx = getCtx();
    if (!ctx) return;

    const snapPoint = getWallSnapPreviewPoint();
    const snapWall = getWallSnapPreviewWall();
    const snapDimensions = getWallSnapPreviewDimensions();
    const snapType = getWallSnapPreviewType();

    if (!snapPoint || !snapWall) return;

    ctx.save();

    // === 1. Desenhar destaque da parede alvo (highlight sutil) ===
    ctx.strokeStyle = 'rgba(255, 152, 0, 0.4)';
    ctx.lineWidth = (wallVisualLineWidth + 4) / scale;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(snapWall.startPoint[0], snapWall.startPoint[1]);
    ctx.lineTo(snapWall.endPoint[0], snapWall.endPoint[1]);
    ctx.stroke();

    // === 2. Desenhar ponto de interseção (cruz + círculo) ===
    const radius = 7 / scale;
    const crossSize = 10 / scale;

    // Círculo preenchido com glow
    ctx.fillStyle = 'rgba(255, 152, 0, 0.3)';
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(snapPoint[0], snapPoint[1], radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Cruz no centro
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    ctx.moveTo(snapPoint[0] - crossSize, snapPoint[1]);
    ctx.lineTo(snapPoint[0] + crossSize, snapPoint[1]);
    ctx.moveTo(snapPoint[0], snapPoint[1] - crossSize);
    ctx.lineTo(snapPoint[0], snapPoint[1] + crossSize);
    ctx.stroke();

    // Linha perpendicular indicadora (mostra de onde o cursor está vindo)
    const wallDx = snapWall.endPoint[0] - snapWall.startPoint[0];
    const wallDy = snapWall.endPoint[1] - snapWall.startPoint[1];
    const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
    if (wallLen > 0) {
        const perpNx = -wallDy / wallLen;
        const perpNy = wallDx / wallLen;
        const perpLen = 20 / scale;
        ctx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([3 / scale, 3 / scale]);
        ctx.beginPath();
        ctx.moveTo(snapPoint[0] - perpNx * perpLen, snapPoint[1] - perpNy * perpLen);
        ctx.lineTo(snapPoint[0] + perpNx * perpLen, snapPoint[1] + perpNy * perpLen);
        ctx.stroke();
    }

    // === 3. Desenhar linhas de extensão (do ponto da parede ao ponto de cota) ===
    ctx.setLineDash([]);
    if (snapDimensions && snapDimensions.length > 0) {
        ctx.strokeStyle = 'rgba(255, 152, 0, 0.35)';
        ctx.lineWidth = 0.5 / scale;
        for (const dim of snapDimensions) {
            // Linha de extensão do anchorStart ao startPoint da cota
            if (dim.anchorStart) {
                ctx.beginPath();
                ctx.moveTo(dim.anchorStart[0], dim.anchorStart[1]);
                ctx.lineTo(dim.startPoint[0], dim.startPoint[1]);
                ctx.stroke();
            }
            // Linha de extensão do anchorEnd ao endPoint da cota
            if (dim.anchorEnd) {
                ctx.beginPath();
                ctx.moveTo(dim.anchorEnd[0], dim.anchorEnd[1]);
                ctx.lineTo(dim.endPoint[0], dim.endPoint[1]);
                ctx.stroke();
            }
        }
    }

    // === 4. Desenhar cotas de divisão ===
    if (snapDimensions && snapDimensions.length > 0) {
        const fontConfig = DIMENSION_SYSTEM.getFontConfig('divisions', scale);
        const scaledTickSize = getScaledSizeWithLimits(dimensionTickSize, scale, 2, 8);

        for (const dim of snapDimensions) {
            const startPt = dim.startPoint;
            const endPt = dim.endPoint;
            const dx = endPt[0] - startPt[0];
            const dy = endPt[1] - startPt[1];
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length < 1) continue;

            const color = dim.color || '#FF9800';
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = Math.max(0.5, dimensionLineWidth / scale);
            ctx.font = fontConfig.string;
            ctx.setLineDash([4 / scale, 3 / scale]);

            // Linha principal da cota
            ctx.beginPath();
            ctx.moveTo(startPt[0], startPt[1]);
            ctx.lineTo(endPt[0], endPt[1]);
            ctx.stroke();

            // Ticks
            ctx.setLineDash([]);
            const tnx = -dy / length;
            const tny = dx / length;
            ctx.beginPath();
            ctx.moveTo(startPt[0] - tny * scaledTickSize, startPt[1] + tnx * scaledTickSize);
            ctx.lineTo(startPt[0] + tny * scaledTickSize, startPt[1] - tnx * scaledTickSize);
            ctx.moveTo(endPt[0] - tny * scaledTickSize, endPt[1] + tnx * scaledTickSize);
            ctx.lineTo(endPt[0] + tny * scaledTickSize, endPt[1] - tnx * scaledTickSize);
            ctx.stroke();

            // Texto da dimensão
            const midX = (startPt[0] + endPt[0]) / 2;
            const midY = (startPt[1] + endPt[1]) / 2;
            const angle = Math.atan2(dy, dx);
            const textOff = 1.5;
            const textPosX = midX + tnx * (fontConfig.size * 0.5 * textOff);
            const textPosY = midY + tny * (fontConfig.size * 0.5 * textOff);

            // Fundo branco semitransparente para legibilidade
            const textMetrics = ctx.measureText(dim.label);
            const textW = textMetrics.width;
            const textH = fontConfig.size * 0.9;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(
                textPosX - textW / 2 - 2 / scale,
                textPosY - textH / 2 - 1 / scale,
                textW + 4 / scale,
                textH + 2 / scale
            );

            // Texto
            ctx.save();
            ctx.translate(textPosX, textPosY);
            ctx.rotate(angle);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
                ctx.rotate(Math.PI);
            }
            ctx.fillStyle = color;
            ctx.fillText(dim.label, 0, 0);
            ctx.restore();
        }
    }

    // === 5. Indicador de tipo de snap (texto pequeno) ===
    if (snapType === 'perpendicular') {
        const fontConfig = DIMENSION_SYSTEM.getFontConfig('angles', scale);
        ctx.font = fontConfig.string;
        ctx.fillStyle = 'rgba(255, 152, 0, 0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('⊥ SNAP', snapPoint[0], snapPoint[1] - 12 / scale);
    }

    ctx.restore();
}

// Exportar funções principais
export {    createWall,
    drawWall,
    drawWallPreview,
    drawWallDimension,
    drawSnapIndicators,
    findSnapPoint,
    findSnapPointWithSmartSnap,
    drawAreaHoverDimensions,
    moveWallsWithArea,
    rotateWallsWithArea,
    toggleAllWallDimensions,
    forceWallToArea,
    virtualDimensionsSystem,
    drawVirtualDimensions,
    drawDivisionDimensions,
    drawDivisionDimension,
    autoDivisionDimensionsSystem,
    layoutChangeNotifier,
    drawWallHandles,
    updateWallEndpoint,
    editWallLength,
    startWallEdit,
    stopWallEdit,
    isPointOnWallHandle,
    deleteWall,
    toggleWallDimensions,
    getWallHandleCursor,
    calculateWallSnapPreview,
    drawWallSnapPreview as drawWallSnapPreviewFeedback
};

