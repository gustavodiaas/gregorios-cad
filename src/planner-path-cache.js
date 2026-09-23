/**
 * Sistema de Cache de Rotas do Planner
 * 
 * Implementa pré-cálculo de rotas "Just-in-Time" para evitar stuttering
 * durante animações, conforme especificado no TEC_SPEC.MD seção 5.7
 */

import { movementAreas, walls, resources } from './state.js';
import { openings } from './openings.js';
import { layoutChangeNotifier } from './core/layout-change-notifier.js';
import { getHubById } from './hubs.js';

// ===== ESTADO DO CACHE =====
let plannerPathCache = {};
let layoutHash = null;
let cacheInvalidated = false;

// ===== ESTADOS DO PLANNER =====
export const PLANNER_STATE = {
    IDLE: 'idle',
    PRE_COMPUTING: 'pre-computing',
    READY: 'ready',
    PLAYING: 'playing',
    PAUSED: 'paused'
};

let currentPlannerState = PLANNER_STATE.IDLE;

// ===== HASH DO LAYOUT =====

/**
 * Gera um hash simples baseado na geometria do layout
 * Usado para validar se o cache ainda é válido
 */
export function generateLayoutHash() {
    try {
        const geometryData = {
            walls: walls.map(w => ({
                start: w.startPoint,
                end: w.endPoint
            })),
            resources: resources.map(r => ({
                id: r.id,
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                vertices: r.vertices
            })),
            openings: openings.map(o => ({
                wallId: o.wallId,
                start: o.startPoint,
                end: o.endPoint
            })),
            areas: movementAreas.map(a => ({
                id: a.id,
                vertices: a.vertices
            }))
        };

        // Hash simples usando stringify + sum
        const jsonStr = JSON.stringify(geometryData);
        let hash = 0;
        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return `layout_${Math.abs(hash).toString(36)}_${jsonStr.length}`;
    } catch (error) {
        return `layout_error_${Date.now()}`;
    }
}

// ===== GERENCIAMENTO DO CACHE =====

/**
 * Gera uma chave única para o cache baseada em origem, destino e largura
 */
function generateCacheKey(startId, endId, width) {
    return `${startId}_to_${endId}_width${width}`;
}

/**
 * Obtém um caminho do cache
 * @returns {Array|null} Array de pontos ou null se não existir
 */
export function getCachedPath(startId, endId, width = 60) {
    const key = generateCacheKey(startId, endId, width);
    return plannerPathCache[key] || null;
}

/**
 * Armazena um caminho no cache
 */
export function setCachedPath(startId, endId, width, path) {
    const key = generateCacheKey(startId, endId, width);
    plannerPathCache[key] = path;
}

/**
 * Verifica se um caminho existe no cache
 */
export function hasCachedPath(startId, endId, width = 60) {
    const key = generateCacheKey(startId, endId, width);
    return key in plannerPathCache;
}

/**
 * Limpa todo o cache de rotas
 */
export function clearPathCache() {
    plannerPathCache = {};
    layoutHash = null;
    cacheInvalidated = true;
}

/**
 * Obtém estatísticas do cache
 */
export function getCacheStats() {
    const paths = Object.keys(plannerPathCache);
    let totalPoints = 0;
    paths.forEach(key => {
        totalPoints += (plannerPathCache[key]?.length || 0);
    });
    
    return {
        routeCount: paths.length,
        totalPoints: totalPoints,
        layoutHash: layoutHash,
        isValid: !cacheInvalidated && layoutHash === generateLayoutHash()
    };
}

// ===== UTILIDADES CROSS-FLOOR =====

/**
 * Verifica se um movimento é entre andares diferentes
 */
function isCrossFloorMovement(movement) {
    const startHubId = movement.startId.startsWith('hub:') 
        ? movement.startId.substring(4) : movement.startId;
    const endHubId = movement.endId.startsWith('hub:') 
        ? movement.endId.substring(4) : movement.endId;
    const startHub = getHubById(startHubId);
    const endHub = getHubById(endHubId);
    if (startHub && endHub && startHub.floorId && endHub.floorId) {
        return startHub.floorId !== endHub.floorId;
    }
    return false;
}

