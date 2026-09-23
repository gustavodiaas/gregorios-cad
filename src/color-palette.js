// Sistema de paleta de cores simplificado
import { saveStateToHistory } from './history.js';
import { drawAll } from './drawing.js';
import { 
    resources, 
    getSelectedResourceId, 
    getSelectedResourceIds,
    getSelectedConnectionId,
    getConnections,
    getSelectedFreeLineId
} from './state.js';
import { updateFreeLineColor } from './free-lines.js';

// Estado das cores selecionadas (ambas usam a mesma cor)
let currentColor = '#38A169'; // Verde padrão

/**
 * Inicializa o sistema de paleta de cores
 */
export function initializeColorPalette() {
    const colorPaletteBtn = document.getElementById('colorPaletteBtn');
    const colorPaletteDropdown = document.getElementById('colorPaletteDropdown');
    
    if (!colorPaletteBtn || !colorPaletteDropdown) {
        console.warn('Elementos da paleta de cores não encontrados');
        return;
    }
    
    // Toggle do dropdown
    colorPaletteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = colorPaletteDropdown.style.display === 'block';
        colorPaletteDropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        if (!colorPaletteBtn.contains(e.target) && !colorPaletteDropdown.contains(e.target)) {
            colorPaletteDropdown.style.display = 'none';
        }
    });
    
    // Configurar eventos dos botões de cor
    setupColorEvents();
    
    // Definir cor padrão selecionada
    updateSelectedColorIndicator();
}

/**
 * Configura os eventos de seleção de cor
 */
function setupColorEvents() {
    // Eventos para todas as cores
    document.querySelectorAll('[data-color]').forEach(button => {
        button.addEventListener('click', (e) => {
            const color = e.target.getAttribute('data-color');
            handleColorSelection(color);
        });
    });
}

/**
 * Manipula a seleção de uma cor
 * @param {string} color - A cor selecionada
 */
function handleColorSelection(color) {
    // Definir a cor única para recursos e conexões
    currentColor = color;
    
    // Aplicar cor automaticamente em elementos selecionados
    applyColorToSelectedElements(color);
    
    // Atualizar indicador visual
    updateSelectedColorIndicator();
    
    // Fechar dropdown
    const dropdown = document.getElementById('colorPaletteDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

/**
 * Aplica a cor aos elementos atualmente selecionados
 * @param {string} color - A cor a ser aplicada
 */
function applyColorToSelectedElements(color) {
    let hasChanges = false;
    
    // Verificar se há recurso selecionado
    const selectedResourceIds = getSelectedResourceIds();
    if (selectedResourceIds && selectedResourceIds.length > 0) {
        selectedResourceIds.forEach(id => {
            const resource = resources.find(r => r.id === id);
            if (resource) {
                resource.color = color;
                hasChanges = true;
            }
        });
    }
    
    // Verificar se há conexão selecionada
    const selectedConnectionId = getSelectedConnectionId();
    if (selectedConnectionId) {
        const connections = getConnections();
        const connection = connections.find(c => c.id === selectedConnectionId);
        if (connection) {
            connection.color = color;
            hasChanges = true;
        }
    }

    // Verificar se há linha livre selecionada
    const selectedFreeLineId = getSelectedFreeLineId();
    if (selectedFreeLineId) {
        const updated = updateFreeLineColor(selectedFreeLineId, color);
        if (updated) {
            hasChanges = true;
        }
    }
    
    // Salvar estado e redesenhar se houve mudanças
    if (hasChanges) {
        saveStateToHistory('Alterar cor do elemento selecionado');
        drawAll();
    }
}

/**
 * Atualiza o indicador visual da cor selecionada
 */
function updateSelectedColorIndicator() {
    // Remover seleção anterior
    document.querySelectorAll('[data-color]').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Adicionar seleção atual
    const selectedBtn = document.querySelector(`[data-color="${currentColor}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('selected');
    }
}

/**
 * Retorna a cor atual para recursos
 */
export function getCurrentResourceColor() {
    return currentColor;
}

/**
 * Retorna a cor atual para conexões
 */
export function getCurrentConnectionColor() {
    return currentColor;
}

/**
 * Aplica uma cor específica a um recurso
 * @param {object} resource - O recurso a ser colorido
 */
export function applyColorToResource(resource) {
    if (!resource) return;
    
    const selectedResourceIds = getSelectedResourceIds();
    let targets = [resource.id];
    if (selectedResourceIds && selectedResourceIds.length > 1 && selectedResourceIds.includes(resource.id)) {
        targets = selectedResourceIds;
    }

    let changed = false;
    targets.forEach(id => {
        const target = resources.find(r => r.id === id);
        if (target) {
            target.color = currentColor;
            changed = true;
        }
    });

    if (changed) {
        saveStateToHistory(targets.length > 1 ? 'Alterar cor de múltiplos recursos' : 'Alterar cor do recurso');
        drawAll();
    }
}

/**
 * Aplica uma cor específica a uma conexão
 * @param {object} connection - A conexão a ser colorida
 */
export function applyColorToConnection(connection) {
    if (!connection) return;
    
    // Salvar estado para undo/redo
    saveStateToHistory('Alterar cor da conexão');
    
    // Aplicar a cor atual
    connection.color = currentColor;
    
    // Redesenhar
    drawAll();
}
