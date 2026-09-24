import { resources, getSelectedResourceId } from './state.js';
import { onStateAction } from './state/events.js';
import { pixelsPerCm } from './config.js';
import { calculatePolygonBounds, resizeResource } from './resources.js';
import { rotateResource } from './merge_resources/rotateresource.js';
import { saveStateToHistory } from './history.js';
import { drawAll } from './drawing.js';
import { showToast } from './ui-shell.js';

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
    if (!form || !empty || !nameInput || !widthInput || !heightInput || !rotationOutput) return;

    const render = () => {
        const resource = getSelectedResource();
        form.classList.toggle('hidden', !resource);
        empty.classList.toggle('hidden', Boolean(resource));
        if (!resource) {
            if (badge) badge.textContent = 'Nada selecionado';
            return;
        }

        const bounds = getBounds(resource);
        nameInput.value = resource.name || 'Recurso';
        widthInput.value = String(Math.round((bounds.width / pixelsPerCm) * 10) / 10);
        heightInput.value = String(Math.round((bounds.height / pixelsPerCm) * 10) / 10);
        rotationOutput.textContent = `${Math.round(resource.rotation || 0)}°`;
        if (badge) badge.textContent = resource.machineType ? 'Máquina SVG' : 'Recurso';
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        const resource = getSelectedResource();
        if (!resource) return;
        const widthCm = Number(widthInput.value);
        const heightCm = Number(heightInput.value);
        if (!(widthCm > 0) || !(heightCm > 0)) {
            showToast('Informe medidas maiores que zero.', 'warning');
            return;
        }

        saveStateToHistory('Atualizar propriedades do recurso');
        const oldName = resource.name;
        const oldVertices = resource.vertices?.map(vertex => [...vertex]);
        const oldGeometry = { x: resource.x, y: resource.y, width: resource.width, height: resource.height };
        resource.name = nameInput.value.trim() || oldName || 'Recurso';
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

    onStateAction('resource-selection/changed', render);
    onStateAction('selection/cleared', render);
    render();
}