// ===== PRÉ-CÁLCULO DE ROTAS =====

/**
 * Pré-calcula todas as rotas necessárias para um roteiro
 * @param {Array} plannerLayers - Camadas do roteiro do product-planner
 * @param {Function} findPathFn - Função de pathfinding (findPathWithAnchors)
 * @param {Function} onProgress - Callback de progresso (current, total)
 * @returns {Promise<Object>} Resultado do pré-cálculo
 */
export async function preComputeRoutes(plannerLayers, findPathFn, onProgress = null) {
    currentPlannerState = PLANNER_STATE.PRE_COMPUTING;
    
    const startTime = performance.now();
    const currentHash = generateLayoutHash();
    
    // Verificar se cache existente é totalmente válido (hash bate, não invalidado)
    if (layoutHash === currentHash && !cacheInvalidated && Object.keys(plannerPathCache).length > 0) {
        currentPlannerState = PLANNER_STATE.READY;
        return {
            success: true,
            cached: true,
            routeCount: Object.keys(plannerPathCache).length,
            timeMs: 0,
            reusedCount: 0,
            newCount: 0
        };
    }
    
    // Se o layout mudou, limpar cache (rotas antigas podem ser inválidas)
    // Se apenas cacheInvalidated (geometria mudou), também limpar
    if (layoutHash !== currentHash || cacheInvalidated) {
        plannerPathCache = {};
    }
    cacheInvalidated = false;
    
    // Extrair todos os movimentos únicos do roteiro
    const movements = extractMovementsFromPlanner(plannerLayers);
    const totalMovements = movements.length;
    
    if (totalMovements === 0) {
        layoutHash = currentHash;
        currentPlannerState = PLANNER_STATE.READY;
        return {
            success: true,
            cached: false,
            routeCount: 0,
            timeMs: 0,
            reusedCount: 0,
            newCount: 0
        };
    }
    
    let successCount = 0;
    let failCount = 0;
    let reusedCount = 0;
    
    for (let i = 0; i < movements.length; i++) {
        const movement = movements[i];
        
        // Callback de progresso
        if (onProgress) {
            onProgress(i + 1, totalMovements);
        }
        
        // Verificar se já está no cache (rota reutilizada de execução anterior)
        if (hasCachedPath(movement.startId, movement.endId, movement.width)) {
            successCount++;
            reusedCount++;
            continue;
        }
        
        try {
            // Calcular o caminho usando a função de pathfinding
            const path = await calculatePath(movement, findPathFn);
            
            if (path && path.length > 0) {
                setCachedPath(movement.startId, movement.endId, movement.width, path);
                successCount++;
            } else if (path === null && isCrossFloorMovement(movement)) {
                // Rota cross-floor: não contar como falha (resolvida em runtime)
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
        }
        
        // Pequeno yield para não bloquear a UI
        if (i % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    
    const endTime = performance.now();
    const timeMs = endTime - startTime;
    
    layoutHash = currentHash;
    currentPlannerState = PLANNER_STATE.READY;
    
    return {
        success: failCount === 0,
        cached: false,
        routeCount: successCount,
        failCount: failCount,
        timeMs: timeMs,
        reusedCount: reusedCount,
        newCount: successCount - reusedCount
    };
}

/**
 * Extrai todos os movimentos únicos do roteiro.
 * Para transições com múltiplos destinos, amostra pares aleatórios
 * limitados pelo loopCount da etapa (evita explosão combinatória).
 */
function extractMovementsFromPlanner(plannerLayers) {
    const movements = [];
    const seen = new Set();
    const STAGE_BLUEPRINT_LEN = 4; // acao, onde, sprite, tempo
    
    function addMovement(origin, dest) {
        const key = `${origin}_${dest}_60`;
        if (!seen.has(key)) {
            seen.add(key);
            movements.push({ startId: origin, endId: dest, width: 60 });
        }
    }
    
    /**
     * Para transições multi-origem × multi-destino, em vez do produto cartesiano
     * completo, amostra N pares aleatórios (onde N = max loops da transição).
     * Isso reflete o uso real: cada iteração do loop sorteia 1 origem e 1 destino.
     */
    function addTransition(origins, destinations, maxSamples) {
        const totalCombinations = origins.length * destinations.length;
        
        // Se combinação total é pequena ou maxSamples cobre tudo, usar produto completo
        if (totalCombinations <= maxSamples || totalCombinations <= 20) {
            for (const origin of origins) {
                for (const dest of destinations) {
                    addMovement(origin, dest);
                }
            }
            return;
        }
        
        // Amostrar N pares aleatórios (simula os sorteios reais do runtime)
        const sampled = new Set();
        let attempts = 0;
        const maxAttempts = maxSamples * 3; // evitar loop infinito
        while (sampled.size < maxSamples && attempts < maxAttempts) {
            const o = origins[Math.floor(Math.random() * origins.length)];
            const d = destinations[Math.floor(Math.random() * destinations.length)];
            sampled.add(`${o}|${d}`);
            attempts++;
        }
        for (const pair of sampled) {
            const [o, d] = pair.split('|');
            addMovement(o, d);
        }
    }
    
    for (const layer of plannerLayers) {
        if (!layer.columns || !Array.isArray(layer.columns)) {
            continue;
        }
        
        // Coletar colunas "onde" em sequência + loopCount por etapa
        const stages = []; // { where: string, loopCount: number }
        const columns = layer.columns;
        for (let i = 0; i < columns.length; i += STAGE_BLUEPRINT_LEN) {
            const acaoCol = columns[i];
            const ondeCol = columns[i + 1];
            if (ondeCol && ondeCol.type === 'onde' && ondeCol.value) {
                stages.push({
                    where: ondeCol.value,
                    loopCount: acaoCol?.loopCount || 0
                });
            }
        }
        
        // Determinar máximo de loops global da layer
        let globalMaxLoops = 1;
        for (const s of stages) {
            if (s.loopCount > 0) globalMaxLoops = Math.max(globalMaxLoops, s.loopCount);
        }
        
        // Criar movimentos entre destinos consecutivos
        for (let i = 0; i < stages.length - 1; i++) {
            const currentWhere = stages[i].where;
            const nextWhere = stages[i + 1].where;
            
            if (currentWhere === nextWhere) continue;
            
            const origins = currentWhere.split(',').map(s => s.trim());
            const destinations = nextWhere.split(',').map(s => s.trim());
            
            // Usar o maior loopCount que cobre esta transição
            const maxSamples = Math.max(globalMaxLoops, 20);
            addTransition(origins, destinations, maxSamples);
        }
        
        // Movimento de volta do último para o primeiro (para loops)
        if (stages.length >= 2) {
            const lastWhere = stages[stages.length - 1].where;
            const firstWhere = stages[0].where;
            
            if (lastWhere !== firstWhere) {
                const origins = lastWhere.split(',').map(s => s.trim());
                const destinations = firstWhere.split(',').map(s => s.trim());
                const maxSamples = Math.max(globalMaxLoops, 20);
                addTransition(origins, destinations, maxSamples);
            }
        }
    }
    
    return movements;
}

/**
 * Calcula um caminho individual
 * IMPORTANTE: Os IDs vêm no formato "hub:hub-1", precisamos resolver para o resourceId real
 */
async function calculatePath(movement, findPathFn) {
    if (!findPathFn) {
        return null;
    }
    
    // Extrair IDs de hubs (remover prefixo "hub:")
    const startHubId = movement.startId.startsWith('hub:') 
        ? movement.startId.substring(4) 
        : movement.startId;
    const endHubId = movement.endId.startsWith('hub:') 
        ? movement.endId.substring(4) 
        : movement.endId;
    
    try {
        // Buscar informações dos hubs usando a função importada getHubById
        const startHub = getHubById(startHubId);
        const endHub = getHubById(endHubId);
        
        if (!startHub || !endHub) {
            return null;
        }
        
        // Rotas cross-floor não podem ser pré-calculadas (NavMesh é por pavimento)
        // Serão resolvidas em runtime pelo sistema de stairRedirect
        if (startHub.floorId && endHub.floorId && startHub.floorId !== endHub.floorId) {
            return null;
        }
        
        // Tentar usar o pathfinding global
        if (typeof window !== 'undefined' && window.findPathWithAnchors) {
            // Boundary opening hubs (sem resourceId) são tratados como âncoras virtuais
            const isStartBoundary = !startHub.resourceId && typeof startHub.x === 'number' && typeof startHub.y === 'number';
            const isEndBoundary = !endHub.resourceId && typeof endHub.x === 'number' && typeof endHub.y === 'number';

            // Se ambos não têm resourceId E não são boundary hubs com posição, não é possível calcular
            if (!startHub.resourceId && !isStartBoundary) return null;
            if (!endHub.resourceId && !isEndBoundary) return null;

            let startAnchor;
            if (isStartBoundary) {
                startAnchor = { isVirtual: true, position: { x: startHub.x, y: startHub.y } };
            } else {
                const startLocalX = typeof startHub.localX === 'number' ? startHub.localX : 0;
                const startLocalY = typeof startHub.localY === 'number' ? startHub.localY : 0;
                startAnchor = { resourceId: startHub.resourceId, anchor: { x: startLocalX, y: startLocalY } };
            }

            let endAnchor;
            if (isEndBoundary) {
                endAnchor = { isVirtual: true, position: { x: endHub.x, y: endHub.y } };
            } else {
                const endLocalX = typeof endHub.localX === 'number' ? endHub.localX : 0;
                const endLocalY = typeof endHub.localY === 'number' ? endHub.localY : 0;
                endAnchor = { resourceId: endHub.resourceId, anchor: { x: endLocalX, y: endLocalY } };
            }
            
            const path = window.findPathWithAnchors(startAnchor, endAnchor, null, movement.width);
            return path;
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

// ===== GETTERS DE ESTADO =====

export function getPlannerState() {
    return currentPlannerState;
}

export function setPlannerState(state) {
    currentPlannerState = state;
}

export function isCacheValid() {
    const currentHash = generateLayoutHash();
    const hasRoutes = Object.keys(plannerPathCache).length > 0;
    const hashMatches = layoutHash === currentHash;
    return !cacheInvalidated && hashMatches && hasRoutes;
}

// ===== SERIALIZAÇÃO PARA PERSISTÊNCIA =====

/**
 * Serializa o cache para salvar no JSON
 */
export function serializePathCache() {
    return {
        layoutHash: layoutHash,
        pathCache: { ...plannerPathCache }
    };
}

/**
 * Carrega cache de dados serializados
 */
export function loadPathCache(data) {
    if (!data) return false;
    
    const currentHash = generateLayoutHash();
    
    if (data.layoutHash === currentHash && data.pathCache) {
        plannerPathCache = { ...data.pathCache };
        layoutHash = data.layoutHash;
        cacheInvalidated = false;
        return true;
    }
    
    return false;
}

// ===== INTEGRAÇÃO COM LAYOUT CHANGE NOTIFIER =====

/**
 * Inicializa listeners para invalidação automática do cache
 */
export function initPathCacheListeners() {
    layoutChangeNotifier.addListener((changeType, data) => {
        // Tipos de mudança que invalidam o cache
        const invalidatingTypes = ['wall', 'resource', 'opening', 'area'];
        const invalidatingActions = ['create', 'update', 'delete', 'move', 'resize', 'rotate'];
        
        if (invalidatingTypes.includes(changeType)) {
            const action = data?.action || 'unknown';
            if (invalidatingActions.includes(action)) {
                clearPathCache();
            }
        }
    });
}

// Inicializar listeners automaticamente
if (typeof window !== 'undefined') {
    // Aguardar um pouco para garantir que layoutChangeNotifier está disponível
    setTimeout(() => {
        initPathCacheListeners();
    }, 100);
}
