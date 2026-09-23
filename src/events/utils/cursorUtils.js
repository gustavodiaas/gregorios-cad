/**
 * Utilitários para gerenciamento de cursor baseado em contexto
 */
import { 
    walls, selectedAreaId, movementAreas, resources,
    getCanvas, getScale,
    getIsEditingWall, getEditingWallId,
    getIsEditingPolygon, getEditingAreaId,
    getIsEditingResourcePolygon, getEditingResourceId,
    getSelectedResourceId, getHoveredResourceId, setHoveredResourceId,
    getHoveredWallId, setHoveredWallId,
    getHoveredMidpointIndex, setHoveredMidpointIndex,
    getHoveredFreeLineId, setHoveredFreeLineId,
    getIsCtrlPressed, isDragging, isDrawing,
    getHoveredResizeHandle, setHoveredResizeHandle
} from '../../state.js';
import { drawAll } from '../../drawing.js';
import { 
    findResourceAtPosition, migrateResourceToPolygonal 
} from '../../resources.js';
import { findWallAtPos } from '../mouseUtils.js';
import { findFreeLineAtPosition } from '../../free-lines.js';
import { isPointOnWallHandle, getWallHandleCursor } from '../../walls.js';
import { getMidpointAtPos, getMidpointCursor, getHandleAtPos, getHandleCursor } from '../../polygon.js';
import { getResourceMidpointAtPos, getResourceMidpointCursor } from '../../resource-polygon.js';
import { findHoveredControlPoint, hoveredControlPoint, setHoveredControlPoint } from '../../openings.js';
import { handleAreaCursor } from '../handlers/areaHandlers.js';
import { handleWallToolCursor } from '../handlers/wallHandlers.js';
import { handleOpeningToolCursor } from '../handlers/openingHandlers.js';

/**
 * Atualiza o cursor baseado na ferramenta ativa
 */
export function updateCursorForTool(activeTool, pos, hoveredArea) {
    const canvas = getCanvas();
    
    // Check for Ctrl key first - show hand cursor for panning
    if (getIsCtrlPressed()) {
        canvas.style.cursor = 'grab';
        return;
    }
    
    // Check for wall editing mode
    if (getIsEditingWall()) {
        canvas.style.cursor = 'default';
        return;
    }
    
    if (activeTool === 'createAreaBtn') {
        canvas.style.cursor = 'crosshair';
    } else if (activeTool === 'createWallBtn') {
        handleWallToolCursor(pos);
    } else {
        handleDefaultCursor(pos, hoveredArea, activeTool);
    }
}

/**
 * Manipula o cursor padrão (quando nenhuma ferramenta específica está ativa)
 */
