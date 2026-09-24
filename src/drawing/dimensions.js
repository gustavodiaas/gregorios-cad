import { 
    movementAreas, 
    resources,
    selectedAreaId, 
    selectedDimensionIndex, 
    hoveredAreaId, 
    getCtx, 
    getScale,
    getSelectedResourceId,
    walls
} from '../state.js';
import { 
    dimensionLineWidth, 
    dimensionOffset, 
    pixelsPerCm, 
    floatTolerance, 
    dimensionTickSize, 
    DIMENSION_SYSTEM,
    dimensionEditColor, 
    dimensionEditHoverColor,
    getGlobalShowDimensions,
    getDimensionColor,
    getDynamicDimensionColor
} from '../config.js';
import { 
    areEdgesParallel, 
    getClosestPointsBetweenAreas, 
    rectangleToVertices} from '../areas.js';
import { dimensionDeclutter } from './dimension-declutter.js';
import { formatLength } from '../measurement-units.js';
import {
    getClosestPointsBetweenResources
} from '../merge_resources/resource_operations.js';

/**
 * Desenha ângulos em vértices.
 * @param {Array} vertex
 * @param {Array} p1
 * @param {Array} p2
 * @param {number} angle
 * @param {number|string} angleIndex
 * @param {Array} polygonVertices - Vértices do polígono para determinação de posicionamento interno
 */
function drawAngle(vertex, p1, p2, angle, angleIndex = -1, polygonVertices = null) {
    const ctx = getCtx();
    
    // Skip if angle is too close to 180 degrees (straight line)
    if (Math.abs(angle - 180) < 1) return;
    
    const radius = 15 / getScale();
    
    // Calculate text position first to determine dynamic color
    let midAngle = (Math.atan2(p1[1] - vertex[1], p1[0] - vertex[0]) + Math.atan2(p2[1] - vertex[1], p2[0] - vertex[0])) / 2;
    let textRadius = radius + 5 / getScale();
    let textX = vertex[0] + Math.cos(midAngle) * textRadius;
    let textY = vertex[1] + Math.sin(midAngle) * textRadius;
    
    // For rectangles, position text internally
    if (polygonVertices && polygonVertices.length >= 3) {
        // Calculate centroid
        let centroidX = 0, centroidY = 0;
        for (const vtx of polygonVertices) {
            centroidX += vtx[0];
            centroidY += vtx[1];
        }
        centroidX /= polygonVertices.length;
        centroidY /= polygonVertices.length;
        
        // Vector from vertex to centroid (pointing inward)
        const toCenterX = centroidX - vertex[0];
        const toCenterY = centroidY - vertex[1];
        const toCenterLen = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
        
        if (toCenterLen > 0) {
            // Normalize and use as direction for text positioning
            const inwardX = toCenterX / toCenterLen;
            const inwardY = toCenterY / toCenterLen;
            
            // Position text slightly inward from the vertex
            textX = vertex[0] + inwardX * textRadius;
            textY = vertex[1] + inwardY * textRadius;
        }
    }
    
    // Use dynamic color based on text position
    const color = getDynamicDimensionColor(textX, textY);
    
    // Declutter: registrar o rótulo do ângulo para detecção de sobreposição
    const angleText = `${Math.round(angle)}°`;
    const declutterResult = dimensionDeclutter.registerLabel(
        textX, textY, angleText, 0, radius * 3, 'angles', -500
    );
    if (!declutterResult.visible) {
        return; // Ângulo ocultado por sobreposição
    }
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1 / getScale();
    
    // Sistema unificado de cotas para ângulos
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('angles', getScale());
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
    
    // Text positioning was already calculated above
    
    // For rectangles, position text internally (text position already calculated above)
    if (polygonVertices && polygonVertices.length >= 3) {
        // Text position was already calculated and updated above
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(angle)}°`, textX, textY);
        return;
    }
    
    // Default positioning (external) for non-rectangles or fallback
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(angle)}°`, textX, textY);
}

/**
 * Calcula o ângulo entre três pontos (em graus).
 */
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

/**
 * Desenha as dimensões de um segmento.
 */
