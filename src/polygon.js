import { bakeNavigationMesh } from './navMeshBaker.js';
// Funções auxiliares para polígonos, midpoints, edição, etc.
import { 
    getCtx, 
    getScale,
    getIsEditingPolygon, 
    getEditingAreaId, 
    getHoveredVertexIndex, 
    getDraggingVertexIndex, 
    getHoveredMidpointIndex,
    getDraggingMidpointIndex,
    getMidpointVertices,
    setMidpointVertices,
    getOriginalVerticesOnDrag,
    getHoveredResizeHandle,
    selectedAreaId
} from './state.js';
import { 
    vertexRadius, 
    vertexHoverColor, 
    polygonVertexColor, 
    polygonVertexHoverColor, 
    midpointRadius, 
    midpointColor, 
    midpointHoverColor, 
    pixelsPerCm,
    pptHandleRadius,
    pptHandleFillColor,
    pptHandleStrokeColor,
    pptHandleStrokeWidth,
    pptHandleHoverFillColor,
    pptRotationHandleDistance,
    pptRotationHandleRadius,
    pptRotationLineColor,
    pptRotationHandleFillColor,
    pptRotationHandleHoverFillColor,
    pptRotationHandleStrokeColor
} from './config.js';
import { calculateBoundingBox } from './areas.js';
/**
 * Calcula o ângulo entre três pontos.
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
 * Calcula o centróide de um polígono
 */
function calculateCentroid(vertices) {
    if (!vertices || vertices.length === 0) return { x: 0, y: 0 };
    
    let sumX = 0, sumY = 0;
    for (const v of vertices) {
        sumX += v[0];
        sumY += v[1];
    }
    return {
        x: sumX / vertices.length,
        y: sumY / vertices.length
    };
}

/**
 * Encontra o vértice mais ao topo (menor Y) do polígono
 */
function findTopVertex(vertices) {
    if (!vertices || vertices.length === 0) return null;
    
    let topIndex = 0;
    let minY = vertices[0][1];
    
    for (let i = 1; i < vertices.length; i++) {
        if (vertices[i][1] < minY) {
            minY = vertices[i][1];
            topIndex = i;
        }
    }
    return { index: topIndex, x: vertices[topIndex][0], y: vertices[topIndex][1] };
}

/**
 * Calcula as posições dos handles nos vértices e arestas REAIS do polígono
 * @param {Object} area - A área de movimentação
 * @returns {Object} Objeto com posições dos handles
 */
