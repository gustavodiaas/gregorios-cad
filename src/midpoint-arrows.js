// Sistema de indicador de setas direcionais para midpoints
import { 
    getActiveMidpointIndex, setActiveMidpointIndex,
    getActiveMidpointAreaId, setActiveMidpointAreaId,
    getMidpointArrowsVisible, setMidpointArrowsVisible,
    getCanvas, getOffsetXCanvas, getOffsetYCanvas, getScale,
    getMidpointVertices, getIsEditingPolygon, movementAreas,
    getOriginalVerticesOnDrag, setOriginalVerticesOnDrag,
    getSelectedEdgeInfo, setSelectedEdgeInfo
} from './state.js';
import { pixelsPerCm } from './config.js';
import { updateMidpointDrag } from './polygon.js';
import { drawAll } from './drawing.js';

// Variável para controlar timeout do auto-hide
let autoHideTimeout = null;

/**
 * Calcula as direções de movimento possíveis para um midpoint
 * @param {Object} midpoint - O midpoint selecionado
 * @param {Array} areaVertices - Vértices da área
 * @returns {Array} - Array com as direções possíveis ['up', 'down', 'left', 'right']
 */
function calculatePossibleDirections(midpoint, areaVertices) {
    const vertex1 = areaVertices[midpoint.vertex1Index];
    const vertex2 = areaVertices[midpoint.vertex2Index];
    
    // Calcular vetor da aresta
    const edgeVector = [vertex2[0] - vertex1[0], vertex2[1] - vertex1[1]];
    const edgeLength = Math.sqrt(edgeVector[0] * edgeVector[0] + edgeVector[1] * edgeVector[1]);
    
    if (edgeLength === 0) return [];
    
    // Vetor normal à aresta (perpendicular)
    const normalVector = [-edgeVector[1] / edgeLength, edgeVector[0] / edgeLength];
    
    const directions = [];
    
    // Determinar direções baseadas no vetor normal
    if (Math.abs(normalVector[0]) > 0.3) { // Movimento horizontal significativo
        if (normalVector[0] > 0) directions.push('right');
        if (normalVector[0] < 0) directions.push('left');
    }
    
    if (Math.abs(normalVector[1]) > 0.3) { // Movimento vertical significativo
        if (normalVector[1] > 0) directions.push('down');
        if (normalVector[1] < 0) directions.push('up');
    }
    
    return directions;
}

/**
 * Mostra o indicador de setas direcionais para um midpoint
 * @param {number} midpointIndex - Índice do midpoint
 * @param {string} areaId - ID da área que contém o midpoint
 */
export function showMidpointArrowsIndicator(midpointIndex, areaId) {
    const indicator = document.getElementById('midpointArrowsIndicator');
    if (!indicator) return;

    // Cancelar qualquer timeout anterior
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
        autoHideTimeout = null;
    }

    const midpoints = getMidpointVertices();
    if (!midpoints || midpointIndex < 0 || midpointIndex >= midpoints.length) return;

    const midpoint = midpoints[midpointIndex];
    const area = movementAreas.find(a => a.id === areaId);
    if (!area || !area.vertices) return;

    // Verificar se já não está ativo o mesmo midpoint
    if (getActiveMidpointIndex() === midpointIndex && getActiveMidpointAreaId() === areaId && getMidpointArrowsVisible()) {
        return; // Já está ativo, não fazer nada
    }

    // Calcular direções possíveis
    const possibleDirections = calculatePossibleDirections(midpoint, area.vertices);
    
    // Mostrar apenas as teclas das direções possíveis
    const keys = indicator.querySelectorAll('.key');
    keys.forEach(key => {
        const direction = key.dataset.direction;
        if (possibleDirections.includes(direction)) {
            key.style.display = 'flex';
            key.classList.add('active');
        } else {
            key.style.display = 'none';
            key.classList.remove('active');
        }
    });

    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    const scale = getScale();
    const offsetX = getOffsetXCanvas();
    const offsetY = getOffsetYCanvas();

    // Converter coordenadas do canvas para coordenadas da tela
    const screenX = (midpoint.position[0] + offsetX) * scale + rect.left;
    const screenY = (midpoint.position[1] + offsetY) * scale + rect.top;

    // Posicionar o indicador ao lado do midpoint (offset para não sobrepor)
    indicator.style.left = `${screenX + 40}px`; // 40px de offset para direita
    indicator.style.top = `${screenY - 50}px`;  // 50px de offset para cima
    indicator.style.display = 'block';

    // Atualizar estado
    setActiveMidpointIndex(midpointIndex);
    setActiveMidpointAreaId(areaId);
    setMidpointArrowsVisible(true);

    // Auto-hide após 4 segundos
    autoHideTimeout = setTimeout(() => {
        hideMidpointArrowsIndicator();
    }, 4000);
}