function drawSegmentDimension(p1, p2, textValue, offsetVal_world, polygonVertices = null, isHole = false, segmentIndex = null) {
    const fractionResult = permanentDimensionsFractionation.calculateFractionedDimension(
        p1, p2, textValue, offsetVal_world, polygonVertices, isHole
    );
    const segments = (fractionResult && fractionResult.segments) || [{
        startPoint: p1,
        endPoint: p2,
        text: textValue,
        offset: offsetVal_world
    }];
    const hasSplit = segments.length > 1;

    if (hasSplit) {
        const now = Date.now();
        if (!permanentDimensionsFractionation.lastLogTime ||
            now - permanentDimensionsFractionation.lastLogTime > 2000 ||
            permanentDimensionsFractionation.calculationCount % 10 === 0) {
            permanentDimensionsFractionation.lastLogTime = now;
        }

        segments.forEach((segment, index) => {
            drawSingleSegmentDimension(
                segment.startPoint,
                segment.endPoint,
                segment.text,
                segment.offset ?? offsetVal_world,
                polygonVertices,
                isHole,
                `${segmentIndex}_${index}`
            );
        });

        if (fractionResult && fractionResult.summary) {
            const summary = fractionResult.summary;
            drawSingleSegmentDimension(
                summary.startPoint,
                summary.endPoint,
                summary.text,
                summary.offset ?? offsetVal_world,
                polygonVertices,
                isHole,
                `${segmentIndex}_summary`
            );
        }

        return;
    }

    const [segment] = segments;
    drawSingleSegmentDimension(
        segment.startPoint,
        segment.endPoint,
        segment.text,
        segment.offset ?? offsetVal_world,
        polygonVertices,
        isHole,
        segmentIndex
    );
}

/**
 * Desenha uma única dimensão de segmento (implementação original)
 * @param {Array} p1 - Ponto inicial
 * @param {Array} p2 - Ponto final
 * @param {string} textValue - Texto da dimensão
 * @param {number} offsetVal_world - Offset da linha
 * @param {Array} polygonVertices - Vértices do polígono
 * @param {boolean} isHole - Se é um buraco
 * @param {number|string} segmentIndex - Índice do segmento
 */
function drawSingleSegmentDimension(p1, p2, textValue, offsetVal_world, polygonVertices = null, isHole = false, segmentIndex = null) {
    const ctx = getCtx();
    const scale = getScale();
    
    // Sistema unificado de cotas para áreas
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('areas', scale);
    const scaledDimensionTickSize = dimensionTickSize / scale;
    
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    
    if (segmentLength < floatTolerance / scale) return;
    
    let nx = -dy / segmentLength;
    let ny = dx / segmentLength;
    
    if (polygonVertices && polygonVertices.length > 2) {
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
            if (dotProduct < 0) {
                nx = -nx;
                ny = -ny;
            }
        } else {
            if (dotProduct > 0) {
                nx = -nx;
                ny = -ny;
            }
        }
    }
    
    const actualOffset = Math.abs(offsetVal_world);
    const c1x = p1[0] + nx * actualOffset;
    const c1y = p1[1] + ny * actualOffset;
    const c2x = p2[0] + nx * actualOffset;
    const c2y = p2[1] + ny * actualOffset;
    
    const midCx = (c1x + c2x) / 2;
    const midCy = (c1y + c2y) / 2;
    let angle = Math.atan2(dy, dx);
    
    const textOffsetMultiplier = 1.5;
    const textPosX = midCx + nx * (fontConfig.size * 0.5 * textOffsetMultiplier);
    const textPosY = midCy + ny * (fontConfig.size * 0.5 * textOffsetMultiplier);
    
    // --- Declutter: verificar se este rótulo deve ser exibido ---
    const declutterResult = dimensionDeclutter.registerLabel(
        textPosX, textPosY, textValue, angle, segmentLength, 'areas'
    );
    if (!declutterResult.visible) {
        return; // Rótulo ocultado por sobreposição ou LOD
    }
    
    // Use dynamic color based on text position
    const dynamicColor = getDynamicDimensionColor(textPosX, textPosY);
    
    ctx.strokeStyle = dynamicColor;
    ctx.fillStyle = dynamicColor;
    ctx.lineWidth = dimensionLineWidth / scale;
    ctx.font = fontConfig.string;
    
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]); ctx.lineTo(c1x, c1y);
    ctx.moveTo(p2[0], p2[1]); ctx.lineTo(c2x, c2y);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(c1x, c1y); ctx.lineTo(c2x, c2y);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(c1x - ny * scaledDimensionTickSize, c1y + nx * scaledDimensionTickSize);
    ctx.lineTo(c1x + ny * scaledDimensionTickSize, c1y - nx * scaledDimensionTickSize);
    ctx.moveTo(c2x - ny * scaledDimensionTickSize, c2y + nx * scaledDimensionTickSize);
    ctx.lineTo(c2x + ny * scaledDimensionTickSize, c2y - nx * scaledDimensionTickSize);
    ctx.stroke();
    
    ctx.save();
    ctx.translate(textPosX, textPosY);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        ctx.rotate(Math.PI);
        ctx.textBaseline = 'top';
    }
    
    ctx.fillText(textValue, 0, 0);
    ctx.restore();
}

/**
 * Desenha uma dimensão editável para um segmento.
 * @param {Array} p1 - Ponto inicial do segmento
 * @param {Array} p2 - Ponto final do segmento
 * @param {string} textValue - Texto da dimensão
 * @param {number} offsetVal_world - Offset da linha de dimensão
 * @param {number|string} segmentIndex - Índice do segmento
 * @param {Array} polygonVertices - Vértices do polígono
 * @param {boolean} isHole - Se é um buraco
 */
