import {
    resources,
    getSelectedResourceIds,
    setSelectedResourceIds
} from './state.js';
import { onStateAction } from './state/events.js';
import {
    calculatePolygonBounds,
    migrateResourceToPolygonal,
    translateLabelAnchor,
    updateResourceCompatibilityProperties
} from './resources.js';
import { canMoveResourceTo, checkResourceOverlap } from './merge_resources/resource_operations.js';
import { duplicateResource } from './merge_resources/duplicateResource.js';
import { saveStateToHistory } from './history.js';
import { updateConnectionPathsForResource } from './connections.js';
import { updateConnectionDistancesTable } from './flow-metrics.js';
import { drawAll } from './drawing.js';
import { showToast } from './ui-shell.js';

const ACTION_LABELS = {
    'align-left': 'Alinhar à esquerda',
    'align-center': 'Centralizar horizontalmente',
    'align-right': 'Alinhar à direita',
    'align-top': 'Alinhar ao topo',
    'align-middle': 'Centralizar verticalmente',
    'align-bottom': 'Alinhar à base',
    'distribute-horizontal': 'Distribuir horizontalmente',
    'distribute-vertical': 'Distribuir verticalmente'
};

function selectedResources() {
    const ids = new Set(getSelectedResourceIds());
    return resources.filter(resource => ids.has(resource.id));
}

function boundsOf(resource) {
    const migrated = migrateResourceToPolygonal(resource);
    return calculatePolygonBounds(migrated.vertices);
}

