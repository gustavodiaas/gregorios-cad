import { projectPointOutOfRectangle, resources, walls } from './state.js';

// ============================================================================
// Binary Min-Heap para open set do A* — O(log N) insert/extract vs O(N) array
// ============================================================================
class BinaryMinHeap {
    constructor() {
        this._heap = [];     // Array de { key, priority }
        this._index = new Map(); // key → posição no heap (para decrease-key)
    }

    get size() { return this._heap.length; }

    push(key, priority) {
        const node = { key, priority };
        this._heap.push(node);
        this._index.set(key, this._heap.length - 1);
        this._bubbleUp(this._heap.length - 1);
    }

    pop() {
        if (this._heap.length === 0) return null;
        const top = this._heap[0];
        const last = this._heap.pop();
        this._index.delete(top.key);
        if (this._heap.length > 0) {
            this._heap[0] = last;
            this._index.set(last.key, 0);
            this._sinkDown(0);
        }
        return top.key;
    }

    has(key) { return this._index.has(key); }

    decreaseKey(key, newPriority) {
        const idx = this._index.get(key);
        if (idx === undefined) return;
        if (newPriority < this._heap[idx].priority) {
            this._heap[idx].priority = newPriority;
            this._bubbleUp(idx);
        }
    }

    _bubbleUp(i) {
        const heap = this._heap;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (heap[i].priority >= heap[parent].priority) break;
            this._swap(i, parent);
            i = parent;
        }
    }

    _sinkDown(i) {
        const heap = this._heap;
        const n = heap.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && heap[left].priority < heap[smallest].priority) smallest = left;
            if (right < n && heap[right].priority < heap[smallest].priority) smallest = right;
            if (smallest === i) break;
            this._swap(i, smallest);
            i = smallest;
        }
    }

    _swap(a, b) {
        const heap = this._heap;
        const tmp = heap[a];
        heap[a] = heap[b];
        heap[b] = tmp;
        this._index.set(heap[a].key, a);
        this._index.set(heap[b].key, b);
    }
}

// Função utilitária para verificar se um ponto está dentro de um retângulo
function isPointInRectangle(point, rect) {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
}

// Função robusta para garantir que o ponto de âncora seja sempre navegável
export function findValidAnchorPoint(anchorPoint, area, isWalkable) {
    // 1. Verificação rápida
    if (isWalkable(anchorPoint.x, anchorPoint.y, area)) {
        return anchorPoint;
    }

    // 2. Corrigir ponto inválido
    // Unir todos obstáculos relevantes
    const obstacles = [
        ...resources.map(r => ({
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            margin: 8 // valor padrão, ajuste conforme necessário
        })),
        ...walls.map(w => ({
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            margin: 8 // valor padrão, ajuste conforme necessário
        }))
    ];

    for (const obstacle of obstacles) {
        const inflatedRect = {
            x: obstacle.x - obstacle.margin,
            y: obstacle.y - obstacle.margin,
            width: obstacle.width + (obstacle.margin * 2),
            height: obstacle.height + (obstacle.margin * 2)
        };
        if (isPointInRectangle(anchorPoint, inflatedRect)) {
            return projectPointOutOfRectangle(anchorPoint, inflatedRect);
        }
    }

    // Se não encontrou obstáculo, retorna o ponto original
    return anchorPoint;
}

/*
**Prompt para GitHub Copilot: Correção Definitiva da Validação de Pontos de Ancoragem**

**Contexto:**
Estamos finalizando uma correção de performance no sistema de pathfinding. As correções anteriores melhoraram o sistema, mas ainda existe uma diferença de performance gritante ao mover certos recursos. O problema raiz foi identificado: a lógica de validação de pontos de âncora falha quando o ponto está na "área de margem" de um obstáculo, mas não exatamente dentro de seu retângulo principal. Isso faz com que a função `aStarPathfinding` seja chamada com um ponto de partida/chegada inválido, resultando em uma busca longa e mal sucedida (milhares de iterações) que termina em um "fallback", causando a lentidão.

**Tarefa a ser implementada:**
Vamos substituir a lógica atual de validação de pontos de âncora (provavelmente na função `findValidEntryPoint` ou similar) por um método novo, unificado e robusto. Esta nova lógica deve garantir que um ponto de âncora seja SEMPRE válido antes de ser passado para o `aStarPathfinding`.

**Detalhes da Implementação:**
A nova lógica para a função que valida um `anchorPoint` deve seguir estes passos:

1.  **Verificação Inicial Rápida:**
    * Primeiro, verifique se o `anchorPoint` já é navegável usando a função `isWalkable(anchorPoint.x, anchorPoint.y, area)`.
    * Se `isWalkable` retornar `true`, o ponto é perfeito. Retorne o `anchorPoint` original imediatamente.

2.  **Lógica de Correção (se a verificação falhar):**
    * Se `isWalkable` retornar `false`, significa que o ponto está em uma área não navegável (provavelmente a margem de um obstáculo). Agora, precisamos corrigi-lo.
    * **Encontre o Obstáculo "Culpado":**
        * Crie uma lista com todos os obstáculos relevantes (combine `state.resources` e `state.walls`).
        * Itere sobre cada `obstacle` nesta lista.
        * Para cada obstáculo, crie um novo retângulo "inflado" que represente o obstáculo mais a sua margem de segurança (`config.resourceMargin` ou `config.wallMargin`). Você pode calcular isso assim:
            ```javascript
            const inflatedRect = {
              x: obstacle.x - obstacle.margin,
              y: obstacle.y - obstacle.margin,
              width: obstacle.width + (obstacle.margin * 2),
              height: obstacle.height + (obstacle.margin * 2)
            };
            ```
        * Use a função `isPointInRectangle(anchorPoint, inflatedRect)` para verificar se o ponto de âncora está dentro desta área inflada.

3.  **Projeção e Retorno:**
    * Assim que você encontrar o primeiro `inflatedRect` que contém o `anchorPoint`, você encontrou o obstáculo que está causando o bloqueio.
    * Use a função `projectPointOutOfRectangle(anchorPoint, inflatedRect)` para projetar o ponto para a borda mais próxima desta **área inflada**.
    * Retorne imediatamente o novo ponto projetado. Com isso, a função termina, tendo corrigido com sucesso o ponto inválido.

**Objetivo Final:**
Essa nova implementação garante que, para qualquer ponto de âncora, a função retornará um ponto navegável de forma determinística e instantânea, eliminando completamente os "fallbacks" que causavam a lentidão e a performance assimétrica. A antiga busca em espiral (`findFirstWalkableNodeInSpiral`) deve ser removida se ainda existir.
*/
// Módulo de Pathfinding - Algoritmo A* para Navigation Mesh
// Responsável por encontrar caminhos detalhados entre pontos de ancoragem usando o grafo de navegação