function drawEditableDimension(p1, p2, textValue, offsetVal_world, segmentIndex, polygonVertices, isHole = false) {
    const ctx = getCtx();
    const scale = getScale();
    
    // Sistema unificado de cotas para áreas editáveis
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('areas', scale);
    const scaledDimensionTickSize = dimensionTickSize / scale;
    
    // Verificar se esta dimensão está sendo editada
    const isSelected = selectedDimensionIndex === segmentIndex;
    const isHovered = hoveredAreaId && selectedAreaId === hoveredAreaId;
    
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    
    if (segmentLength < floatTolerance / scale) return;
    
    let nx = -dy / segmentLength;
    let ny = dx / segmentLength;
    
    // Determinar direção da dimensão baseada no centroide
    if (polygonVertices && polygonVertices.length > 2) {
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
            if (dotProduct < 0) {
                nx = -nx;
                ny = -ny;
            }
        } else {
            if (dotProduct > 0) {
                nx = -nx;
                ny = -ny;
            }
        }
    }
    
    const actualOffset = Math.abs(offsetVal_world);
    const c1x = p1[0] + nx * actualOffset;
    const c1y = p1[1] + ny * actualOffset;
    const c2x = p2[0] + nx * actualOffset;
    const c2y = p2[1] + ny * actualOffset;
    
    const midCx = (c1x + c2x) / 2;
    const midCy = (c1y + c2y) / 2;
    let angle = Math.atan2(dy, dx);
    
    const textOffsetMultiplier = isSelected ? 2 : 1.5;
    const textPosX = midCx + nx * (fontConfig.size * 0.5 * textOffsetMultiplier);
    const textPosY = midCy + ny * (fontConfig.size * 0.5 * textOffsetMultiplier);
    
    // Declutter: verificar sobreposição (cotas editáveis têm prioridade extra)
    if (!isSelected) {
        const declutterResult = dimensionDeclutter.registerLabel(
            textPosX, textPosY, textValue, angle, segmentLength, 'areas', 1000
        );
        if (!declutterResult.visible) {
            return;
        }
    }
    
    // Cores baseadas no estado - usar cor dinâmica apenas quando não selecionada
    let color;
    if (isSelected) {
        color = dimensionEditColor;
    } else if (isHovered) {
        color = dimensionEditHoverColor;
    } else {
        color = getDynamicDimensionColor(textPosX, textPosY);
    }
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = (isSelected ? 2 : 1) * dimensionLineWidth / scale;
    ctx.font = fontConfig.string;
    
    // Desenhar linhas de extensão
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(c1x, c1y);
    ctx.moveTo(p2[0], p2[1]);
    ctx.lineTo(c2x, c2y);
    ctx.stroke();
    
    // Desenhar linha principal da dimensão
    ctx.beginPath();
    ctx.moveTo(c1x, c1y);
    ctx.lineTo(c2x, c2y);
    ctx.stroke();
    
    // Desenhar ticks
    const tickSize = scaledDimensionTickSize * (isSelected ? 1.2 : 1);
    ctx.beginPath();
    ctx.moveTo(c1x - ny * tickSize, c1y + nx * tickSize);
    ctx.lineTo(c1x + ny * tickSize, c1y - nx * tickSize);
    ctx.moveTo(c2x - ny * tickSize, c2y + nx * tickSize);
    ctx.lineTo(c2x + ny * tickSize, c2y - nx * scaledDimensionTickSize);
    ctx.stroke();
    
    // Fundo para texto se selecionado
    if (isSelected) {
        ctx.save();
        ctx.translate(textPosX, textPosY);
        ctx.rotate(angle);
        
        const metrics = ctx.measureText(textValue);
        const padding = 3 / scale;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(
            -metrics.width / 2 - padding,
            -fontConfig.size - padding,
            metrics.width + 2 * padding,
            fontConfig.size + 2 * padding
        );
        ctx.restore();
    }
    
    // Desenhar texto
    ctx.save();
    ctx.translate(textPosX, textPosY);
    ctx.rotate(angle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        ctx.rotate(Math.PI);
        ctx.textBaseline = 'top';
    }
    
    ctx.fillText(textValue, 0, 0);
    ctx.restore();
    
    // Desenhar indicadores de edição se selecionado
    if (isSelected) {
        const indicatorSize = 4 / scale;
        
        // Indicadores nos pontos da dimensão
        ctx.fillStyle = dimensionEditColor;
        ctx.beginPath();
        ctx.arc(c1x, c1y, indicatorSize, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(c2x, c2y, indicatorSize, 0, 2 * Math.PI);
        ctx.fill();
        
        // Indicador no texto
        ctx.beginPath();
        ctx.arc(textPosX, textPosY, indicatorSize * 1.5, 0, 2 * Math.PI);
        ctx.fill();
    }
}

/**
 * Desenha uma linha de dimensão simples.
 */
