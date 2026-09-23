// Funções relacionadas à duplicação de recursos
import { setSelectedResourceId, movementAreas, resources } from '../state.js';
import { createPolygonalResource, migrateResourceToPolygonal, getPolygonCentroid } from '../resources.js';
import { rectangleToVertices, pointInPolygon } from '../areas.js';
import { drawAll } from '../drawing.js';
import { cloneHubsForResource } from '../hubs.js';
import { copyImageToResource } from '../resource-image.js';

function normalizeLabelAnchor(anchor) {
    if (!anchor) return null;
    if (Array.isArray(anchor) && anchor.length >= 2) {
        const [x, y] = anchor;
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
        }
        return null;
    }
    if (typeof anchor === 'object' && anchor !== null) {
        const { x, y } = anchor;
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
        }
    }
    return null;
}

/**
 * Gera um nome único para o recurso duplicado com numeração sequencial
 * Ex: "SERRA" -> "SERRA 2", "SERRA 2" -> "SERRA 3"
 * @param {string} originalName - Nome original do recurso
 * @returns {string} - Nome único com numeração
 */
function generateUniqueResourceName(originalName) {
    if (!originalName) return 'Recurso 2';
    
    // Remover sufixo " (Cópia)" se existir (para compatibilidade com dados antigos)
    let baseName = originalName.replace(/\s*\(Cópia\)\s*$/i, '').trim();
    
    // Verificar se o nome já termina com um número (ex: "SERRA 2")
    const numberMatch = baseName.match(/^(.+?)\s+(\d+)$/);
    if (numberMatch) {
        baseName = numberMatch[1].trim();
    }
    
    // Encontrar todos os números já usados para esse nome base
    const usedNumbers = new Set();
    usedNumbers.add(1); // O original é considerado como "1"
    
    for (const res of resources) {
        if (!res.name) continue;
        
        // Verificar se é exatamente o nome base (original)
        if (res.name === baseName) {
            usedNumbers.add(1);
            continue;
        }
        
        // Verificar se segue o padrão "baseName N"
        const match = res.name.match(new RegExp(`^${escapeRegExp(baseName)}\\s+(\\d+)$`));
        if (match) {
            usedNumbers.add(parseInt(match[1], 10));
        }
    }
    
    // Encontrar o próximo número disponível
    let nextNumber = 2;
    while (usedNumbers.has(nextNumber)) {
        nextNumber++;
    }
    
    return `${baseName} ${nextNumber}`;
}

/**
 * Escapa caracteres especiais de regex
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Procura uma posição válida para duplicar um recurso dentro da área
 * @param {object} resource - Recurso a ser duplicado
 * @param {object} _parentArea - Área pai onde duplicar
 * @param {Array} areaVertices - Vértices da área pai
 * @returns {Array|null} - Novos vértices ou null se não encontrar posição
 */
async function findValidPositionForDuplicate(resource, _parentArea, areaVertices) {
    const migratedResource = migrateResourceToPolygonal(resource);
    const originalVertices = migratedResource.vertices;
    
    // Importar função necessária
    const { canMoveResourceTo } = await import('./resource_operations.js');
    
    // Calcular bounding box do recurso original
    const minX = Math.min(...originalVertices.map(v => v[0]));
    const maxX = Math.max(...originalVertices.map(v => v[0]));
    const minY = Math.min(...originalVertices.map(v => v[1]));
    const maxY = Math.max(...originalVertices.map(v => v[1]));
    const resourceWidth = maxX - minX;
    const resourceHeight = maxY - minY;
    
    // Calcular bounding box da área
    const areaMinX = Math.min(...areaVertices.map(v => v[0]));
    const areaMaxX = Math.max(...areaVertices.map(v => v[0]));
    const areaMinY = Math.min(...areaVertices.map(v => v[1]));
    const areaMaxY = Math.max(...areaVertices.map(v => v[1]));
    
    // Lista de offsets para tentar (em ordem de preferência)
    const offsets = [
        [50, 0],    // Direita
        [0, 50],    // Baixo
        [-50, 0],   // Esquerda
        [0, -50],   // Cima
        [50, 50],   // Diagonal inferior direita
        [-50, 50],  // Diagonal inferior esquerda
        [50, -50],  // Diagonal superior direita
        [-50, -50], // Diagonal superior esquerda
        [100, 0],   // Mais longe à direita
        [0, 100],   // Mais longe para baixo
        [-100, 0],  // Mais longe à esquerda
        [0, -100],  // Mais longe para cima
    ];
    
    // Tentar cada offset
    for (const [offsetX, offsetY] of offsets) {
        const newVertices = originalVertices.map(([x, y]) => [x + offsetX, y + offsetY]);
        
        // Verificar se todos os vértices estão dentro da área
        const allPointsInside = newVertices.every(vertex => 
            pointInPolygon(vertex, areaVertices)
        );
        
        if (allPointsInside) {
            // Verificar sobreposição com outros recursos
            if (canMoveResourceTo(resource, newVertices)) {
                return newVertices;
            }
        }
    }
    
    // Se nenhum offset fixo funcionou, tentar uma busca mais sistemática
    const step = 25; // Passo menor para busca mais detalhada
    const maxAttempts = 100; // Limitar tentativas para evitar travamento
    let attempts = 0;
    
    // Buscar posições em uma grade dentro da área
    for (let x = areaMinX; x <= areaMaxX - resourceWidth && attempts < maxAttempts; x += step) {
        for (let y = areaMinY; y <= areaMaxY - resourceHeight && attempts < maxAttempts; y += step) {
            attempts++;
            
            // Calcular offset necessário para posicionar o recurso nesta posição
            const offsetX = x - minX;
            const offsetY = y - minY;
            
            const newVertices = originalVertices.map(([vx, vy]) => [vx + offsetX, vy + offsetY]);
            
            // Verificar se todos os vértices estão dentro da área
            const allPointsInside = newVertices.every(vertex => 
                pointInPolygon(vertex, areaVertices)
            );
            
            if (allPointsInside) {
                // Verificar sobreposição com outros recursos
                if (canMoveResourceTo(resource, newVertices)) {
                    return newVertices;
                }
            }
        }
    }
    
    return null; // Não encontrou posição válida
}

