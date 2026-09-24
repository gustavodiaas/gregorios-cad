// Arquivo principal: importa e executa todos os módulos/funções
import { toggleGlobalDimensions, getGlobalShowDimensions } from './config.js';
import { setCanvas, setCtx, setStaticCanvas, setStaticCtx, setScale, getScale, setOffsetXCanvas, setOffsetYCanvas, getCurrentConnectionWidth, setCurrentConnectionWidth } from './state.js';
import * as Drawing from './drawing.js';
import { 
    initializeEventListeners} from './events.js';
import { initializeMidpointArrowsSystem } from './midpoint-arrows.js';
import { initializeHistory } from './history.js'; // Sistema de undo/redo
import { initializeSaveLoad } from './saveload.js'; // Sistema de salvar/carregar
import { initializeExport } from './export.js'; // Sistema de exportação
import { initializeColorPalette } from './color-palette.js'; // Sistema de paleta de cores
import { initializeSidebarResizing } from './sidebar-resizing.js'; // Sistema de redimensionamento de sidebars
import { initializeNavMeshControls } from './navmesh-controls.js'; // Sistema de visualização da NavMesh
import { getAllMovementAreas, calculateBoundingBox } from './areas.js';
import { getAllFloors } from './state.js';
import { setActiveTool, getCurrentTool } from './active_tool.js';
import { startCreatingOpening, migrateBaseOpeningsToAdvanced } from './openings.js';
import './pathfinding.js'; // Sistema de pathfinding A*
import './navigation.js'; // Sistema de navegação mesh
import { initializeConnectionAnimator } from './connections/connectionAnimations.js';
import { initializeFloorManager } from './floors.js';
import { initializeProductPlanner as initializePlannerModule } from './product-planner.js'; // Sistema de planejador de produtos
import { initializePlannerAnimator } from './planner-animator.js'; // Sistema de animação do planner
import { initializeOptimizer } from './optimizer.js'; // Sistema de otimização de layout
import { initializeWorkspaceTabs } from './ui-shell.js';
import { initializeMachineLibrary } from './machine-library.js';
import { initializeSelectionInspector } from './selection-inspector.js';

export function initializeProductPlanner() {
    // Inicializar o módulo do planner primeiro
    initializePlannerModule();
    
    const openBtn = document.getElementById('openProductPlannerBtn');
    const closeBtn = document.getElementById('closePlannerSidebarBtn');
    const plannerSidebar = document.getElementById('plannerSidebar');
    
    if (openBtn && plannerSidebar) {
        openBtn.addEventListener('click', () => {
            plannerSidebar.classList.add('open');
            // Inicializar o planner quando abrir
            if (window.initializePlannerInSidebar) {
                window.initializePlannerInSidebar();
            }
        });
    }
    
    if (closeBtn && plannerSidebar) {
        closeBtn.addEventListener('click', () => {
            plannerSidebar.classList.remove('open');
        });
    }
    
    // Fechar ao clicar no overlay (área fora do sidebar)
    if (plannerSidebar) {
        plannerSidebar.addEventListener('click', (e) => {
            if (e.target === plannerSidebar) {
                plannerSidebar.classList.remove('open');
            }
        });
    }
}

// Variáveis globais para acesso de outras funções
let globalCanvas = null;
let globalUpdateZoomIndicator = null;

