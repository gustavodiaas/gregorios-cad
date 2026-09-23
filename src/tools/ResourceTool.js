import { Tool } from './Tool.js';
import { 
    getCanvas, 
    getCurrentResourceRect, 
    setCurrentResourceRect, 
    setIsDrawingResource,
    getIsDrawingResource,
    movementAreas,
    setSelectedResourceId,
    isPanning
} from '../state.js';
import { getAreaAtPos, getMousePos } from '../events/mouseUtils.js';
import { drawAll } from '../drawing.js';
import { rectangleToVertices, pointInPolygon } from '../areas.js';
import { createResource, stopResourcePreview } from '../resources.js';
import { saveStateToHistory } from '../history.js';

export class ResourceTool extends Tool {
    constructor() {
        super();
        this.name = 'ResourceTool';
    }

    activate() {
        super.activate();
        // Preview logic might be needed here if it was in setActiveTool
    }

    deactivate() {
        super.deactivate();
        stopResourcePreview();
        setIsDrawingResource(false);
        const resetRect = getCurrentResourceRect();
        if (resetRect) {
            resetRect.x = 0;
            resetRect.y = 0;
            resetRect.width = 0;
            resetRect.height = 0;
            resetRect.parentAreaId = null;
            setCurrentResourceRect(resetRect);
        }
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'default';
        }
        drawAll();
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        const canvas = getCanvas();
        const pos = getMousePos(e);

        // Modo criação de recurso - iniciar clique e arrasto
        // Verificar se estamos dentro de uma área de movimentação
        const parentArea = getAreaAtPos(pos);
        if (parentArea) {
            // Iniciar desenho de recurso
            const currentRect = getCurrentResourceRect();
            currentRect.x = pos.x;
            currentRect.y = pos.y;
            currentRect.width = 0;
            currentRect.height = 0;
            currentRect.parentAreaId = parentArea.id;
            setCurrentResourceRect(currentRect);
            setIsDrawingResource(true);
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'not-allowed';
        }
        drawAll();
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;
        
        const canvas = getCanvas();
        const pos = getMousePos(e);

        if (getIsDrawingResource()) {
            const currentRect = getCurrentResourceRect();
            currentRect.width = pos.x - currentRect.x;
            currentRect.height = pos.y - currentRect.y;
            setCurrentResourceRect(currentRect);
            drawAll();
        } else {
            // Cursor update
            const parentArea = getAreaAtPos(pos);
            canvas.style.cursor = parentArea ? 'crosshair' : 'not-allowed';
        }
    }

    onMouseUp(e) {
        if (e.button !== 0) { super.onMouseUp(e); return; }
        if (!getIsDrawingResource()) return;

        const canvas = getCanvas();
        
        const currentRect = getCurrentResourceRect();
        const finalX = currentRect.width < 0 ? currentRect.x + currentRect.width : currentRect.x;
        const finalY = currentRect.height < 0 ? currentRect.y + currentRect.height : currentRect.y;
        const finalWidth = Math.abs(currentRect.width);
        const finalHeight = Math.abs(currentRect.height);
        
        if (finalWidth > 0 && finalHeight > 0) {
            const parentArea = movementAreas.find(area => area.id === currentRect.parentAreaId);
            if (parentArea) {
                const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
                const resourceVertices = rectangleToVertices(finalX, finalY, finalWidth, finalHeight);
                const allPointsInside = resourceVertices.every(vertex => {
                    return pointInPolygon(vertex, areaVertices);
                });
                
                if (allPointsInside) {
                    saveStateToHistory('Criar recurso');
                    createResource(finalX, finalY, null, finalWidth, finalHeight);
                }
            }
        }
        
        setIsDrawingResource(false);
        const resetRect = getCurrentResourceRect();
        resetRect.x = 0;
        resetRect.y = 0;
        resetRect.width = 0;
        resetRect.height = 0;
        resetRect.parentAreaId = null;
        setCurrentResourceRect(resetRect);
        canvas.style.cursor = 'default';
        drawAll();
    }
}
