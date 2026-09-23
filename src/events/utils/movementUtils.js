/**
 * Utilitários para cálculo de movimento de áreas
 */
import { movementAreas, walls } from '../../state.js';
import { 
    checkOverlap, calculateBoundingBox, rectangleToVertices 
} from '../../areas.js';
import { moveWallsWithArea } from '../../walls.js';
import { moveResourcesWithArea } from '../../resources.js';
import { moveConnectionsWithArea } from '../../connections.js';
import { moveFreeLinesWithArea } from '../../free-lines.js';
import { moveExclusionZonesWithArea } from '../../exclusion-zones.js';
import { invalidateNavigationGraph } from '../../navigation.js';
import { bakeNavigationMesh } from '../../navMeshBaker.js';
import { layoutChangeNotifier } from '../../core/layout-change-notifier.js';

/**
 * Atualiza a posição de uma área e todos os seus componentes associados
 * @param {object} area - A área a ser movida
 * @param {number} dx - Deslocamento em X
 * @param {number} dy - Deslocamento em Y
 */
export function updateAreaPosition(area, dx, dy) {
    if (dx === 0 && dy === 0) return;

    const originalVertices = Array.isArray(area.vertices) && area.vertices.length
        ? area.vertices.map(([x, y]) => [x, y])
        : rectangleToVertices(area.x, area.y, area.width, area.height);
    const originalRings = Array.isArray(area.rings)
        ? area.rings.map(ring => ring.map(([x, y]) => [x, y]))
        : null;

    area.x += dx;
    area.y += dy;
    area.vertices = area.vertices.map(([x, y]) => [x + dx, y + dy]);

    if (area.rings) {
        area.rings = area.rings.map(ring => 
            ring.map(([x, y]) => [x + dx, y + dy])
        );
    }

    const bb = calculateBoundingBox(area.vertices);
    area.width = bb.width;
    area.height = bb.height;
    
    moveWallsWithArea(area.id, dx, dy);
    moveResourcesWithArea(area.id, dx, dy);
    moveConnectionsWithArea(area.id, dx, dy);
    moveFreeLinesWithArea(area.id, dx, dy, {
        verticesBeforeMove: originalVertices,
        ringsBeforeMove: originalRings
    });
    moveExclusionZonesWithArea(area.id, dx, dy);
    invalidateNavigationGraph(); // Invalidar o grafo após o movimento.
    
    // Rebake NavMesh para atualizar nós caminháveis
    bakeNavigationMesh(area);
    
    // Notificar o sistema de mudança de layout (invalida cache de rotas do planner)
    layoutChangeNotifier.notifyChange('area', { action: 'move', entity: area });
}

/**
 * Calcula o deslocamento máximo permitido para uma área antes de colidir com outra.
 *
 * Usa busca binária verdadeira sobre a fração [0,1] do movimento desejado,
 * verificando colisão com os polígonos reais de todas as áreas estáticas.
 * 20 iterações → precisão de 1/2^20 ≈ sub-pixel, sem depender de bounding-boxes.
 *
 * @param {object} movingArea     - A área sendo arrastada.
 * @param {number} desiredDeltaX  - Deslocamento X desejado pelo usuário.
 * @param {number} desiredDeltaY  - Deslocamento Y desejado pelo usuário.
 * @returns {object}              - O deslocamento permitido { dx, dy }.
 */
export function calculateMaxAllowedMovement(movingArea, desiredDeltaX, desiredDeltaY) {
    const originalVertices = movingArea.vertices;

    function getMovedVertices(dx, dy) {
        return originalVertices.map(([x, y]) => [x + dx, y + dy]);
    }

    function overlapsAny(dx, dy) {
        const v = getMovedVertices(dx, dy);
        return movementAreas.some(
            a => a.id !== movingArea.id && checkOverlap(v, a.vertices)
        );
    }

    // Caminho rápido: posição desejada livre → movimento completo
    if (!overlapsAny(desiredDeltaX, desiredDeltaY)) {
        return { dx: desiredDeltaX, dy: desiredDeltaY };
    }

    // Caminho rápido: posição atual (delta=0) já está ocupada → sem movimento
    if (overlapsAny(0, 0)) {
        return { dx: 0, dy: 0 };
    }

    // Busca binária: encontra a maior fração t ∈ [0,1] tal que
    // a área movida em (desiredDeltaX*t, desiredDeltaY*t) não colide com nenhuma área.
    // 20 iterações → precisão 1/2^20 ≈ 0.0001% do movimento total (sub-pixel).
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (overlapsAny(desiredDeltaX * mid, desiredDeltaY * mid)) {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    return { dx: desiredDeltaX * lo, dy: desiredDeltaY * lo };
}

/**
 * Calcula a posição de "snap" para uma área que colidiu com outra.
 * @param {object} movingArea - A área que está sendo arrastada.
 * @param {Array} newVertices - Os vértices da posição para a qual se tentou mover.
 * @returns {object|null} - A nova posição {x, y} para a área ou null se o snap não for possível.
 */
export function calculateSnapOnContact(movingArea, newVertices) {
    let minDisplacement = { x: null, y: null, dist: Infinity };
    let collidingAreaId = null;

    // Encontrar a área com a qual estamos colidindo
    for (const staticArea of movementAreas) {
        if (staticArea.id === movingArea.id) continue;

        if (checkOverlap(newVertices, staticArea.vertices)) {
            collidingAreaId = staticArea.id;
            
            // Calcular bounding boxes para análise de sobreposição
            const movingAreaBB = calculateBoundingBox(newVertices);
            const staticAreaBB = calculateBoundingBox(staticArea.vertices);

            // Calcular sobreposição nos eixos X e Y
            const overlapX = Math.min(movingAreaBB.x + movingAreaBB.width, staticAreaBB.x + staticAreaBB.width) - Math.max(movingAreaBB.x, staticAreaBB.x);
            const overlapY = Math.min(movingAreaBB.y + movingAreaBB.height, staticAreaBB.y + staticAreaBB.height) - Math.max(movingAreaBB.y, staticAreaBB.y);

            // O ajuste mínimo é na direção da menor sobreposição
            if (overlapX < overlapY && overlapX > 0) {
                // Ajuste horizontal é menor, vamos usá-lo
                if (Math.abs(overlapX) < minDisplacement.dist) {
                    const direction = (movingAreaBB.x < staticAreaBB.x) ? -1 : 1;
                    minDisplacement = { x: overlapX * direction, y: 0, dist: Math.abs(overlapX) };
                }
            } else if (overlapY > 0) {
                // Ajuste vertical é menor
                if (Math.abs(overlapY) < minDisplacement.dist) {
                    const direction = (movingAreaBB.y < staticAreaBB.y) ? -1 : 1;
                    minDisplacement = { x: 0, y: overlapY * direction, dist: Math.abs(overlapY) };
                }
            }
        }
    }

    if (minDisplacement.x !== null) {
        const currentBB = calculateBoundingBox(newVertices);
        const result = {
            x: currentBB.x - minDisplacement.x,
            y: currentBB.y - minDisplacement.y
        };
        return result;
    }

    return null;
}