function drawDimensionLine(x1, y1, x2, y2, text, position) {
    const ctx = getCtx();
    const scale = getScale();
    
    // Calculate text position first to determine dynamic color
    let textX, textY;
    const textPadding = 2 / scale;
    if (position === 'below') {
        textX = (x1 + x2) / 2;
        textY = y1 + textPadding;
    } else if (position === 'right') {
        textX = x1 + textPadding;
        textY = (y1 + y2) / 2;
    } else {
        textX = (x1 + x2) / 2;
        textY = (y1 + y2) / 2;
    }
    
    // Use dynamic color based on text position
    const dynamicColor = getDynamicDimensionColor(textX, textY);
    
    ctx.strokeStyle = dynamicColor; 
    ctx.fillStyle = dynamicColor;
    ctx.lineWidth = dimensionLineWidth / scale;
    
    // Sistema unificado de cotas para linhas de dimensão
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('areas', scale);
    ctx.font = fontConfig.string;
    
    ctx.beginPath(); 
    ctx.moveTo(x1, y1); 
    ctx.lineTo(x2, y2); 
    ctx.stroke();
    
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const tickSizeScaled = dimensionTickSize / scale;
    
    ctx.save(); 
    ctx.translate(x1, y1); 
    ctx.rotate(angle);
    ctx.beginPath(); 
    ctx.moveTo(0, -tickSizeScaled); 
    ctx.lineTo(0, tickSizeScaled); 
    ctx.stroke();
    ctx.restore();
    
    ctx.save(); 
    ctx.translate(x2, y2); 
    ctx.rotate(angle);
    ctx.beginPath(); 
    ctx.moveTo(0, -tickSizeScaled); 
    ctx.lineTo(0, tickSizeScaled); 
    ctx.stroke();
    ctx.restore();
    
    if (position === 'below') {
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'top';
        ctx.fillText(text, textX, textY);
    } else if (position === 'right') {
        ctx.textAlign = 'left'; 
        ctx.textBaseline = 'middle';
        ctx.fillText(text, textX, textY);
    }
}

/**
 * Desenha as dimensões de uma área (cotas dos segmentos e ângulos).
 * @param {Object} area - Área para desenhar as dimensões
 */
function drawDimensions(area) {
    // Verificar controle global de cotas
    if (!getGlobalShowDimensions()) {
        return;
    }
    
    const ctx = getCtx();
    const vertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
    
    if (!vertices || vertices.length < 3) return;
    
    // Desenhar dimensões do contorno principal
    drawRingDimensions(vertices, false, area);
    
    // Desenhar dimensões dos buracos se existirem
    if (area.rings && area.rings.length > 1) {
        for (let i = 1; i < area.rings.length; i++) {
            const holeRing = area.rings[i];
            if (holeRing && holeRing.length >= 3) {
                drawRingDimensions(holeRing, true, area);
            }
        }
    }
}

/**
 * Desenha as dimensões de um anel de vértices (contorno ou buraco).
 * @param {Array} ringVertices - Vértices do anel
 * @param {boolean} isHole - Se é um buraco
 * @param {Object} area - Área proprietária
 */
function drawRingDimensions(ringVertices, isHole = false, area = null) {
    if (!ringVertices || ringVertices.length < 3) return;
    
    const offsetVal = isHole ? -dimensionOffset : dimensionOffset;
    
    // Desenhar cotas dos segmentos - sempre usar cotas simples (não editáveis)
    for (let i = 0; i < ringVertices.length; i++) {
        const p1 = ringVertices[i];
        const p2 = ringVertices[(i + 1) % ringVertices.length];
        
        const segmentLength = Math.sqrt(
            Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2)
        );
        
        if (segmentLength < floatTolerance) continue;
        
        // LOD check: pular segmentos muito pequenos na tela para evitar poluição visual
        if (!dimensionDeclutter.shouldDrawByLOD(segmentLength)) continue;
        
        const segmentLengthCm = Math.round(segmentLength / pixelsPerCm * 10) / 10;
        const textValue = formatLength(segmentLengthCm);
        
        // Sempre usar dimensão simples (não editável)
        drawSegmentDimension(p1, p2, textValue, offsetVal, ringVertices, isHole, i);
    }
    
    // Desenhar ângulos nos vértices (apenas para contorno principal ou se explicitamente habilitado)
    if (!isHole || (area && area.showAngles)) {
        const scale = getScale();
        for (let i = 0; i < ringVertices.length; i++) {
            const prevVertex = ringVertices[(i - 1 + ringVertices.length) % ringVertices.length];
            const currentVertex = ringVertices[i];
            const nextVertex = ringVertices[(i + 1) % ringVertices.length];
            
            // LOD para ângulos: calcular tamanho médio dos segmentos adjacentes
            const seg1Len = Math.sqrt(
                Math.pow(currentVertex[0] - prevVertex[0], 2) + Math.pow(currentVertex[1] - prevVertex[1], 2)
            );
            const seg2Len = Math.sqrt(
                Math.pow(nextVertex[0] - currentVertex[0], 2) + Math.pow(nextVertex[1] - currentVertex[1], 2)
            );
            const avgSegLen = (seg1Len + seg2Len) / 2;
            // Ocultar ângulos se os segmentos adjacentes são muito pequenos na tela
            if (!dimensionDeclutter.shouldDrawByLOD(avgSegLen)) continue;
            
            const angle = calculateAngle(prevVertex, currentVertex, nextVertex);
            
            // Apenas desenhar ângulos que não são muito próximos de 180°
            if (Math.abs(angle - 180) > 5) {
                drawAngle(
                    currentVertex, 
                    prevVertex, 
                    nextVertex, 
                    angle, 
                    i, 
                    ringVertices
                );
            }
        }
    }
}

