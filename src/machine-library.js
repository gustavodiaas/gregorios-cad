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
import { formatLength, parseMeasurementInput, onMeasurementUnitChange } from './measurement-units.js';

const CUSTOM_LIBRARY_STORAGE_KEY = 'gregorios-cad-custom-stencils-v1';
const MAX_SVG_BYTES = 750 * 1024;

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
    { id: 'packaging-machine', name: 'Embaladora', category: 'Embalagem', widthCm: 450, heightCm: 180, icon: 'assets/machines/packaging-machine.svg', tags: 'embalagem seladora fim de linha' },
    { id: 'guillotine-shear', name: 'Guilhotina', category: 'Corte', widthCm: 420, heightCm: 220, icon: 'assets/machines/guillotine-shear.svg', tags: 'chapa cisalhamento corte' },
    { id: 'cnc-router', name: 'Router CNC', category: 'Usinagem', widthCm: 360, heightCm: 260, icon: 'assets/machines/cnc-router.svg', tags: 'router madeira plástico cnc' },
    { id: 'industrial-oven', name: 'Forno industrial', category: 'Tratamento térmico', widthCm: 400, heightCm: 320, icon: 'assets/machines/industrial-oven.svg', tags: 'forno estufa cura aquecimento' },
    { id: 'mixing-tank', name: 'Tanque misturador', category: 'Processo', widthCm: 280, heightCm: 280, icon: 'assets/machines/mixing-tank.svg', tags: 'tanque mistura agitador processo' },
    { id: 'centrifugal-pump', name: 'Bomba centrífuga', category: 'Utilidades', widthCm: 180, heightCm: 100, icon: 'assets/machines/centrifugal-pump.svg', tags: 'bomba fluido água processo' },
    { id: 'industrial-chiller', name: 'Chiller industrial', category: 'Utilidades', widthCm: 320, heightCm: 180, icon: 'assets/machines/industrial-chiller.svg', tags: 'refrigeração água gelada utilidade' },
    { id: 'boiler', name: 'Caldeira', category: 'Utilidades', widthCm: 420, heightCm: 220, icon: 'assets/machines/boiler.svg', tags: 'vapor aquecimento térmico' },
    { id: 'agv', name: 'AGV industrial', category: 'Movimentação', widthCm: 240, heightCm: 120, icon: 'assets/machines/agv.svg', tags: 'veículo autônomo transporte logística' },
    { id: 'overhead-crane', name: 'Ponte rolante', category: 'Movimentação', widthCm: 800, heightCm: 180, icon: 'assets/machines/overhead-crane.svg', tags: 'ponte talha içamento carga' },
    { id: 'storage-silo', name: 'Silo de armazenagem', category: 'Armazenagem', widthCm: 300, heightCm: 300, icon: 'assets/machines/storage-silo.svg', tags: 'silo granel matéria prima estoque' },
    { id: 'extrusion-line', name: 'Linha de extrusão', category: 'Plásticos', widthCm: 900, heightCm: 220, icon: 'assets/machines/extrusion-line.svg', tags: 'extrusora plástico linha processo' },
    { id: 'granulator', name: 'Granulador', category: 'Reciclagem', widthCm: 220, heightCm: 180, icon: 'assets/machines/granulator.svg', tags: 'triturador moinho reciclagem plástico' },
    { id: 'restroom', name: 'Banheiro', category: 'Infraestrutura', widthCm: 240, heightCm: 180, icon: 'assets/machines/restroom.svg', tags: 'banheiro sanitário lavabo vaso pia arquitetura' },
    { id: 'single-door', name: 'Porta simples', category: 'Aberturas', widthCm: 90, heightCm: 90, icon: 'assets/machines/single-door.svg', tags: 'porta abertura giro acesso arquitetura' },
    { id: 'double-door', name: 'Porta dupla', category: 'Aberturas', widthCm: 180, heightCm: 90, icon: 'assets/machines/double-door.svg', tags: 'porta dupla abertura giro acesso arquitetura' },
    { id: 'industrial-window', name: 'Janela', category: 'Aberturas', widthCm: 150, heightCm: 20, icon: 'assets/machines/industrial-window.svg', tags: 'janela vidro esquadria abertura arquitetura' },
    { id: 'straight-stair', name: 'Escada reta', category: 'Circulação', widthCm: 300, heightCm: 110, icon: 'assets/machines/straight-stair.svg', tags: 'escada reta degraus circulação acesso' },
    { id: 'l-stair', name: 'Escada em L', category: 'Circulação', widthCm: 260, heightCm: 220, icon: 'assets/machines/l-stair.svg', tags: 'escada l patamar degraus circulação acesso' },
    { id: 'pallet-rack', name: 'Porta-paletes', category: 'Armazenagem', widthCm: 270, heightCm: 110, icon: 'assets/machines/pallet-rack.svg', tags: 'prateleira rack porta palete estoque armazenagem' },
    { id: 'storage-shelf', name: 'Prateleira', category: 'Armazenagem', widthCm: 180, heightCm: 50, icon: 'assets/machines/storage-shelf.svg', tags: 'prateleira estante estoque armazenagem peças' }
];

