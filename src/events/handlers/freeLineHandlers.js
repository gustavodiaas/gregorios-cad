/**
 * Handlers para eventos de mouse relacionados a linhas livres
 */
import { 
    movementAreas, getCanvas, getScale,
    setSelectedAreaId, setSelectedWallId, setSelectedConnectionId,
    getIsDrawingFreeLine, setIsDrawingFreeLine,
    getFreeLineStartPoint, setFreeLineStartPoint,
    getFreeLinePreviewEnd, setFreeLinePreviewEnd,
    getSelectedFreeLineId, setSelectedFreeLineId, getFreeLineShapeMode,
    getIsEditingPolygon, setIsEditingPolygon, setEditingAreaId,
    getIsEditingResourcePolygon
} from '../../state.js';
import { setSelectedOpeningId } from '../../openings.js';
import { saveStateToHistory } from '../../history.js';
import { drawAll } from '../../drawing.js';
import { deselectAllResources, stopResourcePolygonEditing } from '../../resources.js';
import { 
    createFreeLine, addFreeLine, getSnappedFreeLinePoint,
    setFreeLineSnapIndicator, clearFreeLineSnapIndicator,
    setFreeLineClosureIndicator, clearFreeLineClosureIndicator
} from '../../free-lines.js';
import { freeLineClosureSnapRadius } from '../../config.js';
import { getCurrentResourceColor } from '../../color-palette.js';
import { isPointInAreaWithTolerance } from '../../events.js';

const FREE_LINE_AREA_TOLERANCE = 1;

/**
 * Resolve o ID da área pai para uma linha livre
 */
function resolveFreeLineParentAreaId(startPoint, endPoint) {
    if (!Array.isArray(startPoint) || !Array.isArray(endPoint)) {
        return null;
    }

    for (const area of movementAreas) {
        if (!area) continue;

        const startInside = isPointInAreaWithTolerance(startPoint, area, FREE_LINE_AREA_TOLERANCE);
        const endInside = isPointInAreaWithTolerance(endPoint, area, FREE_LINE_AREA_TOLERANCE);

        if (startInside && endInside) {
            return area.id;
        }
    }

    return null;
}

/**
 * Manipula o clique para criar linha livre
 */
export function handleCreateFreeLineMouseDown(pos) {
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

/**
 * Manipula o movimento durante criação de linha livre
 */
export function handleCreateFreeLineMove(pos) {
    if (!getIsDrawingFreeLine()) {
        return;
    }

    const startPoint = getFreeLineStartPoint();
    if (!startPoint) {
        return;
    }

    const rawPoint = [pos.x, pos.y];
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

    drawAll(false);
}

/**
 * Manipula o mouseup durante criação de linha livre
 */
export function handleCreateFreeLineMouseUp(pos) {
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
    const snapResult = getSnappedFreeLinePoint(startPoint, rawEndPoint, {
        allowEndpointSnap: true,
        allowAngleSnap: true,
        ignoreSameAsStart: true
    });

    const isClosureSnap = Boolean(snapResult && snapResult.snapped && snapResult.type === 'closure');
    const endPoint = isClosureSnap ? [...startPoint] : (snapResult.point ? [...snapResult.point] : [...rawEndPoint]);
    setFreeLinePreviewEnd(endPoint);
    if (snapResult && snapResult.snapped && !isClosureSnap) {
        setFreeLineSnapIndicator(snapResult);
    } else {
        clearFreeLineSnapIndicator();
    }

    const dx = endPoint[0] - startPoint[0];
    const dy = endPoint[1] - startPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length >= 2) {
        const color = getCurrentResourceColor ? getCurrentResourceColor() : undefined;
        const parentAreaId = resolveFreeLineParentAreaId(startPoint, endPoint);
        const shapeMode = getFreeLineShapeMode();
        const newLine = createFreeLine(startPoint, endPoint, color, parentAreaId, shapeMode);
        if (newLine) {
            saveStateToHistory(shapeMode === 'dimension' ? 'Criar cota' : 'Criar linha livre');
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

/**
 * Manipula o clique em linha livre
 */
export function handleFreeLineClick(clickedLine) {
    setSelectedFreeLineId(clickedLine.id);
    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    deselectAllResources();
    setSelectedConnectionId(null);

    if (getIsEditingPolygon()) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }
    if (getIsEditingResourcePolygon()) {
        stopResourcePolygonEditing();
    }
    drawAll();
}
