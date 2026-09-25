/**
 * Sistema de Salvar e Carregar Layouts
 * Permite exportar/importar o estado completo da aplicação em arquivos JSON
 */

import { 
    movementAreas, walls, resources, freeLines,
    exclusionZones,
    setSelectedAreaId, setSelectedWallId, setSelectedResourceId,
    getConnections, setConnections,
    setSelectedConnectionId,
    setSelectedFreeLineId,
    setFreeLines,
    setExclusionZones,
    getFloorsSnapshot,
    applyFloorsSnapshot,
    createFloor,
    clearAllSelections,
    getCurrentFloorId
} from './state.js';
import { openings, setSelectedOpeningId } from './openings.js';
import { resetHistoryToCurrentState } from './history.js';
import { drawAll } from './drawing.js';
import { ensureAllAreasHaveNavMesh } from './navMeshBaker.js';
import { refreshNavMeshOptions } from './navmesh-controls.js';
import { updateConnectionDistancesTable } from './flow-metrics.js';
import { clearAllHubs, syncHubRegistryWithResources, serializeHubs, loadHubs } from './hubs.js';
import { clearPathCache, serializePathCache, loadPathCache } from './planner-path-cache.js';
import { resetPlannerData } from './product-planner.js';
import { reloadResourceImages } from './resource-image.js';
import { showConfirmDialog, showToast } from './ui-shell.js';
import { setActiveTool } from './active_tool.js';
import { getLayoutTitle, setLayoutTitle } from './layout-metadata.js';

const AUTO_SAVE_KEY = 'gregorios-cad-autosave-v1';
const AUTO_SAVE_DELAY_MS = 650;
let autoSaveTimer = null;
let autoSaveInitialized = false;
let autoSaveRestoreInProgress = false;

function updateAutoSaveStatus(message, state = 'saved') {
    const status = document.getElementById('autoSaveStatus');
    if (!status) return;
    status.dataset.state = state;
    const label = status.querySelector('span');
    if (label) label.textContent = message;
}

// --- Sistema de Loading Overlay ---

let loadingOverlay = null;
let loadingProgressBar = null;
let loadingStatusText = null;

/**
 * Cria e exibe o overlay de carregamento
 */
