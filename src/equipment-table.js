import {
    getAllFloors,
    getCurrentFloorId,
    getSelectedResourceId,
    setActiveFloor,
    setEditingResourceId,
    setIsEditingResourcePolygon,
    setSelectedResourceId,
    subscribeToFloorChanges
} from './state.js';
import { onStateAction } from './state/events.js';
import { pixelsPerCm } from './config.js';
import { drawAll } from './drawing.js';
import { setRightSidebarVisible, showToast } from './ui-shell.js';
import { formatLength, onMeasurementUnitChange } from './measurement-units.js';
import { getLayoutTitle } from './layout-metadata.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getResourceBounds(resource) {
    if (Array.isArray(resource?.vertices) && resource.vertices.length) {
        const xs = resource.vertices.map(vertex => Number(vertex[0]) || 0);
        const ys = resource.vertices.map(vertex => Number(vertex[1]) || 0);
        return {
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
        };
    }
    return { width: Number(resource?.width) || 0, height: Number(resource?.height) || 0 };
}

function isEquipment(resource) {
    return resource && resource.visible !== false && resource.type !== 'operator' && resource.type !== 'stair' && !resource.stairConfig;
}

function collectEquipment() {
    return getAllFloors().flatMap(floor => (floor.resources || [])
        .filter(isEquipment)
        .map(resource => {
            const bounds = getResourceBounds(resource);
            const widthCm = bounds.width / pixelsPerCm;
            const heightCm = bounds.height / pixelsPerCm;
            return {
                resource,
                floorId: floor.id,
                floorName: floor.name,
                widthCm,
                heightCm,
                areaM2: (widthCm * heightCm) / 10000
            };
        }))
        .map((row, index) => ({ ...row, code: `EQ-${String(index + 1).padStart(3, '0')}` }));
}

function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function safeFileName(value) {
    return String(value || 'layout').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'layout';
}

