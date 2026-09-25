/**
 * Mouse Events - Módulo principal de gerenciamento de eventos de mouse
 * 
 * Este arquivo foi refatorado para ser mais modular e fácil de manter.
 * Os handlers específicos foram movidos para:
 * - ./handlers/ - Handlers específicos por funcionalidade
 * - ./utils/ - Utilitários compartilhados
 */

import { 
    isDrawingWall, wallStartPoint, isDrawing, currentRect, 
    activeGuideLines, walls, movementAreas, selectedAreaId,
    resources, 
    getCanvas, setIsDrawing, isDragging,
    isPanning, panStart, startX, startY, offsetX, offsetY,
    isRightMouseDown, setIsRightMouseDown, setRightMouseStartPos, getRightMouseStartPos,
    setDidRightMouseDrag, getDidRightMouseDrag, getRightClickDragThreshold,
    setIsDragging, setIsPanning, setPanStart, setStartX, setStartY, setDragStartX, setDragStartY,
    setOffsetX, setOffsetY, setSelectedAreaId, setSelectedWallId, getScale, setScale, 
    getOffsetXCanvas, setOffsetXCanvas, getOffsetYCanvas, setOffsetYCanvas,
    getHoveredAreaVirtualDimensions, setHoveredAreaVirtualDimensions,
    getIsAreaHoverActive, setIsAreaHoverActive,
    getIsCreatingOpening, setIsCreatingOpening, setOpeningPreviewPosition,
    getSelectedResourceId, getSelectedResourceIds, setSelectedResourceId,
    getIsDrawingResource, setIsDrawingResource, getCurrentResourceRect, setCurrentResourceRect,
    getIsDrawingStair, setIsDrawingStair, getCurrentStairRect,
    getDraggingMidpointIndex, setDraggingMidpointIndex, setOriginalVerticesOnDrag,
    getIsEditingResourcePolygon, getEditingResourceId,
    getEditingAreaId, getIsEditingPolygon, setIsEditingPolygon, setEditingAreaId,
    setActiveGuideLines,
    getIsDrawingConnection, getIsConnectionMousePressed, setIsConnectionMousePressed,
    getActiveConnectionStairGroup, setActiveConnectionStairGroup, setSelectedConnectionId,
    getIsEditingWall, getEditingWallId, getEditingWallHandle, setEditingWallHandle,
    getIsCtrlPressed, getActiveResourceDragState, setActiveResourceDragState,
    getIsDrawingFreeLine, setIsDrawingFreeLine, setFreeLineStartPoint, setFreeLinePreviewEnd,
    setSelectedFreeLineId,
    isResourceSelected,
    getActiveResizeHandle, setActiveResizeHandle,
    getIsRotatingArea, setIsRotatingArea,
    getRotationStartAngle, setRotationStartAngle,
    getRotationCenter, setRotationCenter,
    getVerticesBeforeRotation, setVerticesBeforeRotation,
    getCurrentRotationAngle, setCurrentRotationAngle,
    setHoveredResizeHandle, getOriginalVerticesOnDrag,
    // Estados para rotação em tempo real dos itens da área
    getOriginalAreaResourcesBeforeRotation, setOriginalAreaResourcesBeforeRotation,
    getOriginalAreaWallsBeforeRotation, setOriginalAreaWallsBeforeRotation,
    getOriginalAreaConnectionsBeforeRotation, setOriginalAreaConnectionsBeforeRotation,
    getOriginalAreaResourceHubsBeforeRotation, setOriginalAreaResourceHubsBeforeRotation,
    getOriginalAreaOpeningsBeforeRotation, setOriginalAreaOpeningsBeforeRotation,
    getConnections,
    // PPT handles para recursos
    getActiveResourceResizeHandle,
    getIsRotatingResource
} from '../state.js';
import { drawAll } from '../drawing.js';
import { legacyToolInstance } from '../tools/LegacyTool.js';
import { getCurrentToolInstance } from '../active_tool.js';
import { setActiveTool, getCurrentTool } from '../active_tool.js';
import { hideContextMenu } from './contextMenuUtils.js';
import { getMousePos, getAreaAtPos, findWallAtPos, snapToGrid } from './mouseUtils.js';
import { pixelsPerCm, gridSpacingPx, wallMinLength, wallAreaBorderTolerance } from '../config.js';
import { checkOverlap, rectangleToVertices } from '../areas.js';
import { findSnapPointWithSmartSnap, isPointOnWallHandle, updateWallEndpoint, drawSnapIndicators, getWallHandleCursor, calculateWallSnapPreview } from '../walls.js';
import { virtualDimensionsSystem } from '../virtual-dimensions.js';
import { findResourceAtPosition, deselectAllResources, stopResourcePolygonEditing, addResourceToSelection, setResourceSelection } from '../resources.js';
import { isPointInAreaWithTolerance } from '../events.js';
import { saveStateToHistory } from '../history.js';
import { ensureAreaHasNavMesh } from '../navMeshBaker.js';
import { refreshNavMeshOptions } from '../navmesh-controls.js';
import { updateConnectionPathsForResource, getConnectionAtPosition } from '../connections.js';
import { invalidateNavigationGraph } from '../navigation.js';
import { showContextMenuForArea } from '../showcontextmenu/showcontextmenuforarea.js';
import { showContextMenuForResource } from '../showcontextmenu/showcontextmenuforresource.js';
import { showContextMenuForWall } from '../showcontextmenu/showcontextmenuforwall.js';
import { showContextMenuForConnection } from '../showcontextmenu/showcontextmenuforconnection.js';
import { showContextMenuForOpening } from '../showcontextmenu/showcontextmenuforopening.js';
import { endResourceDrag } from '../resource-dimensions.js';
import { getMidpointAtPos, updateMidpointDrag, getMidpointCursor, calculatePPTHandles, getHandleCursor } from '../polygon.js';
import { calculateBoundingBox, syncAreaCoordinates } from '../areas.js';
import { resetStairDrawingState } from '../stairs.js';
import { getIsResizingOpening, stopResizingOpening, findOpeningAtPosition, getIsCreatingOpeningFromOpenings, stopCreatingOpening, setSelectedOpeningId, findWallAtPosition, openings as allOpenings } from '../openings.js';
import { clearFreeLineSnapIndicator, clearFreeLineClosureIndicator } from '../free-lines.js';
import { updateConnectionDistancesTable } from '../flow-metrics.js';
import { rotateResourcesWithArea } from '../merge_resources/rotateresource.js';
import { rotateWallsWithArea } from '../walls.js';
import { rotateConnectionsWithArea } from '../connections/connectionUtils.js';
import { getHubsForResource } from '../hubs.js';
import { calculatePolygonCentroid } from '../navigation.js';
import { layoutChangeNotifier } from '../core/layout-change-notifier.js';

let isSpaceNavigationPressed = false;
let isDedicatedPanGesture = false;

