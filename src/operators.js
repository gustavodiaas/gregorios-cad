import { createPolygonalResource } from './resources.js';
import { pixelsPerCm } from './config.js';
import { rectangleToVertices, pointInPolygon } from './areas.js';
import { movementAreas, resources } from './state.js';

const OPERATOR_SIZE_CM = 80;
const OPERATOR_SPRITE_KEY = 'stopped-man';
const operatorSpriteUrl = new URL('../stopped man.gif', import.meta.url).href;

const operatorSpriteImage = new Image();
let operatorSpriteLoaded = false;

operatorSpriteImage.addEventListener('load', () => {
    operatorSpriteLoaded = true;
    if (typeof window !== 'undefined' && typeof window.drawAll === 'function') {
        window.drawAll();
    }
});

operatorSpriteImage.addEventListener('error', (error) => {
    console.warn('Falha ao carregar sprite do operador:', error);
});

operatorSpriteImage.src = operatorSpriteUrl;
if (operatorSpriteImage.complete) {
    operatorSpriteLoaded = true;
}

function getAreaContainingPoint(x, y) {
    for (const area of movementAreas) {
        if (!area) continue;
        const vertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
        if (pointInPolygon([x, y], vertices)) {
            return area;
        }
    }
    return null;
}

function areVerticesInsideArea(vertices, area) {
    const areaVertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
    return vertices.every(vertex => pointInPolygon(vertex, areaVertices));
}

function buildOperatorVertices(x, y) {
    const { width, height } = getOperatorDimensions();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return rectangleToVertices(x - halfWidth, y - halfHeight, width, height);
}

function getNextOperatorName() {
    const count = resources.filter(resource => resource?.type === 'operator').length + 1;
    return `Operador ${count}`;
}

export function getOperatorDimensions() {
    const sizePx = OPERATOR_SIZE_CM * pixelsPerCm;
    return { width: sizePx, height: sizePx };
}

export function getOperatorSpriteMeta(requestedKey = OPERATOR_SPRITE_KEY) {
    return {
        image: operatorSpriteImage,
        loaded: operatorSpriteLoaded,
        url: operatorSpriteUrl,
        spriteKey: requestedKey
    };
}

export function createOperatorAtPosition(x, y) {
    const parentArea = getAreaContainingPoint(x, y);
    if (!parentArea) {
        return { resource: null, error: 'outside-area' };
    }

    const operatorVertices = buildOperatorVertices(x, y);
    if (!areVerticesInsideArea(operatorVertices, parentArea)) {
        return { resource: null, error: 'outside-area' };
    }

    const operatorResource = createPolygonalResource(
        operatorVertices,
        'rgba(255,255,255,0)',
        parentArea.id,
        true,
        {
            type: 'operator',
            spriteKey: OPERATOR_SPRITE_KEY,
            name: getNextOperatorName(),
            allowConnectionsThrough: true
        }
    );
    if (!operatorResource) {
        return { resource: null, error: 'creation-failed' };
    }

    return { resource: operatorResource, error: null };
}