import { 
    getNavigationGraph, 
    findAreaSequence, 
    getPortalsAlongPath,
    isPointInPolygon 
} from './navigation.js';
import { movementAreas } from './state.js';
import { rectangleToVertices, getClosestPointOnPolygonEdge } from './areas.js';

/**
 * Função principal de pathfinding que aceita objetos de ancoragem
 * @param {object} startAnchorObj - { resourceId: "res-A", anchor: { x: 15, y: 20 } }
 * @param {object} endAnchorObj - { resourceId: "res-B", anchor: { x: 10, y: 30 } }
 * @param {object} graph - Grafo de navegação (opcional, será obtido se não fornecido)
 * @param {number} connectionWidth - Largura da conexão em cm (padrão: 60)
 * @returns {Array} - Array de pontos {x, y} representando o caminho ou [] se não houver caminho
 */
export function findPath(startAnchorObj, endAnchorObj, graph = null, connectionWidth = 60) {
    try {
        // --- Passo 1: Obter recursos e posições de âncora ---
        const startResource = resources.find(r => r.id === startAnchorObj.resourceId);
        const endResource = resources.find(r => r.id === endAnchorObj.resourceId);

        if ((!startResource && !startAnchorObj.isVirtual) || (!endResource && !endAnchorObj.isVirtual)) {
            return [];
        }

        const startPos = calculateWorldAnchorPosition(startAnchorObj); // Posição real da âncora
        const endPos = calculateWorldAnchorPosition(endAnchorObj);     // Posição real da âncora

        if (!startPos || !endPos) {
            return [];
        }

        // [DEBUG removido — log de alta frequência durante drag]
        // console.log(`%c[DEBUG findPath] Posições calculadas:`, 'color: #0099ff; font-weight: bold;',
        //     `\n  startPos: ...`, `\n  endPos: ...`, `\n  startAnchor: ...`, `\n  endAnchor: ...`);

        // Para âncoras virtuais (boundary hubs) na borda exata da área,
        // projetar levemente para dentro para garantir que estejam na zona walkable
        const BOUNDARY_INSET = 5; // pixels para dentro da área
        const nudgeBoundaryPoint = (pos, isVirtual) => {
            if (!isVirtual) return pos;
            // Encontrar a área mais próxima que contém ou quase contém este ponto
            const containingArea = movementAreas.find(a => {
                if (!a.vertices || a.vertices.length === 0) {
                    return pos.x >= a.x - 1 && pos.x <= a.x + a.width + 1 &&
                           pos.y >= a.y - 1 && pos.y <= a.y + a.height + 1;
                }
                // Para polígonos, usar tolerância expandida
                return isPointInPolygon(pos, a.vertices) || 
                       isNearPolygonEdge(pos, a.vertices, BOUNDARY_INSET);
            });
            if (!containingArea) return pos;
            // Calcular centroide da área
            let cx, cy;
            if (containingArea.vertices && containingArea.vertices.length > 0) {
                cx = 0; cy = 0;
                for (const v of containingArea.vertices) { cx += v[0]; cy += v[1]; }
                cx /= containingArea.vertices.length;
                cy /= containingArea.vertices.length;
            } else {
                cx = containingArea.x + containingArea.width / 2;
                cy = containingArea.y + containingArea.height / 2;
            }
            // Empurrar ponto levemente em direção ao centro da área
            const dx = cx - pos.x;
            const dy = cy - pos.y;
            const mag = Math.sqrt(dx * dx + dy * dy);
            if (mag === 0) return pos;
            return {
                x: pos.x + (dx / mag) * BOUNDARY_INSET,
                y: pos.y + (dy / mag) * BOUNDARY_INSET
            };
        };

        // Aplicar inset para boundary hubs virtuais
        const adjustedStartPos = nudgeBoundaryPoint(startPos, startAnchorObj.isVirtual);
        const adjustedEndPos = nudgeBoundaryPoint(endPos, endAnchorObj.isVirtual);

        // Obter a área do recurso de início (assumindo que ambos estão na mesma área)
        let area;
        if (startResource) {
            area = movementAreas.find(a => a.id === startResource.parentAreaId);
        } else {
            // Se não tem recurso, encontrar área que contém o ponto (usar ponto ajustado)
            area = movementAreas.find(a => {
                if (a.vertices && a.vertices.length > 0) {
                    return isPointInPolygon(adjustedStartPos, a.vertices);
                }
                return adjustedStartPos.x >= a.x && adjustedStartPos.x <= a.x + a.width &&
                       adjustedStartPos.y >= a.y && adjustedStartPos.y <= a.y + a.height;
            });
        }

        if (!area) {
            return [];
        }

        // --- Passo 2: Determinar os pontos de saída e entrada para o A* ---
        let geometricStartPoint = startAnchorObj.isVirtual ? adjustedStartPos : startPos;
        if (startResource) {
            const startResourceVertices = startResource.vertices || rectangleToVertices(startResource.x, startResource.y, startResource.width, startResource.height);
            geometricStartPoint = getClosestPointOnPolygonEdge(startResourceVertices, startPos);
        }

        let geometricEndPoint = endAnchorObj.isVirtual ? adjustedEndPos : endPos;
        if (endResource) {
            const endResourceVertices = endResource.vertices || rectangleToVertices(endResource.x, endResource.y, endResource.width, endResource.height);
            geometricEndPoint = getClosestPointOnPolygonEdge(endResourceVertices, endPos);
        }

        // [DEBUG removido — log de alta frequência durante drag]
        // console.log(`%c[DEBUG findPath] Edge points:`, 'color: #33cc33;',
        //     `start: (${geometricStartPoint.x.toFixed(1)}, ${geometricStartPoint.y.toFixed(1)})`,
        //     `end: (${geometricEndPoint.x.toFixed(1)}, ${geometricEndPoint.y.toFixed(1)})`);

        // Função para "empurrar" um ponto para uma zona segura
        const safeNudge = (point, resource, area) => {
            if (!area || !resource) return point;

            // Calcular o centro da área para saber a direção "para fora"
            const areaCenter = {
                x: area.x + area.width / 2,
                y: area.y + area.height / 2
            };

            // Calcular vetor do centro do recurso para o ponto na borda
            const resourceCenter = {
                x: resource.x + resource.width / 2,
                y: resource.y + resource.height / 2
            };
            const vectorX = point.x - resourceCenter.x;
            const vectorY = point.y - resourceCenter.y;
            const magnitude = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
            
            if (magnitude === 0) return point;

            // Empurrar o ponto 5 pixels para fora do recurso, na direção oposta ao centro dele
            const nudgeDistance = 5; // 5 pixels é uma margem segura
            const nudgedPoint = {
                x: point.x + (vectorX / magnitude) * nudgeDistance,
                y: point.y + (vectorY / magnitude) * nudgeDistance
            };

            return nudgedPoint;
        };

        // Aplicar a margem de segurança
        const aStarStartPoint = safeNudge(geometricStartPoint, startResource, area);
        const aStarEndPoint = safeNudge(geometricEndPoint, endResource, area);

        // --- Passo 3: Executar A* entre os pontos de borda com largura específica ---

        // Obter o grafo de navegação e a sequência de áreas
        // CORREÇÃO: Forçar reconstrução do grafo se não foi fornecido um explicitamente
        const navigationGraph = graph || getNavigationGraph(true);
        
        // Verificar se o grafo está válido
        if (!navigationGraph || !navigationGraph.nodes || navigationGraph.nodes.size === 0) {
            const fb = [startPos, endPos]; fb.isFallback = true;
            return fb;
        }
        
        const areaSequence = findAreaSequence(aStarStartPoint.x, aStarStartPoint.y, aStarEndPoint.x, aStarEndPoint.y, navigationGraph);
        
        if (!areaSequence || areaSequence.length === 0) {
            // Fallback para uma linha reta entre as âncoras se o A* de alto nível falhar
            const fb = [startPos, endPos]; fb.isFallback = true;
            return fb;
        }

        // Sempre usar caminho direto dentro da área da origem
        let finalPath;
        if (areaSequence.length >= 1) {
            const directPath = findDirectPathInArea(aStarStartPoint, aStarEndPoint, areaSequence[0], connectionWidth);
            if (directPath && directPath.length > 0) {
                finalPath = [startPos, ...directPath, endPos];
            } else {
                finalPath = [startPos, endPos];
                finalPath.isFallback = true;
            }
        } else {
            // Fallback absoluto
            finalPath = [startPos, endPos];
            finalPath.isFallback = true;
        }
        return finalPath;

    } catch (error) {
        console.error('❌ Erro no pathfinding:', error);
        return [];
    }
}

