/**
 * @fileoverview Sistema de conexões - Utilitários e Transformações
 * 
 * @description
 * Módulo consolidado que combina:
 * - Funções utilitárias (distância, geometria, busca)
 * - Transformações geométricas (rotação, movimento)
 * - Configurações de hubs visuais
 * 
 * @module connections/connectionUtils
 */

/** @typedef {import('../types.js').Connection} Connection */
/** @typedef {import('../types.js').Hub} Hub */
/** @typedef {import('../types.js').Resource} Resource */
/** @typedef {import('../types.js').EntityId} EntityId */
/** @typedef {import('../types.js').PointXY} PointXY */

import { resources, getConnections } from '../state.js';
import { pixelsPerCm } from '../config.js';
import { hubs, getHubsForResource } from '../hubs.js';

// ============================================================================
// SEÇÃO 1: CONFIGURAÇÕES DE HUBS
// ============================================================================

/**
 * Raio do hub em centímetros (diâmetro de 20cm = 2 células do grid)
 * @constant {number}
 */
export const HUB_RADIUS_CM = 10;

/**
 * Raio de snap do hub em centímetros
 * @constant {number}
 */
export const HUB_SNAP_RADIUS_CM = 15;

/**
 * Raio base de snap em pixels (legado)
 * @constant {number}
 * @deprecated Use HUB_SNAP_RADIUS_CM
 */
export const HUB_SNAP_RADIUS_BASE = 10;

/**
 * Raio visual base do hub em pixels (legado)
 * @constant {number}
 * @deprecated Use HUB_RADIUS_CM
 */
export const HUB_VISUAL_RADIUS_BASE = 10;

/**
 * Retorna o raio visual atual do hub em coordenadas do mundo (pixels no espaço do canvas)
 * O hub tem tamanho FIXO de 10cm de diâmetro (5cm de raio) independente do zoom
 * @returns {number} Raio em pixels do mundo
 */
export function getHubVisualRadius() {
    // Raio fixo em centímetros convertido para pixels do mundo
    // Isso faz o hub manter 10x10cm no mundo, independente do zoom
    return HUB_RADIUS_CM * pixelsPerCm;
}

/**
 * Retorna o raio de snap atual do hub em coordenadas do mundo
 * @returns {number} Raio de snap em pixels do mundo
 */
export function getHubSnapRadius() {
    return HUB_SNAP_RADIUS_CM * pixelsPerCm;
}

// ============================================================================
// SEÇÃO 2: FUNÇÕES DE HUB LABEL/ID
// ============================================================================

/**
 * Retorna o número sequencial de exibição de um hub.
 * Para IDs semânticos (hub-xxxx-yyyyyy), usa o displayNumber armazenado no hub
 * ou calcula baseado na ordem de criação.
 * Para IDs legados (hub-123), extrai o número diretamente.
 * 
 * @param {string|Hub} hubOrId - ID do hub ou objeto hub
 * @param {Hub[]} [hubsArray=null] - Array de hubs para buscar displayNumber (opcional)
 * @returns {number|null} Número sequencial do hub ou null se não encontrado
 */
export function getHubNumericId(hubOrId, hubsArray = null) {
    if (!hubOrId) {
        return null;
    }
    
    // Se for objeto, verificar se tem displayNumber
    if (typeof hubOrId === 'object') {
        if (typeof hubOrId.displayNumber === 'number') {
            return hubOrId.displayNumber;
        }
    }
    
    const hubId = typeof hubOrId === 'string' ? hubOrId : hubOrId?.id;
    if (!hubId) {
        return null;
    }
    
    // Tentar extrair de IDs legados (hub-123)
    const legacyMatch = `${hubId}`.match(/^hub-(\d+)$/i);
    if (legacyMatch) {
        return parseInt(legacyMatch[1], 10);
    }
    
    // Para IDs semânticos, buscar no array de hubs se fornecido
    if (hubsArray && Array.isArray(hubsArray)) {
        const hub = hubsArray.find(h => h.id === hubId);
        if (hub && typeof hub.displayNumber === 'number') {
            return hub.displayNumber;
        }
    }
    
    return null;
}

