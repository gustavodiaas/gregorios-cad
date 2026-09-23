// Hub Placement State - Estado do modo de posicionamento de hubs
// Controla o feedback visual durante criação de hubs e início de conexões

// Estado do modo de posicionamento
let isHubPlacementActive = false;
let hubPlacementTargetResource = null; // Recurso alvo atual (para preview específico)
let hubPreviewPosition = null; // { x, y } posição do preview
let hubPreviewNormal = null; // { x, y } direção da seta
let hubPreviewIsConstrained = false; // Se a posição foi restringida
let showAllResourcesZones = true; // Mostrar zona em TODOS os recursos quando true

// Estado da animação de piscar
let hubZoneBlinkPhase = 0; // Fase da animação (0-1)
let hubZoneBlinkInterval = null; // Interval ID para animação
const HUB_ZONE_BLINK_SPEED = 800; // ms por ciclo completo (mais lento = transição mais suave)

// Getters
export function getIsHubPlacementActive() {
    return isHubPlacementActive;
}

export function getHubPlacementTargetResource() {
    return hubPlacementTargetResource;
}

export function getHubPreviewPosition() {
    return hubPreviewPosition;
}

export function getHubPreviewNormal() {
    return hubPreviewNormal;
}

export function getHubPreviewIsConstrained() {
    return hubPreviewIsConstrained;
}

export function getHubZoneBlinkPhase() {
    return hubZoneBlinkPhase;
}

export function getShowAllResourcesZones() {
    return showAllResourcesZones;
}

// Setters
export function setIsHubPlacementActive(active) {
    isHubPlacementActive = active;
}

export function setHubPlacementTargetResource(resource) {
    hubPlacementTargetResource = resource;
}

export function setHubPreviewPosition(position) {
    hubPreviewPosition = position;
}

export function setHubPreviewNormal(normal) {
    hubPreviewNormal = normal;
}

export function setHubPreviewIsConstrained(constrained) {
    hubPreviewIsConstrained = constrained;
}

export function setShowAllResourcesZones(show) {
    showAllResourcesZones = show;
}

/**
 * Ativa o modo de posicionamento de hub com animação
 * @param {Object} targetResource - Recurso alvo (opcional)
 * @param {boolean} showAll - Se deve mostrar zona em todos os recursos (padrão: true)
 */
export function activateHubPlacementMode(targetResource = null, showAll = true) {
    isHubPlacementActive = true;
    hubPlacementTargetResource = targetResource;
    hubPreviewPosition = null;
    hubPreviewNormal = null;
    hubPreviewIsConstrained = false;
    showAllResourcesZones = showAll;
    
    // Iniciar animação de piscar
    startHubZoneBlink();
}

/**
 * Desativa o modo de posicionamento de hub
 */
export function deactivateHubPlacementMode() {
    isHubPlacementActive = false;
    hubPlacementTargetResource = null;
    hubPreviewPosition = null;
    hubPreviewNormal = null;
    hubPreviewIsConstrained = false;
    
    // Parar animação
    stopHubZoneBlink();
}

/**
 * Atualiza o preview do hub
 * @param {Object} position - { x, y }
 * @param {Object} normal - { x, y }
 * @param {boolean} isConstrained - Se a posição foi restringida
 * @param {Object} targetResource - Recurso alvo
 */
export function updateHubPreview(position, normal, isConstrained, targetResource) {
    hubPreviewPosition = position;
    hubPreviewNormal = normal;
    hubPreviewIsConstrained = isConstrained;
    hubPlacementTargetResource = targetResource;
}

/**
 * Limpa o preview do hub (mantendo o modo ativo)
 */
export function clearHubPreview() {
    hubPreviewPosition = null;
    hubPreviewNormal = null;
    hubPreviewIsConstrained = false;
}

/**
 * Inicia a animação de piscar da zona válida
 */
function startHubZoneBlink() {
    if (hubZoneBlinkInterval) {
        clearInterval(hubZoneBlinkInterval);
    }
    
    hubZoneBlinkPhase = 0;
    const startTime = Date.now();
    
    hubZoneBlinkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // Usar seno para transição suave entre 0 e 1
        hubZoneBlinkPhase = (Math.sin(elapsed / HUB_ZONE_BLINK_SPEED * Math.PI * 2) + 1) / 2;
        
        // Disparar redesenho
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(() => {
                if (typeof window.drawAll === 'function') {
                    window.drawAll(false); // Redesenhar apenas camada dinâmica
                }
            });
        }
    }, 16); // ~60fps
}

/**
 * Para a animação de piscar
 */
function stopHubZoneBlink() {
    if (hubZoneBlinkInterval) {
        clearInterval(hubZoneBlinkInterval);
        hubZoneBlinkInterval = null;
    }
    hubZoneBlinkPhase = 0;
}

// Exportar para acesso global (debug)
if (typeof window !== 'undefined') {
    window.HubPlacementState = {
        getIsHubPlacementActive,
        getHubPlacementTargetResource,
        getHubPreviewPosition,
        getHubPreviewNormal,
        getShowAllResourcesZones,
        activateHubPlacementMode,
        deactivateHubPlacementMode,
        updateHubPreview,
        clearHubPreview
    };
}

// ============================================================================
// ESTADO DE EDIÇÃO DE ZONAS DE EXCLUSÃO
// ============================================================================

/** Hub cuja zona de exclusão está sendo editada (null = sem edição ativa) */
let editingExclusionHubId = null;

/** Aresta sendo arrastada: 'top' | 'bottom' | 'left' | 'right' | null */
let draggingExclusionEdge = null;

/** Aresta sob hover: 'top' | 'bottom' | 'left' | 'right' | null */
let hoveredExclusionEdge = null;

/** Dimensões originais no início de um drag (para undo/cancel) */
let exclusionDragStartDims = null;

// Getters
export function getEditingExclusionHubId() {
    return editingExclusionHubId;
}

export function getDraggingExclusionEdge() {
    return draggingExclusionEdge;
}

export function getHoveredExclusionEdge() {
    return hoveredExclusionEdge;
}

export function getExclusionDragStartDims() {
    return exclusionDragStartDims;
}

// Setters
export function setEditingExclusionHubId(hubId) {
    editingExclusionHubId = hubId;
}

export function setDraggingExclusionEdge(edge) {
    draggingExclusionEdge = edge;
}

export function setHoveredExclusionEdge(edge) {
    hoveredExclusionEdge = edge;
}

export function setExclusionDragStartDims(dims) {
    exclusionDragStartDims = dims;
}

/**
 * Ativa o modo de edição de zona de exclusão para um hub.
 * @param {string} hubId
 */
export function activateExclusionEditing(hubId) {
    editingExclusionHubId = hubId;
    draggingExclusionEdge = null;
    hoveredExclusionEdge = null;
    exclusionDragStartDims = null;
}

/**
 * Desativa o modo de edição de zona de exclusão.
 */
export function deactivateExclusionEditing() {
    editingExclusionHubId = null;
    draggingExclusionEdge = null;
    hoveredExclusionEdge = null;
    exclusionDragStartDims = null;
}
