import { Tool } from './Tool.js';
import { getMousePos, getAreaAtPos } from '../events/mouseUtils.js';
import { isPointInAreaWithTolerance } from '../events.js';
import { 
    getIsDrawingWall, setIsDrawingWall, getWallStartPoint, setWallStartPoint, 
    setWallPreviewEnd, getLastSnapPoint, setLastSnapPoint,
    movementAreas, getCanvas, walls, isPanning
} from '../state.js';
import { 
    createWall, findSnapPointWithSmartSnap, drawSnapIndicators,
    calculateWallSnapPreview 
} from '../walls.js';
import { virtualDimensionsSystem } from '../virtual-dimensions.js';
import { clearWallSnapPreview } from '../state.js';
import { wallAreaBorderTolerance, wallMinLength, pixelsPerCm } from '../config.js';
import { drawAll } from '../drawing.js';
import { saveStateToHistory } from '../history.js';
import { invalidateNavigationGraph } from '../navigation.js';

export class WallTool extends Tool {
    constructor() {
        super();
        this.name = 'WallTool';
    }

    deactivate() {
        super.deactivate();
        // Limpar preview de snap ao sair da ferramenta
        clearWallSnapPreview();
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        const pos = getMousePos(e);
        const canvas = getCanvas();

        const parentArea = getAreaAtPos(pos);
        let canCreateWall = false;

        if (parentArea) {
            canCreateWall = true;
        } else {
            for (let area of movementAreas) {
                if (isPointInAreaWithTolerance([pos.x, pos.y], area, wallAreaBorderTolerance)) {
                    canCreateWall = true;
                    break;
                }
            }
        }

        if (!canCreateWall) {
            canvas.style.cursor = 'not-allowed';
            return;
        }

        const smartSnapResult = findSnapPointWithSmartSnap(pos.x, pos.y);
        const startPoint = smartSnapResult ? smartSnapResult.point : [pos.x, pos.y];
        setWallStartPoint([...startPoint]);
        setIsDrawingWall(true);
        setWallPreviewEnd([...startPoint]);
        clearWallSnapPreview();
        canvas.style.cursor = 'crosshair';
        drawAll();

        // Trigger a mousemove to update preview immediately
        if (e) {
            setTimeout(() => {
                const event = new MouseEvent('mousemove', {
                    clientX: e.clientX,
                    clientY: e.clientY
                });
                canvas.dispatchEvent(event);
            }, 1);
        }
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;
        
        const pos = getMousePos(e);
        const canvas = getCanvas();
        
        if (getIsDrawingWall()) {
            const snapResult = findSnapPointWithSmartSnap(pos.x, pos.y);
            const newPreviewEnd = snapResult ? snapResult.point : [pos.x, pos.y];
            
            // Check validity
            let isValidEndPoint = false;
            const startPoint = getWallStartPoint();
            for (let area of movementAreas) {
                const startInside = isPointInAreaWithTolerance(startPoint, area, wallAreaBorderTolerance);
                const endInside = isPointInAreaWithTolerance(newPreviewEnd, area, wallAreaBorderTolerance);
                
                if (startInside && endInside) {
                    isValidEndPoint = true;
                    break;
                }
            }
            
            canvas.style.cursor = isValidEndPoint ? 'crosshair' : 'not-allowed';
            setWallPreviewEnd(newPreviewEnd);
            
            virtualDimensionsSystem.calculateVirtualDimensions([pos.x, pos.y], startPoint, snapResult);
            
            if (snapResult) {
                drawSnapIndicators(snapResult);
            }
            
            // Também calcular preview de snap para mostrar divisão de cotas
            // no ponto onde o endpoint cairia na parede
            calculateWallSnapPreview(newPreviewEnd[0], newPreviewEnd[1]);
        } else {
            // Hover logic for wall tool (preview snap points)
            const parentArea = movementAreas.find(area => isPointInAreaWithTolerance([pos.x, pos.y], area, wallAreaBorderTolerance));
            canvas.style.cursor = parentArea ? 'crosshair' : 'not-allowed';
            
            const snapPoint = findSnapPointWithSmartSnap(pos.x, pos.y);
            const lastSnapPoint = getLastSnapPoint();
            
            if ((snapPoint && !lastSnapPoint) || (!snapPoint && lastSnapPoint) || 
                (snapPoint && lastSnapPoint && (snapPoint.point[0] !== lastSnapPoint.point[0] || snapPoint.point[1] !== lastSnapPoint.point[1]))) {
                setLastSnapPoint(snapPoint);
            }
            
            // Show hover dimensions
            const wallHoverDimensions = virtualDimensionsSystem.calculateWallToolHoverDimensions([pos.x, pos.y]);
            
            // Calcular preview de snap na parede mais próxima
            // Mostra ponto de interseção e cotas de divisão
            calculateWallSnapPreview(pos.x, pos.y);
        }
        drawAll();
    }

    onMouseUp(e) {
        if (e.button !== 0) { super.onMouseUp(e); return; }
        if (!getIsDrawingWall()) return;

        const pos = getMousePos(e);
        const wallStartPoint = getWallStartPoint();
        
        const snapPoint = findSnapPointWithSmartSnap(pos.x, pos.y);
        const endPoint = snapPoint ? snapPoint.point : [pos.x, pos.y];
        
        const lengthPx = Math.sqrt(Math.pow(endPoint[0] - wallStartPoint[0], 2) + 
                                 Math.pow(endPoint[1] - wallStartPoint[1], 2));
        const lengthCm = lengthPx / pixelsPerCm;
        
        if (lengthCm >= wallMinLength) {
            let parentAreaId = null;
            let startArea = null;
            let endArea = null;
            
            for (let area of movementAreas) {
                const startInside = isPointInAreaWithTolerance(wallStartPoint, area, wallAreaBorderTolerance);
                const endInside = isPointInAreaWithTolerance(endPoint, area, wallAreaBorderTolerance);
                
                if (startInside) startArea = area;
                if (endInside) endArea = area;
            }
            
            if (startArea && endArea && startArea.id === endArea.id) {
                parentAreaId = startArea.id;
            }
            
            if (parentAreaId) {
                saveStateToHistory('Criar parede');
                const newWall = createWall(wallStartPoint, endPoint, parentAreaId);
                if (newWall) {
                    walls.push(newWall);
                    
                    if (virtualDimensionsSystem) {
                        virtualDimensionsSystem.clear();
                    }
                    
                    invalidateNavigationGraph();
                }
            }
        }
        
        setIsDrawingWall(false);
        setWallStartPoint(null);
        setWallPreviewEnd(null);
        drawAll();
    }
}
