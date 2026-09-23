/**
 * @fileoverview Estado de seleção e edição de geometrias
 * 
 * @description
 * Gerencia o estado de seleção de entidades (áreas, paredes, linhas)
 * e o estado de edição de vértices, midpoints e dimensões.
 * Inclui suporte para hover visual e manipulação de polígonos.
 * 
 * @module state/domains/selectionState
 */

/** @typedef {import('../../types.js').EntityId} EntityId */
/** @typedef {import('../../types.js').Point2D} Point2D */
/** @typedef {import('../../types.js').PointXY} PointXY */

// =============================================================================
// ESTADO DE SELEÇÃO
// =============================================================================

/** @type {EntityId|null} ID da área selecionada */
let selectedAreaId = null;

/** @type {EntityId|null} ID da parede selecionada */
let selectedWallId = null;

/** @type {EntityId|null} ID da linha livre selecionada */
let selectedFreeLineId = null;

// =============================================================================
// ESTADO DE HOVER
// =============================================================================

/** @type {EntityId|null} ID da área sob o cursor */
let hoveredAreaId = null;

/** @type {EntityId|null} ID da parede sob o cursor */
let hoveredWallId = null;

/** @type {EntityId|null} ID da linha livre sob o cursor */
let hoveredFreeLineId = null;

/** @type {EntityId|null} ID da zona de exclusão selecionada */
let selectedExclusionZoneId = null;

/** @type {EntityId|null} ID da zona de exclusão sob o cursor */
let hoveredExclusionZoneId = null;

// =============================================================================
// ESTADO DE EDIÇÃO DE VÉRTICES
// =============================================================================

/** @type {number|null} Índice da dimensão selecionada */
let selectedDimensionIndex = null;

/** @type {Array<{startIndex: number, endIndex: number, midpoint: PointXY}>} Dimensões editáveis visíveis */
let editableDimensions = [];

/** @type {PointXY[]} Vértices do polígono em edição */
let editableVertices = [];

/** @type {PointXY|null} Último ponto de snap */
let lastSnapPoint = null;

/** @type {number|null} Índice do vértice sendo arrastado */
let draggingVertexIndex = null;

/** @type {number|null} Índice do midpoint sob o cursor */
let hoveredMidpointIndex = null;

/** @type {number|null} Índice do vértice sob o cursor */
let hoveredVertexIndex = null;

/** @type {number|null} Índice do midpoint sendo arrastado */
let draggingMidpointIndex = null;

/** @type {PointXY[]} Array de midpoints calculados */
let midpointVertices = [];

/** @type {PointXY[]} Cópia dos vértices originais durante arrasto */
let originalVerticesOnDrag = [];

/** @type {number|null} Índice do midpoint ativo para setas */
let activeMidpointIndex = null;

/** @type {EntityId|null} ID da área com midpoint ativo */
let activeMidpointAreaId = null;

/** @type {boolean} Se as setas de midpoint estão visíveis */
let midpointArrowsVisible = false;

/** @type {{areaId: EntityId, edgeIndex: number}|null} Info da aresta selecionada */
let selectedEdgeInfo = null;

/** @type {Object|null} Dimensões virtuais da área em hover */
let hoveredAreaVirtualDimensions = null;

/** @type {boolean} Se o hover de área está ativo */
let isAreaHoverActive = false;

// =============================================================================
// ESTADO DE EDIÇÃO DE POLÍGONO
// =============================================================================

/** @type {boolean} Se está no modo de edição de polígono */
let isEditingPolygon = false;

/** @type {EntityId|null} ID da área sendo editada */
let editingAreaId = null;

// =============================================================================
// ESTADO DE REDIMENSIONAMENTO/ROTAÇÃO ESTILO POWERPOINT
// =============================================================================

/** @type {'corner_X'|'edge_X'|'rotate'|null} Handle ativo sendo arrastado (X = índice do vértice/aresta) */
let activeResizeHandle = null;

/** @type {boolean} Se está rotacionando uma área */
let isRotatingArea = false;