// Importar e disponibilizar globalmente funções de utilidade para conexões
import * as connectionUtils from './connections/connectionUtils.js';
window.connectionUtils = connectionUtils;
// --- Centralizar Vista (função global) ---
function centerView() {
    const areas = getAllMovementAreas();
    const canvas = globalCanvas;
    if (!canvas) {
        return;
    }
    
    // Adicionar classe active ao botão de centralizar vista
    const centerViewBtn = document.getElementById('centerViewBtn');
    if (centerViewBtn) {
        // Primeiro remover qualquer timeout anterior
        if (window.centerViewTimeout) {
            clearTimeout(window.centerViewTimeout);
        }
        
        centerViewBtn.classList.add('active');
        
        // Remover a classe active após um tempo para indicar que a ação foi concluída
        window.centerViewTimeout = setTimeout(() => {
            centerViewBtn.classList.remove('active');
            window.centerViewTimeout = null;
        }, 1000);
    }
    
    // Coleta áreas de TODOS os pavimentos para calcular o bounding box global
    const allFloors = getAllFloors();
    let allAreas = [];
    for (const floor of allFloors) {
        if (Array.isArray(floor.movementAreas)) {
            allAreas = allAreas.concat(floor.movementAreas);
        }
    }
    // Fallback: se não encontrar áreas em nenhum pavimento, usar as do pavimento atual
    if (allAreas.length === 0) {
        allAreas = areas || [];
    }
    if (allAreas.length === 0) {
        setScale(1);
        setOffsetXCanvas(canvas.width / 2);
        setOffsetYCanvas(canvas.height / 2);
        if (globalUpdateZoomIndicator) globalUpdateZoomIndicator();
        Drawing.drawAll();
        return;
    }
    // Calcula bounding box considerando a maior dimensão entre todos os pavimentos
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const area of allAreas) {
        let bb;
        if (area.vertices && area.vertices.length > 0) {
            bb = calculateBoundingBox(area.vertices);
        } else {
            bb = { x: area.x, y: area.y, width: area.width, height: area.height };
        }
        minX = Math.min(minX, bb.x);
        maxX = Math.max(maxX, bb.x + bb.width);
        minY = Math.min(minY, bb.y);
        maxY = Math.max(maxY, bb.y + bb.height);
    }
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
        setScale(1);
        setOffsetXCanvas(canvas.width / 2);
        setOffsetYCanvas(canvas.height / 2);
        if (globalUpdateZoomIndicator) globalUpdateZoomIndicator();
        Drawing.drawAll();
        return;
    }
    let contentWidth = maxX - minX;
    let contentHeight = maxY - minY;
    const margin = 50; // px
    // Garante que contentWidth e contentHeight nunca sejam menores que 1
    contentWidth = Math.max(contentWidth, 1);
    contentHeight = Math.max(contentHeight, 1);
    // Permite zoom out total: escala pode ser qualquer valor >= 0.1
    const scaleX = (canvas.width - 2 * margin) / contentWidth;
    const scaleY = (canvas.height - 2 * margin) / contentHeight;
    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.max(newScale, 0.1); // nunca deixa sumir
    // Debug: mostrar valores no console
    // Centraliza exatamente no centro do bounding box
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    const offsetX = canvas.width / 2 - contentCenterX * newScale;
    const offsetY = canvas.height / 2 - contentCenterY * newScale;
    setScale(newScale);
    setOffsetXCanvas(offsetX);
    setOffsetYCanvas(offsetY);
    if (globalUpdateZoomIndicator) globalUpdateZoomIndicator();
    Drawing.drawAll();
}
// Make centerView globally accessible
window.centerView = centerView;

// Função para restaurar layout do localStorage ao carregar a página
// Função para inicializar o dropdown de largura de conexões
function initializeConnectionDropdown() {
    const connectionBtn = document.getElementById('createConnectionBtn');
    const connectionMenu = document.getElementById('connectionTypeMenu');
    const connectionBtnLabel = document.getElementById('connectionBtnLabel');
    
    if (!connectionBtn || !connectionMenu || !connectionBtnLabel) return;
    
    // Toggle menu visibility
    connectionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        connectionMenu.classList.toggle('open');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!connectionBtn.contains(e.target) && !connectionMenu.contains(e.target)) {
            connectionMenu.classList.remove('open');
        }
    });
    
    // Handle menu item selection
    connectionMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;
        
        e.stopPropagation();
        
        const width = item.dataset.width;
        
        // Remove previous selection
        connectionMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        
        if (width === 'custom') {
            // Handle custom width
            const customWidth = prompt('Digite a largura personalizada em cm:', getCurrentConnectionWidth());
            if (customWidth && !isNaN(customWidth) && customWidth > 0) {
                setCurrentConnectionWidth(parseInt(customWidth));
                connectionBtnLabel.textContent = `Conexão (${getCurrentConnectionWidth()}cm)`;
                
                // Atualizar opções de NavMesh para incluir nova largura
                if (window.refreshNavMeshOptions) {
                    setTimeout(() => window.refreshNavMeshOptions(), 200);
                }
            }
        } else {
            // Handle predefined widths
            setCurrentConnectionWidth(parseInt(width));
            connectionBtnLabel.textContent = item.textContent;
            item.classList.add('selected');
        }
        
        // Close menu and activate tool
        connectionMenu.classList.remove('open');
        setActiveTool('createConnectionBtn');
    });
}

