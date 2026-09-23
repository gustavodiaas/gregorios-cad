// Drawing tools, guides and creation previews
let currentTool = null;
let isDrawingWall = false;
let wallStartPoint = null;
let wallPreviewEnd = null;
let isDrawingFreeLine = false;
let freeLineStartPoint = null;
let freeLinePreviewEnd = null;
let freeLineShapeMode = 'line'; // 'line' | 'rectangle' | 'circle' | 'triangle'
let isDrawingExclusionZone = false;
let exclusionZoneStartPoint = null;
let exclusionZonePreviewEnd = null;
let exclusionZoneShapeMode = 'rectangle'; // 'rectangle' | 'circle' | 'triangle'
let isDraggingExclusionZone = false;
let exclusionZoneDragOffset = null; // {dx, dy} offset do clique ao startPoint
let exclusionZoneOriginalStart = null; // [x,y] posição original durante drag
let exclusionZoneOriginalEnd = null;   // [x,y] posição original durante drag
let activeExclusionZoneResizeHandle = null; // 'nw'|'ne'|'sw'|'se' ou null
let isDrawing = false;
let currentRect = { x: 0, y: 0, width: 0, height: 0 };
let activeGuideLines = [];
let isCreatingOpening = false;
let openingPreviewPosition = null;

export function getIsDrawingWall() {
    return isDrawingWall;
}

export function setIsDrawingWall(value) {
    isDrawingWall = value;
}

export function getWallStartPoint() {
    return wallStartPoint;
}

export function setWallStartPoint(point) {
    wallStartPoint = point;
}

export function getWallPreviewEnd() {
    return wallPreviewEnd;
}

export function setWallPreviewEnd(point) {
    wallPreviewEnd = point;
}

export function getIsDrawingFreeLine() {
    return isDrawingFreeLine;
}

export function setIsDrawingFreeLine(value) {
    isDrawingFreeLine = value;
}

export function getFreeLineStartPoint() {
    return freeLineStartPoint;
}

export function setFreeLineStartPoint(point) {
    freeLineStartPoint = point;
}

export function getFreeLinePreviewEnd() {
    return freeLinePreviewEnd;
}

export function setFreeLinePreviewEnd(point) {
    freeLinePreviewEnd = point;
}

export function getFreeLineShapeMode() {
    return freeLineShapeMode;
}

export function setFreeLineShapeMode(mode) {
    freeLineShapeMode = mode;
}

export function getIsDrawingExclusionZone() {
    return isDrawingExclusionZone;
}

export function setIsDrawingExclusionZone(value) {
    isDrawingExclusionZone = value;
}

export function getExclusionZoneStartPoint() {
    return exclusionZoneStartPoint;
}

export function setExclusionZoneStartPoint(point) {
    exclusionZoneStartPoint = point;
}

export function getExclusionZonePreviewEnd() {
    return exclusionZonePreviewEnd;
}

export function setExclusionZonePreviewEnd(point) {
    exclusionZonePreviewEnd = point;
}

export function getExclusionZoneShapeMode() {
    return exclusionZoneShapeMode;
}

export function setExclusionZoneShapeMode(mode) {
    exclusionZoneShapeMode = mode;
}

export function getIsDraggingExclusionZone() { return isDraggingExclusionZone; }
export function setIsDraggingExclusionZone(v) { isDraggingExclusionZone = v; }
export function getExclusionZoneDragOffset() { return exclusionZoneDragOffset; }
export function setExclusionZoneDragOffset(v) { exclusionZoneDragOffset = v; }
export function getExclusionZoneOriginalStart() { return exclusionZoneOriginalStart; }
export function setExclusionZoneOriginalStart(v) { exclusionZoneOriginalStart = v; }
export function getExclusionZoneOriginalEnd() { return exclusionZoneOriginalEnd; }
export function setExclusionZoneOriginalEnd(v) { exclusionZoneOriginalEnd = v; }
export function getActiveExclusionZoneResizeHandle() { return activeExclusionZoneResizeHandle; }
export function setActiveExclusionZoneResizeHandle(v) { activeExclusionZoneResizeHandle = v; }

export function getIsDrawing() {
    return isDrawing;
}

export function setIsDrawing(value) {
    isDrawing = value;
}

export function getIsCreatingOpening() {
    return isCreatingOpening;
}

export function setIsCreatingOpening(value) {
    isCreatingOpening = value;
}

export function getOpeningPreviewPosition() {
    return openingPreviewPosition;
}

export function setOpeningPreviewPosition(value) {
    openingPreviewPosition = value;
}

export function setActiveGuideLines(guides) {
    activeGuideLines = guides || [];
}

export {
    currentTool,
    isDrawingWall,
    wallStartPoint,
    wallPreviewEnd,
    isDrawingFreeLine,
    freeLineStartPoint,
    freeLinePreviewEnd,
    freeLineShapeMode,
    isDrawingExclusionZone,
    exclusionZoneStartPoint,
    exclusionZonePreviewEnd,
    exclusionZoneShapeMode,
    isDraggingExclusionZone,
    exclusionZoneDragOffset,
    exclusionZoneOriginalStart,
    exclusionZoneOriginalEnd,
    activeExclusionZoneResizeHandle,
    isDrawing,
    currentRect,
    activeGuideLines,
    isCreatingOpening,
    openingPreviewPosition
};
