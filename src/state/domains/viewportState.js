/**
 * @fileoverview Estado do viewport, pan e zoom
 * 
 * @description
 * Gerencia o estado de visualização do canvas incluindo:
 * - Escala (zoom) e offset do viewport
 * - Estado de pan (arrastar canvas com botão do meio)
 * - Estado de arrasto de elementos
 * - Teclas modificadoras (Ctrl)
 * 
 * @module state/domains/viewportState
 */

// =============================================================================
// ESTADO DO VIEWPORT
// =============================================================================

/** @type {number} Offset X do canvas em pixels */
let offsetXCanvas = 0;

/** @type {number} Offset Y do canvas em pixels */
let offsetYCanvas = 0;

/** @type {number} Escala atual do viewport (1.0 = 100%) */
let scale = 1.0;

// =============================================================================
// ESTADO DE PAN E DRAG
// =============================================================================

/** @type {boolean} Se está arrastando um elemento */
let isDragging = false;

/** @type {boolean} Se está no modo pan (arrastar canvas) */
let isPanning = false;

/** @type {{x: number, y: number}} Ponto inicial do pan */
let panStart = { x: 0, y: 0 };

/** @type {boolean} Se o botão direito do mouse está pressionado */
let isRightMouseDown = false;

/** @type {{x: number, y: number}} Posição inicial do clique direito (para detectar drag vs click) */
let rightMouseStartPos = { x: 0, y: 0 };

/** @type {boolean} Se houve drag durante o clique direito (para diferenciar pan de context menu) */
let didRightMouseDrag = false;

/** @type {number} Limiar em pixels para considerar como drag e não click */
const RIGHT_CLICK_DRAG_THRESHOLD = 5;

/** @type {number} Posição X inicial do arrasto */
let startX = 0;

/** @type {number} Posição Y inicial do arrasto */
let startY = 0;

/** @type {number} Posição X onde o arrasto começou */
let dragStartX = 0;

/** @type {number} Posição Y onde o arrasto começou */
let dragStartY = 0;

/** @type {number} Offset X acumulado durante arrasto */
let offsetX = 0;

/** @type {number} Offset Y acumulado durante arrasto */
let offsetY = 0;

// =============================================================================
// GETTERS E SETTERS - RIGHT-CLICK PAN
// =============================================================================

/**
 * Retorna se o botão direito do mouse está pressionado
 * @returns {boolean}
 */
export function getIsRightMouseDown() {
    return isRightMouseDown;
}

/**
 * Define se o botão direito do mouse está pressionado
 * @param {boolean} value
 */
export function setIsRightMouseDown(value) {
    isRightMouseDown = value;
}

/**
 * Retorna a posição inicial do clique direito
 * @returns {{x: number, y: number}}
 */
export function getRightMouseStartPos() {
    return rightMouseStartPos;
}

/**
 * Define a posição inicial do clique direito
 * @param {{x: number, y: number}} value
 */
export function setRightMouseStartPos(value) {
    rightMouseStartPos = value;
}

/**
 * Retorna se houve drag durante o clique direito
 * @returns {boolean}
 */
export function getDidRightMouseDrag() {
    return didRightMouseDrag;
}

/**
 * Define se houve drag durante o clique direito
 * @param {boolean} value
 */
export function setDidRightMouseDrag(value) {
    didRightMouseDrag = value;
}

/**
 * Retorna o limiar de drag para clique direito
 * @returns {number}
 */
export function getRightClickDragThreshold() {
    return RIGHT_CLICK_DRAG_THRESHOLD;
}

// =============================================================================
// TECLAS MODIFICADORAS
// =============================================================================

/** @type {boolean} Se a tecla Ctrl está pressionada */
let isCtrlPressed = false;

// =============================================================================
// GETTERS E SETTERS - VIEWPORT
// =============================================================================

/**
 * Retorna a escala atual do viewport
 * @returns {number}
 */
export function getScale() {
    return scale;
}

/**
 * Define a escala do viewport
 * @param {number} value
 */
