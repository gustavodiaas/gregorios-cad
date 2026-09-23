// Funções de manipulação de áreas extraídas de events.js
// Corrigidos os imports para os módulos corretos

import { drawAll } from '../drawing.js';
import { saveStateToHistory } from '../history.js'; // Sistema de undo/redo
import { pixelsPerCm, floatTolerance } from '../config.js';
import {
    calculateBoundingBox,
    syncAreaCoordinates,
    rectangleToVertices,
    pointInPolygon,
    checkAreaOverlap
} from '../areas.js';
import { rotateWallsWithArea } from '../walls.js';
import { rotateConnectionsWithArea, deleteConnection } from '../connections.js';
import { rotateResourcesWithArea, removeResourcesFromArea } from '../merge_resources/index.js';
import { rotateExclusionZonesWithArea, removeExclusionZonesFromArea } from '../exclusion-zones.js';
import { isStairResource } from '../resources.js';
import {
    getCtx,
    getCanvas,
    walls,
    movementAreas,
    getConnections,
    setSelectedAreaId,
    getIsEditingPolygon,
    getEditingAreaId,
    setIsEditingPolygon,
    setEditingAreaId,
    resources
} from '../state.js';
import { deleteOpening, Opening, openings } from '../openings.js'; // Importa tudo do sistema avançado
import { ensureAreaHasNavMesh } from '../navMeshBaker.js';
import { invalidateNavigationGraph } from '../navigation.js';
import { layoutChangeNotifier } from '../core/layout-change-notifier.js';
import { generateId, ID_PREFIXES } from '../utils/idGenerator.js';
import { cloneHubsForResource } from '../hubs.js';

/**
 * Gera um nome adequado para recurso duplicado na cópia de área.
 * Remove sufixo "(Cópia)" antigo e gera numeração sequencial.
 * Ex: "SERRA" -> "SERRA (Cópia)", "União de A, B" -> "União de A, B (Cópia)"
 * Se já termina com "(Cópia)", adiciona numeração: "(Cópia 2)", "(Cópia 3)", etc.
 */
function generateDuplicatedResourceName(originalName) {
    if (!originalName) return 'Recurso (Cópia)';
    
    // Remover sufixos "(Cópia)" ou "(Cópia N)" anteriores para obter o nome base
    let baseName = originalName.replace(/\s*\(Cópia(?:\s+\d+)?\)\s*$/i, '').trim();
    if (!baseName) baseName = originalName;
    
    // Encontrar todos os números de cópia já usados para esse nome base
    const usedNumbers = new Set();
    
    for (const res of resources) {
        if (!res.name) continue;
        
        // Verificar se é exatamente "baseName (Cópia)"
        if (res.name === `${baseName} (Cópia)`) {
            usedNumbers.add(1);
            continue;
        }
        
        // Verificar se segue o padrão "baseName (Cópia N)"
        const match = res.name.match(new RegExp(`^${escapeRegExpForName(baseName)}\\s+\\(Cópia\\s+(\\d+)\\)$`));
        if (match) {
            usedNumbers.add(parseInt(match[1], 10));
        }
    }
    
    // Se "(Cópia)" não existe ainda, usar esse
    if (!usedNumbers.has(1)) {
        return `${baseName} (Cópia)`;
    }
    
    // Encontrar o próximo número disponível
    let nextNumber = 2;
    while (usedNumbers.has(nextNumber)) {
        nextNumber++;
    }
    
    return `${baseName} (Cópia ${nextNumber})`;
}

