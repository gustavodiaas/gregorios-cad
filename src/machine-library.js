import {
    movementAreas, setSelectedResourceId, setIsEditingResourcePolygon, setEditingResourceId,
    getCanvas, getScale, getOffsetXCanvas, getOffsetYCanvas
} from './state.js';
import { createResource } from './resources.js';
import { calculateBoundingBox, pointInPolygon, rectangleToVertices } from './areas.js';
import { pixelsPerCm } from './config.js';
import { saveStateToHistory } from './history.js';
import { drawAll } from './drawing.js';
import { reloadResourceImages } from './resource-image.js';
import { setRightSidebarVisible, showToast } from './ui-shell.js';
import { setActiveTool } from './active_tool.js';
import { formatLength, onMeasurementUnitChange } from './measurement-units.js';

export const MACHINE_LIBRARY = [
    { id: 'cnc-lathe', name: 'Torno CNC', category: 'Usinagem', widthCm: 320, heightCm: 190, icon: 'assets/machines/cnc-lathe.svg' },
    { id: 'conventional-lathe', name: 'Torno convencional', category: 'Usinagem', widthCm: 280, heightCm: 140, icon: 'assets/machines/conventional-lathe.svg', tags: 'torno manual usinagem' },
    { id: 'machining-center', name: 'Centro de usinagem', category: 'Usinagem', widthCm: 300, heightCm: 260, icon: 'assets/machines/machining-center.svg' },
    { id: 'milling-machine', name: 'Fresadora', category: 'Usinagem', widthCm: 280, heightCm: 220, icon: 'assets/machines/milling-machine.svg', tags: 'fresa convencional' },
    { id: 'surface-grinder', name: 'Retificadora', category: 'Usinagem', widthCm: 260, heightCm: 180, icon: 'assets/machines/surface-grinder.svg', tags: 'retífica acabamento' },
    { id: 'drill-press', name: 'Furadeira de coluna', category: 'Usinagem', widthCm: 120, heightCm: 100, icon: 'assets/machines/drill-press.svg', tags: 'furação bancada' },
    { id: 'bench-grinder', name: 'Esmerilhadeira', category: 'Usinagem', widthCm: 160, heightCm: 120, icon: 'assets/machines/bench-grinder.svg', tags: 'esmeril rebolo bancada acabamento' },
    { id: 'cnc-router', name: 'Router CNC', category: 'Usinagem', widthCm: 360, heightCm: 260, icon: 'assets/machines/cnc-router.svg', tags: 'router madeira plástico cnc' },
    { id: 'hydraulic-press', name: 'Prensa hidráulica', category: 'Conformação', widthCm: 240, heightCm: 220, icon: 'assets/machines/hydraulic-press.svg' },
    { id: 'press-brake', name: 'Dobradeira', category: 'Conformação', widthCm: 420, heightCm: 190, icon: 'assets/machines/press-brake.svg', tags: 'dobra prensa chapa' },
    { id: 'tube-bender', name: 'Dobradeira de tubos', category: 'Conformação', widthCm: 180, heightCm: 160, icon: 'assets/machines/tube-bender.svg', tags: 'dobra tubo perfilado' },
    { id: 'laser-cutter', name: 'Corte a laser', category: 'Corte', widthCm: 520, heightCm: 300, icon: 'assets/machines/laser-cutter.svg', tags: 'laser chapa mesa' },
    { id: 'plasma-cutter', name: 'Corte plasma', category: 'Corte', widthCm: 480, heightCm: 280, icon: 'assets/machines/plasma-cutter.svg', tags: 'plasma chapa mesa' },
    { id: 'band-saw', name: 'Serra de fita', category: 'Corte', widthCm: 250, heightCm: 160, icon: 'assets/machines/band-saw.svg', tags: 'serra corte metal' },
    { id: 'guillotine-shear', name: 'Guilhotina', category: 'Corte', widthCm: 420, heightCm: 220, icon: 'assets/machines/guillotine-shear.svg', tags: 'chapa cisalhamento corte' },
    { id: 'welding-cell', name: 'Célula de solda', category: 'Soldagem', widthCm: 400, heightCm: 350, icon: 'assets/machines/welding-cell.svg', tags: 'soldagem robô cabine' },
    { id: 'industrial-oven', name: 'Forno industrial', category: 'Tratamento térmico', widthCm: 400, heightCm: 320, icon: 'assets/machines/industrial-oven.svg', tags: 'forno estufa cura aquecimento tratamento térmico' },
    { id: 'tank', name: 'Tanque / Cuba', category: 'Tratamento térmico', widthCm: 180, heightCm: 180, icon: 'assets/machines/tank.svg', tags: 'tanque cuba banho tratamento superficial' },
    { id: 'injection-molder', name: 'Injetora', category: 'Plásticos', widthCm: 520, heightCm: 210, icon: 'assets/machines/injection-molder.svg' },
    { id: 'extrusion-line', name: 'Linha de extrusão', category: 'Plásticos', widthCm: 900, heightCm: 220, icon: 'assets/machines/extrusion-line.svg', tags: 'extrusora plástico linha processo' },
    { id: 'paint-booth', name: 'Cabine de pintura', category: 'Acabamento', widthCm: 600, heightCm: 400, icon: 'assets/machines/paint-booth.svg', tags: 'pintura cabine acabamento' },
    { id: 'granulator', name: 'Granulador', category: 'Reciclagem', widthCm: 220, heightCm: 180, icon: 'assets/machines/granulator.svg', tags: 'triturador moinho reciclagem plástico' },
    { id: 'palletizer', name: 'Paletizadora', category: 'Automação', widthCm: 400, heightCm: 400, icon: 'assets/machines/palletizer.svg', tags: 'palete robô fim de linha' },
    { id: 'industrial-robot', name: 'Robô industrial', category: 'Automação', widthCm: 260, heightCm: 260, icon: 'assets/machines/industrial-robot.svg' },
    { id: 'packaging-machine', name: 'Embaladora', category: 'Embalagem', widthCm: 450, heightCm: 180, icon: 'assets/machines/packaging-machine.svg', tags: 'embalagem seladora fim de linha' },
    { id: 'conveyor', name: 'Esteira', category: 'Movimentação', widthCm: 600, heightCm: 120, icon: 'assets/machines/conveyor.svg' },
    { id: 'forklift', name: 'Empilhadeira', category: 'Movimentação', widthCm: 320, heightCm: 190, icon: 'assets/machines/forklift.svg' },
    { id: 'overhead-crane', name: 'Ponte rolante', category: 'Movimentação', widthCm: 800, heightCm: 180, icon: 'assets/machines/overhead-crane.svg', tags: 'ponte talha içamento carga' },
    { id: 'agv', name: 'AGV industrial', category: 'Movimentação', widthCm: 240, heightCm: 120, icon: 'assets/machines/agv.svg', tags: 'veículo autônomo transporte logística' },
    { id: 'air-compressor', name: 'Compressor de ar', category: 'Utilidades', widthCm: 220, heightCm: 120, icon: 'assets/machines/air-compressor.svg', tags: 'ar comprimido reservatório' },
    { id: 'centrifugal-pump', name: 'Bomba centrífuga', category: 'Utilidades', widthCm: 180, heightCm: 100, icon: 'assets/machines/centrifugal-pump.svg', tags: 'bomba fluido água processo' },
    { id: 'industrial-chiller', name: 'Chiller industrial', category: 'Utilidades', widthCm: 320, heightCm: 180, icon: 'assets/machines/industrial-chiller.svg', tags: 'refrigeração água gelada utilidade' },
    { id: 'boiler', name: 'Caldeira', category: 'Utilidades', widthCm: 420, heightCm: 220, icon: 'assets/machines/boiler.svg', tags: 'vapor aquecimento térmico' },
    { id: 'storage-silo', name: 'Silo de armazenagem', category: 'Armazenagem', widthCm: 300, heightCm: 300, icon: 'assets/machines/storage-silo.svg', tags: 'silo granel matéria prima estoque' },
    { id: 'workbench', name: 'Bancada', category: 'Apoio', widthCm: 240, heightCm: 120, icon: 'assets/machines/workbench.svg' },
    { id: 'desk-single', name: 'Mesa individual', category: 'Mesas', widthCm: 140, heightCm: 80, icon: 'assets/machines/desk-single.svg', tags: 'mesa escritório estação trabalho' },
    { id: 'desk-l-shape', name: 'Mesa em L', category: 'Mesas', widthCm: 160, heightCm: 160, icon: 'assets/machines/desk-l-shape.svg', tags: 'mesa L escritório estação trabalho canto' },
    { id: 'desk-collective', name: 'Mesa coletiva', category: 'Mesas', widthCm: 240, heightCm: 100, icon: 'assets/machines/desk-collective.svg', tags: 'mesa coletiva bancada escritório open space' },
    { id: 'meeting-table', name: 'Mesa de reunião', category: 'Mesas', widthCm: 280, heightCm: 140, icon: 'assets/machines/meeting-table.svg', tags: 'mesa reunião sala conferência' },
    { id: 'refectory-table', name: 'Mesa de refeitório', category: 'Mesas', widthCm: 300, heightCm: 100, icon: 'assets/machines/refectory-table.svg', tags: 'mesa refeitório cantina cadeira refeição' }
];

