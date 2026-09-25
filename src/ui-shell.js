export function showToast(message, tone = 'default') {
    let toast = document.getElementById('cadToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cadToast';
        toast.className = 'cad-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }

    toast.dataset.tone = tone;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(window.cadToastTimer);
    window.cadToastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

export function showConfirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay cad-confirm-overlay';
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal-content cad-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cadConfirmTitle">
                <div class="modal-header">
                    <i class="fas fa-file-circle-plus" aria-hidden="true"></i>
                    <h3 id="cadConfirmTitle" class="modal-title"></h3>
                </div>
                <div class="modal-body"><p></p></div>
                <div class="modal-footer">
                    <button type="button" class="modal-button secondary" data-action="cancel"></button>
                    <button type="button" class="modal-button ${danger ? 'danger' : 'primary'}" data-action="confirm"></button>
                </div>
            </div>`;
        overlay.querySelector('.modal-title').textContent = title;
        overlay.querySelector('.modal-body p').textContent = message;
        overlay.querySelector('[data-action="cancel"]').textContent = cancelLabel;
        overlay.querySelector('[data-action="confirm"]').textContent = confirmLabel;

        const finish = result => {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(result);
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') finish(false);
        };
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('[data-action="cancel"]')) finish(false);
            if (event.target.closest('[data-action="confirm"]')) finish(true);
        });
        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(overlay);
        overlay.querySelector('[data-action="cancel"]').focus();
    });
}

const LEFT_SIDEBAR_STORAGE_KEY = 'gregorios-cad-left-sidebar-collapsed';

export function mountSidebarPopover(trigger, panel) {
    if (!trigger || !panel) return;
    trigger.setAttribute('aria-haspopup', 'listbox');
    panel.setAttribute('role', 'listbox');
    panel.querySelectorAll('.dropdown-item').forEach(item => {
        item.setAttribute('role', 'option');
        item.tabIndex = 0;
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                item.click();
            }
        });
    });
    panel.classList.add('sidebar-floating-popover');
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
}

export function positionSidebarPopover(trigger, panel) {
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.max(rect.width, Math.min(286, window.innerWidth - margin * 2));
    panel.style.position = 'fixed';
    panel.style.right = 'auto';
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
    panel.style.top = `${rect.bottom + 6}px`;
    requestAnimationFrame(() => {
        const panelRect = panel.getBoundingClientRect();
        if (panelRect.bottom > window.innerHeight - margin) {
            panel.style.top = `${Math.max(margin, rect.top - panelRect.height - 6)}px`;
        }
    });
}

function notifyWorkspaceResize() {
    requestAnimationFrame(() => {
        if (typeof window.resizeCanvas === 'function') window.resizeCanvas();
        window.dispatchEvent(new Event('resize'));
    });
}

export function setRightSidebarVisible(visible) {
    const sidebar = document.querySelector('.right-sidebar');
    const toggle = document.getElementById('toggleRightSidebarBtn');
    if (!sidebar || !toggle) return;
    const icon = toggle.querySelector('i');
    sidebar.classList.toggle('hidden', !visible);
    toggle.classList.toggle('active', visible);
    toggle.title = visible ? 'Ocultar Menu Direito' : 'Mostrar Menu Direito';
    toggle.setAttribute('aria-pressed', String(visible));
    if (icon) icon.className = visible ? 'fas fa-eye-slash' : 'fas fa-eye';
}

export function initializeLeftSidebarToggle() {
    const sidebar = document.querySelector('.left-sidebar');
    const toggle = document.getElementById('toggleLeftSidebarBtn');
    if (!sidebar || !toggle) return;

    const commandCenter = document.getElementById('sidebarCommandCenter');
    const headerActions = document.querySelector('.app-header .header-actions');
    const watermark = document.getElementById('canvasBrandWatermark');
    const brand = document.querySelector('.app-header .logo-container');
    if (commandCenter && headerActions) commandCenter.appendChild(headerActions);
    if (headerActions) organizeProjectCommands(headerActions);
    if (watermark && brand) watermark.appendChild(brand);
    document.querySelector('.app-header')?.remove();

    const applyState = collapsed => {
        sidebar.classList.toggle('collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral');
        toggle.title = collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral';
        const icon = toggle.querySelector('i');
        if (icon) icon.className = collapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
        try {
            localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
        } catch {
            // A barra continua funcional durante a sessão quando o armazenamento não está disponível.
        }
        notifyWorkspaceResize();
    };

    let startsCollapsed = false;
    try {
        startsCollapsed = localStorage.getItem(LEFT_SIDEBAR_STORAGE_KEY) === '1';
    } catch {
        startsCollapsed = false;
    }
    applyState(startsCollapsed);
    toggle.addEventListener('click', () => applyState(!sidebar.classList.contains('collapsed')));
}

function organizeProjectCommands(headerActions) {
    const commandLabels = {
        newLayoutBtn: 'Novo layout',
        saveLayoutBtn: 'Salvar',
        loadLayoutBtn: 'Carregar',
        exportImgBtn: 'Exportar',
        undoBtn: 'Desfazer',
        redoBtn: 'Refazer',
        centerViewBtn: 'Centralizar',
        toggleAllDimensionsBtn: 'Cotas',
        toggleRightSidebarBtn: 'Propriedades',
        colorPaletteBtn: 'Cores',
        toggleNavMeshBtn: 'Malha',
        toggleThemeBtn: 'Tema',
        openSpaghettiDiagramBtn: 'Fluxos',
        openProductPlannerBtn: 'Roteiro',
        headerPlayBtn: 'Executar',
        headerStopBtn: 'Parar'
    };

    const addReadableLabels = item => {
        if (item.matches('.zoom-indicator') && !item.querySelector('.project-command-label')) {
            const label = document.createElement('span');
            label.className = 'project-command-label';
            label.textContent = 'Zoom';
            item.appendChild(label);
        }
        const buttons = item.matches('button') ? [item] : Array.from(item.querySelectorAll('button'));
        buttons.forEach(button => {
            const labelText = commandLabels[button.id];
            if (!labelText) return;
            let label = Array.from(button.children).find(child => child.tagName === 'SPAN');
            if (!label) {
                label = document.createElement('span');
                button.appendChild(label);
            }
            label.classList.add('project-command-label');
            label.textContent = labelText;
        });
    };

    const spaghettiButton = headerActions.querySelector('#openSpaghettiDiagramBtn');
    const drawingFlowCluster = document.getElementById('drawingFlowCluster');
    if (spaghettiButton && drawingFlowCluster) {
        spaghettiButton.className = 'tool-button spaghetti-trigger tool-button-wide';
        const label = spaghettiButton.querySelector('span');
        if (label) label.textContent = 'Diagrama de Espaguete';
        drawingFlowCluster.appendChild(spaghettiButton);
    }

    const definitions = [
        {
            title: 'Arquivo',
            icon: 'fa-folder-open',
            selectors: ['#newLayoutBtn', '#saveLayoutBtn', '#loadLayoutBtn', '#exportImgBtn']
        },
        {
            title: 'Edição',
            icon: 'fa-pen-to-square',
            selectors: ['#undoBtn', '#redoBtn']
        },
        {
            title: 'Visualização',
            icon: 'fa-eye',
            selectors: ['.zoom-indicator', '#centerViewBtn', '#toggleAllDimensionsBtn', '#toggleRightSidebarBtn', '#colorPaletteBtn', '#toggleThemeBtn']
        },
        {
            title: 'Análise e simulação',
            icon: 'fa-chart-line',
            selectors: ['#openProductPlannerBtn', '#toggleNavMeshBtn', '.planner-controls-header']
        }
    ];

    const resolveItem = selector => {
        const element = headerActions.querySelector(selector);
        if (!element) return null;
        return element.closest('.dropdown-container') || element;
    };

    definitions.forEach(definition => {
        const group = document.createElement('section');
        group.className = 'project-command-group';
        group.innerHTML = `<div class="project-command-heading"><i class="fas ${definition.icon}" aria-hidden="true"></i><h3>${definition.title}</h3></div><div class="project-command-grid"></div>`;
        const grid = group.querySelector('.project-command-grid');
        const moved = new Set();
        definition.selectors.forEach(selector => {
            const item = resolveItem(selector);
            if (!item || moved.has(item)) return;
            moved.add(item);
            addReadableLabels(item);
            grid.appendChild(item);
        });
        headerActions.appendChild(group);
    });
}

export function initializeWorkspaceTabs() {
    const tabs = Array.from(document.querySelectorAll('.workspace-tab'));
    const drawPanels = Array.from(document.querySelectorAll('.draw-workspace-panel'));
    const machinePanel = document.getElementById('machineLibraryPanel');
    const projectPanels = Array.from(document.querySelectorAll('.project-workspace-panel'));

    if (!tabs.length || !machinePanel) return;

    const activate = (workspace) => {
        const showMachines = workspace === 'machines';
        const showProject = workspace === 'project';
        tabs.forEach(tab => {
            const active = tab.dataset.workspace === workspace;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        drawPanels.forEach(panel => panel.classList.toggle('workspace-hidden', showMachines || showProject));
        machinePanel.classList.toggle('hidden', !showMachines);
        projectPanels.forEach(panel => panel.classList.toggle('workspace-hidden', !showProject));
    };

    tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.workspace || 'draw')));
    activate('draw');
}