/**
 * Calcula a posição mundial de uma âncora considerando transformações do recurso
 * @param {object} anchorObj - { resourceId: string, anchor: { x: number, y: number } }
 * @returns {object|null} - { x: number, y: number } ou null se inválido
 */
function calculateWorldAnchorPosition(anchorObj) {
    // Suporte para âncoras virtuais (posições absolutas)
    if (anchorObj && anchorObj.isVirtual && anchorObj.position) {
        return { x: anchorObj.position.x, y: anchorObj.position.y };
    }

    if (!anchorObj || !anchorObj.resourceId || !anchorObj.anchor) {
        console.warn('Objeto de âncora inválido:', anchorObj);
        return null;
    }
    
    // Encontrar o recurso
    const resource = resources.find(r => r.id === anchorObj.resourceId);
    if (!resource) {
        console.warn(`Recurso não encontrado: ${anchorObj.resourceId}`);
        return null;
    }
    
    // FIX: Usar CENTROIDE como origem (coordenadas locais dos hubs são relativas ao centroide)
    // Antes usava vertices[0], que estava errado e causava offset no pathfinding
    let centroid;
    if (resource.vertices && resource.vertices.length > 0) {
        let sumX = 0, sumY = 0;
        for (const v of resource.vertices) { sumX += v[0]; sumY += v[1]; }
        centroid = { x: sumX / resource.vertices.length, y: sumY / resource.vertices.length };
    } else {
        centroid = { x: resource.x + resource.width / 2, y: resource.y + resource.height / 2 };
    }
    
    const anchor = anchorObj.anchor;
    
    // [DEBUG removido — log de alta frequência durante drag]
    // console.log(`%c[DEBUG calculateWorldAnchorPosition]`, 'color: #ff6600;',
    //     `Resource: ${resource.id}, local: (${anchor.x}, ${anchor.y}), centroid: (${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)})`,
    //     `→ world: (${(centroid.x + anchor.x).toFixed(1)}, ${(centroid.y + anchor.y).toFixed(1)})`);
    
    // Coordenadas mundiais = centroide + offset local (consistente com connectionUtils.anchorToWorldCoordinates)
    return {
        x: centroid.x + anchor.x,
        y: centroid.y + anchor.y
    };
}

