import {
    getCtx,
    getScale,
    getIsEditingResourcePolygon,
    getEditingResourceId,
    getHoveredMidpointIndex,
    getDraggingMidpointIndex,
    getMidpointVertices,
    setMidpointVertices,
    getOriginalVerticesOnDrag,
    movementAreas,
    getHoveredResourceResizeHandle
} from './state.js';
import { 
    vertexRadius, 
    polygonVertexColor, 
    midpointRadius, 
    midpointColor, 
    midpointHoverColor, 
    pixelsPerCm,
    pptHandleRadius,
    pptHandleFillColor,
    pptHandleHoverFillColor,
    pptHandleStrokeColor,
    pptHandleStrokeWidth,
    pptRotationHandleRadius,
    pptRotationHandleFillColor,
    pptRotationHandleDistance,
    pptRotationLineColor
} from './config.js';
import { updateResourceCompatibilityProperties } from './resources.js';
import { rectangleToVertices, pointInPolygon } from './areas.js';
import { collidesWithExclusionZones } from './hub-exclusion-zones.js';
import { collidesWithStandaloneExclusionZones } from './exclusion-zones.js';

// =============================================================================
// FUNÇÕES AUXILIARES
// =============================================================================

/**
 * Calcula o centróide de um polígono
 */
function calculateResourceCentroid(vertices) {
    if (!vertices || vertices.length === 0) return { x: 0, y: 0 };
    
    let sumX = 0, sumY = 0;
    for (const [x, y] of vertices) {
        sumX += x;
        sumY += y;
    }
    return {
        x: sumX / vertices.length,
        y: sumY / vertices.length
    };
}

// =============================================================================
// HANDLES ESTILO POWERPOINT PARA RECURSOS
// =============================================================================

/**
 * Calcula as posições dos handles estilo PowerPoint para um recurso.
 * Os handles seguem os vértices e arestas REAIS do polígono.
 */
function calculateResourcePPTHandles(resource) {
    const vertices = resource.vertices;
    
    if (!vertices || vertices.length < 3) {
        return null;
    }
    
    // Calcular centróide real do polígono
    const center = calculateResourceCentroid(vertices);
    
    const handles = {
        corners: [],    // Handles nos vértices
        edges: [],      // Handles nos pontos médios das arestas
        center: center
    };
    
    // Handles nos vértices (cantos)
    for (let i = 0; i < vertices.length; i++) {
        handles.corners.push({
            index: i,
            x: vertices[i][0],
            y: vertices[i][1]
        });
    }
    
    // Handles nos pontos médios das arestas
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        handles.edges.push({
            index: i,
            x: (v1[0] + v2[0]) / 2,
            y: (v1[1] + v2[1]) / 2,
            vertex1Index: i,
            vertex2Index: (i + 1) % vertices.length
        });
    }
    
    // Handle de rotação fixo relativo à forma (estilo PowerPoint)
    let rotateX, rotateY;
    
    if (vertices.length === 4) {
        // Para retângulos: usar a aresta 0 como referência fixa
        const v0 = vertices[0];
        const v1 = vertices[1];
        
        const edgeMidX = (v0[0] + v1[0]) / 2;
        const edgeMidY = (v0[1] + v1[1]) / 2;
        
        const edgeVecX = v1[0] - v0[0];
        const edgeVecY = v1[1] - v0[1];
        const edgeLen = Math.sqrt(edgeVecX * edgeVecX + edgeVecY * edgeVecY);
        
        if (edgeLen > 0) {
            let normalX = -edgeVecY / edgeLen;
            let normalY = edgeVecX / edgeLen;
            
            const toCenterX = center.x - edgeMidX;
            const toCenterY = center.y - edgeMidY;
            const dot = normalX * toCenterX + normalY * toCenterY;
            
            if (dot > 0) {
                normalX = -normalX;
                normalY = -normalY;
            }
            
            rotateX = edgeMidX + normalX * pptRotationHandleDistance;
            rotateY = edgeMidY + normalY * pptRotationHandleDistance;
        } else {
            rotateX = center.x;
            rotateY = center.y - pptRotationHandleDistance;
        }
    } else {
        // Para polígonos genéricos, usar o ponto mais ao topo
        let topY = vertices[0][1];
        let topX = vertices[0][0];
        for (const [x, y] of vertices) {
            if (y < topY) {
                topY = y;
                topX = x;
            }
        }
        rotateX = topX;
        rotateY = topY - pptRotationHandleDistance;
    }
    
    handles.rotate = { x: rotateX, y: rotateY };
    
    return handles;
}

