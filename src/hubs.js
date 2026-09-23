/**
 * @fileoverview Sistema de gerenciamento de hubs (pontos de parada para operadores)
 * Unifica a lógica de registro global e gerenciamento de conexões.
 * 
 * @description
 * Hubs são pontos de conexão em recursos que definem onde conexões podem
 * começar ou terminar. Todos os hubs são armazenados em um registro global
 * único (array `hubs`), independente de serem criados via menu ou por conexões.
 * 
 * @module hubs
 */

/** @typedef {import('./types.js').Hub} Hub */
/** @typedef {import('./types.js').HubLookupResult} HubLookupResult */
/** @typedef {import('./types.js').Resource} Resource */
/** @typedef {import('./types.js').EntityId} EntityId */
/** @typedef {import('./types.js').PointXY} PointXY */

import { resources, getNextHubId, getCurrentFloorId, getAllFloors } from './state.js';
import * as Drawing from './drawing.js';
import { anchorToWorldCoordinates, calculateAnchorPoint, getHubSnapRadius, HUB_VISUAL_RADIUS_BASE, getHubNumericId, getHubVisualRadius } from './connections/connectionUtils.js';
import { calculateNormalAtPosition } from './hub-placement-helper.js';
import { getBoundaryOpeningAnchorInfo, getOpeningDisplayName, openings as allOpenings } from './openings.js';

// triggerExclusionRipple is loaded lazily to avoid circular dependency
let _triggerExclusionRipple = null;
async function fireTriggerExclusionRipple(hubId) {
    if (!_triggerExclusionRipple) {
        const mod = await import('./hub-exclusion-zones.js');
        _triggerExclusionRipple = mod.triggerExclusionRipple;
    }
    _triggerExclusionRipple(hubId);
}

/**
 * Fontes de criação de hubs
 * @readonly
 * @enum {string}
 */
export const HUB_SOURCES = {
    /** Hub criado via menu de contexto */
    MENU: 'menu',
    /** Hub criado automaticamente por uma conexão */
    CONNECTION: 'connection'
};

/**
 * Registro global de todos os hubs do sistema
 * @type {Hub[]}
 */
export let hubs = [];

/**
 * Contador legado de displayNumber — mantido para compatibilidade com
 * clearAllHubs / loadHubs que ainda fazem reset manual.
 * @type {number}
 * @private
 */
let nextDisplayNumber = 1;

/**
 * Armazenamento específico para hubs de escada (portais entre andares)
 * @type {Map<EntityId, Hub>}
 * @private
 */
const stairPortalHubs = new Map();

/**
 * Obtém o próximo número de exibição para um recurso específico.
 * A contagem é por recurso, não global.
 * @param {string|null} resourceId - ID do recurso
 * @returns {number} Próximo número sequencial para o recurso
 */
function getNextDisplayNumberForResource(resourceId) {
    if (!resourceId) {
        // Para hubs sem recurso, contar apenas hubs sem recurso
        const hubsWithoutResource = hubs.filter(h => !h.resourceId);
        return hubsWithoutResource.length + 1;
    }
    // Contar apenas hubs do mesmo recurso
    const hubsOfResource = hubs.filter(h => h.resourceId === resourceId);
    return hubsOfResource.length + 1;
}

/**
 * Recalcula os displayNumbers de todos os hubs existentes.
 * Agora calcula por recurso: cada recurso tem sua própria sequência começando em 1.
 * Deve ser chamado após carregar hubs do arquivo ou sincronizar.
 */
export function recalculateDisplayNumbers() {
    // Função auxiliar para extrair timestamp do ID semântico
    const getTimestamp = (id) => {
        if (!id || typeof id !== 'string') return 0;
        const parts = id.split('-');
        if (parts.length >= 2) {
            return parseInt(parts[1], 36) || 0;
        }
        return 0;
    };

    // Agrupar hubs por resourceId
    const hubsByResource = new Map();
    hubs.forEach(hub => {
        const resourceKey = hub.resourceId || '__NO_RESOURCE__';
        if (!hubsByResource.has(resourceKey)) {
            hubsByResource.set(resourceKey, []);
        }
        hubsByResource.get(resourceKey).push(hub);
    });

    // Para cada grupo de recurso, ordenar por timestamp e atribuir números sequenciais
    hubsByResource.forEach((resourceHubs, resourceKey) => {
        // Ordenar por data de criação
        resourceHubs.sort((a, b) => getTimestamp(a.id) - getTimestamp(b.id));
        
        // Atribuir números sequenciais dentro do recurso (começando em 1)
        resourceHubs.forEach((hub, index) => {
            const hubInArray = hubs.find(h => h.id === hub.id);
            if (hubInArray) {
                hubInArray.displayNumber = index + 1;
            }
        });
    });
}

