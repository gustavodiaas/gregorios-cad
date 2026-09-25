import {
    movementAreas,
    walls,
    isDrawingWall,
    wallPreviewEnd,
    isDrawingFreeLine,
    isDrawing,
    currentRect,
    offsetXCanvas,
    offsetYCanvas,
    scale,
    currentTool,
    lastSnapPoint,
    selectedAreaId,
    getCanvas,
    getCtx,
    getStaticCtx,
    getStaticCanvas,
    isDragging,
    getHoveredAreaVirtualDimensions,
    getIsAreaHoverActive,
    getScale,
    getIsEditingPolygon,
    getEditingAreaId,
    getIsEditingResourcePolygon,
    getEditingResourceId,
    getSelectedResourceId,
    getIsEditingWall,
    getEditingWallId,
    resources,
    getIsDrawingResource,
    getCurrentFloorId,
    getSelectedHubId,
    getHoveredHubId,
    getSelectedExclusionZoneId,
    getHoveredExclusionZoneId,
    exclusionZones
} from './state.js';
import { getAllHubRecords, HUB_SOURCES } from './hubs.js';
import { getCurrentTool } from './active_tool.js';
import {
    selectionColor,
    selectionLineWidth,
    dimensionLineWidth,
    dimensionOffset,
    dimensionExtension,
    pixelsPerCm,
    getDimensionColor
} from './config.js';
import { drawEditableVertices } from './polygon.js';
import { drawEditableResourceVertices } from './resource-polygon.js';
import {
    drawWall,
    drawWallPreview,
    drawSnapIndicators,
    findSnapPoint,
    drawDivisionDimensions,
    drawVirtualDimensions,
    drawWallHandles,
    drawWallSnapPreviewFeedback
} from './walls.js';
import { drawFreeLines, drawFreeLinePreview } from './free-lines.js';
import { drawVirtualHoverDimensions } from './virtual-dimensions.js';
import { drawAllOpenings, drawVirtualOpening } from './openings.js';
import {
    drawAdjacentAreasDimensions,
    drawInterAreaDimensions,
    drawDimensionLine
} from './drawing/dimensions.js';
import { drawConnections, drawConnectionHubs } from './connections.js';
import { drawExclusionZones, hasActiveRipples } from './hub-exclusion-zones.js';
import { drawStandaloneExclusionZones, drawExclusionZonePreview, drawExclusionZoneHandles, drawExclusionZoneDimensions } from './exclusion-zones.js';
import { updateConnectionDistancesTable } from './flow-metrics.js';
import { drawAllResourceDimensions } from './resource-dimensions.js';
import { dimensionDeclutter } from './drawing/dimension-declutter.js';
import { drawAllResources, drawResourceCreationPreview, drawStairCreationPreview } from './drawing/core/resourcesRenderer.js';
import { drawFloorOverlay, drawNavigationGraph } from './drawing/core/overlays.js';
import { drawMovementArea, drawMovementAreaBorder } from './drawing/core/movementAreas.js';
import { drawSmartGuides, renderAlignmentGuides } from './drawing/core/guides.js';
import { getHubVisualRadius, getHubDisplayLabel, anchorToWorldCoordinates } from './connections/connectionUtils.js';
import { formatLength } from './measurement-units.js';
import { drawLayoutTitle } from './layout-metadata.js';
import {
    toggleNavMeshVisualization,
    setNavMeshVisualWidth,
    getNavMeshVisualizationState,
    showNavMeshNodes,
    navMeshVisualWidth
} from './drawing/core/navmeshVisualizer.js';

import { 
    getIsHubPlacementActive,
    getHubPlacementTargetResource,
    getHubPreviewPosition,
    getHubPreviewNormal,
    getHubPreviewIsConstrained,
    getHubZoneBlinkPhase,
    getShowAllResourcesZones
} from './state.js';

import {
    getResourceVertices,
    generateValidZonePolygon,
    HUB_PLACEMENT_MARGIN_CM
} from './hub-placement-helper.js';

import { setCtx } from './state.js';