function escapeRegExpForName(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toggleLockArea(area) {
    saveStateToHistory(`${area.locked ? 'Desbloquear' : 'Bloquear'} área`);
    area.locked = !area.locked;
    drawAll();
}

function toggleDimensionsArea(area) {
    // Função removida - usar apenas controle global
}

function rotateArea(area) {
    saveStateToHistory('Rotacionar área');
    const bb = calculateBoundingBox(area.vertices);
    const centerX = bb.x + bb.width / 2;
    const centerY = bb.y + bb.height / 2;
    area.vertices = area.vertices.map(([x, y]) => [
        centerX + (y - centerY),
        centerY - (x - centerX)
    ]);
    if (area.rings && area.rings.length > 0) {
        area.rings = area.rings.map(ring => ring.map(([x, y]) => [
            centerX + (y - centerY),
            centerY - (x - centerX)
        ]));
        if (area.rings[0] && area.rings[0].length > 0) {
            area.vertices = [...area.rings[0]];
        }
    }
    syncAreaCoordinates(area);
    rotateWallsWithArea(area.id, centerX, centerY);
    rotateResourcesWithArea(area.id, centerX, centerY);
    rotateConnectionsWithArea(area.id, centerX, centerY);
    rotateExclusionZonesWithArea(area.id, centerX, centerY);
    
    // Regenerar a NavMesh para refletir a nova orientação da área
    ensureAreaHasNavMesh(area);
    invalidateNavigationGraph();
    
    // Notificar o sistema de mudança de layout
    layoutChangeNotifier.notifyChange('area', { action: 'rotate', entity: area });
    
    const ctx = getCtx();
    const canvas = getCanvas();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawAll();
}

function renameArea(area) {
    const novoNome = prompt('Novo nome para a área:', area.name || '');
    if (novoNome !== null) {
        saveStateToHistory('Renomear área');
        area.name = novoNome;
    }
    drawAll();
}

function promptAreaDimensions(area) {
    if (!area) return;

    if (isComplexArea(area)) {
        alert('Áreas complexas ou unidas devem ser editadas pelo modo Polígono.');
        return;
    }

    const formatValue = (value) => {
        if (!Number.isFinite(value)) return '';
        const hasFraction = Math.abs(value - Math.round(value)) > 1e-4;
        return value.toLocaleString('pt-BR', {
            minimumFractionDigits: hasFraction ? 2 : 0,
            maximumFractionDigits: 2
        });
    };

    const parseValue = (value) => {
        if (typeof value !== 'string') return NaN;
        const sanitized = value.trim().replace(/\s+/g, '').replace(',', '.');
        if (sanitized === '') return NaN;
        const parsed = Number(sanitized);
        return Number.isFinite(parsed) ? parsed : NaN;
    };

    try {
        const mainVertices = getMainVertices(area);
        const referenceVertices = (mainVertices && mainVertices.length >= 2)
            ? mainVertices.map(([x, y]) => [x, y])
            : rectangleToVertices(area.x || 0, area.y || 0, area.width || 0, area.height || 0);

        const bbox = calculateBoundingBox(referenceVertices);
        const currentWidthCm = (bbox.width || area.width || 0) / pixelsPerCm;
        const currentHeightCm = (bbox.height || area.height || 0) / pixelsPerCm;

        const widthInput = prompt('Digite a largura em cm:', formatValue(currentWidthCm));
        if (widthInput === null) return;

        const heightInput = prompt('Digite a altura em cm:', formatValue(currentHeightCm));
        if (heightInput === null) return;

        const widthCm = parseValue(widthInput);
        const heightCm = parseValue(heightInput);

        if (!Number.isFinite(widthCm) || widthCm <= 0) {
            alert('Valor de largura inválido. Informe um número maior que zero.');
            return;
        }

        if (!Number.isFinite(heightCm) || heightCm <= 0) {
            alert('Valor de altura inválido. Informe um número maior que zero.');
            return;
        }

        const newWidthPx = Math.round(widthCm * pixelsPerCm * 100) / 100;
        const newHeightPx = Math.round(heightCm * pixelsPerCm * 100) / 100;

        const baseWidthPx = bbox.width;
        const baseHeightPx = bbox.height;
        const anchorX = bbox.x;
        const anchorY = bbox.y;

        let updatedVertices = null;
        let updatedRings = null;

        if (baseWidthPx < floatTolerance || baseHeightPx < floatTolerance) {
            updatedVertices = rectangleToVertices(anchorX, anchorY, newWidthPx, newHeightPx);
        } else {
            const scaleX = newWidthPx / baseWidthPx;
            const scaleY = newHeightPx / baseHeightPx;
            const scalePoint = ([x, y]) => [
                anchorX + (x - anchorX) * scaleX,
                anchorY + (y - anchorY) * scaleY
            ];

            if (area.rings && area.rings.length > 0) {
                const originalRings = area.rings.map(ring => ring.map(([x, y]) => [x, y]));
                updatedRings = originalRings.map(ring => ring.map(scalePoint));
                updatedVertices = updatedRings[0].map(([x, y]) => [x, y]);
            } else {
                const originalVertices = referenceVertices.map(([x, y]) => [x, y]);
                updatedVertices = originalVertices.map(scalePoint);
            }
        }

        saveStateToHistory('Atualizar dimensões da área');

        if (updatedRings) {
            area.rings = updatedRings;
        } else if (area.rings) {
            delete area.rings;
        }

        area.vertices = updatedVertices;
        syncAreaCoordinates(area);

        area.x = anchorX;
        area.y = anchorY;
        area.width = newWidthPx;
        area.height = newHeightPx;

        ensureAreaHasNavMesh(area);
        setSelectedAreaId(area.id);
        drawAll();

        invalidateNavigationGraph();
        
        // Notificar o sistema de mudança de layout
        layoutChangeNotifier.notifyChange('area', { action: 'resize', entity: area });
    } catch (error) {
        console.error('Erro ao atualizar dimensões da área:', error);
        alert('Não foi possível atualizar as dimensões da área. Verifique o console para mais detalhes.');
    }
}

function deleteArea(area) {
    saveStateToHistory('Excluir área');
    // Dependências globais: walls, openings, movementAreas
    const associatedWalls = walls.filter(wall => wall.parentAreaId === area.id);
    let totalOpeningsRemoved = 0;
    let totalWallsRemoved = 0;
    let totalConnectionsRemoved = 0;
    
    // Remover aberturas associadas às paredes da área
    associatedWalls.forEach(wall => {
        const wallOpenings = openings.filter(opening => opening.parentWallId === wall.id);
        wallOpenings.forEach(opening => {
            const removed = deleteOpening(opening.id);
            if (removed) {
                totalOpeningsRemoved++;
            }
        });
    });
    
    // Também remover aberturas diretamente associadas à área (não necessariamente via parede)
    // Verificando todas as possíveis associações entre aberturas e áreas
    const areaOpenings = openings.filter(opening => 
        opening.parentAreaId === area.id || 
        opening.areaIdA === area.id || 
        opening.areaIdB === area.id
    );
    
    areaOpenings.forEach(opening => {
        if (!opening.removed) { // Evitar remover a mesma abertura duas vezes
            const removed = deleteOpening(opening.id);
            if (removed) {
                totalOpeningsRemoved++;
                opening.removed = true; // Marcar como removida para evitar duplicação
            }
        }
    });

    // Remover paredes associadas à área
    for (let i = walls.length - 1; i >= 0; i--) {
        if (walls[i].parentAreaId === area.id) {
            walls.splice(i, 1);
            totalWallsRemoved++;
        }
    }
    
    // Remover recursos associados à área
    removeResourcesFromArea(area.id);
    
    // Remover zonas de exclusão associadas à área
    removeExclusionZonesFromArea(area.id);
    
    // Remover conexões associadas à área
    const connections = getConnections();
    if (connections) {
        // Filtrar conexões que pertencem à área específica
        const areaConnections = connections.filter(c => {
            // Comparação estrita
            if (c.parentAreaId === area.id) return true;
            
            // Comparação flexível (== para diferentes tipos)
            if (c.parentAreaId == area.id) return true;
            
            // Comparação como string
            if (c.parentAreaId?.toString() === area.id?.toString()) return true;
            
            return false;
        });
        
        // Remover cada conexão encontrada
        areaConnections.forEach(connection => {
            deleteConnection(connection.id);
            totalConnectionsRemoved++;
        });
        
        if (totalConnectionsRemoved > 0) {
        }
    }
    
    // Remover a área da lista
    const idx = movementAreas.findIndex(a => a.id === area.id);
    if (idx !== -1) {
        movementAreas.splice(idx, 1);
    }
    
    setSelectedAreaId(null);
    
    // Cancelar modo de edição de polígono se a área deletada estava sendo editada
    if (getIsEditingPolygon() && getEditingAreaId() === area.id) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }
    
    // TASK 4: Invalidar grafo de navegação quando área é deletada
    // Remoção de área afeta conectividade e requer reconstrução do grafo
    invalidateNavigationGraph();
    
    // Notificar o sistema de mudança de layout
    layoutChangeNotifier.notifyChange('area', { action: 'delete', entity: area });
    
    drawAll();
}

