import { 
    getCanvas, 
    getScale, 
    getOffsetXCanvas, 
    getOffsetYCanvas,
    movementAreas,
    walls
} from '../state.js';
import { alignmentTolerance, gridSpacingPx, pixelsPerCm } from '../config.js';
import { findResourceAtPosition } from '../resources.js';
import { isPointInArea, calculateBoundingBox } from '../areas.js';

/**
 * Converte coordenadas do mouse para coordenadas do mundo
 * @param {MouseEvent} e - Evento do mouse
 * @returns {Object} Coordenadas do mundo {x, y}
 */
export function getMousePos(e) {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    
    // Only log canvas dimensions if there's an issue (rect is invalid)
    if (rect.width <= 0 || rect.height <= 0) {
        // Canvas rect issue detected
    }
    
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    
    // Coordenadas do mundo (considerando zoom e pan)
    const worldX = (canvasX - getOffsetXCanvas()) / getScale();
    const worldY = (canvasY - getOffsetYCanvas()) / getScale();
    
    // Only log mouse calculations in debug mode or when there are issues
    const scale = getScale();
    if (scale <= 0 || isNaN(worldX) || isNaN(worldY)) {
        // Mouse position calculation issue detected
    }
    
    // Aplicar snap universal aqui!
    const snappedPos = snapToGrid(worldX, worldY);
    
    return {
        x: snappedPos.x,
        y: snappedPos.y
    };
}

/**
 * Encontra a área na posição especificada
 * @param {Object} pos - Posição {x, y}
 * @returns {Object|null} Área encontrada ou null
 */
export function getAreaAtPos(pos) {
    // Primeiro verificar se há um recurso na posição
    const resourceAtPos = findResourceAtPosition(pos.x, pos.y);
    if (resourceAtPos) {
        return null; // Prioridade aos recursos
    }
    
    // Procurar da área mais recente para a mais antiga (para priorizar áreas criadas por último)
    for (let i = movementAreas.length - 1; i >= 0; i--) {
        const area = movementAreas[i];
        if (isPointInArea(pos, area)) {
            return area;
        }
    }
    
    return null;
}

/**
 * Encontra uma parede na posição especificada
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {Object|null} Parede encontrada ou null
 */
export function findWallAtPos(x, y) {
    const tolerance = 10 / getScale(); // Tolerance in world coordinates
    
    for (let wall of walls) {
        if (!wall.startPoint || !wall.endPoint) continue;
        
        // Calculate distance from point to wall line segment
        const A = x - wall.startPoint[0];
        const B = y - wall.startPoint[1];
        const C = wall.endPoint[0] - wall.startPoint[0];
        const D = wall.endPoint[1] - wall.startPoint[1];
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) continue; // Wall has zero length
        
        const param = dot / lenSq;
        let xx, yy;
        
        if (param < 0) {
            xx = wall.startPoint[0];
            yy = wall.startPoint[1];
        } else if (param > 1) {
            xx = wall.endPoint[0];
            yy = wall.endPoint[1];
        } else {
            xx = wall.startPoint[0] + param * C;
            yy = wall.startPoint[1] + param * D;
        }
        
        const dx = x - xx;
        const dy = y - yy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= tolerance) {
            return wall;
        }
    }
    
    return null;
}

/**
 * Aplica snap para a grade centimétrica.
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {Object} Coordenadas com snap {x, y}
 */
export function snapToGrid(x, y) {
    const gridSize = pixelsPerCm; // A menor unidade é 1 cm
    return {
        x: Math.round(x / gridSize) * gridSize,
        y: Math.round(y / gridSize) * gridSize
    };
}

/**
 * Gera guias de alinhamento para uma área sendo movida
 * @param {Object} movingArea - Área sendo movida
 * @param {number} newX - Nova coordenada X
 * @param {number} newY - Nova coordenada Y
 * @returns {Array} Array de guias de alinhamento
 */
