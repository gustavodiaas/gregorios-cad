// Funções relacionadas à rotação de recursos
import { resources, movementAreas } from '../state.js';
import { migrateResourceToPolygonal, updateResourceCompatibilityProperties, calculatePolygonBounds, getPolygonCentroid, applyLabelTransformAfterRotation } from '../resources.js';
import { rectangleToVertices, pointInPolygon } from '../areas.js';
import { drawAll } from '../drawing.js';
import { snapToGrid } from '../events/mouseUtils.js';
import { anchorToWorldCoordinates, calculateAnchorPoint } from '../connections/connectionUtils.js';
import { getHubsForResource } from '../hubs.js';

// Helpers consolidated in resources.js

/**
 * Rotaciona vértices ao redor de um ponto central
 * @param {Array} vertices - Vértices a serem rotacionados
 * @param {number} centerX - Centro X da rotação
 * @param {number} centerY - Centro Y da rotação
 * @param {number} angle - Ângulo em graus
 * @returns {Array} Novos vértices rotacionados
 */
function rotateVertices(vertices, centerX, centerY, angle) {
    // Garantir que o ângulo seja múltiplo de 90 para evitar imprecisões
    const normalizedAngle = angle % 360;
    
    // Precisão extra para rotações de 90, 180, 270 graus
    if (normalizedAngle === 90 || normalizedAngle === -270) {
        return vertices.map(([x, y]) => {
            // Rotação exata de 90 graus no sentido horário
            const dx = x - centerX;
            const dy = y - centerY;
            
            // Fórmula simplificada para exatamente 90 graus
            return [
                centerX + dy,
                centerY - dx
            ];
        });
    } else if (normalizedAngle === 180 || normalizedAngle === -180) {
        return vertices.map(([x, y]) => {
            // Rotação exata de 180 graus
            const dx = x - centerX;
            const dy = y - centerY;
            return [
                centerX - dx,
                centerY - dy
            ];
        });
    } else if (normalizedAngle === 270 || normalizedAngle === -90) {
        return vertices.map(([x, y]) => {
            // Rotação exata de 270 graus no sentido horário (90 anti-horário)
            const dx = x - centerX;
            const dy = y - centerY;
            return [
                centerX - dy,
                centerY + dx
            ];
        });
    } else {
        // Para outros ângulos, usar a fórmula geral
        const radians = (angle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        
        return vertices.map(([x, y]) => {
            const dx = x - centerX;
            const dy = y - centerY;
            
            // Arredondar para 6 casas decimais para evitar erros de ponto flutuante
            const rotatedX = centerX + dx * cos - dy * sin;
            const rotatedY = centerY + dx * sin + dy * cos;
            
            return [
                Math.round(rotatedX * 1000000) / 1000000,
                Math.round(rotatedY * 1000000) / 1000000
            ];
        });
    }
}

/**
 * Tenta rotacionar um recurso com sistema de ajuste automático
 * @param {object} resource - Recurso a ser rotacionado
 * @param {Array} rotatedVertices - Vértices já rotacionados
 * @returns {Array|null} Vértices ajustados ou null se não conseguiu ajustar
 */
async function tryRotateWithPullSystem(resource, rotatedVertices) {
    const { canMoveResourceTo } = await import('./resource_operations.js');
    
    // Primeiro, verificar se a rotação é válida sem ajuste
    if (canMoveResourceTo(resource, rotatedVertices)) {
        return rotatedVertices; // Rotação OK, sem necessidade de ajuste
    }
    
    // Se não passou na verificação, tentar ajustar com o sistema de "pull"
    const parentArea = movementAreas.find(area => area.id === resource.parentAreaId);
    if (!parentArea) {
        return null;
    }
    
    const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
    
    // Tentar ajuste avançado
    return await tryAdvancedPullAdjustment(resource, rotatedVertices, areaVertices);
}

/**
 * Sistema avançado de ajuste de posição para rotação
 * @param {object} resource - Recurso a ser ajustado
 * @param {Array} rotatedVertices - Vértices rotacionados
 * @param {Array} areaVertices - Vértices da área pai
 * @returns {Array|null} Vértices ajustados ou null se não conseguiu
 */
async function tryAdvancedPullAdjustment(resource, rotatedVertices, areaVertices) {
    const { canMoveResourceTo } = await import('./resource_operations.js');
    
    // Definir diferentes estratégias de ajuste
    const adjustmentStrategies = [
        // Ajustes pequenos em todas as direções
        { x: 5, y: 0 },
        { x: -5, y: 0 },
        { x: 0, y: 5 },
        { x: 0, y: -5 },
        // Ajustes diagonais
        { x: 5, y: 5 },
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: -5, y: 5 },
        // Ajustes maiores
        { x: 10, y: 0 },
        { x: -10, y: 0 },
        { x: 0, y: 10 },
        { x: 0, y: -10 },
        // Ajustes ainda maiores
        { x: 20, y: 0 },
        { x: -20, y: 0 },
        { x: 0, y: 20 },
        { x: 0, y: -20 }
    ];
    
    // Testar cada estratégia
    for (const strategy of adjustmentStrategies) {
        const adjustedVertices = rotatedVertices.map(([x, y]) => [x + strategy.x, y + strategy.y]);
        
        // Verificar se todos os pontos estão dentro da área
        const allPointsInside = adjustedVertices.every(vertex => 
            pointInPolygon(vertex, areaVertices)
        );
        
        if (allPointsInside && canMoveResourceTo(resource, adjustedVertices)) {
            return adjustedVertices;
        }
    }
    
    return null; // Não conseguiu ajustar
}