function calculatePPTHandles(area) {
    const vertices = area.vertices;
    
    if (!vertices || vertices.length < 3) {
        // Fallback para bounding box se não houver vértices suficientes
        const bb = calculateBoundingBox(area.vertices || []);
        return {
            nw: { x: bb.x, y: bb.y },
            ne: { x: bb.x + bb.width, y: bb.y },
            se: { x: bb.x + bb.width, y: bb.y + bb.height },
            sw: { x: bb.x, y: bb.y + bb.height },
            n: { x: bb.x + bb.width / 2, y: bb.y },
            e: { x: bb.x + bb.width, y: bb.y + bb.height / 2 },
            s: { x: bb.x + bb.width / 2, y: bb.y + bb.height },
            w: { x: bb.x, y: bb.y + bb.height / 2 },
            rotate: { x: bb.x + bb.width / 2, y: bb.y - pptRotationHandleDistance },
            center: { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }
        };
    }
    
    // Calcular centróide real do polígono
    const center = calculateCentroid(vertices);
    
    // Para polígonos com 4 vértices (retângulos/quadriláteros), usar os vértices diretamente
    // Os handles de canto vão nos vértices, os de aresta vão nos pontos médios das arestas
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
            // Guardar os índices dos vértices que formam esta aresta
            vertex1Index: i,
            vertex2Index: (i + 1) % vertices.length
        });
    }
    
    // ===== HANDLE DE ROTAÇÃO FIXO RELATIVO À FORMA (estilo PowerPoint) =====
    // O handle de rotação deve ficar sempre na mesma posição relativa à forma,
    // como se fosse um "mastro" fixo saindo do topo da forma.
    
    // Para um polígono de 4 vértices (retângulo), usar a aresta entre vértice 0 e 1 como "topo"
    // O handle fica perpendicular ao ponto médio dessa aresta, apontando para fora
    
    let rotateX, rotateY;
    
    if (vertices.length === 4) {
        // Para retângulos: usar a aresta 0 (entre vértice 0 e 1) como referência fixa
        // Isso mantém o handle sempre na mesma posição relativa ao rotacionar
        const v0 = vertices[0];
        const v1 = vertices[1];
        
        // Ponto médio da aresta "topo" (aresta 0)
        const edgeMidX = (v0[0] + v1[0]) / 2;
        const edgeMidY = (v0[1] + v1[1]) / 2;
        
        // Vetor da aresta
        const edgeVecX = v1[0] - v0[0];
        const edgeVecY = v1[1] - v0[1];
        const edgeLen = Math.sqrt(edgeVecX * edgeVecX + edgeVecY * edgeVecY);
        
        if (edgeLen > 0) {
            // Vetor perpendicular (normal), apontando para fora da forma
            // Precisamos verificar qual direção é "para fora" usando o centro
            let normalX = -edgeVecY / edgeLen;
            let normalY = edgeVecX / edgeLen;
            
            // Verificar se a normal aponta para longe do centro
            const toCenterX = center.x - edgeMidX;
            const toCenterY = center.y - edgeMidY;
            const dot = normalX * toCenterX + normalY * toCenterY;
            
            // Se dot > 0, a normal aponta para o centro, então inverter
            if (dot > 0) {
                normalX = -normalX;
                normalY = -normalY;
            }
            
            // Posicionar o handle na direção da normal
            rotateX = edgeMidX + normalX * pptRotationHandleDistance;
            rotateY = edgeMidY + normalY * pptRotationHandleDistance;
        } else {
            rotateX = center.x;
            rotateY = center.y - pptRotationHandleDistance;
        }
    } else {
        // Para polígonos genéricos, usar o ponto mais ao topo
        const topVertex = findTopVertex(vertices);
        const topEdgeMidpoint = handles.edges.reduce((top, edge) => 
            edge.y < top.y ? edge : top, handles.edges[0]);
        
        const topY = Math.min(topVertex.y, topEdgeMidpoint.y);
        const topX = topVertex.y < topEdgeMidpoint.y ? topVertex.x : topEdgeMidpoint.x;
        
        rotateX = topX;
        rotateY = topY - pptRotationHandleDistance;
    }
    
    return {
        // Para compatibilidade, mapear para os nomes antigos se for um retângulo (4 vértices)
        corners: handles.corners,
        edges: handles.edges,
        // Handle de rotação fixo relativo à forma
        rotate: { x: rotateX, y: rotateY },
        // Centro real do polígono
        center: center
    };
}

/**
 * Desenha um handle estilo PowerPoint
 * @param {CanvasRenderingContext2D} ctx - Contexto do canvas
 * @param {number} x - Posição X
 * @param {number} y - Posição Y
 * @param {number} scale - Escala atual
 * @param {boolean} isHovered - Se está sob hover
 * @param {boolean} isRotation - Se é o handle de rotação
 */
