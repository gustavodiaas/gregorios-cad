/**
 * @fileoverview Sistema de conexões - Core (Consolidado)
 * Combina: connectionState, connectionPath, connectionLifecycle
 * 
 * @description
 * Este módulo gerencia:
 * - CRUD de conexões (criar, ler, atualizar, deletar)
 * - Pathfinding e atualização de caminhos via A*
 * - Ciclo de vida (início, desenho, finalização)
 * 
 * @module connections/connectionCore
 */

/** @typedef {import('../types.js').Connection} Connection */
/** @typedef {import('../types.js').ConnectionAnchor} ConnectionAnchor */
/** @typedef {import('../types.js').Resource} Resource */
/** @typedef {import('../types.js').Hub} Hub */
/** @typedef {import('../types.js').EntityId} EntityId */
/** @typedef {import('../types.js').PointXY} PointXY */

import { 
    getConnections, 
    setConnections, 
    getIsDrawingConnection, 
    setIsDrawingConnection,
    getCurrentConnection,
    setCurrentConnection,
    getSelectedConnectionId,
    setSelectedConnectionId,
    getIsConnectionMousePressed,
    setIsConnectionMousePressed,
    getCurrentConnectionWidth,
    resources,
    movementAreas,
    getHubPreviewPosition,
    getHubPlacementTargetResource
} from '../state.js';
import { redraw } from '../drawing.js';
import { saveStateToHistory } from '../history.js';
import { getCurrentConnectionColor } from '../color-palette.js';
import { updateConnectionDistancesTable } from '../flow-metrics.js';
import { refreshNavMeshOptions } from '../navmesh-controls.js';
import { SUPPORTED_CONNECTION_WIDTHS, bakeNavigationMeshForWidth, updateNavMeshWithObstacles, getNavMeshForWidth } from '../navMeshBaker.js';
import { 
    findNearestResource, 
    anchorToWorldCoordinates,
    getHubSnapRadius,
    findResourceById,
    getResourceCenter
} from './connectionUtils.js';
import { 
    findOrCreateHub, 
    removeConnectionFromHub, 
    findHubById, 
    getHubWorldCoordinates,
    getHubsForResource
} from '../hubs.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';

/** Contador para nomes de conexões */
let connectionCounter = 0;

// ============================================================================
// SEÇÃO 1: HELPERS INTERNOS
// ============================================================================

/**
 * Helper para atualizar as opções de NavMesh quando conexões mudarem
 */
function updateNavMeshOptionsIfNeeded() {
    setTimeout(() => {
        if (typeof refreshNavMeshOptions === 'function') {
            refreshNavMeshOptions();
        } else if (typeof window !== 'undefined' && typeof window.refreshNavMeshOptions === 'function') {
            window.refreshNavMeshOptions();
        } else {
            console.warn('⚠️ refreshNavMeshOptions não encontrada');
        }
    }, 150);
}

/**
 * Função auxiliar para calcular distância de um ponto a um segmento de linha
 */
function distancePointToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
        return Math.sqrt(A * A + B * B);
    }
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    const xx = x1 + param * C;
    const yy = y1 + param * D;
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================
// SEÇÃO 2: CRUD DE CONEXÕES (de connectionState.js)
// ============================================================================

/**
 * Cria uma conexão ancorada entre dois recursos.
 * Cria hubs automaticamente nos pontos de âncora se não existirem.
 * 
 * @param {EntityId} startResourceId - ID do recurso de origem
 * @param {PointXY} startAnchor - Ponto de âncora local no recurso de origem
 * @param {EntityId} endResourceId - ID do recurso de destino
 * @param {PointXY} endAnchor - Ponto de âncora local no recurso de destino
 * @returns {Connection|null} A conexão criada ou null se falhar
 */
export function createAnchoredConnection(startResourceId, startAnchor, endResourceId, endAnchor) {
    const connectionId = generateId(ID_PREFIXES.CONNECTION);
    connectionCounter++;
    const connection = {
        id: connectionId,
        color: getCurrentConnectionColor(),
        name: `Conexão ${connectionCounter}`,
        width: getCurrentConnectionWidth(),
        path: []
    };
    
    const startResource = findResourceById(startResourceId);
    const endResource = findResourceById(endResourceId);
    
    if (!startResource || !endResource) {
        console.error('❌ Recursos não encontrados para criar conexão');
        return null;
    }
    
    const startWorld = anchorToWorldCoordinates(startResource, startAnchor);
    const endWorld = anchorToWorldCoordinates(endResource, endAnchor);
    
    const startHubId = findOrCreateHub(startResource, startWorld.x, startWorld.y, connection.id);
    const endHubId = findOrCreateHub(endResource, endWorld.x, endWorld.y, connection.id);
    
    connection.startHubId = startHubId;
    connection.endHubId = endHubId;
    
    const connections = getConnections();
    connections.push(connection);
    setConnections(connections);
    updateNavMeshOptionsIfNeeded();
    
    saveStateToHistory('Criar conexão com hubs');
    updateConnectionDistancesTable();
    
    return connection;
}

