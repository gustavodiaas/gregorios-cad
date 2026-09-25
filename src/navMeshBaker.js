// src/navMeshBaker.js
// Responsável por gerar e atualizar a NavMesh baseada em grid para uma área
import { isPointInArea, pointInPolygon, getClosestPointOnPolygonEdge } from './areas.js';
import { resources, walls, movementAreas } from './state.js';
import { isStairResource, calculatePolygonBounds } from './resources.js';
import { pixelsPerCm } from './config.js';
// >>>>> CORREÇÃO: Importar openings do arquivo correto <<<<<
import { openings, getBoundaryOpeningsForArea } from './openings.js';
import { getExclusionZonesForArea } from './hub-exclusion-zones.js';
// >>>>> FIM DA CORREÇÃO <<<<<

// Função auxiliar para calcular a distância de um ponto a um segmento de linha
const distancePointToLineSegment = (point, segmentStart, segmentEnd) => {
    const [px, py] = point;
    const [x1, y1] = segmentStart;
    const [x2, y2] = segmentEnd;
    
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
        // Segmento é um ponto
        return Math.sqrt(A * A + B * B);
    }
    
    const param = dot / lenSq;
    let xx, yy;
    
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
};

// Larguras padrão de conexões suportadas pelo sistema
const SUPPORTED_CONNECTION_WIDTHS = [60, 120, 250]; // em cm

const STAIR_WALKWAY_EXTRA_CELLS = 1;

function normalizeVector2D(vector) {
    if (!vector) {
        return { x: 0, y: 0 };
    }
    const length = Math.hypot(vector.x, vector.y) || 1;
    return {
        x: vector.x / length,
        y: vector.y / length
    };
}

function deriveStairWalkwaySegment(stairResource) {
    if (!stairResource) {
        return null;
    }

    const orientation = stairResource.stairConfig?.orientation;
    if (orientation?.entryPoint && orientation?.exitPoint) {
        return {
            start: { x: orientation.entryPoint.x, y: orientation.entryPoint.y },
            end: { x: orientation.exitPoint.x, y: orientation.exitPoint.y }
        };
    }

    // Fallback: usar bounds da escada
    const vertices = stairResource.vertices;
    if (!Array.isArray(vertices) || vertices.length < 2) {
        return null;
    }

    const bounds = calculatePolygonBounds(vertices);
    if (bounds.width >= bounds.height) {
        const midY = bounds.minY + bounds.height / 2;
        return {
            start: { x: bounds.minX, y: midY },
            end: { x: bounds.maxX, y: midY }
        };
    }

    const midX = bounds.minX + bounds.width / 2;
    return {
        start: { x: midX, y: bounds.minY },
        end: { x: midX, y: bounds.maxY }
    };
}

function snapToGrid(value, gridSize) {
    if (!Number.isFinite(value) || !Number.isFinite(gridSize) || gridSize === 0) {
        return value;
    }
    return Math.round(value / gridSize) * gridSize;
}

function buildWalkwayNodeKeys(stairResource, navMesh, marginPx) {
    const segment = deriveStairWalkwaySegment(stairResource);
    if (!segment || !navMesh) {
        return [];
    }

    const gridSize = navMesh.gridSize || 5;
    const deltaX = segment.end.x - segment.start.x;
    const deltaY = segment.end.y - segment.start.y;
    const length = Math.hypot(deltaX, deltaY);

    if (length === 0) {
        return [];
    }

    const direction = normalizeVector2D({ x: deltaX, y: deltaY });
    
    // Aumentar a extensão para garantir que os nós cubram toda a escada e alcancem a área externa
    // A margem interna da escada pode ser de até 32px (definido em stairs.js), então precisamos garantir que a extensão supere isso + a margem externa
    const extension = Math.max((marginPx || 0) + 60, gridSize * 12); // Aumentado significativamente para garantir conexão
    const startExtended = {
        x: segment.start.x - direction.x * extension,
        y: segment.start.y - direction.y * extension
    };
    const endExtended = {
        x: segment.end.x + direction.x * extension,
        y: segment.end.y + direction.y * extension
    };

    const extendedLength = Math.hypot(endExtended.x - startExtended.x, endExtended.y - startExtended.y);
    const steps = Math.max(2, Math.round(extendedLength / gridSize)); // Pelo menos 2 passos
    const keys = new Set();

    // Criar nós ao longo do caminho
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sampleX = startExtended.x + (endExtended.x - startExtended.x) * t;
        const sampleY = startExtended.y + (endExtended.y - startExtended.y) * t;
        const snappedX = snapToGrid(sampleX, gridSize);
        const snappedY = snapToGrid(sampleY, gridSize);
        const key = `${snappedX},${snappedY}`;
        keys.add(key);
        
        // Adicionar nós perpendiculares para criar um corredor mais largo
        const perpendicular = { x: -direction.y, y: direction.x };
        const corridorWidth = gridSize * 2; // 2 células de largura
        
        for (let offset = -corridorWidth; offset <= corridorWidth; offset += gridSize) {
            if (offset === 0) continue; // Já adicionamos o centro
            const offsetX = snappedX + perpendicular.x * offset;
            const offsetY = snappedY + perpendicular.y * offset;
            const snappedOffsetX = snapToGrid(offsetX, gridSize);
            const snappedOffsetY = snapToGrid(offsetY, gridSize);
            keys.add(`${snappedOffsetX},${snappedOffsetY}`);
        }
    }
    return Array.from(keys);
}