/**
 * Implementação do Funnel Algorithm (String Pulling) para suavização de caminhos
 * 
 * O Funnel Algorithm encontra o caminho mais curto através de uma sequência de portais,
 * eliminando a necessidade de pathfinding detalhado A* na maioria dos casos.
 * 
 * @param {object} start - Ponto inicial
 * @param {object} end - Ponto final  
 * @param {Array} areaSequence - Sequência de IDs de área
 * @param {object} navigationGraph - Grafo de navegação
 * @returns {Array} - Caminho suavizado
 */
function findPathWithFunnelAlgorithm(start, end, areaSequence, navigationGraph) {
    
    try {
        // Obter portais ao longo do caminho
        const portals = getPortalsAlongPath(areaSequence);
        
        if (!portals || portals.length === 0) {
            console.warn('❌ Nenhum portal encontrado para o Funnel Algorithm');
            return [];
        }
        
        
        // Construir lista de pontos de portal para o algoritmo
        const portalPoints = buildPortalPointsList(start, end, portals);
        
        if (portalPoints.length < 3) {
            return [start, end];
        }
        
        // Aplicar algoritmo de string pulling
        const smoothPath = stringPulling(portalPoints);
        
        return smoothPath;
        
    } catch (error) {
        console.error('❌ Erro no Funnel Algorithm:', error);
        return [];
    }
}

/**
 * Constrói a lista de pontos de portal para o Funnel Algorithm
 * @param {object} start - Ponto inicial
 * @param {object} end - Ponto final
 * @param {Array} portals - Lista de portais
 * @returns {Array} - Lista de pares de pontos [left, right] para cada portal
 */
function buildPortalPointsList(start, end, portals) {
    const portalPoints = [];
    
    // Adicionar ponto inicial (como um "portal" de largura zero)
    portalPoints.push({ left: start, right: start });
    
    // Adicionar cada portal com seus pontos esquerdo e direito
    for (const portal of portals) {
        const left = portal.startPoint;
        const right = portal.endPoint;
        
        // Garantir orientação consistente dos portais
        // Vamos usar a convenção de que o ponto "esquerdo" tem menor coordenada Y,
        // ou se Y for igual, menor coordenada X
        const orientedPortal = orientPortal(left, right);
        portalPoints.push(orientedPortal);
        
    }
    
    // Adicionar ponto final (como um "portal" de largura zero)
    portalPoints.push({ left: end, right: end });
    
    return portalPoints;
}

/**
 * Orienta os pontos do portal de forma consistente
 * @param {object} p1 - Primeiro ponto do portal
 * @param {object} p2 - Segundo ponto do portal
 * @returns {object} - Portal orientado com {left, right}
 */
function orientPortal(p1, p2) {
    // Usar convenção simples: ponto com menor Y é "left", se Y igual então menor X
    if (p1.y < p2.y || (p1.y === p2.y && p1.x < p2.x)) {
        return { left: p1, right: p2 };
    } else {
        return { left: p2, right: p1 };
    }
}

/**
 * Implementação do algoritmo String Pulling (Funnel Algorithm)
 * 
 * Este algoritmo "puxa" o caminho como um elástico através dos portais,
 * encontrando o caminho mais curto possível.
 * 
 * @param {Array} portalPoints - Lista de pares {left, right} representando portais
 * @returns {Array} - Caminho suavizado
 */
function stringPulling(portalPoints) {
    if (portalPoints.length < 2) {
        return [];
    }
    
    // Inicializar com o primeiro ponto
    const path = [portalPoints[0].left];
    
    // Funil atual
    let apexIndex = 0;
    let apex = portalPoints[0].left;
    let leftIndex = 0;
    let leftPoint = portalPoints[0].left;
    let rightIndex = 0; 
    let rightPoint = portalPoints[0].right;
    
    
    for (let i = 1; i < portalPoints.length; i++) {
        const portal = portalPoints[i];
        const newLeft = portal.left;
        const newRight = portal.right;
        
        
        // Testar lado direito
        if (isSameSide(apex, rightPoint, newRight)) {
            // Novo ponto direito não restringe o funil
            if (apex === rightPoint || isPointRightOfLine(apex, rightPoint, newRight)) {
                rightPoint = newRight;
                rightIndex = i;
            }
        } else {
            // Novo ponto direito restringe demais - fazer vértice no ponto esquerdo atual
            if (leftPoint !== apex) {
                path.push(leftPoint);
                
                // Reiniciar funil
                apex = leftPoint;
                apexIndex = leftIndex;
                leftPoint = apex;
                rightPoint = apex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                
                // Não incrementar i, reprocessar este portal
                i = apexIndex;
                continue;
            }
        }
        
        // Testar lado esquerdo
        if (isSameSide(apex, leftPoint, newLeft)) {
            // Novo ponto esquerdo não restringe o funil
            if (apex === leftPoint || isPointLeftOfLine(apex, leftPoint, newLeft)) {
                leftPoint = newLeft;
                leftIndex = i;
            }
        } else {
            // Novo ponto esquerdo restringe demais - fazer vértice no ponto direito atual
            if (rightPoint !== apex) {
                path.push(rightPoint);
                
                // Reiniciar funil
                apex = rightPoint;
                apexIndex = rightIndex;
                leftPoint = apex;
                rightPoint = apex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                
                // Não incrementar i, reprocessar este portal
                i = apexIndex;
                continue;
            }
        }
    }
    
    // Adicionar ponto final se não for igual ao último ponto do caminho
    const lastPortal = portalPoints[portalPoints.length - 1];
    const endPoint = lastPortal.left; // Ponto final é armazenado como left e right iguais
    
    if (path.length === 0 || !pointsEqual(path[path.length - 1], endPoint)) {
        path.push(endPoint);
    }
    
    return path;
}