/**
 * Retorna o maior displayNumber atual entre os hubs de um recurso específico.
 * @param {string|null} resourceId - ID do recurso
 * @returns {number} Maior número de exibição encontrado ou 0
 */
function getMaxDisplayNumberForResource(resourceId) {
    const resourceHubs = hubs.filter(h => 
        resourceId ? h.resourceId === resourceId : !h.resourceId
    );
    if (resourceHubs.length === 0) return 0;
    return Math.max(...resourceHubs.map(h => h.displayNumber || 0));
}

// --- Funções Auxiliares Privadas ---

function findResource(resourceId) {
    if (!resourceId) return null;
    // Primeiro buscar no andar atual (acesso mais rápido)
    const local = resources.find(r => r.id === resourceId);
    if (local) return local;
    // Fallback: buscar em TODOS os pavimentos (para hubs de outros andares)
    const allFloors = getAllFloors();
    if (allFloors && allFloors.length > 0) {
        for (const floor of allFloors) {
            if (floor && Array.isArray(floor.resources)) {
                const found = floor.resources.find(r => r.id === resourceId);
                if (found) return found;
            }
        }
    }
    return null;
}

function isStairResource(resource) {
    return Boolean(resource && (resource.type === 'stair' || resource.stairConfig));
}

function buildDefaultHubName(id, resourceName, displayNumber = null) {
    // Usar displayNumber se fornecido, senão buscar no array de hubs
    let numericId = displayNumber;
    if (numericId === null) {
        numericId = getHubNumericId(id, hubs);
    }
    const numberLabel = numericId !== null ? `HUB ${numericId}` : 'HUB';
    // Formato: RECURSO - HUB N (recurso como prefixo)
    return resourceName ? `${resourceName} - ${numberLabel}` : numberLabel;
}

function shouldAnchor(data) {
    return Boolean(
        data.resourceId &&
        typeof data.localX === 'number' &&
        typeof data.localY === 'number'
    );
}

function computeWorldPosition(resourceId, localX, localY) {
    const resource = findResource(resourceId);
    if (!resource || typeof localX !== 'number' || typeof localY !== 'number') {
        return null;
    }
    return anchorToWorldCoordinates(resource, { x: localX, y: localY });
}

// Atualiza a posição global (x,y) baseada na posição do recurso e offsets locais
function refreshHubWorldPosition(hub) {
    if (!hub) {
        return null;
    }
    if (hub.isAnchored && hub.resourceId && typeof hub.localX === 'number' && typeof hub.localY === 'number') {
        const worldCoords = computeWorldPosition(hub.resourceId, hub.localX, hub.localY);
        if (worldCoords) {
            hub.x = worldCoords.x;
            hub.y = worldCoords.y;
        }
    }
    return hub;
}

function getStairHubCandidates(resourceId) {
    const result = [];
    stairPortalHubs.forEach(hub => {
        if (hub.resourceId === resourceId) {
            result.push(hub);
        }
    });
    return result;
}

// --- Core do Registro (CRUD) ---