/**
 * Retorna o rótulo padrão exibido para um hub.
 * Prioriza: displayNumber > label > name > hubId > fallback
 * 
 * @param {string|Object} hubOrId - ID do hub ou objeto hub
 * @param {string} [fallback=''] - Valor padrão se nada for encontrado
 * @param {Array} [hubsArray] - Array de hubs para contexto (opcional)
 * @returns {string} Rótulo para exibição
 */
export function getHubDisplayLabel(hubOrId, fallback = '', hubsArray = null) {
    const numericId = getHubNumericId(hubOrId, hubsArray);
    if (numericId !== null && !Number.isNaN(numericId)) {
        return numericId.toString();
    }

    if (hubOrId && typeof hubOrId === 'object') {
        if (hubOrId.label) {
            return hubOrId.label;
        }
        if (hubOrId.name) {
            return hubOrId.name;
        }
    }

    if (typeof hubOrId === 'string') {
        return hubOrId;
    }

    return fallback;
}

// ============================================================================
// SEÇÃO 3: FUNÇÕES GEOMÉTRICAS (DISTÂNCIA E CÁLCULOS)
// ============================================================================

/**
 * Função auxiliar para calcular distância de um ponto a um segmento de linha
 */
export function distancePointToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
        // Segmento tem comprimento zero
        return Math.sqrt(A * A + B * B);
    }
    
    let param = dot / lenSq;
    
    // Limitar param entre 0 e 1 para segmento (não linha infinita)
    param = Math.max(0, Math.min(1, param));
    
    const xx = x1 + param * C;
    const yy = y1 + param * D;
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Função auxiliar para calcular distância de um ponto a uma linha (infinita)
 */
export function distancePointToLine(px, py, x1, y1, x2, y2) {
    const A = y2 - y1;
    const B = x1 - x2;
    const C = x2 * y1 - x1 * y2;
    
    return Math.abs(A * px + B * py + C) / Math.sqrt(A * A + B * B);
}

/**
 * Função auxiliar para calcular distância de um ponto a um polígono
 */
export function distancePointToPolygon(px, py, vertices) {
    if (vertices.length < 3) return Infinity;
    
    let minDistance = Infinity;
    
    // Verificar cada lado do polígono
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        const x1 = vertices[i][0];
        const y1 = vertices[i][1];
        const x2 = vertices[j][0];
        const y2 = vertices[j][1];
        
        const distance = distancePointToLineSegment(px, py, x1, y1, x2, y2);
        minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
}

/**
 * Função auxiliar para encontrar ponto mais próximo em um segmento de linha
 */
export function closestPointOnLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
        return { x: x1, y: y1 };
    }
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    return {
        x: x1 + param * C,
        y: y1 + param * D
    };
}

// ============================================================================
// SEÇÃO 4: FUNÇÕES DE RECURSOS
// ============================================================================

/**
 * Encontra o recurso mais próximo de uma posição
 */
export function findNearestResource(x, y, maxDistance = 30) {
    let nearestResource = null;
    let minDistance = maxDistance;
    
    for (const resource of resources) {
        let distance;
        
        if (resource.vertices && resource.vertices.length > 0) {
            // Para recursos poligonais, calcular distância até a borda
            distance = distancePointToPolygon(x, y, resource.vertices);
        } else {
            // Para recursos retangulares, calcular distância até a borda
            const left = resource.x;
            const right = resource.x + resource.width;
            const top = resource.y;
            const bottom = resource.y + resource.height;
            
            let dx = 0;
            let dy = 0;
            
            if (x < left) dx = left - x;
            else if (x > right) dx = x - right;
            
            if (y < top) dy = top - y;
            else if (y > bottom) dy = y - bottom;
            
            distance = Math.sqrt(dx * dx + dy * dy);
        }
        
        if (distance < minDistance) {
            minDistance = distance;
            nearestResource = resource;
        }
    }
    
    return nearestResource;
}

