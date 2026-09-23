// Sistema de histórico para undo/redo
import { 
    movementAreas, walls, resources, freeLines,
    exclusionZones,
    selectedAreaId, selectedWallId, selectedResourceId, selectedFreeLineId,
    setSelectedAreaId, setSelectedWallId, setSelectedResourceIds, setSelectedFreeLineId,
    getSelectedResourceIds,
    getConnections, setConnections, getSelectedConnectionId, setSelectedConnectionId,
    setFreeLines,
    setExclusionZones,
    getFloorsSnapshot,
    applyFloorsSnapshot,
    getCurrentFloorId
} from './state.js';
import { 
    openings,
    getSelectedOpeningId, setSelectedOpeningId 
} from './openings.js';
import { drawAll } from './drawing.js';
import { ensureAllAreasHaveNavMesh } from './navMeshBaker.js';

// Configurações do histórico
const MAX_HISTORY_SIZE = 50; // Máximo de estados salvos

// Estado do histórico
let history = [];
let currentHistoryIndex = -1;
let isUndoRedoOperation = false; // Flag para evitar salvar durante undo/redo

/**
 * Cria um snapshot completo do estado atual da aplicação
 * @returns {Object} Estado serializado
 */
function createStateSnapshot() {
    return {
        timestamp: Date.now(),
        movementAreas: JSON.parse(JSON.stringify(movementAreas)),
        walls: JSON.parse(JSON.stringify(walls)),
        openings: JSON.parse(JSON.stringify(openings)),
        resources: JSON.parse(JSON.stringify(resources)),
    freeLines: JSON.parse(JSON.stringify(freeLines)),
    exclusionZones: JSON.parse(JSON.stringify(exclusionZones)),
        connections: JSON.parse(JSON.stringify(getConnections())),
        selectedAreaId: selectedAreaId,
        selectedWallId: selectedWallId,
        selectedResourceId: selectedResourceId,
        selectedResourceIds: getSelectedResourceIds(),
    selectedOpeningId: getSelectedOpeningId(),
    selectedConnectionId: getSelectedConnectionId(),
    selectedFreeLineId: selectedFreeLineId,
        floors: getFloorsSnapshot(),
        currentFloorId: getCurrentFloorId()
    };
}

/**
 * Restaura um estado da aplicação
 * @param {Object} state - Estado a ser restaurado
 */
function restoreState(state) {
    isUndoRedoOperation = true;
    
    try {
        let usedFloorSnapshot = false;

        if (Array.isArray(state.floors) && state.floors.length > 0) {
            usedFloorSnapshot = true;
            applyFloorsSnapshot(state.floors, state.currentFloorId);
        } else {
            // Limpar arrays atuais
            movementAreas.length = 0;
            walls.length = 0;
            openings.length = 0;
            resources.length = 0;

            // Restaurar arrays legados
            movementAreas.push(...(state.movementAreas || []));
            walls.push(...(state.walls || []));
            openings.push(...(state.openings || []));
            resources.push(...(state.resources || []));
            setFreeLines(state.freeLines || []);
            setExclusionZones(state.exclusionZones || []);
        }

        // Gerar NavMesh para as áreas do pavimento ativo
        ensureAllAreasHaveNavMesh(movementAreas);

        if (!usedFloorSnapshot) {
            // Restaurar conexões (compatibilidade)
            if (state.connections) {
                setConnections(state.connections);
            } else {
                setConnections([]);
            }
        }
        
        // Restaurar seleções
        setSelectedAreaId(state.selectedAreaId);
        setSelectedWallId(state.selectedWallId);
        setSelectedResourceIds(
            Array.isArray(state.selectedResourceIds) ? state.selectedResourceIds :
                state.selectedResourceId !== null && state.selectedResourceId !== undefined
                    ? [state.selectedResourceId]
                    : [],
            state.selectedResourceId
        );
        setSelectedFreeLineId(state.selectedFreeLineId || null);
        setSelectedOpeningId(state.selectedOpeningId);
        
        // Restaurar seleção de conexão (com verificação de compatibilidade)
        if (state.selectedConnectionId !== undefined) {
            setSelectedConnectionId(state.selectedConnectionId);
        } else {
            setSelectedConnectionId(null);
        }
        
        // Redesenhar
        drawAll();
        
        // Atualizar botões
        updateHistoryButtons();
        
    } finally {
        isUndoRedoOperation = false;
    }
}

