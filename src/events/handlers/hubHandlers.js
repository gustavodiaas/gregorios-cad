/**
 * Handlers para eventos de mouse relacionados a hubs e zonas de exclusão
 */
import { saveStateToHistory } from '../../history.js';
import { findResourceAtPosition } from '../../resources.js';
import { createHub, getHubById } from '../../hubs.js';
import { setActiveTool } from '../../active_tool.js';
import {
    getEditingExclusionHubId,
    getDraggingExclusionEdge,
    setDraggingExclusionEdge,
    setHoveredExclusionEdge,
    getHoveredExclusionEdge,
    setExclusionDragStartDims,
    deactivateExclusionEditing
} from '../../state.js';
import { getScale } from '../../state.js';
import {
    getExclusionEdgeAtPoint,
    applyExclusionEdgeDrag,
    getExclusionEdgeDistances
} from '../../hub-exclusion-zones.js';
import { drawAll } from '../../drawing.js';
import { pixelsPerCm } from '../../config.js';

/**
 * Manipula o clique para criar hub
 */
export function handleCreateHubMouseDown(pos) {
    // Verificar se está sobre um recurso
    const resource = findResourceAtPosition(pos.x, pos.y);
    const resourceId = resource ? resource.id : null;
    
    createHub(pos.x, pos.y, resourceId);
    saveStateToHistory('Adicionar hub');
    setActiveTool(null);
}

// ============================================================================
// EDIÇÃO DE ZONAS DE EXCLUSÃO — DRAG DE ARESTAS
// ============================================================================

/** Posição do mouse ao iniciar drag (para calcular delta) */
let exclusionDragStartPos = null;

/** Direção da normal do hub ao iniciar drag (para projetar delta) */
let exclusionDragNormal = null;
let exclusionDragPerp = null;

/**
 * Verifica se o mouse está sobre uma aresta de exclusão (modo de edição ativo).
 * Atualiza o estado de hover e o cursor.
 * @param {object} pos - Posição do mouse no canvas
 * @returns {boolean} true se interceptou o evento
 */
export function handleExclusionEdgeHover(pos) {
    const editingHubId = getEditingExclusionHubId();
    if (!editingHubId) return false;
    
    const hub = getHubById(editingHubId);
    if (!hub) return false;
    
    const currentScale = getScale();
    const edge = getExclusionEdgeAtPoint(pos.x, pos.y, hub, currentScale);
    const prevEdge = getHoveredExclusionEdge();
    
    if (edge !== prevEdge) {
        setHoveredExclusionEdge(edge);
        drawAll(false);
    }
    
    return !!edge;
}

/**
 * Tenta iniciar o drag de uma aresta de exclusão se o clique caiu sobre uma.
 * @param {object} pos - Posição do mouse no canvas
 * @returns {boolean} true se iniciou drag (consumiu o evento)
 */
export function handleExclusionEdgeMouseDown(pos) {
    const editingHubId = getEditingExclusionHubId();
    if (!editingHubId) return false;
    
    const hub = getHubById(editingHubId);
    if (!hub) return false;
    
    const currentScale = getScale();
    const edge = getExclusionEdgeAtPoint(pos.x, pos.y, hub, currentScale);
    if (!edge) return false;
    
    // Iniciar drag
    setDraggingExclusionEdge(edge);
    const startDists = getExclusionEdgeDistances(hub);
    setExclusionDragStartDims(startDists);
    exclusionDragStartPos = { x: pos.x, y: pos.y };
    
    // Calcular vetores de projeção
    const nx = hub.normalX ?? 0;
    const ny = hub.normalY ?? 0;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > 0) {
        exclusionDragNormal = { x: nx / len, y: ny / len };
        exclusionDragPerp = { x: -ny / len, y: nx / len };
    }
    
    return true;
}

/**
 * Processa o arraste da aresta de exclusão.
 * @param {object} pos - Posição atual do mouse
 * @returns {boolean} true se interceptou o evento
 */