/**
 * Encontra um recurso pelo ID
 */
export function findResourceById(resourceId) {
    return resources.find(r => r.id === resourceId);
}

/**
 * Retorna o centro de um recurso
 */
export function getResourceCenter(resource) {
    if (resource.vertices && resource.vertices.length > 0) {
        let sumX = 0, sumY = 0;
        for (const vertex of resource.vertices) {
            sumX += vertex[0];
            sumY += vertex[1];
        }
        return {
            x: sumX / resource.vertices.length,
            y: sumY / resource.vertices.length
        };
    } else {
        return {
            x: resource.x + resource.width / 2,
            y: resource.y + resource.height / 2
        };
    }
}

// ============================================================================
// SEÇÃO 5: FUNÇÕES DE ANCORAGEM
// ============================================================================

/**
 * Calcula o ponto de ancoragem em um recurso
 * REFATORADO: Usa o CENTROIDE como origem das coordenadas locais
 * Isso simplifica rotações (basta rotacionar localX, localY em torno de 0,0)
 */
export function calculateAnchorPoint(resource, worldX, worldY) {
    // Obter o CENTROIDE do recurso como origem
    const centroid = getResourceCenter(resource);
    
    // Transladar as coordenadas do mundo para o centroide (nova origem)
    const localX = worldX - centroid.x;
    const localY = worldY - centroid.y;
    
    // Arredondar para 3 casas decimais para evitar erros de ponto flutuante
    return {
        x: Math.round(localX * 1000) / 1000,
        y: Math.round(localY * 1000) / 1000
    };
}

/**
 * Converte coordenadas de âncora (locais) para coordenadas mundiais
 * REFATORADO: Usa o CENTROIDE como origem das coordenadas locais
 * Coordenadas locais são simplesmente offset do centroide
 */
export function anchorToWorldCoordinates(resource, anchor) {
    // Obter o CENTROIDE do recurso como origem
    const centroid = getResourceCenter(resource);

    // Coordenadas mundiais = centroide + offset local
    return {
        x: Math.round((centroid.x + anchor.x) * 1000) / 1000,
        y: Math.round((centroid.y + anchor.y) * 1000) / 1000
    };
}

// ============================================================================
// SEÇÃO 6: TRANSFORMAÇÕES GEOMÉTRICAS (de connectiontransforms.js)
// ============================================================================

/**
 * Importação interna para updateConnectionPath
 * Nota: Usamos importação dinâmica para evitar dependência circular
 */
let updateConnectionPathFn = null;

async function getUpdateConnectionPath() {
    if (!updateConnectionPathFn) {
        const module = await import('./connectionCore.js');
        updateConnectionPathFn = module.updateConnectionPath;
    }
    return updateConnectionPathFn;
}

/**
 * Rotaciona conexões junto com uma área
 * @param {string|number} areaId - ID da área
 * @param {number} centerX - Centro de rotação X
 * @param {number} centerY - Centro de rotação Y
 * @param {number} angleDegrees - Ângulo de rotação em graus (padrão: 90)
 */