/**
 * Verifica se dois pontos estão do mesmo lado de uma linha
 * @param {object} lineStart - Início da linha
 * @param {object} lineEnd - Fim da linha  
 * @param {object} point - Ponto a testar
 * @returns {boolean}
 */
function isSameSide(lineStart, lineEnd, point) {
    const cross1 = crossProduct(
        { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y },
        { x: point.x - lineStart.x, y: point.y - lineStart.y }
    );
    return cross1 >= 0;
}

/**
 * Verifica se um ponto está à direita de uma linha orientada
 * @param {object} lineStart - Início da linha
 * @param {object} lineEnd - Fim da linha
 * @param {object} point - Ponto a testar
 * @returns {boolean}
 */
function isPointRightOfLine(lineStart, lineEnd, point) {
    const cross = crossProduct(
        { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y },
        { x: point.x - lineStart.x, y: point.y - lineStart.y }
    );
    return cross < 0;
}

/**
 * Verifica se um ponto está à esquerda de uma linha orientada
 * @param {object} lineStart - Início da linha
 * @param {object} lineEnd - Fim da linha
 * @param {object} point - Ponto a testar
 * @returns {boolean}
 */
function isPointLeftOfLine(lineStart, lineEnd, point) {
    const cross = crossProduct(
        { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y },
        { x: point.x - lineStart.x, y: point.y - lineStart.y }
    );
    return cross > 0;
}

/**
 * Calcula o produto vetorial em 2D
 * @param {object} v1 - Primeiro vetor {x, y}
 * @param {object} v2 - Segundo vetor {x, y}
 * @returns {number} - Produto vetorial (escalar)
 */
function crossProduct(v1, v2) {
    return v1.x * v2.y - v1.y * v2.x;
}

/**
 * Verifica se dois pontos são iguais (com tolerância)
 * @param {object} p1 - Primeiro ponto
 * @param {object} p2 - Segundo ponto
 * @param {number} tolerance - Tolerância para comparação
 * @returns {boolean}
 */
function pointsEqual(p1, p2, tolerance = 1e-6) {
    return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
}

/**
 * Encontra caminho direto dentro de uma única área usando A*
 * @param {object} start - Posição inicial {x, y}
 * @param {object} end - Posição final {x, y}
 * @param {string} areaId - ID da área
 * @param {number} connectionWidth - Largura da conexão em cm
 * @returns {Array} - Array de pontos do caminho
 */
function findDirectPathInArea(start, end, areaId, connectionWidth = 60) {
    
    // Encontrar a área
    const area = movementAreas.find(a => a.id === areaId);
    if (!area) {
        console.warn(`Área não encontrada: ${areaId}`);
        return [];
    }
    
    // Verificar se o caminho direto é possível (sem obstáculos)
    if (isDirectPathClear(start, end, area, connectionWidth)) {
        return [start, end];
    }
    // Usar A* para encontrar caminho navegando ao redor de obstáculos
    return aStarPathfinding(start, end, area, connectionWidth);
}

/**
 * Encontra caminho através de múltiplas áreas e portais
 * @param {object} start - Posição inicial
 * @param {object} end - Posição final
 * @param {Array} areaSequence - Sequência de IDs de área
 * @param {object} navigationGraph - Grafo de navegação
 * @returns {Array} - Array de pontos do caminho
 */
function findMultiAreaPath(start, end, areaSequence, navigationGraph) {
    
    const fullPath = [];
    const portals = getPortalsAlongPath(areaSequence);
    
    let currentPos = start;
    
    for (let i = 0; i < areaSequence.length; i++) {
        const currentAreaId = areaSequence[i];
        const isLastArea = i === areaSequence.length - 1;
        
        let targetPos;
        if (isLastArea) {
            // Última área - ir para a posição final
            targetPos = end;
        } else {
            // Área intermediária - ir para o portal de saída
            const portal = portals[i];
            targetPos = portal ? portal.midpoint : end;
        }
        
        // Encontrar caminho dentro desta área
        const areaPath = findDirectPathInArea(currentPos, targetPos, currentAreaId);
        
        if (areaPath.length === 0) {
            console.warn(`❌ Falha no pathfinding na área ${currentAreaId}`);
            return []; // Falha no pathfinding
        }
        
        // Adicionar pontos do caminho (exceto o primeiro se não for a primeira área)
        const startIndex = fullPath.length === 0 ? 0 : 1;
        fullPath.push(...areaPath.slice(startIndex));
        
        // Atualizar posição atual para o próximo segmento
        currentPos = targetPos;
    }
    
    return fullPath;
}

/**
 * Verifica se um caminho direto entre dois pontos está livre de obstáculos
 * @param {object} start - Posição inicial
 * @param {object} end - Posição final
 * @param {object} area - Área de movimentação
 * @param {number} connectionWidth - Largura da conexão em cm
 * @returns {boolean} - True se o caminho estiver livre
 */
