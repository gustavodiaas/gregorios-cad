import { resources, getCurrentFloorId, getFloorById, getAllFloors, getFloorsMeta } from './state.js';
import { playPlanner, stopPlanner, isPlannerPlaying, setPlannerSpeed } from './planner-animator.js';
import { hubs } from './hubs.js';

const ACTION_OPTIONS = [
    { value: 'parado', label: 'Parado', hint: 'Operador fica parado no destino pelo tempo definido' },
    { value: 'mover para', label: 'Mover para', hint: 'Operador caminha até o hub de destino' },
    { value: 'mover acabado para', label: 'Mover acabado para', hint: 'Pega 1 acabado do estoque do hub atual (aguarda se vazio), carrega e deposita no hub de destino' },
    { value: 'criar acabado', label: 'Criar acabado', hint: 'Cria 1 acabado do nada, carrega e deposita no hub de destino (simula produção)' },
    { value: 'aguardar acabado', label: 'Aguardar acabado', hint: 'Fica parado no hub até que haja pelo menos 1 acabado no estoque, consome 1 e avança' }
];

const SPRITE_OPTIONS = [
    { value: 'stopped man.gif', label: 'Stopped Man' },
    { value: 'walking man.gif', label: 'Walking Man' },
    { value: 'working man.gif', label: 'Working Man' },
    { value: 'pallet man.gif', label: 'Pallet Man' }
];

const COLUMN_TYPES = [
    { value: 'acao', label: 'Ação' },
    { value: 'onde', label: 'Onde' },
    { value: 'sprite', label: 'Sprite quando chegar' },
    { value: 'tempo', label: 'Tempo (s)' }
];

const TIME_TYPE_OPTIONS = [
    { value: 'fixo', label: 'Tempo fixo (s)' },
    { value: 'entre', label: 'Tempo entre (s)' }
];

const STAGE_BLUEPRINT = ['acao', 'onde', 'sprite', 'tempo'];

// Paleta de cores padrão para camadas de operadores
const LAYER_COLOR_PALETTE = [
    '#6366f1', // Índigo
    '#f59e0b', // Âmbar
    '#10b981', // Esmeralda
    '#ef4444', // Vermelho
    '#3b82f6', // Azul
    '#ec4899', // Rosa
    '#8b5cf6', // Violeta
    '#14b8a6', // Teal
    '#f97316', // Laranja
    '#06b6d4', // Ciano
    '#84cc16', // Lima
    '#e11d48', // Rose
];

let plannerLayers = [];
let activeLayerId = null;
let layerCounter = 1;
let columnCounter = 1;
let columnsGridEl = null;
let emptyStateEl = null;
let productNameInputEl = null;
let columnCountEl = null;
let productName = '';
let layoutOperators = [];
let layoutHubs = [];
let isInitialized = false;
let draggedColumnIndex = null;
let dragOverColumnIndex = null;
let draggedLayerId = null;
let isLooping = false;
let totalAvailability = 0;
let totalAvailabilityInputEl = null;

// Schedule fields
let shiftStartInputEl = null;
let shiftEndInputEl = null;
let lunchStartInputEl = null;
let lunchEndInputEl = null;

/**
 * Converts a "HH:MM" string into total minutes from midnight.
 */
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

/**
 * Recalculates totalAvailability (in seconds) from the schedule fields:
 *   availability = (shiftEnd - shiftStart) - (lunchEnd - lunchStart)
 * All values clamped so availability is never negative.
 */
function recalcAvailability() {
    const shiftStart = timeToMinutes(shiftStartInputEl ? shiftStartInputEl.value : '07:00');
    const shiftEnd   = timeToMinutes(shiftEndInputEl   ? shiftEndInputEl.value   : '17:00');
    const lunchStart = timeToMinutes(lunchStartInputEl  ? lunchStartInputEl.value : '12:00');
    const lunchEnd   = timeToMinutes(lunchEndInputEl    ? lunchEndInputEl.value   : '13:00');

    const shiftMinutes = Math.max(0, shiftEnd - shiftStart);
    const lunchMinutes = Math.max(0, lunchEnd - lunchStart);
    const availableMinutes = Math.max(0, shiftMinutes - lunchMinutes);

    totalAvailability = availableMinutes * 60; // convert to seconds

    if (totalAvailabilityInputEl) {
        totalAvailabilityInputEl.value = totalAvailability;
    }
}

export function initializeProductPlanner() {
    if (isInitialized) return;
    
    columnsGridEl = document.getElementById('plannerColumnsGrid');
    emptyStateEl = document.getElementById('plannerEmptyState');
    productNameInputEl = document.getElementById('productNameInput');
    totalAvailabilityInputEl = document.getElementById('totalAvailabilityInput');
    shiftStartInputEl = document.getElementById('shiftStartInput');
    shiftEndInputEl = document.getElementById('shiftEndInput');
    lunchStartInputEl = document.getElementById('lunchStartInput');
    lunchEndInputEl = document.getElementById('lunchEndInput');
    columnCountEl = document.getElementById('columnCountLabel');

    const saveBtn = document.getElementById('savePlannerBtn');
    const addStageBtn = document.getElementById('addPlannerStageBtn');
    const addColumnBtn = document.getElementById('addPlannerColumnBtn');
    const toggleLoopingBtn = document.getElementById('toggleLoopingBtn');
    const clearBtn = document.getElementById('clearAllColumnsBtn');
    const playBtn = document.getElementById('playPlannerBtn');
    const stopBtn = document.getElementById('stopPlannerBtn');
    const headerPlayBtn = document.getElementById('headerPlayBtn');
    const headerStopBtn = document.getElementById('headerStopBtn');
    const headerSpeedSelect = document.getElementById('headerSpeedSelect');

    // Helper to sync buttons state
    const updatePlayButtonsState = (isPlaying) => {
        if (headerPlayBtn) headerPlayBtn.style.display = isPlaying ? 'none' : 'flex';
        if (headerStopBtn) headerStopBtn.style.display = isPlaying ? 'flex' : 'none';
        
        if (playBtn) playBtn.style.display = isPlaying ? 'none' : 'flex';
        if (stopBtn) stopBtn.style.display = isPlaying ? 'flex' : 'none';
    };

    // Listen for auto-stop event
    window.addEventListener('planner:stopped', () => {
        updatePlayButtonsState(false);
    });

    if (productNameInputEl) {
        productNameInputEl.addEventListener('input', (event) => {
            productName = event.target.value;
        });
    }

    if (totalAvailabilityInputEl) {
        // Availability is now read-only and auto-calculated
    }

    // Schedule field listeners – recalculate availability on any change
    [shiftStartInputEl, shiftEndInputEl, lunchStartInputEl, lunchEndInputEl].forEach(el => {
        if (el) {
            el.addEventListener('input', () => recalcAvailability());
        }
    });

    // Initial calculation
    recalcAvailability();

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            savePlannerData();
        });
    }

    const loadBtn = document.getElementById('loadPlannerBtn');
    const loadInput = document.getElementById('loadPlannerInput');

    if (loadBtn && loadInput) {
        loadBtn.addEventListener('click', () => {
            loadInput.click();
        });

        loadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    loadPlannerDataFromJSON(data);
                    alert('Roteiro carregado com sucesso!');
                } catch (error) {
                    console.error('Erro ao carregar roteiro:', error);
                    alert('Erro ao carregar roteiro. Verifique o arquivo.');
                }
            };
            reader.readAsText(file);
            loadInput.value = '';
        });
    }

    if (toggleLoopingBtn) {
        toggleLoopingBtn.addEventListener('click', () => {
            isLooping = !isLooping;
            toggleLoopingBtn.classList.toggle('active', isLooping);
            const span = toggleLoopingBtn.querySelector('span');
            if (span) {
                span.textContent = isLooping ? 'Looping: On' : 'Looping: Off';
            }
        });
    }
    
    if (playBtn) {
        playBtn.addEventListener('click', async () => {
            if (!plannerLayers.length || plannerLayers.every(l => l.columns.length === 0)) {
                alert('Configure o roteiro antes de executar');
                return;
            }
            updatePlayButtonsState(true);
            const shiftStartSec = timeToMinutes(shiftStartInputEl ? shiftStartInputEl.value : '07:00') * 60;
            const lunchStartSec = timeToMinutes(lunchStartInputEl ? lunchStartInputEl.value : '12:00') * 60;
            const lunchEndSec = timeToMinutes(lunchEndInputEl ? lunchEndInputEl.value : '13:00') * 60;
            await playPlanner(plannerLayers, productName, isLooping, totalAvailability, shiftStartSec, lunchStartSec, lunchEndSec);
        });
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            stopPlanner();
            updatePlayButtonsState(false);
        });
    }

    if (headerPlayBtn) {
        headerPlayBtn.addEventListener('click', async () => {
            if (!plannerLayers.length || plannerLayers.every(l => l.columns.length === 0)) {
                alert('Configure o roteiro antes de executar');
                return;
            }
            updatePlayButtonsState(true);
            const shiftStartSec = timeToMinutes(shiftStartInputEl ? shiftStartInputEl.value : '07:00') * 60;
            const lunchStartSec = timeToMinutes(lunchStartInputEl ? lunchStartInputEl.value : '12:00') * 60;
            const lunchEndSec = timeToMinutes(lunchEndInputEl ? lunchEndInputEl.value : '13:00') * 60;
            await playPlanner(plannerLayers, productName, isLooping, totalAvailability, shiftStartSec, lunchStartSec, lunchEndSec);
        });
    }

    if (headerStopBtn) {
        headerStopBtn.addEventListener('click', () => {
            stopPlanner();
            updatePlayButtonsState(false);
        });
    }

    if (headerSpeedSelect) {
        headerSpeedSelect.addEventListener('change', (e) => {
            setPlannerSpeed(e.target.value);
        });
    }

    if (addStageBtn) {
        // Botão Azul: Adicionar Nova Camada
        addStageBtn.addEventListener('click', () => {
            addNewLayer();
        });
    }

    if (addColumnBtn) {
        // Botão Verde: Adicionar Ação na Camada Ativa
        addColumnBtn.addEventListener('click', () => {
            addStageToActiveLayer();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar todas as colunas?')) {
                clearAllColumns();
            }
        });
    }

    if (columnsGridEl) {
        columnsGridEl.addEventListener('change', handleGridChange);
        columnsGridEl.addEventListener('input', handleGridInput);
        columnsGridEl.addEventListener('click', handleGridClick);
        columnsGridEl.addEventListener('dragstart', handleDragStart);
        columnsGridEl.addEventListener('dragover', handleDragOver);
        columnsGridEl.addEventListener('drop', handleDrop);
        columnsGridEl.addEventListener('dragend', handleDragEnd);

        // Fechar dropdowns de "onde" ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.onde-multiselect-container')) {
                document.querySelectorAll('.onde-dropdown-list').forEach(el => {
                    el.style.display = 'none';
                });
            }
        });

        // Stage number input: reorder on blur or Enter
        columnsGridEl.addEventListener('blur', (event) => {
            if (event.target.classList.contains('stage-number-input')) {
                handleStageNumberChange(event.target);
            }
        }, true); // use capture to catch blur on input inside grid

        columnsGridEl.addEventListener('keydown', (event) => {
            if (event.target.classList.contains('stage-number-input') && event.key === 'Enter') {
                event.preventDefault();
                event.target.blur(); // triggers the blur handler above
            }
        });
    }

    isInitialized = true;
    
    // Expor função global para ser chamada quando o sidebar abrir
    window.initializePlannerInSidebar = () => {
        loadLayoutData();
        // loadPlannerData(); // Removido carregamento automático
        ensureDefaultLayer();
        renderPlannerLayers();
    };
}