function isEditableTarget(target) {
    return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function startDedicatedPan(e) {
    const canvas = getCanvas();
    isDedicatedPanGesture = true;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    canvas.style.cursor = 'grabbing';
}

function stopDedicatedPan() {
    if (!isDedicatedPanGesture) return false;
    isDedicatedPanGesture = false;
    setIsPanning(false);
    getCanvas().style.cursor = isSpaceNavigationPressed ? 'grab' : 'default';
    return true;
}

// Importar handlers modulares
import {
    handleAreaClick,
    handleCreateAreaMouseDown,
    handleCreateAreaMove,
    handleAreaDrag
} from './handlers/areaHandlers.js';

import {
    handleResourceClick,
    handleCreateResourceMouseDown,
    handleCreateResourceMove,
    handleCreateResourceMouseUp,
    handleResourceDrag,
    handleResourceMidpointDrag,
    createResourceDragState,
    // Handlers PPT para recursos
    handleResourcePPTHover,
    handleResourcePPTResizeDrag,
    handleResourcePPTRotationDrag,
    handleResourcePPTResizeMouseUp,
    handleResourcePPTRotationMouseUp
} from './handlers/resourceHandlers.js';

import {
    handleCreateWallMouseDown,
    handleCreateWallMove,
    handleCreateWallMouseUp,
    handleWallClick,
    handleWallToolCursor
} from './handlers/wallHandlers.js';

import {
    handleCreateConnectionMouseDown,
    handleCreateConnectionMove,
    handleCreateConnectionMouseUp,
    handleConnectionClick,
    updateConnectionHover
} from './handlers/connectionHandlers.js';

import { getHubAtPosition } from '../hubs.js';
import { setHoveredHubId, getHoveredHubId, getHoveredResourceId, setHoveredResourceId, setSelectedWallSubSegment, getEditingExclusionHubId, deactivateExclusionEditing, getHoveredExclusionZoneId, setHoveredExclusionZoneId, setSelectedExclusionZoneId, getSelectedExclusionZoneId, exclusionZones, getIsDraggingExclusionZone, setIsDraggingExclusionZone, getExclusionZoneDragOffset, setExclusionZoneDragOffset, getExclusionZoneOriginalStart, setExclusionZoneOriginalStart, getExclusionZoneOriginalEnd, setExclusionZoneOriginalEnd, getActiveExclusionZoneResizeHandle, setActiveExclusionZoneResizeHandle } from '../state.js';
import { computeSubSegment } from '../utils/segment-split.js';

import {
    handleCreateOpeningMouseDown,
    handleOpeningClick,
    handleOpeningMove,
    handleResizeOpeningMove,
    handleOpeningToolCursor,
    findHoveredControlPointGlobal,
    startResizingOpening,
    setHoveredControlPoint
} from './handlers/openingHandlers.js';

import {
    handleSelectionMouseDown,
    handleEmptySpaceClick,
    handleFreeLineClick
} from './handlers/selectionHandlers.js';

import {
    handlePanMove,
    handleWheel
} from './handlers/panZoomHandlers.js';

import {
    handleCreateFreeLineMouseDown,
    handleCreateFreeLineMove,
    handleCreateFreeLineMouseUp
} from './handlers/freeLineHandlers.js';

import {
    handleCreateStairMouseDown,
    handleCreateStairMove,
    handleCreateStairMouseUp
} from './handlers/stairHandlers.js';

import {
    handleCreateOperatorMouseDown
} from './handlers/operatorHandlers.js';

import {
    handleCreateHubMouseDown,
    handleExclusionEdgeHover,
    handleExclusionEdgeMouseDown,
    handleExclusionEdgeDrag,
    handleExclusionEdgeMouseUp,
    getExclusionEdgeCursor
} from './handlers/hubHandlers.js';

import { findExclusionZoneAtPoint } from '../hub-exclusion-zones.js';
import { findStandaloneExclusionZoneAtPoint, removeExclusionZone, applyExclusionZoneResize, getExclusionZoneHandleAtPos, getExclusionZoneHandleCursor } from '../exclusion-zones.js';
import { showContextMenuForExclusionZone } from '../showcontextmenu/showcontextmenuforexclusionzone.js';
import { ensureContextMenuElement } from '../showcontextmenu/showcontextmenuutils.js';

// Importar utilitários
import { updateCursorForTool, handleDefaultCursor } from './utils/cursorUtils.js';
import { handleDragMouseUp } from './utils/dragStateUtils.js';
import { updateAreaPosition, calculateMaxAllowedMovement } from './utils/movementUtils.js';

/**
 * Atualiza os caminhos de conexão para um recurso específico
 */
function updateConnectionPathsForResourceLocal(resourceId) {
    updateConnectionPathsForResource(resourceId);
}

// Exportar função globalmente para uso em outros módulos
if (typeof window !== 'undefined') {
    window.updateConnectionPathsForResource = updateConnectionPathsForResourceLocal;
    window.invalidateNavigationGraph = invalidateNavigationGraph;
}

/**
 * Inicializa todos os listeners de eventos do mouse
 */
export function initializeMouseEvents() {
    const canvas = getCanvas();
    
    // Configure legacy tool handlers
    legacyToolInstance.setHandlers({
        mousedown: handleMouseDown,
        mousemove: handleMouseMove,
        mouseup: handleMouseUp,
        wheel: handleWheel,
        contextmenu: handleContextMenu
    });

    // Mouse down: Delegates to current tool
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && isSpaceNavigationPressed)) {
            e.preventDefault();
            startDedicatedPan(e);
            return;
        }
        getCurrentToolInstance().onMouseDown(e);
    });
    
    // Mouse move: Delegates to current tool
    canvas.addEventListener('mousemove', (e) => {
        if (isDedicatedPanGesture) {
            handlePanMove(e);
            return;
        }
        getCurrentToolInstance().onMouseMove(e);
    });
    
    // Mouse up: Delegates to current tool
    canvas.addEventListener('mouseup', (e) => {
        if (stopDedicatedPan()) return;
        getCurrentToolInstance().onMouseUp(e);
    });
    
    // Double click: Finaliza conexões
    canvas.addEventListener('dblclick', handleDoubleClick);
    
    // Mouse leave: Cancelar ações em progresso
    canvas.addEventListener('mouseleave', handleMouseLeave);
    
    // Sempre prevenir o menu de contexto nativo - o menu é exibido no mouseup
    // baseado em se houve drag (pan) ou apenas clique (context menu)
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    
    // Wheel: Zoom e Pan
    canvas.addEventListener('wheel', (e) => {
        const tool = getCurrentToolInstance();
        if (tool.onWheel) {
            tool.onWheel(e);
        } else {
            handleWheel(e);
        }
    }, { passive: false });
    
    // Document mouseup para capturar mouseup mesmo quando o mouse sai do canvas
    document.addEventListener('mouseup', (e) => {
        stopDedicatedPan();
        handleDocumentMouseUp(e);
    });

    document.addEventListener('keydown', (e) => {
        if (e.code !== 'Space' || isEditableTarget(e.target)) return;
        e.preventDefault();
        isSpaceNavigationPressed = true;
        if (!isPanning) canvas.style.cursor = 'grab';
    });

    document.addEventListener('keyup', (e) => {
        if (e.code !== 'Space') return;
        isSpaceNavigationPressed = false;
        if (!isDedicatedPanGesture && !isPanning) canvas.style.cursor = 'default';
    });

    window.addEventListener('blur', () => {
        isSpaceNavigationPressed = false;
        stopDedicatedPan();
    });
}

/**
 * Manipula o evento mousedown
 */
function handleMouseDown(e) {
    const pos = getMousePos(e);
    const canvas = getCanvas();
    hideContextMenu();
    
    if (e.button === 1) { // Botão do meio - Pan
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        canvas.style.cursor = 'grabbing';
        return;
    }
    
    if (e.button === 2) { // Botão direito - Iniciar tracking para pan ou context menu
        setIsRightMouseDown(true);
        setRightMouseStartPos({ x: e.clientX, y: e.clientY });
        setDidRightMouseDrag(false);
        return;
    }
    
    if (e.button === 0) { // Botão esquerdo
        // Check for exclusion zone edge drag
        if (handleExclusionEdgeMouseDown(pos)) {
            return;
        }
        
        // Check for wall handle editing
        if (getIsEditingWall()) {
            const editingWallId = getEditingWallId();
            const wall = walls.find(w => w.id === editingWallId);
            if (wall) {
                const handle = isPointOnWallHandle(pos.x, pos.y, wall);
                if (handle) {
                    setEditingWallHandle(handle);
                    setIsDragging(true);
                    canvas.style.cursor = getWallHandleCursor(wall, handle);
                    return;
                }
            }
        }
        
        const tool = getCurrentTool();
        
        if (tool === 'createAreaBtn') {
            handleCreateAreaMouseDown(pos, e, {
                currentRect,
                setIsDrawing,
                setStartX,
                setStartY
            });
        } else if (tool === 'createWallBtn') {
            handleCreateWallMouseDown(pos, e);
        } else if (tool === 'createOpeningBtn') {
            handleCreateOpeningMouseDown(pos);
        } else if (tool === 'createResourceBtn') {
            handleCreateResourceMouseDown(pos);
        } else if (tool === 'createConnectionBtn') {
            handleCreateConnectionMouseDown(pos);
        } else if (tool === 'createHubBtn') {
            handleCreateHubMouseDown(pos);
        } else if (tool === 'createStairBtn') {
            handleCreateStairMouseDown(pos);
        } else if (tool === 'createFreeLineBtn') {
            handleCreateFreeLineMouseDown(pos);
        } else if (tool === 'createOperatorBtn') {
            handleCreateOperatorMouseDown(pos);
        } else {
            // Deactivate exclusion editing when clicking in default/selection mode
            if (getEditingExclusionHubId()) {
                deactivateExclusionEditing();
            }
            handleSelectionMouseDown(pos, e);
        }
    }
}