/**
 * Remove uma conexão pelo ID.
 * Também remove as referências da conexão nos hubs associados.
 * 
 * @param {EntityId} connectionId - ID da conexão a remover
 * @returns {void}
 */
export function removeConnection(connectionId) {
    const connections = getConnections();
    const index = connections.findIndex(c => c.id === connectionId);
    
    if (index !== -1) {
        const connection = connections[index];
        
        // Remover conexão dos hubs se existir
        if (connection.startHubId) {
            removeConnectionFromHub(connection.startHubId, connectionId);
        }
        if (connection.endHubId) {
            removeConnectionFromHub(connection.endHubId, connectionId);
        }
        
        connections.splice(index, 1);
        setConnections(connections);
        updateNavMeshOptionsIfNeeded();
        
        if (getSelectedConnectionId() === connectionId) {
            setSelectedConnectionId(null);
        }
        
        saveStateToHistory('Remover conexão');
        updateConnectionDistancesTable();
        redraw();
    }
}

/**
 * Alias para removeConnection (mantém compatibilidade)
 */
export function deleteConnection(connectionId) {
    return removeConnection(connectionId);
}

/**
 * Retorna todas as conexões de um recurso
 */
export function getConnectionsForResource(resourceId) {
    const connections = getConnections();
    return connections.filter(connection => {
        // Conexões com hubs
        if (connection.startHubId || connection.endHubId) {
            const startHubData = connection.startHubId ? findHubById(connection.startHubId) : null;
            const endHubData = connection.endHubId ? findHubById(connection.endHubId) : null;
            
            return (startHubData && startHubData.resource && startHubData.resource.id === resourceId) ||
                   (endHubData && endHubData.resource && endHubData.resource.id === resourceId);
        }
        
        // Conexões com ancoragem
        if (connection.start && connection.end) {
            return connection.start.resourceId === resourceId || 
                   connection.end.resourceId === resourceId;
        }
        
        return false;
    });
}

/**
 * Calcula a distância total de uma conexão
 */
export function calculateConnectionDistance(connection) {
    if (!connection.path || connection.path.length < 2) {
        return 0;
    }
    
    let totalDistance = 0;
    for (let i = 1; i < connection.path.length; i++) {
        const p1 = connection.path[i - 1];
        const p2 = connection.path[i];
        totalDistance += Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }
    
    return totalDistance;
}

/**
 * Encontra uma conexão em uma posição específica
 */
export function getConnectionAtPosition(x, y, tolerance = 5) {
    const connections = getConnections();
    
    for (const connection of connections) {
        if (!connection.path || connection.path.length < 2) continue;
        
        // Verificar se o ponto está próximo de algum segmento do caminho
        for (let i = 1; i < connection.path.length; i++) {
            const p1 = connection.path[i - 1];
            const p2 = connection.path[i];
            
            const distance = distancePointToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
            if (distance <= tolerance) {
                return connection;
            }
        }
    }
    
    return null;
}

/**
 * Converte conexões baseadas em pontos para o sistema de âncoras
 */
export function convertPointsToAnchors(connection) {
    if (!connection.points || connection.points.length < 2) {
        console.warn('⚠️ Conexão não tem pontos suficientes para converter');
        return;
    }
    
    const startPoint = connection.points[0];
    const endPoint = connection.points[connection.points.length - 1];
    
    // Encontrar recursos próximos aos pontos inicial e final
    const startResource = findNearestResource(startPoint.x, startPoint.y, 50);
    const endResource = findNearestResource(endPoint.x, endPoint.y, 50);
    
    if (startResource && endResource) {
        // Criar hubs nos recursos
        const startHubId = findOrCreateHub(startResource, startPoint.x, startPoint.y, connection.id);
        const endHubId = findOrCreateHub(endResource, endPoint.x, endPoint.y, connection.id);
        
        connection.startHubId = startHubId;
        connection.endHubId = endHubId;
        
        // Preservar o caminho desenhado manualmente
        connection.path = [...connection.points];
        delete connection.points;
    } else {
        // Manter como conexão legada se não conseguiu ancorar
        connection.isLegacy = true;
    }
    
    connection.totalDistance = calculateConnectionDistance(connection);
}

