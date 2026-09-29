import { createSaveSnapshot, loadFromSnapshotAsync } from './saveload.js';
import { getLayoutTitle } from './layout-metadata.js';
import { showConfirmDialog, showToast } from './ui-shell.js';

const STORAGE_KEY = 'gregorios-cad-project-versions-v1';
const MAX_VERSIONS = 12;

function readVersions() {
    try {
        const versions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(versions) ? versions : [];
    } catch {
        return [];
    }
}

function writeVersions(versions) {
    let retained = versions.slice(0, MAX_VERSIONS);
    if (!retained.length) {
        localStorage.setItem(STORAGE_KEY, '[]');
        return retained;
    }
    while (retained.length) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
            return retained;
        } catch {
            retained = retained.slice(0, -1);
        }
    }
    throw new Error('Não há espaço disponível para guardar versões neste navegador.');
}

function getSnapshotStats(snapshot) {
    const data = snapshot?.data || {};
    const floors = Array.isArray(data.floors) ? data.floors : [];
    const count = key => floors.length
        ? floors.reduce((total, floor) => total + (Array.isArray(floor[key]) ? floor[key].length : 0), 0)
        : (Array.isArray(data[key]) ? data[key].length : 0);
    return {
        floors: floors.length || 1,
        resources: count('resources'),
        walls: count('walls'),
        areas: count('movementAreas') || count('areas')
    };
}

function formatDate(value) {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function downloadVersion(version) {
    const blob = new Blob([JSON.stringify(version.snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${version.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'versao'}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function initializeVersionHistory() {
    const openButton = document.getElementById('openVersionHistoryBtn');
    if (!openButton) return;

    const overlay = document.createElement('div');
    overlay.className = 'version-history-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <section class="version-history-panel" role="dialog" aria-modal="true" aria-labelledby="versionHistoryTitle">
            <header>
                <div><span>Projeto</span><h2 id="versionHistoryTitle">Histórico de versões</h2></div>
                <button type="button" data-version-close aria-label="Fechar"><i class="fas fa-xmark"></i></button>
            </header>
            <div class="version-history-create">
                <div><strong>Ponto de restauração</strong><small>Guarde o estado atual antes de experimentar alterações.</small></div>
                <button type="button" id="createProjectVersionBtn"><i class="fas fa-plus"></i> Criar versão</button>
            </div>
            <div class="version-history-list" id="versionHistoryList"></div>
            <footer><span>Até ${MAX_VERSIONS} versões ficam salvas neste navegador.</span><button type="button" data-version-close>Concluir</button></footer>
        </section>`;
    document.body.appendChild(overlay);

    const list = overlay.querySelector('#versionHistoryList');
    const createButton = overlay.querySelector('#createProjectVersionBtn');

    const render = () => {
        const versions = readVersions();
        if (!versions.length) {
            list.innerHTML = '<div class="version-history-empty"><i class="fas fa-clock-rotate-left"></i><strong>Nenhuma versão criada</strong><span>Crie um ponto de restauração para voltar a este estado depois.</span></div>';
            return;
        }
        list.innerHTML = versions.map((version, index) => {
            const stats = getSnapshotStats(version.snapshot);
            return `<article class="version-history-item" data-version-id="${escapeHtml(version.id)}">
                <div class="version-history-index">V${String(version.sequence || versions.length - index).padStart(2, '0')}</div>
                <div class="version-history-copy">
                    <strong>${escapeHtml(version.name)}</strong>
                    <span>${formatDate(version.createdAt)}</span>
                    <small>${stats.floors} pav. · ${stats.resources} equipamentos · ${stats.walls} paredes · ${stats.areas} áreas</small>
                </div>
                <div class="version-history-actions">
                    <button type="button" data-version-restore title="Restaurar versão"><i class="fas fa-rotate-left"></i><span>Restaurar</span></button>
                    <button type="button" data-version-download title="Baixar versão"><i class="fas fa-download"></i></button>
                    <button type="button" data-version-delete title="Excluir versão"><i class="fas fa-trash"></i></button>
                </div>
            </article>`;
        }).join('');
    };

    const createVersion = automatic => {
        const versions = readVersions();
        const snapshot = createSaveSnapshot();
        const title = getLayoutTitle() || 'Layout sem nome';
        const nextNumber = versions.reduce((max, version) => Math.max(max, Number(version.sequence) || 0), 0) + 1;
        writeVersions([{
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sequence: nextNumber,
            name: `${title} · versão ${String(nextNumber).padStart(2, '0')}`,
            createdAt: new Date().toISOString(),
            source: automatic ? 'save' : 'manual',
            snapshot
        }, ...versions]);
        render();
        showToast(automatic ? 'Versão criada junto com o salvamento.' : 'Ponto de restauração criado.', 'success');
    };

    const open = () => {
        render();
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
    };
    const close = () => {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        openButton.focus();
    };

    openButton.addEventListener('click', open);
    overlay.querySelectorAll('[data-version-close]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    createButton.addEventListener('click', () => {
        try { createVersion(false); } catch (error) { showToast(error.message, 'error'); }
    });
    window.addEventListener('gregorios:manual-save', () => {
        try { createVersion(true); } catch (error) { console.warn(error); }
    });
    window.addEventListener('gregorios:create-version', () => {
        try { createVersion(false); } catch (error) { console.warn(error); }
    });

    list.addEventListener('click', async event => {
        const item = event.target.closest('[data-version-id]');
        if (!item) return;
        const versions = readVersions();
        const version = versions.find(entry => entry.id === item.dataset.versionId);
        if (!version) return;

        if (event.target.closest('[data-version-download]')) {
            downloadVersion(version);
            return;
        }
        if (event.target.closest('[data-version-delete]')) {
            const confirmed = await showConfirmDialog({
                title: 'Excluir esta versão?',
                message: 'O ponto de restauração será removido deste navegador.',
                confirmLabel: 'Excluir versão',
                danger: true
            });
            if (confirmed) {
                writeVersions(versions.filter(entry => entry.id !== version.id));
                render();
                showToast('Versão excluída.', 'success');
            }
            return;
        }
        if (event.target.closest('[data-version-restore]')) {
            const confirmed = await showConfirmDialog({
                title: 'Restaurar esta versão?',
                message: `O layout atual será substituído pelo estado de ${formatDate(version.createdAt)}.`,
                confirmLabel: 'Restaurar versão'
            });
            if (confirmed) {
                close();
                await loadFromSnapshotAsync(version.snapshot);
                showToast('Versão restaurada com sucesso.', 'success');
            }
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('open')) close();
    });
}