// Mapa de metadados de pavimento por recurso (evita mutar objetos originais)
const _resourceFloorMap = new Map(); // resourceId → { floorId, floorName }

function getResourceFloorInfo(resourceId) {
    return _resourceFloorMap.get(resourceId) || null;
}

function loadLayoutData() {
    try {
        // Coletar recursos de TODOS os pavimentos para suportar roteiros multi-andar
        const allFloors = getAllFloors() || [];
        let allResources = [];
        _resourceFloorMap.clear();

        if (allFloors.length > 0) {
            for (const floor of allFloors) {
                if (floor && Array.isArray(floor.resources)) {
                    for (const res of floor.resources) {
                        if (res) {
                            // Armazenar metadados em mapa separado (não mutar objetos originais)
                            _resourceFloorMap.set(res.id, {
                                floorId: floor.id,
                                floorName: floor.name
                            });
                        }
                    }
                    allResources = allResources.concat(floor.resources);
                }
            }
        }

        // Fallback: se nenhum pavimento retornou recursos, usar array local
        if (allResources.length === 0) {
            allResources = resources || [];
        }

        layoutOperators = allResources.filter(res => res && res.type === 'operator');
        layoutHubs = hubs || [];
        // console.log('[Planner] Operadores:', layoutOperators.length, 'Hubs:', layoutHubs.length, 'Pavimentos:', allFloors.length);
    } catch (error) {
        console.error('[Planner] Erro ao carregar dados do layout:', error);
    }
}

function ensureDefaultLayer() {
    if (plannerLayers.length === 0) {
        addNewLayer();
    }
}