// ============================================================================
// SEÇÃO 3: PATHFINDING (de connectionPath.js)
// ============================================================================

/**
 * Atualiza o caminho de uma conexão específica
 */
export function updateConnectionPath(connection) {
    // Suporte para conexões com hubs (novo formato)
    if (connection.startHubId && connection.endHubId) {
        const startWorld = getHubWorldCoordinates(connection.startHubId);
        const endWorld = getHubWorldCoordinates(connection.endHubId);
        
        if (!startWorld || !endWorld) {
            connection.path = [];
            return;
        }
        
        // Usar pathfinding A* se disponível, senão linha reta
        try {
            if (typeof window !== 'undefined' && window.findPathWithAnchors) {
                const startHubData = findHubById(connection.startHubId);
                const endHubData = findHubById(connection.endHubId);
                
                if (startHubData && endHubData) {
                    // Boundary opening hubs (sem resourceId) são tratados como âncoras virtuais
                    const isStartBoundary = !startHubData.resource && startHubData.hub && typeof startHubData.hub.x === 'number';
                    const isEndBoundary = !endHubData.resource && endHubData.hub && typeof endHubData.hub.x === 'number';

                    if (startHubData.resource || isStartBoundary) {
                        if (endHubData.resource || isEndBoundary) {
                            let startAnchorObj;
                            if (isStartBoundary) {
                                startAnchorObj = { isVirtual: true, position: { x: startHubData.hub.x, y: startHubData.hub.y } };
                            } else {
                                startAnchorObj = {
                                    resourceId: startHubData.resource.id,
                                    anchor: { x: startHubData.hub.localX, y: startHubData.hub.localY }
                                };
                            }
                            
                            let endAnchorObj;
                            if (isEndBoundary) {
                                endAnchorObj = { isVirtual: true, position: { x: endHubData.hub.x, y: endHubData.hub.y } };
                            } else {
                                endAnchorObj = {
                                    resourceId: endHubData.resource.id,
                                    anchor: { x: endHubData.hub.localX, y: endHubData.hub.localY }
                                };
                            }
                    
                            const calculatedPath = window.findPathWithAnchors(startAnchorObj, endAnchorObj, null, connection.width || 80);
                    
                            if (calculatedPath && calculatedPath.length > 0) {
                                connection.path = calculatedPath;
                                connection.isFallback = !!calculatedPath.isFallback;
                                if (connection.isFallback) {
                                    console.warn(`%c[Fallback] Conexão ${connection.id} → pathfinding retornou fallback (${calculatedPath.length} pts)`, 'color: #ff4444');
                                }
                                return;
                            }
                        }
                    }
                }
            }
            
            connection.path = [startWorld, endWorld];
            connection.isFallback = true;
            
        } catch (error) {
            connection.path = [startWorld, endWorld];
            connection.isFallback = true;
        }
        return;
    }
    
    // Suporte para conexões com ancoragem (formato antigo)
    if (connection.start && connection.end) {
        const startResource = findResourceById(connection.start.resourceId);
        const endResource = findResourceById(connection.end.resourceId);
        
        if (!startResource || !endResource) {
            connection.path = [];
            return;
        }
        
        try {
            if (typeof window !== 'undefined' && window.findPathWithAnchors) {
                const calculatedPath = window.findPathWithAnchors(connection.start, connection.end, null, connection.width || 80);
                
                if (calculatedPath && calculatedPath.length > 0) {
                    connection.path = calculatedPath;
                    connection.isFallback = !!calculatedPath.isFallback;
                    return;
                }
            }
            
            const startWorld = anchorToWorldCoordinates(startResource, connection.start.anchor);
            const endWorld = anchorToWorldCoordinates(endResource, connection.end.anchor);
            connection.path = [startWorld, endWorld];
            connection.isFallback = true;
            
        } catch (error) {
            const startWorld = anchorToWorldCoordinates(startResource, connection.start.anchor);
            const endWorld = anchorToWorldCoordinates(endResource, connection.end.anchor);
            connection.path = [startWorld, endWorld];
            connection.isFallback = true;
        }
        return;
    }
}

/**
 * Atualiza o caminho de todas as conexões
 */