function isDirectPathClear(start, end, area, connectionWidth = 60) {
    // Verificar se ambos os pontos estão dentro da área
    if (!isPointInArea(start, area) || !isPointInArea(end, area)) {
        return false;
    }
    
    // Usar a NavMesh específica para verificar se o caminho está livre
    const navMesh = getNavMeshForWidth(area, connectionWidth);
    if (!navMesh) {
        console.warn(`⚠️ NavMesh não encontrada para largura ${connectionWidth}cm`);
        return false;
    }
    
    // Simples verificação: se todos os pontos ao longo da linha são navegáveis
    const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / (navMesh.gridSize || 5);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.round(start.x + t * (end.x - start.x));
        const y = Math.round(start.y + t * (end.y - start.y));
        
        const nodeKey = `${x},${y}`;
        const node = navMesh.nodes.get(nodeKey);
        if (!node || !node.walkable) {
            return false;
        }
    }
    
    return true;
}

/**
 * Verifica se um ponto está dentro de uma área
 * @param {object} point - {x, y}
 * @param {object} area - Área de movimentação
 * @returns {boolean}
 */
function isPointInArea(point, area) {
    if (!area) {
        console.warn('⚠️ Área é null em isPointInArea');
        return false;
    }
    
    if (area.vertices && area.vertices.length > 0) {
        return isPointInPolygon(point, area.vertices);
    } else {
        // Área retangular
        return point.x >= area.x && 
               point.x <= area.x + area.width &&
               point.y >= area.y && 
               point.y <= area.y + area.height;
    }
}

/**
 * Verifica se um ponto está próximo da borda de um polígono (dentro de tolerance pixels)
 * Usado para detectar boundary hubs que ficam exatamente na borda da área
 * @param {object} point - {x, y}
 * @param {Array} vertices - Array de vértices [[x,y], ...]
 * @param {number} tolerance - Distância máxima da borda em pixels
 * @returns {boolean}
 */
function isNearPolygonEdge(point, vertices, tolerance) {
    for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        // Distância ponto-segmento
        const A = point.x - v1[0];
        const B = point.y - v1[1];
        const C = v2[0] - v1[0];
        const D = v2[1] - v1[1];
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        if (lenSq === 0) continue;
        const param = Math.max(0, Math.min(1, dot / lenSq));
        const xx = v1[0] + param * C;
        const yy = v1[1] + param * D;
        const dist = Math.sqrt((point.x - xx) ** 2 + (point.y - yy) ** 2);
        if (dist <= tolerance) return true;
    }
    return false;
}

/**
 * Verifica se uma linha intersecta com paredes
 * @param {object} start - Ponto inicial
 * @param {object} end - Ponto final
 * @returns {boolean}
 */
function lineIntersectsWalls(start, end) {
    for (const wall of walls) {
        if (lineSegmentsIntersect(
            start, end,
            { x: wall.startPoint[0], y: wall.startPoint[1] },
            { x: wall.endPoint[0], y: wall.endPoint[1] }
        )) {
            return true;
        }
    }
    return false;
}

/**
 * Verifica se uma linha intersecta com recursos
 * @param {object} start - Ponto inicial
 * @param {object} end - Ponto final
 * @param {object} startAnchorObj - Objeto âncora inicial (opcional)
 * @param {object} endAnchorObj - Objeto âncora final (opcional)
 * @returns {boolean}
 */
function lineIntersectsResources(start, end) {
    // Com a nova abordagem, todos os recursos são obstáculos, pois o A* opera externamente
    for (const resource of resources) {
        if (resource?.machineType === 'overhead-crane') continue;
        if (lineIntersectsResource(start, end, resource)) {
            return true;
        }
    }
    return false;
}

/**
 * Verifica se uma linha intersecta com um recurso específico
 * @param {object} start - Ponto inicial
 * @param {object} end - Ponto final
 * @param {object} resource - Recurso
 * @returns {boolean}
 */
