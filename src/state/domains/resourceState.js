/**
 * @fileoverview Estado de recursos (máquinas, equipamentos, operadores)
 * 
 * @description
 * Gerencia o estado de seleção e desenho de recursos no canvas.
 * Suporta seleção múltipla, drag de recursos, edição de polígonos
 * e preview durante colocação.
 * 
 * @module state/domains/resourceState
 */

/** @typedef {import('../../types.js').EntityId} EntityId */
/** @typedef {import('../../types.js').PointXY} PointXY */

/**
 * @typedef {Object} ResourceRect
 * @property {number} x - Posição X
 * @property {number} y - Posição Y
 * @property {number} width - Largura
 * @property {number} height - Altura
 * @property {EntityId|null} parentAreaId - ID da área pai
 */

/**
 * @typedef {Object} ResourceDragState
 * @property {EntityId} resourceId - ID do recurso sendo arrastado
 * @property {number} startX - Posição X inicial
 * @property {number} startY - Posição Y inicial
 * @property {number} offsetX - Offset X do clique
 * @property {number} offsetY - Offset Y do clique
 */

import { emitStateAction } from '../events.js';

// =============================================================================
// ESTADO DE SELEÇÃO
// =============================================================================

/** @type {EntityId|null} ID do recurso primário selecionado */
let selectedResourceId = null;

/** @type {EntityId[]} IDs de todos os recursos selecionados (multi-select) */
let selectedResourceIds = [];

/** @type {EntityId|null} ID do recurso sob o cursor */
let hoveredResourceId = null;

// =============================================================================
// ESTADO DE DESENHO DE RECURSO RETANGULAR
// =============================================================================

/** @type {boolean} Se está desenhando um recurso retangular */
let isDrawingResource = false;

/** @type {PointXY|null} Posição de preview durante colocação */
let resourcePreviewPosition = null;

/** @type {ResourceRect} Retângulo atual do recurso sendo desenhado */
let currentResourceRect = { x: 0, y: 0, width: 0, height: 0, parentAreaId: null };

// =============================================================================
// ESTADO DE ESCADA
// =============================================================================

/** @type {boolean} Se está desenhando uma escada */
let isDrawingStair = false;

/** @type {ResourceRect} Retângulo atual da escada sendo desenhada */
let currentStairRect = { x: 0, y: 0, width: 0, height: 0, parentAreaId: null };

// =============================================================================
// ESTADO DE POLÍGONO DE RECURSO
// =============================================================================

/** @type {boolean} Se está editando o polígono de um recurso */
let isEditingResourcePolygon = false;

/** @type {EntityId|null} ID do recurso com polígono em edição */
let editingResourceId = null;

/** @type {PointXY[]} Vértices atuais do polígono de recurso */
let currentResourceVertices = [];

/** @type {boolean} Se está desenhando um novo polígono de recurso */
let isDrawingResourcePolygon = false;

// =============================================================================
// ESTADO DE RESIZE/ROTAÇÃO DE RECURSO (estilo PowerPoint)
// =============================================================================

/** @type {'corner_X'|'edge_X'|'rotate'|null} Handle ativo de recurso sendo arrastado */
let activeResourceResizeHandle = null;

/** @type {boolean} Se está rotacionando um recurso */
let isRotatingResource = false;

/** @type {number} Ângulo inicial ao começar a rotação do recurso */
let resourceRotationStartAngle = 0;

/** @type {{x: number, y: number}|null} Centro de rotação do recurso */
let resourceRotationCenter = null;

/** @type {Array|null} Vértices originais do recurso antes da rotação */
let resourceVerticesBeforeRotation = null;

/** @type {number} Ângulo de rotação atual do recurso em radianos */
let currentResourceRotationAngle = 0;

/** @type {'corner_X'|'edge_X'|'rotate'|null} Handle de recurso sob hover */
let hoveredResourceResizeHandle = null;

/** @type {Array|null} Vértices originais do recurso no início do drag */
let originalResourceVerticesOnDrag = null;

