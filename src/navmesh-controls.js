// NavMesh Visualization Controls
// Sistema para controlar a visualização dos nós da NavMesh

import { toggleNavMeshVisualization, setNavMeshVisualWidth, getNavMeshVisualizationState } from './drawing.js';
import { drawAll } from './drawing.js';
import { getAvailableConnectionWidths, getConnectionWidthName } from './navMeshBaker.js';
import { formatLength, onMeasurementUnitChange } from './measurement-units.js';

/**
 * Atualiza as opções de largura de visualização dinamicamente
 */
function updateNavMeshWidthOptions() {
    const container = document.getElementById('navMeshWidthOptions');
    if (!container) return;
    
    const availableWidths = getAvailableConnectionWidths();
    const currentSelectedWidth = getCurrentSelectedWidth();
    
    // Limpar opções existentes
    container.innerHTML = '';
    
    // Se não há larguras disponíveis, mostrar mensagem
    if (availableWidths.length === 0) {
        const noOptions = document.createElement('div');
        noOptions.className = 'dropdown-item disabled';
        noOptions.innerHTML = '<i class="fas fa-info-circle"></i> Nenhuma área criada';
        container.appendChild(noOptions);
        return;
    }
    
    // Criar opções para cada largura disponível
    availableWidths.forEach((width, index) => {
        const option = document.createElement('div');
        option.className = 'dropdown-item';
        option.setAttribute('data-width', width);
        
        const widthName = getConnectionWidthName(width);
        option.innerHTML = `${formatLength(width)} (${widthName})`;
        
        // Marcar como selecionado: primeira opção se não há seleção atual, ou a atual se existe
        if ((currentSelectedWidth === null && index === 0) || width === currentSelectedWidth) {
            option.classList.add('selected');
            // Atualizar visualização para esta largura
            setNavMeshVisualWidth(width);
        }
        
        // Adicionar event listener
        option.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Remover seleção anterior
            container.querySelectorAll('.dropdown-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            // Adicionar seleção atual
            option.classList.add('selected');
            
            // Atualizar largura da visualização
            setNavMeshVisualWidth(width);
            drawAll(); // Redesenhar com nova largura
            
        });
        
        container.appendChild(option);
    });
    
}

/**
 * Obtém a largura atualmente selecionada
 */
function getCurrentSelectedWidth() {
    const container = document.getElementById('navMeshWidthOptions');
    if (!container) return null;
    
    const selected = container.querySelector('.dropdown-item.selected');
    if (selected && !selected.classList.contains('disabled')) {
        return parseInt(selected.getAttribute('data-width')) || null;
    }
    
    return null; // Nenhuma seleção válida
}

/**
 * Inicializa os controles de visualização da NavMesh
 */
export function initializeNavMeshControls() {
    const toggleBtn = document.getElementById('toggleNavMeshVisualization');
    const navMeshMainBtn = document.getElementById('toggleNavMeshBtn');

    // Toggle da visualização
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const isVisible = toggleNavMeshVisualization();
            drawAll(); // Redesenhar para mostrar/esconder os nós
            
            // Atualizar ícone do botão interno
            const icon = toggleBtn.querySelector('i');
            if (isVisible) {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                toggleBtn.classList.add('active');
                toggleBtn.title = 'NavMesh: Habilitado';
            } else {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                toggleBtn.classList.remove('active');
                toggleBtn.title = 'NavMesh: Desabilitado';
            }
            
            // Atualizar botão principal do NavMesh
            if (navMeshMainBtn) {
                if (isVisible) {
                    navMeshMainBtn.classList.add('active');
                } else {
                    navMeshMainBtn.classList.remove('active');
                }
            }
        });
    }
    
    // Verificar estado atual e aplicar ao botão principal
    if (navMeshMainBtn) {
        const isVisible = getNavMeshVisualizationState();
        if (isVisible) {
            navMeshMainBtn.classList.add('active');
        } else {
            navMeshMainBtn.classList.remove('active');
        }
    }
    
    // Inicializar opções de largura
    updateNavMeshWidthOptions();
    onMeasurementUnitChange(updateNavMeshWidthOptions);

}

/**
 * Atualiza as opções quando uma nova conexão é criada ou modificada
 */
export function refreshNavMeshOptions() {
    updateNavMeshWidthOptions();
}

/**
 * Disponibilizar funções globalmente para uso via console
 */
if (typeof window !== 'undefined') {
    window.initializeNavMeshControls = initializeNavMeshControls;
    window.refreshNavMeshOptions = refreshNavMeshOptions;
}
