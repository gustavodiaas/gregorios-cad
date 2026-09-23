import {
    toggleLockArea,
    toggleDimensionsArea,
    toggleEditPolygonMode,
    rotateArea,
    duplicateArea,
    renameArea,
    deleteArea,
    promptAreaDimensions,
    isComplexArea
} from '../areaactions/areaactions.js';
import { mergeArea } from '../merge_areas/mergeArea.js';
import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';

// Função para exibir o menu de contexto para uma área
// A implementação será movida de events.js

function showContextMenuForArea(area, x, y, mouseEvent) {
    const menuOptions = [
        { label: area.locked ? 'Desbloquear' : 'Bloquear', action: () => toggleLockArea(area) },
        // Removido: Mostrar/Esconder Cotas - usar apenas controle global
        { label: 'Editar Forma', action: () => toggleEditPolygonMode(area) }
    ];

    if (!isComplexArea(area)) {
        menuOptions.push({ label: 'Digitar dimensões', action: () => promptAreaDimensions(area) });
    }

    menuOptions.push(
        { label: 'Rotacionar', action: () => rotateArea(area) },
        { label: 'Unir Áreas', action: () => mergeArea(area) },
        { label: 'Duplicar', action: () => duplicateArea(area) },
        { label: 'Excluir', action: () => deleteArea(area) }
    );
    const menu = ensureContextMenuElement();
    menu.innerHTML = '';
    menuOptions.forEach(opt => {
        const item = document.createElement('div');
        item.textContent = opt.label;
        item.style.padding = '8px 16px';
        item.style.cursor = 'pointer';
        item.style.color = '#333333';
        item.style.borderBottom = '1px solid #eeeeee';
        item.onmouseenter = () => { 
            item.style.background = '#f0f0f0'; 
            item.style.color = '#000000';
        };
        item.onmouseleave = () => { 
            item.style.background = 'transparent'; 
            item.style.color = '#333333';
        };
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideContextMenu();
            setTimeout(() => {
                try {
                    opt.action();
                } catch (error) {
                    // Debug output removed
                }
            }, 100);
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

export { showContextMenuForArea };
