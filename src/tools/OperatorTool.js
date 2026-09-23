import { Tool } from './Tool.js';
import { 
    getCanvas, 
    setSelectedResourceId,
    setSelectedAreaId,
    setSelectedWallId,
    setSelectedConnectionId,
    setSelectedFreeLineId,
    isPanning
} from '../state.js';
import { setSelectedOpeningId } from '../openings.js';
import { createOperatorAtPosition } from '../operators.js';
import { saveStateToHistory } from '../history.js';
import { drawAll } from '../drawing.js';
import { getAreaAtPos, getMousePos } from '../events/mouseUtils.js';

export class OperatorTool extends Tool {
    constructor() {
        super();
        this.name = 'OperatorTool';
    }

    activate() {
        super.activate();
        // Cursor logic handled in mouse move
    }

    deactivate() {
        super.deactivate();
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'default';
        }
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        const canvas = getCanvas();
        const pos = getMousePos(e);

        const { resource, error } = createOperatorAtPosition(pos.x, pos.y);

        if (!resource) {
            if (error === 'outside-area') {
                canvas.style.cursor = 'not-allowed';
            }
            return;
        }

        saveStateToHistory('Incluir operador');
        setSelectedResourceId(resource.id);
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedConnectionId(null);
        setSelectedFreeLineId(null);
        setSelectedOpeningId(null);
        drawAll();
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;
        
        const canvas = getCanvas();
        const pos = getMousePos(e);

        const parentArea = getAreaAtPos(pos);
        canvas.style.cursor = parentArea ? 'crosshair' : 'not-allowed';
    }

    onMouseUp(e) {
        super.onMouseUp(e);
        // No specific mouse up action
    }
}