export function updateAllConnectionPaths() {
    const connections = getConnections();
    connections.forEach(connection => {
        if ((connection.startHubId && connection.endHubId) || 
            (connection.start && connection.end)) {
            updateConnectionPath(connection);
        }
    });
    
    updateConnectionDistancesTable();
}

/**
 * Atualiza os caminhos de conexão para um recurso específico (otimizado com cache)
 * @param {string} resourceId - ID do recurso que foi movido
 */
export function updateConnectionPathsForResource(resourceId) {
    if (!resourceId) {
        console.warn(`⚠️ updateConnectionPathsForResource: resourceId inválido`);
        return;
    }

    const connections = getConnections();
    const resource = findResourceById(resourceId);
    if (!resource) {
        console.warn(`[ConnectionPath] Resource ${resourceId} not found`);
        return;
    }

    // 1. Inicializar o cache de caminhos para esta operação de atualização
    const pathCache = new Map();
    const affectedConnections = [];

    // Coletar todas as conexões afetadas pelo recurso movido
    const resourceHubs = getHubsForResource(resourceId);

    for (const hub of resourceHubs) {
        if (!hub.connectionIds) continue;
        for (const connectionId of hub.connectionIds) {
            const connection = connections.find(c => c.id === connectionId);
            if (connection && !affectedConnections.find(c => c.id === connectionId)) {
                affectedConnections.push(connection);
            }
        }
    }

    // Fallback: Verificar conexões legadas que referenciam este recurso diretamente
    connections.forEach(conn => {
        const usesResource = (conn.start && conn.start.resourceId === resourceId) || 
                             (conn.end && conn.end.resourceId === resourceId);
        
        if (usesResource && !affectedConnections.find(c => c.id === conn.id)) {
            affectedConnections.push(conn);
        }
    });

    if (affectedConnections.length === 0) {
        return;
    }

    // 2. Identificar pares de hubs únicos e calcular o pathfinding UMA VEZ para cada par
    const uniqueHubPairs = new Set();
    const getHubPairKey = (id1, id2) => [id1, id2].sort().join('--');

    affectedConnections.forEach(conn => {
        if (conn.startHubId && conn.endHubId) {
            uniqueHubPairs.add(getHubPairKey(conn.startHubId, conn.endHubId));
        }
    });

    uniqueHubPairs.forEach(pairKey => {
        const [hubId1, hubId2] = pairKey.split('--');
        
        // Encontrar uma conexão representativa para obter a largura
        const representativeConnection = affectedConnections.find(conn => {
            const connPairKey = getHubPairKey(conn.startHubId, conn.endHubId);
            return connPairKey === pairKey;
        });
        const connectionWidth = representativeConnection?.width || 60;
        
        // Executa o caro pathfinding apenas uma vez por par
        const startHubData = findHubById(hubId1);
        const endHubData = findHubById(hubId2);

        if (startHubData && endHubData) {
            const startWorldDebug = getHubWorldCoordinates(hubId1);
            const endWorldDebug = getHubWorldCoordinates(hubId2);
        }

        // Boundary opening hubs (sem resourceId) são tratados como âncoras virtuais
        const isStartBoundary = startHubData && !startHubData.resource && startHubData.hub && typeof startHubData.hub.x === 'number';
        const isEndBoundary = endHubData && !endHubData.resource && endHubData.hub && typeof endHubData.hub.x === 'number';

        if (startHubData && endHubData && (startHubData.resource || isStartBoundary) && (endHubData.resource || isEndBoundary) && window.findPathWithAnchors) {
            let startAnchor;
            if (isStartBoundary) {
                startAnchor = { isVirtual: true, position: { x: startHubData.hub.x, y: startHubData.hub.y } };
            } else {
                startAnchor = { 
                    resourceId: startHubData.resource.id, 
                    anchor: { x: startHubData.hub.localX, y: startHubData.hub.localY } 
                };
            }
            let endAnchor;
            if (isEndBoundary) {
                endAnchor = { isVirtual: true, position: { x: endHubData.hub.x, y: endHubData.hub.y } };
            } else {
                endAnchor = { 
                    resourceId: endHubData.resource.id, 
                    anchor: { x: endHubData.hub.localX, y: endHubData.hub.localY } 
                };
            }
            
            let path = window.findPathWithAnchors(startAnchor, endAnchor, null, connectionWidth);
            if (!path || path.length === 0) {
                // Fallback para linha reta se o A* falhar
                const startWorld = getHubWorldCoordinates(hubId1);
                const endWorld = getHubWorldCoordinates(hubId2);
                if (startWorld && endWorld) {
                    path = [startWorld, endWorld];
                }
                pathCache.set(pairKey, { path, isFallback: true });
            } else {
                pathCache.set(pairKey, { path, isFallback: !!path.isFallback });
            }
        } else if (startHubData && endHubData) {
            // Se pathfinding não estiver disponível, usar linha reta
            const startWorld = getHubWorldCoordinates(hubId1);
            const endWorld = getHubWorldCoordinates(hubId2);
            if (startWorld && endWorld) {
                const path = [startWorld, endWorld];
                pathCache.set(pairKey, { path, isFallback: true });
            }
        }
    });

    // 3. Aplicar os caminhos cacheados a todas as conexões afetadas
    let updatedCount = 0;
    affectedConnections.forEach(conn => {
        if (conn.startHubId && conn.endHubId) {
            const pairKey = getHubPairKey(conn.startHubId, conn.endHubId);
            const cached = pathCache.get(pairKey);

            if (cached) {
                // Garantir que a direção do caminho está correta
                const [hubId1] = pairKey.split('--');
                if (conn.startHubId === hubId1) {
                    conn.path = cached.path;
                } else {
                    conn.path = [...cached.path].reverse();
                }
                conn.isFallback = cached.isFallback;
                updatedCount++;
            } else {
                console.warn(`⚠️ Caminho cacheado não encontrado para conexão ${conn.id}`);
            }
        } else {
            // Atualizar conexões legadas ou mistas individualmente
            updateConnectionPath(conn);
            updatedCount++;
        }
    });

    if (updatedCount > 0) {
        redraw();
        updateConnectionDistancesTable();
    }
}