/**
 * Manipula o evento mousemove
 */
function handleMouseMove(e) {
    const pos = getMousePos(e);
    const canvas = getCanvas();
    
    // Verificar se botão direito está pressionado - possível pan
    if (isRightMouseDown) {
        const startPos = getRightMouseStartPos();
        const dx = e.clientX - startPos.x;
        const dy = e.clientY - startPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (!isPanning && distance > getRightClickDragThreshold()) {
            // Ultrapassou o limiar - iniciar pan
            setDidRightMouseDrag(true);
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            canvas.style.cursor = 'grabbing';
        }
    }
    
    if (isPanning) {
        handlePanMove(e);
        return;
    }
    
    // Handle exclusion zone edge drag
    if (handleExclusionEdgeDrag(pos)) {
        const cursor = getExclusionEdgeCursor();
        if (cursor) canvas.style.cursor = cursor;
        return;
    }
    
    // Handle wall editing drag
    if (isDragging && getIsEditingWall() && getEditingWallHandle()) {
        const editingWallId = getEditingWallId();
        const wall = walls.find(w => w.id === editingWallId);
        if (wall) {
            const snapResult = findSnapPointWithSmartSnap(pos.x, pos.y);
            const snappedPos = snapResult ? snapResult.point : [pos.x, pos.y];
            
            updateWallEndpoint(wall, getEditingWallHandle(), snappedPos[0], snappedPos[1]);
            
            if (snapResult) {
                drawSnapIndicators(snapResult);
            }
            
            drawAll();
        }
        return;
    }
    
    const tool = getCurrentTool();
    
    if (isDrawing && tool === 'createAreaBtn') {
        handleCreateAreaMove(pos, { currentRect, startX, startY });
    } else if (isDrawingWall && tool === 'createWallBtn') {
        handleCreateWallMove(pos);
    } else if (tool === 'createOpeningBtn') {
        handleOpeningMove(pos);
    } else if (getIsDrawingResource() && tool === 'createResourceBtn') {
        handleCreateResourceMove(pos);
    } else if (getIsConnectionMousePressed() && tool === 'createConnectionBtn') {
        handleCreateConnectionMove(pos);
    } else if (getIsDrawingStair() && tool === 'createStairBtn') {
        handleCreateStairMove(pos);
    } else if (getIsDrawingFreeLine() && tool === 'createFreeLineBtn') {
        handleCreateFreeLineMove(pos);
    } else if (getIsResizingOpening()) {
        handleResizeOpeningMove(pos);
    } else if (getActiveResizeHandle() !== null) {
        // Redimensionamento estilo PowerPoint para áreas
        handlePPTResizeDrag(pos);
    } else if (getIsRotatingArea()) {
        // Rotação estilo PowerPoint para áreas
        handlePPTRotationDrag(pos);
    } else if (getActiveResourceResizeHandle() !== null) {
        // Redimensionamento estilo PowerPoint para recursos
        handleResourcePPTResizeDrag(pos);
    } else if (getIsRotatingResource()) {
        // Rotação estilo PowerPoint para recursos
        handleResourcePPTRotationDrag(pos);
    } else if (getDraggingMidpointIndex() !== null && getDraggingMidpointIndex() !== -1) {
        if (getIsEditingResourcePolygon()) {
            handleResourceMidpointDrag(pos);
        } else {
            handleMidpointDrag(pos);
        }
    } else if (getActiveExclusionZoneResizeHandle()) {
        // Redimensionamento de zona de exclusão
        handleExclusionZoneResizeDrag(pos);
    } else if (getIsDraggingExclusionZone()) {
        // Arraste de zona de exclusão
        handleExclusionZoneDrag(pos);
    } else if (isDragging && selectedAreaId) {
        handleAreaDrag(pos, { offsetX, offsetY });
    } else if (isDragging && getSelectedResourceIds().length > 0) {
        handleResourceDrag(pos, { offsetX, offsetY });
    } else {
        handleHoverMove(pos);
    }
}

/**
 * Manipula o arraste de zona de exclusão
 */
function handleExclusionZoneDrag(pos) {
    const selectedId = getSelectedExclusionZoneId();
    if (!selectedId) return;
    const zone = exclusionZones.find(z => z.id === selectedId);
    if (!zone) return;
    const offset = getExclusionZoneDragOffset();
    if (!offset) return;

    const newStartX = pos.x - offset.dx;
    const newStartY = pos.y - offset.dy;
    const origStart = getExclusionZoneOriginalStart();
    const origEnd = getExclusionZoneOriginalEnd();
    const dx = newStartX - origStart[0];
    const dy = newStartY - origStart[1];

    zone.startPoint = [origStart[0] + dx, origStart[1] + dy];
    zone.endPoint = [origEnd[0] + dx, origEnd[1] + dy];

    getCanvas().style.cursor = 'grabbing';
    drawAll();
}

/**
 * Manipula o redimensionamento de zona de exclusão
 */
function handleExclusionZoneResizeDrag(pos) {
    const selectedId = getSelectedExclusionZoneId();
    if (!selectedId) return;
    const zone = exclusionZones.find(z => z.id === selectedId);
    if (!zone) return;
    const handle = getActiveExclusionZoneResizeHandle();
    const origStart = getExclusionZoneOriginalStart();
    const origEnd = getExclusionZoneOriginalEnd();
    if (!handle || !origStart || !origEnd) return;

    applyExclusionZoneResize(zone, handle, pos.x, pos.y, origStart, origEnd);
    drawAll();
}

/**
 * Manipula o arraste de midpoint de área
 */
function handleMidpointDrag(pos) {
    const canvas = getCanvas();
    
    const editingArea = movementAreas.find(a => a.id === getEditingAreaId());
    if (editingArea) {
        updateMidpointDrag(editingArea, getDraggingMidpointIndex(), pos.x, pos.y);
        
        if (editingArea.rings && editingArea.rings.length > 0) {
            editingArea.rings[0] = editingArea.vertices;
        }
        
        const bb = calculateBoundingBox(editingArea.vertices);
        editingArea.x = bb.x;
        editingArea.y = bb.y;
        editingArea.width = bb.width;
        editingArea.height = bb.height;
        
        canvas.style.cursor = getMidpointCursor(editingArea, getDraggingMidpointIndex());
        drawAll();
    }
}

/**
 * Manipula o redimensionamento estilo PowerPoint
 */