function showLoadingOverlay(message = 'Carregando...') {
    if (loadingOverlay) {
        updateLoadingStatus(message, 0);
        return;
    }

    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-status"></div>
            <div class="loading-progress-container">
                <div class="loading-progress-bar"></div>
            </div>
            <div class="loading-hint">Por favor, aguarde...</div>
        </div>
    `;

    // Estilos inline para garantir funcionamento imediato
    Object.assign(loadingOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '99999',
        backdropFilter: 'blur(4px)'
    });

    const content = loadingOverlay.querySelector('.loading-content');
    Object.assign(content.style, {
        textAlign: 'center',
        color: 'white',
        padding: '40px',
        borderRadius: '16px',
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        minWidth: '320px'
    });

    const spinner = loadingOverlay.querySelector('.loading-spinner');
    Object.assign(spinner.style, {
        width: '48px',
        height: '48px',
        border: '4px solid rgba(99, 102, 241, 0.3)',
        borderTop: '4px solid #6366f1',
        borderRadius: '50%',
        margin: '0 auto 20px',
        animation: 'spin 1s linear infinite'
    });

    loadingStatusText = loadingOverlay.querySelector('.loading-status');
    Object.assign(loadingStatusText.style, {
        fontSize: '18px',
        fontWeight: '600',
        marginBottom: '16px',
        color: '#e2e8f0'
    });
    loadingStatusText.textContent = message;

    const progressContainer = loadingOverlay.querySelector('.loading-progress-container');
    Object.assign(progressContainer.style, {
        width: '100%',
        height: '8px',
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '12px'
    });

    loadingProgressBar = loadingOverlay.querySelector('.loading-progress-bar');
    Object.assign(loadingProgressBar.style, {
        width: '0%',
        height: '100%',
        backgroundColor: '#6366f1',
        borderRadius: '4px',
        transition: 'width 0.3s ease'
    });

    const hint = loadingOverlay.querySelector('.loading-hint');
    Object.assign(hint.style, {
        fontSize: '13px',
        color: '#94a3b8'
    });

    // Adicionar keyframes para animação do spinner
    if (!document.getElementById('loadingSpinnerStyles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'loadingSpinnerStyles';
        styleSheet.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(styleSheet);
    }

    document.body.appendChild(loadingOverlay);
}

/**
 * Atualiza o status e progresso do carregamento
 */
function updateLoadingStatus(message, progress = null) {
    if (loadingStatusText) {
        loadingStatusText.textContent = message;
    }
    if (loadingProgressBar && progress !== null) {
        loadingProgressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
}

/**
 * Esconde e remove o overlay de carregamento
 */
function hideLoadingOverlay() {
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        loadingOverlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            if (loadingOverlay && loadingOverlay.parentNode) {
                document.body.removeChild(loadingOverlay);
            }
            loadingOverlay = null;
            loadingProgressBar = null;
            loadingStatusText = null;
        }, 300);
    }
}

/**
 * Permite que o navegador atualize a UI (evita "página não respondendo")
 * Usa requestAnimationFrame para garantir renderização
 */
function yieldToMain() {
    return new Promise(resolve => {
        // Usar scheduler.yield se disponível (API moderna)
        if ('scheduler' in window && 'yield' in window.scheduler) {
            window.scheduler.yield().then(resolve);
        } else {
            // Fallback: requestAnimationFrame + setTimeout
            requestAnimationFrame(() => {
                setTimeout(resolve, 0);
            });
        }
    });
}

/**
 * Delay mais longo para operações muito pesadas
 * Garante que o overlay seja renderizado antes da operação
 */
function longYield(ms = 50) {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            setTimeout(resolve, ms);
        });
    });
}

/**
 * Parse JSON usando Web Worker (não bloqueia thread principal)
 */
function parseJSONInWorker(jsonString) {
    return new Promise((resolve, reject) => {
        // Criar worker inline para evitar problemas de CORS
        const workerCode = `
            self.onmessage = function(e) {
                try {
                    const parsed = JSON.parse(e.data);
                    self.postMessage({ success: true, result: parsed });
                } catch (error) {
                    self.postMessage({ success: false, error: error.message });
                }
            };
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        
        worker.onmessage = function(e) {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            
            if (e.data.success) {
                resolve(e.data.result);
            } else {
                reject(new Error(e.data.error));
            }
        };
        
        worker.onerror = function(error) {
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            reject(error);
        };
        
        worker.postMessage(jsonString);
    });
}

/**
 * Fallback para parse JSON síncrono (caso Worker falhe)
 */
async function parseJSONWithFallback(jsonString) {
    try {
        // Tentar usar Web Worker primeiro
        return await parseJSONInWorker(jsonString);
    } catch (workerError) {
        console.warn('Web Worker não disponível, usando fallback síncrono:', workerError);
        // Fallback: dar uma pausa antes do parse síncrono
        await longYield(100);
        return JSON.parse(jsonString);
    }
}

/**
 * Cria um snapshot completo do estado atual para salvar
 */
export function createSaveSnapshot() {
    const floorsSnapshot = getFloorsSnapshot();
    const currentFloorId = getCurrentFloorId();
    const pathCacheData = serializePathCache();
    
    return {
        version: "1.2.0",
        timestamp: new Date().toISOString(),
        data: {
            layoutTitle: getLayoutTitle(),
            floors: floorsSnapshot,
            currentFloorId,
            areas: JSON.parse(JSON.stringify(movementAreas)),
            walls: JSON.parse(JSON.stringify(walls)),
            resources: JSON.parse(JSON.stringify(resources)),
            freeLines: JSON.parse(JSON.stringify(freeLines)),
            exclusionZones: JSON.parse(JSON.stringify(exclusionZones)),
            openings: JSON.parse(JSON.stringify(openings)),
            connections: JSON.parse(JSON.stringify(getConnections())),
            hubs: serializeHubs(),
            // Cache de rotas do planner (seção 5.7 do TEC_SPEC)
            layoutHash: pathCacheData.layoutHash,
            pathCache: pathCacheData.pathCache,
            nextAreaId: window.nextAreaId || 1,
            nextWallId: window.nextWallId || 1,
            nextResourceId: window.nextResourceId || 1,
            nextOpeningId: window.nextOpeningId || 1
        }
    };
}

/**
 * Salva o layout atual em um arquivo JSON
 */