export function rotateConnectionsWithArea(areaId, centerX, centerY, angleDegrees = 90) {
    const connections = getConnections();
    if (!connections) return 0;
    
    const angleRad = angleDegrees * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    // Filtrar conexões que pertencem à área específica
    const areaConnections = connections.filter(c => {
        // Comparação estrita
        if (c.parentAreaId === areaId) return true;
        
        // Comparação flexível (== para diferentes tipos)
        if (c.parentAreaId == areaId) return true;
        
        // Comparação como string
        if (c.parentAreaId?.toString() === areaId?.toString()) return true;
        
        return false;
    });
    
    if (areaConnections.length === 0) {
        return 0;
    }
    
    // Rotacionar cada conexão encontrada
    areaConnections.forEach(async connection => {
        // Rotacionar pontos do caminho (path)
        if (connection.path && connection.path.length > 0) {
            connection.path = connection.path.map(point => {
                // Transladar para origem
                const translatedX = point.x - centerX;
                const translatedY = point.y - centerY;
                
                // Rotacionar pelo ângulo especificado
                const rotatedX = translatedX * cos - translatedY * sin;
                const rotatedY = translatedX * sin + translatedY * cos;
                
                // Transladar de volta
                return {
                    x: rotatedX + centerX,
                    y: rotatedY + centerY
                };
            });
        }
        
        // Rotacionar pontos legados (points) se existirem
        if (connection.points && connection.points.length > 0) {
            connection.points = connection.points.map(point => {
                // Transladar para origem
                const translatedX = point.x - centerX;
                const translatedY = point.y - centerY;
                
                // Rotacionar pelo ângulo especificado
                const rotatedX = translatedX * cos - translatedY * sin;
                const rotatedY = translatedX * sin + translatedY * cos;
                
                // Transladar de volta
                return {
                    x: rotatedX + centerX,
                    y: rotatedY + centerY
                };
            });
        }
        
        // Atualizar hubs se necessário
        if (connection.startHubId || connection.endHubId) {
            const updateFn = await getUpdateConnectionPath();
            if (updateFn) {
                updateFn(connection);
            }
        }
    });
    
    return areaConnections.length;
}

/**
 * Move conexões junto com uma área
 */
export function moveConnectionsWithArea(areaId, dx, dy) {
    const connections = getConnections();
    if (!connections) return 0;
    
    // Filtrar conexões que pertencem à área específica
    const areaConnections = connections.filter(c => {
        // Comparação estrita
        if (c.parentAreaId === areaId) return true;
        
        // Comparação flexível (== para diferentes tipos)
        if (c.parentAreaId == areaId) return true;
        
        // Comparação como string
        if (c.parentAreaId?.toString() === areaId?.toString()) return true;
        
        return false;
    });
    
    if (areaConnections.length === 0) {
        return 0;
    }
    
    // Mover cada conexão encontrada
    areaConnections.forEach(async connection => {
        // Mover pontos do caminho (path)
        if (connection.path && connection.path.length > 0) {
            connection.path = connection.path.map(point => ({
                x: point.x + dx,
                y: point.y + dy
            }));
        }
        
        // Mover pontos legados (points) se existirem
        if (connection.points && connection.points.length > 0) {
            connection.points = connection.points.map(point => ({
                x: point.x + dx,
                y: point.y + dy
            }));
        }
        
        // Atualizar hubs se necessário
        if (connection.startHubId || connection.endHubId) {
            const updateFn = await getUpdateConnectionPath();
            if (updateFn) {
                updateFn(connection);
            }
        }
    });
    
    return areaConnections.length;
}

// ============================================================================
// SEÇÃO 7: ESTATÍSTICAS E DEBUG
// ============================================================================

/**
 * Helper para imprimir estatísticas dos hubs no console
 * UNIFICADO: Usa registro global de hubs
 */
export function logHubStatistics() {
    console.group('📊 Estatísticas dos Hubs de Conexão');
    
    // Usar registro global via import direto
    const allHubs = hubs || [];
    
    let totalConnections = 0;
    
    // Agrupar por recurso
    const hubsByResource = new Map();
    allHubs.forEach(hub => {
        if (hub.resourceId) {
            if (!hubsByResource.has(hub.resourceId)) {
                hubsByResource.set(hub.resourceId, []);
            }
            hubsByResource.get(hub.resourceId).push(hub);
            totalConnections += (hub.connectionIds?.length || 0);
        }
    });
    
    hubsByResource.forEach((resourceHubs, resourceId) => {
        console.group(`🏢 Recurso ${resourceId}: ${resourceHubs.length} hubs`);
        resourceHubs.forEach(hub => {
        });
        console.groupEnd();
    });
    console.groupEnd();
}