function getNextLayerColor() {
    const usedColors = plannerLayers.map(l => l.color).filter(Boolean);
    // Encontrar a primeira cor da paleta que não está em uso
    for (const color of LAYER_COLOR_PALETTE) {
        if (!usedColors.includes(color)) return color;
    }
    // Se todas já foram usadas, gerar uma cor aleatória
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 55%)`;
}

function addNewLayer() {
    const layerId = `layer-${layerCounter++}`;
    const newLayer = {
        id: layerId,
        operatorId: '',
        color: getNextLayerColor(),
        columns: []
    };
    
    // Adicionar colunas iniciais
    STAGE_BLUEPRINT.forEach((type, index) => {
        const isFirstColumn = index === 0;
        newLayer.columns.push(createColumn(type, { locked: isFirstColumn }));
    });
    
    plannerLayers.push(newLayer);
    activeLayerId = layerId;
    renderPlannerLayers();
}

function addStageToActiveLayer() {
    if (!activeLayerId) {
        if (plannerLayers.length > 0) {
            activeLayerId = plannerLayers[0].id;
        } else {
            addNewLayer();
            return;
        }
    }
    
    const layer = plannerLayers.find(l => l.id === activeLayerId);
    if (!layer) return;
    
    const isFirstStage = layer.columns.length === 0;
    const stageColumns = STAGE_BLUEPRINT.map((type, index) => createColumn(type, {
        locked: isFirstStage && type === 'acao' && index === 0
    }));
    
    layer.columns = layer.columns.concat(stageColumns);
    renderPlannerLayers();

    // Scroll para o final da camada ativa
    setTimeout(() => {
        const activeLayerGrid = columnsGridEl.querySelector(`.planner-layer-container[data-layer-id="${activeLayerId}"] .planner-layer-grid`);
        if (activeLayerGrid) {
            activeLayerGrid.scrollLeft = activeLayerGrid.scrollWidth;
        }
    }, 0);
}

function createColumn(type, options = {}) {
    return {
        id: `planner-column-${columnCounter++}`,
        type,
        value: Object.prototype.hasOwnProperty.call(options, 'value') ? options.value : getDefaultValueForType(type),
        locked: Boolean(options.locked)
    };
}

function removePlannerColumn(columnId) {
    let targetLayer = null;
    let columnIndex = -1;
    
    for (const layer of plannerLayers) {
        const idx = layer.columns.findIndex(col => col.id === columnId);
        if (idx !== -1) {
            targetLayer = layer;
            columnIndex = idx;
            break;
        }
    }
    
    if (!targetLayer || columnIndex === -1) return;
    
    const column = targetLayer.columns[columnIndex];
    if (column.locked) return;

    let stageStartIndex = columnIndex;
    while (stageStartIndex > 0 && targetLayer.columns[stageStartIndex].type !== 'acao') {
        stageStartIndex--;
    }

    const stageColumns = targetLayer.columns.slice(stageStartIndex, stageStartIndex + STAGE_BLUEPRINT.length);
    if (stageColumns.length !== STAGE_BLUEPRINT.length) {
        console.warn('[Planner] Etapa incompleta detectada, ignorando remoção parcial');
        return;
    }

    const removedStageNumber = Math.floor(stageStartIndex / STAGE_BLUEPRINT.length) + 1;
    targetLayer.columns.splice(stageStartIndex, STAGE_BLUEPRINT.length);
    remapLoopTargetsAfterRemoval(targetLayer, removedStageNumber);
    renderPlannerLayers();
}

/**
 * Remove a complete stage (etapa) by its first column ID.
 * This is called from the trash button on the stage label.
 */
function removeStageByFirstColumnId(columnId) {
    let targetLayer = null;
    let columnIndex = -1;
    
    for (const layer of plannerLayers) {
        const idx = layer.columns.findIndex(col => col.id === columnId);
        if (idx !== -1) {
            targetLayer = layer;
            columnIndex = idx;
            break;
        }
    }
    
    if (!targetLayer || columnIndex === -1) return;
    
    // The columnId belongs to the first column of the stage
    const stageStartIndex = columnIndex;
    const stageColumns = targetLayer.columns.slice(stageStartIndex, stageStartIndex + STAGE_BLUEPRINT.length);
    if (stageColumns.length !== STAGE_BLUEPRINT.length) {
        console.warn('[Planner] Etapa incompleta detectada, ignorando remoção');
        return;
    }
    
    const removedStageNumber = Math.floor(stageStartIndex / STAGE_BLUEPRINT.length) + 1;
    targetLayer.columns.splice(stageStartIndex, STAGE_BLUEPRINT.length);
    remapLoopTargetsAfterRemoval(targetLayer, removedStageNumber);
    renderPlannerLayers();
}

/**
 * After removing a stage, update all loopTarget references in the same layer.
 * - If loopTarget pointed to the removed stage → reset to 0 (cleared)
 * - If loopTarget pointed to a stage after the removed one → decrement by 1
 * - If loopTarget pointed to a stage before the removed one → unchanged
 */
function remapLoopTargetsAfterRemoval(layer, removedStageNumber) {
    const totalStages = Math.ceil(layer.columns.length / STAGE_BLUEPRINT.length);
    for (let i = 0; i < totalStages; i++) {
        const firstCol = layer.columns[i * STAGE_BLUEPRINT.length];
        if (!firstCol || !firstCol.loopTarget || firstCol.loopTarget <= 0) continue;
        
        if (firstCol.loopTarget === removedStageNumber) {
            // Target was deleted — clear loop
            firstCol.loopTarget = 0;
            firstCol.loopCount = 0;
        } else if (firstCol.loopTarget > removedStageNumber) {
            // Target shifted down by 1
            firstCol.loopTarget -= 1;
        }
    }
}

/**
 * Reorder a stage within a layer by changing its position based on a new number.
 * newNumber can be decimal (e.g. 1.5) to insert between existing stages.
 * After reordering, all stages are renumbered sequentially (1, 2, 3, ...).
 * Loop targets are remapped to follow the new numbering.
 */
function reorderStageByNumber(columnId, newNumber) {
    let targetLayer = null;
    let columnIndex = -1;
    
    for (const layer of plannerLayers) {
        const idx = layer.columns.findIndex(col => col.id === columnId);
        if (idx !== -1) {
            targetLayer = layer;
            columnIndex = idx;
            break;
        }
    }
    
    if (!targetLayer || columnIndex === -1) return;
    
    const totalStages = Math.ceil(targetLayer.columns.length / STAGE_BLUEPRINT.length);
    if (totalStages <= 1) return; // Nothing to reorder with a single stage
    
    // Current stage index (0-based)
    const currentStageIndex = Math.floor(columnIndex / STAGE_BLUEPRINT.length);
    
    // Build array of stages with their sort keys and original 1-based index
    const stages = [];
    for (let i = 0; i < totalStages; i++) {
        const start = i * STAGE_BLUEPRINT.length;
        const cols = targetLayer.columns.slice(start, start + STAGE_BLUEPRINT.length);
        // Assign sort key: the moved stage gets newNumber, others keep their original 1-based index
        const sortKey = (i === currentStageIndex) ? newNumber : (i + 1);
        stages.push({ columns: cols, sortKey, originalStageNumber: i + 1 });
    }
    
    // Sort stages by their sort key (stable sort preserves relative order for equal keys)
    stages.sort((a, b) => a.sortKey - b.sortKey);
    
    // Build mapping: oldStageNumber → newStageNumber (both 1-based)
    const stageNumberMap = {};
    stages.forEach((stage, newIndex) => {
        stageNumberMap[stage.originalStageNumber] = newIndex + 1;
    });
    
    // Update loopTarget on the first column of each stage (where loop data is stored)
    stages.forEach(stage => {
        const firstCol = stage.columns[0]; // loop data lives on the 'acao' column (first in stage)
        if (firstCol && firstCol.loopTarget > 0) {
            const remapped = stageNumberMap[firstCol.loopTarget];
            firstCol.loopTarget = remapped !== undefined ? remapped : firstCol.loopTarget;
        }
    });
    
    // Rebuild the columns array from sorted stages
    targetLayer.columns = stages.flatMap(s => s.columns);
    
    renderPlannerLayers();
}

/**
 * Handle change of stage number input. Parses the new value and triggers reorder.
 */
function handleStageNumberChange(inputEl) {
    const columnId = inputEl.dataset.columnId;
    const newNumber = parseFloat(inputEl.value);
    
    if (isNaN(newNumber) || newNumber <= 0) {
        // Invalid input, re-render to reset
        renderPlannerLayers();
        return;
    }
    
    // Find current stage number for this column
    let currentStageNumber = null;
    for (const layer of plannerLayers) {
        const idx = layer.columns.findIndex(col => col.id === columnId);
        if (idx !== -1) {
            currentStageNumber = Math.floor(idx / STAGE_BLUEPRINT.length) + 1;
            break;
        }
    }
    
    // Only reorder if the number actually changed
    if (currentStageNumber !== null && newNumber !== currentStageNumber) {
        reorderStageByNumber(columnId, newNumber);
    } else {
        // Same number, just re-render to reset the input
        renderPlannerLayers();
    }
}

function clearAllColumns() {
    plannerLayers = [];
    productName = '';
    totalAvailability = 0;
    activeLayerId = null;
    layerCounter = 1;
    columnCounter = 1;

    if (productNameInputEl) {
        productNameInputEl.value = '';
    }
    // Reset schedule fields to defaults
    if (shiftStartInputEl)  shiftStartInputEl.value  = '07:00';
    if (shiftEndInputEl)    shiftEndInputEl.value    = '17:00';
    if (lunchStartInputEl)  lunchStartInputEl.value  = '12:00';
    if (lunchEndInputEl)    lunchEndInputEl.value    = '13:00';
    recalcAvailability();
    if (totalAvailabilityInputEl) {
        totalAvailabilityInputEl.value = totalAvailability;
    }

    ensureDefaultLayer();
    renderPlannerLayers();
}

/**
 * Reseta completamente o roteiro do planner.
 * Chamado ao carregar um novo layout para evitar dados órfãos.
 */
export function resetPlannerData() {
    // Parar execução se estiver rodando
    if (isPlannerPlaying()) {
        stopPlanner();
    }
    clearAllColumns();
}

function handleGridChange(event) {
    // Handle onde group checkbox changes
    if (event.target.classList.contains('onde-group-checkbox')) {
        const container = event.target.closest('.onde-multiselect-container');
        const columnId = container?.dataset.columnId;
        const hubValues = event.target.dataset.hubValues?.split(',') || [];
        if (columnId) {
            _setGroupHubs(columnId, hubValues, event.target.checked);
            const group = event.target.closest('.onde-group');
            group?.querySelectorAll('.onde-hub-checkbox').forEach(cb => {
                cb.checked = event.target.checked;
            });
            if (group) _updateGroupCount(group, columnId);
        }
        return;
    }

    // Handle onde multi-select checkbox changes
    if (event.target.classList.contains('onde-hub-checkbox')) {
        const container = event.target.closest('.onde-multiselect-container');
        const columnId = container?.dataset.columnId;
        if (columnId) {
            _toggleOndeHub(columnId, event.target.dataset.hubValue, event.target.checked);
            const group = event.target.closest('.onde-group');
            if (group) {
                _updateGroupCheckboxState(group);
                _updateGroupCount(group, columnId);
            }
        }
        return;
    }

    // IMPORTANTE: Verificar layer-operator-select ANTES de verificar columnEl
    // pois o select de operador está no header da camada, não dentro de uma coluna
    if (event.target.classList.contains('layer-operator-select')) {
        const layerId = event.target.dataset.layerId;
        updateLayerOperator(layerId, event.target.value);
        return;
    }

    // Color picker da camada
    if (event.target.classList.contains('layer-color-input')) {
        const layerId = event.target.dataset.layerId;
        updateLayerColor(layerId, event.target.value);
        return;
    }

    if (event.target.classList.contains('loop-target-select')) {
        const columnId = event.target.dataset.columnId;
        const target = parseInt(event.target.value) || 0;
        updateLoopTarget(columnId, target);
        return;
    }

    if (event.target.classList.contains('acao-qty-input')) {
        const columnId = event.target.dataset.columnId;
        const qty = Math.max(1, parseInt(event.target.value) || 1);
        updateColumnQuantity(columnId, qty);
        return;
    }

    if (event.target.classList.contains('acao-qty-out-input')) {
        const columnId = event.target.dataset.columnId;
        const qty = Math.max(1, parseInt(event.target.value) || 1);
        updateColumnQuantityOut(columnId, qty);
        return;
    }

    const columnEl = event.target.closest('.planner-column');
    if (!columnEl) return;
    const columnId = columnEl.dataset.columnId;

    if (event.target.classList.contains('column-type-select')) {
        updateColumnType(columnId, event.target.value);
        return;
    }

    if (event.target.classList.contains('tempo-type-select')) {
        const selectColumnId = event.target.dataset.columnId;
        updateTimeType(selectColumnId, event.target.value);
        return;
    }

    if (event.target.classList.contains('column-value-input') && !event.target.classList.contains('column-value-tempo-end')) {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        updateColumnValue(columnId, value);
    }

    if (event.target.classList.contains('column-value-tempo-end')) {
        updateColumnValueEnd(columnId, event.target.value);
    }
}

function handleGridInput(event) {
    // Color picker em tempo real
    if (event.target.classList.contains('layer-color-input')) {
        const layerId = event.target.dataset.layerId;
        updateLayerColor(layerId, event.target.value);
        return;
    }

    if (event.target.classList.contains('stage-description-input')) {
        updateStageDescription(event.target.dataset.columnId, event.target.value);
        return;
    }

    if (event.target.classList.contains('loop-count-input')) {
        const columnId = event.target.dataset.columnId;
        const count = Math.max(0, parseInt(event.target.value) || 0);
        updateLoopCount(columnId, count);
        return;
    }

    if (event.target.classList.contains('acao-qty-input')) {
        const columnId = event.target.dataset.columnId;
        const qty = Math.max(1, parseInt(event.target.value) || 1);
        updateColumnQuantity(columnId, qty);
        return;
    }

    if (event.target.classList.contains('acao-qty-out-input')) {
        const columnId = event.target.dataset.columnId;
        const qty = Math.max(1, parseInt(event.target.value) || 1);
        updateColumnQuantityOut(columnId, qty);
        return;
    }

    const columnEl = event.target.closest('.planner-column');
    if (!columnEl) return;

    if (event.target.classList.contains('column-value-tempo-end')) {
        if (event.target.type === 'number') {
            updateColumnValueEnd(columnEl.dataset.columnId, event.target.value);
        }
        return;
    }

    if (!event.target.classList.contains('column-value-input')) {
        return;
    }
    if (event.target.type !== 'number') {
        return;
    }
    updateColumnValue(columnEl.dataset.columnId, event.target.value);
}

function handleGridClick(event) {
    // Handle Layer Selection
    const layerContainer = event.target.closest('.planner-layer-container');
    if (layerContainer) {
        const layerId = layerContainer.dataset.layerId;
        if (layerId && layerId !== activeLayerId) {
            activeLayerId = layerId;
            renderPlannerLayers(); // Re-render to update active state
        }
    }

    const removeBtn = event.target.closest('.planner-remove-column');
    if (removeBtn) {
        const columnEl = removeBtn.closest('.planner-column');
        if (!columnEl) return;
        removePlannerColumn(columnEl.dataset.columnId);
    }
    
    const removeLayerBtn = event.target.closest('.planner-remove-layer');
    if (removeLayerBtn) {
        const layerId = removeLayerBtn.dataset.layerId;
        removeLayer(layerId);
    }

    // Toggle loop controls
    const loopToggleBtn = event.target.closest('.stage-loop-toggle');
    if (loopToggleBtn) {
        const columnId = loopToggleBtn.dataset.columnId;
        const controlsContainer = loopToggleBtn.closest('.stage-loop-controls');
        const configEl = controlsContainer?.querySelector('.stage-loop-config');
        if (configEl) {
            const isVisible = configEl.style.display !== 'none';
            if (isVisible) {
                // Hide and clear loop data
                configEl.style.display = 'none';
                controlsContainer.classList.remove('loop-active');
                updateLoopTarget(columnId, 0);
                updateLoopCount(columnId, 0);
            } else {
                configEl.style.display = 'flex';
                controlsContainer.classList.add('loop-active');
            }
        }
    }

    // Remove loop button
    const loopRemoveBtn = event.target.closest('.stage-loop-remove');
    if (loopRemoveBtn) {
        const columnId = loopRemoveBtn.dataset.columnId;
        updateLoopTarget(columnId, 0);
        updateLoopCount(columnId, 0);
        renderPlannerLayers();
    }

    // Remove stage button (delete specific step)
    const stageRemoveBtn = event.target.closest('.stage-remove-btn');
    if (stageRemoveBtn) {
        const columnId = stageRemoveBtn.dataset.columnId;
        if (confirm('Tem certeza que deseja excluir esta etapa?')) {
            removeStageByFirstColumnId(columnId);
        }
    }

    // ===== ONDE multi-select handlers =====
    // Toggle dropdown
    const dropdownToggle = event.target.closest('.onde-dropdown-toggle');
    if (dropdownToggle) {
        const container = dropdownToggle.closest('.onde-multiselect-container');
        const list = container?.querySelector('.onde-dropdown-list');
        if (list) {
            // Close any other open dropdowns first
            document.querySelectorAll('.onde-dropdown-list').forEach(el => {
                if (el !== list) el.style.display = 'none';
            });
            list.style.display = list.style.display === 'none' ? 'block' : 'none';
        }
        event.stopPropagation();
        return;
    }

    // Click on summary area also toggles dropdown
    const summaryArea = event.target.closest('.onde-summary');
    if (summaryArea) {
        const container = summaryArea.closest('.onde-multiselect-container');
        const list = container?.querySelector('.onde-dropdown-list');
        if (list) {
            document.querySelectorAll('.onde-dropdown-list').forEach(el => {
                if (el !== list) el.style.display = 'none';
            });
            list.style.display = list.style.display === 'none' ? 'block' : 'none';
        }
        event.stopPropagation();
        return;
    }

    // Group expand/collapse toggle
    const expandBtn = event.target.closest('.onde-group-expand');
    if (expandBtn) {
        const group = expandBtn.closest('.onde-group');
        const children = group?.querySelector('.onde-group-children');
        const icon = expandBtn.querySelector('i');
        if (children) {
            const isOpen = children.style.display !== 'none';
            children.style.display = isOpen ? 'none' : 'block';
            if (icon) {
                icon.className = isOpen ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
            }
        }
        event.stopPropagation();
        return;
    }

    // Group checkbox — select/deselect all hubs of a resource
    const groupLabel = event.target.closest('.onde-group-label');
    if (groupLabel) {
        const groupCheckbox = groupLabel.querySelector('.onde-group-checkbox');
        if (groupCheckbox && event.target !== groupCheckbox) {
            groupCheckbox.checked = !groupCheckbox.checked;
        }
        if (groupCheckbox) {
            const container = groupCheckbox.closest('.onde-multiselect-container');
            const columnId = container?.dataset.columnId;
            const hubValues = groupCheckbox.dataset.hubValues?.split(',') || [];
            if (columnId) {
                _setGroupHubs(columnId, hubValues, groupCheckbox.checked);
                // Update child checkboxes visually
                const group = groupCheckbox.closest('.onde-group');
                group?.querySelectorAll('.onde-hub-checkbox').forEach(cb => {
                    cb.checked = groupCheckbox.checked;
                });
                // Update group count
                _updateGroupCount(group, columnId);
            }
        }
        event.stopPropagation();
        return;
    }

    // Checkbox item click
    const checkboxItem = event.target.closest('.onde-checkbox-item');
    if (checkboxItem) {
        const checkbox = checkboxItem.querySelector('.onde-hub-checkbox');
        if (checkbox && event.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
        }
        const container = checkboxItem.closest('.onde-multiselect-container');
        const columnId = container?.dataset.columnId;
        if (columnId && checkbox) {
            _toggleOndeHub(columnId, checkbox.dataset.hubValue, checkbox.checked);
            // Update parent group checkbox state
            const group = checkbox.closest('.onde-group');
            if (group) {
                _updateGroupCheckboxState(group);
                _updateGroupCount(group, columnId);
            }
        }
        event.stopPropagation();
        return;
    }
}

// ===== Helper functions for onde multi-select =====
function _getOndeColumnValues(columnId) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column && column.type === 'onde') {
            return column.value ? String(column.value).split(',').filter(Boolean) : [];
        }
    }
    return [];
}

function _setOndeColumnValue(columnId, hubIds) {
    const value = hubIds.filter(Boolean).join(',');
    updateColumnValue(columnId, value);
}

function _refreshOndeSummary(container, columnId) {
    const selectedIds = _getOndeColumnValues(columnId);
    const destOpts = getDestinationOptions();
    const count = selectedIds.length;

    const summaryEl = container.querySelector('.onde-summary');
    if (summaryEl) {
        if (count === 0) {
            summaryEl.innerHTML = '<span class="onde-placeholder">Selecione hub(s)...</span>';
        } else if (count === 1) {
            const hub = destOpts.find(o => String(o.value ?? o.id) === String(selectedIds[0]));
            summaryEl.innerHTML = `<span class="onde-summary-text">${hub ? (hub.label ?? hub.name ?? selectedIds[0]) : selectedIds[0]}</span>`;
        } else {
            summaryEl.innerHTML = `<span class="onde-summary-text">${count} destinos</span><span class="onde-random-badge" title="O sistema escolherá aleatoriamente entre os destinos selecionados"><i class="fas fa-dice"></i> Random</span>`;
        }
    }
}

function _toggleOndeHub(columnId, hubValue, checked) {
    const current = _getOndeColumnValues(columnId);
    if (checked && !current.includes(String(hubValue))) {
        current.push(String(hubValue));
    } else if (!checked) {
        const idx = current.indexOf(String(hubValue));
        if (idx >= 0) current.splice(idx, 1);
    }
    _setOndeColumnValue(columnId, current);
    // Update summary without closing dropdown
    const container = document.querySelector(`.onde-multiselect-container[data-column-id="${columnId}"]`);
    if (container) _refreshOndeSummary(container, columnId);
}

function _removeOndeHub(columnId, hubId) {
    const current = _getOndeColumnValues(columnId);
    const idx = current.indexOf(String(hubId));
    if (idx >= 0) current.splice(idx, 1);
    _setOndeColumnValue(columnId, current);
    renderPlannerLayers();
}

function _setGroupHubs(columnId, hubValues, checked) {
    const current = _getOndeColumnValues(columnId);
    for (const hv of hubValues) {
        const val = String(hv);
        const idx = current.indexOf(val);
        if (checked && idx < 0) {
            current.push(val);
        } else if (!checked && idx >= 0) {
            current.splice(idx, 1);
        }
    }
    _setOndeColumnValue(columnId, current);
    const container = document.querySelector(`.onde-multiselect-container[data-column-id="${columnId}"]`);
    if (container) _refreshOndeSummary(container, columnId);
}

function _updateGroupCheckboxState(groupEl) {
    const groupCb = groupEl.querySelector('.onde-group-checkbox');
    const childCbs = groupEl.querySelectorAll('.onde-group-children .onde-hub-checkbox');
    if (!groupCb || !childCbs.length) return;
    const total = childCbs.length;
    let checkedCount = 0;
    childCbs.forEach(cb => { if (cb.checked) checkedCount++; });
    groupCb.checked = checkedCount === total;
    groupCb.indeterminate = checkedCount > 0 && checkedCount < total;
}

function _updateGroupCount(groupEl, columnId) {
    const childCbs = groupEl.querySelectorAll('.onde-group-children .onde-hub-checkbox');
    if (!childCbs.length) return;
    const total = childCbs.length;
    let checkedCount = 0;
    childCbs.forEach(cb => { if (cb.checked) checkedCount++; });
    let countEl = groupEl.querySelector('.onde-group-count');
    if (checkedCount > 0) {
        if (!countEl) {
            countEl = document.createElement('span');
            countEl.className = 'onde-group-count';
            groupEl.querySelector('.onde-group-label')?.appendChild(countEl);
        }
        countEl.textContent = `${checkedCount}/${total}`;
    } else if (countEl) {
        countEl.remove();
    }
}

function removeLayer(layerId) {
    if (plannerLayers.length <= 1) {
        alert('Não é possível remover a única camada.');
        return;
    }
    
    if (confirm('Tem certeza que deseja remover esta camada?')) {
        plannerLayers = plannerLayers.filter(l => l.id !== layerId);
        if (activeLayerId === layerId) {
            activeLayerId = plannerLayers[0].id;
        }
        renderPlannerLayers();
    }
}

function handleDragStart(event) {
    const columnEl = event.target.closest('.planner-column');
    if (!columnEl) return;
    
    const columnId = columnEl.dataset.columnId;
    const layerContainer = columnEl.closest('.planner-layer-container');
    if (!layerContainer) return;
    
    draggedLayerId = layerContainer.dataset.layerId;
    const layer = plannerLayers.find(l => l.id === draggedLayerId);
    if (!layer) return;
    
    const column = layer.columns.find(col => col.id === columnId);
    
    // Não permitir arrastar colunas bloqueadas
    if (column && column.locked) {
        event.preventDefault();
        return;
    }
    
    draggedColumnIndex = layer.columns.findIndex(col => col.id === columnId);
    columnEl.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', columnEl.innerHTML);
}

function handleDragOver(event) {
    event.preventDefault();
    const columnEl = event.target.closest('.planner-column');
    if (!columnEl || !columnsGridEl.contains(columnEl)) return;
    
    const layerContainer = columnEl.closest('.planner-layer-container');
    if (!layerContainer) return;
    
    const currentLayerId = layerContainer.dataset.layerId;
    
    // Só permitir drag dentro da mesma camada
    if (currentLayerId !== draggedLayerId) {
        event.dataTransfer.dropEffect = 'none';
        return;
    }
    
    const columnId = columnEl.dataset.columnId;
    const layer = plannerLayers.find(l => l.id === currentLayerId);
    const column = layer.columns.find(col => col.id === columnId);
    
    // Não permitir drop sobre colunas bloqueadas
    if (column && column.locked) {
        event.dataTransfer.dropEffect = 'none';
        return;
    }
    
    event.dataTransfer.dropEffect = 'move';
    
    dragOverColumnIndex = layer.columns.findIndex(col => col.id === columnId);
    
    // Adicionar indicador visual
    const allColumns = layerContainer.querySelectorAll('.planner-column');
    allColumns.forEach(col => col.classList.remove('drag-over'));
    
    if (draggedColumnIndex !== null && dragOverColumnIndex !== null && draggedColumnIndex !== dragOverColumnIndex) {
        columnEl.classList.add('drag-over');
    }
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (draggedColumnIndex === null || dragOverColumnIndex === null || !draggedLayerId) return;
    if (draggedColumnIndex === dragOverColumnIndex) return;
    
    const layer = plannerLayers.find(l => l.id === draggedLayerId);
    if (!layer) return;
    
    // Reordenar array
    const draggedColumn = layer.columns[draggedColumnIndex];
    layer.columns.splice(draggedColumnIndex, 1);
    layer.columns.splice(dragOverColumnIndex, 0, draggedColumn);
    
    // Renderizar
    renderPlannerLayers();
    
    // Reset
    draggedColumnIndex = null;
    dragOverColumnIndex = null;
    draggedLayerId = null;
}

function handleDragEnd(event) {
    const columnEl = event.target.closest('.planner-column');
    if (columnEl) {
        columnEl.classList.remove('dragging');
    }
    
    // Limpar indicadores visuais
    const allColumns = columnsGridEl.querySelectorAll('.planner-column');
    allColumns.forEach(col => {
        col.classList.remove('drag-over');
        col.classList.remove('dragging');
    });
    
    draggedColumnIndex = null;
    dragOverColumnIndex = null;
    draggedLayerId = null;
}

function updateLayerOperator(layerId, operatorId) {
    const layer = plannerLayers.find(l => l.id === layerId);
    if (layer) {
        layer.operatorId = operatorId;
    }
}

function updateLayerColor(layerId, color) {
    const layer = plannerLayers.find(l => l.id === layerId);
    if (layer) {
        layer.color = color;
        // Atualizar visualmente o indicador de cor no header da camada
        const container = columnsGridEl?.querySelector(`.planner-layer-container[data-layer-id="${layerId}"]`);
        if (container) {
            container.style.borderLeftColor = color;
            const swatch = container.querySelector('.layer-color-swatch');
            if (swatch) swatch.style.backgroundColor = color;
        }
    }
}

function updateColumnType(columnId, newType) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column) {
            if (column.locked) return;
            column.type = newType;
            column.value = getDefaultValueForType(newType);
            renderPlannerLayers();
            return;
        }
    }
}

function updateColumnValue(columnId, rawValue) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column) {
            switch (column.type) {
                case 'tempo':
                    column.value = Math.max(0, Number(rawValue) || 0);
                    break;
                default:
                    column.value = rawValue;
            }
            // Re-render when action type changes (to show/hide qty input)
            if (column.type === 'acao') {
                renderPlannerLayers();
            }
            return;
        }
    }
}

function updateColumnValueEnd(columnId, rawValue) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column && column.type === 'tempo') {
            column.valueEnd = Math.max(0, Number(rawValue) || 0);
            return;
        }
    }
}

function updateTimeType(columnId, timeType) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column && column.type === 'tempo') {
            column.timeType = timeType;
            // Se mudar para 'fixo', limpar o valor final
            if (timeType === 'fixo') {
                column.valueEnd = 0;
            }
            renderPlannerLayers();
            return;
        }
    }
}

function updateStageDescription(columnId, value) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column) {
            column.stageDescription = value;
            return;
        }
    }
}

function updateLoopTarget(columnId, target) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column) {
            column.loopTarget = target;
            return;
        }
    }
}

function updateLoopCount(columnId, count) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column) {
            column.loopCount = count;
            return;
        }
    }
}

function updateColumnQuantity(columnId, qty) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column) {
            column.quantity = qty;
            return;
        }
    }
}

function updateColumnQuantityOut(columnId, qty) {
    for (const layer of plannerLayers) {
        const column = layer.columns.find(col => col.id === columnId);
        if (column) {
            column.quantityOut = qty;
            return;
        }
    }
}

function renderPlannerLayers() {
    if (!columnsGridEl) return;

    // Ensure we have the latest layout data (operators, hubs)
    loadLayoutData();

    const operatorOptions = getOperatorOptions();
    const destinationOptions = getDestinationOptions();

    columnsGridEl.innerHTML = plannerLayers.map((layer, layerIndex) => {
        const isActive = layer.id === activeLayerId;
        const activeClass = isActive ? 'active-layer' : '';
        const columnsHtml = layer.columns
            .map((column, index) => createColumnMarkup(column, index, operatorOptions, destinationOptions, layer.columns))
            .join('');
            
        const operatorSelectOptions = buildOptionsHtml(operatorOptions, layer.operatorId);
        const layerColor = layer.color || LAYER_COLOR_PALETTE[0];
        
        return `
            <div class="planner-layer-container ${activeClass}" data-layer-id="${layer.id}" style="border-left: 4px solid ${layerColor};">
                <div class="planner-layer-header">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span class="layer-title">Camada ${layerIndex + 1}</span>
                        <select class="layer-operator-select" data-layer-id="${layer.id}" style="padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-dark); color: var(--text-color); font-size: 0.85rem;">
                            <option value="" disabled ${!layer.operatorId ? 'selected' : ''}>Selecione Operador</option>
                            ${operatorSelectOptions}
                        </select>
                        <label class="layer-color-picker" title="Cor das conexões deste operador">
                            <span class="layer-color-swatch" style="background-color: ${layerColor};"></span>
                            <input type="color" class="layer-color-input" data-layer-id="${layer.id}" value="${layerColor}" />
                        </label>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${isActive ? '<span class="layer-badge">Ativa</span>' : ''}
                        <button class="planner-remove-layer" data-layer-id="${layer.id}" title="Remover Camada">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="planner-layer-grid">
                    ${columnsHtml}
                </div>
            </div>
        `;
    }).join('');

    toggleEmptyState(!plannerLayers.length);
    updateColumnCount();

    // Set indeterminate state on group checkboxes (can't be set via HTML)
    columnsGridEl.querySelectorAll('.onde-group-checkbox[data-indeterminate="true"]').forEach(cb => {
        cb.indeterminate = true;
    });
}

function updateColumnCount() {
    if (!columnCountEl) return;
    let totalStages = 0;
    plannerLayers.forEach(layer => {
        totalStages += Math.ceil(layer.columns.length / STAGE_BLUEPRINT.length);
    });
    
    const strongEl = columnCountEl.querySelector('strong');
    if (strongEl) {
        strongEl.textContent = `${totalStages} ${totalStages === 1 ? 'etapa' : 'etapas'}`;
    }
}

function toggleEmptyState(isEmpty) {
    if (!emptyStateEl) {
        return;
    }
    emptyStateEl.classList.toggle('active', isEmpty);
}

function createColumnMarkup(column, index, operatorOptions, destinationOptions, allColumns = []) {
    const typeOptions = buildOptionsHtml(COLUMN_TYPES, column.type);
    
    // Determinar a ação da etapa atual para saber se devemos desabilitar o campo de tempo
    const stageStartIndex = Math.floor(index / STAGE_BLUEPRINT.length) * STAGE_BLUEPRINT.length;
    const acaoColumnIndex = stageStartIndex + 1; // 'acao' é o segundo item no STAGE_BLUEPRINT
    const acaoColumn = allColumns[acaoColumnIndex];
    const currentStageAction = acaoColumn?.value || '';
    
    const valueControl = buildValueControl(column, operatorOptions, destinationOptions, currentStageAction);
    const removeButtonClass = column.locked ? 'planner-remove-column hidden' : 'planner-remove-column';
    const draggableAttr = '';
    const cursorStyle = 'cursor: default;';
    const stageNumber = Math.floor(index / STAGE_BLUEPRINT.length) + 1;
    const isFirstInStage = index % STAGE_BLUEPRINT.length === 0;
    // Loop controls
    const hasLoop = column.loopTarget > 0 && column.loopCount > 0;
    const loopTarget = column.loopTarget || '';
    const loopCount = column.loopCount || '';
    const totalStages = Math.ceil(allColumns.length / STAGE_BLUEPRINT.length);
    const loopStageOptions = Array.from({ length: totalStages }, (_, i) => {
        const sn = i + 1;
        const selected = sn === column.loopTarget ? 'selected' : '';
        return `<option value="${sn}" ${selected}>Etapa ${sn}</option>`;
    }).join('');

    const stageLabel = isFirstInStage ? `
        <div class="planner-stage-label" data-stage-number="${stageNumber}" data-column-id="${column.id}">
            <span class="stage-number-label">Etapa </span>
            <input type="number" class="stage-number-input" data-column-id="${column.id}" data-layer-id="" value="${stageNumber}" min="0" step="0.1" title="Edite o número para reordenar a etapa" />
            <span class="stage-number-separator"> - </span>
            <input type="text" class="stage-description-input" data-column-id="${column.id}" value="${column.stageDescription || ''}" placeholder="DESCRIÇÃO DA ETAPA" style="background: transparent; border: none; color: white; font-weight: bold; width: 200px; outline: none;" />
            <div class="stage-loop-controls ${hasLoop ? 'loop-active' : ''}">
                <button class="stage-loop-toggle" data-column-id="${column.id}" title="Configurar loop nesta etapa">
                    <i class="fas fa-sync-alt"></i>
                </button>
                <div class="stage-loop-config" style="display: ${hasLoop ? 'flex' : 'none'};">
                    <span class="loop-label">Voltar p/</span>
                    <select class="loop-target-select" data-column-id="${column.id}">
                        <option value="" disabled ${!loopTarget ? 'selected' : ''}>Etapa...</option>
                        ${loopStageOptions}
                    </select>
                    <span class="loop-label">×</span>
                    <input type="number" class="loop-count-input" data-column-id="${column.id}" min="1" max="9999" value="${loopCount}" placeholder="N" />
                    <span class="loop-label">vezes</span>
                    <button class="stage-loop-remove" data-column-id="${column.id}" title="Remover loop">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <button class="stage-remove-btn" data-column-id="${column.id}" title="Excluir esta etapa">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>` : '';

    return `
        ${stageLabel}
        <div class="planner-column" data-column-id="${column.id}" data-column-type="${column.type}" data-stage="${stageNumber}" ${draggableAttr} style="${cursorStyle}">
            <div class="planner-column-header">
                <select class="column-type-select" disabled>
                    ${typeOptions}
                </select>
                <button class="${removeButtonClass}" title="Remover coluna">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="planner-column-body">
                ${valueControl}
            </div>
        </div>
    `;
}

function buildOptionsHtml(options, selectedValue) {
    if (!Array.isArray(options)) return '';
    return options
        .map(option => {
            const value = option.value ?? option.id;
            const label = option.label ?? option.name ?? value;
            // Use loose comparison or string conversion to be safe
            const isSelected = String(selectedValue) === String(value);
            const selected = isSelected ? 'selected' : '';
            const disabled = option.disabled ? 'disabled' : '';
            const hint = option.hint || label;
            return `<option value="${value}" ${selected} ${disabled} title="${hint}">${label}</option>`;
        })
        .join('');
}

function buildValueControl(column, operatorOptions, destinationOptions, currentStageAction = '') {
    const baseClass = `column-value-input column-value-${column.type}`;
    const commonAttrs = `class="${baseClass}"`;
    switch (column.type) {
        case 'quem': {
            const hasOperators = operatorOptions.some(opt => !opt.disabled && opt.value);
            const options = buildOptionsHtml(operatorOptions, column.value);
            return `
                <select ${commonAttrs}>
                    <option value="" disabled ${column.value ? '' : 'selected'}>${hasOperators ? 'Selecione operador' : 'Inserir operador'}</option>
                    ${options}
                </select>
            `;
        }
        case 'acao': {
            const options = buildOptionsHtml(ACTION_OPTIONS, column.value || ACTION_OPTIONS[0]?.value);
            const acaoValue = column.value || '';
            const showQty = ['criar acabado', 'mover acabado para', 'aguardar acabado'].includes(acaoValue);
            const isMoverAcabado = acaoValue === 'mover acabado para';
            const qty = column.quantity || 1;
            const qtyOut = column.quantityOut || qty;
            let qtyHtml = '';
            if (showQty && isMoverAcabado) {
                // "mover acabado para" — dois campos: saída e entrada
                qtyHtml = `
                    <div class="acao-quantity-row">
                        <span class="acao-qty-label">Saída (un):</span>
                        <input type="number" class="acao-qty-input" data-column-id="${column.id}" min="1" max="9999" value="${qty}" title="Quantidade retirada do recurso de origem" />
                    </div>
                    <div class="acao-quantity-row">
                        <span class="acao-qty-label">Entrada (un):</span>
                        <input type="number" class="acao-qty-out-input" data-column-id="${column.id}" min="1" max="9999" value="${qtyOut}" title="Quantidade depositada no recurso de destino" />
                    </div>
                `;
            } else if (showQty) {
                qtyHtml = `
                    <div class="acao-quantity-row">
                        <span class="acao-qty-label">Qtd (un):</span>
                        <input type="number" class="acao-qty-input" data-column-id="${column.id}" min="1" max="9999" value="${qty}" />
                    </div>
                `;
            }
            return `
                <div class="acao-control-wrapper">
                    <select ${commonAttrs}>
                        ${options}
                    </select>
                    ${qtyHtml}
                </div>
            `;
        }
        case 'sprite': {
            const options = buildOptionsHtml(SPRITE_OPTIONS, column.value || SPRITE_OPTIONS[0]?.value);
            return `
                <select ${commonAttrs}>
                    <option value="" disabled ${column.value ? '' : 'selected'}>Selecione sprite</option>
                    ${options}
                </select>
            `;
        }
        case 'onde': {
            // Suporte a múltiplos destinos (random selection)
            const selectedIds = column.value ? String(column.value).split(',').filter(Boolean) : [];
            const isMulti = selectedIds.length > 1;
            const count = selectedIds.length;

            // Summary text
            let summaryHtml;
            if (count === 0) {
                summaryHtml = '<span class="onde-placeholder">Selecione hub(s)...</span>';
            } else if (count === 1) {
                const hub = destinationOptions.find(o => String(o.value ?? o.id) === String(selectedIds[0]));
                summaryHtml = `<span class="onde-summary-text">${hub ? (hub.label ?? hub.name ?? selectedIds[0]) : selectedIds[0]}</span>`;
            } else {
                summaryHtml = `<span class="onde-summary-text">${count} destinos</span><span class="onde-random-badge" title="O sistema escolherá aleatoriamente entre os destinos selecionados"><i class="fas fa-dice"></i> Random</span>`;
            }

            // Build grouped dropdown
            const groupedHtml = buildGroupedDropdownHtml(destinationOptions, selectedIds);

            return `
                <div class="onde-multiselect-container" data-column-id="${column.id}">
                    <div class="onde-summary">
                        ${summaryHtml}
                    </div>
                    <button type="button" class="onde-dropdown-toggle" title="Selecionar destinos">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="onde-dropdown-list" style="display: none;">
                        ${groupedHtml}
                    </div>
                </div>
            `;
        }
        case 'tempo': {
            // Verificar se a ação da etapa é "aguardar acabado" - nesse caso, desabilitar campo de tempo
            const isWaitingAction = currentStageAction === 'aguardar acabado';
            const disabledAttr = isWaitingAction ? 'disabled' : '';
            const disabledClass = isWaitingAction ? 'tempo-disabled' : '';
            
            const timeType = column.timeType || 'fixo';
            const timeTypeOptions = TIME_TYPE_OPTIONS.map(opt => 
                `<option value="${opt.value}" ${timeType === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            
            const timeValue = column.value ?? 0;
            const timeValueEnd = column.valueEnd ?? 0;
            const showRangeFields = timeType === 'entre' && !isWaitingAction;
            
            if (isWaitingAction) {
                return `
                    <div class="tempo-container ${disabledClass}">
                        <div class="tempo-disabled-message">
                            <i class="fas fa-info-circle"></i>
                            <span>Tempo não aplicável</span>
                        </div>
                        <small class="tempo-disabled-hint">Ação "aguardar acabado" espera até haver estoque disponível</small>
                    </div>
                `;
            }
            
            return `
                <div class="tempo-container">
                    <select class="tempo-type-select" data-column-id="${column.id}" ${disabledAttr}>
                        ${timeTypeOptions}
                    </select>
                    <div class="tempo-inputs">
                        <input ${commonAttrs} type="number" min="0" value="${timeValue}" placeholder="Segundos" ${disabledAttr} />
                        <span class="tempo-separator" style="display: ${showRangeFields ? 'inline' : 'none'};">~</span>
                        <input class="column-value-input column-value-tempo-end" type="number" min="0" value="${timeValueEnd}" placeholder="Segundos" style="display: ${showRangeFields ? 'inline-block' : 'none'};" ${disabledAttr} />
                    </div>
                </div>
            `;
        }
        default:
            return `<input ${commonAttrs} type="text" value="${column.value || ''}" />`;
    }
}

