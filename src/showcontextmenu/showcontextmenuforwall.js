import { deleteWall, editWallLength, toggleWallDimensions } from '../walls.js';
import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';
import { getSelectedWallSubSegment } from '../state.js';

// Função para exibir o menu de contexto para uma parede
// A implementação será movida de events.js

function showContextMenuForWall(wall, x, y, mouseEvent) {
    const subSegment = getSelectedWallSubSegment();
    const hasSubSegment = subSegment !== null;
    
    const menuOptions = [
        { 
            label: hasSubSegment ? 'Excluir Segmento' : 'Excluir Parede', 
            action: () => deleteWall(wall) 
        },
        { label: 'Editar Comprimento', action: () => editWallLength(wall) }
        // Removido: Mostrar/Esconder Cotas - usar apenas controle global
    ];
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
    }    if (rect.bottom > viewportHeight) {
        menu.style.top = `${viewportHeight - rect.height - 10}px`;
    }
}

export { showContextMenuForWall };