function handlePPTResizeDrag(pos) {
    const canvas = getCanvas();
    const editingArea = movementAreas.find(a => a.id === getEditingAreaId());
    const handleType = getActiveResizeHandle();
    const originalVertices = getOriginalVerticesOnDrag();
    
    if (!editingArea || !handleType || !originalVertices) return;
    
    const numVertices = originalVertices.length;
    
    // Nova lógica baseada em vértices reais
    if (handleType.startsWith('corner_')) {
        // Arrastar um vértice de canto - REDIMENSIONAMENTO mantendo ângulos
        const cornerIndex = parseInt(handleType.replace('corner_', ''));
        if (cornerIndex >= 0 && cornerIndex < numVertices) {
            // Aplicar snap ao grid centimétrico
            const snapped = snapToGrid(pos.x, pos.y);
            
            // Para um polígono de 4 vértices (retângulo), o canto oposto é cornerIndex + 2
            // Para polígonos genéricos, usar o vértice mais distante como ponto fixo
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
                snapped.x - fixedVertex[0],
                snapped.y - fixedVertex[1]
            ];
            
            // Calcular fatores de escala
            const originalLength = Math.sqrt(originalVector[0] ** 2 + originalVector[1] ** 2);
            
            if (originalLength > 0) {
                // Calcular escala em X e Y separadamente para manter a forma
                const scaleX = Math.abs(originalVector[0]) > 1 ? newVector[0] / originalVector[0] : 1;
                const scaleY = Math.abs(originalVector[1]) > 1 ? newVector[1] / originalVector[1] : 1;
                
                // Aplicar tamanho mínimo
                const minSize = pixelsPerCm * 10; // Mínimo 10cm
                const effectiveScaleX = Math.abs(newVector[0]) < minSize && Math.abs(originalVector[0]) > 1 
                    ? Math.sign(scaleX) * minSize / Math.abs(originalVector[0]) 
                    : scaleX;
                const effectiveScaleY = Math.abs(newVector[1]) < minSize && Math.abs(originalVector[1]) > 1 
                    ? Math.sign(scaleY) * minSize / Math.abs(originalVector[1]) 
                    : scaleY;
                
                // Aplicar transformação a todos os vértices
                const newVertices = originalVertices.map(([vx, vy]) => {
                    // Posição relativa ao ponto fixo
                    const relX = vx - fixedVertex[0];
                    const relY = vy - fixedVertex[1];
                    
                    // Aplicar escala
                    const newX = fixedVertex[0] + relX * effectiveScaleX;
                    const newY = fixedVertex[1] + relY * effectiveScaleY;
                    
                    // Snap ao grid
                    const snappedPos = snapToGrid(newX, newY);
                    return [snappedPos.x, snappedPos.y];
                });
                
                editingArea.vertices = newVertices;
            }
        }
    } else if (handleType.startsWith('edge_')) {
        // Arrastar uma aresta - MOVIMENTO PERPENDICULAR com snap centimétrico
        const edgeIndex = parseInt(handleType.replace('edge_', ''));
        const numVertices = originalVertices.length;
        
        if (edgeIndex >= 0 && edgeIndex < numVertices) {
            const vertex1Index = edgeIndex;
            const vertex2Index = (edgeIndex + 1) % numVertices;
            
            // Usar vértices originais para calcular vetor da aresta
            const originalVertex1 = originalVertices[vertex1Index];
            const originalVertex2 = originalVertices[vertex2Index];
            
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
                const mouseToOriginal = [pos.x - originalMidpoint[0], pos.y - originalMidpoint[1]];
                const distanceAlongNormal = mouseToOriginal[0] * normalVector[0] + mouseToOriginal[1] * normalVector[1];
                
                // Snap da distância para o múltiplo de centímetro mais próximo
                const gridSize = pixelsPerCm;
                const snappedDistance = Math.round(distanceAlongNormal / gridSize) * gridSize;
                
                // Mover ambos os vértices da aresta na direção normal a partir da posição original
                const moveVector = [normalVector[0] * snappedDistance, normalVector[1] * snappedDistance];
                
                // Criar cópia dos vértices
                const newVertices = originalVertices.map(v => [...v]);
                
                newVertices[vertex1Index] = [
                    originalVertex1[0] + moveVector[0],
                    originalVertex1[1] + moveVector[1]
                ];
                newVertices[vertex2Index] = [
                    originalVertex2[0] + moveVector[0],
                    originalVertex2[1] + moveVector[1]
                ];
                
                editingArea.vertices = newVertices;
            }
        }
    }
    
    // Atualizar rings se existirem
    if (editingArea.rings && editingArea.rings.length > 0) {
        editingArea.rings[0] = editingArea.vertices;
    }
    
    // Atualizar propriedades da área
    syncAreaCoordinates(editingArea);
    
    canvas.style.cursor = getHandleCursor(handleType, editingArea);
    drawAll();
}

/**
 * Manipula a rotação estilo PowerPoint
 */