export function getAlignmentGuides(movingArea, newX, newY) {
    const guides = [];
    const tolerance = alignmentTolerance;
    
    // Calcular centro da área que está sendo movida
    const movingCenterX = newX + movingArea.width / 2;
    const movingCenterY = newY + movingArea.height / 2;
    
    // Arrays para armazenar posições para cálculo de centralização
    const verticalPositions = [];
    const horizontalPositions = [];
    
    movementAreas.forEach(area => {
        if (area.id === movingArea.id) return;
        
        // Usar bounding box calculado dos vértices para coordenadas consistentes
        let areaBB;
        if (area.vertices && area.vertices.length > 0) {
            areaBB = calculateBoundingBox(area.vertices);
        } else {
            // Tratamento para áreas retangulares antigas
            areaBB = { x: area.x, y: area.y, width: area.width, height: area.height };
        }
        
        // Coletar posições para centralização usando bounding box calculado
        verticalPositions.push(areaBB.x, areaBB.x + areaBB.width);
        horizontalPositions.push(areaBB.y, areaBB.y + areaBB.height);
        
        // Alinhamento de bordas usando coordenadas calculadas
        if (Math.abs(areaBB.y - newY) < tolerance) {
            guides.push({ type: 'horizontal', value: areaBB.y, snapY: areaBB.y });
        }
        if (Math.abs((areaBB.y + areaBB.height) - (newY + movingArea.height)) < tolerance) {
            guides.push({ type: 'horizontal', value: areaBB.y + areaBB.height, snapY: areaBB.y + areaBB.height - movingArea.height });
        }
        if (Math.abs(areaBB.x - newX) < tolerance) {
            guides.push({ type: 'vertical', value: areaBB.x, snapX: areaBB.x });
        }
        if (Math.abs((areaBB.x + areaBB.width) - (newX + movingArea.width)) < tolerance) {
            guides.push({ type: 'vertical', value: areaBB.x + areaBB.width, snapX: areaBB.x + areaBB.width - movingArea.width });
        }
        
        // Alinhamento de centros usando coordenadas calculadas
        const areaCenterX = areaBB.x + areaBB.width / 2;
        const areaCenterY = areaBB.y + areaBB.height / 2;
        
        if (Math.abs(areaCenterX - movingCenterX) < tolerance) {
            guides.push({ 
                type: 'vertical', 
                value: areaCenterX, 
                snapX: areaCenterX - movingArea.width / 2 
            });
        }
        if (Math.abs(areaCenterY - movingCenterY) < tolerance) {
            guides.push({ 
                type: 'horizontal', 
                value: areaCenterY, 
                snapY: areaCenterY - movingArea.height / 2 
            });
        }
    });
    
    // Verificar centralização entre áreas
    // Centralização vertical (entre duas áreas horizontalmente alinhadas)
    for (let i = 0; i < verticalPositions.length; i++) {
        for (let j = i + 1; j < verticalPositions.length; j++) {
            const pos1 = verticalPositions[i];
            const pos2 = verticalPositions[j];
            const centerBetween = (pos1 + pos2) / 2;
            if (Math.abs(movingCenterX - centerBetween) < tolerance) {
                guides.push({
                    type: 'vertical',
                    value: centerBetween,
                    snapX: centerBetween - movingArea.width / 2,
                    isCenterGuide: true
                });
            }
        }
    }
    
    // Centralização horizontal (entre duas áreas verticalmente alinhadas)
    for (let i = 0; i < horizontalPositions.length; i++) {
        for (let j = i + 1; j < horizontalPositions.length; j++) {
            const pos1 = horizontalPositions[i];
            const pos2 = horizontalPositions[j];
            const centerBetween = (pos1 + pos2) / 2;
            if (Math.abs(movingCenterY - centerBetween) < tolerance) {
                guides.push({
                    type: 'horizontal',
                    value: centerBetween,
                    snapY: centerBetween - movingArea.height / 2,
                    isCenterGuide: true
                });
            }
        }
    }
    
    return guides;
}