function upsertHubRecord(data, options = {}) {
    const { skipRedraw = false } = options;
    const id = data?.id;

    if (!id) {
        console.warn('[Hubs] Tentativa de registrar hub sem ID', data);
        return null;
    }

    const resourceName = data.resourceName || findResource(data.resourceId)?.name || data.resourceId || null;
    const anchored = shouldAnchor(data);
    const worldPosition = anchored
        ? computeWorldPosition(data.resourceId, data.localX, data.localY)
        : { x: data.x, y: data.y };

    const existing = hubs.find(h => h.id === id);

    if (existing) {
        existing.resourceId = data.resourceId ?? existing.resourceId ?? null;
        existing.localX = anchored ? data.localX : existing.localX ?? null;
        existing.localY = anchored ? data.localY : existing.localY ?? null;
        existing.normalX = data.normalX ?? existing.normalX ?? null;
        existing.normalY = data.normalY ?? existing.normalY ?? null;
        existing.isAnchored = anchored || existing.isAnchored || false;
        existing.source = data.source || existing.source || HUB_SOURCES.MENU;
        // Manter displayNumber existente, atualizar nome se necessário
        const targetName = data.name || buildDefaultHubName(id, resourceName, existing.displayNumber);
        existing.name = targetName || existing.name;
        // Atualizar lista de conexões se fornecida (merge arrays)
        if (data.connectionIds) {
            if (!existing.connectionIds) existing.connectionIds = [];
            data.connectionIds.forEach(cid => {
                if (!existing.connectionIds.includes(cid)) existing.connectionIds.push(cid);
            });
        }
        
        if (worldPosition?.x != null && worldPosition?.y != null) {
            existing.x = worldPosition.x;
            existing.y = worldPosition.y;
        }

        if (!skipRedraw) {
            Drawing.drawAll();
        }
        return existing;
    }

    // Novo hub - atribuir displayNumber sequencial por recurso
    const displayNumber = data.displayNumber ?? getNextDisplayNumberForResource(data.resourceId);
    const targetName = data.name || buildDefaultHubName(id, resourceName, displayNumber);

    const hubRecord = {
        id,
        displayNumber,
        x: worldPosition?.x ?? 0,
        y: worldPosition?.y ?? 0,
        resourceId: data.resourceId ?? null,
        localX: anchored ? data.localX : null,
        localY: anchored ? data.localY : null,
        normalX: data.normalX ?? null,
        normalY: data.normalY ?? null,
        isAnchored: anchored,
        source: data.source || HUB_SOURCES.MENU,
        name: targetName,
        floorId: data.floorId || getCurrentFloorId(),
        color: data.color || '#4f46e5',
        radius: data.radius || HUB_VISUAL_RADIUS_BASE,
        connectionIds: data.connectionIds || [],
        exclusionFar: data.exclusionFar ?? null,
        exclusionNear: data.exclusionNear ?? null,
        exclusionRight: data.exclusionRight ?? null,
        exclusionLeft: data.exclusionLeft ?? null
    };

    hubs.push(hubRecord);
    if (!skipRedraw) {
        Drawing.drawAll();
    }
    return hubRecord;
}

function removeHubRecord(hubId, options = {}) {
    const { skipRedraw = false, onlyConnections = false } = options;
    const index = hubs.findIndex(h => h.id === hubId);
    if (index === -1) {
        return null;
    }

    if (onlyConnections && hubs[index].source !== HUB_SOURCES.CONNECTION) {
        return null;
    }

    const [removed] = hubs.splice(index, 1);
    if (!skipRedraw) {
        Drawing.drawAll();
    }
    return removed;
}

// Nota: IDs semânticos (hub-xxxx-yyyyyy) são únicos por timestamp+random.
// O displayNumber é usado apenas para exibição amigável ao usuário (Hub 1, Hub 2, etc.)

// --- Funções Públicas de Criação e Gerenciamento ---

/**
 * Encontra ou cria um hub em um recurso para uma posição específica e conexão.
 * UNIFICADO: Todos os hubs vivem apenas no registro global hubs[]
 */
export function findOrCreateHub(resource, worldX, worldY, connectionId) {
    const localPoint = calculateAnchorPoint(resource, worldX, worldY);
    const snapRadius = getHubSnapRadius();

    // Buscar hub existente no registro global para este recurso
    const resourceHubs = hubs.filter(h => h.resourceId === resource.id);
    
    for (const hub of resourceHubs) {
        const distance = Math.sqrt(
            Math.pow((hub.localX || 0) - localPoint.x, 2) + 
            Math.pow((hub.localY || 0) - localPoint.y, 2)
        );
        
        if (distance <= snapRadius) {
            // Hub existente encontrado - adicionar connectionId se não existir
            if (!hub.connectionIds) hub.connectionIds = [];
            if (!hub.connectionIds.includes(connectionId)) {
                hub.connectionIds.push(connectionId);
            }
            return hub.id;
        }
    }
    
    // Criar novo hub no registro global
    const worldCoords = anchorToWorldCoordinates(resource, localPoint);
    
    // Calcular a normal (direção para fora do recurso) para a forma de gota
    const normal = calculateNormalAtPosition(worldX, worldY, resource);
    
    const newHub = upsertHubRecord({
        id: getNextHubId(),
        resourceId: resource.id,
        resourceName: resource.name || resource.id,
        localX: localPoint.x,
        localY: localPoint.y,
        normalX: normal ? normal.x : null,
        normalY: normal ? normal.y : null,
        x: worldCoords.x,
        y: worldCoords.y,
        connectionIds: [connectionId],
        floorId: resource.floorId,
        isAnchored: true
    }, { skipRedraw: true });
    
    if (newHub) fireTriggerExclusionRipple(newHub.id);
    return newHub.id;
}