/**
 * Desenha uma cota específica entre duas áreas adjacentes.
 */
function drawAdjacentAreaDimension(area1, area2, proximity) {
    const ctx = getCtx();
    const scale = getScale();
    const { distance, point1, point2, edge1, edge2 } = proximity;
    
    // Calcular ponto médio para a cota
    const midX = (point1[0] + point2[0]) / 2;
    const midY = (point1[1] + point2[1]) / 2;
    
    // Calcular direção perpendicular para offset da cota
    const dx = point2[0] - point1[0];
    const dy = point2[1] - point1[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len < floatTolerance) {
        // Se os pontos são idênticos, usar direção da aresta
        const edgeDx = edge1.end[0] - edge1.start[0];
        const edgeDy = edge1.end[1] - edge1.start[1];
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
        
        if (edgeLen > floatTolerance) {
            // Usar normal à aresta
            const nx = -edgeDy / edgeLen;
            const ny = edgeDx / edgeLen;
            const offset = 20;
            
            const dimLineX1 = point1[0] + nx * offset;
            const dimLineY1 = point1[1] + ny * offset;
            const dimLineX2 = point2[0] + nx * offset;
            const dimLineY2 = point2[1] + ny * offset;
            
            // Desenhar apenas o texto para áreas encostadas
            ctx.save();
            ctx.translate(midX + nx * offset, midY + ny * offset);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const text = distance < 1 ? 'Encostadas' : formatLength(distance / pixelsPerCm);
            const metrics = ctx.measureText(text);
            const padding = 2 / scale;
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(
                -metrics.width / 2 - padding,
                -5.5 / scale - padding,
                metrics.width + 2 * padding,
                11 / scale + 2 * padding
            );
            
            ctx.fillStyle = '#28a745';
            ctx.fillText(text, 0, 0);
            ctx.restore();
            return;
        }
    }
    
    const nx = -dy / len; // Normal perpendicular
    const ny = dx / len;
    
    // Offset para a linha de cota
    const offset = 20;
    const dimLineX1 = point1[0] + nx * offset;
    const dimLineY1 = point1[1] + ny * offset;
    const dimLineX2 = point2[0] + nx * offset;
    const dimLineY2 = point2[1] + ny * offset;
    
    // Para distâncias muito pequenas, desenhar apenas o texto
    if (distance < 0) {
        ctx.save();
        ctx.translate(midX, midY);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const text = 'Encostadas';
        const metrics = ctx.measureText(text);
        const padding = 3 / scale;
        
        ctx.fillStyle = 'rgba(40, 167, 69, 0.9)';
        ctx.fillRect(
            -metrics.width / 2 - padding,
            -5.5 / scale - padding,
            metrics.width + 2 * padding,
            11 / scale + 2 * padding
        );
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, 0, 0);
        ctx.restore();
        return;
    }
    
    // Desenhar linhas de extensão
    ctx.beginPath();
    ctx.moveTo(point1[0], point1[1]);
    ctx.lineTo(dimLineX1, dimLineY1);
    ctx.moveTo(point2[0], point2[1]);
    ctx.lineTo(dimLineX2, dimLineY2);
    ctx.stroke();
    
    // Desenhar linha principal da cota
    ctx.beginPath();
    ctx.moveTo(dimLineX1, dimLineY1);
    ctx.lineTo(dimLineX2, dimLineY2);
    ctx.stroke();
    
    // Desenhar ticks
    const tickSize = 3 / scale;
    ctx.beginPath();
    ctx.moveTo(dimLineX1 - ny * tickSize, dimLineY1 + nx * tickSize);
    ctx.lineTo(dimLineX1 + ny * tickSize, dimLineY1 - nx * tickSize);
    ctx.moveTo(dimLineX2 - ny * tickSize, dimLineY2 + nx * tickSize);
    ctx.lineTo(dimLineX2 + ny * tickSize, dimLineY2 - nx * tickSize);
    ctx.stroke();
    
    // Texto da distância
    const dimMidX = (dimLineX1 + dimLineX2) / 2;
    const dimMidY = (dimLineY1 + dimLineY2) / 2;
    const distanceCm = Math.round(distance / pixelsPerCm * 10) / 10;
    
    ctx.save();
    ctx.translate(dimMidX, dimMidY);
    
    // Rotacionar texto para ficar paralelo à linha
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        angle += Math.PI; // Virar texto se estiver de cabeça para baixo
    }
    ctx.rotate(angle);
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Fundo semi-transparente para o texto
    const text = formatLength(distanceCm);
    const metrics = ctx.measureText(text);
    const padding = 2 / scale;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(
        -metrics.width / 2 - padding,
        -11 / scale - padding,
        metrics.width + 2 * padding,
        11 / scale + 2 * padding
    );
    
    // Texto da distância
    ctx.fillStyle = '#28a745';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    
    // Indicador visual se as arestas são paralelas
    if (areEdgesParallel(edge1, edge2)) {
        const iconSize = 6 / scale;
        const iconX = midX + nx * (15 / scale);
        const iconY = midY + ny * (15 / scale);
        
        ctx.save();
        ctx.strokeStyle = '#28a745';
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.moveTo(iconX - iconSize, iconY - iconSize/3);
        ctx.lineTo(iconX + iconSize, iconY - iconSize/3);
        ctx.moveTo(iconX - iconSize, iconY + iconSize/3);
        ctx.lineTo(iconX + iconSize, iconY + iconSize/3);
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * Desenha cotas entre todas as áreas que estão adjacentes (encostadas).
 */
function drawAdjacentAreasDimensions() {
    const ctx = getCtx();
    const scale = getScale();
    const processedPairs = new Set();
    
    ctx.save();
    ctx.strokeStyle = '#28a745'; // Verde para cotas de adjacência
    ctx.fillStyle = '#28a745';
    ctx.lineWidth = 1.5 / scale;
    
    // Sistema unificado de cotas para adjacências
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('adjacency', scale);
    ctx.font = fontConfig.string;
    
    ctx.setLineDash([2 / scale, 2 / scale]); // Linha pontilhada
    
    for (let i = 0; i < movementAreas.length; i++) {
        const area1 = movementAreas[i];
        for (let j = i + 1; j < movementAreas.length; j++) {
            const area2 = movementAreas[j];
            
            const pairKey = `${Math.min(area1.id, area2.id)}-${Math.max(area1.id, area2.id)}`;
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);
            
            // Calcular proximidade primeiro
            const proximity = getClosestPointsBetweenAreas(area1, area2);
            if (proximity) {
                // Usar tolerância maior para mostrar cotas de áreas próximas
                const showDimensionTolerance = 15; // Mostrar cotas para áreas até 15 pixels de distância
                
                if (proximity.distance <= showDimensionTolerance) {
                    drawAdjacentAreaDimension(area1, area2, proximity);
                    
                    // Desenhar cotas de união virtual se as áreas são adjacentes
                    if (proximity.distance <= 2) { // Muito próximas = encostadas
                        // drawVirtualUnionDimensions(area1, area2); // Função opcional - comentada por ora
                    }
                }
            }
        }
    }
    
    ctx.restore();
}