function getDefaultValueForType(type) {
    switch (type) {
        case 'acao':
            return ACTION_OPTIONS[0]?.value || '';
        case 'sprite':
            return SPRITE_OPTIONS[0]?.value || '';
        case 'tempo':
            return 60;
        default:
            return '';
    }
}

function getOperatorOptions() {
    if (!layoutOperators.length) {
        return [
            { value: '', label: 'Inserir operador', disabled: true }
        ];
    }

    const allFloors = getAllFloors() || [];
    const isMultiFloor = allFloors.length > 1;

    return layoutOperators.map(res => {
        let label = res.name || res.id;
        if (isMultiFloor) {
            const floorInfo = getResourceFloorInfo(res.id);
            if (floorInfo && floorInfo.floorName) {
                label = `${label} [${floorInfo.floorName}]`;
            }
        }
        return {
            value: res.id,
            label
        };
    });
}

function getDestinationOptions() {
    if (!layoutHubs.length) {
        return [
            { value: '', label: 'Nenhum hub disponível', disabled: true }
        ];
    }

    const allFloors = getAllFloors() || [];
    const isMultiFloor = allFloors.length > 1;

    // Criar mapa de floorId → floorName para referência rápida
    const floorNameMap = {};
    if (isMultiFloor) {
        for (const floor of allFloors) {
            floorNameMap[floor.id] = floor.name;
        }
    }

    return layoutHubs.map(hub => {
        let label = hub.name || hub.id;
        if (isMultiFloor && hub.floorId && floorNameMap[hub.floorId]) {
            label = `${label} [${floorNameMap[hub.floorId]}]`;
        }
        return {
            value: `hub:${hub.id}`,
            label,
            resourceId: hub.resourceId || null
        };
    });
}