export function saveLayout() {
    try {
        const snapshot = createSaveSnapshot();
        const jsonString = JSON.stringify(snapshot, null, 2);
        
        // Criar nome do arquivo com timestamp
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                         now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const titleSlug = getLayoutTitle()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
        const filename = `${titleSlug || 'layout'}_${timestamp}.json`;
        
        // Salvar layout
        downloadFile(jsonString, filename);
        
        // Mostrar feedback visual
        showSaveSuccess(filename);
        
    } catch (error) {
        console.error('❌ Erro ao salvar layout:', error);
        showSaveError('Erro ao salvar o layout. Verifique o console para mais detalhes.');
    }
}

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.style.display = 'none';
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    URL.revokeObjectURL(url);
}

/**
 * Carrega um layout de um arquivo JSON
 */
export function loadLayout() {
    try {
        // Criar input file invisível
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.onchange = function(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            // Mostrar overlay IMEDIATAMENTE
            showLoadingOverlay('Preparando...');
            
            // Usar múltiplos frames para GARANTIR que o overlay é renderizado
            // antes de qualquer operação pesada
            requestAnimationFrame(() => {
                // Primeiro frame: overlay foi adicionado ao DOM
                requestAnimationFrame(() => {
                    // Segundo frame: overlay foi pintado
                    setTimeout(async () => {
                        // Pequeno delay adicional para garantir renderização
                        try {
                            updateLoadingStatus('Lendo arquivo...', 5);
                            await longYield(100); // Dar tempo para UI
                            
                            // Ler arquivo como texto
                            const fileText = await readFileAsText(file);
                            
                            updateLoadingStatus('Interpretando dados...', 15);
                            await longYield(100); // Garantir UI antes do parsing
                            
                            // Usar Web Worker para parsing (não bloqueia UI)
                            const jsonData = await parseJSONWithFallback(fileText);
                            
                            updateLoadingStatus('Carregando layout...', 25);
                            await longYield(50);
                            
                            await loadFromSnapshotAsync(jsonData);
                        } catch (parseError) {
                            console.error('❌ Erro ao interpretar arquivo JSON:', parseError);
                            hideLoadingOverlay();
                            showLoadError('Arquivo JSON inválido. Verifique se o arquivo não está corrompido.');
                        }
                    }, 50); // 50ms extra para garantir
                });
            });
        };
        
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
        
    } catch (error) {
        console.error('❌ Erro ao carregar layout:', error);
        hideLoadingOverlay();
        showLoadError('Erro ao carregar o layout. Verifique o console para mais detalhes.');
    }
}

/**
 * Lê um arquivo como texto usando Promise
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsText(file);
    });
}

/**
 * Carrega dados de um snapshot (versão assíncrona com progresso)
 */
