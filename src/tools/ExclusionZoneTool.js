import { Tool } from './Tool.js';
import { getMousePos } from '../events/mouseUtils.js';
import {
    getCanvas,
    setIsDrawingExclusionZone,
    getIsDrawingExclusionZone,
    setExclusionZoneStartPoint,
    getExclusionZoneStartPoint,
    setExclusionZonePreviewEnd,
    getExclusionZoneShapeMode,
    setSelectedAreaId,
    setSelectedWallId,
    setSelectedConnectionId,
    setSelectedFreeLineId,
    isPanning
} from '../state.js';
import {
    createExclusionZone,
    addExclusionZone,
    resolveExclusionZoneParentAreaId
} from '../exclusion-zones.js';
import { deselectAllResources } from '../resources.js';
import { setSelectedOpeningId } from '../openings.js';
import { saveStateToHistory } from '../history.js';
import { drawAll } from '../drawing.js';

export class ExclusionZoneTool extends Tool {
    constructor() {
        super();
        this.name = 'ExclusionZoneTool';
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
        setIsDrawingExclusionZone(false);
        setExclusionZoneStartPoint(null);
        setExclusionZonePreviewEnd(null);
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'default';
        }
        drawAll();
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        const pos = getMousePos(e);
        setIsDrawingExclusionZone(true);
        const startPoint = [pos.x, pos.y];
        setExclusionZoneStartPoint(startPoint);
        setExclusionZonePreviewEnd([...startPoint]);
        drawAll();
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;

        if (!getIsDrawingExclusionZone()) return;

        const startPoint = getExclusionZoneStartPoint();
        if (!startPoint) return;

        const pos = getMousePos(e);
        setExclusionZonePreviewEnd([pos.x, pos.y]);
        drawAll();
    }

    onMouseUp(e) {
        if (e.button !== 0) { super.onMouseUp(e); return; }

        const startPoint = getExclusionZoneStartPoint();
        if (!startPoint) {
            setIsDrawingExclusionZone(false);
            setExclusionZoneStartPoint(null);
            setExclusionZonePreviewEnd(null);
            drawAll();
            return;
        }

        const pos = getMousePos(e);
        const endPoint = [pos.x, pos.y];

        const dx = endPoint[0] - startPoint[0];
        const dy = endPoint[1] - startPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length >= 2) {
            const shapeMode = getExclusionZoneShapeMode();
            const parentAreaId = resolveExclusionZoneParentAreaId(startPoint, endPoint);
            const newZone = createExclusionZone(startPoint, endPoint, parentAreaId, shapeMode);
            if (newZone) {
                saveStateToHistory('Criar zona de exclusão (' + shapeMode + ')');
                addExclusionZone(newZone);
                // Clear other selections
                setSelectedAreaId(null);
                setSelectedWallId(null);
                setSelectedFreeLineId(null);
                setSelectedOpeningId(null);
                deselectAllResources();
                setSelectedConnectionId(null);
            }
        }

        setIsDrawingExclusionZone(false);
        setExclusionZoneStartPoint(null);
        setExclusionZonePreviewEnd(null);
        drawAll();
    }
}
