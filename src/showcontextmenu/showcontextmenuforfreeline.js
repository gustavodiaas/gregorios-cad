import { removeFreeLine } from '../free-lines.js';
import { setSelectedFreeLineId, setSelectedFreeLineSubSegment } from '../state.js';
import { saveStateToHistory } from '../history.js';
import { drawAll } from '../drawing.js';
import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';

export function showContextMenuForFreeLine(line, mouseEvent) {
    const menu = ensureContextMenuElement();
    menu.innerHTML = '';

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'cad-context-menu-item danger';
    item.innerHTML = `<i class="fas fa-trash-can" aria-hidden="true"></i><span>Excluir ${line.shapeType === 'dimension' ? 'cota' : 'linha'}</span>`;
    item.addEventListener('click', () => {
        saveStateToHistory(line.shapeType === 'dimension' ? 'Excluir cota' : 'Excluir linha livre');
        if (removeFreeLine(line.id)) {
            setSelectedFreeLineId(null);
            setSelectedFreeLineSubSegment(null);
            drawAll();
        }
        hideContextMenu();
    });
    menu.appendChild(item);
    menu.style.left = `${mouseEvent.clientX + 5}px`;
    menu.style.top = `${mouseEvent.clientY + 5}px`;
    menu.style.visibility = 'visible';
    menu.style.opacity = '1';
    menu.style.display = 'block';
    menu.style.pointerEvents = 'auto';
}