/**
 * Gera múltiplas NavMeshes para uma área (uma para cada largura de conexão PADRÃO)
 * Esta função deve ser chamada sempre que uma área for criada, carregada ou restaurada.
 * @param {object} area - Área para gerar NavMeshes
 * @param {number} gridSize - Tamanho do grid (padrão: 5)
 */
const ensureAreaHasNavMesh = (area, gridSize = 5) => {
    if (!area) return;
    
    // Inicializar estrutura de múltiplas NavMeshes se não existir
    if (!area.navMeshes) {
        area.navMeshes = {};
    }
    
    // --- OTIMIZAÇÃO: LAZY NAVMESH ---
    // Gerar apenas a NavMesh de 60cm (pedestre) proativamente.
    // NavMeshes de 120cm e 250cm serão geradas sob demanda via getNavMeshForWidth.
    // Isso reduz o tempo de bake em ~66% na criação/carregamento de áreas.
    const baseWidth = 60;
    const baseMargin = baseWidth / 2;
    bakeNavigationMeshForWidth(area, baseWidth, baseMargin, gridSize);
    const baseNavMesh = getNavMeshForWidth(area, baseWidth);
    updateNavMeshWithObstacles(area, baseNavMesh);
    
    // Escolher navMesh padrão (60cm)
    area.navMesh = area.navMeshes['60'];
};

/**
 * Gera NavMesh para uma largura específica de conexão
 * @param {object} area - Área para gerar NavMesh
 * @param {number} connectionWidth - Largura da conexão em cm
 * @param {number} marginCm - Margem de segurança em cm (50% da largura)
 * @param {number} gridSize - Tamanho do grid (padrão: 5)
 */
const bakeNavigationMeshForWidth = (area, connectionWidth, marginCm, gridSize = 5) => {
    const widthKey = connectionWidth.toString();
    
    if (!area.navMeshes[widthKey]) {
        area.navMeshes[widthKey] = { 
            connectionWidth,
            marginCm,
            gridSize, 
            nodes: new Map(), 
            baked: false 
        };
    } else {
        area.navMeshes[widthKey].connectionWidth = connectionWidth;
        area.navMeshes[widthKey].marginCm = marginCm;
        area.navMeshes[widthKey].gridSize = gridSize;
        area.navMeshes[widthKey].nodes = new Map();
        area.navMeshes[widthKey].baked = false;
    }
    
    const navMesh = area.navMeshes[widthKey];
    const { vertices } = area;
    if (!vertices || vertices.length === 0) return navMesh;
    
    // Definir tolerância para margem de segurança das bordas
    const tolerance = 0.1; // Pequena margem para evitar nós na borda exata
    
    // Bounding box
    let minX = Math.min(...vertices.map(v => v[0]));
    let maxX = Math.max(...vertices.map(v => v[0]));
    let minY = Math.min(...vertices.map(v => v[1]));
    let maxY = Math.max(...vertices.map(v => v[1]));

    // Alinhar o grid à origem global (0,0) para garantir continuidade entre áreas
    // O primeiro nó será o menor múltiplo de gridSize maior ou igual a minX/minY
    const startX = Math.ceil(minX / gridSize) * gridSize;
    const startY = Math.ceil(minY / gridSize) * gridSize;

    for (let x = startX; x <= maxX; x += gridSize) {
        for (let y = startY; y <= maxY; y += gridSize) {
            const pointToCheck = [x, y];
            let isInsideAndSafe = isPointInArea(pointToCheck, area);

            if (isInsideAndSafe) {
                const nodeKey = `${x},${y}`;
                navMesh.nodes.set(nodeKey, {
                    x,
                    y,
                    walkable: true, // Inicialmente todos são caminháveis
                    distanceToEdge: null // Será calculado em updateNavMeshWithObstacles
                });
            }
        }
    }

    navMesh.baked = true;
    return navMesh;
};