// Função para inicializar o dropdown de formas geométricas (Linhas Livres)
function initializeFreeLineShapeDropdown() {
    const freeLineBtn = document.getElementById('createFreeLineBtn');
    const freeLineMenu = document.getElementById('freeLineShapeMenu');
    const freeLineBtnLabel = document.getElementById('freeLineBtnLabel');
    const freeLineBtnIcon = document.getElementById('freeLineBtnIcon');

    if (!freeLineBtn || !freeLineMenu || !freeLineBtnLabel) return;

    const shapeLabels = {
        'line': 'Linha',
        'rectangle': 'Retângulo',
        'circle': 'Círculo',
        'triangle': 'Triângulo',
        'dimension': 'Cota'
    };
    const shapeIcons = {
        'line': 'fas fa-pen',
        'rectangle': 'far fa-square',
        'circle': 'far fa-circle',
        'triangle': 'fas fa-play fa-rotate-270',
        'dimension': 'fas fa-ruler-combined'
    };

    // Toggle menu visibility
    freeLineBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const btnGroup = document.getElementById('createFreeLineBtnGroup');
        if (btnGroup) btnGroup.classList.toggle('open');
        freeLineMenu.classList.toggle('open');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        const btnGroup = document.getElementById('createFreeLineBtnGroup');
        if (!freeLineBtn.contains(e.target) && !freeLineMenu.contains(e.target)) {
            freeLineMenu.classList.remove('open');
            if (btnGroup) btnGroup.classList.remove('open');
        }
    });

    // Handle menu item selection
    freeLineMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;

        e.stopPropagation();

        const shape = item.dataset.shape;
        if (!shape) return;

        // Remove previous selection
        freeLineMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        // Update button label and icon
        freeLineBtnLabel.textContent = shapeLabels[shape] || 'Linha';
        if (freeLineBtnIcon) {
            freeLineBtnIcon.className = shapeIcons[shape] || 'fas fa-pen';
        }

        // Update state
        import('./state.js').then(({ setFreeLineShapeMode }) => {
            setFreeLineShapeMode(shape);
        });

        // Close menu and activate tool
        freeLineMenu.classList.remove('open');
        const btnGroup = document.getElementById('createFreeLineBtnGroup');
        if (btnGroup) btnGroup.classList.remove('open');
        setActiveTool('createFreeLineBtn');
    });
}

