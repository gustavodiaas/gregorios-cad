import { 
    createFloor,
    setActiveFloor,
    getCurrentFloorId,
    getFloorsMeta,
    subscribeToFloorChanges,
    renameFloor,
    clearAllSelections,
    movementAreas,
    isOverlayVisible,
    toggleOverlayVisibility
} from './state.js';
import { drawAll } from './drawing.js';
import { saveStateToHistory } from './history.js';
import { updateConnectionDistancesTable } from './flow-metrics.js';
import { ensureAllAreasHaveNavMesh } from './navMeshBaker.js';

function renderFloorTabs(container) {
    if (!container) {
        return;
    }
    const floors = getFloorsMeta();
    const currentFloorId = getCurrentFloorId();
    container.innerHTML = '';

    // Renderizar em ordem reversa (andar mais alto em cima, térreo embaixo)
    const floorsReversed = [...floors].reverse();

    floorsReversed.forEach(floor => {
        const row = document.createElement('div');
        row.className = 'floor-row';
        
        // Checkbox de overlay (visível apenas para pavimentos que NÃO são o ativo)
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'floor-overlay-check';
        checkbox.title = `Projetar linhas de "${floor.name}" no pavimento atual`;
        checkbox.checked = isOverlayVisible(floor.id);
        checkbox.tabIndex = -1;
        
        if (floor.id === currentFloorId) {
            checkbox.disabled = true;
            checkbox.style.visibility = 'hidden';
        }

        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleOverlayVisibility(floor.id);
            drawAll();
        });

        // Botão do pavimento
        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.className = `floor-tab${floor.id === currentFloorId ? ' active' : ''}`;
        tabButton.dataset.floorId = floor.id;
        tabButton.textContent = floor.name;

        tabButton.addEventListener('click', () => {
            if (setActiveFloor(floor.id)) {
                ensureAllAreasHaveNavMesh(movementAreas);
                clearAllSelections();
                drawAll();
                updateConnectionDistancesTable();
                // Centralizar vista considerando dimensão global entre pavimentos
                if (typeof window.centerView === 'function') {
                    window.centerView();
                }
                saveStateToHistory('Trocar pavimento');
                // Re-renderizar para atualizar checkboxes
                renderFloorTabs(container);
            }
        });

        tabButton.addEventListener('dblclick', () => {
            const newName = window.prompt('Renomear pavimento', floor.name);
            if (!newName) {
                return;
            }
            const trimmed = newName.trim();
            if (trimmed && trimmed !== floor.name) {
                if (renameFloor(floor.id, trimmed)) {
                    saveStateToHistory('Renomear pavimento');
                }
            }
        });

        row.appendChild(checkbox);
        row.appendChild(tabButton);
        container.appendChild(row);
    });
}

export function initializeFloorManager() {
    const tabsContainer = document.getElementById('floorTabs');
    const addButton = document.getElementById('addFloorBtn');

    if (!tabsContainer || !addButton) {
        return;
    }

    renderFloorTabs(tabsContainer);

    subscribeToFloorChanges(() => {
        renderFloorTabs(tabsContainer);
    });

    addButton.addEventListener('click', () => {
        const newFloor = createFloor();
        if (!newFloor) {
            return;
        }
        if (setActiveFloor(newFloor.id)) {
            ensureAllAreasHaveNavMesh(movementAreas);
            clearAllSelections();
            drawAll();
            updateConnectionDistancesTable();
        }
        saveStateToHistory('Adicionar pavimento');
    });
}