/**
 * Remove uma conexão de um hub.
 * O hub permanece mesmo sem conexões (pode ser usado para roteiros).
 */
export function removeConnectionFromHub(hubId, connectionId) {
    const hub = hubs.find(h => h.id === hubId);
    if (!hub) return;
    
    if (hub.connectionIds) {
        const connectionIndex = hub.connectionIds.indexOf(connectionId);
        if (connectionIndex !== -1) {
            hub.connectionIds.splice(connectionIndex, 1);
        }
    }
    
    // NOTA: Hub permanece no registro mesmo sem conexões
    // Isso permite que hubs sejam usados para roteiros de fabricação
    // independentemente de terem conexões desenhadas
}

// Criar um novo hub manual (Menu)
export function createHub(x, y, resourceId = null, normal = null) {
    const id = getNextHubId();
    let localX = null;
    let localY = null;
    let floorId = null;
    
    if (resourceId) {
        const resource = findResource(resourceId);
        if (resource) {
            floorId = resource.floorId;
            if (typeof window !== 'undefined' && window.connectionUtils?.calculateAnchorPoint) {
                const localPoint = window.connectionUtils.calculateAnchorPoint(resource, x, y);
                localX = localPoint.x;
                localY = localPoint.y;
            }
        }
    }
    
    const hub = upsertHubRecord({
        id,
        x,
        y,
        resourceId,
        localX,
        localY,
        normalX: normal ? normal.x : null,
        normalY: normal ? normal.y : null,
        source: HUB_SOURCES.MENU,
        floorId
    });
    if (hub) fireTriggerExclusionRipple(hub.id);
    return hub;
}

export function createHubForResource(resourceId, offsetX = 0, offsetY = 0) {
    const resource = findResource(resourceId);
    if (!resource) return null;
    const x = resource.x + (resource.width || 50) / 2 + offsetX;
    const y = resource.y + (resource.height || 50) / 2 + offsetY;
    return createHub(x, y, resourceId);
}

/**
 * Cria um hub ancorado a uma abertura de borda (DOCA).
 * O hub é posicionado no ponto central da abertura, com a normal apontando para fora.
 * O hub NÃO é ancorado a um recurso, mas sim à abertura de borda.
 * @param {string} openingId - ID da abertura de borda
 * @returns {Hub|null} Hub criado ou null se falhou
 */
export function createHubForBoundaryOpening(openingId) {
    const anchorInfo = getBoundaryOpeningAnchorInfo(openingId);
    if (!anchorInfo) {
        console.warn('[Hubs] Abertura de borda não encontrada:', openingId);
        return null;
    }
    
    // Verificar se já existe um hub para esta abertura
    const existing = hubs.find(h => h.boundaryOpeningId === openingId);
    if (existing) {
        console.warn('[Hubs] Já existe hub para esta abertura:', openingId);
        return existing;
    }
    
    const id = getNextHubId();
    // Buscar nome personalizado da abertura para o hub
    const opening = allOpenings.find(o => o.id === openingId);
    const openingName = opening && opening.name ? opening.name : 'DOCA';
    const hub = upsertHubRecord({
        id,
        x: anchorInfo.x,
        y: anchorInfo.y,
        normalX: anchorInfo.normalX,
        normalY: anchorInfo.normalY,
        source: HUB_SOURCES.MENU,
        name: `${openingName} - HUB`,
        isAnchored: false, // Não ancorado a recurso, ancorado à abertura
        boundaryOpeningId: openingId
    });
    
    if (hub) {
        hub.boundaryOpeningId = openingId;
        fireTriggerExclusionRipple(hub.id);
    }
    
    return hub;
}

/**
 * Retorna hubs associados a uma abertura de borda.
 * @param {string} openingId - ID da abertura de borda
 * @returns {Hub[]} Hubs associados
 */