/**
 * Builds grouped dropdown HTML: hubs grouped by parent resource.
 * Resources with 1 hub show inline (no expand). Resources with 2+ hubs are collapsible.
 */
function buildGroupedDropdownHtml(destinationOptions, selectedIds) {
    const groups = new Map(); // resourceId → { name, hubs[] }
    const ungrouped = [];

    for (const opt of destinationOptions) {
        if (opt.disabled) continue;
        const val = String(opt.value ?? opt.id);
        const lbl = opt.label ?? opt.name ?? val;
        const resId = opt.resourceId;

        if (!resId) {
            ungrouped.push({ val, lbl });
            continue;
        }

        if (!groups.has(resId)) {
            // Extract resource name from hub label (e.g. "MESA 2 - HUB 1 [Térreo]" → "MESA 2")
            const dashIdx = lbl.indexOf(' - HUB');
            const resourceName = dashIdx >= 0 ? lbl.substring(0, dashIdx) : resId;
            groups.set(resId, { name: resourceName, hubs: [] });
        }
        groups.get(resId).hubs.push({ val, lbl });
    }

    let html = '';

    for (const [resId, group] of groups) {
        const hubValues = group.hubs.map(h => h.val);
        const selectedCount = hubValues.filter(v => selectedIds.includes(v)).length;
        const allSelected = selectedCount === group.hubs.length;
        const someSelected = selectedCount > 0 && !allSelected;

        if (group.hubs.length === 1) {
            // Single hub: show directly, no expand
            const h = group.hubs[0];
            const checked = selectedIds.includes(h.val) ? 'checked' : '';
            html += `<label class="onde-checkbox-item"><input type="checkbox" class="onde-hub-checkbox" data-hub-value="${h.val}" ${checked} /><span title="${h.lbl}">${h.lbl}</span></label>`;
        } else {
            // Group header
            const groupChecked = allSelected ? 'checked' : '';
            const groupIndeterminate = someSelected ? 'data-indeterminate="true"' : '';
            html += `<div class="onde-group" data-resource-id="${resId}">`;
            html += `<div class="onde-group-header">`;
            html += `<button type="button" class="onde-group-expand" data-resource-id="${resId}" title="Expandir/recolher"><i class="fas fa-chevron-right"></i></button>`;
            html += `<label class="onde-group-label"><input type="checkbox" class="onde-group-checkbox" data-resource-id="${resId}" data-hub-values="${hubValues.join(',')}" ${groupChecked} ${groupIndeterminate} /><span>${group.name}</span>`;
            if (selectedCount > 0) html += `<span class="onde-group-count">${selectedCount}/${group.hubs.length}</span>`;
            html += `</label></div>`;
            html += `<div class="onde-group-children" style="display: none;">`;
            for (const h of group.hubs) {
                const checked = selectedIds.includes(h.val) ? 'checked' : '';
                // Show only hub number for children (e.g., "HUB 1 [Térreo]")
                const shortLabel = h.lbl.substring(h.lbl.indexOf(' - ') + 3) || h.lbl;
                html += `<label class="onde-checkbox-item onde-child-item"><input type="checkbox" class="onde-hub-checkbox" data-hub-value="${h.val}" data-resource-id="${resId}" ${checked} /><span title="${h.lbl}">${shortLabel}</span></label>`;
            }
            html += `</div></div>`;
        }
    }

    // Ungrouped hubs (free-floating)
    for (const h of ungrouped) {
        const checked = selectedIds.includes(h.val) ? 'checked' : '';
        html += `<label class="onde-checkbox-item"><input type="checkbox" class="onde-hub-checkbox" data-hub-value="${h.val}" ${checked} /><span title="${h.lbl}">${h.lbl}</span></label>`;
    }

    return html || '<div class="onde-no-hubs">Nenhum hub disponível</div>';
}

