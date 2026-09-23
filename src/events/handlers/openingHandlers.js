/**
 * Handlers para eventos de mouse relacionados a aberturas
 */
import { 
    getCanvas,
    setSelectedAreaId, setSelectedWallId, setSelectedFreeLineId,
    setSelectedExclusionZoneId,
    getIsCreatingOpening, setIsCreatingOpening,
    getOpeningPreviewPosition, setOpeningPreviewPosition,
    getIsEditingPolygon, setIsEditingPolygon, setEditingAreaId,
    getIsEditingResourcePolygon, getIsCtrlPressed
} from '../../state.js';
import { drawAll } from '../../drawing.js';
import { deselectAllResources, stopResourcePolygonEditing } from '../../resources.js';
import { 
    findWallAtPosition, confirmVirtualOpening, updateVirtualOpening,
    startCreatingOpening, stopCreatingOpening,
    setSelectedOpeningId as setSelectedOpeningIdFromOpenings,
    getIsCreatingOpeningFromOpenings,
    startResizingOpening, stopResizingOpening, updateResizing, getIsResizingOpening,
    findHoveredControlPoint, findHoveredControlPointGlobal, hoveredControlPoint, setHoveredControlPoint
} from '../../openings.js';

/**
 * Manipula o clique para criar abertura
 */
export function handleCreateOpeningMouseDown(pos) {
    // Modo criação de abertura
    // Se já estamos em modo de criação, confirmar a abertura virtual
    if (getIsCreatingOpening()) {
        const newOpening = confirmVirtualOpening();
        if (newOpening) {
            // Não desativar o modo - permitir criar múltiplas aberturas
        }
    } else {
        // Iniciar modo de criação de abertura - sincronizar ambos os sistemas
        startCreatingOpening(); // Sistema openings.js
        setIsCreatingOpening(true); // Sistema state.js
    }
    drawAll();
}

/**
 * Manipula o clique em abertura
 */
export function handleOpeningClick(clickedOpening) {
    setSelectedOpeningIdFromOpenings(clickedOpening.id);
    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedFreeLineId(null);
    setSelectedExclusionZoneId(null);
    deselectAllResources();
    
    if (getIsEditingPolygon()) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }
    stopResourcePolygonEditing();
    drawAll();
}

/**
 * Manipula o movimento durante criação de abertura
 */
export function handleOpeningMove(pos) {
    updateVirtualOpening(pos.x, pos.y);
    drawAll(false);
}

/**
 * Manipula o movimento durante redimensionamento de abertura
 */
export function handleResizeOpeningMove(pos) {
    const canvas = getCanvas();
    
    const resizeResult = updateResizing(pos.x, pos.y);
    if (resizeResult) {
        canvas.style.cursor = 'ew-resize';
        drawAll();
    }
}

/**
 * Manipula o cursor para ferramenta de abertura
 */
export function handleOpeningToolCursor(pos) {
    const canvas = getCanvas();
    
    // Check for Ctrl key first - show hand cursor for panning
    if (getIsCtrlPressed()) {
        canvas.style.cursor = 'grab';
        return;
    }
    
    const wallHit = findWallAtPosition(pos.x, pos.y);
    if (wallHit) {
        if (!getIsCreatingOpening()) {
            setIsCreatingOpening(true);
            if (!getIsCreatingOpeningFromOpenings()) {
                startCreatingOpening();
            }
        }
        
        const currentPreview = getOpeningPreviewPosition();
        const newPreview = {
            x: pos.x,
            y: pos.y,
            wall: wallHit.wall,
            position: wallHit.position
        };
        
        const hasChanged = !currentPreview || 
                         currentPreview.wall?.id !== newPreview.wall.id ||
                         Math.abs(currentPreview.position - newPreview.position) > 0.01;
        
        if (hasChanged) {
            setOpeningPreviewPosition(newPreview);
            drawAll();
        }
    } else {
        if (getIsCreatingOpening()) {
            setIsCreatingOpening(false);
            setOpeningPreviewPosition(null);
            if (getIsCreatingOpeningFromOpenings()) {
                stopCreatingOpening();
            }
            drawAll();
        }
    }
    
    canvas.style.cursor = wallHit ? 'crosshair' : 'not-allowed';
}

// Re-exportar funções do módulo openings para acesso fácil
export {
    findHoveredControlPoint,
    findHoveredControlPointGlobal,
    startResizingOpening,
    stopResizingOpening,
    updateResizing,
    getIsResizingOpening,
    hoveredControlPoint,
    setHoveredControlPoint
};