function handlePPTRotationDrag(pos) {
    const canvas = getCanvas();
    const editingArea = movementAreas.find(a => a.id === getEditingAreaId());
    const center = getRotationCenter();
    const startAngle = getRotationStartAngle();
    const originalVertices = getVerticesBeforeRotation();
    
    if (!editingArea || !center || !originalVertices) return;
    
    // Calcular ângulo atual
    const currentAngle = Math.atan2(pos.y - center.y, pos.x - center.x);
    let deltaAngle = currentAngle - startAngle;
    
    // Snap de 15 graus (como no PowerPoint)
    const snapAngleDeg = 15;
    const snapAngleRad = snapAngleDeg * Math.PI / 180;
    deltaAngle = Math.round(deltaAngle / snapAngleRad) * snapAngleRad;
    
    // Se o ângulo está muito próximo de zero (menos de 5 graus), forçar para exatamente zero
    const toleranceRad = (5 * Math.PI) / 180;
    if (Math.abs(deltaAngle) < toleranceRad) {
        deltaAngle = 0;
    }
    
    // Guardar o ângulo de rotação atual para uso no mouseup
    setCurrentRotationAngle(deltaAngle);
    
    // Se deltaAngle é zero, restaurar vértices originais e não rotacionar itens
    if (deltaAngle === 0) {
        editingArea.vertices = originalVertices.map(([x, y]) => [x, y]);
        
        // Atualizar rings se existirem
        if (editingArea.rings && editingArea.rings.length > 0) {
            editingArea.rings[0] = editingArea.vertices;
        }
        
        // Atualizar propriedades da área
        syncAreaCoordinates(editingArea);
        
        // Restaurar recursos originais
        const originalResources = getOriginalAreaResourcesBeforeRotation();
        if (originalResources && originalResources.length > 0) {
            for (const originalResource of originalResources) {
                const resource = resources.find(r => r.id === originalResource.id);
                if (resource && originalResource.vertices) {
                    resource.vertices = originalResource.vertices.map(([x, y]) => [x, y]);
                }
            }
        }
        
        // Restaurar paredes originais
        const originalWalls = getOriginalAreaWallsBeforeRotation();
        if (originalWalls && originalWalls.length > 0) {
            for (const originalWall of originalWalls) {
                const wall = walls.find(w => w.id === originalWall.id);
                if (wall) {
                    wall.startPoint[0] = originalWall.startPoint[0];
                    wall.startPoint[1] = originalWall.startPoint[1];
                    wall.endPoint[0] = originalWall.endPoint[0];
                    wall.endPoint[1] = originalWall.endPoint[1];
                    if (originalWall.angle !== undefined) {
                        wall.angle = originalWall.angle;
                    }
                }
            }
        }
        
        // Restaurar conexões originais
        const originalConnections = getOriginalAreaConnectionsBeforeRotation();
        if (originalConnections && originalConnections.length > 0) {
            const allConnections = getConnections();
            for (const originalConn of originalConnections) {
                const connection = allConnections.find(c => c.id === originalConn.id);
                if (connection) {
                    if (originalConn.path) {
                        connection.path = originalConn.path.map(p => ({x: p.x, y: p.y}));
                    }
                    if (originalConn.points) {
                        connection.points = originalConn.points.map(p => ({x: p.x, y: p.y}));
                    }
                }
            }
        }
        
        // Restaurar hubs originais dos recursos
        const originalResourceHubs = getOriginalAreaResourceHubsBeforeRotation();
        if (originalResourceHubs && originalResourceHubs.size > 0) {
            for (const [resourceId, originalHubs] of originalResourceHubs) {
                const currentHubs = getHubsForResource(resourceId) || [];
                for (const hub of currentHubs) {
                    const originalHub = originalHubs.find(h => h.id === hub.id);
                    if (originalHub) {
                        hub.localX = originalHub.localX;
                        hub.localY = originalHub.localY;
                        hub.normalX = originalHub.normalX;
                        hub.normalY = originalHub.normalY;
                    }
                }
            }
        }
        
        // Restaurar aberturas originais
        const originalOpeningsRestore = getOriginalAreaOpeningsBeforeRotation();
        if (originalOpeningsRestore && originalOpeningsRestore.length > 0) {
            for (const originalOp of originalOpeningsRestore) {
                const opening = allOpenings.find(o => o.id === originalOp.id);
                if (opening) {
                    opening.startPoint[0] = originalOp.startPoint[0];
                    opening.startPoint[1] = originalOp.startPoint[1];
                    opening.endPoint[0] = originalOp.endPoint[0];
                    opening.endPoint[1] = originalOp.endPoint[1];
                    if (originalOp.outwardNormal && opening.outwardNormal) {
                        opening.outwardNormal.x = originalOp.outwardNormal.x;
                        opening.outwardNormal.y = originalOp.outwardNormal.y;
                    }
                }
            }
        }
        
        canvas.style.cursor = 'grabbing';
        drawAll();
        return;
    }
    
    // Aplicar rotação aos vértices
    const cos = Math.cos(deltaAngle);
    const sin = Math.sin(deltaAngle);
    
    editingArea.vertices = originalVertices.map(([vx, vy]) => {
        const relX = vx - center.x;
        const relY = vy - center.y;
        return [
            center.x + relX * cos - relY * sin,
            center.y + relX * sin + relY * cos
        ];
    });
    
    // Atualizar rings se existirem
    if (editingArea.rings && editingArea.rings.length > 0) {
        editingArea.rings[0] = editingArea.vertices;
    }
    
    // Atualizar propriedades da área
    syncAreaCoordinates(editingArea);
    
    // === ROTAÇÃO EM TEMPO REAL DOS ITENS INDEXADOS À ÁREA ===
    
    // Rotacionar recursos em tempo real
    const originalResources = getOriginalAreaResourcesBeforeRotation();
    if (originalResources && originalResources.length > 0) {
        for (const originalResource of originalResources) {
            const resource = resources.find(r => r.id === originalResource.id);
            if (resource && originalResource.vertices) {
                // Rotacionar vértices a partir das posições originais
                resource.vertices = originalResource.vertices.map(([vx, vy]) => {
                    const relX = vx - center.x;
                    const relY = vy - center.y;
                    return [
                        center.x + relX * cos - relY * sin,
                        center.y + relX * sin + relY * cos
                    ];
                });
            }
        }
    }
    
    // Rotacionar hubs dos recursos em tempo real
    const originalResourceHubs = getOriginalAreaResourceHubsBeforeRotation();
    if (originalResourceHubs && originalResourceHubs.size > 0) {
        for (const [resourceId, originalHubs] of originalResourceHubs) {
            const resource = resources.find(r => r.id === resourceId);
            if (!resource) continue;
            
            const currentHubs = getHubsForResource(resourceId) || [];
            const oldCentroid = calculatePolygonCentroid(
                originalResources.find(r => r.id === resourceId)?.vertices || resource.vertices
            );
            const newCentroid = calculatePolygonCentroid(resource.vertices);
            
            for (const hub of currentHubs) {
                const originalHub = originalHubs.find(h => h.id === hub.id);
                if (!originalHub) continue;
                
                // Converter posição local original para world usando centroide antigo
                const worldX = oldCentroid.x + originalHub.localX;
                const worldY = oldCentroid.y + originalHub.localY;
                
                // Rotacionar posição world
                const rotatedWorldX = center.x + (worldX - center.x) * cos - (worldY - center.y) * sin;
                const rotatedWorldY = center.y + (worldX - center.x) * sin + (worldY - center.y) * cos;
                
                // Converter de volta para local usando novo centroide
                hub.localX = rotatedWorldX - newCentroid.x;
                hub.localY = rotatedWorldY - newCentroid.y;
            }
        }
    }
    
    // Rotacionar paredes em tempo real
    const originalWalls = getOriginalAreaWallsBeforeRotation();
    if (originalWalls && originalWalls.length > 0) {
        for (const originalWall of originalWalls) {
            const wall = walls.find(w => w.id === originalWall.id);
            if (wall) {
                // Rotacionar ponto inicial
                const startRelX = originalWall.startPoint[0] - center.x;
                const startRelY = originalWall.startPoint[1] - center.y;
                wall.startPoint[0] = center.x + startRelX * cos - startRelY * sin;
                wall.startPoint[1] = center.y + startRelX * sin + startRelY * cos;
                
                // Rotacionar ponto final
                const endRelX = originalWall.endPoint[0] - center.x;
                const endRelY = originalWall.endPoint[1] - center.y;
                wall.endPoint[0] = center.x + endRelX * cos - endRelY * sin;
                wall.endPoint[1] = center.y + endRelX * sin + endRelY * cos;
                
                // Atualizar ângulo da parede
                if (originalWall.angle !== undefined) {
                    wall.angle = originalWall.angle + deltaAngle;
                    // Normalizar para -PI a PI
                    while (wall.angle > Math.PI) wall.angle -= 2 * Math.PI;
                    while (wall.angle < -Math.PI) wall.angle += 2 * Math.PI;
                }
            }
        }
    }
    
    // Rotacionar conexões em tempo real
    const originalConnections = getOriginalAreaConnectionsBeforeRotation();
    if (originalConnections && originalConnections.length > 0) {
        const allConnections = getConnections();
        for (const originalConn of originalConnections) {
            const connection = allConnections.find(c => c.id === originalConn.id);
            if (connection) {
                // Rotacionar path
                if (originalConn.path && originalConn.path.length > 0) {
                    connection.path = originalConn.path.map(point => ({
                        x: center.x + (point.x - center.x) * cos - (point.y - center.y) * sin,
                        y: center.y + (point.x - center.x) * sin + (point.y - center.y) * cos
                    }));
                }
                
                // Rotacionar points (legado)
                if (originalConn.points && originalConn.points.length > 0) {
                    connection.points = originalConn.points.map(point => ({
                        x: center.x + (point.x - center.x) * cos - (point.y - center.y) * sin,
                        y: center.y + (point.x - center.x) * sin + (point.y - center.y) * cos
                    }));
                }
            }
        }
    }
    
    // Rotacionar aberturas em tempo real
    const originalOpenings = getOriginalAreaOpeningsBeforeRotation();
    if (originalOpenings && originalOpenings.length > 0) {
        for (const originalOp of originalOpenings) {
            const opening = allOpenings.find(o => o.id === originalOp.id);
            if (opening) {
                // Rotacionar ponto inicial a partir do original
                const startRelX = originalOp.startPoint[0] - center.x;
                const startRelY = originalOp.startPoint[1] - center.y;
                opening.startPoint[0] = center.x + startRelX * cos - startRelY * sin;
                opening.startPoint[1] = center.y + startRelX * sin + startRelY * cos;
                
                // Rotacionar ponto final a partir do original
                const endRelX = originalOp.endPoint[0] - center.x;
                const endRelY = originalOp.endPoint[1] - center.y;
                opening.endPoint[0] = center.x + endRelX * cos - endRelY * sin;
                opening.endPoint[1] = center.y + endRelX * sin + endRelY * cos;
                
                // Rotacionar outwardNormal se existir
                if (originalOp.outwardNormal && opening.outwardNormal) {
                    const nx = originalOp.outwardNormal.x;
                    const ny = originalOp.outwardNormal.y;
                    opening.outwardNormal.x = nx * cos - ny * sin;
                    opening.outwardNormal.y = nx * sin + ny * cos;
                }
            }
        }
    }
    
    canvas.style.cursor = 'grabbing';
    drawAll();
}