/**
 * Função compatível com código legado - mantida para não quebrar o sistema existente
 */
const bakeNavigationMesh = (area, gridSize = 5) => {
    // Inicializar estrutura de múltiplas NavMeshes se não existir
    if (!area.navMeshes) {
        area.navMeshes = {};
    }
    
    // Usar a nova função para largura padrão de 60cm
    const navMesh = bakeNavigationMeshForWidth(area, 60, 30, gridSize);
    
    // Manter compatibilidade: area.navMesh aponta para a NavMesh de 60cm
    area.navMesh = navMesh;
    
    return navMesh;
};

/**
 * Atualiza NavMesh específica com obstáculos
 * @param {object} area - Área a ser atualizada
 * @param {object} navMesh - Objeto NavMesh a ser atualizado
 */
const updateNavMeshWithObstacles = (area, navMesh) => {
    if (!area || !navMesh || !navMesh.baked) {
        // Se a navMesh não for válida, não faz nada.
        return;
    }
    
    // Defesa: garantir que nodes é sempre um Map
    if (!(navMesh.nodes instanceof Map)) {
        console.warn("[Gregório's CAD] navMesh.nodes não era um Map, foi reinicializado. Valor anterior:", navMesh.nodes);
        navMesh.nodes = new Map();
        return; // Não há nós para atualizar, então retorna
    }
    // Recursos como obstáculos
    const resourcesInArea = resources.filter(r => r.parentAreaId === area.id);
    // Paredes como obstáculos (exceto onde há abertura)
    const wallsInArea = walls.filter(w => w.parentAreaId === area.id);
    const openingsInArea = openings.filter(o => o.parentAreaId === area.id);
    
    // Aberturas de borda (docas) - permitem passagem pelas bordas da área
    const boundaryOpeningsInArea = openingsInArea.filter(o => o.isBoundaryOpening);

    const marginPx = navMesh.marginCm * pixelsPerCm;

    // Helper para saber se um ponto está em uma abertura
    // Usa marginPx como distância máxima para cobrir toda a zona de segurança da parede
    function isPointInOpening(x, y) {
        for (const opening of openingsInArea) {
            // >>>>> INÍCIO DA CORREÇÃO <<<<<
            // Melhorar a detecção de abertura usando distância ponto-linha
            const [x1, y1] = opening.startPoint;
            const [x2, y2] = opening.endPoint;
            
            // Distância ponto-linha (similar ao cálculo das paredes)
            const A = x - x1;
            const B = y - y1;
            const C = x2 - x1;
            const D = y2 - y1;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            
            if (len_sq === 0) continue; // Abertura com comprimento zero
            
            const param = dot / len_sq;
            
            // Verificar se o ponto projeta dentro do segmento da abertura (com margem nos extremos)
            if (param >= -0.1 && param <= 1.1) {
                const clampedParam = Math.max(0, Math.min(1, param));
                const xx = x1 + clampedParam * C;
                const yy = y1 + clampedParam * D;
                const dist = Math.sqrt((x - xx) ** 2 + (y - yy) ** 2);
                
                // >>>>> FIX: Usar marginPx em vez de 8px fixo <<<<<
                // A tolerância deve cobrir toda a zona de margem da parede,
                // caso contrário nós entre 8px e marginPx ficam bloqueados
                // quando a parede-pai da abertura ainda existe no array de paredes
                if (dist < marginPx + 2) {
                    // >>>>> FIM DO FIX <<<<<
                    return true;
                }
            }
            // >>>>> FIM DA CORREÇÃO <<<<<
        }
        return false;
    }
    
    // Helper para verificar se um ponto está próximo de uma abertura de borda
    // Permite que nós próximos a aberturas de borda permaneçam walkable
    function isPointNearBoundaryOpening(x, y, maxDistance) {
        for (const opening of boundaryOpeningsInArea) {
            const [x1, y1] = opening.startPoint;
            const [x2, y2] = opening.endPoint;
            
            const A = x - x1;
            const B = y - y1;
            const C = x2 - x1;
            const D = y2 - y1;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            
            if (len_sq === 0) continue;
            
            const param = dot / len_sq;
            
            // Verificar se o ponto projeta dentro do segmento da abertura (com margem)
            if (param >= -0.1 && param <= 1.1) {
                const xx = x1 + Math.max(0, Math.min(1, param)) * C;
                const yy = y1 + Math.max(0, Math.min(1, param)) * D;
                const dist = Math.sqrt((x - xx) ** 2 + (y - yy) ** 2);
                
                // Permitir nós dentro da distância máxima da abertura de borda
                if (dist < maxDistance) {
                    return true;
                }
            }
        }
        return false;
    }

    // Pré-computar zonas de exclusão de hubs para esta área
    const hubExclusionZones = getExclusionZonesForArea(area.id);

    // Separar escadas e construir seus walkways ANTES de processar obstáculos
    const stairResources = resourcesInArea.filter(isStairResource);
    const nonBlockingResources = resourcesInArea.filter(res =>
        !isStairResource(res)
        && res?.type !== 'operator'
        && res?.machineType !== 'overhead-crane'
    );
    
    // Construir mapa de nós de walkway de escadas para verificação rápida
    const stairWalkwayKeysSet = new Set();
    for (const stair of stairResources) {
        const walkwayKeys = buildWalkwayNodeKeys(stair, navMesh, marginPx);
        walkwayKeys.forEach(key => stairWalkwayKeysSet.add(key));
    }

    // ========== SPATIAL INDEX: Pré-computar bounding boxes inflados ==========
    // Isto evita calcular distancePointToLineSegment para nós que estão longe do obstáculo
    
    // Helper: calcula AABB inflado de um obstáculo (polígono ou retângulo)
    const computeInflatedAABB = (obstacle, inflation) => {
        let minX, maxX, minY, maxY;
        if (obstacle.vertices && obstacle.vertices.length > 0) {
            minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
            for (const v of obstacle.vertices) {
                if (v[0] < minX) minX = v[0];
                if (v[0] > maxX) maxX = v[0];
                if (v[1] < minY) minY = v[1];
                if (v[1] > maxY) maxY = v[1];
            }
        } else {
            minX = obstacle.x;
            maxX = obstacle.x + obstacle.width;
            minY = obstacle.y;
            maxY = obstacle.y + obstacle.height;
        }
        return {
            minX: minX - inflation,
            maxX: maxX + inflation,
            minY: minY - inflation,
            maxY: maxY + inflation
        };
    };

    // Helper: retorna os vértices do obstáculo como array de [x,y]
    const getObstacleVertices = (obstacle) => {
        if (obstacle.vertices && obstacle.vertices.length > 0) return obstacle.vertices;
        return [
            [obstacle.x, obstacle.y],
            [obstacle.x + obstacle.width, obstacle.y],
            [obstacle.x + obstacle.width, obstacle.y + obstacle.height],
            [obstacle.x, obstacle.y + obstacle.height]
        ];
    };

    // Pré-computar AABBs para recursos, escadas e paredes
    const resourceAABBs = nonBlockingResources.map(res => ({
        obstacle: res,
        aabb: computeInflatedAABB(res, marginPx),
        verts: getObstacleVertices(res)
    }));
    const stairAABBs = stairResources.map(stair => ({
        obstacle: stair,
        aabb: computeInflatedAABB(stair, marginPx),
        verts: getObstacleVertices(stair)
    }));
    const wallAABBs = wallsInArea.map(wall => {
        const [x1, y1] = wall.startPoint;
        const [x2, y2] = wall.endPoint;
        return {
            wall,
            aabb: {
                minX: Math.min(x1, x2) - marginPx,
                maxX: Math.max(x1, x2) + marginPx,
                minY: Math.min(y1, y2) - marginPx,
                maxY: Math.max(y1, y2) + marginPx
            }
        };
    });
    // ========== FIM DO SPATIAL INDEX ==========
    
    for (const node of navMesh.nodes.values()) {
        node.walkable = true;
        node.isStairWalkway = false;
        const x = node.x;
        const y = node.y;
        
        // Verificação das bordas da área (considerando margem específica desta NavMesh)
        const { vertices } = area;
        let minDistanceToEdge = Infinity;
        
        // Calcular distância até cada aresta da área
        for (let i = 0; i < vertices.length; i++) {
            const currentVertex = vertices[i];
            const nextVertex = vertices[(i + 1) % vertices.length];
            const dist = distancePointToLineSegment([x, y], currentVertex, nextVertex);
            if (dist < minDistanceToEdge) minDistanceToEdge = dist;
        }
        
        // Armazenar a distância calculada
        node.distanceToEdge = minDistanceToEdge;
        
        // Definir tolerância para margem de segurança das bordas
        const tolerance = 0.1;
        
        // Bloquear nó se estiver muito próximo da borda da área
        // EXCEÇÃO: permitir walkability perto de aberturas de borda (docas)
        if (minDistanceToEdge < (marginPx + tolerance)) {
            // Verificar se este nó está próximo de uma abertura de borda
            if (!isPointNearBoundaryOpening(x, y, marginPx + 5)) {
                node.walkable = false;
                continue;
            }
            // Nó está perto de uma abertura de borda - manter walkable
        }
        
        // Recursos como obstáculos (EXCETO ESCADAS!) — com filtro AABB
        for (const entry of resourceAABBs) {
            // SPATIAL INDEX: pular se nó está fora do AABB inflado
            const bb = entry.aabb;
            if (x < bb.minX || x > bb.maxX || y < bb.minY || y > bb.maxY) continue;
            
            const verts = entry.verts;
            
            // CORREÇÃO: Verificar se o nó está DENTRO do polígono do recurso
            // Pontos internos nunca devem ser navegáveis (não se caminha por dentro de máquinas)
            if (pointInPolygon([x, y], verts)) {
                node.walkable = false;
                break;
            }
            
            // Nó está fora do polígono — calcular distância precisa à borda (margem de segurança)
            let minDistanceToResource = Infinity;
            for (let i = 0; i < verts.length; i++) {
                const dist = distancePointToLineSegment([x, y], verts[i], verts[(i + 1) % verts.length]);
                if (dist < minDistanceToResource) minDistanceToResource = dist;
            }
            if (minDistanceToResource < marginPx) {
                node.walkable = false;
                break;
            }
        }
        if (!node.walkable) continue;
        
        // Escadas como obstáculos (EXCETO nos nós de walkway) — com filtro AABB
        const nodeKey = `${x},${y}`;
        if (!stairWalkwayKeysSet.has(nodeKey)) {
            for (const entry of stairAABBs) {
                const bb = entry.aabb;
                if (x < bb.minX || x > bb.maxX || y < bb.minY || y > bb.maxY) continue;
                
                const verts = entry.verts;
                
                // CORREÇÃO: Verificar se o nó está DENTRO do polígono da escada
                if (pointInPolygon([x, y], verts)) {
                    node.walkable = false;
                    break;
                }
                
                // Nó está fora — verificar margem de segurança
                let minDistanceToStair = Infinity;
                for (let i = 0; i < verts.length; i++) {
                    const dist = distancePointToLineSegment([x, y], verts[i], verts[(i + 1) % verts.length]);
                    if (dist < minDistanceToStair) minDistanceToStair = dist;
                }
                if (minDistanceToStair < marginPx) {
                    node.walkable = false;
                    break;
                }
            }
        }
        if (!node.walkable) continue;
        
        // Paredes como obstáculos (considerando margem da conexão) — com filtro AABB
        for (const entry of wallAABBs) {
            const bb = entry.aabb;
            if (x < bb.minX || x > bb.maxX || y < bb.minY || y > bb.maxY) continue;
            
            const wall = entry.wall;
            const [x1, y1] = wall.startPoint;
            const [x2, y2] = wall.endPoint;
            const dist = distancePointToLineSegment([x, y], [x1, y1], [x2, y2]);
            
            if (dist < marginPx) {
                if (!isPointInOpening(x, y)) {
                    node.walkable = false;
                    break;
                }
            }
        }
        if (!node.walkable) continue;

        // Zonas de exclusão de hubs — bloquear nós na área de proteção
        for (const zone of hubExclusionZones) {
            const dx = x - zone.hubX;
            const dy = y - zone.hubY;
            const distSq = dx * dx + dy * dy;
            if (distSq >= zone.radiusPx * zone.radiusPx) continue;
            // Zona de exclusão: nós permanecem walkable.
            // A zona serve para impedir colocação de recursos, não para bloquear caminhos.
        }
    }

    // Marcar nós de walkway de escadas
    if (stairResources.length > 0) {
        for (const stair of stairResources) {
            let markedCount = 0;
            
            for (const key of stairWalkwayKeysSet) {
                const node = navMesh.nodes.get(key);
                if (node && node.walkable) {
                    node.isStairWalkway = true;
                    markedCount++;
                }
            }
        }
    }
};

