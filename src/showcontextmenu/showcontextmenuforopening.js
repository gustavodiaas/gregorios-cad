import { deleteOpening, calculateOpeningWidth, renameOpening, getOpeningDisplayName } from '../openings.js';
import { createHubForBoundaryOpening, getHubsForBoundaryOpening, removeHub, updateHubNamesForBoundaryOpening } from '../hubs.js';
import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';
import { drawAll } from '../drawing.js';

/**
 * Exibe o menu de contexto para uma abertura.
 * Para aberturas de borda (DOCA), inclui opções extras como "Adicionar Hub".
 * @param {Object} opening - Objeto da abertura
 * @param {number} x - Posição X do mouse (canvas)
 * @param {number} y - Posição Y do mouse (canvas)
 * @param {MouseEvent} mouseEvent - Evento de mouse original
 */
export function showContextMenuForOpening(opening, x, y, mouseEvent) {
    const isBoundary = opening.isBoundaryOpening || false;
    const openingWidth = Math.round(calculateOpeningWidth(opening));
    
    const menuOptions = [];
    
    // Para aberturas de borda, adicionar opção de hub
    if (isBoundary) {
        const existingHubs = getHubsForBoundaryOpening(opening.id);
        if (existingHubs.length === 0) {
            menuOptions.push({
                label: '📌 Adicionar Hub (ponto de conexão)',
                action: () => {
                    const hub = createHubForBoundaryOpening(opening.id);
                    if (hub) {
                        drawAll();
                    }
                }
            });
        } else {
            menuOptions.push({
                label: `📌 Hub já existe (${existingHubs[0].name})`,
                action: () => { /* noop */ },
                disabled: true
            });
        }
    }
    
    // Info label
    const displayName = getOpeningDisplayName(opening);
    const typeLabel = isBoundary ? `${displayName} (${openingWidth} cm)` : `Abertura (${openingWidth} cm)`;
    menuOptions.push({
        label: `ℹ️ ${typeLabel}`,
        action: () => { /* noop - info only */ },
        disabled: true
    });
    
    // Opção de renomear (para aberturas de borda / docas)
    if (isBoundary) {
        menuOptions.push({
            label: '✏️ Renomear',
            isRename: true,
            action: () => {
                const currentName = opening.name || '';
                const newName = prompt(
                    `Renomear doca:\nNome atual: ${currentName || '(sem nome)'}\n\nDigite o novo nome:`,
                    currentName
                );
                if (newName === null) return; // Cancelado
                const trimmedName = newName.trim();
                renameOpening(opening.id, trimmedName || null);
                // Atualizar nomes dos hubs associados
                updateHubNamesForBoundaryOpening(opening.id, trimmedName || null);
                drawAll();
            }
        });
    }
    
    // Opção de excluir
    menuOptions.push({
        label: '🗑️ Excluir Abertura',
        action: () => {
            if (confirm(`Deseja realmente excluir esta ${isBoundary ? 'doca' : 'abertura'}?`)) {
                // Remover hubs associados à doca antes de excluir
                if (isBoundary) {
                    const associatedHubs = getHubsForBoundaryOpening(opening.id);
                    associatedHubs.forEach(hub => removeHub(hub.id));
                }
                deleteOpening(opening.id);
                drawAll();
            }
        }
    });
    
    const menu = ensureContextMenuElement();
    menu.innerHTML = '';
    
    menuOptions.forEach(opt => {
        const item = document.createElement('div');
        item.textContent = opt.label;
        item.style.padding = '8px 15px';
        item.style.cursor = opt.disabled ? 'default' : 'pointer';
        item.style.borderBottom = '1px solid #eee';
        item.style.fontSize = '13px';
        item.style.fontFamily = 'Arial, sans-serif';
        item.style.lineHeight = '1.2';
        item.style.whiteSpace = 'nowrap';
        item.style.minWidth = '120px';
        item.style.boxSizing = 'border-box';
        item.style.color = opt.disabled ? '#999999' : '#333333';
        item.style.background = 'transparent';
        
        if (!opt.disabled) {
            item.onmouseenter = () => { 
                item.style.background = '#e6f3ff'; 
                item.style.color = '#0066cc';
            };
            item.onmouseleave = () => { 
                item.style.background = 'transparent'; 
                item.style.color = '#333333';
            };
        }
        
        item.onclick = (e) => {
            if (opt.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            hideContextMenu();
            setTimeout(() => {
                try {
                    opt.action();
                } catch (error) {
                    console.error('[ContextMenuOpening] Erro na ação:', error);
                }
            }, opt.isRename ? 200 : 100);
        };
        menu.appendChild(item);
    });
    
    if (mouseEvent) {
        menu.style.left = `${mouseEvent.clientX + 5}px`;
        menu.style.top = `${mouseEvent.clientY + 5}px`;
    }
    menu.style.pointerEvents = 'auto';
    menu.style.visibility = 'visible';
    menu.style.opacity = '1';
    menu.style.display = 'block';
}
