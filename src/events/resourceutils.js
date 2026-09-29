import { getScale, movementAreas, resources, walls } from '../state.js';
import { getSnapSettings, isResourceSnapEnabled } from '../snap-settings.js';

/**
 * Gera linhas guia para alinhamento de recursos durante movimento
 * @param {object} movingResource - Recurso sendo movido
 * @param {number} newX - Nova posição X proposta (origem do bounding box)
 * @param {number} newY - Nova posição Y proposta (origem do bounding box)
 * @returns {Array} Array de linhas guia
 */
export function generateResourceAlignmentGuides(movingResource, newX, newY) {
    if (!movingResource || !resources || !isResourceSnapEnabled()) return [];
    if (movingResource?.type === 'operator') {
        return [];
    }
    
    const guides = [];
    const settings = getSnapSettings();
    const snapDistance = settings.snapPx / Math.max(getScale(), 0.1);
    
    const currentBounds = calculateResourceBounds(movingResource);
    if (!currentBounds) return guides;

    const movingBounds = {
        x: typeof newX === 'number' ? newX : currentBounds.x,
        y: typeof newY === 'number' ? newY : currentBounds.y,
        width: currentBounds.width,
        height: currentBounds.height
    };

    const movingCenterX = movingBounds.x + movingBounds.width / 2;
    const movingCenterY = movingBounds.y + movingBounds.height / 2;
    const movingLeft = movingBounds.x;
    const movingRight = movingBounds.x + movingBounds.width;
    const movingTop = movingBounds.y;
    const movingBottom = movingBounds.y + movingBounds.height;
    
    const addVerticalGuide = (target, snapX, distance, start, end, kind = 'edge') => {
        if (distance >= snapDistance) return;
        guides.push({
            type: 'vertical', position: target, start, end, snapX, distance,
            color: kind === 'center' ? '#0a84ff' : kind === 'spacing' ? '#af52de' : '#ff9f0a',
            isCenterGuide: kind === 'center', guideKind: kind
        });
    };
    const addHorizontalGuide = (target, snapY, distance, start, end, kind = 'edge') => {
        if (distance >= snapDistance) return;
        guides.push({
            type: 'horizontal', position: target, start, end, snapY, distance,
            color: kind === 'center' ? '#0a84ff' : kind === 'spacing' ? '#af52de' : '#ff9f0a',
            isCenterGuide: kind === 'center', guideKind: kind
        });
    };

    // Centros, extremidades e folga configurável entre equipamentos.
    if (settings.objects) resources.forEach(resource => {
        if (resource.id === movingResource.id || resource._plannerHidden) return;
        if (resource.visible === false) return;
        
        const bounds = calculateResourceBounds(resource);
        if (!bounds) return;

        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const left = bounds.x;
        const right = bounds.x + bounds.width;
        const top = bounds.y;
        const bottom = bounds.y + bounds.height;
        
        const verticalStart = Math.min(movingTop, top) - 20;
        const verticalEnd = Math.max(movingBottom, bottom) + 20;
        const horizontalStart = Math.min(movingLeft, left) - 20;
        const horizontalEnd = Math.max(movingRight, right) + 20;

        addVerticalGuide(centerX, centerX - movingBounds.width / 2, Math.abs(movingCenterX - centerX), verticalStart, verticalEnd, 'center');
        addHorizontalGuide(centerY, centerY - movingBounds.height / 2, Math.abs(movingCenterY - centerY), horizontalStart, horizontalEnd, 'center');
        addVerticalGuide(left, left, Math.abs(movingLeft - left), verticalStart, verticalEnd);
        addVerticalGuide(right, right - movingBounds.width, Math.abs(movingRight - right), verticalStart, verticalEnd);
        addHorizontalGuide(top, top, Math.abs(movingTop - top), horizontalStart, horizontalEnd);
        addHorizontalGuide(bottom, bottom - movingBounds.height, Math.abs(movingBottom - bottom), horizontalStart, horizontalEnd);
        addVerticalGuide(right, right, Math.abs(movingLeft - right), verticalStart, verticalEnd);
        addVerticalGuide(left, left - movingBounds.width, Math.abs(movingRight - left), verticalStart, verticalEnd);
        addHorizontalGuide(bottom, bottom, Math.abs(movingTop - bottom), horizontalStart, horizontalEnd);
        addHorizontalGuide(top, top - movingBounds.height, Math.abs(movingBottom - top), horizontalStart, horizontalEnd);

        if (settings.clearanceEnabled && settings.clearanceCm > 0) {
            const gap = settings.clearanceCm;
            addVerticalGuide(right + gap, right + gap, Math.abs(movingLeft - (right + gap)), verticalStart, verticalEnd, 'spacing');
            addVerticalGuide(left - gap, left - gap - movingBounds.width, Math.abs(movingRight - (left - gap)), verticalStart, verticalEnd, 'spacing');
            addHorizontalGuide(bottom + gap, bottom + gap, Math.abs(movingTop - (bottom + gap)), horizontalStart, horizontalEnd, 'spacing');
            addHorizontalGuide(top - gap, top - gap - movingBounds.height, Math.abs(movingBottom - (top - gap)), horizontalStart, horizontalEnd, 'spacing');
        }
    });

    const parentArea = movementAreas.find(area => String(area.id) === String(movingResource.parentAreaId));
    if (settings.area && parentArea) {
        const areaBounds = calculateResourceBounds(parentArea);
        const areaCenterX = areaBounds.x + areaBounds.width / 2;
        const areaCenterY = areaBounds.y + areaBounds.height / 2;
        addVerticalGuide(areaBounds.x, areaBounds.x, Math.abs(movingLeft - areaBounds.x), areaBounds.y, areaBounds.y + areaBounds.height, 'area');
        addVerticalGuide(areaBounds.x + areaBounds.width, areaBounds.x + areaBounds.width - movingBounds.width, Math.abs(movingRight - (areaBounds.x + areaBounds.width)), areaBounds.y, areaBounds.y + areaBounds.height, 'area');
        addVerticalGuide(areaCenterX, areaCenterX - movingBounds.width / 2, Math.abs(movingCenterX - areaCenterX), areaBounds.y, areaBounds.y + areaBounds.height, 'center');
        addHorizontalGuide(areaBounds.y, areaBounds.y, Math.abs(movingTop - areaBounds.y), areaBounds.x, areaBounds.x + areaBounds.width, 'area');
        addHorizontalGuide(areaBounds.y + areaBounds.height, areaBounds.y + areaBounds.height - movingBounds.height, Math.abs(movingBottom - (areaBounds.y + areaBounds.height)), areaBounds.x, areaBounds.x + areaBounds.width, 'area');
        addHorizontalGuide(areaCenterY, areaCenterY - movingBounds.height / 2, Math.abs(movingCenterY - areaCenterY), areaBounds.x, areaBounds.x + areaBounds.width, 'center');
    }

    if (settings.walls) walls.forEach(wall => {
        if (!wall?.startPoint || !wall?.endPoint) return;
        if (movingResource.parentAreaId && wall.parentAreaId && String(wall.parentAreaId) !== String(movingResource.parentAreaId)) return;
        const [x1, y1] = wall.startPoint;
        const [x2, y2] = wall.endPoint;
        if (Math.abs(x1 - x2) < 0.01) {
            addVerticalGuide(x1, x1, Math.abs(movingLeft - x1), Math.min(y1, y2), Math.max(y1, y2), 'wall');
            addVerticalGuide(x1, x1 - movingBounds.width, Math.abs(movingRight - x1), Math.min(y1, y2), Math.max(y1, y2), 'wall');
        }
        if (Math.abs(y1 - y2) < 0.01) {
            addHorizontalGuide(y1, y1, Math.abs(movingTop - y1), Math.min(x1, x2), Math.max(x1, x2), 'wall');
            addHorizontalGuide(y1, y1 - movingBounds.height, Math.abs(movingBottom - y1), Math.min(x1, x2), Math.max(x1, x2), 'wall');
        }
    });
    
    return guides;
}