function drawAll(redrawStatic = true) {
    // Reset do sistema de declutter de cotas a cada frame
    dimensionDeclutter.reset();

    const ctx = getCtx();
    const canvas = getCanvas();
    const staticCtx = getStaticCtx();
    const staticCanvas = getStaticCanvas();
    const activeToolId = getCurrentTool();

    // 1. Desenhar Camada Estática (apenas se solicitado e se existir contexto estático)
    if (redrawStatic && staticCtx && staticCanvas) {
        staticCtx.save();
        staticCtx.setTransform(1, 0, 0, 1, 0, 0);
        staticCtx.globalCompositeOperation = 'source-over';
        staticCtx.globalAlpha = 1.0;
        staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);

        staticCtx.translate(offsetXCanvas, offsetYCanvas);
        staticCtx.scale(scale, scale);

        // Trocar contexto global temporariamente para que as funções de desenho usem o staticCtx
        const originalCtx = getCtx();
        setCtx(staticCtx);
        
        try {
            movementAreas.forEach(area => drawMovementArea(area));
            
            if (walls && walls.length > 0) {
                walls.forEach(drawWall);
            }

            drawAllResources();
            // Linhas e cotas ficam acima dos equipamentos para continuarem legíveis e clicáveis.
            drawFreeLines();
            // Bordas das áreas desenhadas POR CIMA dos recursos — garante que recursos
            // não extravasem visualmente sobre a linha da parede.
            movementAreas.forEach(area => drawMovementAreaBorder(area));
            // Aberturas (docas) desenhadas DEPOIS das bordas das paredes —
            // o gap visual das aberturas cobre a linha da parede onde existe a abertura.
            drawAllOpenings();
            // Zonas de exclusão radial dos hubs (sob os hubs)
            drawExclusionZones(staticCtx, scale);
            // Zonas de exclusão standalone (desenhadas pelo usuário)
            drawStandaloneExclusionZones(getSelectedExclusionZoneId(), getHoveredExclusionZoneId());
            // Overlay de outros pavimentos desenhado POR CIMA dos elementos
            drawFloorOverlay();
            drawHubs();
        } finally {
            // Restaurar contexto original
            setCtx(originalCtx);
            staticCtx.restore();
        }
    }

    // 2. Desenhar Camada Dinâmica (sempre)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.translate(offsetXCanvas, offsetYCanvas);
    ctx.scale(scale, scale);

    drawAdjacentAreasDimensions();

    if (isDragging && selectedAreaId) {
        const movingArea = movementAreas.find(a => a.id === selectedAreaId);
        if (movingArea) {
            drawInterAreaDimensions(movingArea);
        }
    }

    if (walls && walls.length > 0) {
        if (getIsEditingWall()) {
            const editingWall = walls.find(w => w.id === getEditingWallId());
            if (editingWall) {
                drawWallHandles(editingWall);
            }
        }
    }

    drawDivisionDimensions();

    if (isDrawingWall) {
        drawWallPreview();
        drawVirtualDimensions();
    }

    if (isDrawingFreeLine) {
        drawFreeLinePreview();
    }

    // Preview da zona de exclusão enquanto desenha
    drawExclusionZonePreview();

    drawConnections();
    // Zonas de exclusão na camada dinâmica (ripple animations)
    drawExclusionZones(ctx, scale);
    drawConnectionHubs();
    
    // Desenhar feedback visual do posicionamento de hub
    drawHubPlacementFeedback();
    // NÃO atualizar métricas aqui - causa loop infinito de redesenho
    // updateConnectionDistancesTable();

    if (activeToolId === 'createOpeningBtn') {
        drawVirtualOpening();
    }

    import('./state.js')
        .then(state => {
            if (state.getShowNavigationGraph && state.getShowNavigationGraph()) {
                drawNavigationGraph();
            }
        })
        .catch(() => {});

    if (activeToolId === 'createResourceBtn') {
        drawResourceCreationPreview();
    } else if (activeToolId === 'createStairBtn') {
        drawStairCreationPreview();
    }

    renderAlignmentGuides();
    drawSmartGuides();

    if (isDrawing && currentRect) {
        let previewX = currentRect.x;
        let previewY = currentRect.y;
        let previewW = currentRect.width;
        let previewH = currentRect.height;

        if (previewW < 0) {
            previewX += previewW;
            previewW = Math.abs(previewW);
        }
        if (previewH < 0) {
            previewY += previewH;
            previewH = Math.abs(previewH);
        }

        ctx.strokeStyle = selectionColor;
        ctx.lineWidth = selectionLineWidth / scale;
        ctx.setLineDash([5 / scale, 5 / scale]);
        ctx.strokeRect(previewX, previewY, previewW, previewH);
        ctx.setLineDash([]);

        if (previewW > 0 && previewH > 0) {
            const previewWidthCm = Math.round(previewW / pixelsPerCm);
            const previewHeightCm = Math.round(previewH / pixelsPerCm);
            const offsetVal = dimensionOffset;
            const yDimLineY = previewY + previewH + offsetVal;
            const xDimLineX = previewX + previewW + offsetVal;
            const extensionScaled = dimensionExtension / scale;

            ctx.strokeStyle = getDimensionColor();
            ctx.lineWidth = dimensionLineWidth / scale;

            ctx.beginPath();
            ctx.moveTo(previewX, previewY + previewH);
            ctx.lineTo(previewX, yDimLineY + extensionScaled);
            ctx.moveTo(previewX + previewW, previewY + previewH);
            ctx.lineTo(previewX + previewW, yDimLineY + extensionScaled);
            ctx.stroke();

            drawDimensionLine(previewX, yDimLineY, previewX + previewW, yDimLineY, formatLength(previewWidthCm), 'below');

            ctx.beginPath();
            ctx.moveTo(previewX + previewW, previewY);
            ctx.lineTo(xDimLineX + extensionScaled, previewY);
            ctx.moveTo(previewX + previewW, previewY + previewH);
            ctx.lineTo(xDimLineX + extensionScaled, previewY + previewH);
            ctx.stroke();

            drawDimensionLine(xDimLineX, previewY, xDimLineX, previewY + previewH, formatLength(previewHeightCm), 'right');
        }
    }

    if (getIsEditingPolygon() && getEditingAreaId() !== null) {
        const editingArea = movementAreas.find(area => area.id === getEditingAreaId());
        if (editingArea) {
            drawEditableVertices(editingArea);
        }
    }

    if (getIsEditingResourcePolygon() && getEditingResourceId() !== null) {
        const editingResource = resources.find(resource => resource.id === getEditingResourceId());
        if (editingResource) {
            drawEditableResourceVertices(editingResource);
        }
    }

    drawAllResourceDimensions();
    drawLayoutTitle(ctx, movementAreas, walls, resources, scale);

    // Desenhar handles e cotas de zona de exclusão selecionada
    const selEZoneId = getSelectedExclusionZoneId();
    if (selEZoneId) {
        const selEZone = exclusionZones.find(z => z.id === selEZoneId);
        if (selEZone) {
            drawExclusionZoneHandles(selEZone);
            drawExclusionZoneDimensions(selEZone);
        }
    }

    ctx.restore();

    if (getCurrentTool() === 'createWallBtn') {
        ctx.save();
        ctx.translate(offsetXCanvas, offsetYCanvas);
        ctx.scale(scale, scale);

        if (isDrawingWall && wallPreviewEnd) {
            const snapPoint = findSnapPoint(wallPreviewEnd[0], wallPreviewEnd[1]);
            if (snapPoint) {
                drawSnapIndicators(snapPoint);
            }
        } else if (!isDrawingWall && lastSnapPoint) {
            drawSnapIndicators(lastSnapPoint);
        }
        
        // Desenhar preview de snap de parede (ponto de interseção + cotas de divisão)
        drawWallSnapPreviewFeedback();

        ctx.restore();
    }

    const zoomLevelIndicator = document.getElementById('zoomLevel');
    if (zoomLevelIndicator) {
        zoomLevelIndicator.textContent = `${Math.round(scale * 100)}%`;
    }

    const canvasWidthStat = document.getElementById('canvasWidth');
    const canvasHeightStat = document.getElementById('canvasHeight');
    if (canvasWidthStat && canvasHeightStat) {
        canvasWidthStat.textContent = Math.round(canvas.width / scale / pixelsPerCm);
        canvasHeightStat.textContent = Math.round(canvas.height / scale / pixelsPerCm);
    }

    // Não mostrar cotas de hover se há recurso selecionado
    const selectedResourceId = getSelectedResourceId();
    if (getIsAreaHoverActive() && !selectedResourceId && !(getCurrentTool() === 'createResourceBtn' && getIsDrawingResource())) {
        const hoverDimensions = getHoveredAreaVirtualDimensions();
        if (hoverDimensions && hoverDimensions.length > 0) {
            ctx.save();
            ctx.translate(offsetXCanvas, offsetYCanvas);
            ctx.scale(scale, scale);
            drawVirtualHoverDimensions(ctx, null, scale);
            ctx.restore();
        }
    }
}