export function getPlannerData() {
    return {
        productName,
        totalAvailability,
        schedule: {
            shiftStart:  shiftStartInputEl  ? shiftStartInputEl.value  : '07:00',
            shiftEnd:    shiftEndInputEl    ? shiftEndInputEl.value    : '17:00',
            lunchStart:  lunchStartInputEl  ? lunchStartInputEl.value  : '12:00',
            lunchEnd:    lunchEndInputEl    ? lunchEndInputEl.value    : '13:00'
        },
        layers: plannerLayers
    };
}

export function loadPlannerDataFromJSON(data) {
    if (!data) return;
    
    if (data.productName && productNameInputEl) {
        productName = data.productName;
        productNameInputEl.value = productName;
    }

    if (data.totalAvailability !== undefined && totalAvailabilityInputEl) {
        totalAvailability = data.totalAvailability;
        totalAvailabilityInputEl.value = totalAvailability;
    }

    // Restore schedule fields
    if (data.schedule) {
        if (data.schedule.shiftStart && shiftStartInputEl) shiftStartInputEl.value = data.schedule.shiftStart;
        if (data.schedule.shiftEnd   && shiftEndInputEl)   shiftEndInputEl.value   = data.schedule.shiftEnd;
        if (data.schedule.lunchStart && lunchStartInputEl) lunchStartInputEl.value = data.schedule.lunchStart;
        if (data.schedule.lunchEnd   && lunchEndInputEl)   lunchEndInputEl.value   = data.schedule.lunchEnd;
        recalcAvailability();
    }
    
    if (Array.isArray(data.layers)) {
        const usedColors = [];
        plannerLayers = data.layers.map((layer, idx) => {
            // Migration: if no operatorId, try to extract from columns
            if (!layer.operatorId) {
                const quemCol = layer.columns.find(c => c.type === 'quem');
                layer.operatorId = quemCol ? quemCol.value : '';
                // Remove 'quem' columns
                layer.columns = layer.columns.filter(c => c.type !== 'quem');
            }
            // Migration: atribuir cor padrão se não existir
            if (!layer.color) {
                for (const color of LAYER_COLOR_PALETTE) {
                    if (!usedColors.includes(color)) {
                        layer.color = color;
                        break;
                    }
                }
                if (!layer.color) layer.color = LAYER_COLOR_PALETTE[idx % LAYER_COLOR_PALETTE.length];
            }
            usedColors.push(layer.color);
            return layer;
        });
        if (plannerLayers.length > 0) {
            activeLayerId = plannerLayers[0].id;
        }
    }
    
    // Atualizar contadores
    layerCounter = plannerLayers.length + 1;
    let maxColId = 0;
    plannerLayers.forEach(layer => {
        layer.columns.forEach(col => {
            const match = col.id.match(/planner-column-(\d+)/);
            if (match) {
                const id = parseInt(match[1], 10);
                if (id > maxColId) maxColId = id;
            }
        });
    });
    columnCounter = maxColId + 1;
    
    renderPlannerLayers();
}

