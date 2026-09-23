/**
 * Handlers para eventos de mouse relacionados a escadas
 */
import { 
    getCanvas,
    getIsDrawingStair, setIsDrawingStair,
    getCurrentStairRect, setCurrentStairRect
} from '../../state.js';
import { saveStateToHistory } from '../../history.js';
import { drawAll } from '../../drawing.js';
import { createStairFromRect, resetStairDrawingState } from '../../stairs.js';
import { getAreaAtPos } from '../mouseUtils.js';

/**
 * Manipula o clique para criar escada
 */
export function handleCreateStairMouseDown(pos) {
    const canvas = getCanvas();
    const parentArea = getAreaAtPos(pos);

    if (!parentArea) {
        canvas.style.cursor = 'not-allowed';
        return;
    }

    const stairRect = getCurrentStairRect();
    stairRect.x = pos.x;
    stairRect.y = pos.y;
    stairRect.width = 0;
    stairRect.height = 0;
    stairRect.parentAreaId = parentArea.id;
    setCurrentStairRect(stairRect);
    setIsDrawingStair(true);
    canvas.style.cursor = 'crosshair';
    drawAll();
}

/**
 * Manipula o movimento durante criação de escada
 */
export function handleCreateStairMove(pos) {
    const stairRect = getCurrentStairRect();
    stairRect.width = pos.x - stairRect.x;
    stairRect.height = pos.y - stairRect.y;
    setCurrentStairRect(stairRect);
    drawAll(false);
}

/**
 * Manipula o mouseup durante criação de escada
 */
export function handleCreateStairMouseUp(pos) {
    const canvas = getCanvas();
    const stairRect = getCurrentStairRect();

    stairRect.width = pos.x - stairRect.x;
    stairRect.height = pos.y - stairRect.y;
    const finalX = stairRect.width < 0 ? stairRect.x + stairRect.width : stairRect.x;
    const finalY = stairRect.height < 0 ? stairRect.y + stairRect.height : stairRect.y;
    const finalWidth = Math.abs(stairRect.width);
    const finalHeight = Math.abs(stairRect.height);

    const centerPos = { x: finalX + finalWidth / 2, y: finalY + finalHeight / 2 };
    const parentArea = getAreaAtPos(centerPos);
    if (parentArea) {
        stairRect.parentAreaId = parentArea.id;
    }

    setCurrentStairRect(stairRect);

    const creationResult = createStairFromRect(stairRect);
    if (creationResult) {
        saveStateToHistory('Criar escada');
    }

    resetStairDrawingState();
    canvas.style.cursor = 'default';
    drawAll();
}