/**
 * Manipula o movimento durante hover
 */
function handleHoverMove(pos) {
    const hoveredArea = getAreaAtPos(pos);
    const activeTool = getCurrentTool();
    
    // Detectar hover sobre handles PPT de recursos em edição
    if (getIsEditingResourcePolygon()) {
        const handledByPPT = handleResourcePPTHover(pos);
        if (handledByPPT) {
            // Limpar cotas virtuais
            if (getIsAreaHoverActive()) {
                setHoveredAreaVirtualDimensions(null);
                setIsAreaHoverActive(false);
            }
            return;
        }
    }
    
    // Detectar hover sobre arestas de zona de exclusão em edição
    if (handleExclusionEdgeHover(pos)) {
        const cursor = getExclusionEdgeCursor();
        if (cursor) getCanvas().style.cursor = cursor;
        return;
    }
    
    // Detectar hover sobre handles de resize de zona de exclusão selecionada
    const selEZId = getSelectedExclusionZoneId();
    if (selEZId) {
        const selEZ = exclusionZones.find(z => z.id === selEZId);
        if (selEZ) {
            const handle = getExclusionZoneHandleAtPos(pos.x, pos.y, selEZ, getScale());
            if (handle) {
                getCanvas().style.cursor = getExclusionZoneHandleCursor(handle);
                return;
            }
        }
    }
    
    // Detectar hover sobre áreas para cotas virtuais
    const shouldShowHoverDimensions = hoveredArea && !isDragging && !isDrawing && 
                                    (getDraggingMidpointIndex() === null || getDraggingMidpointIndex() === -1) &&
                                    (activeTool !== 'createAreaBtn' && activeTool !== 'createOpeningBtn' && 
                                     !(activeTool === 'createResourceBtn' && getIsDrawingResource())) &&
                                    (activeTool !== 'createWallBtn' || !isDrawingWall);
    
    if (shouldShowHoverDimensions) {
        const hoverDimensions = virtualDimensionsSystem.calculateAreaHoverDimensions([pos.x, pos.y], hoveredArea);
        const currentDimensions = getHoveredAreaVirtualDimensions();
        const hasChanged = !currentDimensions || 
                         currentDimensions.length !== hoverDimensions.length ||
                         JSON.stringify(currentDimensions) !== JSON.stringify(hoverDimensions);
        
        if (hasChanged) {
            setHoveredAreaVirtualDimensions(hoverDimensions);
            setIsAreaHoverActive(true);
            drawAll(false);
        }
    } else if (activeTool === 'createWallBtn' && !isDrawingWall && !isDragging && !isDrawing) {
        const wallHoverDimensions = virtualDimensionsSystem.calculateWallToolHoverDimensions([pos.x, pos.y]);
        const currentDimensions = getHoveredAreaVirtualDimensions();
        const hasChanged = !currentDimensions || 
                         currentDimensions.length !== wallHoverDimensions.length ||
                         JSON.stringify(currentDimensions) !== JSON.stringify(wallHoverDimensions);
        
        // Calcular preview de snap na parede mais próxima
        calculateWallSnapPreview(pos.x, pos.y);
        
        if (hasChanged) {
            setHoveredAreaVirtualDimensions(wallHoverDimensions);
            setIsAreaHoverActive(true);
            drawAll(false);
        }
    } else {
        if (getIsAreaHoverActive()) {
            setHoveredAreaVirtualDimensions(null);
            setIsAreaHoverActive(false);
            drawAll(false);
        }
    }
    
    // Atualizar cursor baseado no contexto
    updateCursorForTool(activeTool, pos, hoveredArea);
    
    // Detectar hover sobre handles de parede em edição
    if (getIsEditingWall() && !isDragging) {
        const editingWallId = getEditingWallId();
        const wall = walls.find(w => w.id === editingWallId);
        if (wall) {
            const handle = isPointOnWallHandle(pos.x, pos.y, wall);
            if (handle) {
                getCanvas().style.cursor = 'pointer';
                return;
            }
        }
    }
    
    // Detectar hover sobre hubs (PRIORIDADE MÁXIMA)
    const hoveredHub = getHubAtPosition(pos.x, pos.y);
    const currentHoveredHubId = getHoveredHubId();
    
    if (hoveredHub) {
        // SEMPRE limpar hover de recurso quando sobre um hub (prioridade máxima)
        const currentResourceHover = getHoveredResourceId();
        if (currentResourceHover) {
            setHoveredResourceId(null);
        }
        
        if (currentHoveredHubId !== hoveredHub.id) {
            setHoveredHubId(hoveredHub.id);
            drawAll();
        } else if (currentResourceHover) {
            // Redesenhar se limpou hover de recurso
            drawAll();
        }
        getCanvas().style.cursor = 'pointer';
        return; // Hub tem prioridade - não verificar recursos ou conexões
    } else if (currentHoveredHubId) {
        // Limpar hover de hub se não está mais sobre um
        setHoveredHubId(null);
        drawAll();
    }
    
    // Detectar hover sobre recursos (PRIORIDADE SECUNDÁRIA)
    const hoveredResource = findResourceAtPosition(pos.x, pos.y);
    const currentHoveredResourceId = getHoveredResourceId();
    
    if (hoveredResource) {
        if (currentHoveredResourceId !== hoveredResource.id) {
            setHoveredResourceId(hoveredResource.id);
            drawAll();
        }
        getCanvas().style.cursor = 'move';
        return; // Recurso encontrado - não verificar conexões
    } else if (currentHoveredResourceId) {
        // Limpar hover de recurso se não está mais sobre um
        setHoveredResourceId(null);
        drawAll();
    }
    
    // Detectar hover sobre zonas de exclusão standalone
    const hoveredExclZone = findStandaloneExclusionZoneAtPoint(pos.x, pos.y);
    const currentHoveredExclZoneId = getHoveredExclusionZoneId();
    
    if (hoveredExclZone) {
        if (currentHoveredExclZoneId !== hoveredExclZone.id) {
            setHoveredExclusionZoneId(hoveredExclZone.id);
            drawAll();
        }
        getCanvas().style.cursor = 'pointer';
        return;
    } else if (currentHoveredExclZoneId) {
        setHoveredExclusionZoneId(null);
        drawAll();
    }
    
    // Detectar hover sobre conexões
    updateConnectionHover(pos);
}

/**
 * Manipula o evento mouseup
 */