// ============================================================================
// SEÇÃO 4: CICLO DE VIDA (de connectionLifecycle.js)
// ============================================================================

/**
 * Inicia o processo de criação de uma nova conexão
 * @param {number} x - Posição X
 * @param {number} y - Posição Y
 * @param {Object} [options] - Opções adicionais
 * @param {string} [options.dockHubId] - ID de um hub de doca para usar como início
 */
export function startCreatingConnection(x, y, options = {}) {
    const { dockHubId } = options;
    
    // Se temos um hub de doca, usar diretamente
    if (dockHubId) {
        const connectionId = generateId(ID_PREFIXES.CONNECTION);
        connectionCounter++;
        const connection = {
            id: connectionId,
            color: getCurrentConnectionColor(),
            name: `Conexão ${connectionCounter}`,
            width: getCurrentConnectionWidth(),
            isCreating: true,
            path: [],
            startHubId: dockHubId
        };
        
        // Registrar conexão no hub da doca
        const dockHub = findHubById(dockHubId);
        if (dockHub && dockHub.hub) {
            if (!dockHub.hub.connectionIds) dockHub.hub.connectionIds = [];
            if (!dockHub.hub.connectionIds.includes(connectionId)) {
                dockHub.hub.connectionIds.push(connectionId);
            }
        }
        
        const connections = getConnections();
        connections.push(connection);
        setConnections(connections);
        updateNavMeshOptionsIfNeeded();
        setCurrentConnection(connection);
        setIsDrawingConnection(true);
        setSelectedConnectionId(connection.id);
        
        return connection;
    }
    
    // SEMPRE procurar o recurso mais próximo (sem limite de distância)
    const nearestResource = findNearestResource(x, y, Infinity);
    
    if (nearestResource) {
        const connectionId = generateId(ID_PREFIXES.CONNECTION);
        connectionCounter++;
        const connection = {
            id: connectionId,
            color: getCurrentConnectionColor(),
            name: `Conexão ${connectionCounter}`,
            width: getCurrentConnectionWidth(),
            isCreating: true,
            path: []
        };
        
        // Criar hub no ponto mais próximo da borda
        const startHubId = findOrCreateHub(nearestResource, x, y, connection.id);
        connection.startHubId = startHubId;
        
        const connections = getConnections();
        connections.push(connection);
        setConnections(connections);
        updateNavMeshOptionsIfNeeded();
        setCurrentConnection(connection);
        setIsDrawingConnection(true);
        setSelectedConnectionId(connection.id);
        
        return connection;
    } else {
        // Tratamento alternativo para desenho livre (sem recursos)
        const connectionId = generateId(ID_PREFIXES.CONNECTION);
        connectionCounter++;
        const connection = {
            id: connectionId,
            type: 'free-draw',
            points: [{ x, y }],
            color: getCurrentConnectionColor(),
            name: `Conexão ${connectionCounter}`,
            width: getCurrentConnectionWidth(),
            isCreating: true
        };
        
        const connections = getConnections();
        connections.push(connection);
        setConnections(connections);
        updateNavMeshOptionsIfNeeded();
        setCurrentConnection(connection);
        setIsDrawingConnection(true);
        setSelectedConnectionId(connection.id);
        
        return connection;
    }
}

