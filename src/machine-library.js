import { movementAreas, setSelectedResourceId } from './state.js';
import { createResource } from './resources.js';
import { calculateBoundingBox } from './areas.js';
import { pixelsPerCm } from './config.js';
import { saveStateToHistory } from './history.js';
import { drawAll } from './drawing.js';
import { reloadResourceImages } from './resource-image.js';
import { setRightSidebarVisible, showToast } from './ui-shell.js';
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
    { id: 'workbench', name: 'Bancada', category: 'Apoio', widthCm: 240, heightCm: 120, icon: 'assets/machines/workbench.svg' },
    { id: 'band-saw', name: 'Serra de fita', category: 'Corte', widthCm: 250, heightCm: 160, icon: 'assets/machines/band-saw.svg', tags: 'serra corte metal' },
    { id: 'drill-press', name: 'Furadeira de coluna', category: 'Usinagem', widthCm: 120, heightCm: 100, icon: 'assets/machines/drill-press.svg', tags: 'furação bancada' },
    { id: 'milling-machine', name: 'Fresadora', category: 'Usinagem', widthCm: 280, heightCm: 220, icon: 'assets/machines/milling-machine.svg', tags: 'fresa convencional' },
    { id: 'surface-grinder', name: 'Retificadora', category: 'Usinagem', widthCm: 260, heightCm: 180, icon: 'assets/machines/surface-grinder.svg', tags: 'retífica acabamento' },
    { id: 'laser-cutter', name: 'Corte a laser', category: 'Corte', widthCm: 520, heightCm: 300, icon: 'assets/machines/laser-cutter.svg', tags: 'laser chapa mesa' },
    { id: 'plasma-cutter', name: 'Corte plasma', category: 'Corte', widthCm: 480, heightCm: 280, icon: 'assets/machines/plasma-cutter.svg', tags: 'plasma chapa mesa' },
    { id: 'press-brake', name: 'Dobradeira', category: 'Conformação', widthCm: 420, heightCm: 190, icon: 'assets/machines/press-brake.svg', tags: 'dobra prensa chapa' },
    { id: 'welding-cell', name: 'Célula de solda', category: 'Soldagem', widthCm: 400, heightCm: 350, icon: 'assets/machines/welding-cell.svg', tags: 'soldagem robô cabine' },
    { id: 'paint-booth', name: 'Cabine de pintura', category: 'Acabamento', widthCm: 600, heightCm: 400, icon: 'assets/machines/paint-booth.svg', tags: 'pintura cabine acabamento' },
    { id: 'air-compressor', name: 'Compressor de ar', category: 'Utilidades', widthCm: 220, heightCm: 120, icon: 'assets/machines/air-compressor.svg', tags: 'ar comprimido reservatório' },
    { id: 'palletizer', name: 'Paletizadora', category: 'Automação', widthCm: 400, heightCm: 400, icon: 'assets/machines/palletizer.svg', tags: 'palete robô fim de linha' },
    { id: 'packaging-machine', name: 'Embaladora', category: 'Embalagem', widthCm: 450, heightCm: 180, icon: 'assets/machines/packaging-machine.svg', tags: 'embalagem seladora fim de linha' }
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
    setRightSidebarVisible(true);
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
            const haystack = `${machine.name} ${machine.category} ${machine.tags || ''}`.toLocaleLowerCase('pt-BR');
            return matchesCategory && haystack.includes(query);
        });

        if (count) count.textContent = String(visible.length);
        grid.innerHTML = visible.map(machine => `
            <button type="button" class="machine-card" data-machine-id="${machine.id}" title="Inserir ${machine.name}">
                <span class="machine-card-visual"><img src="${machine.icon}" alt=""></span>
                <span class="machine-card-copy"><strong>${machine.name}</strong><small>${machine.category}</small><small>${formatLength(machine.widthCm)} × ${formatLength(machine.heightCm)}</small></span>
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
