import {
    isPanning, setIsPanning, setPanStart, getCanvas,
    isRightMouseDown, setIsRightMouseDown, setRightMouseStartPos, getRightMouseStartPos,
    setDidRightMouseDrag, getDidRightMouseDrag, getRightClickDragThreshold
} from '../state.js';
import { handlePanMove } from '../events/handlers/panZoomHandlers.js';

export class Tool {
    constructor() {
        this.name = 'Tool';
    }

    activate() {
    }

    deactivate() {
    }

    onMouseDown(e) {
        // Right click - iniciar tracking para pan
        if (e.button === 2) {
            setIsRightMouseDown(true);
            setRightMouseStartPos({ x: e.clientX, y: e.clientY });
            setDidRightMouseDrag(false);
        }
    }

    onMouseMove(e) {
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
        }
    }

    onMouseUp(e) {
        if (e.button === 2) {
            const canvas = getCanvas();
            if (isPanning) {
                setIsPanning(false);
            }
            setIsRightMouseDown(false);
            setDidRightMouseDrag(false);
            canvas.style.cursor = 'default';
        }
        
        // Middle button pan end
        if (isPanning && e.button === 1) {
            setIsPanning(false);
            const canvas = getCanvas();
            canvas.style.cursor = 'default';
        }
    }

    onKeyDown(e) {}
    onKeyUp(e) {}
    onWheel(e) {}
    
    onContextMenu(e) {
        e.preventDefault();
    }
}