// UNIFICADO: Desenhar TODOS os hubs (manuais e de conexão)
function drawHubs() {
    const hubs = getAllHubRecords();
    if (!hubs || hubs.length === 0) return;

    const ctx = getCtx();
    if (!ctx) return;

    const currentFloorId = getCurrentFloorId();
    const hubRadius = getHubVisualRadius();
    const selectedHubId = getSelectedHubId();
    const hoveredHubId = getHoveredHubId();

    hubs.forEach(hub => {
        // Verificar se o hub pertence ao pavimento atual
        if (hub.floorId && hub.floorId !== currentFloorId) {
            return;
        }

        ctx.save();

        // Determinar posição do hub (mundial)
        let hubX, hubY;
        
        if (hub.isAnchored && hub.resourceId) {
            // Hub ancorado a recurso: calcular posição mundial a partir de coordenadas locais
            const resource = resources.find(r => r.id === hub.resourceId);
            if (resource) {
                const worldCoords = anchorToWorldCoordinates(resource, {
                    x: hub.localX,
                    y: hub.localY
                });
                hubX = worldCoords.x;
                hubY = worldCoords.y;
                
                // Atualizar cache de coordenadas mundiais
                hub.x = hubX;
                hub.y = hubY;
            } else {
                // Recurso não encontrado, usar coordenadas em cache
                hubX = hub.x;
                hubY = hub.y;
            }
        } else {
            // Hub livre: usar coordenadas mundiais diretamente
            hubX = hub.x;
            hubY = hub.y;
        }

        // Verificar estados
        const isSelected = hub.id === selectedHubId;
        const isHovered = hub.id === hoveredHubId;
        
        if (isSelected || isHovered) {
        }
        
        if (isSelected) {
            // Hub selecionado - cor vermelha (igual conexões)
            ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
        } else if (isHovered) {
            // Hub com hover - cor laranja (igual conexões)
            ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
        } else if (hub.boundaryOpeningId) {
            // Hub de doca - cor verde (destaca como ponto de expedição/recebimento)
            ctx.fillStyle = 'rgba(46, 125, 50, 0.85)';
            ctx.strokeStyle = '#2e7d32';
            ctx.lineWidth = 2;
        } else {
            // Hub normal - cor azul
            ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 1;
        }

        // Desenhar hub em forma de GOTA (se tiver normal válida) ou círculo (se não tiver)
        const hasValidNormal = hub.normalX != null && hub.normalY != null && 
                               (hub.normalX !== 0 || hub.normalY !== 0);
        
        if (hasValidNormal) {
            drawTeardropShape(ctx, hubX, hubY, hubRadius, hub.normalX, hub.normalY);
        } else {
            // Hub sem direção válida - desenhar círculo
            ctx.beginPath();
            ctx.arc(hubX, hubY, hubRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        }

        const label = hub.boundaryOpeningId ? 'D' : getHubDisplayLabel(hub);
        if (label) {
            const currentScale = getScale();
            const fontSize = 10 / currentScale;

            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, hubX, hubY);
        }
        
        // Rótulo externo "DOCA" para hubs de boundary opening
        if (hub.boundaryOpeningId) {
            const currentScale = getScale();
            const labelFontSize = 9 / currentScale;
            const labelOffset = hubRadius + 8 / currentScale;
            
            // Posicionar rótulo na direção contrária da normal (fora da área)
            const lx = hubX + (hub.normalX || 0) * labelOffset;
            const ly = hubY + (hub.normalY || 0) * labelOffset;
            
            ctx.fillStyle = '#2e7d32';
            ctx.font = `bold ${labelFontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('DOCA', lx, ly);
        }

        ctx.restore();
    });
}

/**
 * Desenha o feedback visual do modo de posicionamento de hub
 * - Faixa verde piscante ao redor das bordas do recurso
 * - Preview do hub com seta de direção
 * - Objetos em branco para contraste durante o piscar
 */
function drawHubPlacementFeedback() {
    if (!getIsHubPlacementActive()) return;
    
    const ctx = getCtx();
    if (!ctx) return;
    
    const targetResource = getHubPlacementTargetResource();
    const previewPos = getHubPreviewPosition();
    const previewNormal = getHubPreviewNormal();
    const blinkPhase = getHubZoneBlinkPhase();
    const hubRadius = getHubVisualRadius();
    const showAllZones = getShowAllResourcesZones();
    
    // Desenhar overlay branco em TODOS os recursos durante o pisca (para contraste)
    // Isso acontece sempre que o modo está ativo, independente de ter target
    const whiteAlpha = 0.3 + blinkPhase * 0.5; // Varia entre 0.3 e 0.8
    resources.forEach(resource => {
        if (resource._plannerHidden) return;
        if (resource.visible === false) return;
        
        const vertices = getResourceVertices(resource);
        if (vertices.length >= 3) {
            drawResourceWhiteOverlay(ctx, vertices, whiteAlpha);
        }
    });
    
    // Desenhar zona válida em recursos
    if (showAllZones && !targetResource) {
        // Mostrar zona em TODOS os recursos
        resources.forEach(resource => {
            if (resource._plannerHidden) return;
            if (resource.visible === false) return;
            
            const vertices = getResourceVertices(resource);
            if (vertices.length >= 3) {
                drawValidZone(ctx, vertices, blinkPhase);
            }
        });
    } else if (targetResource) {
        // Mostrar zona apenas no recurso alvo
        const vertices = getResourceVertices(targetResource);
        if (vertices.length >= 3) {
            drawValidZone(ctx, vertices, blinkPhase);
        }
    }
    
    // Se há preview, desenhar o hub fantasma e a seta
    if (previewPos && previewNormal) {
        drawHubPreview(ctx, previewPos, previewNormal, hubRadius, blinkPhase);
    }
}

/**
 * Desenha overlay branco sobre a BORDA de um recurso para contraste durante o pisca
 * (apenas na faixa de 10cm, não no interior)
 */
function drawResourceWhiteOverlay(ctx, vertices, alpha) {
    if (!vertices || vertices.length < 3) return;
    
    const innerVertices = generateValidZonePolygon(vertices);
    if (innerVertices.length < 3) return;
    
    ctx.save();
    
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    
    // Desenhar apenas a faixa de borda (diferença entre externo e interno)
    ctx.beginPath();
    
    // Contorno externo (sentido horário)
    ctx.moveTo(vertices[0][0], vertices[0][1]);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i][0], vertices[i][1]);
    }
    ctx.closePath();
    
    // Contorno interno (sentido anti-horário para criar "buraco")
    ctx.moveTo(innerVertices[0][0], innerVertices[0][1]);
    for (let i = innerVertices.length - 1; i >= 0; i--) {
        ctx.lineTo(innerVertices[i][0], innerVertices[i][1]);
    }
    ctx.closePath();
    
    ctx.fill('evenodd');
    
    ctx.restore();
}

/**
 * Desenha a zona válida (faixa de 10cm piscando em verde)
 */
function drawValidZone(ctx, vertices, blinkPhase) {
    if (!vertices || vertices.length < 3) return;
    
    const innerVertices = generateValidZonePolygon(vertices);
    if (innerVertices.length < 3) return;
    
    ctx.save();
    
    // Cor verde com alpha baseado na fase do piscar
    const alpha = 0.2 + blinkPhase * 0.4; // Varia entre 0.2 e 0.6
    ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`; // Verde (green-500)
    ctx.strokeStyle = `rgba(22, 163, 74, ${0.5 + blinkPhase * 0.5})`; // Verde mais escuro
    ctx.lineWidth = 2 / getScale();
    
    // Desenhar a faixa como a diferença entre o polígono externo e interno
    ctx.beginPath();
    
    // Contorno externo (sentido horário)
    ctx.moveTo(vertices[0][0], vertices[0][1]);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i][0], vertices[i][1]);
    }
    ctx.closePath();
    
    // Contorno interno (sentido anti-horário para criar "buraco")
    ctx.moveTo(innerVertices[0][0], innerVertices[0][1]);
    for (let i = innerVertices.length - 1; i >= 0; i--) {
        ctx.lineTo(innerVertices[i][0], innerVertices[i][1]);
    }
    ctx.closePath();
    
    ctx.fill('evenodd');
    
    // Desenhar borda externa
    ctx.beginPath();
    ctx.moveTo(vertices[0][0], vertices[0][1]);
    for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i][0], vertices[i][1]);
    }
    ctx.closePath();
    ctx.stroke();
    
    ctx.restore();
}