// Função para inicializar o dropdown de formas geométricas (Zonas de Exclusão)
function initializeExclusionZoneShapeDropdown() {
    const exzBtn = document.getElementById('createExclusionZoneBtn');
    const exzMenu = document.getElementById('exclusionZoneShapeMenu');
    const exzBtnLabel = document.getElementById('exclusionZoneBtnLabel');
    const exzBtnIcon = document.getElementById('exclusionZoneBtnIcon');

    if (!exzBtn || !exzMenu || !exzBtnLabel) return;

    const shapeLabels = {
        'rectangle': 'Retângulo',
        'circle': 'Círculo',
        'triangle': 'Triângulo'
    };
    const shapeIcons = {
        'rectangle': 'far fa-square',
        'circle': 'far fa-circle',
        'triangle': 'fas fa-play fa-rotate-270'
    };

    // Toggle menu visibility
    exzBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const btnGroup = document.getElementById('createExclusionZoneBtnGroup');
        if (btnGroup) btnGroup.classList.toggle('open');
        exzMenu.classList.toggle('open');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        const btnGroup = document.getElementById('createExclusionZoneBtnGroup');
        if (!exzBtn.contains(e.target) && !exzMenu.contains(e.target)) {
            exzMenu.classList.remove('open');
            if (btnGroup) btnGroup.classList.remove('open');
        }
    });

    // Handle menu item selection
    exzMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;

        e.stopPropagation();

        const shape = item.dataset.shape;
        if (!shape) return;

        // Remove previous selection
        exzMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        // Update button label and icon
        exzBtnLabel.textContent = 'Exclusão: ' + (shapeLabels[shape] || 'Retângulo');
        if (exzBtnIcon) {
            exzBtnIcon.className = shapeIcons[shape] || 'far fa-square';
        }

        // Update state
        import('./state.js').then(({ setExclusionZoneShapeMode }) => {
            setExclusionZoneShapeMode(shape);
        });

        // Close menu and activate tool
        exzMenu.classList.remove('open');
        const btnGroup = document.getElementById('createExclusionZoneBtnGroup');
        if (btnGroup) btnGroup.classList.remove('open');
        setActiveTool('createExclusionZoneBtn');
    });
}

// Expor função global para obter largura atual da conexão (usa state centralizado)
window.getCurrentConnectionWidth = getCurrentConnectionWidth;
window.setCurrentConnectionWidth = setCurrentConnectionWidth;