// Controle para evitar salvamentos simultâneos
let isSavingState = false;
let pendingSave = null;

/**
 * Salva o estado atual no histórico
 * @param {string} description - Descrição da ação realizada
 */
export function saveStateToHistory(description = '') {
    // Não salvar durante operações de undo/redo
    if (isUndoRedoOperation) {
        return;
    }
    
    // Se já estamos salvando, agendar para depois
    if (isSavingState) {
        pendingSave = { description, timestamp: Date.now() };
        return;
    }
    
    // Marcar que estamos salvando
    isSavingState = true;
    
    // Usar setTimeout para garantir que cada salvamento aconteça em seu próprio ciclo
    setTimeout(() => {
        try {
            const snapshot = createStateSnapshot();
            snapshot.description = description;
            
            // Remove estados futuros se estamos no meio do histórico
            if (currentHistoryIndex < history.length - 1) {
                history = history.slice(0, currentHistoryIndex + 1);
            }
            
            // Adiciona novo estado
            history.push(snapshot);
            currentHistoryIndex++;
            
            // Limita o tamanho do histórico
            if (history.length > MAX_HISTORY_SIZE) {
                history.shift();
                currentHistoryIndex--;
            }
            
            updateHistoryButtons();
            
            
        } finally {
            // Liberar o lock
            isSavingState = false;
            
            // Se havia um salvamento pendente, executar agora
            if (pendingSave) {
                const pending = pendingSave;
                pendingSave = null;
                // Executar com um pequeno delay para garantir separação
                setTimeout(() => saveStateToHistory(pending.description), 10);
            }
        }
    }, 0);
}

/**
 * Executa undo (desfazer)
 */
export function undo() {
    if (!canUndo()) {
        console.warn('[History] Não é possível desfazer - não há estados anteriores');
        return false;
    }
    
    currentHistoryIndex--;
    const state = history[currentHistoryIndex];
    
    restoreState(state);
    
    return true;
}

/**
 * Executa redo (refazer)
 */
export function redo() {
    if (!canRedo()) {
        console.warn('[History] Não é possível refazer - não há estados posteriores');
        return false;
    }
    
    currentHistoryIndex++;
    const state = history[currentHistoryIndex];
    
    restoreState(state);
    
    return true;
}

/**
 * Verifica se é possível fazer undo
 * @returns {boolean}
 */
export function canUndo() {
    return currentHistoryIndex > 0;
}

/**
 * Verifica se é possível fazer redo
 * @returns {boolean}
 */
export function canRedo() {
    return currentHistoryIndex < history.length - 1;
}

/**
 * Atualiza o estado dos botões de undo/redo
 */
function updateHistoryButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) {
        undoBtn.disabled = !canUndo();
        undoBtn.title = canUndo() 
            ? `Desfazer: ${history[currentHistoryIndex - 1]?.description || 'Ação anterior'}`
            : 'Desfazer (não disponível)';
    }
    
    if (redoBtn) {
        redoBtn.disabled = !canRedo();
        redoBtn.title = canRedo() 
            ? `Refazer: ${history[currentHistoryIndex + 1]?.description || 'Próxima ação'}`
            : 'Refazer (não disponível)';
    }
}

/**
 * Limpa todo o histórico
 */
export function clearHistory() {
    history = [];
    currentHistoryIndex = -1;
    updateHistoryButtons();
}

/**
 * Inicializa o sistema de histórico
 */
export function initializeHistory() {
    // Salvar estado inicial
    saveStateToHistory('Estado inicial');
    
    // Configurar event listeners para os botões
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) {
        undoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            undo();
        });
    }
    
    if (redoBtn) {
        redoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            redo();
        });
    }
    
    // Configurar atalhos de teclado
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z para undo
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Y ou Ctrl+Shift+Z para redo
        else if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
            e.preventDefault();
            redo();
        }
    });
    
}

/**
 * Obtém informações sobre o histórico atual
 * @returns {Object} Informações do histórico
 */
export function getHistoryInfo() {
    return {
        totalStates: history.length,
        currentIndex: currentHistoryIndex,
        canUndo: canUndo(),
        canRedo: canRedo(),
        currentDescription: history[currentHistoryIndex]?.description || 'Sem descrição',
        nextUndoDescription: history[currentHistoryIndex - 1]?.description || null,
        nextRedoDescription: history[currentHistoryIndex + 1]?.description || null
    };
}

// Exportar a função updateHistoryButtons para uso externo se necessário
export { updateHistoryButtons };
