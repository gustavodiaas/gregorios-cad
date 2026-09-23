/**
 * Handlers para eventos de mouse relacionados a pan e zoom
 */
import { 
    getCanvas, isPanning, panStart,
    setIsPanning, setPanStart,
    getScale, setScale, getOffsetXCanvas, setOffsetXCanvas, getOffsetYCanvas, setOffsetYCanvas
} from '../../state.js';
import { drawAll } from '../../drawing.js';

/**
 * Manipula o movimento durante pan
 */
export function handlePanMove(e) {
    const deltaX = e.clientX - panStart.x;
    const deltaY = e.clientY - panStart.y;
    setOffsetXCanvas(getOffsetXCanvas() + deltaX);
    setOffsetYCanvas(getOffsetYCanvas() + deltaY);
    setPanStart({ x: e.clientX, y: e.clientY });
    drawAll();
}

/**
 * Manipula o evento wheel (zoom e pan)
 */
export function handleWheel(e) {
    const canvas = getCanvas();
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    if (e.ctrlKey) {
        // Zoom
        const worldXBeforeZoom = (mouseX - getOffsetXCanvas()) / getScale();
        const worldYBeforeZoom = (mouseY - getOffsetYCanvas()) / getScale();
        const zoomFactor = 1.1;
        const newScale = e.deltaY < 0 ? getScale() * zoomFactor : getScale() / zoomFactor;
        const clampedScale = Math.max(0.1, Math.min(5, newScale));
        setScale(clampedScale);
        
        const newOffsetX = mouseX - worldXBeforeZoom * clampedScale;
        const newOffsetY = mouseY - worldYBeforeZoom * clampedScale;
        setOffsetXCanvas(newOffsetX);
        setOffsetYCanvas(newOffsetY);
        
        // Atualizar indicador de zoom
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(clampedScale * 100)}%`;
        }
    } else {
        // Pan
        const panSpeed = 20;
        if (e.shiftKey) {
            setOffsetXCanvas(getOffsetXCanvas() - (e.deltaY > 0 ? panSpeed : -panSpeed));
        } else {
            setOffsetXCanvas(getOffsetXCanvas() - e.deltaX);
            setOffsetYCanvas(getOffsetYCanvas() - (e.deltaY > 0 ? panSpeed : -panSpeed));
        }
    }
    
    drawAll();
}

/**
 * Inicia o modo de pan
 */
export function startPanning(e) {
    const canvas = getCanvas();
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    canvas.style.cursor = 'grabbing';
}

/**
 * Para o modo de pan
 */
export function stopPanning() {
    setIsPanning(false);
}