/**
 * Desenha cotas que aparecem quando uma área está sendo movida e se aproxima de outra área.
 */
function drawInterAreaDimensions(movingArea) {
    const ctx = getCtx();
    const scale = getScale();
    
    ctx.save();
    ctx.strokeStyle = '#17a2b8'; // Azul para cotas dinâmicas de áreas
    ctx.fillStyle = '#17a2b8';
    ctx.lineWidth = 2 / scale;
    
    // Sistema unificado de cotas para cotas dinâmicas entre áreas
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('adjacency', scale);
    ctx.font = fontConfig.string;
    
    ctx.setLineDash([3 / scale, 3 / scale]);
    
    movementAreas.forEach(area => {
        if (area.id === movingArea.id) return;
        
        const proximity = getClosestPointsBetweenAreas(movingArea, area);
        if (proximity && proximity.distance <= 30) { // Mostrar durante movimento até 30px
            drawAdjacentAreaDimension(movingArea, area, proximity);
        }
    });
    
    ctx.restore();
}

/**
 * Desenha cotas entre todos os recursos que estão adjacentes (encostadas).
 */
function drawAdjacentResourcesDimensions() {
    const ctx = getCtx();
    const scale = getScale();
    const processedPairs = new Set();
    const selectedResourceId = getSelectedResourceId();
    
    // Se não há recurso selecionado, não desenhar cotas "encostadas"
    if (!selectedResourceId) {
        return;
    }
    
    ctx.save();
    ctx.strokeStyle = '#dc3545'; // Vermelho para cotas de recursos (diferente do verde das áreas)
    ctx.fillStyle = '#dc3545';
    ctx.lineWidth = 1.5 / scale;
    
    // Sistema unificado de cotas para adjacências de recursos
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('adjacency', scale);
    ctx.font = fontConfig.string;
    
    ctx.setLineDash([2 / scale, 2 / scale]); // Linha pontilhada
    
    for (let i = 0; i < resources.length; i++) {
        const resource1 = resources[i];
        if (!resource1.visible) continue;
        
        for (let j = i + 1; j < resources.length; j++) {
            const resource2 = resources[j];
            if (!resource2.visible) continue;
            
            // Mostrar cota apenas se um dos recursos estiver selecionado
            const isResource1Selected = resource1.id === selectedResourceId;
            const isResource2Selected = resource2.id === selectedResourceId;
            
            if (!isResource1Selected && !isResource2Selected) {
                continue;
            }
            
            const pairKey = `${Math.min(resource1.id, resource2.id)}-${Math.max(resource1.id, resource2.id)}`;
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);
            
            // Calcular proximidade primeiro
            const proximity = getClosestPointsBetweenResources(resource1, resource2);
            if (proximity) {
                // Usar tolerância maior para mostrar cotas de recursos próximos
                const showDimensionTolerance = 15; // Mostrar cotas para recursos até 15 pixels de distância
                
                if (proximity.distance <= showDimensionTolerance) {
                    drawAdjacentResourceDimension(resource1, resource2, proximity);
                }
            }
        }
    }
    
    ctx.restore();
}