/**
 * Desenha um handle estilo PowerPoint
 */
function drawResourcePPTHandle(ctx, x, y, scale, isHovered, isRotation = false) {
    const radius = (isRotation ? pptRotationHandleRadius : pptHandleRadius) / scale;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    
    if (isRotation) {
        // Handle de rotação - verde com ícone de seta circular
        ctx.fillStyle = isHovered ? '#66BB6A' : pptRotationHandleFillColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        
        // Desenhar seta circular
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 / scale;
        const arrowRadius = radius * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, arrowRadius, -Math.PI * 0.7, Math.PI * 0.3);
        ctx.stroke();
        
        // Ponta da seta
        const arrowX = x + arrowRadius * Math.cos(Math.PI * 0.3);
        const arrowY = y + arrowRadius * Math.sin(Math.PI * 0.3);
        const arrowSize = radius * 0.4;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - arrowSize * 0.5, arrowY - arrowSize * 0.5);
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX + arrowSize * 0.3, arrowY - arrowSize * 0.7);
        ctx.stroke();
        ctx.restore();
    } else {
        // Handle de resize normal (branco)
        ctx.fillStyle = isHovered ? pptHandleHoverFillColor : pptHandleFillColor;
        ctx.fill();
        ctx.strokeStyle = pptHandleStrokeColor;
        ctx.lineWidth = pptHandleStrokeWidth / scale;
        ctx.stroke();
    }
}

/**
 * Desenha os handles estilo PowerPoint para recursos.
 */