export function initializeEquipmentTable() {
    const openButton = document.getElementById('openEquipmentTableBtn');
    const overlay = document.getElementById('equipmentTableOverlay');
    const panel = document.getElementById('equipmentTablePanel');
    const region = document.getElementById('equipmentTableRegion');
    const search = document.getElementById('equipmentTableSearch');
    const exportButton = document.getElementById('exportEquipmentCsvBtn');
    const scopeButtons = Array.from(document.querySelectorAll('[data-equipment-scope]'));
    const closeButtons = [
        document.getElementById('closeEquipmentTableBtn'),
        document.getElementById('closeEquipmentTableFooterBtn')
    ].filter(Boolean);
    if (!openButton || !overlay || !panel || !region || !search) return;

    let scope = 'all';
    let visibleRows = [];

    const resizeWorkspace = () => {
        requestAnimationFrame(() => window.resizeCanvas?.());
        setTimeout(() => window.resizeCanvas?.(), 280);
    };

    const render = () => {
        const query = search.value.trim().toLocaleLowerCase('pt-BR');
        const currentFloorId = getCurrentFloorId();
        const allRows = collectEquipment();
        visibleRows = allRows.filter(row => {
            if (scope === 'current' && row.floorId !== currentFloorId) return false;
            const resource = row.resource;
            const haystack = [resource.name, resource.machineCategory, resource.manufacturer, resource.serialNumber, resource.capacity, row.floorName]
                .join(' ').toLocaleLowerCase('pt-BR');
            return haystack.includes(query);
        });

        const machineCount = allRows.filter(row => Boolean(row.resource.machineType)).length;
        const totalArea = allRows.reduce((sum, row) => sum + row.areaM2, 0);
        document.getElementById('equipmentCountMetric').textContent = String(allRows.length);
        document.getElementById('machineCountMetric').textContent = String(machineCount);
        document.getElementById('equipmentAreaMetric').textContent = `${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;

        if (!visibleRows.length) {
            region.innerHTML = '<div class="equipment-table-empty"><i class="fas fa-table-list"></i><strong>Nenhum equipamento encontrado</strong><span>Adicione máquinas ao layout ou altere os filtros.</span></div>';
            return;
        }

        const selectedId = getSelectedResourceId();
        region.innerHTML = `<table class="equipment-data-table">
            <thead><tr><th>Equipamento</th><th>Pavimento</th><th>Dimensões</th><th>Identificação</th><th>Capacidade</th><th>Ciclo</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${visibleRows.map(row => {
                const resource = row.resource;
                const category = resource.machineCategory || (resource.machineType ? 'Máquina' : 'Recurso');
                const identification = [resource.manufacturer, resource.serialNumber].filter(Boolean).join(' · ') || '—';
                return `<tr data-resource-id="${escapeHtml(resource.id)}" data-floor-id="${escapeHtml(row.floorId)}" class="${resource.id === selectedId ? 'selected' : ''}">
                    <td><span class="equipment-code">${row.code}</span><strong>${escapeHtml(resource.name || 'Recurso')}</strong><small>${escapeHtml(category)}</small></td>
                    <td>${escapeHtml(row.floorName)}</td>
                    <td>${formatLength(row.widthCm)} × ${formatLength(row.heightCm)}<small>${row.areaM2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²</small></td>
                    <td>${escapeHtml(identification)}</td>
                    <td>${escapeHtml(resource.capacity || '—')}</td>
                    <td>${resource.cycleTimeSeconds > 0 ? `${Number(resource.cycleTimeSeconds).toLocaleString('pt-BR')} s` : '—'}</td>
                    <td><button type="button" data-edit-equipment title="Abrir propriedades" aria-label="Abrir propriedades de ${escapeHtml(resource.name || 'recurso')}"><i class="fas fa-pen"></i></button></td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    };

    const close = ({ restoreFocus = true } = {}) => {
        if (!overlay.classList.contains('open')) return;
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('equipment-table-open');
        openButton.classList.remove('active');
        openButton.setAttribute('aria-expanded', 'false');
        resizeWorkspace();
        if (restoreFocus) openButton.focus();
    };

    const open = () => {
        document.getElementById('closeSpaghettiDiagramBtn')?.click();
        render();
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('equipment-table-open');
        openButton.classList.add('active');
        openButton.setAttribute('aria-expanded', 'true');
        resizeWorkspace();
        requestAnimationFrame(() => search.focus());
    };

    const selectRow = (rowElement, edit = false) => {
        const resourceId = rowElement?.dataset.resourceId;
        const floorId = rowElement?.dataset.floorId;
        if (!resourceId || !floorId) return;
        if (floorId !== getCurrentFloorId()) setActiveFloor(floorId);
        setSelectedResourceId(resourceId);
        setIsEditingResourcePolygon(true);
        setEditingResourceId(resourceId);
        drawAll();
        render();
        if (edit) {
            close({ restoreFocus: false });
            setRightSidebarVisible(true);
        }
    };

    const exportCsv = () => {
        if (!visibleRows.length) {
            showToast('Não há equipamentos para exportar.', 'warning');
            return;
        }
        const header = ['Código', 'Equipamento', 'Categoria', 'Pavimento', 'Largura', 'Altura', 'Área (m²)', 'Fabricante', 'Número de série', 'Capacidade', 'Tempo de ciclo (s)'];
        const body = visibleRows.map(row => {
            const resource = row.resource;
            return [
                row.code,
                resource.name || 'Recurso',
                resource.machineCategory || (resource.machineType ? 'Máquina' : 'Recurso'),
                row.floorName,
                formatLength(row.widthCm),
                formatLength(row.heightCm),
                row.areaM2.toLocaleString('pt-BR', { maximumFractionDigits: 3 }),
                resource.manufacturer || '',
                resource.serialNumber || '',
                resource.capacity || '',
                resource.cycleTimeSeconds || ''
            ].map(csvCell).join(';');
        });
        const blob = new Blob([`\uFEFF${[header.map(csvCell).join(';'), ...body].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeFileName(getLayoutTitle())}-equipamentos.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('Tabela de equipamentos exportada.', 'success');
    };

    openButton.setAttribute('aria-controls', 'equipmentTablePanel');
    openButton.setAttribute('aria-expanded', 'false');
    openButton.addEventListener('click', open);
    closeButtons.forEach(button => button.addEventListener('click', () => close()));
    search.addEventListener('input', render);
    scopeButtons.forEach(button => button.addEventListener('click', () => {
        scope = button.dataset.equipmentScope || 'all';
        scopeButtons.forEach(item => item.classList.toggle('active', item === button));
        render();
    }));
    region.addEventListener('click', event => {
        const row = event.target.closest('[data-resource-id]');
        if (row) selectRow(row, Boolean(event.target.closest('[data-edit-equipment]')));
    });
    exportButton?.addEventListener('click', exportCsv);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('open')) close();
    });
    window.addEventListener('gregorios:close-equipment-table', () => close({ restoreFocus: false }));
    window.addEventListener('layoutChange', () => overlay.classList.contains('open') && render());
    onStateAction('resource-selection/changed', () => overlay.classList.contains('open') && render());
    onStateAction('selection/cleared', () => overlay.classList.contains('open') && render());
    subscribeToFloorChanges(() => overlay.classList.contains('open') && render());
    onMeasurementUnitChange(() => overlay.classList.contains('open') && render());
}
