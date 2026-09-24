// Sistema para calcular e exibir distâncias das conexões
import { getConnections, resources, getAllFloors, getSelectedResourceIds } from './state.js';
import { calculateConnectionDistance, findHubById } from './connections.js';
import { getHubById } from './hubs.js';
import { openings as allOpenings, getOpeningDisplayName } from './openings.js';
import { onStateAction } from './state/events.js';
import { pixelsPerCm } from './config.js';
import { convertFromCm, formatLength, getMeasurementUnit } from './measurement-units.js';

let connectionAnalysisBodyElement = null;

// Função para atualizar a tabela de distâncias das conexões
export function updateConnectionDistancesTable() {
    const connectionAnalysisPanel = document.getElementById('connectionAnalysisPanel');
    
    if (!connectionAnalysisPanel) return;
    
    const connections = getConnections();
    
    if (!connections || connections.length === 0) {
        // Mostrar mensagem de "sem conexões"
        connectionAnalysisPanel.innerHTML = `
            <div class="no-connections-message">
                <i class="fas fa-project-diagram"></i>
                <p>Não há conexões criadas ainda</p>
            </div>
        `;
        
        // Atualizar métricas para zero
        updateConnectionMetrics(0, 0);
        return;
    }
    
    // Mostrar tabela se há conexões
    connectionAnalysisPanel.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Recursos</th>
                    <th>Distância (${getMeasurementUnit().symbol})</th>
                    <th>Total de Linhas</th>
                </tr>
            </thead>
            <tbody id="connectionDistancesBody">
                <!-- Preenchido dinamicamente -->
            </tbody>
            <tfoot>
                <tr>
                    <td>Total</td>
                    <td id="totalDistance">0</td>
                    <td id="totalLines">0</td>
                </tr>
            </tfoot>
        </table>
    `;
    
    // Reobter referências após recriar a tabela
    const newConnectionDistancesBody = document.getElementById('connectionDistancesBody');
    const newTotalDistanceElement = document.getElementById('totalDistance');
    const newTotalLinesElement = document.getElementById('totalLines');
    connectionAnalysisBodyElement = newConnectionDistancesBody;
    
    // Agrupar conexões por pares de recursos
    const groups = {};
    
    connections.forEach(connection => {
        let dist = 0;
        let resourceA, resourceB;
        
        // Sistema de hubs (novo formato)
        if (connection.startHubId && connection.endHubId) {
            let startHubData = findHubById(connection.startHubId);
            let endHubData = findHubById(connection.endHubId);
            
            // Resolver hubs de doca (boundary opening) que retornam resource: null
            if (startHubData && !startHubData.resource && startHubData.hub && startHubData.hub.boundaryOpeningId) {
                const opening = allOpenings.find(o => o.id === startHubData.hub.boundaryOpeningId);
                const dockName = opening ? getOpeningDisplayName(opening) : (startHubData.hub.name || 'DOCA');
                startHubData = { resource: { id: `dock_${startHubData.hub.boundaryOpeningId}`, name: dockName, _isDock: true }, hub: startHubData.hub };
            }
            if (endHubData && !endHubData.resource && endHubData.hub && endHubData.hub.boundaryOpeningId) {
                const opening = allOpenings.find(o => o.id === endHubData.hub.boundaryOpeningId);
                const dockName = opening ? getOpeningDisplayName(opening) : (endHubData.hub.name || 'DOCA');
                endHubData = { resource: { id: `dock_${endHubData.hub.boundaryOpeningId}`, name: dockName, _isDock: true }, hub: endHubData.hub };
            }
            
            // Fallback: Tentar encontrar no registro global de hubs (hubs.js)
            if (!startHubData) {
                const globalHub = getHubById(connection.startHubId);
                if (globalHub && globalHub.resourceId) {
                    let resource = resources.find(r => r.id === globalHub.resourceId);
                    
                    // Se não encontrar no andar atual, procurar em todos os andares
                    if (!resource) {
                        const allFloors = getAllFloors();
                        for (const floor of allFloors) {
                            const found = floor.resources.find(r => r.id === globalHub.resourceId);
                            if (found) {
                                resource = found;
                                break;
                            }
                        }
                    }

                    if (resource) {
                        startHubData = { resource, hub: globalHub };
                    }
                } else if (globalHub && globalHub.boundaryOpeningId) {
                    // Hub de doca (abertura de borda) — criar pseudo-recurso
                    const opening = allOpenings.find(o => o.id === globalHub.boundaryOpeningId);
                    const dockName = opening ? getOpeningDisplayName(opening) : (globalHub.name || 'DOCA');
                    startHubData = { resource: { id: `dock_${globalHub.boundaryOpeningId}`, name: dockName, _isDock: true }, hub: globalHub };
                }
            }

            if (!endHubData) {
                const globalHub = getHubById(connection.endHubId);
                if (globalHub && globalHub.resourceId) {
                    let resource = resources.find(r => r.id === globalHub.resourceId);
                    
                    // Se não encontrar no andar atual, procurar em todos os andares
                    if (!resource) {
                        const allFloors = getAllFloors();
                        for (const floor of allFloors) {
                            const found = floor.resources.find(r => r.id === globalHub.resourceId);
                            if (found) {
                                resource = found;
                                break;
                            }
                        }
                    }

                    if (resource) {
                        endHubData = { resource, hub: globalHub };
                    }
                } else if (globalHub && globalHub.boundaryOpeningId) {
                    // Hub de doca (abertura de borda) — criar pseudo-recurso
                    const opening = allOpenings.find(o => o.id === globalHub.boundaryOpeningId);
                    const dockName = opening ? getOpeningDisplayName(opening) : (globalHub.name || 'DOCA');
                    endHubData = { resource: { id: `dock_${globalHub.boundaryOpeningId}`, name: dockName, _isDock: true }, hub: globalHub };
                }
            }
            
            // Tentar resolver hubs virtuais se ainda não encontrou
            if (!startHubData && connection.startHubId.startsWith('virtual_hub_')) {
                const match = connection.startHubId.match(/^virtual_hub_(.+)_start$/);
                if (match && match[1]) {
                    const operatorId = match[1];
                    const operator = resources.find(r => r.id === operatorId);
                    if (operator) {
                        startHubData = { resource: operator };
                    } else {
                        console.warn(`[FlowMetrics] Operador não encontrado para hub virtual: ${operatorId}`);
                    }
                }
            }
            
            if (!endHubData && connection.endHubId.startsWith('virtual_hub_')) {
                const match = connection.endHubId.match(/^virtual_hub_(.+)_start$/);
                if (match && match[1]) {
                    const operatorId = match[1];
                    const operator = resources.find(r => r.id === operatorId);
                    if (operator) {
                        endHubData = { resource: operator };
                    } else {
                        console.warn(`[FlowMetrics] Operador não encontrado para hub virtual: ${operatorId}`);
                    }
                }
            }
            
            if (startHubData && endHubData) {
                resourceA = startHubData.resource;
                resourceB = endHubData.resource;
                dist = calculateConnectionDistance(connection);
            } else {
                console.warn(`[FlowMetrics] Falha ao resolver hubs para conexão ${connection.id}: start=${!!startHubData}, end=${!!endHubData}`);
            }
        }
        // Sistema legado com pontos
        else if (connection.points && connection.points.length > 1) {
            const startPoint = connection.points[0];
            const endPoint = connection.points[connection.points.length - 1];
            
            // Encontrar recursos nas extremidades
            resourceA = findResourceAtPosition(startPoint.x, startPoint.y, resources);
            resourceB = findResourceAtPosition(endPoint.x, endPoint.y, resources);
            
            // Calcular distância total da conexão
            dist = calculateConnectionDistance(connection);
        }
        // Sistema com ancoragem
        else if (connection.start && connection.end) {
            resourceA = resources.find(r => r.id === connection.start.resourceId);
            resourceB = resources.find(r => r.id === connection.end.resourceId);
            dist = calculateConnectionDistance(connection);
        }
        
        // Só adicionar aos grupos se ambos os recursos foram encontrados
        if (resourceA && resourceB) {
            const resAName = resourceA.name || `Recurso ${resourceA.id}`;
            const resBName = resourceB.name || `Recurso ${resourceB.id}`;
            // Ordenar nomes para garantir consistência (A-B igual a B-A)
            const pairKey = [resAName, resBName].sort().join(' ↔ ');
            
            if (!groups[pairKey]) {
                groups[pairKey] = { totalDistance: 0, count: 0, resourceIds: new Set() };
            }
            
            // Considerar o número de vezes que a conexão foi usada (cumulativo)
            const usageCount = connection.usageCount || 1;
            
            groups[pairKey].totalDistance += dist * usageCount;
            groups[pairKey].count += usageCount;
            
            if (resourceA && resourceA.id != null) {
                groups[pairKey].resourceIds.add(String(resourceA.id));
            }
            if (resourceB && resourceB.id != null) {
                groups[pairKey].resourceIds.add(String(resourceB.id));
            }
        }
    });
    
    // Converter grupos em array e ordenar por distância total (decrescente)
    const sortedGroups = Object.entries(groups)
        .sort(([, a], [, b]) => b.totalDistance - a.totalDistance);
    
    let grandTotalDistance = 0;
    let grandTotalLines = 0;
    
    // Criar linhas da tabela para cada grupo
    sortedGroups.forEach(([pairKey, group]) => {
        grandTotalDistance += group.totalDistance;
        grandTotalLines += group.count;
        
        const row = document.createElement('tr');
        const resourceIds = Array.from(group.resourceIds || []);
        if (resourceIds.length > 0) {
            row.dataset.resourceIds = resourceIds.join(',');
        }
        
        const resourcesCell = document.createElement('td');
        resourcesCell.textContent = pairKey;
        
        const distCell = document.createElement('td');
        distCell.textContent = convertFromCm(group.totalDistance / pixelsPerCm).toLocaleString('pt-BR', {
            maximumFractionDigits: getMeasurementUnit().decimals
        });
        
        const countCell = document.createElement('td');
        countCell.textContent = group.count;
        
        row.appendChild(resourcesCell);
        row.appendChild(distCell);
        row.appendChild(countCell);
        
        if (newConnectionDistancesBody) {
            newConnectionDistancesBody.appendChild(row);
        }
    });
    
    // Atualizar totais na tabela
    if (newTotalDistanceElement) {
        newTotalDistanceElement.textContent = convertFromCm(grandTotalDistance / pixelsPerCm).toLocaleString('pt-BR', {
            maximumFractionDigits: getMeasurementUnit().decimals
        });
    }
    if (newTotalLinesElement) {
        newTotalLinesElement.textContent = grandTotalLines;
    }
    
    // Atualizar métricas do painel
    updateConnectionMetrics(grandTotalDistance, grandTotalLines);

    highlightConnectionRowsForSelectedResources();
}

// Função auxiliar para atualizar as métricas no painel de otimização
function updateConnectionMetrics(totalDistance, totalConnections) {
    const totalDistanceMetric = document.getElementById('totalDistanceMetric');
    const totalConnectionsMetric = document.getElementById('totalConnectionsMetric');
    const averageDistanceMetric = document.getElementById('averageDistanceMetric');
    const totalCm = totalDistance / pixelsPerCm;
    const averageCm = totalConnections > 0 ? totalCm / totalConnections : 0;
    if (totalDistanceMetric) {
        totalDistanceMetric.textContent = formatLength(totalCm);
    }
    
    if (totalConnectionsMetric) {
        totalConnectionsMetric.textContent = totalConnections.toString();
    }
    if (averageDistanceMetric) {
        averageDistanceMetric.textContent = formatLength(averageCm);
    }
}

/**
 * Formata segundos em string HH:MM:SS
 */
function formatCycleTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    }
    if (m > 0) {
        return `${m}m ${s.toString().padStart(2, '0')}s`;
    }
    return `${s}s`;
}

/**
 * Atualiza a métrica de tempo do ciclo no painel de otimização.
 * @param {number} totalSeconds - Tempo total do ciclo em segundos
 * @param {number} [shiftStartSec] - Início do expediente (seg desde meia-noite)
 * @param {number} [lunchStartSec] - Início do almoço (seg desde meia-noite)
 * @param {number} [lunchEndSec] - Fim do almoço (seg desde meia-noite)
 */
/**
 * Atualiza as métricas de tempo agrega e não agrega em tempo real.
 * @param {number} valueAddedSeconds - Tempo acumulado em atividades (trabalho)
 * @param {number} nonValueAddedSeconds - Tempo acumulado em movimentação (caminhada)
 */
export function updateValueTimeMetrics(valueAddedSeconds, nonValueAddedSeconds) {
    const vaEl = document.getElementById('valueAddedTimeMetric');
    const nvaEl = document.getElementById('nonValueAddedTimeMetric');
    if (vaEl) {
        vaEl.textContent = (valueAddedSeconds != null && valueAddedSeconds > 0)
            ? formatCycleTime(valueAddedSeconds) : '--';
    }
    if (nvaEl) {
        nvaEl.textContent = (nonValueAddedSeconds != null && nonValueAddedSeconds > 0)
            ? formatCycleTime(nonValueAddedSeconds) : '--';
    }
}

export function updateCycleTimeMetric(totalSeconds, shiftStartSec, lunchStartSec, lunchEndSec) {
    const el = document.getElementById('cycleTimeMetric');
    const rangeEl = document.getElementById('cycleTimeRange');
    if (!el) return;
    if (totalSeconds == null || totalSeconds <= 0) {
        el.textContent = '--';
        if (rangeEl) rangeEl.innerHTML = '';
        return;
    }
    el.textContent = formatCycleTime(totalSeconds);

    if (rangeEl && shiftStartSec != null) {
        const fmtClock = (sec) => {
            const h = Math.floor(sec / 3600) % 24;
            const m = Math.floor((sec % 3600) / 60);
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        };

        const lunchDur = (lunchStartSec != null && lunchEndSec != null)
            ? Math.max(0, lunchEndSec - lunchStartSec) : 0;

        // Só pular o almoço se o período de trabalho realmente cruzar o intervalo
        const preLunchWork = Math.max(0, (lunchStartSec || 0) - shiftStartSec);
        const crossesLunch = lunchDur > 0 && lunchStartSec > shiftStartSec && totalSeconds > preLunchWork;
        const shiftEndSec = crossesLunch
            ? shiftStartSec + totalSeconds + lunchDur
            : shiftStartSec + totalSeconds;

        const startClock = fmtClock(shiftStartSec);
        const endClock = fmtClock(shiftEndSec);

        if (crossesLunch) {
            const lunchStartClock = fmtClock(lunchStartSec);
            const lunchEndClock = fmtClock(lunchEndSec);
            rangeEl.innerHTML =
                `${startClock} \u2192 ${lunchStartClock} ` +
                `<span style="color:#e53935;font-weight:700">` +
                `${lunchStartClock} - ${lunchEndClock}` +
                `</span> ` +
                `${lunchEndClock} \u2192 ${endClock}`;
        } else {
            rangeEl.innerHTML = `${startClock} \u2192 ${endClock}`;
        }
    }
}

const connectionHighlightClass = 'connection-highlighted';

function highlightConnectionRowsForSelectedResources() {
    if (!connectionAnalysisBodyElement) {
        return;
    }

    const selectedIds = new Set(
        getSelectedResourceIds()
            .filter(id => id !== null && id !== undefined)
            .map(id => String(id))
    );
    const hasSelection = selectedIds.size > 0;

    connectionAnalysisBodyElement.querySelectorAll('tr').forEach(row => {
        const rowResourceIds = row.dataset.resourceIds;
        const shouldHighlight = hasSelection && rowResourceIds
            ? rowResourceIds.split(',').some(id => selectedIds.has(id))
            : false;
        row.classList.toggle(connectionHighlightClass, shouldHighlight);
    });
}

onStateAction('resource-selection/changed', highlightConnectionRowsForSelectedResources);

// Função auxiliar para encontrar recurso em uma posição
function findResourceAtPosition(x, y, resources) {
    const tolerance = 5; // Tolerância para clique próximo
    
    for (const resource of resources) {
        if (resource.vertices && resource.vertices.length > 0) {
            // Para recursos poligonais, verificar se está dentro do polígono
            if (isPointInPolygon(x, y, resource.vertices)) {
                return resource;
            }
        } else {
            // Para recursos retangulares
            if (x >= resource.x - tolerance && 
                x <= resource.x + resource.width + tolerance &&
                y >= resource.y - tolerance && 
                y <= resource.y + resource.height + tolerance) {
                return resource;
            }
        }
    }
    
    return null;
}

// Função auxiliar para verificar se um ponto está dentro de um polígono
function isPointInPolygon(x, y, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        if (((vertices[i][1] > y) !== (vertices[j][1] > y)) &&
            (x < (vertices[j][0] - vertices[i][0]) * (y - vertices[i][1]) / (vertices[j][1] - vertices[i][1]) + vertices[i][0])) {
            inside = !inside;
        }
    }
    return inside;
}

// Função para calcular estatísticas detalhadas das conexões
export function getConnectionStatistics() {
    const connections = getConnections();
    
    if (!connections || connections.length === 0) {
        return {
            totalConnections: 0,
            totalDistance: 0,
            averageDistance: 0,
            longestConnection: null,
            shortestConnection: null,
            resourcePairs: []
        };
    }
    
    let totalDistance = 0;
    let longestConnection = null;
    let shortestConnection = null;
    let longestDistance = 0;
    let shortestDistance = Number.MAX_VALUE;
    
    const resourcePairs = new Map();
    
    connections.forEach(connection => {
        const distance = calculateConnectionDistance(connection);
        totalDistance += distance;
        
        if (distance > longestDistance) {
            longestDistance = distance;
            longestConnection = connection;
        }
        
        if (distance < shortestDistance) {
            shortestDistance = distance;
            shortestConnection = connection;
        }
        
        // Identificar recursos conectados usando hubs
        if (connection.startHubId && connection.endHubId) {
            const startHubData = findHubById(connection.startHubId);
            const endHubData = findHubById(connection.endHubId);
            
            if (startHubData && endHubData) {
                const resAName = startHubData.resource 
                    ? (startHubData.resource.name || `Recurso ${startHubData.resource.id}`)
                    : (startHubData.hub.name || 'DOCA');
                const resBName = endHubData.resource 
                    ? (endHubData.resource.name || `Recurso ${endHubData.resource.id}`)
                    : (endHubData.hub.name || 'DOCA');
                const pairKey = [resAName, resBName].sort().join(' ↔ ');
                
                if (!resourcePairs.has(pairKey)) {
                    resourcePairs.set(pairKey, {
                        resourceA: startHubData.resource || { id: startHubData.hub.id, name: resAName },
                        resourceB: endHubData.resource || { id: endHubData.hub.id, name: resBName },
                        connections: [],
                        totalDistance: 0
                    });
                }
                
                const pair = resourcePairs.get(pairKey);
                pair.connections.push(connection);
                pair.totalDistance += distance;
            }
        }
        // Sistema legado
        else if (connection.resourceA && connection.resourceB) {
            const resAName = connection.resourceA.name || 'Recurso';
            const resBName = connection.resourceB.name || 'Recurso';
            const pairKey = [resAName, resBName].sort().join(' ↔ ');
            
            if (!resourcePairs.has(pairKey)) {
                resourcePairs.set(pairKey, {
                    resourceA: connection.resourceA,
                    resourceB: connection.resourceB,
                    connections: [],
                    totalDistance: 0
                });
            }
            
            const pair = resourcePairs.get(pairKey);
            pair.connections.push(connection);
            pair.totalDistance += distance;
        }
    });
    
    return {
        totalConnections: connections.length,
        totalDistance,
        averageDistance: totalDistance / connections.length,
        longestConnection,
        shortestConnection,
        longestDistance,
        shortestDistance,
        resourcePairs: Array.from(resourcePairs.entries()).map(([key, value]) => ({
            pairName: key,
            ...value
        }))
    };
}

/**
 * Atualiza os painéis completos por operador (conexões + métricas) lado a lado
 * @param {Map<string, number>} operatorCycles - Map de operatorId -> contagem de ciclos
 * @param {Map<string, {valueAddedMs, nonValueAddedMs, totalDistanceCm, connectionGroups}>} [operatorTimeTracking]
 */
export function updateOperatorCyclesTable(operatorCycles, operatorTimeTracking) {
    const panel = document.getElementById('operatorCyclesPanel');
    if (!panel) return;

    if (!operatorCycles || operatorCycles.size === 0) {
        panel.innerHTML = `
            <div class="no-connections-message">
                <i class="fas fa-users-cog"></i>
                <p>Aguardando execução...</p>
            </div>
        `;
        return;
    }

    // Ordenar por nome do operador
    const sortedOperators = Array.from(operatorCycles.entries())
        .sort(([idA], [idB]) => {
            const nameA = (resources.find(r => r.id === idA)?.name || idA).toLowerCase();
            const nameB = (resources.find(r => r.id === idB)?.name || idB).toLowerCase();
            return nameA.localeCompare(nameB);
        });

    const wrapper = document.createElement('div');
    wrapper.className = 'operator-cards-wrapper';

    sortedOperators.forEach(([operatorId, count]) => {
        const operator = resources.find(r => r.id === operatorId);
        const operatorName = operator?.name || `Operador ${operatorId}`;
        const times = operatorTimeTracking?.get(operatorId) || null;
        const vaStr  = (times && times.valueAddedMs > 0)  ? formatCycleTime(times.valueAddedMs / 1000)  : '--';
        const nvaStr = (times && times.nonValueAddedMs > 0) ? formatCycleTime(times.nonValueAddedMs / 1000) : '--';
        const cycleTotal = times ? (times.valueAddedMs + times.nonValueAddedMs) / 1000 : 0;
        const cycleStr = cycleTotal > 0 ? formatCycleTime(cycleTotal) : '--';
        const distM = times ? ((times.totalDistanceCm || 0) * 2 / 100).toFixed(2) : '0.00';

        const card = document.createElement('div');
        card.className = 'operator-card';

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'operator-card-header';
        header.innerHTML = `<i class="fas fa-user-hard-hat"></i><span>${operatorName}</span>`;
        card.appendChild(header);

        // --- Seção: Métricas ---
        const metricsSection = document.createElement('div');
        metricsSection.className = 'operator-card-section-title';
        metricsSection.textContent = 'Métricas';
        card.appendChild(metricsSection);

        const metricsTable = document.createElement('table');
        metricsTable.className = 'data-table operator-card-table';
        metricsTable.innerHTML = `
            <tbody>
                <tr><td>Ciclos</td><td><strong>${count}</strong></td></tr>
                <tr><td>Distância Total</td><td>${distM} m</td></tr>
                <tr><td>Tempo de Ciclo</td><td>${cycleStr}</td></tr>
                <tr><td>T. Agrega</td><td class="metric-va">${vaStr}</td></tr>
                <tr><td>T. Não Agrega</td><td class="metric-nva">${nvaStr}</td></tr>
            </tbody>
        `;
        card.appendChild(metricsTable);

        // --- Seção: Análise de Conexões ---
        const connSection = document.createElement('div');
        connSection.className = 'operator-card-section-title';
        connSection.textContent = 'Análise de Conexões';
        card.appendChild(connSection);

        const connGroups = times?.connectionGroups || {};
        const connEntries = Object.entries(connGroups)
            .sort(([, a], [, b]) => b.totalDistanceCm - a.totalDistanceCm);

        if (connEntries.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'operator-card-empty';
            emptyDiv.textContent = 'Nenhum movimento registrado';
            card.appendChild(emptyDiv);
        } else {
            const connTable = document.createElement('table');
            connTable.className = 'data-table operator-card-table';
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>Recursos</th><th>Dist. (m)</th><th>Linhas</th></tr>';
            connTable.appendChild(thead);
            const tbody = document.createElement('tbody');
            let grandDist = 0;
            let grandCount = 0;
            connEntries.forEach(([pairKey, group]) => {
                grandDist += group.totalDistanceCm;
                grandCount += group.count;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${pairKey}</td>
                    <td>${(group.totalDistanceCm / 100).toFixed(2)}</td>
                    <td>${group.count}</td>
                `;
                tbody.appendChild(tr);
            });
            connTable.appendChild(tbody);
            const tfoot = document.createElement('tfoot');
            tfoot.innerHTML = `<tr><td>Total</td><td>${(grandDist / 100).toFixed(2)}</td><td>${grandCount}</td></tr>`;
            connTable.appendChild(tfoot);
            card.appendChild(connTable);
        }

        wrapper.appendChild(card);
    });

    panel.innerHTML = '';
    panel.appendChild(wrapper);
}