// Helper para criar uma cópia de uma área com um determinado offset
function createAreaCopy(area, dx, dy) {
    const newArea = {
        id: generateId(ID_PREFIXES.AREA),
        name: (area.name || 'Área').includes('(Cópia)') ? area.name : `${area.name || 'Área'} (Cópia)`,
        locked: false,
        color: area.color || '#FFFFFF',
        visible: true
    };

    if (hasValidRings(area)) {
        newArea.rings = area.rings.map(ring =>
            ring.map(([x, y]) => [x + dx, y + dy])
        );
        newArea.vertices = [...newArea.rings[0]];
    } else if (area.vertices && area.vertices.length > 0) {
        newArea.vertices = area.vertices.map(([x, y]) => [x + dx, y + dy]);
    } else {
        newArea.x = area.x + dx;
        newArea.y = area.y + dy;
        newArea.width = area.width;
        newArea.height = area.height;
        newArea.vertices = rectangleToVertices(newArea.x, newArea.y, newArea.width, newArea.height);
    }
    syncAreaCoordinates(newArea);
    return newArea;
}

function findValidPositionForArea(area) {
    // Remover debugger statement que pode atrapalhar o fluxo
    // Ampliar os offsets iniciais e incluir mais opções
    const offsets = [
        [150, 0], [0, 150], [-150, 0], [0, -150],
        [150, 150], [-150, 150], [150, -150], [-150, -150],
        [200, 0], [0, 200], [-200, 0], [0, -200],
        [250, 0], [0, 250], [-250, 0], [0, -250],
        [300, 300], [-300, 300], [300, -300], [-300, -300]
    ];

    // Calcular dimensões aproximadas da área
    let areaWidth = 0;
    let areaHeight = 0;
    
    if (area.vertices && area.vertices.length > 0) {
        const xs = area.vertices.map(v => v[0]);
        const ys = area.vertices.map(v => v[1]);
        areaWidth = Math.max(...xs) - Math.min(...xs);
        areaHeight = Math.max(...ys) - Math.min(...ys);
    } else if (area.width && area.height) {
        areaWidth = area.width;
        areaHeight = area.height;
    } else {
        // Estimativa se não tiver dados
        areaWidth = 200;
        areaHeight = 200;
    }

    // Tentativa com offsets fixos
    for (const [dx, dy] of offsets) {
        try {
            const newArea = createAreaCopy(area, dx, dy);
            
            // Verificar sobreposição com todas as áreas existentes
            const hasOverlap = movementAreas.some(existingArea => {
                try {
                    return checkAreaOverlap(newArea, existingArea);
                } catch (e) {
                    console.error("Erro ao verificar sobreposição:", e);
                    return true; // Assumir sobreposição em caso de erro
                }
            });

            if (!hasOverlap) {
                return { dx, dy };
            }
        } catch (e) {
            console.error("Erro ao criar cópia da área:", e);
            continue;
        }
    }
    
    // Se offsets falharem, executar busca mais sistemática com maior abrangência
    let attempts = 0;
    const maxAttempts = 100; // Aumentar tentativas
    const step = Math.max(50, Math.min(areaWidth, areaHeight) / 2); // Ajustar step com base no tamanho da área
    const directions = [
        [1, 0], [0, 1], [-1, 0], [0, -1], // Cardeal
        [1, 1], [-1, -1], [1, -1], [-1, 1], // Diagonal
        [2, 0], [0, 2], [-2, 0], [0, -2] // Mais distante
    ];

    while (attempts < maxAttempts) {
        const dir = directions[attempts % directions.length];
        const tryOffset = step + (Math.floor(attempts / directions.length) + 1) * 50;
        const dx = dir[0] * tryOffset;
        const dy = dir[1] * tryOffset;
        
        try {
            const newArea = createAreaCopy(area, dx, dy);
            let hasOverlap = false;
            
            // Verificar sobreposição com todas as áreas existentes
            try {
                hasOverlap = movementAreas.some(existingArea => 
                    checkAreaOverlap(newArea, existingArea)
                );
                
                if (!hasOverlap) {
                    return { dx, dy };
                }
            } catch (e) {
                console.error("Erro ao verificar sobreposição:", e);
            }
        } catch (e) {
            console.error("Erro ao criar cópia da área:", e);
        }
        attempts++;
    }

    // Se ainda falhar, tentar uma posição bem distante como último recurso
    const lastResortOffsets = [
        [500, 500], [-500, 500], [500, -500], [-500, -500],
        [1000, 0], [0, 1000], [-1000, 0], [0, -1000]
    ];
    
    for (const [dx, dy] of lastResortOffsets) {
        try {
            const newArea = createAreaCopy(area, dx, dy);
            const hasOverlap = movementAreas.some(existingArea => {
                try {
                    return checkAreaOverlap(newArea, existingArea);
                } catch (e) {
                    return true; // Assumir sobreposição em caso de erro
                }
            });

            if (!hasOverlap) {
                return { dx, dy };
            }
        } catch (e) {
            console.error("Erro ao criar cópia da área (último recurso):", e);
        }
    }

    return null; // Nenhuma posição encontrada
}

