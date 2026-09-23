// Funções utilitárias de contexto de menu extraídas de events.js
function ensureContextMenuElement() {
    let menu = document.getElementById('area-context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'area-context-menu';
        menu.style.position = 'fixed';
        menu.style.zIndex = '999999';
        menu.style.background = '#ffffff';
        menu.style.border = '1px solid #cccccc';
        menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        menu.style.padding = '8px 0';
        menu.style.minWidth = '180px';
        menu.style.display = 'none';
        menu.style.fontFamily = 'Arial, sans-serif';
        menu.style.fontSize = '14px';
        menu.style.borderRadius = '6px';
        menu.style.pointerEvents = 'auto';
        menu.style.visibility = 'visible';
        menu.style.opacity = '1';
        document.body.appendChild(menu);
    }
    return menu;
}
function hideContextMenu() {
    const menu = document.getElementById('area-context-menu');
    if (menu) {
        menu.style.display = 'none';
        menu.style.visibility = 'hidden';
        menu.style.opacity = '0';
        menu.style.pointerEvents = 'none';
    }
}

export { ensureContextMenuElement, hideContextMenu };