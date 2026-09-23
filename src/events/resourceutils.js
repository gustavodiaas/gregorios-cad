import { resources } from '../state.js';

/**
 * Gera linhas guia para alinhamento de recursos durante movimento
 * @param {object} movingResource - Recurso sendo movido
 * @param {number} newX - Nova posição X proposta (origem do bounding box)
 * @param {number} newY - Nova posição Y proposta (origem do bounding box)
 * @returns {Array} Array de linhas guia
 */
export function generateResourceAlignmentGuides(movingResource, newX, newY) {
    if (!movingResource || !resources) return [];
    if (movingResource?.type === 'operator') {
        return [];
    }
    
    const guides = [];
    const snapDistance = 3; // Distância para ativação das linhas guia (reduzido para permitir ajustes finos)
    
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
    
    // Examinar todos os outros recursos para alinhamento
    resources.forEach(resource => {
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
        
        // Linha guia vertical - alinhamento dos centros
        const centerVerticalDistance = Math.abs(movingCenterX - centerX);
        if (centerVerticalDistance < snapDistance) {
            guides.push({
                type: 'vertical',
                position: centerX,
                start: Math.min(movingCenterY, centerY) - 50,
                end: Math.max(movingCenterY, centerY) + 50,
                color: '#00ff00',
                width: 2,
                dashPattern: [5, 5],
                alpha: 0.8,
                snapX: centerX - movingBounds.width / 2,
                distance: centerVerticalDistance,
                isCenterGuide: true
            });
        }
        
        // Linha guia horizontal - alinhamento dos centros
        const centerHorizontalDistance = Math.abs(movingCenterY - centerY);
        if (centerHorizontalDistance < snapDistance) {
            guides.push({
                type: 'horizontal',
                position: centerY,
                start: Math.min(movingCenterX, centerX) - 50,
                end: Math.max(movingCenterX, centerX) + 50,
                color: '#00ff00',
                width: 2,
                dashPattern: [5, 5],
                alpha: 0.8,
                snapY: centerY - movingBounds.height / 2,
                distance: centerHorizontalDistance,
                isCenterGuide: true
            });
        }
        
        // Linhas guia para alinhamento de bordas
        
        // Alinhamento vertical das bordas esquerdas
        const leftEdgeDistance = Math.abs(movingLeft - left);
        if (leftEdgeDistance < snapDistance) {
            guides.push({
                type: 'vertical',
                position: left,
                start: Math.min(movingBounds.y, bounds.y) - 20,
                end: Math.max(movingBounds.y + movingBounds.height, bounds.y + bounds.height) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapX: left,
                distance: leftEdgeDistance
            });
        }
        
        // Alinhamento vertical das bordas direitas
        const rightEdgeDistance = Math.abs(movingRight - right);
        if (rightEdgeDistance < snapDistance) {
            guides.push({
                type: 'vertical',
                position: right,
                start: Math.min(movingBounds.y, bounds.y) - 20,
                end: Math.max(movingBounds.y + movingBounds.height, bounds.y + bounds.height) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapX: right - movingBounds.width,
                distance: rightEdgeDistance
            });
        }
        
        // Alinhamento horizontal das bordas superiores
        const topEdgeDistance = Math.abs(movingTop - top);
        if (topEdgeDistance < snapDistance) {
            guides.push({
                type: 'horizontal',
                position: top,
                start: Math.min(movingBounds.x, bounds.x) - 20,
                end: Math.max(movingBounds.x + movingBounds.width, bounds.x + bounds.width) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapY: top,
                distance: topEdgeDistance
            });
        }
        
        // Alinhamento horizontal das bordas inferiores
        const bottomEdgeDistance = Math.abs(movingBottom - bottom);
        if (bottomEdgeDistance < snapDistance) {
            guides.push({
                type: 'horizontal',
                position: bottom,
                start: Math.min(movingBounds.x, bounds.x) - 20,
                end: Math.max(movingBounds.x + movingBounds.width, bounds.x + bounds.width) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapY: bottom - movingBounds.height,
                distance: bottomEdgeDistance
            });
        }

        // Alinhamento cruzado: esquerda com direita
        const leftToRightDistance = Math.abs(movingLeft - right);
        if (leftToRightDistance < snapDistance) {
            guides.push({
                type: 'vertical',
                position: right,
                start: Math.min(movingBounds.y, bounds.y) - 20,
                end: Math.max(movingBounds.y + movingBounds.height, bounds.y + bounds.height) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapX: right,
                distance: leftToRightDistance
            });
        }

        // Alinhamento cruzado: direita com esquerda
        const rightToLeftDistance = Math.abs(movingRight - left);
        if (rightToLeftDistance < snapDistance) {
            guides.push({
                type: 'vertical',
                position: left,
                start: Math.min(movingBounds.y, bounds.y) - 20,
                end: Math.max(movingBounds.y + movingBounds.height, bounds.y + bounds.height) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapX: left - movingBounds.width,
                distance: rightToLeftDistance
            });
        }

        // Alinhamento cruzado: topo com fundo
        const topToBottomDistance = Math.abs(movingTop - bottom);
        if (topToBottomDistance < snapDistance) {
            guides.push({
                type: 'horizontal',
                position: bottom,
                start: Math.min(movingBounds.x, bounds.x) - 20,
                end: Math.max(movingBounds.x + movingBounds.width, bounds.x + bounds.width) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapY: bottom,
                distance: topToBottomDistance
            });
        }

        // Alinhamento cruzado: fundo com topo
        const bottomToTopDistance = Math.abs(movingBottom - top);
        if (bottomToTopDistance < snapDistance) {
            guides.push({
                type: 'horizontal',
                position: top,
                start: Math.min(movingBounds.x, bounds.x) - 20,
                end: Math.max(movingBounds.x + movingBounds.width, bounds.x + bounds.width) + 20,
                color: '#ff6600',
                width: 1,
                dashPattern: [3, 3],
                alpha: 0.7,
                snapY: top - movingBounds.height,
                distance: bottomToTopDistance
            });
        }
    });
    
    // Removido: Linhas guia para alinhamento com áreas de movimentação
    // Os recursos devem apenas se alinhar com outros recursos, não com áreas
    
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
    if (!resource || resource.type === 'operator') {
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