/**
 * Desenha o preview do hub em forma de gota
 */
function drawHubPreview(ctx, position, normal, hubRadius, blinkPhase) {
    ctx.save();
    
    const alpha = 0.6 + blinkPhase * 0.3; // Varia entre 0.6 e 0.9
    
    // Desenhar o hub preview em forma de GOTA
    ctx.fillStyle = `rgba(99, 102, 241, ${alpha})`; // Azul (indigo-500)
    ctx.strokeStyle = `rgba(79, 70, 229, ${alpha + 0.1})`; // Azul mais escuro
    ctx.lineWidth = 2 / getScale();
    
    drawTeardropShape(ctx, position.x, position.y, hubRadius, normal.x, normal.y);
    
    ctx.restore();
}

/**
 * Desenha uma forma de gota (teardrop) com a ponta apontando na direção da normal
 * @param {CanvasRenderingContext2D} ctx - Contexto do canvas
 * @param {number} x - Posição X do centro
 * @param {number} y - Posição Y do centro  
 * @param {number} radius - Raio da parte circular
 * @param {number} normalX - Componente X da normal (direção da ponta)
 * @param {number} normalY - Componente Y da normal (direção da ponta)
 */
function drawTeardropShape(ctx, x, y, radius, normalX, normalY) {
    // Comprimento da ponta da gota (1.5x o raio)
    const tipLength = radius * 1.5;
    
    // Posição da ponta da gota
    const tipX = x + normalX * tipLength;
    const tipY = y + normalY * tipLength;
    
    // Ângulo da normal
    const angle = Math.atan2(normalY, normalX);
    
    // Desenhar a gota usando curvas de Bezier
    ctx.beginPath();
    
    // Começar do lado direito da parte circular (perpendicular à normal)
    const perpX = -normalY;
    const perpY = normalX;
    
    // Pontos de controle para a curva
    const startX = x + perpX * radius;
    const startY = y + perpY * radius;
    const endX = x - perpX * radius;
    const endY = y - perpY * radius;
    
    // Ponto de trás (oposto à ponta)
    const backX = x - normalX * radius * 0.3;
    const backY = y - normalY * radius * 0.3;
    
    // Desenhar a parte traseira (arco)
    ctx.moveTo(startX, startY);
    ctx.arc(x, y, radius, angle + Math.PI/2, angle - Math.PI/2, false);
    
    // Curva até a ponta (lado esquerdo)
    ctx.quadraticCurveTo(
        x - perpX * radius * 0.3 + normalX * tipLength * 0.5,
        y - perpY * radius * 0.3 + normalY * tipLength * 0.5,
        tipX, tipY
    );
    
    // Curva de volta (lado direito)
    ctx.quadraticCurveTo(
        x + perpX * radius * 0.3 + normalX * tipLength * 0.5,
        y + perpY * radius * 0.3 + normalY * tipLength * 0.5,
        startX, startY
    );
    
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

// Expor drawAll para acesso global (necessário para animação de piscar)
if (typeof window !== 'undefined') {
    window.drawAll = drawAll;
}

export {
    drawAll,
    drawAll as redraw,
    toggleNavMeshVisualization,
    setNavMeshVisualWidth,
    getNavMeshVisualizationState,
    showNavMeshNodes,
    navMeshVisualWidth
};

export { computeResourceLabelGeometry } from './drawing/core/resourcesRenderer.js';