/**
 * Adiciona um ponto à conexão em criação
 */
export function addConnectionPoint(x, y) {
    const currentConnection = getCurrentConnection();
    if (!currentConnection || !getIsDrawingConnection()) return;
    
    // Se for uma conexão com hub inicial e sem hub final
    if (currentConnection.startHubId && !currentConnection.endHubId) {
        const isMousePressed = getIsConnectionMousePressed();
        
        if (isMousePressed) {
            // Mouse pressionado = desenho livre
            if (!currentConnection.path || currentConnection.path.length === 0) {
                const startWorld = getHubWorldCoordinates(currentConnection.startHubId);
                currentConnection.path = startWorld ? [startWorld] : [];
            }
            
            if (currentConnection.path.length > 0) {
                const lastPoint = currentConnection.path[currentConnection.path.length - 1];
                const distance = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
                
                if (distance > 5) {
                    currentConnection.path.push({ x, y });
                } else {
                    return;
                }
            } else {
                currentConnection.path.push({ x, y });
            }
            
            currentConnection.isManualDraw = true;
            
        } else {
            // Mouse NÃO pressionado = apenas pré-visualização
            const startWorld = getHubWorldCoordinates(currentConnection.startHubId);
            if (startWorld) {
                if (currentConnection.isManualDraw && currentConnection.path && currentConnection.path.length > 1) {
                    const lastManualPoint = currentConnection.path[currentConnection.path.length - 1];
                    currentConnection.previewPath = [lastManualPoint, { x, y }];
                } else {
                    currentConnection.path = [startWorld, { x, y }];
                    currentConnection.previewPath = null;
                    currentConnection.isManualDraw = false;
                }
            }
        }
        
        redraw();
        return;
    }
    
    // Fallback para conexões legadas
    if (currentConnection.points) {
        currentConnection.points.push({ x, y });
        redraw();
    }
}

/**
 * Finaliza uma conexão ancorada (interno)
 */
function finishAnchoredConnection(x, y, endResource) {
    const currentConnection = getCurrentConnection();
    if (!currentConnection) return;
    
    if (currentConnection.startHubId) {
        const endHubId = findOrCreateHub(endResource, x, y, currentConnection.id);
        currentConnection.endHubId = endHubId;
        
        // Se for desenho manual, preservar o caminho desenhado
        if (currentConnection.isManualDraw && currentConnection.path && currentConnection.path.length > 0) {
            const endWorld = getHubWorldCoordinates(endHubId);
            if (endWorld) {
                currentConnection.path.push(endWorld);
            }
        } else {
            const startWorld = getHubWorldCoordinates(currentConnection.startHubId);
            const endWorld = getHubWorldCoordinates(endHubId);
            if (startWorld && endWorld) {
                currentConnection.path = [startWorld, endWorld];
            } else {
                currentConnection.path = [];
            }
        }
    }
    
    delete currentConnection.isCreating;
    updateNavMeshOptionsIfNeeded();

    // NOVA LÓGICA PARA NAVMESH PERSONALIZADA
    const connectionWidth = currentConnection.width || 60;
    if (!SUPPORTED_CONNECTION_WIDTHS.includes(connectionWidth)) {
        const startHubData = findHubById(currentConnection.startHubId);
        if (startHubData && startHubData.resource) {
            const parentArea = movementAreas.find(area => area.id === startHubData.resource.parentAreaId);
            if (parentArea) {
                const marginCm = connectionWidth / 2;
                bakeNavigationMeshForWidth(parentArea, connectionWidth, marginCm);
                const navMesh = getNavMeshForWidth(parentArea, connectionWidth);
                updateNavMeshWithObstacles(parentArea, navMesh);
            }
        }
    }

    // Atualizar NavMeshes existentes
    const startHubData = findHubById(currentConnection.startHubId);
    if (startHubData && startHubData.resource) {
        const parentArea = movementAreas.find(area => area.id === startHubData.resource.parentAreaId);
        if (parentArea && parentArea.navMeshes) {
            Object.keys(parentArea.navMeshes).forEach(widthKey => {
                const width = parseInt(widthKey);
                const navMesh = getNavMeshForWidth(parentArea, width);
                updateNavMeshWithObstacles(parentArea, navMesh);
            });
        }
    }
    
    setIsConnectionMousePressed(false);
    setIsDrawingConnection(false);
    setCurrentConnection(null);
    setSelectedConnectionId(null);
    
    saveStateToHistory('Finalizar conexão');
    redraw();
}