/**
 * Desenha uma cota entre dois recursos adjacentes com feedback visual "Encostadas".
 */
function drawAdjacentResourceDimension(resource1, resource2, proximity) {
    const ctx = getCtx();
    const scale = getScale();
    
    if (!proximity || !proximity.point1 || !proximity.point2) return;

    const point1 = proximity.point1;
    const point2 = proximity.point2;
    const distance = proximity.distance;
    
    const midX = (point1[0] + point2[0]) / 2;
    const midY = (point1[1] + point2[1]) / 2;
    
    // Tolerância para considerar pontos idênticos
    const floatTolerance = 0.001;
    
    const dx = point2[0] - point1[0];
    const dy = point2[1] - point1[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len < floatTolerance || distance < 0) {
        // Para recursos encostados, desenhar apenas o texto centralizado
        ctx.save();
        ctx.translate(midX, midY);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const text = 'Encostadas';
        const metrics = ctx.measureText(text);
        const padding = 3 / scale;
        
        // Fundo verde para recursos (diferente do verde das áreas)
        ctx.fillStyle = 'rgba(220, 53, 69, 0.9)'; // Vermelho/rosa para diferenciar de áreas
        ctx.fillRect(
            -metrics.width / 2 - padding,
            -5.5 / scale - padding,
            metrics.width + 2 * padding,
            11 / scale + 2 * padding
        );
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, 0, 0);
        ctx.restore();
        return;
    }
    
    // Para recursos com alguma distância, mostrar distância
    const nx = -dy / len; // Normal perpendicular
    const ny = dx / len;
    
    // Offset para a linha de cota
    const offset = 20;
    const dimLineX1 = point1[0] + nx * offset;
    const dimLineY1 = point1[1] + ny * offset;
    const dimLineX2 = point2[0] + nx * offset;
    const dimLineY2 = point2[1] + ny * offset;
    
    // Desenhar linha de cota
    ctx.beginPath();
    ctx.moveTo(dimLineX1, dimLineY1);
    ctx.lineTo(dimLineX2, dimLineY2);
    ctx.stroke();
    
    // Desenhar linhas de extensão
    ctx.beginPath();
    ctx.moveTo(point1[0], point1[1]);
    ctx.lineTo(dimLineX1, dimLineY1);
    ctx.moveTo(point2[0], point2[1]);
    ctx.lineTo(dimLineX2, dimLineY2);
    ctx.stroke();
    
    // Desenhar texto da distância
    ctx.save();
    ctx.translate((dimLineX1 + dimLineX2) / 2, (dimLineY1 + dimLineY2) / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const text = formatLength(distance / pixelsPerCm);
    const metrics = ctx.measureText(text);
    const padding = 2 / scale;
    
    // Fundo para recursos
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(
        -metrics.width / 2 - padding,
        -5.5 / scale - padding,
        metrics.width + 2 * padding,
        11 / scale + 2 * padding
    );
    
    ctx.fillStyle = '#dc3545'; // Cor vermelha para recursos
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

/**
 * Desenha cotas que aparecem quando um recurso está sendo movido e se aproxima de outro recurso.
 */
function drawInterResourceDimensions(movingResource) {
    const ctx = getCtx();
    const scale = getScale();
    
    ctx.save();
    ctx.strokeStyle = '#fd7e14'; // Laranja para cotas dinâmicas de recursos
    ctx.fillStyle = '#fd7e14';
    ctx.lineWidth = 2 / scale;
    
    // Sistema unificado de cotas para cotas dinâmicas entre recursos
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('adjacency', scale);
    ctx.font = fontConfig.string;
    
    ctx.setLineDash([3 / scale, 3 / scale]);
    
    resources.forEach(resource => {
        if (resource._plannerHidden || resource.id === movingResource.id) return;
        if (resource.visible === false) return;
        
        const proximity = getClosestPointsBetweenResources(movingResource, resource);
        if (proximity && proximity.distance <= 30) { // Mostrar durante movimento até 30px
            drawAdjacentResourceDimension(movingResource, resource, proximity);
        }
    });
    
    ctx.restore();
}

const SEGMENT_PARAM_MARGIN = 0.004;
const POINT_DUPLICATE_TOLERANCE = 0.5;

function arePointsAlmostEqual(a, b, tolerance = POINT_DUPLICATE_TOLERANCE) {
    if (!a || !b) return false;
    return Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;
}

function getLineIntersectionPoint(line1Start, line1End, line2Start, line2End) {
    const x1 = line1Start[0], y1 = line1Start[1];
    const x2 = line1End[0], y2 = line1End[1];
    const x3 = line2Start[0], y3 = line2Start[1];
    const x4 = line2End[0], y4 = line2End[1];
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-6) {
        return null;
    }
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    }
    return null;
}