export async function loadFromSnapshotAsync(snapshot, options = {}) {
    const { automatic = false } = options;
    try {
        // Verificar estrutura básica
        if (!snapshot.data || typeof snapshot.data !== 'object') {
            throw new Error('Estrutura de dados inválida');
        }
        
        const data = snapshot.data;
        setLayoutTitle(data.layoutTitle || '', { notify: false });
        
        updateLoadingStatus('Limpando roteiro anterior...', 28);
        await yieldToMain();
        
        // Resetar roteiro do planner para evitar dados órfãos
        if (!automatic) resetPlannerData();
        
        updateLoadingStatus('Limpando seleções...', 30);
        await yieldToMain();
        
        // Limpar seleções
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedResourceId(null);
        setSelectedOpeningId(null);
        setSelectedConnectionId(null);
        setSelectedFreeLineId(null);
        
        updateLoadingStatus('Carregando estrutura de dados...', 35);
        await yieldToMain();
        
        if (Array.isArray(data.floors) && data.floors.length > 0) {
            // Processar floors de forma assíncrona para não bloquear
            updateLoadingStatus(`Processando ${data.floors.length} pavimentos...`, 38);
            await longYield(100); // Garantir que overlay está visível
            
            // Aplicar snapshot de floors (operação pesada)
            applyFloorsSnapshot(data.floors, data.currentFloorId);
            await longYield(50);
            
            updateLoadingStatus('Gerando NavMesh inicial...', 50);
            await longYield(50);
            
            // Gerar NavMesh com yields entre cada área
            for (let i = 0; i < movementAreas.length; i++) {
                updateLoadingStatus(`Gerando NavMesh (${i + 1}/${movementAreas.length})...`, 50 + (i / movementAreas.length) * 10);
                await longYield(30); // Dar tempo ao browser entre cada área
            }
            
            ensureAllAreasHaveNavMesh(movementAreas);
            refreshNavMeshOptions();
        } else {
            // Carregamento legado (um único pavimento)
            updateLoadingStatus('Limpando dados anteriores...', 40);
            await yieldToMain();
            
            movementAreas.length = 0;
            walls.length = 0;
            resources.length = 0;
            openings.length = 0;
            setConnections([]);
            setFreeLines([]);
            setExclusionZones([]);

            updateConnectionDistancesTable();

            if (Array.isArray(data.areas)) {
                updateLoadingStatus(`Carregando ${data.areas.length} áreas...`, 45);
                await yieldToMain();
                
                // Carregar áreas em chunks pequenos para não bloquear
                for (let i = 0; i < data.areas.length; i++) {
                    movementAreas.push(data.areas[i]);
                    // Yield a cada 2 áreas para manter UI responsiva
                    if (i % 2 === 0) {
                        updateLoadingStatus(`Carregando áreas (${i + 1}/${data.areas.length})...`, 45 + (i / data.areas.length) * 5);
                        await yieldToMain();
                    }
                }
                
                updateLoadingStatus('Gerando NavMesh...', 52);
                await yieldToMain();
                
                ensureAllAreasHaveNavMesh(movementAreas);
                refreshNavMeshOptions();
            }

            if (Array.isArray(data.walls)) {
                updateLoadingStatus(`Carregando ${data.walls.length} paredes...`, 55);
                await yieldToMain();
                
                // Carregar paredes em chunks
                for (let i = 0; i < data.walls.length; i++) {
                    walls.push(data.walls[i]);
                    if (i % 5 === 0) {
                        await yieldToMain();
                    }
                }
            }

            if (Array.isArray(data.resources)) {
                updateLoadingStatus(`Carregando ${data.resources.length} recursos...`, 60);
                await yieldToMain();
                
                // Carregar recursos em chunks pequenos
                for (let i = 0; i < data.resources.length; i++) {
                    resources.push(data.resources[i]);
                    // Yield a cada 3 recursos
                    if (i % 3 === 0) {
                        updateLoadingStatus(`Carregando recursos (${i + 1}/${data.resources.length})...`, 60 + (i / data.resources.length) * 5);
                        await yieldToMain();
                    }
                }
            }

            if (Array.isArray(data.freeLines)) {
                updateLoadingStatus('Carregando linhas livres...', 67);
                await yieldToMain();
                setFreeLines(data.freeLines);
            }

            if (Array.isArray(data.exclusionZones)) {
                updateLoadingStatus('Carregando zonas de exclusão...', 68);
                await yieldToMain();
                setExclusionZones(data.exclusionZones);
            }

            if (Array.isArray(data.openings)) {
                updateLoadingStatus('Carregando aberturas...', 70);
                await yieldToMain();
                openings.push(...data.openings);
            }

            if (Array.isArray(data.connections)) {
                updateLoadingStatus(`Carregando ${data.connections.length} conexões...`, 73);
                await yieldToMain();
                setConnections(data.connections);
            }
        }

        updateLoadingStatus('Atualizando tabela de conexões...', 76);
        await yieldToMain();
        
        // Atualizar tabela de conexões após carregar dados
        updateConnectionDistancesTable();
        
        updateLoadingStatus('Sincronizando hubs...', 78);
        await yieldToMain();
        
        syncHubRegistryWithResources({ skipRedraw: true });

        if (Array.isArray(data.hubs)) {
            updateLoadingStatus(`Carregando ${data.hubs.length} hubs...`, 80);
            await yieldToMain();
            loadHubs(data.hubs);
        }
        
        // Carregar cache de rotas do planner (seção 5.7 do TEC_SPEC)
        if (data.layoutHash && data.pathCache) {
            updateLoadingStatus('Carregando cache de rotas...', 83);
            await yieldToMain();
            
            const cacheLoaded = loadPathCache({
                layoutHash: data.layoutHash,
                pathCache: data.pathCache
            });
            if (cacheLoaded) {
            }
        }
        
        updateLoadingStatus('Restaurando IDs...', 85);
        await yieldToMain();

        // Pré-carregar imagens coladas nos recursos
        await reloadResourceImages(resources);

        // Restaurar IDs sequenciais
        if (data.nextAreaId) window.nextAreaId = data.nextAreaId;
        if (data.nextWallId) window.nextWallId = data.nextWallId;
        if (data.nextResourceId) window.nextResourceId = data.nextResourceId;
        if (data.nextOpeningId) window.nextOpeningId = data.nextOpeningId;
        
        updateLoadingStatus('Inicializando histórico...', 87);
        await yieldToMain();
        
        resetHistoryToCurrentState(automatic ? 'Projeto recuperado' : 'Layout carregado');
        
        updateLoadingStatus('Regenerando NavMesh completo...', 90);
        await longYield(100); // Garantir que overlay está atualizado
        
        // Regerar NavMesh para todas as áreas carregadas
        const navMeshModule = await import('./navMeshBaker.js');
        const { bakeNavigationMesh } = navMeshModule;
        
        let totalNodes = 0;
        for (let i = 0; i < movementAreas.length; i++) {
            const area = movementAreas[i];
            updateLoadingStatus(`Regenerando NavMesh (${i + 1}/${movementAreas.length})...`, 90 + (i / movementAreas.length) * 8);
            await longYield(50); // Dar tempo ao browser antes de cada bake pesado
            
            bakeNavigationMesh(area);
            if (area.navMesh && area.navMesh.nodes) {
                totalNodes += area.navMesh.nodes.size;
            }
            
            await yieldToMain(); // Yield adicional após cada bake
        }
        
        updateLoadingStatus('Finalizando...', 98);
        await yieldToMain();
        
        // Recalcular caminhos de conexões (define isFallback corretamente)
        const { updateAllConnectionPaths } = await import('./connections/connectionCore.js');
        updateAllConnectionPaths();
        
        // Redesenhar após rebake
        drawAll();
        
        // Centralizar vista
        if (window.centerView) {
            setTimeout(() => window.centerView(), 50);
        }
        
        // Atualizar opções de NavMesh após carregar
        if (window.refreshNavMeshOptions) {
            setTimeout(() => window.refreshNavMeshOptions(), 300);
        }
        
        updateLoadingStatus('Concluído!', 100);
        await yieldToMain();
        
        // Esconder overlay e mostrar sucesso
        setTimeout(() => {
            hideLoadingOverlay();
            if (automatic) {
                showNotification('Projeto recuperado automaticamente.', 'success', 2600);
                updateAutoSaveStatus('Projeto recuperado', 'saved');
            } else {
                showLoadSuccess(data);
            }
        }, automatic ? 0 : 500);
        return true;

    } catch (error) {
        console.error('❌ Erro ao carregar snapshot:', error);
        hideLoadingOverlay();
        showLoadError(`Erro ao carregar dados: ${error.message}`);
        return false;
    }
}

