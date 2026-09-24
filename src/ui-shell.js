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