function drawEditableResourceVertices(resource) {
    const ctx = getCtx();
    const scale = getScale();
    
    if (!getIsEditingResourcePolygon() || getEditingResourceId() !== resource.id || !resource.vertices) {
        return;
    }
    
    const handles = calculateResourcePPTHandles(resource);
    if (!handles) return;
    
    const hoveredHandle = getHoveredResourceResizeHandle();
    
    // Para a linha de conexão do handle de rotação
    let connectionEdge;
    if (resource.vertices.length === 4) {
        connectionEdge = handles.edges[0];
    } else {
        connectionEdge = handles.edges[0];
        for (const edge of handles.edges) {
            if (edge.y < connectionEdge.y) {
                connectionEdge = edge;
            }
        }
    }
    
    // Desenhar linha de conexão até o handle de rotação
    ctx.save();
    ctx.strokeStyle = pptRotationLineColor;
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([3 / scale, 3 / scale]);
    ctx.beginPath();
    ctx.moveTo(connectionEdge.x, connectionEdge.y);
    ctx.lineTo(handles.rotate.x, handles.rotate.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    
    // Desenhar handle de rotação
    drawResourcePPTHandle(ctx, handles.rotate.x, handles.rotate.y, scale, hoveredHandle === 'rotate', true);
    
    // Desenhar handles nos vértices (cantos)
    handles.corners.forEach((corner, index) => {
        const isHovered = hoveredHandle === `corner_${index}`;
        drawResourcePPTHandle(ctx, corner.x, corner.y, scale, isHovered);
    });
    
    // Desenhar handles nos pontos médios das arestas
    handles.edges.forEach((edge, index) => {
        const isHovered = hoveredHandle === `edge_${index}`;
        drawResourcePPTHandle(ctx, edge.x, edge.y, scale, isHovered);
    });
    
    // Armazenar handles como midpoints para compatibilidade
    const midpoints = handles.edges.map((edge, index) => ({
        position: [edge.x, edge.y],
        edgeIndex: index,
        vertex1Index: edge.vertex1Index,
        vertex2Index: edge.vertex2Index,
        handleType: `edge_${index}`
    }));
    setMidpointVertices(midpoints);
}

/**
 * Detecta qual handle PPT de recurso está sob a posição do mouse.
 * @param {number} x - Posição X do mouse
 * @param {number} y - Posição Y do mouse  
 * @param {object} resource - O recurso com vertices
 * @param {boolean} skipValidation - Se true, não verifica estado de edição (útil quando já validado externamente)
 */
function getResourceHandleAtPos(x, y, resource, skipValidation = false) {
    const scale = getScale();
    
    // Validação de estado (pode ser pulada se já validado externamente)
    if (!skipValidation) {
        if (!getIsEditingResourcePolygon() || getEditingResourceId() !== resource.id || !resource.vertices) {
            return null;
        }
    }
    
    if (!resource.vertices) {
        return null;
    }
    
    const handles = calculateResourcePPTHandles(resource);
    if (!handles) return null;
    
    const threshold = (pptHandleRadius + 4) / scale;
    const rotateThreshold = (pptRotationHandleRadius + 8) / scale;
    
    // Verificar handle de rotação primeiro
    const rotateDistance = Math.sqrt((x - handles.rotate.x) ** 2 + (y - handles.rotate.y) ** 2);
    if (rotateDistance <= rotateThreshold) {
        return 'rotate';
    }
    
    // Verificar handles de canto
    for (let i = 0; i < handles.corners.length; i++) {
        const corner = handles.corners[i];
        const distance = Math.sqrt((x - corner.x) ** 2 + (y - corner.y) ** 2);
        if (distance <= threshold) {
            return `corner_${i}`;
        }
    }
    
    // Verificar handles de aresta
    for (let i = 0; i < handles.edges.length; i++) {
        const edge = handles.edges[i];
        const distance = Math.sqrt((x - edge.x) ** 2 + (y - edge.y) ** 2);
        if (distance <= threshold) {
            return `edge_${i}`;
        }
    }
    
    return null;
}

/**
 * Retorna o cursor CSS apropriado para cada tipo de handle de recurso.
 */
function getResourceHandleCursor(handleType, resource) {
    if (handleType === 'rotate') {
        return 'crosshair';
    }
    
    if (handleType && handleType.startsWith('corner_')) {
        return 'move';
    }
    
    if (handleType && handleType.startsWith('edge_')) {
        if (resource && resource.vertices) {
            const edgeIndex = parseInt(handleType.replace('edge_', ''));
            const numVertices = resource.vertices.length;
            
            if (edgeIndex >= 0 && edgeIndex < numVertices) {
                const vertex1 = resource.vertices[edgeIndex];
                const vertex2 = resource.vertices[(edgeIndex + 1) % numVertices];
                
                const edgeVector = [vertex2[0] - vertex1[0], vertex2[1] - vertex1[1]];
                const angle = Math.atan2(edgeVector[1], edgeVector[0]);
                
                let angleDegrees = (angle * 180 / Math.PI) % 180;
                if (angleDegrees < 0) angleDegrees += 180;
                
                if (angleDegrees <= 22.5 || angleDegrees >= 157.5) {
                    return 'ns-resize';
                } else if (angleDegrees <= 67.5) {
                    return 'nwse-resize';
                } else if (angleDegrees <= 112.5) {
                    return 'ew-resize';
                } else {
                    return 'nesw-resize';
                }
            }
        }
        return 'pointer';
    }
    
    return 'default';
}

// =============================================================================
// FUNÇÕES DE MANIPULAÇÃO (resize/rotação)
// =============================================================================

/**
 * Atualiza o recurso durante o arraste de um handle de canto (resize)
 */
function updateResourceCornerDrag(resource, cornerIndex, mouseX, mouseY, originalVertices) {
    if (!resource || !originalVertices || cornerIndex < 0 || cornerIndex >= originalVertices.length) {
        return;
    }
    
    const numVertices = originalVertices.length;
    
    // Aplicar snap ao grid centimétrico
    const snappedX = Math.round(mouseX / pixelsPerCm) * pixelsPerCm;
    const snappedY = Math.round(mouseY / pixelsPerCm) * pixelsPerCm;
    
    // Encontrar vértice oposto para ser o ponto fixo
    const oppositeIndex = (cornerIndex + Math.floor(numVertices / 2)) % numVertices;
    const fixedVertex = originalVertices[oppositeIndex];
    const draggedVertex = originalVertices[cornerIndex];
    
    // Calcular o vetor original do canto fixo ao canto arrastado
    const originalVector = [
        draggedVertex[0] - fixedVertex[0],
        draggedVertex[1] - fixedVertex[1]
    ];
    
    // Calcular o novo vetor do canto fixo à posição do mouse
    const newVector = [
        snappedX - fixedVertex[0],
        snappedY - fixedVertex[1]
    ];
    
    // Calcular fatores de escala
    const scaleX = Math.abs(originalVector[0]) > 1 ? newVector[0] / originalVector[0] : 1;
    const scaleY = Math.abs(originalVector[1]) > 1 ? newVector[1] / originalVector[1] : 1;
    
    // Aplicar tamanho mínimo
    const minSize = pixelsPerCm * 5; // Mínimo 5cm para recursos
    const effectiveScaleX = Math.abs(newVector[0]) < minSize && Math.abs(originalVector[0]) > 1 
        ? Math.sign(scaleX) * minSize / Math.abs(originalVector[0]) 
        : scaleX;
    const effectiveScaleY = Math.abs(newVector[1]) < minSize && Math.abs(originalVector[1]) > 1 
        ? Math.sign(scaleY) * minSize / Math.abs(originalVector[1]) 
        : scaleY;
    
    // Aplicar transformação a todos os vértices
    const newVertices = originalVertices.map(([vx, vy]) => {
        const relX = vx - fixedVertex[0];
        const relY = vy - fixedVertex[1];
        
        const newX = fixedVertex[0] + relX * effectiveScaleX;
        const newY = fixedVertex[1] + relY * effectiveScaleY;
        
        // Snap ao grid
        return [
            Math.round(newX / pixelsPerCm) * pixelsPerCm,
            Math.round(newY / pixelsPerCm) * pixelsPerCm
        ];
    });
    
    // Verificar se o recurso fica dentro da área pai
    const parentArea = movementAreas.find(area => area.id === resource.parentAreaId);
    if (parentArea) {
        const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
        const allInside = newVertices.every(vertex => pointInPolygon(vertex, areaVertices));
        if (!allInside) {
            return; // Não aplicar se sair da área
        }
    }

    // Verificar colisão com zonas de exclusão de hubs
    if (collidesWithExclusionZones(newVertices, resource.id)) {
        return; // Não aplicar se invadir zona de exclusão
    }
    if (collidesWithStandaloneExclusionZones(newVertices, resource.parentAreaId)) {
        return;
    }
    
    resource.vertices = newVertices;
    updateResourceCompatibilityProperties(resource);
}

/**
 * Atualiza o recurso durante o arraste de um handle de aresta (movimento perpendicular)
 */
function updateResourceEdgeDrag(resource, edgeIndex, mouseX, mouseY, originalVertices) {
    if (!resource || !originalVertices) return;
    
    const numVertices = originalVertices.length;
    if (edgeIndex < 0 || edgeIndex >= numVertices) return;
    
    const vertex1Index = edgeIndex;
    const vertex2Index = (edgeIndex + 1) % numVertices;
    
    const originalVertex1 = originalVertices[vertex1Index];
    const originalVertex2 = originalVertices[vertex2Index];
    
    // Calcular vetor da aresta original
    const edgeVector = [originalVertex2[0] - originalVertex1[0], originalVertex2[1] - originalVertex1[1]];
    const edgeLength = Math.sqrt(edgeVector[0] * edgeVector[0] + edgeVector[1] * edgeVector[1]);
    
    if (edgeLength === 0) return;
    
    // Vetor normal à aresta original (perpendicular)
    const normalVector = [-edgeVector[1] / edgeLength, edgeVector[0] / edgeLength];
    
    // Posição original do midpoint
    const originalMidpoint = [
        (originalVertex1[0] + originalVertex2[0]) / 2,
        (originalVertex1[1] + originalVertex2[1]) / 2
    ];
    
    // Calcular distância do movimento na direção normal
    const mouseToOriginal = [mouseX - originalMidpoint[0], mouseY - originalMidpoint[1]];
    const distanceAlongNormal = mouseToOriginal[0] * normalVector[0] + mouseToOriginal[1] * normalVector[1];
    
    // Snap da distância para múltiplo de centímetro
    const snappedDistance = Math.round(distanceAlongNormal / pixelsPerCm) * pixelsPerCm;
    
    // Mover ambos os vértices da aresta na direção normal
    const moveVector = [normalVector[0] * snappedDistance, normalVector[1] * snappedDistance];
    
    const newVertices = originalVertices.map(([ox, oy], index) => {
        if (index === vertex1Index || index === vertex2Index) {
            return [ox + moveVector[0], oy + moveVector[1]];
        }
        return [ox, oy];
    });
    
    // Verificar se o recurso fica dentro da área pai
    const parentArea = movementAreas.find(area => area.id === resource.parentAreaId);
    if (parentArea) {
        const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
        const allInside = newVertices.every(vertex => pointInPolygon(vertex, areaVertices));
        if (!allInside) {
            return; // Não aplicar se sair da área
        }
    }

    // Verificar colisão com zonas de exclusão de hubs
    if (collidesWithExclusionZones(newVertices, resource.id)) {
        return; // Não aplicar se invadir zona de exclusão
    }
    if (collidesWithStandaloneExclusionZones(newVertices, resource.parentAreaId)) {
        return;
    }
    
    resource.vertices = newVertices;
    updateResourceCompatibilityProperties(resource);
}

/**
 * Atualiza o recurso durante a rotação
 */
function updateResourceRotation(resource, mouseX, mouseY, center, startAngle, originalVertices) {
    if (!resource || !center || !originalVertices) return 0;
    
    // Calcular ângulo atual
    const currentAngle = Math.atan2(mouseY - center.y, mouseX - center.x);
    let deltaAngle = currentAngle - startAngle;
    
    // Snap de 15 graus
    const snapAngleDeg = 15;
    const snapAngleRad = snapAngleDeg * Math.PI / 180;
    deltaAngle = Math.round(deltaAngle / snapAngleRad) * snapAngleRad;
    
    // Se o ângulo está muito próximo de zero (menos de 5 graus), forçar para exatamente zero
    const toleranceRad = (5 * Math.PI) / 180;
    if (Math.abs(deltaAngle) < toleranceRad) {
        deltaAngle = 0;
    }
    
    // Se deltaAngle é zero, não fazer nada (manter vértices originais)
    if (deltaAngle === 0) {
        resource.vertices = originalVertices.map(([x, y]) => [x, y]);
        updateResourceCompatibilityProperties(resource);
        return 0;
    }
    
    // Aplicar rotação aos vértices
    const cos = Math.cos(deltaAngle);
    const sin = Math.sin(deltaAngle);
    
    const newVertices = originalVertices.map(([vx, vy]) => {
        const relX = vx - center.x;
        const relY = vy - center.y;
        return [
            center.x + relX * cos - relY * sin,
            center.y + relX * sin + relY * cos
        ];
    });
    
    // Verificar se o recurso fica dentro da área pai
    const parentArea = movementAreas.find(area => area.id === resource.parentAreaId);
    if (parentArea) {
        const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
        const allInside = newVertices.every(vertex => pointInPolygon(vertex, areaVertices));
        if (!allInside) {
            return 0; // Não aplicar se sair da área
        }
    }

    // Verificar colisão com zonas de exclusão de hubs
    if (collidesWithExclusionZones(newVertices, resource.id)) {
        return 0; // Não aplicar se invadir zona de exclusão
    }
    if (collidesWithStandaloneExclusionZones(newVertices, resource.parentAreaId)) {
        return 0;
    }
    
    resource.vertices = newVertices;
    updateResourceCompatibilityProperties(resource);
    
    return deltaAngle;
}

// =============================================================================
// FUNÇÕES LEGADAS (mantidas para compatibilidade)
// =============================================================================

function calculateResourceMidpoints(resource) {
    if (!resource.vertices || resource.vertices.length < 2) {
        setMidpointVertices([]);
        return;
    }

    const midpoints = [];
    for (let i = 0; i < resource.vertices.length; i++) {
        const currentVertex = resource.vertices[i];
        const nextVertex = resource.vertices[(i + 1) % resource.vertices.length];
        const midpoint = [
            (currentVertex[0] + nextVertex[0]) / 2,
            (currentVertex[1] + nextVertex[1]) / 2
        ];

        midpoints.push({
            position: midpoint,
            edgeIndex: i,
            vertex1Index: i,
            vertex2Index: (i + 1) % resource.vertices.length
        });
    }

    setMidpointVertices(midpoints);
}

function drawResourceMidpointVertices(resource) {
    const ctx = getCtx();
    const scale = getScale();
    const midpoints = getMidpointVertices();

    if (!getIsEditingResourcePolygon() || getEditingResourceId() !== resource.id || !midpoints) {
        return;
    }

    ctx.save();

    for (let i = 0; i < midpoints.length; i++) {
        const midpoint = midpoints[i];
        const isHovered = getHoveredMidpointIndex() === i;
        const isDragging = getDraggingMidpointIndex() === i;

        ctx.fillStyle = isDragging || isHovered ? midpointHoverColor : midpointColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / scale;

        ctx.beginPath();
        ctx.arc(midpoint.position[0], midpoint.position[1], midpointRadius / scale, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / scale;
        const crossSize = 3 / scale;

        ctx.beginPath();
        ctx.moveTo(midpoint.position[0] - crossSize, midpoint.position[1]);
        ctx.lineTo(midpoint.position[0] + crossSize, midpoint.position[1]);
        ctx.moveTo(midpoint.position[0], midpoint.position[1] - crossSize);
        ctx.lineTo(midpoint.position[0], midpoint.position[1] + crossSize);
        ctx.stroke();
    }

    ctx.restore();
}

function getResourceMidpointAtPos(x, y, resource) {
    const scale = getScale();
    const midpoints = getMidpointVertices();

    if (!getIsEditingResourcePolygon() || getEditingResourceId() !== resource.id || !midpoints) {
        return -1;
    }

    const threshold = midpointRadius / scale;

    for (let i = 0; i < midpoints.length; i++) {
        const midpoint = midpoints[i];
        const distance = Math.sqrt((x - midpoint.position[0]) ** 2 + (y - midpoint.position[1]) ** 2);
        if (distance <= threshold) {
            return i;
        }
    }
    return -1;
}

function updateResourceMidpointDrag(resource, midpointIndex, mouseX, mouseY) {
    const midpoints = getMidpointVertices();
    const originalVertices = getOriginalVerticesOnDrag();

    if (!midpoints || midpointIndex < 0 || midpointIndex >= midpoints.length || !originalVertices || originalVertices.length === 0) {
        return;
    }

    const midpoint = midpoints[midpointIndex];
    const vertex1Index = midpoint.vertex1Index;
    const vertex2Index = midpoint.vertex2Index;

    const originalVertex1 = originalVertices[vertex1Index];
    const originalVertex2 = originalVertices[vertex2Index];

    if (!originalVertex1 || !originalVertex2) {
        return;
    }

    const edgeVector = [
        originalVertex2[0] - originalVertex1[0],
        originalVertex2[1] - originalVertex1[1]
    ];
    const edgeLength = Math.sqrt(edgeVector[0] * edgeVector[0] + edgeVector[1] * edgeVector[1]);
    if (edgeLength === 0) {
        return;
    }

    const normalVector = [-edgeVector[1] / edgeLength, edgeVector[0] / edgeLength];
    const originalMidpoint = [
        (originalVertex1[0] + originalVertex2[0]) / 2,
        (originalVertex1[1] + originalVertex2[1]) / 2
    ];

    const mouseToOriginal = [mouseX - originalMidpoint[0], mouseY - originalMidpoint[1]];
    const distanceAlongNormal = mouseToOriginal[0] * normalVector[0] + mouseToOriginal[1] * normalVector[1];

    const snappedDistance = Math.round(distanceAlongNormal / pixelsPerCm) * pixelsPerCm;
    const moveVector = [normalVector[0] * snappedDistance, normalVector[1] * snappedDistance];

    const newVertices = originalVertices.map(([ox, oy], index) => {
        if (index === vertex1Index || index === vertex2Index) {
            return [ox + moveVector[0], oy + moveVector[1]];
        }
        return [ox, oy];
    });

    const parentArea = movementAreas.find(area => area.id === resource.parentAreaId);
    if (parentArea) {
        const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
        const allInside = newVertices.every(vertex => pointInPolygon(vertex, areaVertices));
        if (!allInside) {
            return;
        }
    }

    // Verificar colisão com zonas de exclusão de hubs
    if (collidesWithExclusionZones(newVertices, resource.id)) {
        return; // Não aplicar se invadir zona de exclusão
    }
    if (collidesWithStandaloneExclusionZones(newVertices, resource.parentAreaId)) {
        return;
    }

    resource.vertices = newVertices;
    updateResourceCompatibilityProperties(resource);
    calculateResourceMidpoints(resource);
}

function getResourceMidpointCursor(resource, midpointIndex) {
    const midpoints = getMidpointVertices();

    if (!midpoints || midpointIndex < 0 || midpointIndex >= midpoints.length) {
        return 'grab';
    }

    const midpoint = midpoints[midpointIndex];
    const vertex1 = resource.vertices[midpoint.vertex1Index];
    const vertex2 = resource.vertices[midpoint.vertex2Index];

    const edgeVector = [vertex2[0] - vertex1[0], vertex2[1] - vertex1[1]];
    const angle = Math.atan2(edgeVector[1], edgeVector[0]);
    let angleDegrees = (angle * 180) / Math.PI;
    angleDegrees = ((angleDegrees % 180) + 180) % 180;

    if (angleDegrees <= 22.5 || angleDegrees >= 157.5) {
        return 'ns-resize';
    }
    if (angleDegrees <= 67.5) {
        return 'nwse-resize';
    }
    if (angleDegrees <= 112.5) {
        return 'ew-resize';
    }
    return 'nesw-resize';
}

export {
    drawEditableResourceVertices,
    calculateResourceMidpoints,
    getResourceMidpointAtPos,
    updateResourceMidpointDrag,
    getResourceMidpointCursor,
    // Novas funções PPT
    calculateResourcePPTHandles,
    getResourceHandleAtPos,
    getResourceHandleCursor,
    updateResourceCornerDrag,
    updateResourceEdgeDrag,
    updateResourceRotation
};