function savePlannerData() {
    const data = getPlannerData();
    
    try {
        const jsonString = JSON.stringify(data, null, 2);
        
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                         now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const filename = `roteiro_${timestamp}.json`;
        
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.style.display = 'none';
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        URL.revokeObjectURL(url);

        const btn = document.getElementById('savePlannerBtn');
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i><span>Salvo!</span>';
            btn.disabled = true;
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Erro ao salvar roteiro:', error);
        alert('Erro ao salvar o roteiro.');
    }
}

function loadPlannerData() {
    try {
        const saved = localStorage.getItem('plannerData');
        if (!saved) return;
        
        const data = JSON.parse(saved);
        loadPlannerDataFromJSON(data);
        
    } catch (error) {
        console.error('Erro ao carregar dados do planner:', error);
    }
}

// Sistema de highlight para acompanhar execução
export function highlightPlannerStep(layerIndex, startIndex, endIndex = null) {
    if (!columnsGridEl) return;
    
    // Encontrar container da camada
    const layerContainers = columnsGridEl.querySelectorAll('.planner-layer-container');
    if (layerIndex < 0 || layerIndex >= layerContainers.length) return;
    
    const layerContainer = layerContainers[layerIndex];
    const allColumns = layerContainer.querySelectorAll('.planner-column');
    
    // Remover highlight anterior desta camada
    allColumns.forEach(col => col.classList.remove('planner-step-active'));
    
    // Se não há endIndex, destacar apenas uma coluna
    if (endIndex === null) {
        if (startIndex >= 0 && startIndex < allColumns.length) {
            allColumns[startIndex].classList.add('planner-step-active');
            allColumns[startIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
        return;
    }
    
    // Destacar conjunto de colunas (grupo de ação)
    for (let i = startIndex; i <= endIndex && i < allColumns.length; i++) {
        allColumns[i].classList.add('planner-step-active');
    }
    
    // Scroll para primeira coluna do grupo
    if (startIndex >= 0 && startIndex < allColumns.length) {
        allColumns[startIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

export function clearPlannerHighlight() {
    if (!columnsGridEl) return;
    const allColumns = columnsGridEl.querySelectorAll('.planner-column');
    allColumns.forEach(col => col.classList.remove('planner-step-active'));
}

export function getPlannerLayers() {
    return plannerLayers;
}

function normalizePlannerLayerStructure(layer) {
    if (!layer.columns.length) {
        return;
    }

    const stages = [];
    let currentStage = {};
    let lastOperatorId = '';

    const validTypes = new Set(COLUMN_TYPES.map(item => item.value));

    layer.columns.forEach(column => {
        if (!column || !validTypes.has(column.type)) {
            return;
        }

        if (column.type === 'quem') {
            if (Object.keys(currentStage).length) {
                stages.push(currentStage);
            }
            currentStage = {};
            if (column.value) {
                lastOperatorId = column.value;
            }
        }

        currentStage[column.type] = column.value;

        if (STAGE_BLUEPRINT.every(type => currentStage.hasOwnProperty(type))) {
            stages.push(currentStage);
            currentStage = {};
        }
    });

    if (Object.keys(currentStage).length) {
        stages.push(currentStage);
    }

    if (!stages.length) {
        layer.columns = [];
        return;
    }

    layer.columns = [];
    stages.forEach((stage, stageIndex) => {
        if (!stage.quem && lastOperatorId) {
            stage.quem = lastOperatorId;
        }
        STAGE_BLUEPRINT.forEach((type, typeIndex) => {
            const isFirstColumn = stageIndex === 0 && typeIndex === 0;
            layer.columns.push(createColumn(type, {
                value: stage[type] !== undefined ? stage[type] : getDefaultValueForType(type),
                locked: isFirstColumn
            }));
        });
    });
}

// Close dropdowns when clicking outside (kept for any remaining dropdown components)
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown.active').forEach(d => {
            d.classList.remove('active');
        });
    }
});