/** @type {Array|null} Posições originais dos hubs antes da rotação */
let originalHubPositionsBeforeRotation = null;

// =============================================================================
// ESTADO DE DRAG
// =============================================================================

/** @type {ResourceDragState|null} Estado do arrasto de recurso ativo */
let activeResourceDragState = null;

// =============================================================================
// NOTIFICAÇÕES
// =============================================================================

/**
 * Emite evento de mudança na seleção de recursos
 * @private
 */
function notifyResourceSelectionChange() {
    emitStateAction('resource-selection/changed', {
        selectedIds: [...selectedResourceIds],
        primaryId: selectedResourceId
    });
}

// =============================================================================
// GETTERS E SETTERS - SELEÇÃO
// =============================================================================

/**
 * Retorna o ID do recurso primário selecionado
 * @returns {EntityId|null}
 */
export function getSelectedResourceId() {
    return selectedResourceId;
}

/**
 * Define o recurso selecionado (limpa seleção múltipla)
 * @param {EntityId|null} id - ID do recurso ou null para limpar
 */
export function setSelectedResourceId(id) {
    if (id === null || id === undefined) {
        setSelectedResourceIds([]);
    } else {
        setSelectedResourceIds([id]);
    }
}

/**
 * Retorna cópia dos IDs de recursos selecionados
 * @returns {EntityId[]}
 */
export function getSelectedResourceIds() {
    return [...selectedResourceIds];
}

/**
 * Define múltiplos recursos selecionados
 * @param {EntityId[]} ids - Array de IDs
 * @param {EntityId|null} [primaryId=null] - ID do recurso primário (para painel de propriedades)
 */
export function setSelectedResourceIds(ids, primaryId = null) {
    if (!Array.isArray(ids)) {
        selectedResourceIds = [];
    } else {
        const filtered = ids.filter(item => item !== null && item !== undefined);
        const unique = Array.from(new Set(filtered));
        selectedResourceIds = unique;
    }

    if (primaryId && selectedResourceIds.includes(primaryId)) {
        selectedResourceId = primaryId;
    } else {
        selectedResourceId = selectedResourceIds.length > 0 ? selectedResourceIds[0] : null;
    }

    notifyResourceSelectionChange();
}

/**
 * Adiciona um recurso à seleção múltipla
 * @param {EntityId} id - ID do recurso
 * @param {boolean} [makePrimary=false] - Se deve tornar este o primário
 */
export function addSelectedResourceId(id, makePrimary = false) {
    if (id === null || id === undefined) {
        return;
    }
    if (!selectedResourceIds.includes(id)) {
        selectedResourceIds = [...selectedResourceIds, id];
    }
    if (makePrimary || !selectedResourceId) {
        selectedResourceId = id;
    }

    notifyResourceSelectionChange();
}

/**
 * Remove um recurso da seleção múltipla
 * @param {EntityId} id - ID do recurso
 */
export function removeSelectedResourceId(id) {
    if (id === null || id === undefined) {
        return;
    }
    selectedResourceIds = selectedResourceIds.filter(existingId => existingId !== id);
    if (selectedResourceId === id) {
        selectedResourceId = selectedResourceIds.length > 0 ? selectedResourceIds[0] : null;
    }

    notifyResourceSelectionChange();
}

export function isResourceSelected(id) {
    if (id === null || id === undefined) {
        return false;
    }
    return selectedResourceIds.includes(id);
}

export function getHoveredResourceId() {
    return hoveredResourceId;
}

export function setHoveredResourceId(id) {
    hoveredResourceId = id;
}

export function getIsDrawingResource() {
    return isDrawingResource;
}

export function setIsDrawingResource(drawing) {
    isDrawingResource = drawing;
}

export function getResourcePreviewPosition() {
    return resourcePreviewPosition;
}

export function setResourcePreviewPosition(position) {
    resourcePreviewPosition = position;
}