function getInsertionArea(point = null) {
    if (!movementAreas.length) return null;
    if (point) {
        const areaAtPoint = movementAreas.find(area => {
            const vertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
            return area.visible !== false && pointInPolygon([point.x, point.y], vertices);
        });
        if (areaAtPoint) return areaAtPoint;
    }
    return movementAreas.find(area => area && area.visible !== false) || movementAreas[0];
}

async function insertMachine(definition, placement = null) {
    const area = getInsertionArea(placement);
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
    const x = placement
        ? Math.max(bounds.x, Math.min(placement.x - width / 2, bounds.x + bounds.width - width))
        : bounds.x + (bounds.width - width) / 2;
    const y = placement
        ? Math.max(bounds.y, Math.min(placement.y - height / 2, bounds.y + bounds.height - height))
        : bounds.y + (bounds.height - height) / 2;

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
    setIsEditingResourcePolygon(true);
    setEditingResourceId(resource.id);
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
    const openLibraryButton = document.getElementById('openMachineLibraryBtn');
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
            <button type="button" class="machine-card" data-machine-id="${machine.id}" draggable="true" title="Clique ou arraste ${machine.name} para o layout">
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
    openLibraryButton?.addEventListener('click', () => {
        setActiveTool(null);
        const leftSidebar = document.querySelector('.left-sidebar');
        if (leftSidebar?.classList.contains('collapsed')) {
            document.getElementById('toggleLeftSidebarBtn')?.click();
        }
        document.querySelector('.workspace-tab[data-workspace="machines"]')?.click();
        requestAnimationFrame(() => search.focus());
    });
    onMeasurementUnitChange(render);
    grid.addEventListener('click', event => {
        const card = event.target.closest('[data-machine-id]');
        if (!card) return;
        const definition = MACHINE_LIBRARY.find(machine => machine.id === card.dataset.machineId);
        if (definition) insertMachine(definition);
    });
    grid.addEventListener('dragstart', event => {
        const card = event.target.closest('[data-machine-id]');
        if (!card || !event.dataTransfer) return;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-gregorios-machine', card.dataset.machineId);
    });

    const canvas = getCanvas();
    canvas?.addEventListener('dragover', event => {
        if (Array.from(event.dataTransfer?.types || []).includes('application/x-gregorios-machine')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
    });
    canvas?.addEventListener('drop', event => {
        const machineId = event.dataTransfer?.getData('application/x-gregorios-machine');
        if (!machineId) return;
        event.preventDefault();
        const definition = MACHINE_LIBRARY.find(machine => machine.id === machineId);
        if (!definition) return;
        const rect = canvas.getBoundingClientRect();
        const placement = {
            x: (event.clientX - rect.left - getOffsetXCanvas()) / getScale(),
            y: (event.clientY - rect.top - getOffsetYCanvas()) / getScale()
        };
        insertMachine(definition, placement);
    });

    render();
}