/**
 * Carrega dados de um snapshot (versão síncrona - mantida para compatibilidade)
 */
function loadFromSnapshot(snapshot) {
    loadFromSnapshotAsync(snapshot);
}

/**
 * Mostra mensagem de sucesso ao salvar
 */
function showSaveSuccess(filename) {
    showNotification(`✅ Layout salvo como: ${filename}`, 'success', 3000);
}

/**
 * Mostra mensagem de erro ao salvar
 */
function showSaveError(message) {
    showNotification(`❌ ${message}`, 'error', 5000);
}

/**
 * Mostra mensagem de sucesso ao carregar
 */
function showLoadSuccess(data) {
    const count = (data.areas?.length || 0) + (data.walls?.length || 0) + 
                  (data.resources?.length || 0) + (data.openings?.length || 0);
    showNotification(`✅ Layout carregado com ${count} elementos`, 'success', 3000);
}

/**
 * Mostra mensagem de erro ao carregar
 */
function showLoadError(message) {
    showNotification(`❌ ${message}`, 'error', 5000);
}

/**
 * Sistema de notificações visuais
 */
function showNotification(message, type = 'info', duration = 3000) {
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Estilos inline para garantir funcionamento
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%) translateY(-100%)',
        padding: '12px 24px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '500',
        fontSize: '14px',
        zIndex: '10000',
        transition: 'transform 0.3s ease',
        maxWidth: '400px',
        wordWrap: 'break-word',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    
    // Cores baseadas no tipo
    if (type === 'success') {
        notification.style.backgroundColor = '#10b981';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#ef4444';
    } else {
        notification.style.backgroundColor = '#ff6b00';
    }
    
    // Adicionar ao DOM
    document.body.appendChild(notification);
    
    // Animar entrada
    setTimeout(() => {
        notification.style.transform = 'translateX(-50%) translateY(0)';
    }, 100);
    
    // Remover após duração
    setTimeout(() => {
        notification.style.transform = 'translateX(-50%) translateY(-100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, duration);
}

/**
 * Inicializa os event listeners para os botões de salvar/carregar
 */
export function initializeSaveLoad() {
    const newBtn = document.getElementById('newLayoutBtn');
    const saveBtn = document.getElementById('saveLayoutBtn');
    const loadBtn = document.getElementById('loadLayoutBtn');

    if (newBtn) {
        newBtn.addEventListener('click', async () => {
            const confirmed = await showConfirmDialog({
                title: 'Criar novo layout?',
                message: 'Todo o desenho atual, pavimentos e roteiro serão apagados. Salve o arquivo antes se quiser manter uma cópia.',
                confirmLabel: 'Apagar e começar',
                danger: true
            });
            if (confirmed) createNewLayout();
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', saveLayout);
    } else {
        console.warn('⚠️  Botão Salvar não encontrado');
    }
    
    if (loadBtn) {
        loadBtn.addEventListener('click', loadLayout);
    } else {
        console.warn('⚠️  Botão Carregar não encontrado');
    }
}

export function createNewLayout() {
    clearTimeout(autoSaveTimer);
    applyFloorsSnapshot([]);
    createFloor({ name: 'Térreo', makeActive: true });
    clearAllSelections('new-layout');
    clearAllHubs({ includeConnection: true });
    clearPathCache();
    resetPlannerData();
    setActiveTool(null);
    setLayoutTitle('', { notify: false });
    try {
        localStorage.removeItem('plannerData');
        localStorage.removeItem(AUTO_SAVE_KEY);
    } catch {
        // O novo layout continua funcional mesmo sem armazenamento local.
    }
    window.nextAreaId = 1;
    window.nextWallId = 1;
    window.nextResourceId = 1;
    window.nextOpeningId = 1;
    refreshNavMeshOptions();
    updateConnectionDistancesTable();
    resetHistoryToCurrentState('Novo layout');
    drawAll();
    persistLayoutToBrowser();
    showToast('Novo layout criado.', 'success');
}

export function persistLayoutToBrowser() {
    if (autoSaveRestoreInProgress) return false;
    try {
        const snapshot = createSaveSnapshot();
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(snapshot));
        updateAutoSaveStatus('Salvo agora', 'saved');
        return true;
    } catch (error) {
        console.warn("[Gregório's CAD] Não foi possível salvar automaticamente:", error);
        updateAutoSaveStatus('Falha ao salvar', 'error');
        return false;
    }
}

export function scheduleAutoSave() {
    if (!autoSaveInitialized || autoSaveRestoreInProgress) return;
    clearTimeout(autoSaveTimer);
    updateAutoSaveStatus('Salvando…', 'saving');
    autoSaveTimer = setTimeout(persistLayoutToBrowser, AUTO_SAVE_DELAY_MS);
}

export async function restoreAutoSavedLayout() {
    let stored = null;
    try {
        stored = localStorage.getItem(AUTO_SAVE_KEY);
    } catch (error) {
        console.warn("[Gregório's CAD] Armazenamento local indisponível:", error);
    }
    if (!stored) return false;

    try {
        const snapshot = JSON.parse(stored);
        autoSaveRestoreInProgress = true;
        updateAutoSaveStatus('Recuperando projeto…', 'saving');
        return await loadFromSnapshotAsync(snapshot, { automatic: true });
    } catch (error) {
        console.warn("[Gregório's CAD] Salvamento automático inválido:", error);
        updateAutoSaveStatus('Recuperação indisponível', 'error');
        return false;
    } finally {
        autoSaveRestoreInProgress = false;
    }
}

export function initializeAutoSave() {
    if (autoSaveInitialized) return;
    autoSaveInitialized = true;
    const schedule = () => scheduleAutoSave();
    window.addEventListener('layoutChange', schedule);
    window.addEventListener('gregorios:history-change', schedule);
    document.addEventListener('change', schedule);
    window.addEventListener('pagehide', persistLayoutToBrowser);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persistLayoutToBrowser();
    });
    updateAutoSaveStatus('Salvamento automático ativo', 'saved');
}