function duplicateArea(area) {
    try {
        saveStateToHistory('Duplicar área');

        if (!area) {
            console.error("Tentativa de duplicar área nula ou indefinida");
            alert("Erro ao duplicar: área inválida.");
            return;
        }


        const position = findValidPositionForArea(area);

        if (!position) {
            alert("Não foi possível encontrar uma posição livre para duplicar a área. Tente mover ou redimensionar áreas existentes.");
            return;
        }

        const { dx, dy } = position;
        
        const newArea = createAreaCopy(area, dx, dy);

        movementAreas.push(newArea);
        
        try {
            ensureAreaHasNavMesh(newArea);
        } catch (navMeshError) {
            console.error("Erro ao criar NavMesh para a nova área:", navMeshError);
            // Continuar mesmo se falhar a criação do NavMesh
        }

    // Duplicar recursos, paredes e aberturas...
    try {
        const originalResources = resources.filter(resource => resource.parentAreaId === area.id);
        originalResources.forEach(resource => {
            try {
                const newResource = {
                    ...resource,
                    id: generateId(ID_PREFIXES.RESOURCE),
                    x: resource.x + dx,
                    y: resource.y + dy,
                    parentAreaId: newArea.id,
                    name: generateDuplicatedResourceName(resource.name),
                    locked: false,
                };
                if (resource.vertices) {
                    newResource.vertices = resource.vertices.map(([x, y]) => [x + dx, y + dy]);
                }
                if (resource.boundingBox) {
                    newResource.boundingBox = {
                        ...resource.boundingBox,
                        x: resource.boundingBox.x + dx,
                        y: resource.boundingBox.y + dy,
                    };
                }
                // Traduzir labelAnchor se existir
                if (newResource.labelAnchor) {
                    if (typeof newResource.labelAnchor === 'object' && newResource.labelAnchor !== null) {
                        newResource.labelAnchor = {
                            x: (newResource.labelAnchor.x || 0) + dx,
                            y: (newResource.labelAnchor.y || 0) + dy
                        };
                    }
                }
                // Deep clone e traduzir stairConfig para escadas
                if (isStairResource(resource) && resource.stairConfig) {
                    newResource.stairConfig = JSON.parse(JSON.stringify(resource.stairConfig));
                    // Remover vínculo com escada original (a cópia é independente)
                    newResource.stairConfig.linkedResourceId = null;
                    newResource.stairConfig.groupId = null;
                    newResource.stairConfig.originFloorId = null;
                    newResource.stairConfig.targetFloorId = null;
                    // Traduzir orientação (coordenadas absolutas) pelo offset dx, dy
                    if (newResource.stairConfig.orientation) {
                        const ori = newResource.stairConfig.orientation;
                        if (ori.center) {
                            ori.center.x += dx;
                            ori.center.y += dy;
                        }
                        if (ori.entryPoint) {
                            ori.entryPoint.x += dx;
                            ori.entryPoint.y += dy;
                        }
                        if (ori.exitPoint) {
                            ori.exitPoint.x += dx;
                            ori.exitPoint.y += dy;
                        }
                        if (Array.isArray(ori.entryPortal)) {
                            ori.entryPortal = ori.entryPortal.map(v => [v[0] + dx, v[1] + dy]);
                        }
                        if (Array.isArray(ori.exitPortal)) {
                            ori.exitPortal = ori.exitPortal.map(v => [v[0] + dx, v[1] + dy]);
                        }
                    }
                }
                const newAreaVertices = getMainVertices(newArea);
                const resourceVertices = newResource.vertices || 
                    rectangleToVertices(
                        newResource.x, 
                        newResource.y,
                        newResource.width, 
                        newResource.height
                    );
                
                // Verificar se o recurso está dentro da área antes de adicionar
                try {
                    if (resourceVertices.every(v => pointInPolygon(v, newAreaVertices))) {
                        resources.push(newResource);
                        // Clonar hubs do recurso original para a cópia
                        cloneHubsForResource(resource.id, newResource, dx, dy);
                    } else {
                    }
                } catch (pointError) {
                    console.error("Erro ao verificar posição do recurso:", pointError);
                }
            } catch (resourceError) {
                console.error("Erro ao duplicar recurso:", resourceError);
            }
        });
    } catch (resourcesError) {
        console.error("Erro ao processar recursos:", resourcesError);
    }

    try {
        const originalWalls = walls.filter(wall => wall.parentAreaId === area.id);
        const wallIdMap = new Map();
        originalWalls.forEach(wall => {
            try {
                const newWall = {
                    ...wall,
                    id: generateId(ID_PREFIXES.WALL),
                    startPoint: [wall.startPoint[0] + dx, wall.startPoint[1] + dy],
                    endPoint: [wall.endPoint[0] + dx, wall.endPoint[1] + dy],
                    parentAreaId: newArea.id
                };
                walls.push(newWall);
                wallIdMap.set(wall.id, newWall.id);
            } catch (wallError) {
                console.error("Erro ao duplicar parede:", wallError);
            }
        });
        
        try {
            const originalOpenings = openings.filter(o => o.parentAreaId === area.id);
            originalOpenings.forEach(origOpening => {
                try {
                    const plainClonedOpening = JSON.parse(JSON.stringify(origOpening));
                    plainClonedOpening.id = generateId(ID_PREFIXES.OPENING);
                    plainClonedOpening.parentAreaId = newArea.id;
                    plainClonedOpening.selected = false;
                    plainClonedOpening.startPoint[0] += dx;
                    plainClonedOpening.startPoint[1] += dy;
                    plainClonedOpening.endPoint[0] += dx;
                    plainClonedOpening.endPoint[1] += dy;
                    plainClonedOpening.parentWallId = wallIdMap.get(origOpening.parentWallId) || null;
                    plainClonedOpening.originalWallId = wallIdMap.get(origOpening.originalWallId) || null;
                    plainClonedOpening.wallBefore = wallIdMap.get(origOpening.wallBefore) || null;
                    plainClonedOpening.wallAfter = wallIdMap.get(origOpening.wallAfter) || null;
                    if (plainClonedOpening.originalWallStart) {
                        plainClonedOpening.originalWallStart[0] += dx;
                        plainClonedOpening.originalWallStart[1] += dy;
                    }
                    if (plainClonedOpening.originalWallEnd) {
                        plainClonedOpening.originalWallEnd[0] += dx;
                        plainClonedOpening.originalWallEnd[1] += dy;
                    }
                    
                    // Verificar se Opening existe e tem o protótipo necessário
                    if (typeof Opening !== 'undefined') {
                        Object.setPrototypeOf(plainClonedOpening, Opening.prototype);
                    } else {
                        console.warn("Objeto Opening não encontrado, prosseguindo sem definir protótipo");
                    }
                    
                    openings.push(plainClonedOpening);
                } catch (openingError) {
                    console.error("Erro ao duplicar abertura:", openingError);
                }
            });
        } catch (openingsError) {
            console.error("Erro ao processar aberturas:", openingsError);
        }
    } catch (wallsError) {
        console.error("Erro ao processar paredes:", wallsError);
    }

    try {
        if (hasValidRings(newArea)) {
            if (!newArea.vertices || newArea.vertices.length !== newArea.rings[0].length) {
                newArea.vertices = [...newArea.rings[0]];
            }
            newArea.rings = newArea.rings.filter(ring => ring && ring.length >= 3);
            if (newArea.rings.length === 0) {
                delete newArea.rings;
            }
        }
    } catch (ringsError) {
        console.error("Erro ao processar anéis da área:", ringsError);
    }

    setSelectedAreaId(newArea.id);
    invalidateNavigationGraph();
    
    // Notificar o sistema de mudança de layout
    layoutChangeNotifier.notifyChange('area', { action: 'create', entity: newArea });
    
    drawAll();
    
} catch (error) {
    console.error("Erro crítico ao duplicar área:", error);
    alert("Ocorreu um erro ao tentar duplicar a área. Por favor, tente novamente ou contate o suporte.");
}
}