/**
 * Rotaciona um recurso
 * @param {object} resource - Recurso a ser rotacionado
 * @param {number} angle - Ângulo de rotação em graus
 * @param {number} centerX - Centro X da rotação (opcional)
 * @param {number} centerY - Centro Y da rotação (opcional)
 */
export async function rotateResource(resource, angle, centerX = null, centerY = null) {
    if (!resource || resource.locked) {
        if (resource?.locked) {
            alert('Não é possível rotacionar um recurso bloqueado.');
        }
        return;
    }
    
    // Migrar recurso para formato poligonal se necessário
    const migratedResource = migrateResourceToPolygonal(resource);
    
    const angleRad = (angle * Math.PI) / 180;

    // Se não foram fornecidos centro X e Y, usar o centroide do recurso
    if (centerX === null || centerY === null) {
        const centroid = getPolygonCentroid(migratedResource.vertices);
        centerX = centroid[0];
        centerY = centroid[1];
    }
    
    // Rotacionar vértices
    const rotatedVertices = rotateVertices(migratedResource.vertices, centerX, centerY, angle);
    
    // Tentar aplicar rotação com sistema de ajuste
    const finalVertices = await tryRotateWithPullSystem(resource, rotatedVertices);
    
    if (finalVertices) {
        // Arredondar cada vértice do resultado final para a grade
        const snappedVertices = finalVertices.map(vertex => {
            const snapped = snapToGrid(vertex[0], vertex[1]);
            return [snapped.x, snapped.y];
        });

        // Aplicar novos vértices JÁ ARREDONDADOS ao recurso
        resource.vertices = snappedVertices;
        
        applyLabelTransformAfterRotation(resource, centerX, centerY, rotatedVertices, snappedVertices, angleRad);

        // Salvar ângulo de rotação acumulado (usado para debug/referência)
        resource.rotation = (resource.rotation || 0) + angle;
        resource.rotation = resource.rotation % 360; // Manter entre 0-360
        
        // Atualizar as posições locais dos hubs de conexão após a rotação
        // IMPORTANTE: Apenas rotaciona as coordenadas locais em torno do centroide (0,0)
        updateHubPositionsAfterRotation(resource, migratedResource.vertices, snappedVertices, angle);
        
        // Atualizar propriedades de compatibilidade
        updateResourceCompatibilityProperties(resource);
        
        // REMOVIDO: validateAndFixHubPositions movia hubs para dentro do polígono,
        // mas agora os hubs devem ficar na borda. A rotação simples das coordenadas
        // locais é suficiente e matematicamente correta.
        
        // NOVO: Atualizar caminhos de conexão após rotação das âncoras
        if (typeof window !== 'undefined' && window.updateConnectionPathsForResource) {
            window.updateConnectionPathsForResource(resource.id);
        }
        
        drawAll();
    } else {
        alert('Não foi possível rotacionar o recurso nesta posição.');
    }
}

/**
 * Rotaciona todos os recursos dentro de uma área
 * @param {string} areaId - ID da área
 * @param {number} centerX - Centro X da rotação
 * @param {number} centerY - Centro Y da rotação
 */
export async function rotateResourcesWithArea(areaId, centerX, centerY, angleDegrees = 90) {
    const resourcesInArea = resources.filter(resource => resource.parentAreaId === areaId);
    
    
    // Rotacionar cada recurso
    for (const resource of resourcesInArea) {
        if (!resource.locked) {
            // Usar o ângulo especificado e centro de rotação da área
            // para garantir alinhamento correto
            await rotateResource(resource, angleDegrees, centerX, centerY);
            
            // Verificar se o recurso ainda está dentro da área após rotação
            const area = movementAreas.find(a => a.id === areaId);
            if (area && resource.vertices) {
                const allPointsInside = resource.vertices.every(vertex => 
                    pointInPolygon(vertex, area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height))
                );
                
                if (!allPointsInside) {
                    console.warn(`⚠️ Recurso ${resource.id} parcialmente fora da área após rotação. Tentando ajustar...`);
                    // Ajuste adicional poderá ser implementado aqui se necessário
                }
            }
        }
    }
    
    // Consolidar recursos após rotação para manter precisão
    const { consolidateResourcesAfterAreaRotation } = await import('./resource_operations.js');
    consolidateResourcesAfterAreaRotation(areaId);
}