export function getCurrentResourceRect() {
    return currentResourceRect;
}

export function setCurrentResourceRect(rect) {
    currentResourceRect = rect;
}

export function getIsDrawingStair() {
    return isDrawingStair;
}

export function setIsDrawingStair(drawing) {
    isDrawingStair = drawing;
}

export function getCurrentStairRect() {
    return currentStairRect;
}

export function setCurrentStairRect(rect) {
    currentStairRect = rect;
}

export function getIsEditingResourcePolygon() {
    return isEditingResourcePolygon;
}

export function setIsEditingResourcePolygon(editing) {
    isEditingResourcePolygon = editing;
}

export function getEditingResourceId() {
    return editingResourceId;
}

export function setEditingResourceId(id) {
    editingResourceId = id;
}

export function getCurrentResourceVertices() {
    return currentResourceVertices;
}

export function setCurrentResourceVertices(vertices) {
    currentResourceVertices = vertices;
}

export function getIsDrawingResourcePolygon() {
    return isDrawingResourcePolygon;
}

export function setIsDrawingResourcePolygon(drawing) {
    isDrawingResourcePolygon = drawing;
}

export function getActiveResourceDragState() {
    return activeResourceDragState;
}

export function setActiveResourceDragState(state) {
    activeResourceDragState = state;
}

// =============================================================================
// GETTERS E SETTERS - RESIZE/ROTAÇÃO DE RECURSO (estilo PowerPoint)
// =============================================================================

export function getActiveResourceResizeHandle() {
    return activeResourceResizeHandle;
}

export function setActiveResourceResizeHandle(handle) {
    activeResourceResizeHandle = handle;
}

export function getIsRotatingResource() {
    return isRotatingResource;
}

export function setIsRotatingResource(rotating) {
    isRotatingResource = rotating;
}

export function getResourceRotationStartAngle() {
    return resourceRotationStartAngle;
}

export function setResourceRotationStartAngle(angle) {
    resourceRotationStartAngle = angle;
}

export function getResourceRotationCenter() {
    return resourceRotationCenter;
}

export function setResourceRotationCenter(center) {
    resourceRotationCenter = center;
}

export function getResourceVerticesBeforeRotation() {
    return resourceVerticesBeforeRotation;
}

export function setResourceVerticesBeforeRotation(vertices) {
    resourceVerticesBeforeRotation = vertices;
}

export function getCurrentResourceRotationAngle() {
    return currentResourceRotationAngle;
}

export function setCurrentResourceRotationAngle(angle) {
    currentResourceRotationAngle = angle;
}

export function getHoveredResourceResizeHandle() {
    return hoveredResourceResizeHandle;
}

export function setHoveredResourceResizeHandle(handle) {
    hoveredResourceResizeHandle = handle;
}

export function getOriginalResourceVerticesOnDrag() {
    return originalResourceVerticesOnDrag;
}

export function setOriginalResourceVerticesOnDrag(vertices) {
    originalResourceVerticesOnDrag = vertices;
}

export function getOriginalHubPositionsBeforeRotation() {
    return originalHubPositionsBeforeRotation;
}

export function setOriginalHubPositionsBeforeRotation(hubPositions) {
    originalHubPositionsBeforeRotation = hubPositions;
}

export {
    selectedResourceId,
    selectedResourceIds,
    hoveredResourceId,
    isDrawingResource,
    resourcePreviewPosition,
    currentResourceRect,
    isDrawingStair,
    currentStairRect,
    isEditingResourcePolygon,
    editingResourceId,
    currentResourceVertices,
    isDrawingResourcePolygon,
    activeResourceDragState,
    activeResourceResizeHandle,
    isRotatingResource,
    resourceRotationStartAngle,
    resourceRotationCenter,
    resourceVerticesBeforeRotation,
    currentResourceRotationAngle,
    hoveredResourceResizeHandle,
    originalResourceVerticesOnDrag,
    originalHubPositionsBeforeRotation
};