export function getHubsForBoundaryOpening(openingId) {
    return hubs.filter(h => h.boundaryOpeningId === openingId);
}

// Registrar hubs criados via conexões no array global
export function registerConnectionHub(resource, hubData, options = {}) {
    if (!resource || !hubData) return null;
    
    return upsertHubRecord({
        id: hubData.id,
        resourceId: resource.id,
        resourceName: resource.name || resource.id,
        localX: hubData.localX,
        localY: hubData.localY,
        source: HUB_SOURCES.CONNECTION,
        name: hubData.name,
        floorId: resource.floorId,
        connectionIds: hubData.connectionIds
    }, { skipRedraw: options.skipRedraw !== undefined ? options.skipRedraw : true });
}

export function unregisterHubRecordById(hubId, options = {}) {
    return removeHubRecord(hubId, options);
}

// Sincroniza o registro global com os hubs armazenados nos recursos
/**
 * Sincroniza posições dos hubs com seus recursos.
 * UNIFICADO: Todos os hubs já estão em hubs[], apenas atualiza posições.
 */
export function syncHubRegistryWithResources(options = {}) {
    const { skipRedraw = false } = options;

    // Atualizar posições de todos os hubs ancorados
    hubs.forEach(hub => {
        if (hub.resourceId && hub.isAnchored) {
            refreshHubWorldPosition(hub);
        }
    });

    // Recalcular displayNumbers para manter consistência
    recalculateDisplayNumbers();

    if (!skipRedraw) {
        Drawing.drawAll();
    }
}

// --- Consultas ---

// Obter hub por ID e garantir posição atualizada
export function getHubById(hubId) {
    const hub = hubs.find(h => h.id === hubId);
    return refreshHubWorldPosition(hub);
}

/**
 * Retorna { resource, hub } para compatibilidade com sistema de conexões.
 * UNIFICADO: Busca apenas no registro global hubs[]
 */
export function findHubById(hubId) {
    const hub = getHubById(hubId);
    if (!hub) return null;
    
    if (hub.resourceId) {
        const resource = findResource(hub.resourceId);
        if (resource) {
            return { resource, hub };
        }
    }
    
    // Hub sem recurso (livre)
    return { resource: null, hub };
}

export function getAllHubRecords() {
    hubs.forEach(refreshHubWorldPosition);
    return hubs;
}

export function getHubWorldCoordinates(hubId) {
    // Usa o registro global que já tem a lógica de refresh
    const hub = getHubById(hubId);
    if (hub) {
        return { x: hub.x, y: hub.y };
    }
    
    // Fallback para cálculo direto se não estiver no registro global
    const hubData = findHubById(hubId);
    if (hubData && hubData.resource) {
        return anchorToWorldCoordinates(hubData.resource, {
            x: hubData.hub.localX,
            y: hubData.hub.localY
        });
    }
    return null;
}

export function getHubConnectionCount(hubId) {
    const hubData = findHubById(hubId); // Procura na fonte original (recurso/escada)
    if (hubData && hubData.hub && Array.isArray(hubData.hub.connectionIds)) {
        return hubData.hub.connectionIds.length;
    }
    
    const globalHub = getHubById(hubId); // Procura no registro
    if (globalHub && Array.isArray(globalHub.connectionIds)) {
        return globalHub.connectionIds.length;
    }
    
    return 0;
}

/**
 * UNIFICADO: Conta conexões totais em todos os hubs de um recurso.
 */
export function getResourceHubConnectionCount(resourceId) {
    let totalConnections = 0;

    // Usar registro global unificado
    hubs.forEach(hub => {
        if (hub.resourceId === resourceId) {
            totalConnections += (hub.connectionIds?.length || 0);
        }
    });

    // Hubs de escada
    stairPortalHubs.forEach(hub => {
        if (hub.resourceId === resourceId) {
            totalConnections += (hub.connectionIds?.length || 0);
        }
    });
    
    return totalConnections;
}

/**
 * UNIFICADO: Retorna todos os hubs de um recurso.
 * Fonte única: registro global hubs[] + stairPortalHubs
 */
export function getHubsForResource(resourceId) {
    const collectedHubs = new Map();

    // 1. Hubs do registro global (única fonte de verdade)
    hubs.forEach(hub => {
        if (hub.resourceId === resourceId) {
            collectedHubs.set(hub.id, hub);
        }
    });

    // 2. Hubs de escada (integrar no futuro)
    stairPortalHubs.forEach(hub => {
        if (hub.resourceId === resourceId) {
            collectedHubs.set(hub.id, hub);
        }
    });
    
    return Array.from(collectedHubs.values());
}

