import { deleteConnection } from '../connections.js';
import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';
import { setSelectedConnectionId } from '../state.js';
import { drawAll } from '../drawing.js';
import { applyColorToConnection } from '../color-palette.js';

// Função para exibir o menu de contexto para uma conexão
export function showContextMenuForConnection(connection, x, y, mouseEvent) {
    const menuOptions = [
        { label: 'Alterar Cor', action: () => applyColorToConnection(connection) },
        { label: 'Excluir Conexão', action: () => deleteConnectionFromMenu(connection) }
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
            e.stopPropagation();
            opt.action();
            hideContextMenu();
        };
        
        menu.appendChild(item);
    });

    // Posicionar o menu
    const rect = document.getElementById('layoutCanvas').getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - 150) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight) + 'px';
    menu.style.display = 'block';

    // Selecionar a conexão
    setSelectedConnectionId(connection.id);
    drawAll();

    // Prevenir o menu padrão do navegador
    if (mouseEvent) {
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
    }
}

// Função auxiliar para deletar uma conexão do menu
function deleteConnectionFromMenu(connection) {
    if (confirm(`Deseja realmente excluir a conexão "${connection.name}"?`)) {
        deleteConnection(connection.id);
    }
}
