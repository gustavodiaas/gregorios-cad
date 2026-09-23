import { getCanvas, getCtx } from './state.js';
import { rectangleToVertices, pointInPolygon } from './areas.js';
import { showContextMenuForArea } from './showcontextmenu/showcontextmenuforarea.js';
import { initializeContextMenuListener } from './events/contextMenuUtils.js';
import { initializeKeyboardEvents } from './events/keyboardEvents.js';
import { initializeMouseEvents } from './events/mouseEvents.js';
/**
 * Remove um dialog de forma segura, verificando se ele ainda é filho do document.body
 * @param {HTMLElement} dialog - O elemento dialog a ser removido
 * @param {Function} escListener - O listener de ESC para ser removido
 */
function safeRemoveDialog(dialog, escListener) {
    if (dialog && dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
    }
    if (escListener) {
        document.removeEventListener('keydown', escListener);
    }
}
/**
 * Inicializa todos os event listeners da aplicação.
 */
export function initializeEventListeners() {
    const canvas = getCanvas();
    const ctx = getCtx();
    
    // Inicializar listener do menu de contexto
    initializeContextMenuListener();
    
    // Inicializar eventos de teclado
    initializeKeyboardEvents();
    
    // Inicializar eventos de mouse
    initializeMouseEvents();
}

// Handler functions

export { showContextMenuForArea, isPointInAreaWithTolerance };

/**
 * Verifica se um ponto está dentro de uma área com tolerância para bordas.
 * @param {number[]} point - O ponto a ser verificado [x, y].
 * @param {Object} area - A área a ser verificada, deve ter a propriedade vertices.
 * @param {number} [tolerance=0] - A tolerância em pixels para considerar o ponto dentro da área.
 * @returns {boolean} - Retorna true se o ponto está dentro da área considerando a tolerância, caso contrário, false.
 */
function isPointInAreaWithTolerance(point, area, tolerance = 0) {
        const areaVertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
        
        // Primeiro verificar se está diretamente dentro da área
        if (pointInPolygon(point, areaVertices)) {
            return true;
        }
        
        // Se há tolerância, verificar se está próximo à borda
        if (tolerance > 0) {
            // Calcular a distância mínima do ponto para qualquer borda da área
            let minDistance = Infinity;
            
            for (let i = 0; i < areaVertices.length; i++) {
                const p1 = areaVertices[i];
                const p2 = areaVertices[(i + 1) % areaVertices.length];
                
                // Calcular distância do ponto à linha entre p1 e p2
                const A = point[0] - p1[0];
                const B = point[1] - p1[1];
                const C = p2[0] - p1[0];
                const D = p2[1] - p1[1];
                
                const dot = A * C + B * D;
                const lenSq = C * C + D * D;
                
                if (lenSq === 0) continue; // Vértice duplicado
                
                const param = dot / lenSq;
                let xx, yy;
                
                if (param < 0) {
                    xx = p1[0];
                    yy = p1[1];
                } else if (param > 1) {
                    xx = p2[0];
                    yy = p2[1];
                } else {
                    xx = p1[0] + param * C;
                    yy = p1[1] + param * D;
                }
                
                const dx = point[0] - xx;
                const dy = point[1] - yy;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                minDistance = Math.min(minDistance, distance);
            }
            
            return minDistance <= tolerance;
        }
        
        return false;
    }