function generateGroupId() {
    return `layout-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildAlignmentPlan(items, action) {
    const entries = items.map(resource => ({ resource, bounds: boundsOf(resource) }));
    const overall = {
        minX: Math.min(...entries.map(entry => entry.bounds.minX)),
        maxX: Math.max(...entries.map(entry => entry.bounds.maxX)),
        minY: Math.min(...entries.map(entry => entry.bounds.minY)),
        maxY: Math.max(...entries.map(entry => entry.bounds.maxY))
    };
    overall.centerX = (overall.minX + overall.maxX) / 2;
    overall.centerY = (overall.minY + overall.maxY) / 2;

    if (action === 'distribute-horizontal') {
        const ordered = [...entries].sort((a, b) => a.bounds.x - b.bounds.x);
        const totalWidth = ordered.reduce((sum, entry) => sum + entry.bounds.width, 0);
        const gap = (overall.maxX - overall.minX - totalWidth) / (ordered.length - 1);
        let cursor = overall.minX;
        return ordered.map(entry => {
            const dx = cursor - entry.bounds.minX;
            cursor += entry.bounds.width + gap;
            return { resource: entry.resource, dx, dy: 0 };
        });
    }

    if (action === 'distribute-vertical') {
        const ordered = [...entries].sort((a, b) => a.bounds.y - b.bounds.y);
        const totalHeight = ordered.reduce((sum, entry) => sum + entry.bounds.height, 0);
        const gap = (overall.maxY - overall.minY - totalHeight) / (ordered.length - 1);
        let cursor = overall.minY;
        return ordered.map(entry => {
            const dy = cursor - entry.bounds.minY;
            cursor += entry.bounds.height + gap;
            return { resource: entry.resource, dx: 0, dy };
        });
    }

    return entries.map(entry => {
        let dx = 0;
        let dy = 0;
        if (action === 'align-left') dx = overall.minX - entry.bounds.minX;
        if (action === 'align-center') dx = overall.centerX - (entry.bounds.minX + entry.bounds.maxX) / 2;
        if (action === 'align-right') dx = overall.maxX - entry.bounds.maxX;
        if (action === 'align-top') dy = overall.minY - entry.bounds.minY;
        if (action === 'align-middle') dy = overall.centerY - (entry.bounds.minY + entry.bounds.maxY) / 2;
        if (action === 'align-bottom') dy = overall.maxY - entry.bounds.maxY;
        return { resource: entry.resource, dx, dy };
    });
}

function validatePlan(plan) {
    const selectedIds = plan.map(item => item.resource.id);
    const candidates = plan.map(item => {
        const vertices = migrateResourceToPolygonal(item.resource).vertices
            .map(([x, y]) => [x + item.dx, y + item.dy]);
        return { ...item, vertices };
    });

    const withinConstraints = candidates.every(candidate => canMoveResourceTo(
        candidate.resource,
        candidate.vertices,
        { ignoreResourceIds: selectedIds }
    ));
    if (!withinConstraints) return null;

    for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
            const first = candidates[i].resource;
            const second = candidates[j].resource;
            const canOverlap = first.type === 'operator'
                || second.type === 'operator'
                || first.machineType === 'overhead-crane'
                || second.machineType === 'overhead-crane';
            if (!canOverlap && checkResourceOverlap(candidates[i].vertices, candidates[j].vertices)) {
                return null;
            }
        }
    }
    return candidates;
}

function applyPlan(action) {
    const items = selectedResources().filter(resource => !resource.locked);
    const minimum = action.startsWith('distribute-') ? 3 : 2;
    if (items.length < minimum) {
        showToast(`Selecione pelo menos ${minimum} itens desbloqueados.`, 'warning');
        return;
    }

    const candidates = validatePlan(buildAlignmentPlan(items, action));
    if (!candidates) {
        showToast('O comando causaria colisão ou sairia da área do layout.', 'warning');
        return;
    }

    saveStateToHistory(ACTION_LABELS[action]);
    candidates.forEach(candidate => {
        candidate.resource.vertices = candidate.vertices;
        updateResourceCompatibilityProperties(candidate.resource);
        translateLabelAnchor(candidate.resource, candidate.dx, candidate.dy);
        if (candidate.resource.stairConfig && typeof window.applyStairTranslation === 'function') {
            window.applyStairTranslation(candidate.resource, candidate.dx, candidate.dy, { skipGeometry: true });
        }
        updateConnectionPathsForResource(candidate.resource.id);
    });
    updateConnectionDistancesTable();
    drawAll();
    showToast(`${ACTION_LABELS[action]} concluído.`, 'success');
}

async function duplicateSelection() {
    const items = selectedResources().filter(resource => !resource.locked);
    if (!items.length) return;
    saveStateToHistory(items.length > 1 ? 'Duplicar seleção' : 'Duplicar recurso');
    const copies = [];
    for (const resource of items) {
        const copy = await duplicateResource(resource);
        if (copy) copies.push(copy.id);
    }
    if (copies.length) {
        setSelectedResourceIds(copies, copies[0]);
        drawAll();
        showToast(`${copies.length} ${copies.length === 1 ? 'item duplicado' : 'itens duplicados'}.`, 'success');
    }
}

function groupSelection() {
    const items = selectedResources();
    if (items.length < 2) return;
    saveStateToHistory('Agrupar recursos');
    const groupId = generateGroupId();
    items.forEach(resource => { resource.layoutGroupId = groupId; });
    drawAll();
    showToast(`${items.length} itens agrupados.`, 'success');
}

function ungroupSelection() {
    const items = selectedResources();
    const grouped = items.filter(resource => resource.layoutGroupId);
    if (!grouped.length) return;
    saveStateToHistory('Desagrupar recursos');
    const groupIds = new Set(grouped.map(resource => resource.layoutGroupId));
    resources.forEach(resource => {
        if (groupIds.has(resource.layoutGroupId)) delete resource.layoutGroupId;
    });
    drawAll();
    showToast('Grupo desfeito.', 'success');
}

export function initializeSelectionActions() {
    const toolbar = document.getElementById('selectionActions');
    const count = document.getElementById('selectionActionsCount');
    if (!toolbar || !count) return;

    const render = () => {
        const items = selectedResources();
        toolbar.classList.toggle('hidden', items.length < 2);
        count.textContent = `${items.length} selecionados`;
        const hasGroup = items.some(resource => resource.layoutGroupId);
        toolbar.querySelector('[data-selection-action="group"]')?.toggleAttribute('disabled', items.length < 2);
        toolbar.querySelector('[data-selection-action="ungroup"]')?.toggleAttribute('disabled', !hasGroup);
        toolbar.querySelectorAll('[data-selection-action^="distribute-"]').forEach(button => {
            button.toggleAttribute('disabled', items.filter(resource => !resource.locked).length < 3);
        });
    };

    toolbar.addEventListener('click', event => {
        const button = event.target.closest('[data-selection-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.selectionAction;
        if (action === 'duplicate') duplicateSelection();
        else if (action === 'group') groupSelection();
        else if (action === 'ungroup') ungroupSelection();
        else applyPlan(action);
    });

    onStateAction('resource-selection/changed', render);
    onStateAction('selection/cleared', render);
    render();
}
