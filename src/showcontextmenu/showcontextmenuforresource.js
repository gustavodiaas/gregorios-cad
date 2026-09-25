import {
    toggleLockResource,
    deleteResourceFromMenu,
    stopResourcePolygonEditing
} from '../resources.js';
import { duplicateResource } from '../merge_resources/duplicateResource.js';
import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';
import {
    setSelectedResourceId,
    setIsEditingResourcePolygon,
    setEditingResourceId,
    setActiveResourceResizeHandle,
    setHoveredResourceResizeHandle
} from '../state.js';
import { drawAll } from '../drawing.js';
import { setRightSidebarVisible, showToast } from '../ui-shell.js';

function openResourceProperties(resource) {
    setSelectedResourceId(resource.id);

    if (resource.locked) {
        stopResourcePolygonEditing();
        showToast('Recurso bloqueado: desbloqueie para alterar medidas.', 'warning');
    } else {
        setIsEditingResourcePolygon(true);
        setEditingResourceId(resource.id);
        setActiveResourceResizeHandle(null);
        setHoveredResourceResizeHandle(null);
    }

    setRightSidebarVisible(true);
    drawAll();
}

function showContextMenuForResource(resource, x, y, mouseEvent) {
    const menuOptions = [
        { label: 'Editar propriedades', icon: 'fa-sliders', action: () => openResourceProperties(resource) },
        { separator: true },
        { label: 'Duplicar', icon: 'fa-copy', action: () => duplicateResource(resource) },
        {
            label: resource.locked ? 'Desbloquear' : 'Bloquear',
            icon: resource.locked ? 'fa-lock-open' : 'fa-lock',
            action: () => toggleLockResource(resource)
        },
        { separator: true },
        { label: 'Excluir', icon: 'fa-trash-can', danger: true, action: () => deleteResourceFromMenu(resource) }
    ];
    const menu = ensureContextMenuElement();
    menu.innerHTML = '';
    menuOptions.forEach(opt => {
        if (opt.separator) {
            const separator = document.createElement('div');
            separator.className = 'cad-context-menu-separator';
            menu.appendChild(separator);
            return;
        }

        const item = document.createElement('button');
        item.type = 'button';
        item.className = `cad-context-menu-item${opt.danger ? ' danger' : ''}`;
        item.innerHTML = `<i class="fas ${opt.icon}" aria-hidden="true"></i><span>${opt.label}</span>`;
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideContextMenu();
            Promise.resolve(opt.action()).catch(() => {});
        };
        menu.appendChild(item);
    });
    if (mouseEvent) {
        menu.style.left = `${mouseEvent.clientX + 5}px`;
        menu.style.top = `${mouseEvent.clientY + 5}px`;
    }
    menu.style.visibility = 'visible';
    menu.style.opacity = '1';
    menu.style.display = 'block';
    menu.style.pointerEvents = 'auto';
    // Prevenir que o menu saia da tela
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (rect.right > viewportWidth) {
        menu.style.left = `${viewportWidth - rect.width - 10}px`;
    }
    if (rect.bottom > viewportHeight) {
        menu.style.top = `${viewportHeight - rect.height - 10}px`;
    }
}

export { showContextMenuForResource };