/**
 * Calcula os limites de um recurso (bounding box)
 * @param {object} resource - Recurso para calcular limites
 * @returns {object} Bounding box {x, y, width, height}
 */
export function calculateResourceBounds(resource) {
    if (!resource) return { x: 0, y: 0, width: 0, height: 0 };
    
    // Se tem vértices, usar eles
    if (resource.vertices && resource.vertices.length > 0) {
        let minX = resource.vertices[0][0];
        let maxX = resource.vertices[0][0];
        let minY = resource.vertices[0][1];
        let maxY = resource.vertices[0][1];
        
        for (let i = 1; i < resource.vertices.length; i++) {
            const [x, y] = resource.vertices[i];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }
    
    // Tratamento para recursos retangulares
    return {
        x: resource.x || 0,
        y: resource.y || 0,
        width: resource.width || 0,
        height: resource.height || 0
    };
}

/**
 * Aplica snap automático baseado nas linhas guia ativas
 * @param {object} resource - Recurso sendo movido
 * @param {number} mouseX - Posição X do mouse
 * @param {number} mouseY - Posição Y do mouse
 * @param {Array} guides - Linhas guia ativas
 * @returns {object} Posição ajustada {x, y}
 */
export function applyResourceSnapToGuides(resource, newX, newY, guides) {
    if (!resource || resource.type === 'operator' || !isResourceSnapEnabled()) {
        return { x: newX, y: newY, usedGuides: {} };
    }

    if (!guides || guides.length === 0) return { x: newX, y: newY, usedGuides: {} };
    
    const resourceBounds = calculateResourceBounds(resource);
    if (!resourceBounds) return { x: newX, y: newY, usedGuides: {} };

    const candidateX = typeof newX === 'number' ? newX : resourceBounds.x;
    const candidateY = typeof newY === 'number' ? newY : resourceBounds.y;

    const candidateBounds = {
        x: candidateX,
        y: candidateY,
        width: resourceBounds.width,
        height: resourceBounds.height
    };

    let bestVertical = null;
    let bestHorizontal = null;

    guides.forEach(guide => {
        if (guide.type === 'vertical' && typeof guide.snapX === 'number') {
            if (bestVertical === null || (typeof guide.distance === 'number' && guide.distance < bestVertical.distance)) {
                bestVertical = guide;
            }
        }
        if (guide.type === 'horizontal' && typeof guide.snapY === 'number') {
            if (bestHorizontal === null || (typeof guide.distance === 'number' && guide.distance < bestHorizontal.distance)) {
                bestHorizontal = guide;
            }
        }
    });

    const adjustedX = bestVertical ? bestVertical.snapX : candidateBounds.x;
    const adjustedY = bestHorizontal ? bestHorizontal.snapY : candidateBounds.y;
    
    return { 
        x: adjustedX,
        y: adjustedY,
        usedGuides: {
            vertical: bestVertical || null,
            horizontal: bestHorizontal || null
        }
    };
}