/**
 * Clona todos os hubs de um recurso para um novo recurso (duplicata).
 * Preserva as coordenadas locais (localX, localY) e normais, pois a forma é idêntica.
 * As cópias não herdam conexões — começam como hubs independentes.
 * @param {string} originalResourceId - ID do recurso original
 * @param {object} newResource - Objeto do novo recurso (cópia)
 * @param {number} deltaX - Deslocamento X da cópia em relação ao original
 * @param {number} deltaY - Deslocamento Y da cópia em relação ao original
 * @returns {Hub[]} Array com os novos hubs criados
 */
export function cloneHubsForResource(originalResourceId, newResource, deltaX, deltaY) {
    const originalHubs = hubs.filter(h => h.resourceId === originalResourceId);
    if (originalHubs.length === 0) return [];

    const cloned = [];
    for (const hub of originalHubs) {
        const newId = getNextHubId();
        const displayNumber = cloned.length + 1;
        const newHub = {
            ...hub,
            id: newId,
            resourceId: newResource.id,
            x: hub.x + deltaX,
            y: hub.y + deltaY,
            connectionIds: [],          // cópia começa sem conexões
            name: buildDefaultHubName(newId, newResource.name || newResource.id, displayNumber),
            displayNumber,
            floorId: newResource.floorId || hub.floorId
        };
        hubs.push(newHub);
        cloned.push(newHub);
    }

    // Re-numerar todos os hubs do novo recurso de forma consistente
    recalculateDisplayNumbers();
    return cloned;
}

export function getHubStatistics() {
    const stats = {
        totalHubs: 0,
        totalConnections: 0,
        hubsByResource: {},
        connectionsByHub: {}
    };
    
    // Iterar sobre registro global para estatísticas
    hubs.forEach(hub => {
        stats.totalHubs++;
        const resId = hub.resourceId || 'free'; // 'free' para hubs não ancorados
        stats.hubsByResource[resId] = (stats.hubsByResource[resId] || 0) + 1;
        
        const connCount = hub.connectionIds?.length || 0;
        stats.totalConnections += connCount;
        stats.connectionsByHub[hub.id] = connCount;
    });
    
    return stats;
}

// --- Operações de UI ---

/**
 * Remove um hub do sistema.
 * UNIFICADO: Qualquer hub pode ser removido, mas avisa se tem conexões.
 */
export function removeHub(hubId) {
    const hub = getHubById(hubId);
    if (!hub) return null;

    // Avisar se o hub tem conexões ativas
    const connectionCount = hub.connectionIds?.length || 0;
    if (connectionCount > 0) {
        console.warn(`[Hubs] Hub ${hubId} tem ${connectionCount} conexões ativas. As conexões serão desconectadas.`);
    }

    const removed = removeHubRecord(hubId);
    return removed;
}

/**
 * Remove todos os hubs de um recurso específico.
 * Usado na união de recursos para garantir que o novo recurso unido
 * não herde coordenadas locais inválidas (que eram relativas ao centroide antigo).
 * 
 * @param {string} resourceId - ID do recurso
 * @param {Object} options - Opções de remoção
 * @param {boolean} options.skipRedraw - Se true, não redesenha após remoção
 * @returns {number} Número de hubs removidos
 */
/**
 * UNIFICADO: Remove todos os hubs de um recurso.
 * Usado ao deletar/mergear recursos.
 */
export function removeAllHubsFromResource(resourceId, options = {}) {
    const { skipRedraw = false } = options;
    let removedCount = 0;

    // 1. Remover do registro global (única fonte)
    const hubsToRemove = hubs.filter(h => h.resourceId === resourceId);
    hubsToRemove.forEach(hub => {
        removeHubRecord(hub.id, { skipRedraw: true });
        removedCount++;
    });

    // 2. Remover de escadas (stairPortalHubs) - integrar no futuro
    const stairHubsToRemove = [];
    stairPortalHubs.forEach((hub, id) => {
        if (hub.resourceId === resourceId) {
            stairHubsToRemove.push(id);
        }
    });
    stairHubsToRemove.forEach(id => {
        stairPortalHubs.delete(id);
        removedCount++;
    });

    if (!skipRedraw && removedCount > 0) {
        Drawing.drawAll();
    }
    return removedCount;
}