/**
 * Limpa e normaliza vértices após operações de rotação para evitar imprecisões
 * @param {Array} vertices - Vértices a serem limpos
 * @param {number} precision - Número de casas decimais (padrão: 2)
 * @returns {Array} Vértices limpos
 */
function cleanVerticesAfterRotation(vertices, precision = 2) {
    if (!vertices || !Array.isArray(vertices)) {
        return vertices;
    }
    
    const factor = Math.pow(10, precision);
    
    return vertices.map(vertex => {
        if (!Array.isArray(vertex) || vertex.length !== 2) {
            return vertex;
        }
        
        return [
            Math.round(vertex[0] * factor) / factor,
            Math.round(vertex[1] * factor) / factor
        ];
    });
}

/**
 * Atualiza as posições dos hubs de conexão após a rotação de um recurso
 * 
 * Com coordenadas locais relativas ao CENTROIDE, a rotação é simples:
 * basta rotacionar (localX, localY) em torno de (0, 0).
 * O centroide é recalculado automaticamente quando os vértices mudam.
 * 
 * @param {object} resource - O recurso rotacionado
 * @param {Array} oldVertices - Não usado (mantido para compatibilidade)
 * @param {Array} newVertices - Não usado (mantido para compatibilidade)  
 * @param {number} angle - O ângulo de rotação em graus
 */
function updateHubPositionsAfterRotation(resource, oldVertices, newVertices, angle) {
    // Buscar hubs do registro global via import direto
    const resourceHubs = getHubsForResource(resource.id) || [];
    
    if (!resourceHubs.length) {
        return;
    }

    // Para ângulos especiais, usar fórmulas exatas para evitar erros de ponto flutuante
    const normalizedAngle = ((angle % 360) + 360) % 360; // Normalizar para 0-359
    
    for (const hub of resourceHubs) {
        let newLocalX, newLocalY;
        let newNormalX, newNormalY;
        
        // Rotação simples em torno de (0, 0) - o centroide
        if (normalizedAngle === 90) {
            // Rotação de 90° sentido horário: (x, y) → (y, -x)
            newLocalX = hub.localY;
            newLocalY = -hub.localX;
            // Rotacionar também a normal (se existir)
            if (hub.normalX !== undefined && hub.normalY !== undefined) {
                newNormalX = hub.normalY;
                newNormalY = -hub.normalX;
            }
        } else if (normalizedAngle === 180) {
            // Rotação de 180°: (x, y) → (-x, -y)
            newLocalX = -hub.localX;
            newLocalY = -hub.localY;
            if (hub.normalX !== undefined && hub.normalY !== undefined) {
                newNormalX = -hub.normalX;
                newNormalY = -hub.normalY;
            }
        } else if (normalizedAngle === 270) {
            // Rotação de 270° sentido horário: (x, y) → (-y, x)
            newLocalX = -hub.localY;
            newLocalY = hub.localX;
            if (hub.normalX !== undefined && hub.normalY !== undefined) {
                newNormalX = -hub.normalY;
                newNormalY = hub.normalX;
            }
        } else {
            // Para outros ângulos, usar a fórmula geral
            const radians = (angle * Math.PI) / 180;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            newLocalX = hub.localX * cos - hub.localY * sin;
            newLocalY = hub.localX * sin + hub.localY * cos;
            if (hub.normalX !== undefined && hub.normalY !== undefined) {
                newNormalX = hub.normalX * cos - hub.normalY * sin;
                newNormalY = hub.normalX * sin + hub.normalY * cos;
            }
        }
        
        // Atualizar coordenadas locais do hub
        hub.localX = Math.round(newLocalX * 1000) / 1000;
        hub.localY = Math.round(newLocalY * 1000) / 1000;
        
        // Atualizar normal (se existir)
        if (newNormalX !== undefined && newNormalY !== undefined) {
            hub.normalX = Math.round(newNormalX * 1000) / 1000;
            hub.normalY = Math.round(newNormalY * 1000) / 1000;
        }
        
        // Limpar cache de coordenadas mundo para forçar recálculo
        delete hub.x;
        delete hub.y;
    }
}

// Export das funções auxiliares para testes
export { rotateVertices, tryRotateWithPullSystem, tryAdvancedPullAdjustment, updateHubPositionsAfterRotation };