/**
 * Duplica um recurso criando uma cópia em uma posição válida
 * @param {object} resource - Recurso a ser duplicado
 */
export async function duplicateResource(resource) {
    if (!resource) return;
    
    // Verificar se existe área pai
    const parentArea = movementAreas.find(area => area.id === resource.parentAreaId);
    if (!parentArea) {
        alert('Área pai não encontrada para duplicação.');
        return;
    }
    
    // Obter vértices da área pai
    const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
    
    // Procurar uma posição válida para a duplicação
    const newVertices = await findValidPositionForDuplicate(resource, parentArea, areaVertices);
    
    if (!newVertices) {
        alert('Não é possível duplicar: não há espaço suficiente na área de movimentação para colocar uma cópia do recurso.');
        return;
    }
    
    // Criar novo recurso diretamente sem preview/confirmação
    const migratedResource = migrateResourceToPolygonal(resource);
    const newResource = createPolygonalResource(
        newVertices,
        resource.color,
        resource.parentAreaId,
        migratedResource.isRectangular === true
    );

    // Preservar status retangular se aplicável
    newResource.isRectangular = migratedResource.isRectangular === true;
    
    if (newResource) {
        // Copiar propriedades do recurso original com nome numerado
        newResource.name = generateUniqueResourceName(resource.name);
        newResource.locked = false; // Duplicatas começam desbloqueadas

        const anchor = normalizeLabelAnchor(resource.labelAnchor);
        if (anchor) {
            const originalCentroid = getPolygonCentroid(migratedResource.vertices);
            const newCentroid = getPolygonCentroid(newResource.vertices);
            const deltaX = (newCentroid?.[0] ?? originalCentroid?.[0] ?? anchor.x) - (originalCentroid?.[0] ?? anchor.x);
            const deltaY = (newCentroid?.[1] ?? originalCentroid?.[1] ?? anchor.y) - (originalCentroid?.[1] ?? anchor.y);
            newResource.labelAnchor = { x: anchor.x + deltaX, y: anchor.y + deltaY };
        }

        if (Number.isFinite(resource.labelAngle)) {
            newResource.labelAngle = resource.labelAngle;
        }

        // Copiar rotação do recurso original (necessário para renderizar imagem corretamente)
        if (resource.rotation) {
            newResource.rotation = resource.rotation;
        }

        // Copiar imagem do recurso original se existir
        if (resource.imageDataUrl) {
            copyImageToResource(resource, newResource);
        }

        // Clonar hubs do recurso original para a cópia
        // O delta é o deslocamento entre os vértices originais e os novos (offset constante)
        const hubDeltaX = newVertices[0][0] - migratedResource.vertices[0][0];
        const hubDeltaY = newVertices[0][1] - migratedResource.vertices[0][1];
        cloneHubsForResource(resource.id, newResource, hubDeltaX, hubDeltaY);

        // Selecionar o novo recurso
        setSelectedResourceId(newResource.id);
        
        // Redesenhar canvas
        drawAll();
        
    } else {
        alert('Erro ao criar recurso duplicado.');
    }
}

// Compat layer export
export { duplicateResource as duplicateResourceCompatibility };