function handleMouseUp(e) {
    const canvas = getCanvas();
    
    // Tratamento do botão direito: pan ou context menu
    if (e.button === 2) {
        const wasPanning = isPanning;
        const didDrag = getDidRightMouseDrag();
        
        // Parar pan se estava ativo
        if (wasPanning) {
            setIsPanning(false);
        }
        setIsRightMouseDown(false);
        
        if (didDrag) {
            // Houve drag - era pan, apenas restaurar cursor
            const pos = getMousePos(e);
            updateCursorForTool(getCurrentTool(), pos, getAreaAtPos(pos));
        } else {
            // Não houve drag - abrir context menu
            handleContextMenu(e);
        }
        
        setDidRightMouseDrag(false);
        return;
    }
    
    if (isPanning) {
        setIsPanning(false);
        const pos = getMousePos(e);
        updateCursorForTool(getCurrentTool(), pos, getAreaAtPos(pos));
        return;
    }
    
    // Handle wall editing drag end
    if (isDragging && getIsEditingWall() && getEditingWallHandle()) {
        setIsDragging(false);
        setEditingWallHandle(null);
        saveStateToHistory('Editar parede');
        const pos = getMousePos(e);
        updateCursorForTool(getCurrentTool(), pos, getAreaAtPos(pos));
        return;
    }
    
    if (e.button === 0) { // Botão esquerdo
        // Handle exclusion edge drag end
        if (handleExclusionEdgeMouseUp()) {
            return;
        }
        
        const pos = getMousePos(e);
        const tool = getCurrentTool();
        
        if (isDrawing && tool === 'createAreaBtn') {
            handleCreateAreaMouseUp(pos);
        } else if (isDrawingWall && tool === 'createWallBtn') {
            handleCreateWallMouseUp(pos);
        } else if (getIsDrawingResource() && tool === 'createResourceBtn') {
            handleCreateResourceMouseUp(pos);
        } else if (getIsConnectionMousePressed() && tool === 'createConnectionBtn') {
            handleCreateConnectionMouseUp(pos);
        } else if (getIsDrawingStair() && tool === 'createStairBtn') {
            handleCreateStairMouseUp(pos);
        } else if (getIsDrawingFreeLine() && tool === 'createFreeLineBtn') {
            handleCreateFreeLineMouseUp(pos);
        } else if (getIsDraggingExclusionZone()) {
            setIsDraggingExclusionZone(false);
            setExclusionZoneDragOffset(null);
            setExclusionZoneOriginalStart(null);
            setExclusionZoneOriginalEnd(null);
            canvas.style.cursor = 'default';
            saveStateToHistory('Mover zona de exclusão');
            drawAll();
        } else if (getActiveExclusionZoneResizeHandle()) {
            setActiveExclusionZoneResizeHandle(null);
            setExclusionZoneOriginalStart(null);
            setExclusionZoneOriginalEnd(null);
            canvas.style.cursor = 'default';
            saveStateToHistory('Redimensionar zona de exclusão');
            drawAll();
        } else if (isDragging) {
            handleDragMouseUp();
        } else if (getActiveResizeHandle() !== null) {
            handlePPTResizeMouseUp();
        } else if (getIsRotatingArea()) {
            handlePPTRotationMouseUp();
        } else if (getActiveResourceResizeHandle() !== null) {
            handleResourcePPTResizeMouseUp();
        } else if (getIsRotatingResource()) {
            handleResourcePPTRotationMouseUp();
        } else if (getDraggingMidpointIndex() !== null && getDraggingMidpointIndex() !== -1) {
            handleMidpointMouseUp();
        }
    }
}

/**
 * Manipula o mouseup durante criação de área
 */
function handleCreateAreaMouseUp(pos) {
    const canvas = getCanvas();
    
    const finalX = currentRect.width < 0 ? currentRect.x + currentRect.width : currentRect.x;
    const finalY = currentRect.height < 0 ? currentRect.y + currentRect.height : currentRect.y;
    const finalWidth = Math.abs(currentRect.width);
    const finalHeight = Math.abs(currentRect.height);
    
    const snapped = snapToGrid(finalX, finalY);
    const snappedW = Math.round(finalWidth / gridSpacingPx) * gridSpacingPx;
    const snappedH = Math.round(finalHeight / gridSpacingPx) * gridSpacingPx;
    
    if (snappedW > 10 && snappedH > 10) {
        const newVertices = rectangleToVertices(snapped.x, snapped.y, snappedW, snappedH);
        const hasOverlap = movementAreas.some(area => 
            checkOverlap(newVertices, area.vertices)
        );
        
        if (!hasOverlap) {
            const newArea = {
                id: window.nextAreaId,
                x: snapped.x,
                y: snapped.y,
                width: snappedW,
                height: snappedH,
                vertices: newVertices,
                rings: null,
                locked: false,
                showDimensions: true
            };
            saveStateToHistory('Criar área');
            movementAreas.push(newArea);
            window.nextAreaId = window.nextAreaId + 1;
            setSelectedAreaId(newArea.id);
            
            ensureAreaHasNavMesh(newArea);
            refreshNavMeshOptions();
            invalidateNavigationGraph();
            
            // Notificar o sistema de mudança de layout
            layoutChangeNotifier.notifyChange('area', { action: 'create', entity: newArea });
        } else {
            alert("Sobreposição com área existente");
        }
    }
    
    setIsDrawing(false);
    currentRect.x = 0;
    currentRect.y = 0;
    currentRect.width = 0;
    currentRect.height = 0;
    canvas.style.cursor = 'default';
    drawAll();
}

/**
 * Manipula o mouseup durante arraste de midpoint
 */
function handleMidpointMouseUp() {
    const canvas = getCanvas();
    
    setDraggingMidpointIndex(-1);
    setOriginalVerticesOnDrag([]);
    
    if (getIsAreaHoverActive()) {
        setHoveredAreaVirtualDimensions(null);
        setIsAreaHoverActive(false);
    }
    
    canvas.style.cursor = 'default';
    drawAll();
}

/**
 * Manipula o mouseup durante redimensionamento estilo PowerPoint
 */
function handlePPTResizeMouseUp() {
    const canvas = getCanvas();
    const editingArea = movementAreas.find(a => a.id === getEditingAreaId());
    
    if (editingArea) {
        // Atualizar NavMesh após redimensionamento
        ensureAreaHasNavMesh(editingArea);
        invalidateNavigationGraph();
        
        // Notificar o sistema de mudança de layout
        layoutChangeNotifier.notifyChange('area', { action: 'resize', entity: editingArea });
    }
    
    setActiveResizeHandle(null);
    setOriginalVerticesOnDrag([]);
    
    if (getIsAreaHoverActive()) {
        setHoveredAreaVirtualDimensions(null);
        setIsAreaHoverActive(false);
    }
    
    canvas.style.cursor = 'default';
    drawAll();
}

/**
 * Manipula o mouseup durante rotação estilo PowerPoint
 */
async function handlePPTRotationMouseUp() {
    const canvas = getCanvas();
    const editingArea = movementAreas.find(a => a.id === getEditingAreaId());
    const rotationAngle = getCurrentRotationAngle();
    const center = getRotationCenter();
    
    if (editingArea && center && Math.abs(rotationAngle) > 0.001) {
        // Os elementos já foram rotacionados em tempo real durante o drag
        // Agora só precisamos atualizar propriedades e garantir consistência

        // Atualizar resource.rotation dos recursos da área (usado para renderizar imagem colada)
        const rotationAngleDeg = rotationAngle * 180 / Math.PI;
        const areaResources = resources.filter(r => r.parentAreaId === editingArea.id);
        for (const res of areaResources) {
            res.rotation = ((res.rotation || 0) + rotationAngleDeg) % 360;
        }
        
        // Atualizar NavMesh após rotação
        ensureAreaHasNavMesh(editingArea);
        invalidateNavigationGraph();
        
        // Notificar o sistema de mudança de layout
        layoutChangeNotifier.notifyChange('area', { action: 'rotate', entity: editingArea });
    }
    
    setIsRotatingArea(false);
    setRotationStartAngle(0);
    setRotationCenter(null);
    setVerticesBeforeRotation(null);
    setCurrentRotationAngle(0);
    
    // Limpar estados dos itens indexados
    setOriginalAreaResourcesBeforeRotation(null);
    setOriginalAreaWallsBeforeRotation(null);
    setOriginalAreaConnectionsBeforeRotation(null);
    setOriginalAreaResourceHubsBeforeRotation(null);
    setOriginalAreaOpeningsBeforeRotation(null);
    
    if (getIsAreaHoverActive()) {
        setHoveredAreaVirtualDimensions(null);
        setIsAreaHoverActive(false);
    }
    
    canvas.style.cursor = 'default';
    drawAll();
}

/**
 * Manipula o evento de double-click
 */
function handleDoubleClick(e) {
    // Duplo clique não é mais usado para finalizar conexões
}

/**
 * Manipula o evento mouseleave
 */