export function moveHub(hubId, newX, newY) {
    const hub = getHubById(hubId);
    if (hub && !hub.isAnchored) {
        hub.x = newX;
        hub.y = newY;
        Drawing.drawAll();
        return true;
    }
    return false;
}

/**
 * Sincroniza hubs de boundary openings após movimento de área.
 * Move hubs que estão associados a boundary openings pelo mesmo delta.
 * @param {number} dx - Deslocamento X
 * @param {number} dy - Deslocamento Y
 * @param {string[]} movedOpeningIds - IDs das aberturas que foram movidas
 */
export function syncBoundaryOpeningHubs(dx, dy, movedOpeningIds) {
    if (!movedOpeningIds || movedOpeningIds.length === 0) return;
    
    hubs.forEach(hub => {
        if (hub.boundaryOpeningId && movedOpeningIds.includes(hub.boundaryOpeningId)) {
            hub.x += dx;
            hub.y += dy;
        }
    });
}

/**
 * Sincroniza hubs de boundary openings após rotação de área.
 * @param {number} centerX - Centro de rotação X
 * @param {number} centerY - Centro de rotação Y
 * @param {number} angleDegrees - Ângulo de rotação
 * @param {string[]} rotatedOpeningIds - IDs das aberturas rotacionadas
 */
export function syncBoundaryOpeningHubsRotation(centerX, centerY, angleDegrees, rotatedOpeningIds) {
    if (!rotatedOpeningIds || rotatedOpeningIds.length === 0) return;
    
    const angleRad = angleDegrees * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    hubs.forEach(hub => {
        if (hub.boundaryOpeningId && rotatedOpeningIds.includes(hub.boundaryOpeningId)) {
            const relX = hub.x - centerX;
            const relY = hub.y - centerY;
            hub.x = centerX + relX * cos - relY * sin;
            hub.y = centerY + relX * sin + relY * cos;
        }
    });
}

export function renameHub(hubId, newName) {
    const hub = getHubById(hubId);
    if (hub) {
        hub.name = newName;
        Drawing.drawAll();
        return true;
    }
    return false;
}

/**
 * Atualiza os nomes dos hubs de um recurso quando o recurso é renomeado.
 * Apenas hubs cujo nome segue o padrão auto-gerado ("oldName - HUB N") são atualizados.
 * Hubs com nomes customizados pelo usuário não são alterados.
 * @param {string} resourceId - ID do recurso renomeado
 * @param {string} oldResourceName - Nome antigo do recurso
 * @param {string} newResourceName - Nome novo do recurso
 */
export function updateHubNamesForResource(resourceId, oldResourceName, newResourceName) {
    if (!resourceId || !newResourceName) return;

    const resourceHubs = getHubsForResource(resourceId);
    if (!resourceHubs.length) return;

    let updated = false;
    resourceHubs.forEach(hub => {
        // Verificar se o nome do hub segue o padrão auto-gerado: "resourceName - HUB N"
        const autoPattern = oldResourceName
            ? new RegExp(`^${oldResourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*HUB\\s+\\d+$`, 'i')
            : /^HUB\s+\d+$/i;

        if (autoPattern.test(hub.name)) {
            // Reconstruir o nome com o novo prefixo, preservando o número
            hub.name = buildDefaultHubName(hub.id, newResourceName, hub.displayNumber);
            updated = true;
        }
    });

    if (updated) {
        Drawing.drawAll();
    }
}

/**
 * Atualiza os nomes dos hubs associados a uma abertura de borda quando a abertura é renomeada.
 * @param {string} openingId - ID da abertura de borda
 * @param {string|null} newOpeningName - Novo nome da abertura (null para padrão "DOCA")
 */
export function updateHubNamesForBoundaryOpening(openingId, newOpeningName) {
    const boundaryHubs = getHubsForBoundaryOpening(openingId);
    if (!boundaryHubs.length) return;

    const displayName = newOpeningName || 'DOCA';
    boundaryHubs.forEach(hub => {
        hub.name = `${displayName} - HUB`;
    });

    Drawing.drawAll();
}

