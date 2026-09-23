// Wall Snap Preview State - Estado do preview de snap na criação de paredes
// Mostra ponto de interseção e cotas de divisão quando o cursor está próximo de uma parede existente
// Inspirado no sistema de preview de hubs (hubPlacementState.js)

// Estado do preview de snap de parede
let wallSnapPreviewActive = false;
let wallSnapPreviewPoint = null;      // [x, y] ponto de interseção na parede
let wallSnapPreviewWall = null;       // Parede alvo do snap
let wallSnapPreviewDimensions = null; // Array de cotas de divisão do preview
let wallSnapPreviewType = null;       // Tipo de snap: 'perpendicular', 'endpoint', 'edge'

// Getters
export function getWallSnapPreviewActive() {
    return wallSnapPreviewActive;
}

export function getWallSnapPreviewPoint() {
    return wallSnapPreviewPoint;
}

export function getWallSnapPreviewWall() {
    return wallSnapPreviewWall;
}

export function getWallSnapPreviewDimensions() {
    return wallSnapPreviewDimensions;
}

export function getWallSnapPreviewType() {
    return wallSnapPreviewType;
}

// Setters
export function setWallSnapPreviewActive(active) {
    wallSnapPreviewActive = active;
}

export function setWallSnapPreviewPoint(point) {
    wallSnapPreviewPoint = point;
}

export function setWallSnapPreviewWall(wall) {
    wallSnapPreviewWall = wall;
}

export function setWallSnapPreviewDimensions(dimensions) {
    wallSnapPreviewDimensions = dimensions;
}

export function setWallSnapPreviewType(type) {
    wallSnapPreviewType = type;
}

/**
 * Atualiza o preview de snap da parede
 * @param {Array} point - [x, y] ponto de interseção
 * @param {Object} wall - Parede alvo
 * @param {Array} dimensions - Cotas de divisão
 * @param {string} type - Tipo de snap
 */
export function updateWallSnapPreview(point, wall, dimensions, type) {
    wallSnapPreviewActive = true;
    wallSnapPreviewPoint = point;
    wallSnapPreviewWall = wall;
    wallSnapPreviewDimensions = dimensions;
    wallSnapPreviewType = type;
}

/**
 * Limpa o preview de snap da parede
 */
export function clearWallSnapPreview() {
    wallSnapPreviewActive = false;
    wallSnapPreviewPoint = null;
    wallSnapPreviewWall = null;
    wallSnapPreviewDimensions = null;
    wallSnapPreviewType = null;
}

// Exportar para debug global
if (typeof window !== 'undefined') {
    window.WallSnapPreviewState = {
        getWallSnapPreviewActive,
        getWallSnapPreviewPoint,
        getWallSnapPreviewWall,
        getWallSnapPreviewDimensions,
        getWallSnapPreviewType,
        updateWallSnapPreview,
        clearWallSnapPreview
    };
}