export function handleDefaultCursor(pos, hoveredArea, activeTool) {
    const canvas = getCanvas();

    if (getIsCtrlPressed()) {
        canvas.style.cursor = 'grab';
        return;
    }

    const hoveredControl = findHoveredControlPoint(pos.x, pos.y);
    if (hoveredControl !== hoveredControlPoint) {
        setHoveredControlPoint(hoveredControl);
        drawAll();
    }

    if (hoveredControl) {
        canvas.style.cursor = 'ew-resize';
        return;
    }

    const hoveredResource = findResourceAtPosition(pos.x, pos.y);
    const hoveredWall = findWallAtPos(pos.x, pos.y);
    const hoveredFreeLine = findFreeLineAtPosition(pos.x, pos.y);

    // Atualizar estado de hover para recursos
    if (hoveredResource && hoveredResource.id !== getHoveredResourceId()) {
        setHoveredResourceId(hoveredResource.id);
        drawAll();
    } else if (!hoveredResource && getHoveredResourceId()) {
        setHoveredResourceId(null);
        drawAll();
    }

    // Atualizar estado de hover para paredes
    if (hoveredWall && hoveredWall.id !== getHoveredWallId()) {
        setHoveredWallId(hoveredWall.id);
        drawAll();
    } else if (!hoveredWall && getHoveredWallId()) {
        setHoveredWallId(null);
        drawAll();
    }

    // Atualizar estado de hover para linhas livres
    if (hoveredFreeLine && hoveredFreeLine.id !== getHoveredFreeLineId()) {
        setHoveredFreeLineId(hoveredFreeLine.id);
        drawAll();
    } else if (!hoveredFreeLine && getHoveredFreeLineId()) {
        setHoveredFreeLineId(null);
        drawAll();
    }

    // Lógica de cursor para recursos
    if (hoveredResource) {
        const migratedHoveredResource = migrateResourceToPolygonal(hoveredResource);
        if (getIsEditingResourcePolygon() && getEditingResourceId() === migratedHoveredResource.id) {
            const midpointIndex = getResourceMidpointAtPos(pos.x, pos.y, migratedHoveredResource);
            if (midpointIndex !== -1) {
                if (getHoveredMidpointIndex() !== midpointIndex) {
                    setHoveredMidpointIndex(midpointIndex);
                    drawAll();
                }
                canvas.style.cursor = getResourceMidpointCursor(migratedHoveredResource, midpointIndex);
            } else {
                if (getHoveredMidpointIndex() !== null) {
                    setHoveredMidpointIndex(null);
                    drawAll();
                }
                if (activeTool !== 'createConnectionBtn') {
                    canvas.style.cursor = getSelectedResourceId() === hoveredResource.id ? 'grab' : 'pointer';
                }
            }
        } else {
            if (getHoveredMidpointIndex() !== null && !getIsEditingPolygon()) {
                setHoveredMidpointIndex(null);
                drawAll();
            }
            if (activeTool !== 'createConnectionBtn') {
                canvas.style.cursor = getSelectedResourceId() === hoveredResource.id ? 'grab' : 'pointer';
            }
        }
        return;
    }

    // Lógica de cursor para paredes
    if (hoveredWall) {
        if (getHoveredMidpointIndex() !== null && getIsEditingResourcePolygon()) {
            setHoveredMidpointIndex(null);
            drawAll();
        }
        if (getIsEditingWall() && getEditingWallId() === hoveredWall.id) {
            const handle = isPointOnWallHandle(pos.x, pos.y, hoveredWall);
            if (handle) {
                canvas.style.cursor = getWallHandleCursor(hoveredWall, handle);
            } else {
                canvas.style.cursor = 'pointer';
            }
        } else if (activeTool !== 'createConnectionBtn') {
            canvas.style.cursor = 'pointer';
        }
        return;
    }

    // Cursor para linhas livres
    if (hoveredFreeLine) {
        canvas.style.cursor = 'pointer';
        return;
    }

    // IMPORTANTE: Verificar handles estilo PPT mesmo quando o mouse não está sobre a área
    // (o handle de rotação fica FORA da área)
    if (getIsEditingPolygon()) {
        const editingAreaId = getEditingAreaId();
        const editingArea = movementAreas.find(a => a.id === editingAreaId);
        
        if (editingArea) {
            const handleType = getHandleAtPos(pos.x, pos.y, editingArea);
            
            if (handleType) {
                // Atualizar hover do handle
                if (getHoveredResizeHandle() !== handleType) {
                    setHoveredResizeHandle(handleType);
                    drawAll();
                }
                canvas.style.cursor = getHandleCursor(handleType, editingArea);
                return;
            } else {
                // Limpar hover se não está sobre nenhum handle
                if (getHoveredResizeHandle() !== null) {
                    setHoveredResizeHandle(null);
                    drawAll();
                }
            }
        }
    }

    // Cursor para áreas
    if (hoveredArea && !hoveredArea.locked) {
        handleAreaCursor(pos, hoveredArea, { getIsCtrlPressed, getCurrentTool: () => activeTool });
    } else {
        if (getHoveredMidpointIndex() !== null) {
            setHoveredMidpointIndex(null);
            drawAll();
        }
        if (activeTool !== 'createConnectionBtn') {
            canvas.style.cursor = 'default';
        }
    }
}
