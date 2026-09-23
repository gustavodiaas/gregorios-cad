/**
 * Handlers para eventos de mouse relacionados a paredes
 */
import { 
    walls, movementAreas, isDrawingWall, wallStartPoint,
    getCanvas, setIsDrawingWall, setWallStartPoint, setWallPreviewEnd,
    setSelectedAreaId, setSelectedWallId, setSelectedFreeLineId,
    setSelectedExclusionZoneId,
    getIsEditingPolygon, setIsEditingPolygon, setEditingAreaId,
    getIsEditingResourcePolygon, lastSnapPoint, setLastSnapPoint,
    getIsCtrlPressed,
    setSelectedWallSubSegment, setSelectedFreeLineSubSegment
} from '../../state.js';
import { setSelectedOpeningId } from '../../openings.js';
import { saveStateToHistory } from '../../history.js';
import { drawAll } from '../../drawing.js';
import { 
    createWall, findSnapPointWithSmartSnap, drawSnapIndicators,
    calculateWallSnapPreview
} from '../../walls.js';
import { computeSubSegment } from '../../utils/segment-split.js';
import { virtualDimensionsSystem } from '../../virtual-dimensions.js';
import { pixelsPerCm, wallMinLength, wallAreaBorderTolerance } from '../../config.js';
import { stopResourcePolygonEditing } from '../../resources.js';
import { getAreaAtPos } from '../mouseUtils.js';
import { isPointInAreaWithTolerance } from '../../events.js';
import { invalidateNavigationGraph } from '../../navigation.js';

/**
 * Manipula o clique para criar parede
 */
export function handleCreateWallMouseDown(pos, e) {
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
    canvas.style.cursor = 'crosshair';
    drawAll();

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

/**
 * Manipula o movimento durante criação de parede
 */
export function handleCreateWallMove(pos) {
    const canvas = getCanvas();
    
    const snapResult = findSnapPointWithSmartSnap(pos.x, pos.y);
    const newPreviewEnd = snapResult ? snapResult.point : [pos.x, pos.y];
    
    // Verificar se o ponto final está na mesma área que o ponto inicial
    let isValidEndPoint = false;
    for (let area of movementAreas) {
        const startInside = isPointInAreaWithTolerance(wallStartPoint, area, wallAreaBorderTolerance);
        const endInside = isPointInAreaWithTolerance(newPreviewEnd, area, wallAreaBorderTolerance);
        
        if (startInside && endInside) {
            isValidEndPoint = true;
            break;
        }
    }
    
    canvas.style.cursor = isValidEndPoint ? 'crosshair' : 'not-allowed';
    setWallPreviewEnd(newPreviewEnd);
    
    const currentPos = [pos.x, pos.y];
    const startPoint = wallStartPoint;
    virtualDimensionsSystem.calculateVirtualDimensions(currentPos, startPoint, snapResult);
    
    // Calcular preview de snap para mostrar divisão de cotas
    calculateWallSnapPreview(newPreviewEnd[0], newPreviewEnd[1]);
    
    drawAll(false);
}

/**
 * Manipula o mouseup durante criação de parede
 */
export function handleCreateWallMouseUp(pos) {
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
                
                if (parentAreaId && virtualDimensionsSystem) {
                    virtualDimensionsSystem.clear();
                }
                
                // Invalidar grafo de navegação quando nova parede é criada
                invalidateNavigationGraph();
            }
        }
    }
    
    setIsDrawingWall(false);
    setWallStartPoint(null);
    setWallPreviewEnd(null);
    drawAll();
}

/**
 * Manipula o clique em parede
 */
export function handleWallClick(clickedWall, pos) {
    setSelectedWallId(clickedWall.id);
    setSelectedAreaId(null);
    setSelectedOpeningId(null);
    setSelectedFreeLineId(null);
    setSelectedExclusionZoneId(null);
    setSelectedFreeLineSubSegment(null);
    
    // Calcular sub-segmento baseado em interseções
    if (pos) {
        const clickPt = [pos.x, pos.y];
        const sub = computeSubSegment(clickedWall, clickPt, 'wall');
        setSelectedWallSubSegment(sub);
    } else {
        setSelectedWallSubSegment(null);
    }
    
    if (getIsEditingPolygon()) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }
    if (getIsEditingResourcePolygon()) {
        stopResourcePolygonEditing();
    }
    drawAll();
}

/**
 * Manipula o cursor para ferramenta de parede
 */
export function handleWallToolCursor(pos) {
    const canvas = getCanvas();
    
    // Check for Ctrl key first - show hand cursor for panning
    if (getIsCtrlPressed()) {
        canvas.style.cursor = 'grab';
        return;
    }
    
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
    
    canvas.style.cursor = canCreateWall ? 'crosshair' : 'not-allowed';
    
    if (!isDrawingWall) {
        const snapPoint = findSnapPointWithSmartSnap(pos.x, pos.y);
        if ((snapPoint && !lastSnapPoint) || (!snapPoint && lastSnapPoint) || 
            (snapPoint && lastSnapPoint && (snapPoint.point[0] !== lastSnapPoint.point[0] || snapPoint.point[1] !== lastSnapPoint.point[1]))) {
            setLastSnapPoint(snapPoint);
            drawAll();
        }
    }
}
