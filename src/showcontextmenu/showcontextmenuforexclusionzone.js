import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';
import { activateExclusionEditing, deactivateExclusionEditing, getEditingExclusionHubId } from '../state.js';
import { getExclusionEdgeDistances } from '../hub-exclusion-zones.js';
import { pixelsPerCm } from '../config.js';

/**
 * Exibe o menu de contexto para uma zona de exclusão de hub.
 * @param {object} hub - Hub cuja zona foi clicada
 * @param {number} x - Posição X (mundo)
 * @param {number} y - Posição Y (mundo)
 * @param {MouseEvent} mouseEvent - Evento original do mouse
 */
function showContextMenuForExclusionZone(hub, x, y, mouseEvent) {
    const isEditing = getEditingExclusionHubId() === hub.id;
    const d = getExclusionEdgeDistances(hub);
    const widthCm = (d.left + d.right).toFixed(0);
    const depthCm = (d.far + d.near).toFixed(0);

    const menuOptions = [
        {
            label: isEditing ? '✓ Editar Zona de Exclusão' : 'Editar Zona de Exclusão',
            action: () => {
                if (isEditing) {
                    deactivateExclusionEditing();
                } else {
                    activateExclusionEditing(hub.id);
                }
            }
        },
        {
            label: `Dimensões: ${widthCm} × ${depthCm} cm`,
            action: () => {
                const input = prompt(
                    `Dimensões individuais (far, near, right, left em cm):\n` +
                    `Formato: far,near,right,left`,
                    `${d.far.toFixed(0)},${d.near.toFixed(0)},${d.right.toFixed(0)},${d.left.toFixed(0)}`
                );
                if (!input) return;
                const parts = input.split(/[,;]/).map(s => parseFloat(s.trim()));
                if (parts.length >= 4 && parts.every(v => !isNaN(v))) {
                    hub.exclusionFar   = Math.max(20, parts[0]);
                    hub.exclusionNear  = Math.max(0,  parts[1]);
                    hub.exclusionRight = Math.max(20, parts[2]);
                    hub.exclusionLeft  = Math.max(20, parts[3]);
                } else if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    // largura × profundidade → dividir simetricamente
                    const halfW = Math.max(20, parts[0]) / 2;
                    hub.exclusionRight = halfW;
                    hub.exclusionLeft  = halfW;
                    hub.exclusionFar   = Math.max(20, parts[1]);
                    hub.exclusionNear  = 0;
                }
            }
        },
        {
            label: 'Restaurar Dimensões Padrão',
            action: () => {
                hub.exclusionFar   = null;
                hub.exclusionNear  = null;
                hub.exclusionRight = null;
                hub.exclusionLeft  = null;
            }
        }
    ];

    const menu = ensureContextMenuElement();
    menu.innerHTML = '';
    menuOptions.forEach(opt => {
        const item = document.createElement('div');
        item.textContent = opt.label;
        item.style.padding = '8px 15px';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid #eee';
        item.style.fontSize = '13px';
        item.style.fontFamily = 'Arial, sans-serif';
        item.style.lineHeight = '1.2';
        item.style.whiteSpace = 'nowrap';
        item.style.minWidth = '120px';
        item.style.boxSizing = 'border-box';
        item.style.color = '#333333';
        item.style.background = 'transparent';
        item.onmouseenter = () => {
            item.style.background = '#e6f3ff';
            item.style.color = '#0066cc';
        };
        item.onmouseleave = () => {
            item.style.background = 'transparent';
            item.style.color = '#333333';
        };
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideContextMenu();
            setTimeout(async () => {
                try {
                    await opt.action();
                } catch (error) {
                    // Erro silencioso
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

export { showContextMenuForExclusionZone };
