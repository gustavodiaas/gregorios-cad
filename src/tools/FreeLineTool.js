import { Tool } from './Tool.js';
import { getMousePos } from '../events/mouseUtils.js';
import { 
    getCanvas, 
    setIsDrawingFreeLine, 
    getIsDrawingFreeLine, 
    setFreeLineStartPoint, 
    getFreeLineStartPoint, 
    setFreeLinePreviewEnd, 
    setSelectedFreeLineId,
    setSelectedAreaId,
    setSelectedWallId,
    setSelectedConnectionId,
    isPanning,
    getFreeLineShapeMode
} from '../state.js';
import { setSelectedOpeningId } from '../openings.js';
import { 
    getSnappedFreeLinePoint, 
    setFreeLineSnapIndicator, 
    clearFreeLineSnapIndicator, 
    setFreeLineClosureIndicator, 
    clearFreeLineClosureIndicator,
    createFreeLine,
    addFreeLine,
    resolveFreeLineParentAreaId
} from '../free-lines.js';
import { deselectAllResources } from '../resources.js';
import { saveStateToHistory } from '../history.js';
import { drawAll } from '../drawing.js';
import { getCurrentResourceColor } from '../color-palette.js';
import { freeLineClosureSnapRadius } from '../config.js';
import { getScale } from '../state.js';

export class FreeLineTool extends Tool {
    constructor() {
        super();
        this.name = 'FreeLineTool';
    }

    activate() {
        super.activate();
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'crosshair';
        }
    }

    deactivate() {
        super.deactivate();
        setIsDrawingFreeLine(false);
        setFreeLineStartPoint(null);
        setFreeLinePreviewEnd(null);
        clearFreeLineSnapIndicator();
        clearFreeLineClosureIndicator();
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'default';
        }
        drawAll();
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        const pos = getMousePos(e);

        setIsDrawingFreeLine(true);
        const rawStart = [pos.x, pos.y];
        const snapResult = getSnappedFreeLinePoint(null, rawStart, {
            allowAngleSnap: false,
            ignoreSameAsStart: false
        });
        const startPoint = snapResult.point ? [...snapResult.point] : [...rawStart];
        setFreeLineStartPoint(startPoint);
        setFreeLinePreviewEnd([...startPoint]);
        clearFreeLineSnapIndicator();
        clearFreeLineClosureIndicator();
        drawAll();
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;
        
        const pos = getMousePos(e);

        if (!getIsDrawingFreeLine()) {
            return;
        }

        const startPoint = getFreeLineStartPoint();
        if (!startPoint) {
            return;
        }

        const rawPoint = [pos.x, pos.y];
        const shapeMode = getFreeLineShapeMode();
        
        // For geometric shapes, just set preview directly (no snapping)
        if (shapeMode !== 'line') {
            setFreeLinePreviewEnd([...rawPoint]);
            clearFreeLineSnapIndicator();
            clearFreeLineClosureIndicator();
            drawAll();
            return;
        }

        const snapResult = getSnappedFreeLinePoint(startPoint, rawPoint, {
            allowEndpointSnap: true,
            allowAngleSnap: true,
            ignoreSameAsStart: true
        });

        const isClosureSnap = Boolean(snapResult && snapResult.snapped && snapResult.type === 'closure');
        const previewPoint = isClosureSnap ? [...rawPoint] : (snapResult.point ? [...snapResult.point] : [...rawPoint]);
        setFreeLinePreviewEnd(previewPoint);

        if (snapResult && snapResult.snapped && !isClosureSnap) {
            setFreeLineSnapIndicator(snapResult);
        } else {
            clearFreeLineSnapIndicator();
        }

        const scale = getScale();
        const threshold = freeLineClosureSnapRadius / Math.max(scale, 0.0001);
        const distance = Math.hypot(previewPoint[0] - startPoint[0], previewPoint[1] - startPoint[1]);

        if (isClosureSnap || (distance <= threshold && distance > 0.1)) {
            setFreeLineClosureIndicator({
                visible: true,
                start: [...startPoint],
                target: [...previewPoint],
                highlight: [...startPoint],
                distance: isClosureSnap ? (snapResult?.data?.distance ?? distance) : distance
            });
        } else {
            clearFreeLineClosureIndicator();
        }

        drawAll();
    }

    onMouseUp(e) {
        if (e.button !== 0) { super.onMouseUp(e); return; }

        const pos = getMousePos(e);

        const startPoint = getFreeLineStartPoint();
        if (!startPoint) {
            setIsDrawingFreeLine(false);
            setFreeLineStartPoint(null);
            setFreeLinePreviewEnd(null);
            clearFreeLineClosureIndicator();
            drawAll();
            return;
        }

        const rawEndPoint = [pos.x, pos.y];
        const shapeMode = getFreeLineShapeMode();
        
        // For shapes (rectangle, circle, triangle), skip snapping to keep bbox logic simple
        let endPoint;
        if (shapeMode !== 'line') {
            endPoint = [...rawEndPoint];
        } else {
            const snapResult = getSnappedFreeLinePoint(startPoint, rawEndPoint, {
                allowEndpointSnap: true,
                allowAngleSnap: true,
                ignoreSameAsStart: true
            });

            const isClosureSnap = Boolean(snapResult && snapResult.snapped && snapResult.type === 'closure');
            endPoint = isClosureSnap ? [...startPoint] : (snapResult.point ? [...snapResult.point] : [...rawEndPoint]);
            setFreeLinePreviewEnd(endPoint);
            if (snapResult && snapResult.snapped && !isClosureSnap) {
                setFreeLineSnapIndicator(snapResult);
            } else {
                clearFreeLineSnapIndicator();
            }
        }

        const dx = endPoint[0] - startPoint[0];
        const dy = endPoint[1] - startPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length >= 2) {
            const color = getCurrentResourceColor ? getCurrentResourceColor() : undefined;
            const parentAreaId = resolveFreeLineParentAreaId(startPoint, endPoint);
            const newLine = createFreeLine(startPoint, endPoint, color, parentAreaId, shapeMode);
            if (newLine) {
                saveStateToHistory('Criar ' + (shapeMode === 'line' ? 'linha livre' : shapeMode));
                addFreeLine(newLine);
                setSelectedFreeLineId(newLine.id);
                setSelectedAreaId(null);
                setSelectedWallId(null);
                setSelectedOpeningId(null);
                deselectAllResources();
                setSelectedConnectionId(null);
            }
        }

        setIsDrawingFreeLine(false);
        setFreeLineStartPoint(null);
        setFreeLinePreviewEnd(null);
        clearFreeLineSnapIndicator();
        clearFreeLineClosureIndicator();
        drawAll();
    }
}