/** @type {number} Ângulo inicial ao começar a rotação */
let rotationStartAngle = 0;

/** @type {{x: number, y: number}|null} Centro de rotação */
let rotationCenter = null;

/** @type {Array|null} Vértices originais antes da rotação */
let verticesBeforeRotation = null;

/** @type {number} Ângulo de rotação atual em radianos (durante o arraste) */
let currentRotationAngle = 0;

/** @type {'corner_X'|'edge_X'|'rotate'|null} Handle sob hover (X = índice do vértice/aresta) */
let hoveredResizeHandle = null;

/** @type {Array|null} Posições originais dos recursos da área antes da rotação */
let originalAreaResourcesBeforeRotation = null;

/** @type {Array|null} Posições originais das paredes da área antes da rotação */
let originalAreaWallsBeforeRotation = null;

/** @type {Array|null} Posições originais das conexões da área antes da rotação */
let originalAreaConnectionsBeforeRotation = null;

/** @type {Map<string, Array>|null} Posições originais dos hubs dos recursos da área antes da rotação */
let originalAreaResourceHubsBeforeRotation = null;

/** @type {Array|null} Posições originais das aberturas da área antes da rotação */
let originalAreaOpeningsBeforeRotation = null;

// =============================================================================
// ESTADO DE EDIÇÃO DE PAREDE
// =============================================================================

/** @type {boolean} Se está editando uma parede */
let isEditingWall = false;

/** @type {EntityId|null} ID da parede sendo editada */
let editingWallId = null;

/** @type {'start'|'end'|null} Handle da parede sendo arrastado */
let editingWallHandle = null;

// =============================================================================
// ESTADO DE SUB-SEGMENTO SELECIONADO
// =============================================================================

/** @type {{ tStart: number, tEnd: number, startPoint: number[], endPoint: number[] }|null}
 * Sub-segmento da parede selecionada (porção entre interseções) */
let selectedWallSubSegment = null;

/** @type {{ tStart: number, tEnd: number, startPoint: number[], endPoint: number[] }|null}
 * Sub-segmento da linha livre selecionada (porção entre interseções) */
let selectedFreeLineSubSegment = null;

/** @type {{ tStart: number, tEnd: number, startPoint: number[], endPoint: number[] }|null}
 * Sub-segmento da parede sob hover (porção entre interseções) */
let hoveredWallSubSegment = null;

/** @type {{ tStart: number, tEnd: number, startPoint: number[], endPoint: number[] }|null}
 * Sub-segmento da linha livre sob hover */
let hoveredFreeLineSubSegment = null;

// =============================================================================
// GETTERS E SETTERS - SELEÇÃO
// =============================================================================

/**
 * Retorna o ID da área selecionada
 * @returns {EntityId|null}
 */
export function getSelectedAreaId() {
    return selectedAreaId;
}

/**
 * Define o ID da área selecionada
 * @param {EntityId|null} id
 */
export function setSelectedAreaId(id) {
    selectedAreaId = id;
}

/**
 * Retorna o ID da parede selecionada
 * @returns {EntityId|null}
 */
export function getSelectedWallId() {
    return selectedWallId;
}

/**
 * Define o ID da parede selecionada
 * @param {EntityId|null} id
 */
export function setSelectedWallId(id) {
    selectedWallId = id;
}

export function getIsEditingWall() {
    return isEditingWall;
}

export function setIsEditingWall(editing) {
    isEditingWall = editing;
}

export function getEditingWallId() {
    return editingWallId;
}

export function setEditingWallId(id) {
    editingWallId = id;
}

export function getEditingWallHandle() {
    return editingWallHandle;
}

export function setEditingWallHandle(handle) {
    editingWallHandle = handle;
}

export function getHoveredWallId() {
    return hoveredWallId;
}

export function setHoveredWallId(id) {
    hoveredWallId = id;
}

export function getSelectedFreeLineId() {
    return selectedFreeLineId;
}

