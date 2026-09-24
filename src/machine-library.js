import { movementAreas, setSelectedResourceId } from './state.js';
import { createResource } from './resources.js';
import { calculateBoundingBox } from './areas.js';
import { pixelsPerCm } from './config.js';
import { saveStateToHistory } from './history.js';
import { drawAll } from './drawing.js';
import { reloadResourceImages } from './resource-image.js';
import { showToast } from './ui-shell.js';
import { setActiveTool } from './active_tool.js';
import { formatLength, onMeasurementUnitChange } from './measurement-units.js';

export const MACHINE_LIBRARY = [
    { id: 'cnc-lathe', name: 'Torno CNC', category: 'Usinagem', widthCm: 320, heightCm: 190, icon: 'assets/machines/cnc-lathe.svg' },
    { id: 'machining-center', name: 'Centro de usinagem', category: 'Usinagem', widthCm: 300, heightCm: 260, icon: 'assets/machines/machining-center.svg' },
    { id: 'hydraulic-press', name: 'Prensa hidráulica', category: 'Conformação', widthCm: 240, heightCm: 220, icon: 'assets/machines/hydraulic-press.svg' },
    { id: 'injection-molder', name: 'Injetora', category: 'Plásticos', widthCm: 520, heightCm: 210, icon: 'assets/machines/injection-molder.svg' },
    { id: 'conveyor', name: 'Esteira', category: 'Movimentação', widthCm: 600, heightCm: 120, icon: 'assets/machines/conveyor.svg' },
    { id: 'industrial-robot', name: 'Robô industrial', category: 'Automação', widthCm: 260, heightCm: 260, icon: 'assets/machines/industrial-robot.svg' },
    { id: 'forklift', name: 'Empilhadeira', category: 'Movimentação', widthCm: 320, heightCm: 190, icon: 'assets/machines/forklift.svg' },
    { id: 'workbench', name: 'Bancada', category: 'Apoio', widthCm: 240, heightCm: 120, icon: 'assets/machines/workbench.svg' }
];

function getInsertionArea() {
    if (!movementAreas.length) return null;
    return movementAreas.find(area => area && area.visible !== false) || movementAreas[0];
}

async function insertMachine(definition) {
    const area = getInsertionArea();
    if (!area) {
        showToast('Crie uma área de movimentação antes de inserir máquinas.', 'warning');
        return;
    }

    const bounds = calculateBoundingBox(area.vertices || [
        [area.x, area.y],
        [area.x + area.width, area.y],
        [area.x + area.width, area.y + area.height],
        [area.x, area.y + area.height]
    ]);
    const desiredWidth = definition.widthCm * pixelsPerCm;
    const desiredHeight = definition.heightCm * pixelsPerCm;
    const fitScale = Math.min(1, (bounds.width * 0.72) / desiredWidth, (bounds.height * 0.72) / desiredHeight);
    const width = Math.max(20, desiredWidth * fitScale);
    const height = Math.max(20, desiredHeight * fitScale);
    const x = bounds.x + (bounds.width - width) / 2;
    const y = bounds.y + (bounds.height - height) / 2;

    saveStateToHistory(`Inserir ${definition.name}`);
    const resource = createResource(x, y, '#f8fafc', width, height);
    if (!resource) {
        showToast('Não foi possível inserir a máquina dentro da área.', 'warning');
        return;
    }

    resource.name = definition.name;
    resource.machineType = definition.id;
    resource.machineCategory = definition.category;
    resource.catalogWidthCm = definition.widthCm;
    resource.catalogHeightCm = definition.heightCm;
    resource.imageDataUrl = definition.icon;
    setActiveTool(null);
    setSelectedResourceId(resource.id);
    drawAll();

    await reloadResourceImages([resource]);
    drawAll();
    showToast(`${definition.name} inserido. Ajuste as medidas no inspetor.`, 'success');
}

export function initializeMachineLibrary() {
    const grid = document.getElementById('machineLibraryGrid');
    const search = document.getElementById('machineLibrarySearch');
    const filters = document.getElementById('machineCategoryFilters');
    const count = document.getElementById('machineLibraryCount');
    if (!grid || !search || !filters) return;

    const categories = ['Todas', ...new Set(MACHINE_LIBRARY.map(machine => machine.category))];
    let activeCategory = 'Todas';

    filters.innerHTML = categories.map((category, index) => (
        `<button type="button" class="library-filter${index === 0 ? ' active' : ''}" data-category="${category}">${category}</button>`
    )).join('');

    const render = () => {
        const query = search.value.trim().toLocaleLowerCase('pt-BR');
        const visible = MACHINE_LIBRARY.filter(machine => {
            const matchesCategory = activeCategory === 'Todas' || machine.category === activeCategory;
            const haystack = `${machine.name} ${machine.category}`.toLocaleLowerCase('pt-BR');
            return matchesCategory && haystack.includes(query);
        });

        if (count) count.textContent = String(visible.length);
        grid.innerHTML = visible.map(machine => `
            <button type="button" class="machine-card" data-machine-id="${machine.id}" title="Inserir ${machine.name}">
                <span class="machine-card-visual"><img src="${machine.icon}" alt=""></span>
                <span class="machine-card-copy"><strong>${machine.name}</strong><small>${formatLength(machine.widthCm)} × ${formatLength(machine.heightCm)}</small></span>
                <i class="fas fa-plus machine-card-add" aria-hidden="true"></i>
            </button>
        `).join('') || '<div class="library-empty">Nenhuma máquina encontrada.</div>';
    };

    filters.addEventListener('click', event => {
        const button = event.target.closest('[data-category]');
        if (!button) return;
        activeCategory = button.dataset.category;
        filters.querySelectorAll('.library-filter').forEach(item => item.classList.toggle('active', item === button));
        render();
    });
    search.addEventListener('input', render);
    onMeasurementUnitChange(render);
    grid.addEventListener('click', event => {
        const card = event.target.closest('[data-machine-id]');
        if (!card) return;
        const definition = MACHINE_LIBRARY.find(machine => machine.id === card.dataset.machineId);
        if (definition) insertMachine(definition);
    });

    render();
}