// Função para inicializar o dropdown do NavMesh Debug
function initializeNavMeshDropdown() {
    const navMeshBtn = document.getElementById('toggleNavMeshBtn');
    const dropdownContainer = navMeshBtn?.parentElement;
    const navMeshDropdown = document.getElementById('navMeshDropdown');
    
    if (!navMeshBtn || !dropdownContainer || !navMeshDropdown) return;
    
    // Toggle menu visibility with click
    navMeshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContainer.classList.toggle('open');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdownContainer.contains(e.target)) {
            dropdownContainer.classList.remove('open');
        }
    });
    
    // Prevent dropdown from closing when clicking inside it
    navMeshDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function main() {
    // Limpar seleção ao clicar em qualquer botão do menu principal, exceto o botão da paleta de cores
    const allMenuButtons = document.querySelectorAll('.tool-button, .theme-toggle, .action-button');
    allMenuButtons.forEach(btn => {
        if (btn.id === 'colorPaletteBtn' || btn.id === 'toggleRightSidebarBtn') return;
        btn.addEventListener('click', () => {
            import('./state.js').then(state => state.clearAllSelections());
        });
    });
    // Inicializar canvas e contexto compartilhados
    const domCanvas = document.getElementById('layoutCanvas');
    const domCtx = domCanvas.getContext('2d');
    
    const staticDomCanvas = document.getElementById('staticCanvas');
    const staticDomCtx = staticDomCanvas.getContext('2d');

    setCanvas(domCanvas);
    setCtx(domCtx);
    setStaticCanvas(staticDomCanvas);
    setStaticCtx(staticDomCtx);

    initializeConnectionAnimator({
        spriteSrc: window.connectionOperatorSpriteSrc || 'assets/operator-walking.svg',
        workingSpriteSrc: window.connectionOperatorWorkingSpriteSrc || 'assets/operator-working.svg',
        palletSpriteSrc: window.connectionOperatorPalletSpriteSrc || 'assets/operator-pallet.svg',
        frameRate: 30
    });
    initializeFloorManager();
    // Definir variáveis globais para acesso de outras funções
    globalCanvas = domCanvas;

    // Função para redimensionar o canvas ao tamanho do container
    function resizeCanvas() {
        const container = document.getElementById('canvas-container');
        if (container) {
            // Forçar reflow para garantir que as dimensões CSS estejam atualizadas
            container.offsetHeight; // Force reflow
            const containerRect = container.getBoundingClientRect();
            // Verificar se o sidebar direito está oculto
            const appContent = document.querySelector('.app-content');
            const isRightSidebarHidden = appContent?.classList.contains('right-sidebar-hidden');
            // Usar as dimensões do container
            const newWidth = container.clientWidth;
            const newHeight = container.clientHeight;
            // Aplicar as novas dimensões
            domCanvas.width = newWidth;
            domCanvas.height = newHeight;
            // Forçar atualização do estilo para garantir consistência
            domCanvas.style.width = newWidth + 'px';
            domCanvas.style.height = newHeight + 'px';
            
            if (staticDomCanvas) {
                staticDomCanvas.width = newWidth;
                staticDomCanvas.height = newHeight;
                staticDomCanvas.style.width = newWidth + 'px';
                staticDomCanvas.style.height = newHeight + 'px';
            }
            } else {
            // fallback: full window
            domCanvas.width = window.innerWidth;
            domCanvas.height = window.innerHeight;
            
            if (staticDomCanvas) {
                staticDomCanvas.width = window.innerWidth;
                staticDomCanvas.height = window.innerHeight;
            }
        }
        // Recentrar a vista se existirem áreas
        const areas = getAllMovementAreas();
        if (areas && areas.length > 0) {
            centerView();
        } else {
            Drawing.drawAll();
        }
    }

    // Adiciona ResizeObserver para canvas-container
    const container = document.getElementById('canvas-container');
    if (container && window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
        });
        resizeObserver.observe(container);
    }

    // Disponibilizar resizeCanvas globalmente para uso em outros módulos
    window.resizeCanvas = resizeCanvas;
    // Inicializar o toggle do sidebar direito ANTES do primeiro resize
    // para garantir que o estado inicial esteja correto
    initializeRightSidebarToggle();
    // Usar setTimeout para garantir que as classes CSS sejam aplicadas antes do resize
    setTimeout(() => {
        resizeCanvas();
    }, 50);
    window.addEventListener('resize', resizeCanvas);    // Atualiza indicador de zoom
    function updateZoomIndicator() {
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(getScale() * 100)}%`;
        }
    }
      // Definir função global para zoom indicator
    globalUpdateZoomIndicator = updateZoomIndicator;
    // Adiciona event listener ao botão centralizar vista
    const centerViewBtn = document.getElementById('centerViewBtn');
    if (centerViewBtn) {
        centerViewBtn.addEventListener('click', () => {
            centerView();
        });
    }
    
    // Adiciona event listener ao botão de mostrar/esconder todas as cotas
    const toggleAllDimensionsBtn = document.getElementById('toggleAllDimensionsBtn');
    if (toggleAllDimensionsBtn) {
        toggleAllDimensionsBtn.addEventListener('click', () => {
            toggleAllDimensions();
        });
        
        // Verificar estado inicial das cotas e aplicar classe active se necessário
        if (getGlobalShowDimensions()) {
            toggleAllDimensionsBtn.classList.add('active');
        }
    }// Ativar modo de criação de área ao clicar no botão
    // Inicializar listeners
    initializeEventListeners();
    initializeMidpointArrowsSystem(); // Sistema de indicador de setas para midpoints
    initializeHistory(); // Sistema de undo/redo
    initializeSaveLoad(); // Sistema de salvar/carregar
    initializeExport(); // Sistema de exportação
    initializeColorPalette(); // Sistema de paleta de cores
    initializeSidebarResizing(); // Sistema de redimensionamento de sidebars
    initializeNavMeshControls(); // Sistema de visualização da NavMesh
    initializeThemeToggle(); // Nova função para o tema dark
    initializeOpeningDropdown(); // Funcionalidade do dropdown de aberturas
    initializeConnectionDropdown(); // Funcionalidade do dropdown de conexões
    initializeFreeLineShapeDropdown(); // Funcionalidade do dropdown de formas geométricas
    initializeExclusionZoneShapeDropdown(); // Funcionalidade do dropdown de zonas de exclusão
    initializeNavMeshDropdown(); // Funcionalidade do dropdown do NavMesh Debug
    initializeProductPlanner(); // Planejador de produtos
    initializePlannerAnimator(); // Sistema de animação do planner
    initializeOptimizer(); // Sistema de otimização de layout
    initializeWorkspaceTabs(); // Navegação compacta da barra lateral
    initializeMachineLibrary(); // Biblioteca SVG de máquinas
    initializeSelectionInspector(); // Inspetor de medidas no estilo Visio
    
    // Verificar estado do NavMesh e aplicar classe active se necessário
    import('./drawing.js').then(({ getNavMeshVisualizationState }) => {
        const toggleNavMeshBtn = document.getElementById('toggleNavMeshBtn');
        if (toggleNavMeshBtn && getNavMeshVisualizationState()) {
            toggleNavMeshBtn.classList.add('active');
        }
    });
    
    // Começar com um projeto vazio. O usuário cria a primeira área no canvas.
    Drawing.drawAll();
    const toolButtons = [
        'createAreaBtn',
        'createWallBtn',
        'createFreeLineBtn',
        'createBlockingBtn',
        'createResourceBtn',
        'createOperatorBtn',
        'createHubBtn',
        'createStairBtn',
        'createExclusionZoneBtn',
        'createConnectionBtn',
        'createOpeningBtn'
    ];
    toolButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                const currentToolId = getCurrentTool();
                const newToolId = currentToolId === btnId ? null : btnId;
                setActiveTool(newToolId);
            });
        }
    });
    // Desativar ferramenta atual ao pressionar ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            setActiveTool(null);
        }
    });
}
// Função para inicializar o toggle do sidebar direito
function initializeRightSidebarToggle() {
    const toggleBtn = document.getElementById('toggleRightSidebarBtn');
    const rightSidebar = document.querySelector('.right-sidebar');
    const toggleIcon = toggleBtn.querySelector('i');    // Estado inicial: sidebar oculto
    let isHidden = true;
    rightSidebar.classList.add('hidden');
    toggleIcon.className = 'fas fa-eye'; // Ícone de "mostrar"
    toggleBtn.title = 'Mostrar Menu Direito';
    toggleBtn.classList.remove('active'); // Garantir que começa sem a classe active
    
    toggleBtn.addEventListener('click', () => {
        isHidden = !isHidden;
        if (isHidden) {
            // Ocultar sidebar
            rightSidebar.classList.add('hidden');
            toggleIcon.className = 'fas fa-eye';
            toggleBtn.title = 'Mostrar Menu Direito';
            toggleBtn.classList.remove('active');
        } else {
            // Mostrar sidebar
            rightSidebar.classList.remove('hidden');
            toggleIcon.className = 'fas fa-eye-slash';
            toggleBtn.title = 'Ocultar Menu Direito';
            toggleBtn.classList.add('active');
        }
        // Sidebar é overlay (position fixed), canvas não precisa de resize
        if (false) {
            const container = document.getElementById('canvas-container');
            if (container && globalCanvas) {
                container.offsetHeight;
                const newWidth = container.clientWidth;
                const newHeight = container.clientHeight;
                globalCanvas.width = newWidth;
                globalCanvas.height = newHeight;
                globalCanvas.style.width = newWidth + 'px';
                globalCanvas.style.height = newHeight + 'px';
                // Recentrar a vista após redimensionar o canvas
                centerView();
            }
        } // fim if (false)
    });
}
// Função para inicializar o toggle do tema dark
function initializeThemeToggle() {
    const toggleBtn = document.getElementById('toggleThemeBtn');
    const body = document.body;
    const toggleIcon = toggleBtn.querySelector('i');
    // Verificar se há preferência salva no localStorage
    const savedTheme = localStorage.getItem('theme');
    let isDarkTheme = savedTheme === 'dark';
    // Aplicar tema inicial
    if (isDarkTheme) {
        body.classList.add('dark-theme');
        toggleIcon.className = 'fas fa-sun';
        toggleBtn.title = 'Modo Claro';
    } else {
        body.classList.remove('dark-theme');
        toggleIcon.className = 'fas fa-moon';
        toggleBtn.title = 'Modo Escuro';
    }
    // Event listener para toggle
    toggleBtn.addEventListener('click', () => {
        isDarkTheme = !isDarkTheme;
        if (isDarkTheme) {
            body.classList.add('dark-theme');
            toggleIcon.className = 'fas fa-sun';
            toggleBtn.title = 'Modo Claro';
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark-theme');
            toggleIcon.className = 'fas fa-moon';
            toggleBtn.title = 'Modo Escuro';
            localStorage.setItem('theme', 'light');
        }
        // Redesenhar canvas para aplicar as novas cores
        Drawing.drawAll();
    });
}
// --- Alternar Exibição de Todas as Cotas (função global) ---
function toggleAllDimensions() {
    // Usar a função do config.js para alternar o estado global
    const newState = toggleGlobalDimensions();
    
    // Atualizar o texto do botão e estado visual
    const toggleAllDimensionsBtn = document.getElementById('toggleAllDimensionsBtn');
    if (toggleAllDimensionsBtn) {
        const span = toggleAllDimensionsBtn.querySelector('span');
        if (span) {
            span.textContent = newState ? 'Esconder Todas as Cotas' : 'Mostrar Todas as Cotas';
        }
        
        // Aplicar ou remover classe active baseado no estado
        if (newState) {
            toggleAllDimensionsBtn.classList.add('active');
        } else {
            toggleAllDimensionsBtn.classList.remove('active');
        }
    }
    
    // Redesenhar o canvas
    Drawing.drawAll();
}
// Expor funções globalmente para debug
window.drawAll = Drawing.drawAll;

// Executa main ao carregar
window.addEventListener('DOMContentLoaded', main);
// Expor configurações globalmente para controle dinâmico
window.config = {
    virtualDimensionsEnabled: true,
    toggleVirtualDimensions: function() {
        this.virtualDimensionsEnabled = !this.virtualDimensionsEnabled;
        return this.virtualDimensionsEnabled;
    }
};
// --- Funcionalidade do Dropdown de Aberturas ---
function initializeOpeningDropdown() {
    const openingBtn = document.getElementById('createOpeningBtn');
    const dropdownMenu = document.getElementById('openingTypeMenu');
    const toolButtonGroup = openingBtn?.parentElement;
    if (!openingBtn || !dropdownMenu || !toolButtonGroup) return;
    let selectedOpeningType = 'door'; // Tipo padrão
    // Toggle do dropdown
    openingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toolButtonGroup.classList.toggle('open');
        dropdownMenu.classList.toggle('open');
    });
      // Seleção de tipo de abertura
    dropdownMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;
        selectedOpeningType = item.dataset.openingType;
        // Atualizar visual do item selecionado
        dropdownMenu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        // Atualizar ícone do botão principal
        const newIcon = item.querySelector('i').className;
        openingBtn.querySelector('i').className = newIcon;
        // Fechar dropdown
        toolButtonGroup.classList.remove('open');
        dropdownMenu.classList.remove('open');
        // Ativar ferramenta de abertura e iniciar modo de criação
        setActiveTool('createOpeningBtn');
        startCreatingOpening();
    });
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        if (!toolButtonGroup.contains(e.target)) {
            toolButtonGroup.classList.remove('open');
            dropdownMenu.classList.remove('open');
        }
    });
    // Fechar dropdown com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toolButtonGroup.classList.remove('open');
            dropdownMenu.classList.remove('open');
        }
    });
    // Expor tipo selecionado globalmente
    window.getSelectedOpeningType = () => selectedOpeningType;
}
// Expor funções de visualização da NavMesh globalmente
import { toggleNavMeshVisualization, setNavMeshVisualWidth } from './drawing.js';
window.toggleNavMeshVisualization = toggleNavMeshVisualization;
window.setNavMeshVisualWidth = setNavMeshVisualWidth;

// Inicializar migração automática das aberturas ao carregar
setTimeout(() => {
    migrateBaseOpeningsToAdvanced();
}, 1000);