export function setSelectedFreeLineId(id) {
    selectedFreeLineId = id;
}

export function getHoveredFreeLineId() {
    return hoveredFreeLineId;
}

export function setHoveredFreeLineId(id) {
    hoveredFreeLineId = id;
}

export function getSelectedExclusionZoneId() {
    return selectedExclusionZoneId;
}

export function setSelectedExclusionZoneId(id) {
    selectedExclusionZoneId = id;
}

export function getHoveredExclusionZoneId() {
    return hoveredExclusionZoneId;
}

export function setHoveredExclusionZoneId(id) {
    hoveredExclusionZoneId = id;
}

// --- Sub-segmento selecionado (parede) ---
export function getSelectedWallSubSegment() {
    return selectedWallSubSegment;
}
export function setSelectedWallSubSegment(sub) {
    selectedWallSubSegment = sub;
}

// --- Sub-segmento selecionado (linha livre) ---
export function getSelectedFreeLineSubSegment() {
    return selectedFreeLineSubSegment;
}
export function setSelectedFreeLineSubSegment(sub) {
    selectedFreeLineSubSegment = sub;
}

// --- Sub-segmento hover (parede) ---
export function getHoveredWallSubSegment() {
    return hoveredWallSubSegment;
}
export function setHoveredWallSubSegment(sub) {
    hoveredWallSubSegment = sub;
}

// --- Sub-segmento hover (linha livre) ---
export function getHoveredFreeLineSubSegment() {
    return hoveredFreeLineSubSegment;
}
export function setHoveredFreeLineSubSegment(sub) {
    hoveredFreeLineSubSegment = sub;
}

export function getDraggingVertexIndex() {
    return draggingVertexIndex;
}

export function setDraggingVertexIndex(index) {
    draggingVertexIndex = index;
}

export function getEditableVertices() {
    return editableVertices;
}

export function setEditableVertices(vertices) {
    editableVertices = vertices;
}

export function getLastSnapPoint() {
    return lastSnapPoint;
}

export function setLastSnapPoint(point) {
    lastSnapPoint = point;
}

export function getHoveredMidpointIndex() {
    return hoveredMidpointIndex;
}

export function setHoveredMidpointIndex(index) {
    hoveredMidpointIndex = index;
}

export function getHoveredVertexIndex() {
    return hoveredVertexIndex;
}

export function setHoveredVertexIndex(index) {
    hoveredVertexIndex = index;
}

export function getDraggingMidpointIndex() {
    return draggingMidpointIndex;
}

export function setDraggingMidpointIndex(index) {
    draggingMidpointIndex = index;
}

export function getMidpointVertices() {
    return midpointVertices;
}

export function setMidpointVertices(vertices) {
    midpointVertices = vertices;
}

export function getOriginalVerticesOnDrag() {
    return originalVerticesOnDrag;
}

export function setOriginalVerticesOnDrag(vertices) {
    originalVerticesOnDrag = vertices;
}

export function getIsEditingPolygon() {
    return isEditingPolygon;
}

export function setIsEditingPolygon(value) {
    isEditingPolygon = value;
}

export function getEditingAreaId() {
    return editingAreaId;
}

export function setEditingAreaId(id) {
    editingAreaId = id;
}

export function getHoveredAreaVirtualDimensions() {
    return hoveredAreaVirtualDimensions;
}

export function setHoveredAreaVirtualDimensions(dimensions) {
    hoveredAreaVirtualDimensions = dimensions;
}

export function getIsAreaHoverActive() {
    return isAreaHoverActive;
}

export function setIsAreaHoverActive(active) {
    isAreaHoverActive = active;
}

export function getActiveMidpointIndex() {
    return activeMidpointIndex;
}

export function setActiveMidpointIndex(index) {
    activeMidpointIndex = index;
}

export function getActiveMidpointAreaId() {
    return activeMidpointAreaId;
}

export function setActiveMidpointAreaId(areaId) {
    activeMidpointAreaId = areaId;
}