function toggleEditPolygonMode(area) {
    const isCurrentlyEditing = getIsEditingPolygon() && getEditingAreaId() === area.id;
    if (isCurrentlyEditing) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
        setSelectedAreaId(null);
    } else {
        setIsEditingPolygon(true);
        setEditingAreaId(area.id);
        // Não selecionar a área automaticamente - deixar o usuário clicar no midpoint
        // setSelectedAreaId(area.id);
    }
    drawAll();
}

// Helper: verifica se uma área tem rings válidos
function hasValidRings(area) {
    return area.rings && area.rings.length > 0 && area.rings[0] && area.rings[0].length >= 3;
}

function isComplexArea(area) {
    if (!area) return false;
    if (Object.prototype.hasOwnProperty.call(area, 'isRectangular') && area.isRectangular === false) {
        return true;
    }
    return hasValidRings(area);
}

// Helper: obtém os vértices principais de uma área (contorno externo)
function getMainVertices(area) {
    if (hasValidRings(area)) {
        return area.rings[0];
    } else if (area.vertices && area.vertices.length >= 3) {
        return area.vertices;
    } else {
        return rectangleToVertices(area.x, area.y, area.width, area.height);
    }
}

// Helper: compare two points with tolerance
function pointsEqual(p1, p2, tol = 0.1) {
    return Math.abs(p1[0] - p2[0]) < tol && Math.abs(p1[1] - p2[1]) < tol;
}
// Helper: compare two wall segments (start/end points, order-insensitive)
function wallMatches(wallA, wallB, tol = 0.1) {
    return (
        (pointsEqual(wallA.startPoint, wallB.startPoint, tol) && pointsEqual(wallA.endPoint, wallB.endPoint, tol)) ||
        (pointsEqual(wallA.startPoint, wallB.endPoint, tol) && pointsEqual(wallA.endPoint, wallB.startPoint, tol))
    );
}

export {
    toggleLockArea,
    toggleDimensionsArea,
    rotateArea,
    renameArea,
    promptAreaDimensions,
    deleteArea,
    duplicateArea,
    toggleEditPolygonMode,
    isComplexArea
};