let customMachines = loadCustomMachines();

function loadCustomMachines() {
    try {
        const stored = JSON.parse(localStorage.getItem(CUSTOM_LIBRARY_STORAGE_KEY) || '[]');
        return Array.isArray(stored) ? stored.filter(item => item?.id && item?.icon && item?.name) : [];
    } catch {
        return [];
    }
}

function saveCustomMachines() {
    try {
        localStorage.setItem(CUSTOM_LIBRARY_STORAGE_KEY, JSON.stringify(customMachines));
        return true;
    } catch {
        return false;
    }
}

function getMachineDefinitions() {
    return [...MACHINE_LIBRARY, ...customMachines];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function sanitizeSvg(svgText) {
    const documentNode = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (documentNode.querySelector('parsererror') || documentNode.documentElement?.tagName.toLowerCase() !== 'svg') {
        throw new Error('Arquivo SVG inválido.');
    }
    documentNode.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(node => node.remove());
    documentNode.querySelectorAll('*').forEach(node => {
        Array.from(node.attributes).forEach(attribute => {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim().toLowerCase();
            if (name.startsWith('on')) node.removeAttribute(attribute.name);
            if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#')) node.removeAttribute(attribute.name);
            if (name === 'style' && /url\s*\(/i.test(value)) node.removeAttribute(attribute.name);
        });
    });
    const root = documentNode.documentElement;
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(root);
}

function svgToDataUrl(svgText) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

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
    resource.manufacturer = definition.manufacturer || '';
    resource.serialNumber = definition.serialNumber || '';
    resource.capacity = definition.capacity || '';
    resource.cycleTimeSeconds = Math.max(0, Number(definition.cycleTimeSeconds) || 0);
    resource.customStencilId = definition.custom ? definition.id : null;
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
    const importButton = document.getElementById('openCustomStencilFormBtn');
    const closeImportButton = document.getElementById('closeCustomStencilFormBtn');
    const customForm = document.getElementById('customStencilForm');
    const fileInput = document.getElementById('customStencilFile');
    const preview = document.getElementById('customStencilPreview');
    if (!grid || !search || !filters) return;

    let activeCategory = 'Todas';
    let pendingSvgDataUrl = '';

    const renderFilters = () => {
        const categories = ['Todas', ...new Set(getMachineDefinitions().map(machine => machine.category))];
        if (!categories.includes(activeCategory)) activeCategory = 'Todas';
        filters.innerHTML = categories.map(category => (
            `<button type="button" class="library-filter${category === activeCategory ? ' active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
        )).join('');
    };

    const render = () => {
        const query = search.value.trim().toLocaleLowerCase('pt-BR');
        const visible = getMachineDefinitions().filter(machine => {
            const matchesCategory = activeCategory === 'Todas' || machine.category === activeCategory;
            const haystack = `${machine.name} ${machine.category} ${machine.tags || ''}`.toLocaleLowerCase('pt-BR');
            return matchesCategory && haystack.includes(query);
        });

        if (count) count.textContent = String(visible.length);
        grid.innerHTML = visible.map(machine => `
            <button type="button" class="machine-card${machine.custom ? ' machine-card-custom' : ''}" data-machine-id="${escapeHtml(machine.id)}" draggable="true" title="Clique ou arraste ${escapeHtml(machine.name)} para o layout">
                <span class="machine-card-visual"><img src="${escapeHtml(machine.icon)}" alt=""></span>
                <span class="machine-card-copy"><strong>${escapeHtml(machine.name)}</strong><small>${escapeHtml(machine.category)}</small><small>${formatLength(machine.widthCm)} × ${formatLength(machine.heightCm)}</small></span>
                ${machine.custom ? '<span class="machine-card-custom-badge">Meu SVG</span>' : ''}
                <i class="fas fa-plus machine-card-add" aria-hidden="true"></i>
            </button>
        `).join('') || '<div class="library-empty">Nenhum stencil encontrado.</div>';
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
    const closeCustomForm = () => {
        customForm?.classList.add('hidden');
        customForm?.reset();
        pendingSvgDataUrl = '';
        if (preview) preview.innerHTML = '<i class="fas fa-file-code"></i>';
    };
    importButton?.addEventListener('click', () => {
        customForm?.classList.remove('hidden');
        document.getElementById('customStencilName')?.focus();
    });
    closeImportButton?.addEventListener('click', closeCustomForm);
    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (file.size > MAX_SVG_BYTES || (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml')) {
            showToast('Escolha um SVG válido de até 750 KB.', 'warning');
            fileInput.value = '';
            return;
        }
        try {
            const sanitized = sanitizeSvg(await file.text());
            pendingSvgDataUrl = svgToDataUrl(sanitized);
            if (preview) preview.innerHTML = `<img src="${escapeHtml(pendingSvgDataUrl)}" alt="Prévia do SVG">`;
            const nameInput = document.getElementById('customStencilName');
            if (nameInput && !nameInput.value) nameInput.value = file.name.replace(/\.svg$/i, '').replace(/[-_]+/g, ' ');
        } catch (error) {
            pendingSvgDataUrl = '';
            fileInput.value = '';
            showToast(error.message || 'Não foi possível ler o SVG.', 'warning');
        }
    });
    customForm?.addEventListener('submit', event => {
        event.preventDefault();
        const name = document.getElementById('customStencilName')?.value.trim();
        const widthCm = parseMeasurementInput(document.getElementById('customStencilWidth')?.value || '');
        const heightCm = parseMeasurementInput(document.getElementById('customStencilHeight')?.value || '');
        if (!pendingSvgDataUrl) {
            showToast('Selecione o arquivo SVG da máquina.', 'warning');
            return;
        }
        if (!name || !(widthCm > 0) || !(heightCm > 0)) {
            showToast('Informe nome, largura e altura válidos.', 'warning');
            return;
        }
        const definition = {
            id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            category: document.getElementById('customStencilCategory')?.value.trim() || 'Personalizados',
            widthCm,
            heightCm,
            icon: pendingSvgDataUrl,
            manufacturer: document.getElementById('customStencilManufacturer')?.value.trim() || '',
            serialNumber: document.getElementById('customStencilSerial')?.value.trim() || '',
            capacity: document.getElementById('customStencilCapacity')?.value.trim() || '',
            cycleTimeSeconds: Math.max(0, Number(document.getElementById('customStencilCycleTime')?.value) || 0),
            tags: document.getElementById('customStencilTags')?.value.trim() || '',
            custom: true
        };
        customMachines.push(definition);
        if (!saveCustomMachines()) {
            customMachines.pop();
            showToast('O navegador não conseguiu armazenar este SVG.', 'warning');
            return;
        }
        activeCategory = definition.category;
        renderFilters();
        render();
        closeCustomForm();
        showToast(`${definition.name} foi salvo na biblioteca.`, 'success');
    });
    onMeasurementUnitChange(render);
    grid.addEventListener('click', event => {
        const card = event.target.closest('[data-machine-id]');
        if (!card) return;
        const definition = getMachineDefinitions().find(machine => machine.id === card.dataset.machineId);
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
        const definition = getMachineDefinitions().find(machine => machine.id === machineId);
        if (!definition) return;
        const rect = canvas.getBoundingClientRect();
        const placement = {
            x: (event.clientX - rect.left - getOffsetXCanvas()) / getScale(),
            y: (event.clientY - rect.top - getOffsetYCanvas()) / getScale()
        };
        insertMachine(definition, placement);
    });

    renderFilters();
    render();
}