export function getMidpointArrowsVisible() {
    return midpointArrowsVisible;
}

export function setMidpointArrowsVisible(visible) {
    midpointArrowsVisible = visible;
}

export function getSelectedEdgeInfo() {
    return selectedEdgeInfo;
}

export function setSelectedEdgeInfo(info) {
    selectedEdgeInfo = info;
}

// =============================================================================
// GETTERS E SETTERS - HANDLES ESTILO POWERPOINT
// =============================================================================

export function getActiveResizeHandle() {
    return activeResizeHandle;
}

export function setActiveResizeHandle(handle) {
    activeResizeHandle = handle;
}

export function getIsRotatingArea() {
    return isRotatingArea;
}

export function setIsRotatingArea(rotating) {
    isRotatingArea = rotating;
}

export function getRotationStartAngle() {
    return rotationStartAngle;
}

export function setRotationStartAngle(angle) {
    rotationStartAngle = angle;
}

export function getRotationCenter() {
    return rotationCenter;
}

export function setRotationCenter(center) {
    rotationCenter = center;
}

export function getVerticesBeforeRotation() {
    return verticesBeforeRotation;
}

export function setVerticesBeforeRotation(vertices) {
    verticesBeforeRotation = vertices;
}

export function getCurrentRotationAngle() {
    return currentRotationAngle;
}

export function setCurrentRotationAngle(angle) {
    currentRotationAngle = angle;
}

export function getHoveredResizeHandle() {
    return hoveredResizeHandle;
}

export function setHoveredResizeHandle(handle) {
    hoveredResizeHandle = handle;
}

export function getOriginalAreaResourcesBeforeRotation() {
    return originalAreaResourcesBeforeRotation;
}

export function setOriginalAreaResourcesBeforeRotation(resources) {
    originalAreaResourcesBeforeRotation = resources;
}

export function getOriginalAreaWallsBeforeRotation() {
    return originalAreaWallsBeforeRotation;
}

export function setOriginalAreaWallsBeforeRotation(walls) {
    originalAreaWallsBeforeRotation = walls;
}

export function getOriginalAreaConnectionsBeforeRotation() {
    return originalAreaConnectionsBeforeRotation;
}

export function setOriginalAreaConnectionsBeforeRotation(connections) {
    originalAreaConnectionsBeforeRotation = connections;
}

export function getOriginalAreaResourceHubsBeforeRotation() {
    return originalAreaResourceHubsBeforeRotation;
}

export function setOriginalAreaResourceHubsBeforeRotation(hubs) {
    originalAreaResourceHubsBeforeRotation = hubs;
}

export function getOriginalAreaOpeningsBeforeRotation() {
    return originalAreaOpeningsBeforeRotation;
}

export function setOriginalAreaOpeningsBeforeRotation(openingsData) {
    originalAreaOpeningsBeforeRotation = openingsData;
}

export {
    selectedAreaId,
    selectedWallId,
    selectedFreeLineId,
    hoveredAreaId,
    hoveredWallId,
    hoveredFreeLineId,
    selectedDimensionIndex,
    editableDimensions,
    editableVertices,
    lastSnapPoint,
    draggingVertexIndex,
    hoveredMidpointIndex,
    hoveredVertexIndex,
    draggingMidpointIndex,
    midpointVertices,
    originalVerticesOnDrag,
    activeMidpointIndex,
    activeMidpointAreaId,
    midpointArrowsVisible,
    selectedEdgeInfo,
    hoveredAreaVirtualDimensions,
    isAreaHoverActive,
    isEditingPolygon,
    editingAreaId,
    isEditingWall,
    editingWallId,
    editingWallHandle,
    activeResizeHandle,
    isRotatingArea,
    rotationStartAngle,
    rotationCenter,
    verticesBeforeRotation,
    currentRotationAngle,
    hoveredResizeHandle,
    originalAreaResourcesBeforeRotation,
    originalAreaWallsBeforeRotation,
    originalAreaConnectionsBeforeRotation
};
