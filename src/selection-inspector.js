import { resources, getSelectedResourceId } from './state.js';
import { onStateAction } from './state/events.js';
import { pixelsPerCm } from './config.js';
import { calculatePolygonBounds, resizeResource, stopResourcePolygonEditing } from './resources.js';
import { rotateResource } from './merge_resources/rotateresource.js';
import { saveStateToHistory } from './history.js';
import { drawAll } from './drawing.js';
import { setRightSidebarVisible, showToast } from './ui-shell.js';
import { formatLength, formatMeasurementInput, parseMeasurementInput, onMeasurementUnitChange } from './measurement-units.js';

function getSelectedResource() {
    const id = getSelectedResourceId();
    return resources.find(resource => resource.id === id) || null;
}

function getBounds(resource) {
    if (resource?.vertices?.length) return calculatePolygonBounds(resource.vertices);
    return { width: resource?.width || 0, height: resource?.height || 0 };
}

export function initializeSelectionInspector() {
    const form = document.getElementById('resourceInspectorForm');
    const empty = document.getElementById('selectionEmptyState');
    const badge = document.getElementById('selectionTypeBadge');
    const nameInput = document.getElementById('inspectorResourceName');
    const widthInput = document.getElementById('inspectorResourceWidth');
    const heightInput = document.getElementById('inspectorResourceHeight');
    const rotationOutput = document.getElementById('inspectorResourceRotation');
    const manufacturerInput = document.getElementById('inspectorManufacturer');
    const serialNumberInput = document.getElementById('inspectorSerialNumber');
    const cycleTimeInput = document.getElementById('inspectorCycleTime');
    const initialStockInput = document.getElementById('inspectorInitialStock');
    const catalogReference = document.getElementById('machineCatalogReference');
    const catalogDimensions = document.getElementById('machineCatalogDimensions');
    const resetDimensionsButton = document.getElementById('resetMachineDimensionsBtn');
    const closeButton = document.getElementById('closeRightSidebarBtn');
    if (!form || !empty || !nameInput || !widthInput || !heightInput || !rotationOutput) return;

    const closeInspector = () => {
        setRightSidebarVisible(false);
        stopResourcePolygonEditing();
        drawAll();
    };

    const render = () => {
        const resource = getSelectedResource();
        form.classList.toggle('hidden', !resource);
        empty.classList.toggle('hidden', Boolean(resource));
        if (!resource) {
            if (badge) badge.textContent = 'Nada selecionado';
            catalogReference?.classList.add('hidden');
            return;
        }

        const bounds = getBounds(resource);
        nameInput.value = resource.name || 'Recurso';
        widthInput.value = formatMeasurementInput(bounds.width / pixelsPerCm);
        heightInput.value = formatMeasurementInput(bounds.height / pixelsPerCm);
        if (manufacturerInput) manufacturerInput.value = resource.manufacturer || '';
        if (serialNumberInput) serialNumberInput.value = resource.serialNumber || '';
        if (cycleTimeInput) cycleTimeInput.value = resource.cycleTimeSeconds ?? '';
        if (initialStockInput) initialStockInput.value = resource.initialStock ?? 0;
        rotationOutput.textContent = `${Math.round(resource.rotation || 0)}°`;
        if (badge) badge.textContent = resource.machineType ? 'Máquina SVG' : 'Recurso';
        const hasCatalogSize = resource.machineType && resource.catalogWidthCm > 0 && resource.catalogHeightCm > 0;
        catalogReference?.classList.toggle('hidden', !hasCatalogSize);
        if (catalogDimensions && hasCatalogSize) {
            catalogDimensions.textContent = `${formatLength(resource.catalogWidthCm)} × ${formatLength(resource.catalogHeightCm)}`;
        }
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        const resource = getSelectedResource();
        if (!resource) return;
        const widthCm = parseMeasurementInput(widthInput.value);
        const heightCm = parseMeasurementInput(heightInput.value);
        if (!(widthCm > 0) || !(heightCm > 0)) {
            showToast('Informe medidas maiores que zero.', 'warning');
            return;
        }

        saveStateToHistory('Atualizar propriedades do recurso');
        const oldName = resource.name;
        const oldVertices = resource.vertices?.map(vertex => [...vertex]);
        const oldGeometry = { x: resource.x, y: resource.y, width: resource.width, height: resource.height };
        resource.name = nameInput.value.trim() || oldName || 'Recurso';
        resource.manufacturer = manufacturerInput?.value.trim() || '';
        resource.serialNumber = serialNumberInput?.value.trim() || '';
        resource.cycleTimeSeconds = Math.max(0, Number(cycleTimeInput?.value) || 0);
        resource.initialStock = Math.max(0, Math.floor(Number(initialStockInput?.value) || 0));
        const resized = resizeResource(resource.id, widthCm * pixelsPerCm, heightCm * pixelsPerCm);
        if (!resized) {
            resource.name = oldName;
            if (oldVertices) resource.vertices = oldVertices;
            Object.assign(resource, oldGeometry);
            showToast('A máquina não cabe na área com essas medidas.', 'warning');
            drawAll();
            render();
            return;
        }
        drawAll();
        render();
        showToast('Medidas atualizadas.', 'success');
        closeInspector();
    });

    form.querySelectorAll('[data-rotate]').forEach(button => {
        button.addEventListener('click', async () => {
            const resource = getSelectedResource();
            if (!resource) return;
            const angle = Number(button.dataset.rotate || 0);
            saveStateToHistory('Rotacionar recurso');
            await rotateResource(resource, angle);
            render();
        });
    });

    resetDimensionsButton?.addEventListener('click', () => {
        const resource = getSelectedResource();
        if (!resource?.catalogWidthCm || !resource?.catalogHeightCm) return;
        saveStateToHistory('Restaurar dimensões de catálogo');
        const resized = resizeResource(
            resource.id,
            resource.catalogWidthCm * pixelsPerCm,
            resource.catalogHeightCm * pixelsPerCm
        );
        if (!resized) {
            showToast('O tamanho de catálogo não cabe na área atual.', 'warning');
            return;
        }
        drawAll();
        render();
        showToast('Tamanho de catálogo restaurado.', 'success');
    });

    closeButton?.addEventListener('click', closeInspector);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeInspector();
    });

    onStateAction('resource-selection/changed', render);
    onStateAction('selection/cleared', render);
    onMeasurementUnitChange(render);
    render();
}