/**
 * Processa todas as áreas para garantir que tenham NavMesh
 * Útil para carregamento de layouts e restauração de histórico
 * @param {Array} areas - Array de áreas para processar
 * @param {number} gridSize - Tamanho do grid (padrão: 5)
 */
const ensureAllAreasHaveNavMesh = (areas, gridSize = 5) => {
    if (!areas || !Array.isArray(areas)) return;
    
    
    areas.forEach(area => {
        ensureAreaHasNavMesh(area, gridSize);
    });
    
};

/**
 * Obtém a NavMesh apropriada para uma largura de conexão específica
 * @param {object} area - Área que contém as NavMeshes
 * @param {number} connectionWidth - Largura da conexão em cm
 * @returns {object} - NavMesh correspondente ou navMesh padrão
 */
const getNavMeshForWidth = (area, connectionWidth) => {
    if (!area) {
        return null;
    }
    
    const widthKey = connectionWidth.toString();
    
    // Se a área tem múltiplas NavMeshes, usar a específica
    if (area.navMeshes && area.navMeshes[widthKey]) {
        return area.navMeshes[widthKey];
    }
    
    // --- LAZY BAKE: Gerar NavMesh sob demanda se não existir ---
    // Isso permite que ensureAreaHasNavMesh gere apenas 60cm,
    // e larguras maiores (120, 250) sejam criadas quando realmente necessárias.
    if (area.navMeshes && SUPPORTED_CONNECTION_WIDTHS.includes(connectionWidth)) {
        const marginCm = connectionWidth / 2;
        const gridSize = area.navMeshes['60']?.gridSize || 5;
        bakeNavigationMeshForWidth(area, connectionWidth, marginCm, gridSize);
        const navMesh = area.navMeshes[widthKey];
        if (navMesh) {
            updateNavMeshWithObstacles(area, navMesh);
            return navMesh;
        }
    }
    
    // Se não encontrou a largura exata, tentar encontrar a mais próxima
    if (area.navMeshes) {
        const availableWidths = Object.keys(area.navMeshes).map(w => parseInt(w));
        
        if (availableWidths.length === 0) {
            return area.navMesh; // Fallback
        }
        
        const closestWidth = availableWidths.reduce((closest, current) => {
            return Math.abs(current - connectionWidth) < Math.abs(closest - connectionWidth) ? current : closest;
        }, availableWidths[0]);
        
        return area.navMeshes[closestWidth.toString()];
    }
    
    // Fallback para compatibilidade com código legado
    return area.navMesh;
};

