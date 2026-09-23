/**
 * Sistema de redimensionamento dos sidebars
 * Permite redimensionar horizontalmente tanto o sidebar esquerdo quanto o direito
 */

let isResizing = null;
let startX = 0;
let startWidth = 0;

// Configurações de limites
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;

/**
 * Inicializa o sistema de redimensionamento dos sidebars
 */
export function initializeSidebarResizing() {
    const leftHandle = document.querySelector('.resize-handle-right');
    const rightHandle = document.querySelector('.resize-handle-left');
    const leftSidebar = document.querySelector('.left-sidebar');
    const rightSidebar = document.querySelector('.right-sidebar');

    if (!leftHandle || !rightHandle || !leftSidebar || !rightSidebar) {
        console.warn('Elementos necessários para redimensionamento dos sidebars não encontrados');
        return;
    }

    // Event listeners para o handle do sidebar esquerdo
    leftHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startResizing('left', e.clientX, leftSidebar);
    });

    // Event listeners para o handle do sidebar direito
    rightHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startResizing('right', e.clientX, rightSidebar);
    });

    // Event listeners globais para mousemove e mouseup
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

/**
 * Inicia o processo de redimensionamento
 * @param {string} side - 'left' ou 'right'
 * @param {number} clientX - Posição X do mouse
 * @param {HTMLElement} sidebar - Elemento do sidebar
 */
function startResizing(side, clientX, sidebar) {
    isResizing = side;
    startX = clientX;
    
    // Obter a largura atual do sidebar
    const computedStyle = window.getComputedStyle(sidebar);
    startWidth = parseInt(computedStyle.width, 10);
    
    // Adicionar classe para feedback visual
    document.body.classList.add('is-resizing');
    
    // Adicionar classe de redimensionamento ao handle
    const handle = side === 'left' 
        ? document.querySelector('.resize-handle-right')
        : document.querySelector('.resize-handle-left');
    
    if (handle) {
        handle.classList.add('resizing');
    }
}

/**
 * Manipula o movimento do mouse durante o redimensionamento
 * @param {MouseEvent} e - Evento do mouse
 */
function handleMouseMove(e) {
    if (!isResizing) return;

    e.preventDefault();
    
    const currentX = e.clientX;
    const deltaX = currentX - startX;
    
    let newWidth;
    
    if (isResizing === 'left') {
        // Para o sidebar esquerdo, aumenta a largura quando o mouse move para a direita
        newWidth = startWidth + deltaX;
    } else {
        // Para o sidebar direito, aumenta a largura quando o mouse move para a esquerda
        newWidth = startWidth - deltaX;
    }
    
    // Aplicar limites
    newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth));
    
    // Atualizar a variável CSS correspondente
    const variableName = isResizing === 'left' ? '--left-sidebar-width' : '--right-sidebar-width';
    document.documentElement.style.setProperty(variableName, newWidth + 'px');
    
    // Se estiver redimensionando o sidebar direito e ele estiver oculto,
    // também atualizar a margem do canvas
    if (isResizing === 'right') {
        const appContent = document.querySelector('.app-content');
        if (appContent && appContent.classList.contains('right-sidebar-hidden')) {
            document.documentElement.style.setProperty('--right-sidebar-width', newWidth + 'px');
        }
    }
}

/**
 * Finaliza o redimensionamento
 * @param {MouseEvent} e - Evento do mouse
 */
function handleMouseUp(e) {
    if (!isResizing) return;

    // Remover classes de feedback visual
    document.body.classList.remove('is-resizing');
    
    // Remover classe de redimensionamento do handle
    const handle = isResizing === 'left' 
        ? document.querySelector('.resize-handle-right')
        : document.querySelector('.resize-handle-left');
    
    if (handle) {
        handle.classList.remove('resizing');
    }
    
    // Resetar estado
    isResizing = null;
    startX = 0;
    startWidth = 0;
    
    // Redimensionar o canvas após o final do redimensionamento
    // Usar setTimeout para garantir que o DOM foi atualizado
    setTimeout(() => {
        // Verificar se existe uma função global resizeCanvas
        if (typeof window.resizeCanvas === 'function') {
            window.resizeCanvas();
        } else {
            // Disparar evento de resize como alternativa
            window.dispatchEvent(new Event('resize'));
        }
    }, 10);
}

/**
 * Obtém a largura atual de um sidebar
 * @param {string} side - 'left' ou 'right'
 * @returns {number} Largura em pixels
 */
export function getSidebarWidth(side) {
    const variableName = side === 'left' ? '--left-sidebar-width' : '--right-sidebar-width';
    const value = getComputedStyle(document.documentElement).getPropertyValue(variableName);
    return parseInt(value, 10) || (side === 'left' ? 280 : 280); // valores padrão
}

/**
 * Define a largura de um sidebar
 * @param {string} side - 'left' ou 'right'
 * @param {number} width - Largura em pixels
 */
export function setSidebarWidth(side, width) {
    // Aplicar limites
    width = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width));
    
    const variableName = side === 'left' ? '--left-sidebar-width' : '--right-sidebar-width';
    document.documentElement.style.setProperty(variableName, width + 'px');
    
    // Redimensionar canvas se necessário
    setTimeout(() => {
        if (typeof window.resizeCanvas === 'function') {
            window.resizeCanvas();
        } else {
            window.dispatchEvent(new Event('resize'));
        }
    }, 10);
}

/**
 * Reseta as larguras dos sidebars para os valores padrão
 */
export function resetSidebarWidths() {
    document.documentElement.style.setProperty('--left-sidebar-width', '280px');
    document.documentElement.style.setProperty('--right-sidebar-width', '280px');
    
    setTimeout(() => {
        if (typeof window.resizeCanvas === 'function') {
            window.resizeCanvas();
        } else {
            window.dispatchEvent(new Event('resize'));
        }
    }, 10);
}