/**
 * Finaliza o processo de criação de conexão
 */
/**
 * Finaliza a conexão atual.
 * @param {Object} [options] - Opções adicionais
 * @param {string} [options.dockHubId] - ID de um hub de doca para usar como fim
 */
export function finishConnection(options = {}) {
    const { dockHubId } = options;
    const currentConnection = getCurrentConnection();
    if (!currentConnection || !getIsDrawingConnection()) return;
    
    // Se temos um hub de doca como destino, finalizar nele diretamente
    if (dockHubId && currentConnection.startHubId && !currentConnection.endHubId) {
        currentConnection.endHubId = dockHubId;
        
        // Registrar conexão no hub da doca
        const dockHubData = findHubById(dockHubId);
        if (dockHubData && dockHubData.hub) {
            if (!dockHubData.hub.connectionIds) dockHubData.hub.connectionIds = [];
            if (!dockHubData.hub.connectionIds.includes(currentConnection.id)) {
                dockHubData.hub.connectionIds.push(currentConnection.id);
            }
        }
        
        // Atualizar path com posição do hub de doca
        const endWorld = getHubWorldCoordinates(dockHubId);
        if (endWorld) {
            if (currentConnection.isManualDraw && currentConnection.path && currentConnection.path.length > 0) {
                currentConnection.path.push(endWorld);
            } else {
                const startWorld = getHubWorldCoordinates(currentConnection.startHubId);
                if (startWorld) {
                    currentConnection.path = [startWorld, endWorld];
                }
            }
        }
        
        delete currentConnection.isCreating;
        delete currentConnection.previewPath;
        updateNavMeshOptionsIfNeeded();
        
        saveStateToHistory('Finalizar conexão na doca');
        updateConnectionDistancesTable();
        
        // Limpar estado de desenho
        setIsDrawingConnection(false);
        setCurrentConnection(null);
        setSelectedConnectionId(null);
        setIsConnectionMousePressed(false);
        
        redraw();
        return;
    }
    
    // Se for uma conexão com hub incompleta
    if (currentConnection.startHubId && !currentConnection.endHubId) {
        const hasManualPath = currentConnection.isManualDraw && 
                              currentConnection.path && 
                              currentConnection.path.length > 1;
        
        if (!hasManualPath) {
            // Remover conexão incompleta
            removeConnectionFromHub(currentConnection.startHubId, currentConnection.id);
            
            const connections = getConnections();
            const index = connections.findIndex(c => c.id === currentConnection.id);
            if (index !== -1) {
                connections.splice(index, 1);
                setConnections(connections);
            }
        } else {
            // É uma conexão manual válida - processar o ponto final
            const previewPos = getHubPreviewPosition();
            const previewResource = getHubPlacementTargetResource();
            
            let lastPoint;
            let nearestResource;
            
            if (previewPos && previewResource) {
                lastPoint = previewPos;
                nearestResource = previewResource;
                
                if (currentConnection.path.length > 0) {
                    currentConnection.path[currentConnection.path.length - 1] = { x: lastPoint.x, y: lastPoint.y };
                }
            } else {
                lastPoint = currentConnection.path[currentConnection.path.length - 1];
                nearestResource = findNearestResource(lastPoint.x, lastPoint.y, 30);
            }
            
            if (nearestResource) {
                const startHubData = findHubById(currentConnection.startHubId);
                const startResourceId = startHubData && startHubData.resource ? startHubData.resource.id : null;
                if (!startResourceId || nearestResource.id !== startResourceId) {
                    const resourceHubs = getHubsForResource(nearestResource.id) || [];
                    let foundExistingHub = false;
                    
                    for (const hub of resourceHubs) {
                        const hubWorld = anchorToWorldCoordinates(nearestResource, {
                            x: hub.localX,
                            y: hub.localY
                        });
                        
                        const distance = Math.sqrt(
                            Math.pow(lastPoint.x - hubWorld.x, 2) + 
                            Math.pow(lastPoint.y - hubWorld.y, 2)
                        );
                        
                        if (distance <= getHubSnapRadius()) {
                            currentConnection.endHubId = hub.id;
                            if (!hub.connectionIds.includes(currentConnection.id)) {
                                hub.connectionIds.push(currentConnection.id);
                            }
                            
                            if (currentConnection.path.length > 0) {
                                currentConnection.path[currentConnection.path.length - 1] = hubWorld;
                            }
                            
                            foundExistingHub = true;
                            break;
                        }
                    }
                    
                    if (!foundExistingHub) {
                        const endHubId = findOrCreateHub(nearestResource, lastPoint.x, lastPoint.y, currentConnection.id);
                        currentConnection.endHubId = endHubId;
                        
                        const endHubWorld = getHubWorldCoordinates(endHubId);
                        if (endHubWorld && currentConnection.path.length > 0) {
                            currentConnection.path[currentConnection.path.length - 1] = endHubWorld;
                        }
                    }
                }
            }
            
            delete currentConnection.isCreating;
            delete currentConnection.previewPath;
            updateNavMeshOptionsIfNeeded();
            
            const startHubData = findHubById(currentConnection.startHubId);
            if (startHubData && startHubData.resource) {
                const parentArea = movementAreas.find(area => area.id === startHubData.resource.parentAreaId);
                if (parentArea && parentArea.navMeshes) {
                    Object.keys(parentArea.navMeshes).forEach(widthKey => {
                        const width = parseInt(widthKey);
                        const navMesh = getNavMeshForWidth(parentArea, width);
                        updateNavMeshWithObstacles(parentArea, navMesh);
                    });
                }
            }
            
            saveStateToHistory('Finalizar conexão manual');
            updateConnectionDistancesTable();
        }
    }
    
    // Para conexões legadas com points, converter para hubs se possível
    if (currentConnection.points) {
        convertPointsToAnchors(currentConnection);
        
        const firstPoint = currentConnection.points && currentConnection.points.length > 0 ? currentConnection.points[0] : null;
        if (firstPoint) {
            const parentArea = movementAreas.find(area => area.id === currentConnection.parentAreaId);
            if (parentArea && parentArea.navMeshes) {
                Object.keys(parentArea.navMeshes).forEach(widthKey => {
                    const width = parseInt(widthKey);
                    const navMesh = getNavMeshForWidth(parentArea, width);
                    updateNavMeshWithObstacles(parentArea, navMesh);
                });
            }
        }
        
        saveStateToHistory('Finalizar conexão');
        updateConnectionDistancesTable();
    }
    
    // Limpar estado de desenho
    setIsDrawingConnection(false);
    setCurrentConnection(null);
    setSelectedConnectionId(null);
    setIsConnectionMousePressed(false);
    
    redraw();
    
    // Mostrar menu direito após concluir a primeira conexão
    const connections = getConnections();
    if (connections.length === 1) {
        const appContent = document.querySelector('.app-content');
        const rightSidebar = document.querySelector('.right-sidebar');
        const toggleBtn = document.getElementById('toggleRightSidebarBtn');
        
        if (appContent && rightSidebar && appContent.classList.contains('right-sidebar-hidden')) {
            appContent.classList.remove('right-sidebar-hidden');
            rightSidebar.classList.remove('hidden');
            
            if (toggleBtn) {
                toggleBtn.classList.add('active');
            }
        }
    }
}

export function completeConnectionToResource(resource, anchorPoint) {
    if (!resource || !anchorPoint) {
        return;
    }
    finishAnchoredConnection(anchorPoint.x, anchorPoint.y, resource);
}

/**
 * Cancela a criação de conexão em andamento
 */
export function cancelConnectionCreation() {
    if (getIsDrawingConnection()) {
        setIsDrawingConnection(false);
        setCurrentConnection(null);
        
        const canvas = document.getElementById('layoutCanvas');
        if (canvas) {
            canvas.style.cursor = 'default';
        }
        
        redraw();
    }
}

// ============================================================================
// SEÇÃO 5: MÓDULO GLOBAL (para compatibilidade)
// ============================================================================

// Expor módulo para acesso global (similar ao antigo ConnectionsModule)
if (typeof window !== 'undefined') {
    window.ConnectionsModule = {
        getConnections,
        setConnections,
        removeConnection,
        deleteConnection,
        getConnectionsForResource,
        calculateConnectionDistance,
        convertPointsToAnchors
    };
}