/**
 * Esconde o indicador de setas direcionais
 */
export function hideMidpointArrowsIndicator() {
    // Cancelar timeout se houver
    if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
        autoHideTimeout = null;
    }

    const indicator = document.getElementById('midpointArrowsIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }

    // Remover destaque da aresta
    removeEdgeHighlight();

    // Limpar estado do teclado
    setOriginalVerticesOnDrag([]);
    setActiveMidpointIndex(null);
    setActiveMidpointAreaId(null);
    setMidpointArrowsVisible(false);
}

/**
 * Atualiza a posição do indicador quando o canvas é movido
 */
export function updateMidpointArrowsIndicatorPosition() {
    if (!getMidpointArrowsVisible()) return;

    const midpointIndex = getActiveMidpointIndex();
    const areaId = getActiveMidpointAreaId();
    
    if (midpointIndex !== null && areaId !== null) {
        showMidpointArrowsIndicator(midpointIndex, areaId);
    }
}

/**
 * Manipula o movimento do midpoint usando as setas do teclado
 * @param {string} direction - Direção do movimento
 */
export function moveMidpointWithArrows(direction) {
    const midpointIndex = getActiveMidpointIndex();
    const areaId = getActiveMidpointAreaId();
    
    if (midpointIndex === null || areaId === null || !getIsEditingPolygon()) return;

    const area = movementAreas.find(a => a.id === areaId);
    if (!area) return;

    const midpoints = getMidpointVertices();
    if (!midpoints || midpointIndex < 0 || midpointIndex >= midpoints.length) return;

    // Ensure originalVerticesOnDrag is set for keyboard movement
    const originalVertices = getOriginalVerticesOnDrag();
    if (!originalVertices || originalVertices.length === 0) {
        setOriginalVerticesOnDrag(area.vertices.map(v => [v[0], v[1]]));
    }

    const midpoint = midpoints[midpointIndex];
    
    // Movimento fino: 1cm (pixelsPerCm)
    const stepSize = pixelsPerCm;
    let deltaX = 0;
    let deltaY = 0;

    switch (direction) {
        case 'up':
            deltaY = -stepSize;
            break;
        case 'down':
            deltaY = stepSize;
            break;
        case 'left':
            deltaX = -stepSize;
            break;
        case 'right':
            deltaX = stepSize;
            break;
        default:
            return;
    }

    const newMouseX = midpoint.position[0] + deltaX;
    const newMouseY = midpoint.position[1] + deltaY;

    updateMidpointDrag(area, midpointIndex, newMouseX, newMouseY);
    drawAll();
    
    setTimeout(() => {
        updateMidpointArrowsIndicatorPosition();
    }, 10);
}

/**
 * Destaca a aresta selecionada no canvas
 * @param {number} midpointIndex - Índice do midpoint
 * @param {string} areaId - ID da área
 */
/**
 * Destaca a aresta selecionada
 * @param {number} midpointIndex - Índice do midpoint
 * @param {string} areaId - ID da área
 */
export function highlightSelectedEdge(midpointIndex, areaId) {
    // Remover qualquer destaque anterior
    removeEdgeHighlight();
    
    // Armazenar informações da aresta selecionada para uso no drawing.js
    const selectedEdgeInfo = {
        midpointIndex,
        areaId,
        isActive: true
    };
    
    // Armazenar no estado global (vamos adicionar isso ao state.js)
    setSelectedEdgeInfo(selectedEdgeInfo);
}

/**
 * Remove o destaque da aresta
 */
export function removeEdgeHighlight() {
    // Limpar informações da aresta selecionada
    setSelectedEdgeInfo(null);
    drawAll();
}

/**
 * Inicializa o sistema de indicador de setas
 */
export function initializeMidpointArrowsSystem() {
    window.addEventListener('resize', updateMidpointArrowsIndicatorPosition);
}
