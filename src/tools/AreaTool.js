import { Tool } from './Tool.js';
import { 
    getMousePos, snapToGrid 
} from '../events/mouseUtils.js';
import { 
    getIsDrawing, setIsDrawing, getStartX, setStartX, getStartY, setStartY,
    currentRect, getCanvas,
    isPanning, setIsPanning, setPanStart,
    isRightMouseDown, setIsRightMouseDown, setRightMouseStartPos, getRightMouseStartPos,
    setDidRightMouseDrag, getDidRightMouseDrag, getRightClickDragThreshold
} from '../state.js';
import { createArea, rectangleToVertices, checkOverlap } from '../areas.js';
import { drawAll } from '../drawing.js';
import { saveStateToHistory } from '../history.js';
import { movementAreas, setSelectedAreaId } from '../state.js';
import { gridSpacingPx } from '../config.js';
import { handlePanMove } from '../events/handlers/panZoomHandlers.js';

export class AreaTool extends Tool {
    constructor() {
        super();
        this.name = 'AreaTool';
    }

    onMouseDown(e) {
        const pos = getMousePos(e);
        const canvas = getCanvas();

        if (e.button === 2) { // Right click - cancela desenho + inicia tracking para pan
            if (getIsDrawing()) {
                setIsDrawing(false);
                currentRect.x = 0;
                currentRect.y = 0;
                currentRect.width = 0;
                currentRect.height = 0;
                drawAll();
            }
            setIsRightMouseDown(true);
            setRightMouseStartPos({ x: e.clientX, y: e.clientY });
            setDidRightMouseDrag(false);
            return;
        }

        // Iniciar desenho da área (clique-arrasto-soltar, igual recursos)
        setIsDrawing(true);
        const snapped = snapToGrid(pos.x, pos.y);
        setStartX(snapped.x);
        setStartY(snapped.y);
        
        currentRect.x = snapped.x;
        currentRect.y = snapped.y;
        currentRect.width = 0;
        currentRect.height = 0;
        
        canvas.style.cursor = 'crosshair';
        drawAll();
    }

    onMouseMove(e) {
        const pos = getMousePos(e);
        const canvas = getCanvas();
        
        // Verificar se botão direito está pressionado - possível pan
        if (isRightMouseDown) {
            const startPos = getRightMouseStartPos();
            const dx = e.clientX - startPos.x;
            const dy = e.clientY - startPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (!isPanning && distance > getRightClickDragThreshold()) {
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
        
        if (getIsDrawing()) {
            const startX = getStartX();
            const startY = getStartY();
            
            // Snap the current mouse position
            const snapped = snapToGrid(pos.x, pos.y);
            
            currentRect.width = snapped.x - startX;
            currentRect.height = snapped.y - startY;
            
            drawAll();
        } else {
            canvas.style.cursor = 'crosshair';
        }
    }

    onContextMenu(e) {
        e.preventDefault();
    }

    onMouseUp(e) {
        const canvas = getCanvas();
        
        // Tratamento do botão direito: pan ou nada (AreaTool não tem context menu)
        if (e.button === 2) {
            if (isPanning) {
                setIsPanning(false);
            }
            setIsRightMouseDown(false);
            setDidRightMouseDrag(false);
            canvas.style.cursor = 'crosshair';
            return;
        }
        
        // Middle button pan end
        if (isPanning) {
            setIsPanning(false);
            canvas.style.cursor = 'crosshair';
            return;
        }
        
        // Finalizar criação da área ao soltar o mouse (igual recursos)
        if (!getIsDrawing()) {
            return;
        }

        const finalX = currentRect.width < 0 ? currentRect.x + currentRect.width : currentRect.x;
        const finalY = currentRect.height < 0 ? currentRect.y + currentRect.height : currentRect.y;
        const finalWidth = Math.abs(currentRect.width);
        const finalHeight = Math.abs(currentRect.height);
        
        const snapped = snapToGrid(finalX, finalY);
        const snappedW = Math.round(finalWidth / gridSpacingPx) * gridSpacingPx;
        const snappedH = Math.round(finalHeight / gridSpacingPx) * gridSpacingPx;

        if (snappedW > 10 && snappedH > 10) {
            saveStateToHistory('Criar área');
            const newArea = createArea(snapped.x, snapped.y, snappedW, snappedH);
            if (newArea) {
                setSelectedAreaId(newArea.id);
            }
        }
        
        setIsDrawing(false);
        currentRect.x = 0;
        currentRect.y = 0;
        currentRect.width = 0;
        currentRect.height = 0;
        
        drawAll();
    }
}
