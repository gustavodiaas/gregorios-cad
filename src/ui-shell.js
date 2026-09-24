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

const LEFT_SIDEBAR_STORAGE_KEY = 'gregorios-cad-left-sidebar-collapsed';

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

export function initializeWorkspaceTabs() {
    const tabs = Array.from(document.querySelectorAll('.workspace-tab'));
    const drawPanels = Array.from(document.querySelectorAll('.draw-workspace-panel'));
    const machinePanel = document.getElementById('machineLibraryPanel');

    if (!tabs.length || !machinePanel) return;

    const activate = (workspace) => {
        const showMachines = workspace === 'machines';
        tabs.forEach(tab => {
            const active = tab.dataset.workspace === workspace;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        drawPanels.forEach(panel => panel.classList.toggle('workspace-hidden', showMachines));
        machinePanel.classList.toggle('hidden', !showMachines);
    };

    tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.workspace || 'draw')));
    activate('draw');
}