export function handleExclusionEdgeDrag(pos) {
    const edge = getDraggingExclusionEdge();
    if (!edge) return false;
    
    const editingHubId = getEditingExclusionHubId();
    if (!editingHubId) return false;
    
    const hub = getHubById(editingHubId);
    if (!hub || !exclusionDragStartPos || !exclusionDragNormal) return false;
    
    // Calcular delta do mouse
    const dx = pos.x - exclusionDragStartPos.x;
    const dy = pos.y - exclusionDragStartPos.y;
    
    // Projetar delta na direção relevante
    if (edge === 'top' || edge === 'bottom') {
        // Delta ao longo da normal
        const deltaNormal = dx * exclusionDragNormal.x + dy * exclusionDragNormal.y;
        applyExclusionEdgeDragFromStart(hub, edge, deltaNormal);
    } else {
        // Delta perpendicular à normal
        const deltaPerp = dx * exclusionDragPerp.x + dy * exclusionDragPerp.y;
        applyExclusionEdgeDragFromStart(hub, edge, deltaPerp);
    }
    
    drawAll(false);
    return true;
}

/**
 * Aplica o drag relativo às dimensões iniciais (evita acumular erros).
 * Cada aresta controla apenas a sua própria distância — sem bilateralidade.
 */
function applyExclusionEdgeDragFromStart(hub, edge, deltaPx) {
    const deltaCm = deltaPx / pixelsPerCm;
    const MIN = 20; // cm mínimo para arestas normais
    
    // Armazenar distâncias iniciais na primeira chamada
    if (hub._dragStartFar == null) {
        const d = getExclusionEdgeDistances(hub);
        hub._dragStartFar   = d.far;
        hub._dragStartNear  = d.near;
        hub._dragStartRight = d.right;
        hub._dragStartLeft  = d.left;
    }
    
    if (edge === 'top') {
        hub.exclusionFar = Math.max(MIN, hub._dragStartFar + deltaCm);
    } else if (edge === 'bottom') {
        hub.exclusionNear = Math.max(0, hub._dragStartNear - deltaCm);
    } else if (edge === 'right') {
        hub.exclusionRight = Math.max(MIN, hub._dragStartRight + deltaCm);
    } else if (edge === 'left') {
        hub.exclusionLeft = Math.max(MIN, hub._dragStartLeft - deltaCm);
    }
}

/**
 * Finaliza o drag da aresta de exclusão.
 * @returns {boolean} true se havia drag ativo
 */
export function handleExclusionEdgeMouseUp() {
    const edge = getDraggingExclusionEdge();
    if (!edge) return false;
    
    const editingHubId = getEditingExclusionHubId();
    const hub = editingHubId ? getHubById(editingHubId) : null;
    
    // Limpar estado temporário
    if (hub) {
        delete hub._dragStartFar;
        delete hub._dragStartNear;
        delete hub._dragStartRight;
        delete hub._dragStartLeft;
    }
    
    setDraggingExclusionEdge(null);
    exclusionDragStartPos = null;
    exclusionDragNormal = null;
    exclusionDragPerp = null;
    
    saveStateToHistory('Redimensionar zona de exclusão');
    drawAll(false);
    
    return true;
}

/**
 * Retorna o cursor adequado para a aresta hovered/drag.
 * @returns {string|null} CSS cursor ou null
 */
export function getExclusionEdgeCursor() {
    const editingHubId = getEditingExclusionHubId();
    if (!editingHubId) return null;
    
    const edge = getDraggingExclusionEdge() || getHoveredExclusionEdge();
    if (!edge) return null;
    
    // Dependendo da orientação do hub, usar cursor adequado
    // Simplificação: usar nwse-resize para top/bottom, nesw-resize para left/right
    if (edge === 'top' || edge === 'bottom') return 'ns-resize';
    if (edge === 'left' || edge === 'right') return 'ew-resize';
    return 'pointer';
}