function lineIntersectsResource(start, end, resource) {
    if (resource.vertices && resource.vertices.length > 0) {
        // Recurso poligonal - verificar intersecção com cada aresta
        for (let i = 0; i < resource.vertices.length; i++) {
            const v1 = { x: resource.vertices[i][0], y: resource.vertices[i][1] };
            const v2 = { 
                x: resource.vertices[(i + 1) % resource.vertices.length][0], 
                y: resource.vertices[(i + 1) % resource.vertices.length][1] 
            };
            
            if (lineSegmentsIntersect(start, end, v1, v2)) {
                return true;
            }
        }
    } else {
        // Recurso retangular - verificar intersecção com bordas
        const corners = [
            { x: resource.x, y: resource.y },
            { x: resource.x + resource.width, y: resource.y },
            { x: resource.x + resource.width, y: resource.y + resource.height },
            { x: resource.x, y: resource.y + resource.height }
        ];
        
        for (let i = 0; i < corners.length; i++) {
            const corner1 = corners[i];
            const corner2 = corners[(i + 1) % corners.length];
            
            if (lineSegmentsIntersect(start, end, corner1, corner2)) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Verifica se dois segmentos de linha se intersectam
 * @param {object} p1 - Início do primeiro segmento
 * @param {object} p2 - Fim do primeiro segmento
 * @param {object} p3 - Início do segundo segmento
 * @param {object} p4 - Fim do segundo segmento
 * @returns {boolean}
 */
function lineSegmentsIntersect(p1, p2, p3, p4) {
    const d1 = direction(p3, p4, p1);
    const d2 = direction(p3, p4, p2);
    const d3 = direction(p1, p2, p3);
    const d4 = direction(p1, p2, p4);
    
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }
    
    // Verificar casos de colinearidade
    if (d1 === 0 && onSegment(p3, p1, p4)) return true;
    if (d2 === 0 && onSegment(p3, p2, p4)) return true;
    if (d3 === 0 && onSegment(p1, p3, p2)) return true;
    if (d4 === 0 && onSegment(p1, p4, p2)) return true;
    
    return false;
}

/**
 * Calcula a direção/orientação de três pontos
 */
function direction(a, b, c) {
    return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

/**
 * Verifica se o ponto q está no segmento pr
 */
function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
           q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

/**
 * Implementação do algoritmo A* para pathfinding dentro de uma área
 * @param {object} start - Posição inicial
 * @param {object} end - Posição final
 * @param {object} area - Área de movimentação
 * @param {object} startAnchorObj - Objeto âncora inicial (opcional)
 * @param {object} endAnchorObj - Objeto âncora final (opcional)
 * @returns {Array} - Array de pontos do caminho
 */

import { updateNavMeshWithObstacles, getNavMeshForWidth, findNearestWalkableNode } from './navMeshBaker.js';

function aStarPathfinding(start, end, area, connectionWidth = 60) {
    const startTime = performance.now();

    // Obter a NavMesh específica para esta largura de conexão
    const navMesh = getNavMeshForWidth(area, connectionWidth);
    if (!navMesh || !navMesh.nodes || navMesh.nodes.size === 0) {
        console.error(`❌ NavMesh não encontrada para largura ${connectionWidth}cm na área ${area.id}`);
        return [];
    }

    // OTIMIZAÇÃO: A NavMesh base permanece "baked" até mudanças de geometria.
    // Apenas atualizamos os obstáculos (recursos) nos nós existentes
    updateNavMeshWithObstacles(area, navMesh);
    
    // LOG: Verificar quantos nós walkable existem
    const walkableCount = Array.from(navMesh.nodes.values()).filter(n => n.walkable).length;
    const stairWalkwayCount = Array.from(navMesh.nodes.values()).filter(n => n.isStairWalkway).length;

    // Encontrar os nós mais próximos do início e fim na NavMesh específica
    const findClosestNodeKey = (pos) => {
        let minDist = Infinity;
        let closestKey = null;
        for (const [key, node] of navMesh.nodes.entries()) {
            const dx = node.x - pos.x;
            const dy = node.y - pos.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist && node.walkable) {
                minDist = dist;
                closestKey = key;
            }
        }
        return closestKey;
    };
    
    const startKey = findClosestNodeKey(start);
    const endKey = findClosestNodeKey(end);
    
    if (!startKey || !endKey) {
        console.error(`[Pathfinding] Falha rápida: Não há nós caminháveis próximos do início ou fim na NavMesh de ${connectionWidth}cm.`);
        return [];
    }

    // ========== A* com Binary Min-Heap (O(N log N) vs O(N²) anterior) ==========
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();
    
    const nodePos = (key) => {
        const n = navMesh.nodes.get(key);
        return { x: n.x, y: n.y };
    };

    const endPos = nodePos(endKey);
    const startF = heuristic(nodePos(startKey), endPos);
    gScore.set(startKey, 0);
    fScore.set(startKey, startF);

    const openHeap = new BinaryMinHeap();
    openHeap.push(startKey, startF);

    let iterations = 0;
    const maxIterations = navMesh?.nodes?.size || 10000;
    const gridSize = navMesh.gridSize || 5;
    const directions = [
        [0, gridSize], [0, -gridSize], [gridSize, 0], [-gridSize, 0],
        [gridSize, gridSize], [gridSize, -gridSize], [-gridSize, gridSize], [-gridSize, -gridSize]
    ];
    // Custos pré-calculados: cardinal = gridSize, diagonal = gridSize * √2
    const cardinalCost = gridSize;
    const diagonalCost = gridSize * Math.SQRT2;

    while (openHeap.size > 0 && iterations < maxIterations) {
        iterations++;
        const currentKey = openHeap.pop();
        
        if (currentKey === endKey) {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Reconstruir caminho
            let path = [];
            let k = currentKey;
            while (k) {
                path.unshift(nodePos(k));
                k = cameFrom.get(k);
            }
            
            if (path.length > 0) {
                path[0] = start;
                path[path.length - 1] = end;
            }
            return path;
        }
        
        closedSet.add(currentKey);
        
        const currentNode = navMesh.nodes.get(currentKey);
        const currentX = currentNode.x;
        const currentY = currentNode.y;
        const currentG = gScore.get(currentKey);
        
        for (let d = 0; d < 8; d++) {
            const dx = directions[d][0];
            const dy = directions[d][1];
            const neighborKey = `${currentX + dx},${currentY + dy}`;
            
            if (closedSet.has(neighborKey)) continue;
            
            const neighborNode = navMesh.nodes.get(neighborKey);
            if (!neighborNode || !neighborNode.walkable) continue;
            
            // Usar custo pré-calculado (cardinal vs diagonal)
            const moveCost = (dx !== 0 && dy !== 0) ? diagonalCost : cardinalCost;
            const tentativeG = currentG + moveCost;
            
            const prevG = gScore.get(neighborKey);
            if (prevG !== undefined && tentativeG >= prevG) continue;
            
            cameFrom.set(neighborKey, currentKey);
            gScore.set(neighborKey, tentativeG);
            const f = tentativeG + heuristic(neighborNode, endPos);
            fScore.set(neighborKey, f);
            
            if (openHeap.has(neighborKey)) {
                openHeap.decreaseKey(neighborKey, f);
            } else {
                openHeap.push(neighborKey, f);
            }
        }
    }
    const endTime = performance.now();
    const duration = endTime - startTime;
    if (iterations >= maxIterations) {
        console.warn(`⚠️ A* atingiu limite de ${maxIterations} iterações em ${duration.toFixed(2)}ms`);
    } else {
        console.warn(`❌ A* não encontrou caminho após ${iterations} iterações em ${duration.toFixed(2)}ms`);
    }
    return [];
}

/**
 * Converte coordenadas mundiais para coordenadas de grade
 */
function worldToGrid(worldPos, gridSize) {
    return {
        x: Math.round(worldPos.x / gridSize),
        y: Math.round(worldPos.y / gridSize)
    };
}

/**
 * Converte coordenadas de grade para coordenadas mundiais
 */
function gridToWorld(gridPos, gridSize) {
    return {
        x: gridPos.x * gridSize,
        y: gridPos.y * gridSize
    };
}

/**
 * Cria chave única para posição de grade
 */
function gridKey(gridPos) {
    return `${gridPos.x},${gridPos.y}`;
}

/**
 * Função heurística (distância Manhattan)
 */

// Heurística euclidiana para grids com diagonais
function heuristic(a, b) {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

/**
 * Calcula distância euclidiana entre dois pontos
 */
function distance(a, b) {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

/**
 * Obtém vizinhos válidos de um nó na grade
 */
// getNeighbors não é mais necessário com NavMesh

/**
 * Verifica se uma posição é navegável (dentro da área e sem obstáculos)
 * 
 * IMPORTANTE: Esta função usa o array 'resources' diretamente, garantindo que
 * novos recursos adicionados sejam automaticamente considerados como obstáculos.
 * O cache do grafo de navegação é invalidado em resources.js quando recursos
 * são adicionados/removidos para manter a consistência.
 */
function isNavigable(worldPos, area) {
    // Verificar se está dentro da área
    if (!isPointInArea(worldPos, area)) {
        return false;
    }
    
    // Com a nova abordagem, todos os recursos são obstáculos, pois o A* opera externamente
    const tolerance = 5; // Pequena margem de segurança
    for (const resource of resources) {
        if (resource?.machineType === 'overhead-crane') continue;
        if (isPointNearResource(worldPos, resource, tolerance)) {
            return false;
        }
    }
    
    return true;
}

/**
 * Verifica se um ponto está próximo de um recurso
 */
function isPointNearResource(point, resource, tolerance) {
    if (resource.vertices && resource.vertices.length > 0) {
        // Verificar se está dentro do polígono expandido
        return isPointInPolygon(point, resource.vertices); // Simplificado - poderia expandir polígono
    } else {
        // Verificar proximidade ao retângulo
        return point.x >= resource.x - tolerance &&
               point.x <= resource.x + resource.width + tolerance &&
               point.y >= resource.y - tolerance &&
               point.y <= resource.y + resource.height + tolerance;
    }
}

/**
 * Reconstrói o caminho a partir do mapa cameFrom
 */
function reconstructPath(cameFrom, current, gridSize, originalStart, originalEnd, area) {
    const path = [];
    const gridPath = [];
    
    // Reconstruir caminho em coordenadas de grade
    while (current) {
        gridPath.unshift(current);
        current = cameFrom.get(gridKey(current));
    }
    
    // Converter para coordenadas mundiais
    for (const gridPos of gridPath) {
        path.push(gridToWorld(gridPos, gridSize));
    }
    
    // Substituir primeiro e último pontos pelos originais para precisão
    if (path.length > 0) {
        path[0] = originalStart;
        path[path.length - 1] = originalEnd;
    }
    
    // Retornar caminho completo, sem simplificação
    return path;
}

/**
 * Simplifica o caminho removendo pontos intermediários desnecessários
 */
function simplifyPath(path, area) {
    if (path.length <= 2) {
        return path;
    }
    
    const simplified = [path[0]];
    
    for (let i = 1; i < path.length - 1; i++) {
        const prev = simplified[simplified.length - 1];
        const current = path[i];
        const next = path[i + 1];
        
        // Se o caminho direto de prev para next é válido, pular current
        if (!isDirectPathClear(prev, next, area)) {
            simplified.push(current);
        }
    }
    
    simplified.push(path[path.length - 1]);
    
    return simplified;
}

/**
 * Função utilitária para debug - desenha o caminho encontrado
 * @param {Array} path - Array de pontos do caminho
 * @param {string} color - Cor para desenhar o caminho
 */
export function debugDrawPath(path, color = '#ff0000') {
    if (!path || path.length < 2) return;
    
    
    // Esta função seria chamada pelo sistema de desenho
    // Por enquanto, apenas log dos pontos
    path.forEach((point, index) => {
    });
}

/**
 * Valida se um caminho suavizado está livre de obstáculos
 * @param {Array} path - Caminho a validar
 * @param {Array} areaSequence - Sequência de áreas por onde o caminho passa
 * @returns {boolean} - True se o caminho é válido
 */
function validateSmoothPath(path, areaSequence) {
    if (!path || path.length < 2) {
        return false;
    }
    
    // Verificar cada segmento do caminho
    for (let i = 0; i < path.length - 1; i++) {
        const start = path[i];
        const end = path[i + 1];
        
        // Verificar se o segmento cruza paredes
        if (lineIntersectsWalls(start, end)) {
            console.warn(`⚠️ Segmento ${i} do caminho suavizado cruza uma parede`);
            return false;
        }
        
        // Verificar se o segmento cruza recursos  
        if (lineIntersectsResources(start, end)) {
            console.warn(`⚠️ Segmento ${i} do caminho suavizado cruza um recurso`);
            return false;
        }
    }
    
    return true;
}

/**
 * Obtém estatísticas do último pathfinding executado
 */
export function getPathfindingStats() {
    return {
        lastExecutionTime: Date.now(),
        algorithmsAvailable: ['A*', 'Direct Path', 'Funnel Algorithm'],
        features: [
            'Anchor Point Support', 
            'Multi-Area Navigation', 
            'Obstacle Avoidance',
            'Path Smoothing',
            'String Pulling Optimization'
        ]
    };
}

// Disponibilizar funções globalmente para fácil acesso
if (typeof window !== 'undefined') {
    window.findPathWithAnchors = findPath;
    window.debugDrawPath = debugDrawPath;
    window.getPathfindingStats = getPathfindingStats;
    window.findPathWithFunnelAlgorithm = findPathWithFunnelAlgorithm;
    window.validateSmoothPath = validateSmoothPath;
}