function handleMouseLeave(e) {
    const canvas = getCanvas();
    
    // Limpar estado de right-click pan
    if (isRightMouseDown) {
        setIsRightMouseDown(false);
        setDidRightMouseDrag(false);
    }
    
    if (isPanning) {
        setIsPanning(false);
        const pos = getMousePos(e);
        updateCursorForTool(getCurrentTool(), pos, getAreaAtPos(pos));
    }

    if (getIsDrawingStair()) {
        resetStairDrawingState();
        canvas.style.cursor = 'default';
        drawAll();
    }
    
    if (isDrawing) {
        setIsDrawing(false);
        currentRect.x = 0;
        currentRect.y = 0;
        currentRect.width = 0;
        currentRect.height = 0;
        drawAll();
    }
    
    if (isDragging) {
        setIsDragging(false);
        activeGuideLines.length = 0;
        
        const selectedResourceIds = getSelectedResourceIds();
        if (selectedResourceIds.length > 0) {
            endResourceDrag();
            setActiveGuideLines([]);
            setActiveResourceDragState(null);
        }
        
        if (getIsAreaHoverActive()) {
            setHoveredAreaVirtualDimensions(null);
            setIsAreaHoverActive(false);
        }
        
        drawAll();
    }
    
    if (getDraggingMidpointIndex() !== null && getDraggingMidpointIndex() !== -1) {
        setDraggingMidpointIndex(-1);
        setOriginalVerticesOnDrag([]);
        
        if (getIsAreaHoverActive()) {
            setHoveredAreaVirtualDimensions(null);
            setIsAreaHoverActive(false);
        }
        
        drawAll();
    }
    
    // Limpar estado de handles PPT
    if (getActiveResizeHandle() !== null) {
        setActiveResizeHandle(null);
        setOriginalVerticesOnDrag([]);
    }
    
    if (getIsRotatingArea()) {
        setIsRotatingArea(false);
        setRotationStartAngle(0);
        setRotationCenter(null);
        setVerticesBeforeRotation(null);
        setOriginalAreaOpeningsBeforeRotation(null);
    }
    
    if (getIsEditingPolygon() && getDraggingMidpointIndex() !== null && getDraggingMidpointIndex() !== -1) {
        setDraggingMidpointIndex(-1);
        setOriginalVerticesOnDrag([]);
    }
    
    if (getIsResizingOpening()) {
        stopResizingOpening();
        canvas.style.cursor = 'default';
        setTimeout(() => {
            drawAll();
        }, 20);
    }
    
    if (getIsAreaHoverActive()) {
        setHoveredAreaVirtualDimensions(null);
        setIsAreaHoverActive(false);
        drawAll();
    }
}

/**
 * Manipula o evento contextmenu
 */
function handleContextMenu(e) {
    e.preventDefault();
    const pos = getMousePos(e);
    hideContextMenu();
    
    const clickedResource = findResourceAtPosition(pos.x, pos.y);
    const clickedArea = getAreaAtPos(pos);
    const clickedWall = findWallAtPosition(pos.x, pos.y);
    const clickedConnection = getConnectionAtPosition(pos.x, pos.y);
    const clickedOpening = findOpeningAtPosition(pos.x, pos.y);
    const clickedExclusionZone = findExclusionZoneAtPoint(pos.x, pos.y);
    const clickedStandaloneExclusionZone = findStandaloneExclusionZoneAtPoint(pos.x, pos.y);
    
    if (clickedStandaloneExclusionZone && !clickedResource) {
        // Zona de exclusão standalone clicada — mostrar menu simples de exclusão
        setSelectedResourceId(null);
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedConnectionId(null);
        setSelectedExclusionZoneId(clickedStandaloneExclusionZone.id);
        drawAll();
        
        const menu = ensureContextMenuElement();
        menu.innerHTML = '';
        const item = document.createElement('div');
        item.textContent = 'Excluir Zona de Exclusão';
        item.style.padding = '8px 15px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '13px';
        item.style.fontFamily = 'Arial, sans-serif';
        item.style.whiteSpace = 'nowrap';
        item.style.color = '#333333';
        item.addEventListener('click', () => {
            saveStateToHistory('Excluir zona de exclusão');
            removeExclusionZone(clickedStandaloneExclusionZone.id);
            setSelectedExclusionZoneId(null);
            hideContextMenu();
            drawAll();
        });
        item.addEventListener('mouseenter', () => { item.style.backgroundColor = '#f0f0f0'; });
        item.addEventListener('mouseleave', () => { item.style.backgroundColor = ''; });
        menu.appendChild(item);
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
        return;
    }
    
    if (clickedExclusionZone && !clickedResource) {
        // Zona de exclusão clicada (fora do recurso)
        setSelectedResourceId(null);
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedConnectionId(null);
        
        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon()) {
            stopResourcePolygonEditing();
        }
        
        showContextMenuForExclusionZone(clickedExclusionZone, pos.x, pos.y, e);
    } else if (clickedConnection) {
        setSelectedConnectionId(clickedConnection.id);
        setSelectedResourceId(null);
        setSelectedAreaId(null);
        setSelectedWallId(null);
        
        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon()) {
            stopResourcePolygonEditing();
        }
        
        showContextMenuForConnection(clickedConnection, e.clientX, e.clientY, e);
    } else if (clickedOpening) {
        // Abertura detectada — mostrar menu de contexto da abertura
        setSelectedOpeningId(clickedOpening.id);
        setSelectedResourceId(null);
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedConnectionId(null);
        
        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon()) {
            stopResourcePolygonEditing();
        }
        
        showContextMenuForOpening(clickedOpening, pos.x, pos.y, e);
    } else if (clickedResource) {
        const alreadySelected = isResourceSelected(clickedResource.id);
        if (!alreadySelected) {
            setResourceSelection([clickedResource.id], { primaryId: clickedResource.id });
        } else {
            addResourceToSelection(clickedResource.id, { makePrimary: true });
        }
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedConnectionId(null);
        
        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon() && getEditingResourceId() !== clickedResource.id) {
            stopResourcePolygonEditing();
        }
        
        showContextMenuForResource(clickedResource, pos.x, pos.y, e);
    } else if (clickedWall) {
        setSelectedWallId(clickedWall.wall.id);
        setSelectedAreaId(null);
        setSelectedResourceId(null);
        setSelectedConnectionId(null);
        
        // Calcular sub-segmento para o menu de contexto
        const wallObj = clickedWall.wall;
        const clickPt = [pos.x, pos.y];
        const sub = computeSubSegment(wallObj, clickPt, 'wall');
        setSelectedWallSubSegment(sub);
        
        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon()) {
            stopResourcePolygonEditing();
        }
        
        showContextMenuForWall(clickedWall.wall, pos.x, pos.y, e);
    } else if (clickedArea) {
        setSelectedAreaId(clickedArea.id);
        setSelectedWallId(null);
        setSelectedResourceId(null);
        setSelectedConnectionId(null);
        
        if (getIsEditingPolygon() && getEditingAreaId() !== clickedArea.id) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon()) {
            stopResourcePolygonEditing();
        }
        
        showContextMenuForArea(clickedArea, pos.x, pos.y, e);
    } else {
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedResourceId(null);
        setSelectedConnectionId(null);
        
        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon()) {
            stopResourcePolygonEditing();
        }
    }
}

/**
 * Manipula o evento mouseup do document
 */
function handleDocumentMouseUp(e) {
    const canvas = getCanvas();
    
    // Limpar estado de right-click pan se necessário
    if (e.button === 2 && isRightMouseDown) {
        const wasPanning = isPanning;
        if (wasPanning) {
            setIsPanning(false);
        }
        setIsRightMouseDown(false);
        setDidRightMouseDrag(false);
        if (wasPanning) {
            canvas.style.cursor = 'default';
        }
    }
    
    if (getIsResizingOpening()) {
        stopResizingOpening();
        canvas.style.cursor = 'default';
        setTimeout(() => {
            drawAll();
        }, 20);
    }
    
    if (isDragging) {
        setIsDragging(false);
        activeGuideLines.length = 0;
        
        if (getIsAreaHoverActive()) {
            setHoveredAreaVirtualDimensions(null);
            setIsAreaHoverActive(false);
        }
        
        canvas.style.cursor = 'default';
        drawAll();
    }
}

// Exportar funções úteis para outros módulos
export {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleWheel,
    updateCursorForTool
};