function drawPPTHandle(ctx, x, y, scale, isHovered, isRotation = false) {
    const radius = (isRotation ? pptRotationHandleRadius : pptHandleRadius) / scale;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    
    // Cores diferentes para handle de rotação (verde) vs resize (branco)
    if (isRotation) {
        ctx.fillStyle = isHovered ? pptRotationHandleHoverFillColor : pptRotationHandleFillColor;
        ctx.fill();
        ctx.strokeStyle = pptRotationHandleStrokeColor;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
        
        // Desenha ícone de rotação (seta circular branca)
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 / scale;
        const iconSize = radius * 0.5;
        
        // Desenha uma seta circular
        ctx.beginPath();
        ctx.arc(x, y, iconSize, -Math.PI * 0.7, Math.PI * 0.4);
        ctx.stroke();
        
        // Ponta da seta
        const arrowAngle = Math.PI * 0.4;
        const arrowX = x + iconSize * Math.cos(arrowAngle);
        const arrowY = y + iconSize * Math.sin(arrowAngle);
        const arrowSize = iconSize * 0.6;
        
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
 * Desenha os handles estilo PowerPoint para redimensionamento e rotação.
 * Os handles agora seguem os vértices e arestas REAIS do polígono.
 */
function drawEditableVertices(area) {
    const ctx = getCtx();
    const scale = getScale();
    
    // Verificar se está no modo de edição de polígono para esta área
    if (!getIsEditingPolygon() || getEditingAreaId() !== area.id || !area.vertices) return;
    
    const handles = calculatePPTHandles(area);
    const hoveredHandle = getHoveredResizeHandle();
    
    // Para a linha de conexão do handle de rotação:
    // - Para retângulos (4 vértices): usar a aresta 0 (posição fixa relativa)
    // - Para outros polígonos: usar a aresta mais ao topo
    let connectionEdge;
    if (area.vertices.length === 4) {
        connectionEdge = handles.edges[0]; // Aresta 0 é a referência fixa
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
    drawPPTHandle(ctx, handles.rotate.x, handles.rotate.y, scale, hoveredHandle === 'rotate', true);
    
    // Desenhar handles nos vértices (cantos)
    handles.corners.forEach((corner, index) => {
        const isHovered = hoveredHandle === `corner_${index}`;
        drawPPTHandle(ctx, corner.x, corner.y, scale, isHovered);
    });
    
    // Desenhar handles nos pontos médios das arestas
    handles.edges.forEach((edge, index) => {
        const isHovered = hoveredHandle === `edge_${index}`;
        drawPPTHandle(ctx, edge.x, edge.y, scale, isHovered);
    });
    
    // Armazenar handles como midpoints para compatibilidade com sistema existente
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
 * Calcula midpoints das arestas e armazena no estado global.
 */
function calculateMidpoints(area) {
    // Sempre que os vértices mudam, rebake a NavMesh
    if (area && area.vertices && area.vertices.length > 2) {
        bakeNavigationMesh(area);
    }
    if (!area.vertices || area.vertices.length < 2) {
        setMidpointVertices([]);
        return;
    }
    
    const midpoints = [];
    for (let i = 0; i < area.vertices.length; i++) {
        const currentVertex = area.vertices[i];
        const nextVertex = area.vertices[(i + 1) % area.vertices.length];
        
        const midpoint = [
            (currentVertex[0] + nextVertex[0]) / 2,
            (currentVertex[1] + nextVertex[1]) / 2
        ];
        
        midpoints.push({
            position: midpoint,
            edgeIndex: i, // Índice da aresta (entre vértice i e i+1)
            vertex1Index: i,
            vertex2Index: (i + 1) % area.vertices.length
        });
    }
    
    setMidpointVertices(midpoints);
}
/**
 * Desenha midpoints (pontos verdes no meio das arestas).
 */
function drawMidpointVertices(area) {
    const ctx = getCtx();
    const scale = getScale();
    const midpoints = getMidpointVertices();
    
    if (!getIsEditingPolygon() || getEditingAreaId() !== area.id || !midpoints) return;
    
    ctx.save();
    
    for (let i = 0; i < midpoints.length; i++) {
        const midpoint = midpoints[i];
        const isHovered = getHoveredMidpointIndex() === i;
        const isDragging = getDraggingMidpointIndex() === i;
        
        // Cor do midpoint (verde)
        ctx.fillStyle = isDragging ? midpointHoverColor : (isHovered ? midpointHoverColor : midpointColor);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1.5 / scale;
        
        // Desenhar círculo menor para midpoint
        ctx.beginPath();
        ctx.arc(midpoint.position[0], midpoint.position[1], midpointRadius / scale, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Desenhar um pequeno '+' no centro para indicar que é um ponto de adição
        ctx.strokeStyle = "#FFFFFF";
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
/**
 * Verifica se um ponto está próximo de um vértice.
 */
function getVertexAtPoint(area, point, tolerance = 10) {
    if (!area.vertices) return -1;
    for (let i = 0; i < area.vertices.length; i++) {
        const vertex = area.vertices[i];
        const distance = Math.sqrt(
            Math.pow(point[0] - vertex[0], 2) + 
            Math.pow(point[1] - vertex[1], 2)
        );
        if (distance <= tolerance / scale) {
            return i;
        }
    }
    return -1;
}
/**
 * Verifica se um ponto está próximo de um midpoint.
 */
function getMidpointAtPoint(area, point, tolerance = 10) {
    const midpoints = calculateMidpoints(area);
    for (let i = 0; i < midpoints.length; i++) {
        const midpoint = midpoints[i];
        const distance = Math.sqrt(
            Math.pow(point[0] - midpoint.point[0], 2) + 
            Math.pow(point[1] - midpoint.point[1], 2)
        );
        if (distance <= tolerance / scale) {
            return i;
        }
    }
    return -1;
}
/**
 * Adiciona um novo vértice em um midpoint.
 */
function addVertexAtMidpoint(area, midpointIndex) {
    if (!area.vertices || midpointIndex < 0 || midpointIndex >= area.vertices.length) return false;
    const p1 = area.vertices[midpointIndex];
    const p2 = area.vertices[(midpointIndex + 1) % area.vertices.length];
    const newVertex = [
        (p1[0] + p2[0]) / 2,
        (p1[1] + p2[1]) / 2
    ];
    // Inserir o novo vértice após o vértice atual
    area.vertices.splice(midpointIndex + 1, 0, newVertex);
    return true;
}
/**
 * Remove um vértice do polígono.
 */
function removeVertex(area, vertexIndex) {
    if (!area.vertices || area.vertices.length <= 3 || vertexIndex < 0 || vertexIndex >= area.vertices.length) {
        return false; // Não pode remover se restarem menos de 3 vértices
    }
    area.vertices.splice(vertexIndex, 1);
    return true;
}

/**
 * Detecta qual handle estilo PowerPoint está sob a posição do mouse.
 * @param {number} x - Posição X do mouse
 * @param {number} y - Posição Y do mouse
 * @param {Object} area - A área sendo editada
 * @returns {string|null} O identificador do handle ('corner_0', 'edge_0', 'rotate', etc.) ou null
 */
function getHandleAtPos(x, y, area) {
    const scale = getScale();
    
    if (!getIsEditingPolygon() || getEditingAreaId() !== area.id || !area.vertices) return null;
    
    const handles = calculatePPTHandles(area);
    const threshold = (pptHandleRadius + 4) / scale; // +4 para área de clique maior
    const rotateThreshold = (pptRotationHandleRadius + 8) / scale; // +8 para área de clique muito maior no handle de rotação
    
    // Verificar handle de rotação primeiro (prioridade máxima)
    const rotateDistance = Math.sqrt((x - handles.rotate.x) ** 2 + (y - handles.rotate.y) ** 2);
    if (rotateDistance <= rotateThreshold) {
        return 'rotate';
    }
    
    // Verificar handles de canto (vértices) - prioridade sobre handles de aresta
    for (let i = 0; i < handles.corners.length; i++) {
        const corner = handles.corners[i];
        const distance = Math.sqrt((x - corner.x) ** 2 + (y - corner.y) ** 2);
        if (distance <= threshold) {
            return `corner_${i}`;
        }
    }
    
    // Verificar handles de aresta (pontos médios)
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
 * Retorna o cursor CSS apropriado para cada tipo de handle.
 * @param {string} handleType - O tipo de handle
 * @param {Object} [area] - A área sendo editada (necessário para calcular cursor de arestas)
 * @returns {string} O cursor CSS
 */
function getHandleCursor(handleType, area) {
    if (handleType === 'rotate') {
        return 'crosshair'; // Cursor de mira para rotação
    }
    
    if (handleType && handleType.startsWith('corner_')) {
        return 'move'; // Mover vértice livremente
    }
    
    if (handleType && handleType.startsWith('edge_')) {
        // Calcular cursor baseado na orientação da aresta
        if (area && area.vertices) {
            const edgeIndex = parseInt(handleType.replace('edge_', ''));
            const numVertices = area.vertices.length;
            
            if (edgeIndex >= 0 && edgeIndex < numVertices) {
                const vertex1 = area.vertices[edgeIndex];
                const vertex2 = area.vertices[(edgeIndex + 1) % numVertices];
                
                // Calcular vetor da aresta
                const edgeVector = [vertex2[0] - vertex1[0], vertex2[1] - vertex1[1]];
                
                // Calcular ângulo da aresta em radianos
                const angle = Math.atan2(edgeVector[1], edgeVector[0]);
                
                // Converter para graus e normalizar para 0-180
                let angleDegrees = (angle * 180 / Math.PI) % 180;
                if (angleDegrees < 0) angleDegrees += 180;
                
                // Cursor perpendicular à aresta
                // 0-22.5° ou 157.5-180°: aresta horizontal → movimento vertical (ns-resize)
                // 22.5-67.5°: aresta diagonal → movimento diagonal (nwse-resize)
                // 67.5-112.5°: aresta vertical → movimento horizontal (ew-resize)
                // 112.5-157.5°: aresta diagonal → movimento diagonal (nesw-resize)
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

/**
 * Verifica se o mouse está sobre um midpoint.
 */
function getMidpointAtPos(x, y, area) {
    const scale = getScale();
    const midpoints = getMidpointVertices();
    
    if (!getIsEditingPolygon() || getEditingAreaId() !== area.id || !midpoints) return -1;
    
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

/**
 * Atualiza a posição de uma aresta inteira movendo os midpoints perpendicularmente.
 * Esta é a funcionalidade principal do sistema de midpoints da versão 7.3.
 */
function updateMidpointDrag(area, midpointIndex, mouseX, mouseY) {
    const midpoints = getMidpointVertices();
    const originalVertices = getOriginalVerticesOnDrag();
    
    if (!midpoints || midpointIndex < 0 || midpointIndex >= midpoints.length || !originalVertices) {
        return;
    }
    
    const midpoint = midpoints[midpointIndex];
    const vertex1Index = midpoint.vertex1Index;
    const vertex2Index = midpoint.vertex2Index;
    
    // Validar se os índices dos vértices são válidos
    if (vertex1Index < 0 || vertex1Index >= originalVertices.length ||
        vertex2Index < 0 || vertex2Index >= originalVertices.length) {
        return;
    }
    
    // Usar vértices originais para calcular vetor da aresta
    const originalVertex1 = originalVertices[vertex1Index];
    const originalVertex2 = originalVertices[vertex2Index];
    
    // Validar se os vértices existem e são arrays válidos
    if (!originalVertex1 || !originalVertex2 || 
        !Array.isArray(originalVertex1) || !Array.isArray(originalVertex2) ||
        originalVertex1.length < 2 || originalVertex2.length < 2) {
        return;
    }
    
    // Calcular vetor da aresta original
    const edgeVector = [originalVertex2[0] - originalVertex1[0], originalVertex2[1] - originalVertex1[1]];
    const edgeLength = Math.sqrt(edgeVector[0] * edgeVector[0] + edgeVector[1] * edgeVector[1]);
    
    if (edgeLength > 0) {
        // Vetor normal à aresta original (perpendicular)
        const normalVector = [-edgeVector[1] / edgeLength, edgeVector[0] / edgeLength];
        
        // Posição original do midpoint (calculada a partir dos vértices originais)
        const originalMidpoint = [
            (originalVertex1[0] + originalVertex2[0]) / 2,
            (originalVertex1[1] + originalVertex2[1]) / 2
        ];
        
        // Calcular distância do movimento na direção normal
        const mouseToOriginal = [mouseX - originalMidpoint[0], mouseY - originalMidpoint[1]];
        const distanceAlongNormal = mouseToOriginal[0] * normalVector[0] + mouseToOriginal[1] * normalVector[1];
        
        // Snap da distância para o múltiplo de centímetro mais próximo
        const gridSize = pixelsPerCm;
        const snappedDistance = Math.round(distanceAlongNormal / gridSize) * gridSize;
        
        // Mover ambos os vértices da aresta na direção normal a partir da posição original
        const moveVector = [normalVector[0] * snappedDistance, normalVector[1] * snappedDistance];
        
        area.vertices[vertex1Index] = [
            originalVertex1[0] + moveVector[0],
            originalVertex1[1] + moveVector[1]
        ];
        area.vertices[vertex2Index] = [
            originalVertex2[0] + moveVector[0],
            originalVertex2[1] + moveVector[1]
        ];
    }
}

/**
 * Determina o cursor apropriado baseado na orientação da aresta do midpoint.
 * @param {Object} area - A área que contém o midpoint
 * @param {number} midpointIndex - O índice do midpoint
 * @returns {string} - O cursor CSS apropriado
 */
function getMidpointCursor(area, midpointIndex) {
    const midpoints = getMidpointVertices();
    
    if (!midpoints || midpointIndex < 0 || midpointIndex >= midpoints.length) {
        return 'grab';
    }
    
    const midpoint = midpoints[midpointIndex];
    const vertex1 = area.vertices[midpoint.vertex1Index];
    const vertex2 = area.vertices[midpoint.vertex2Index];
    
    // Calcular vetor da aresta
    const edgeVector = [vertex2[0] - vertex1[0], vertex2[1] - vertex1[1]];
    
    // Calcular ângulo da aresta em radianos
    const angle = Math.atan2(edgeVector[1], edgeVector[0]);
    
    // Converter para graus e normalizar para 0-180
    let angleDegrees = (angle * 180 / Math.PI) % 180;
    if (angleDegrees < 0) angleDegrees += 180;
    
    // Determinar cursor baseado no ângulo PERPENDICULAR à aresta
    // (o midpoint move a aresta perpendicularmente)
    // 0-22.5° ou 157.5-180°: aresta horizontal → movimento vertical (ns-resize)
    // 22.5-67.5°: aresta diagonal NE-SW → movimento NW-SE (nwse-resize)
    // 67.5-112.5°: aresta vertical → movimento horizontal (ew-resize)
    // 112.5-157.5°: aresta diagonal NW-SE → movimento NE-SW (nesw-resize)
    
    if (angleDegrees <= 22.5 || angleDegrees >= 157.5) {
        return 'ns-resize'; // Aresta horizontal → movimento vertical
    } else if (angleDegrees <= 67.5) {
        return 'nwse-resize'; // Aresta diagonal NE-SW → movimento NW-SE
    } else if (angleDegrees <= 112.5) {
        return 'ew-resize'; // Aresta vertical → movimento horizontal
    } else {
        return 'nesw-resize'; // Aresta diagonal NW-SE → movimento NE-SW
    }
}

export {
    calculateAngle,
    drawEditableVertices,
    calculateMidpoints,
    drawMidpointVertices,
    getVertexAtPoint,
    getMidpointAtPoint,
    addVertexAtMidpoint,
    removeVertex,
    getMidpointAtPos,
    updateMidpointDrag,
    getMidpointCursor,
    calculatePPTHandles,
    getHandleAtPos,
    getHandleCursor
};