/**
 * Verifica se um ponto é navegável considerando a largura da conexão
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @param {object} area - Área de movimento
 * @param {number} connectionWidth - Largura da conexão em cm
 * @returns {boolean} - True se o ponto é navegável
 */
const isWalkableForWidth = (x, y, area, connectionWidth = 60) => {
    const navMesh = getNavMeshForWidth(area, connectionWidth);
    if (!navMesh || !navMesh.nodes) return false;
    
    const nodeKey = `${x},${y}`;
    const node = navMesh.nodes.get(nodeKey);
    return node ? node.walkable : false;
};

/**
 * Encontra o nó navegável mais próximo seguindo a direção da âncora para fora do recurso
 * Limita a busca para preservar a função das margens de segurança da largura da conexão
 * @param {number} anchorX - Coordenada X da âncora (centro do hub)
 * @param {number} anchorY - Coordenada Y da âncora (centro do hub)
 * @param {object} area - Área de movimento
 * @param {number} connectionWidth - Largura da conexão em cm
 * @param {object} resource - Recurso associado ao hub (para calcular direção)
 * @returns {object|null} - {x, y} do nó navegável mais próximo ou null
 */
const findNearestWalkableNode = (anchorX, anchorY, area, connectionWidth = 60, resource = null) => {
    const navMesh = getNavMeshForWidth(area, connectionWidth);
    if (!navMesh || !navMesh.nodes || navMesh.nodes.size === 0) return null;
    
    console.log(`%c[DEBUG findNearestWalkableNode] ENTRADA:`, 'color: #cc00cc; font-weight: bold;',
        `\n  anchorX=${anchorX?.toFixed?.(1)}, anchorY=${anchorY?.toFixed?.(1)}`,
        `\n  area: ${area?.id}`,
        `\n  connectionWidth: ${connectionWidth}`,
        `\n  resource: ${resource?.id} (${resource?.name || 'N/A'})`,
        `\n  navMesh nodes: ${navMesh.nodes.size}, gridSize: ${navMesh.gridSize}, marginCm: ${navMesh.marginCm}`
    );
    
    // Se não temos o recurso, não é possível calcular direção - falhar imediatamente
    if (!resource) {
        console.warn('⚠️ Recurso não fornecido - não é possível calcular direção de busca');
        return null;
    }
    
    // PASSO 1: Encontrar a borda mais próxima do polígono do recurso
    const resourceVertices = resource.vertices || [
        [resource.x, resource.y],
        [resource.x + resource.width, resource.y],
        [resource.x + resource.width, resource.y + resource.height],
        [resource.x, resource.y + resource.height]
    ];
    
    const closestPointOnEdge = getClosestPointOnPolygonEdge(resourceVertices, { x: anchorX, y: anchorY });
    
    console.log(`%c[DEBUG findNearestWalkableNode] PASSO 1-2:`, 'color: #cc00cc;',
        `\n  resourceVertices (primeiros 4): ${JSON.stringify(resourceVertices.slice(0, 4))}`,
        `\n  closestPointOnEdge: (${closestPointOnEdge.x.toFixed(1)}, ${closestPointOnEdge.y.toFixed(1)})`,
        `\n  anchor: (${anchorX.toFixed(1)}, ${anchorY.toFixed(1)})`,
        `\n  distância anchor→edge: ${Math.sqrt((anchorX-closestPointOnEdge.x)**2 + (anchorY-closestPointOnEdge.y)**2).toFixed(1)}`
    );
    
    // PASSO 2: Calcular vetor de direção da âncora para fora do recurso
    const directionVector = {
        x: anchorX - closestPointOnEdge.x,
        y: anchorY - closestPointOnEdge.y
    };
    
    // Normalizar o vetor de direção
    const magnitude = Math.sqrt(directionVector.x ** 2 + directionVector.y ** 2);
    if (magnitude === 0) {
        console.warn('⚠️ Âncora está exatamente na borda do recurso - geometria inválida');
        return null;
    }
    
    const normalizedDirection = {
        x: directionVector.x / magnitude,
        y: directionVector.y / magnitude
    };
    
    
    // PASSO 3: Definir zona de busca baseada na margem de segurança da NavMesh específica
    const marginPx = navMesh.marginCm * pixelsPerCm; // Usar a margem específica da NavMesh (dinâmica)
    const minSearchDistance = marginPx;               // Distância mínima = margem da NavMesh
    const maxSearchDistance = marginPx * 1.5;        // Distância máxima = 150% da margem da NavMesh
    
    
    // PASSO 4: Buscar nó navegável na direção calculada
    let bestNode = null;
    let bestDistance = Infinity;
    
    // Buscar em incrementos ao longo da direção
    const searchStep = navMesh.gridSize || 5;
    const maxSteps = Math.ceil(maxSearchDistance / searchStep);
    
    for (let step = Math.ceil(minSearchDistance / searchStep); step <= maxSteps; step++) {
        const searchDistance = step * searchStep;
        
        // Calcular posição de busca ao longo da direção
        const searchX = Math.round(closestPointOnEdge.x + normalizedDirection.x * searchDistance);
        const searchY = Math.round(closestPointOnEdge.y + normalizedDirection.y * searchDistance);
        
        // Verificar se há um nó navegável nesta posição
        const nodeKey = `${searchX},${searchY}`;
        const node = navMesh.nodes.get(nodeKey);
        
        if (node && node.walkable) {
            const distanceFromAnchor = Math.sqrt(
                Math.pow(node.x - anchorX, 2) + 
                Math.pow(node.y - anchorY, 2)
            );
            
            if (distanceFromAnchor < bestDistance) {
                bestDistance = distanceFromAnchor;
                bestNode = { x: node.x, y: node.y };
            }
            
            break; // Encontrou o primeiro nó navegável na direção correta
        }
    }
    
    if (bestNode) {
        console.log(`%c[DEBUG findNearestWalkableNode] RESULTADO:`, 'color: #cc00cc; font-weight: bold;',
            `\n  ✅ Nó encontrado: (${bestNode.x}, ${bestNode.y})`,
            `\n  Distância anchor→nó: ${bestDistance.toFixed(1)}`,
            `\n  Direção normalizada: (${normalizedDirection.x.toFixed(3)}, ${normalizedDirection.y.toFixed(3)})`
        );
    } else {
        console.warn(`⚠️ Nenhum nó navegável encontrado na direção adequada para âncora (${anchorX}, ${anchorY}) - conexão ${connectionWidth}cm pode estar obstruída`,
            `\n  Direção de busca: (${normalizedDirection.x.toFixed(3)}, ${normalizedDirection.y.toFixed(3)})`,
            `\n  Zona de busca: min=${(Math.ceil((navMesh.marginCm * pixelsPerCm) / (navMesh.gridSize || 5)) * (navMesh.gridSize || 5)).toFixed(1)} max=${(navMesh.marginCm * pixelsPerCm * 1.5).toFixed(1)}`
        );
    }
    
    return bestNode;
};