export function setScale(value) {
    scale = value;
}

/**
 * Retorna o offset X do canvas
 * @returns {number}
 */
export function getOffsetXCanvas() {
    return offsetXCanvas;
}

/**
 * Define o offset X do canvas
 * @param {number} value
 */
export function setOffsetXCanvas(value) {
    offsetXCanvas = value;
}

/**
 * Retorna o offset Y do canvas
 * @returns {number}
 */
export function getOffsetYCanvas() {
    return offsetYCanvas;
}

/**
 * Define o offset Y do canvas
 * @param {number} value
 */
export function setOffsetYCanvas(value) {
    offsetYCanvas = value;
}

// =============================================================================
// GETTERS E SETTERS - DRAG E PAN
// =============================================================================

/**
 * Retorna se está arrastando um elemento
 * @returns {boolean}
 */
export function getIsDragging() {
    return isDragging;
}

/**
 * Define se está arrastando um elemento
 * @param {boolean} value
 */
export function setIsDragging(value) {
    isDragging = value;
}

/**
 * Retorna se está no modo pan
 * @returns {boolean}
 */
export function getIsPanning() {
    return isPanning;
}

/**
 * Define se está no modo pan
 * @param {boolean} value
 */
export function setIsPanning(value) {
    isPanning = value;
}

/**
 * Retorna o ponto inicial do pan
 * @returns {{x: number, y: number}}
 */
export function getPanStart() {
    return panStart;
}

/**
 * Define o ponto inicial do pan
 * @param {{x: number, y: number}} value
 */
export function setPanStart(value) {
    panStart = value;
}

/**
 * Retorna a posição X inicial
 * @returns {number}
 */
export function getStartX() {
    return startX;
}

/**
 * Define a posição X inicial
 * @param {number} value
 */
export function setStartX(value) {
    startX = value;
}

/**
 * Retorna a posição Y inicial
 * @returns {number}
 */
export function getStartY() {
    return startY;
}

/**
 * Define a posição Y inicial
 * @param {number} value
 */
export function setStartY(value) {
    startY = value;
}

/**
 * Retorna a posição X onde o drag começou
 * @returns {number}
 */
export function getDragStartX() {
    return dragStartX;
}

/**
 * Define a posição X onde o drag começou
 * @param {number} value
 */
export function setDragStartX(value) {
    dragStartX = value;
}

/**
 * Retorna a posição Y onde o drag começou
 * @returns {number}
 */
export function getDragStartY() {
    return dragStartY;
}

/**
 * Define a posição Y onde o drag começou
 * @param {number} value
 */
export function setDragStartY(value) {
    dragStartY = value;
}

/**
 * Retorna o offset X acumulado
 * @returns {number}
 */
export function getOffsetX() {
    return offsetX;
}

/**
 * Define o offset X acumulado
 * @param {number} value
 */
export function setOffsetX(value) {
    offsetX = value;
}

/**
 * Retorna o offset Y acumulado
 * @returns {number}
 */
export function getOffsetY() {
    return offsetY;
}

/**
 * Define o offset Y acumulado
 * @param {number} value
 */
export function setOffsetY(value) {
    offsetY = value;
}

// =============================================================================
// GETTERS E SETTERS - TECLAS MODIFICADORAS
// =============================================================================

/**
 * Retorna se a tecla Ctrl está pressionada
 * @returns {boolean}
 */
export function getIsCtrlPressed() {
    return isCtrlPressed;
}

/**
 * Define se a tecla Ctrl está pressionada
 * @param {boolean} value
 */
export function setIsCtrlPressed(value) {
    isCtrlPressed = value;
}

export {
    offsetXCanvas,
    offsetYCanvas,
    scale,
    isDragging,
    isPanning,
    panStart,
    isRightMouseDown,
    rightMouseStartPos,
    didRightMouseDrag,
    RIGHT_CLICK_DRAG_THRESHOLD,
    startX,
    startY,
    dragStartX,
    dragStartY,
    offsetX,
    offsetY,
    isCtrlPressed
};