function getSegmentParameter(start, end, point) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return 0;
    const dot = (point[0] - start[0]) * dx + (point[1] - start[1]) * dy;
    return Math.max(0, Math.min(1, dot / lengthSq));
}

function collectBoundaryIntersections(p1, p2) {
    const points = [
        { point: [p1[0], p1[1]], t: 0 },
        { point: [p2[0], p2[1]], t: 1 }
    ];

    if (!walls || walls.length === 0) {
        return points;
    }

    for (const wall of walls) {
        if (!wall || !wall.startPoint || !wall.endPoint) continue;
        const intersection = getLineIntersectionPoint(p1, p2, wall.startPoint, wall.endPoint);
        if (!intersection) continue;
        const t = getSegmentParameter(p1, p2, intersection);
        if (t <= SEGMENT_PARAM_MARGIN || t >= 1 - SEGMENT_PARAM_MARGIN) continue;
        if (points.some(existing => arePointsAlmostEqual(existing.point, intersection))) {
            continue;
        }
        points.push({ point: [intersection[0], intersection[1]], t });
    }

    points.sort((a, b) => a.t - b.t);
    return points;
}

function buildDefaultFraction(p1, p2, textValue, offsetVal_world) {
    return {
        segments: [{
            startPoint: [p1[0], p1[1]],
            endPoint: [p2[0], p2[1]],
            text: textValue,
            offset: offsetVal_world
        }],
        summary: null
    };
}

function distanceBetweenPoints(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Sistema de fracionamento de dimensões baseado nas interseções de paredes
 */
const permanentDimensionsFractionation = {
    calculationCount: 0,
    lastLogTime: null,

    /**
     * Retorna segmentos fracionados e um resumo quando houver divisões
     */
    calculateFractionedDimension(p1, p2, textValue, offsetVal_world) {
        this.calculationCount++;
        const defaultResult = buildDefaultFraction(p1, p2, textValue, offsetVal_world);

        const baseLength = distanceBetweenPoints(p1, p2);
        if (baseLength < floatTolerance) {
            return defaultResult;
        }

        const intersectionPoints = collectBoundaryIntersections(p1, p2);
        if (intersectionPoints.length <= 2) {
            return defaultResult;
        }

        const segments = [];
        for (let i = 0; i < intersectionPoints.length - 1; i++) {
            const start = intersectionPoints[i];
            const end = intersectionPoints[i + 1];
            const segmentLength = distanceBetweenPoints(start.point, end.point);
            if (segmentLength < floatTolerance) continue;
            const segmentCm = Math.round(segmentLength / pixelsPerCm * 10) / 10;
            if (segmentCm <= 0) continue;
            segments.push({
                startPoint: [start.point[0], start.point[1]],
                endPoint: [end.point[0], end.point[1]],
                text: formatLength(segmentCm),
                offset: offsetVal_world
            });
        }

        if (segments.length === 0) {
            return defaultResult;
        }

        if (segments.length === 1) {
            return { segments, summary: null };
        }

        const direction = offsetVal_world >= 0 ? 1 : -1;
        const summaryOffset = offsetVal_world + direction * dimensionOffset * 0.7;
        return {
            segments,
            summary: {
                startPoint: [p1[0], p1[1]],
                endPoint: [p2[0], p2[1]],
                text: textValue,
                offset: summaryOffset
            }
        };
    },

    /**
     * Retorna estatísticas do sistema
     */
    getStats() {
        return {
            totalCalculations: this.calculationCount,
            lastCalculation: this.lastLogTime
        };
    }
};

// Exportar todas as funções
export {
    drawAngle,
    calculateAngle,
    drawSegmentDimension,
    drawSingleSegmentDimension,
    drawDimensionLine,
    drawDimensions,
    drawRingDimensions,
    drawAdjacentAreaDimension,
    drawAdjacentAreasDimensions,
    drawInterAreaDimensions,
    drawAdjacentResourceDimension,
    drawAdjacentResourcesDimensions,
    drawInterResourceDimensions
};