/**
 * Obtém todas as larguras de conexão disponíveis no sistema
 * Com a nova abordagem proativa, sempre mostramos as larguras padrão quando há áreas
 * @returns {Array} - Array com as larguras disponíveis (ordenado)
 */
const getAvailableConnectionWidths = () => {
    // Verificar se existe pelo menos uma área no sistema
    const hasAreas = movementAreas && movementAreas.length > 0;
    
    // Se não há áreas, não mostrar opções
    if (!hasAreas) {
        return [];
    }
    
    // Com a nova abordagem proativa, sempre mostramos as larguras padrão
    // pois elas são criadas automaticamente para cada área
    let availableWidths = [...SUPPORTED_CONNECTION_WIDTHS];
    
    // Adicionar larguras personalizadas de conexões já desenhadas
    if (typeof window !== 'undefined' && window.getConnections) {
        const connections = window.getConnections();
        
        const drawnConnections = connections.filter(conn => {
            const hasValidPath = (conn.path && conn.path.length > 1) || 
                                (conn.points && conn.points.length > 1);
            const isComplete = !conn.isCreating;
            return hasValidPath && isComplete;
        });
        
        const customWidths = drawnConnections
            .map(conn => conn.width || 60)
            .filter(width => !SUPPORTED_CONNECTION_WIDTHS.includes(width));
        
        availableWidths = [...availableWidths, ...customWidths];
    }
    
    // Remover duplicatas e ordenar
    const uniqueWidths = [...new Set(availableWidths)];
    return uniqueWidths.sort((a, b) => a - b);
};

/**
 * Obtém o nome descritivo para uma largura de conexão
 * @param {number} width - Largura em cm
 * @returns {string} - Nome descritivo
 */
const getConnectionWidthName = (width) => {
    const widthNames = {
        60: 'Pedestre',
        120: 'Paleteira', 
        250: 'Empilhadeira'
    };
    
    return widthNames[width] || 'Personalizado';
};

export { 
    bakeNavigationMesh, 
    updateNavMeshWithObstacles, 
    ensureAreaHasNavMesh, 
    ensureAllAreasHaveNavMesh,
    getNavMeshForWidth,
    isWalkableForWidth,
    findNearestWalkableNode,
    getAvailableConnectionWidths,
    getConnectionWidthName,
    SUPPORTED_CONNECTION_WIDTHS,
    bakeNavigationMeshForWidth
};