export function clearAllHubs(options = {}) {
    const { includeConnection = false } = options;
    if (includeConnection) {
        hubs = [];
        stairPortalHubs.clear();
        // Resetar contador quando limpa tudo
        nextDisplayNumber = 1;
    } else {
        hubs = hubs.filter(hub => hub.source === HUB_SOURCES.CONNECTION);
        // Recalcular displayNumbers para hubs restantes
        recalculateDisplayNumbers();
    }
    Drawing.drawAll();
}

export function getHubAtPosition(x, y, threshold = null) {
    // Se threshold não fornecido, usar raio visual do hub * 1.5 para facilitar clique
    // O raio visual já está em coordenadas do mundo (dividido pela escala)
    const visualRadius = getHubVisualRadius();
    const effectiveThreshold = threshold ?? Math.max(visualRadius * 1.5, 15);
    
    for (const hub of hubs) {
        refreshHubWorldPosition(hub);
        const dx = hub.x - x;
        const dy = hub.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= effectiveThreshold) {
            return hub;
        }
    }
    return null;
}

// --- Persistência ---

export function serializeHubs() {
    // Serializa apenas hubs manuais
    return hubs
        .filter(hub => hub.source !== HUB_SOURCES.CONNECTION)
        .map(hub => ({
            id: hub.id,
            displayNumber: hub.displayNumber,
            x: hub.x,
            y: hub.y,
            resourceId: hub.resourceId,
            localX: hub.localX,
            localY: hub.localY,
            normalX: hub.normalX ?? null,
            normalY: hub.normalY ?? null,
            name: hub.name,
            floorId: hub.floorId,
            color: hub.color,
            radius: hub.radius,
            boundaryOpeningId: hub.boundaryOpeningId || null,
            exclusionFar: hub.exclusionFar || null,
            exclusionNear: hub.exclusionNear || null,
            exclusionRight: hub.exclusionRight || null,
            exclusionLeft: hub.exclusionLeft || null
        }));
}

export function loadHubs(hubsData) {
    if (!Array.isArray(hubsData)) {
        console.warn('[Hubs] Dados inválidos para carregar hubs');
        return;
    }

    // Limpar apenas hubs manuais existentes, manter os de conexão
    hubs = hubs.filter(hub => hub.source === HUB_SOURCES.CONNECTION);
    
    // Resetar contador de displayNumber
    nextDisplayNumber = 1;

    hubsData.forEach(data => {
        const hub = upsertHubRecord({
            id: data.id,
            displayNumber: data.displayNumber, // Preservar displayNumber salvo
            x: data.x,
            y: data.y,
            resourceId: data.resourceId || null,
            localX: data.localX,
            localY: data.localY,
            normalX: data.normalX ?? null,
            normalY: data.normalY ?? null,
            name: data.name,
            floorId: data.floorId,
            color: data.color,
            radius: data.radius,
            source: HUB_SOURCES.MENU,
            exclusionFar: data.exclusionFar || null,
            exclusionNear: data.exclusionNear || null,
            exclusionRight: data.exclusionRight || null,
            exclusionLeft: data.exclusionLeft || null
        }, { skipRedraw: true });
        // Restaurar boundaryOpeningId se existir
        if (data.boundaryOpeningId && hub) {
            hub.boundaryOpeningId = data.boundaryOpeningId;
        }
    });

    // Recalcular displayNumbers para garantir consistência
    // (caso hubs antigos não tenham displayNumber)
    recalculateDisplayNumbers();

    // Migração: recalcular normalX/normalY para hubs que não possuem
    // (arquivos salvos antes da correção de serialização de normais)
    for (const hub of hubs) {
        if (hub.normalX != null && hub.normalY != null) continue;
        if (hub.resourceId) {
            const resource = findResource(hub.resourceId);
            if (resource) {
                const normal = calculateNormalAtPosition(hub.x, hub.y, resource);
                if (normal) {
                    hub.normalX = normal.x;
                    hub.normalY = normal.y;
                }
            }
        }
    }

    Drawing.drawAll();

    // Reiniciar loop de animação de pulso das zonas de exclusão se há hubs
    if (hubs.length > 0) {
        import('./hub-exclusion-zones.js').then(({ ensurePulseLoopRunning }) => {
            ensurePulseLoopRunning();
        });
    }
}

// Funções auxiliares de debug (não mais necessário window.HubsModule)
if (typeof window !== 'undefined') {
    window.clearStairPortalHubs = () => stairPortalHubs.clear();
}
