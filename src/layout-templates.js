import { pixelsPerCm } from './config.js';
import { loadFromSnapshotAsync } from './saveload.js';
import { showConfirmDialog } from './ui-shell.js';

const MACHINE_ASSET_ROOT = 'assets/machines/';
const TEMPLATE_MARGIN_CM = 120;

const TEMPLATES = [
    {
        id: 'production-line',
        name: 'Linha de produção',
        category: 'Produção',
        description: 'Fluxo linear com alimentação, montagem, embalagem e paletização.',
        widthCm: 2000,
        heightCm: 1000,
        resources: [
            { type: 'pallet-rack', name: 'Matéria-prima', xCm: 120, yCm: 170, widthCm: 270, heightCm: 110 },
            { type: 'conveyor', name: 'Esteira de processo', xCm: 480, yCm: 400, widthCm: 600, heightCm: 120 },
            { type: 'workbench', name: 'Posto de montagem', xCm: 620, yCm: 620, widthCm: 240, heightCm: 120 },
            { type: 'packaging-machine', name: 'Embalagem', xCm: 1220, yCm: 370, widthCm: 450, heightCm: 180 },
            { type: 'palletizer', name: 'Paletização', xCm: 1600, yCm: 250, widthCm: 280, heightCm: 280 }
        ]
    },
    {
        id: 'machine-shop',
        name: 'Oficina de usinagem',
        category: 'Usinagem',
        description: 'Arranjo inicial para corte, torneamento, fresamento e inspeção.',
        widthCm: 1800,
        heightCm: 1100,
        resources: [
            { type: 'band-saw', name: 'Serra de fita', xCm: 150, yCm: 170, widthCm: 250, heightCm: 160 },
            { type: 'cnc-lathe', name: 'Torno CNC', xCm: 520, yCm: 150, widthCm: 320, heightCm: 190 },
            { type: 'machining-center', name: 'Centro de usinagem', xCm: 980, yCm: 140, widthCm: 300, heightCm: 260 },
            { type: 'milling-machine', name: 'Fresadora', xCm: 1450, yCm: 170, widthCm: 240, heightCm: 190 },
            { type: 'workbench', name: 'Inspeção', xCm: 760, yCm: 690, widthCm: 300, heightCm: 140 },
            { type: 'storage-shelf', name: 'Ferramentas', xCm: 1400, yCm: 760, widthCm: 220, heightCm: 70 }
        ]
    },
    {
        id: 'warehouse',
        name: 'Armazém compacto',
        category: 'Logística',
        description: 'Porta-paletes, corredor central, recebimento e expedição.',
        widthCm: 2200,
        heightCm: 1300,
        resources: [
            { type: 'pallet-rack', name: 'Rack A1', xCm: 180, yCm: 180, widthCm: 600, heightCm: 110 },
            { type: 'pallet-rack', name: 'Rack A2', xCm: 180, yCm: 430, widthCm: 600, heightCm: 110 },
            { type: 'pallet-rack', name: 'Rack B1', xCm: 180, yCm: 820, widthCm: 600, heightCm: 110 },
            { type: 'pallet-rack', name: 'Rack B2', xCm: 180, yCm: 1070, widthCm: 600, heightCm: 110 },
            { type: 'pallet-rack', name: 'Rack C1', xCm: 1080, yCm: 180, widthCm: 600, heightCm: 110 },
            { type: 'pallet-rack', name: 'Rack C2', xCm: 1080, yCm: 430, widthCm: 600, heightCm: 110 },
            { type: 'forklift', name: 'Empilhadeira', xCm: 900, yCm: 630, widthCm: 320, heightCm: 190 },
            { type: 'workbench', name: 'Conferência', xCm: 1740, yCm: 900, widthCm: 280, heightCm: 140 }
        ]
    },
    {
        id: 'blank-factory',
        name: 'Galpão vazio',
        category: 'Base',
        description: 'Área industrial de 20 × 12 m pronta para receber equipamentos.',
        widthCm: 2000,
        heightCm: 1200,
        resources: []
    }
];

function cm(value) {
    return value * pixelsPerCm;
}

function createResource(templateId, areaId, resource, index) {
    const x = cm(TEMPLATE_MARGIN_CM + resource.xCm);
    const y = cm(TEMPLATE_MARGIN_CM + resource.yCm);
    const width = cm(resource.widthCm);
    const height = cm(resource.heightCm);
    return {
        id: `template-${templateId}-resource-${index + 1}`,
        vertices: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
        color: '#f8fafc',
        parentAreaId: areaId,
        name: resource.name,
        locked: false,
        visible: true,
        isRectangular: true,
        type: 'resource',
        machineType: resource.type,
        machineCategory: 'Modelo inicial',
        catalogWidthCm: resource.widthCm,
        catalogHeightCm: resource.heightCm,
        imageDataUrl: `${MACHINE_ASSET_ROOT}${resource.type}.svg`,
        manufacturer: '',
        serialNumber: '',
        capacity: '',
        cycleTimeSeconds: 0
    };
}

function createTemplateSnapshot(template) {
    const areaId = `template-${template.id}-area`;
    const floorId = `template-${template.id}-floor`;
    const x = cm(TEMPLATE_MARGIN_CM);
    const y = cm(TEMPLATE_MARGIN_CM);
    const width = cm(template.widthCm);
    const height = cm(template.heightCm);
    const area = {
        id: areaId, x, y, width, height,
        vertices: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
        rings: null,
        locked: false,
        showDimensions: true
    };
    const resources = template.resources.map((resource, index) => createResource(template.id, areaId, resource, index));
    const floor = {
        id: floorId,
        name: 'Térreo',
        movementAreas: [area],
        walls: [],
        freeLines: [],
        resources,
        connections: [],
        openings: [],
        exclusionZones: []
    };
    return {
        version: '1.2.0',
        timestamp: new Date().toISOString(),
        data: {
            layoutTitle: template.name,
            floors: [floor],
            currentFloorId: floorId,
            areas: [area],
            walls: [],
            resources,
            freeLines: [],
            exclusionZones: [],
            openings: [],
            connections: [],
            hubs: [],
            layoutHash: null,
            pathCache: [],
            nextAreaId: 2,
            nextWallId: 1,
            nextResourceId: resources.length + 1,
            nextOpeningId: 1
        }
    };
}

function renderPreview(template) {
    return template.resources.map(resource => {
        const left = resource.xCm / template.widthCm * 100;
        const top = resource.yCm / template.heightCm * 100;
        const width = resource.widthCm / template.widthCm * 100;
        const height = resource.heightCm / template.heightCm * 100;
        return `<span style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"></span>`;
    }).join('');
}

export function initializeLayoutTemplates() {
    const openButton = document.getElementById('openLayoutTemplatesBtn');
    if (!openButton) return;

    const overlay = document.createElement('div');
    overlay.className = 'layout-templates-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <section class="layout-templates-panel" role="dialog" aria-modal="true" aria-labelledby="layoutTemplatesTitle">
            <header>
                <div><span>Novo projeto</span><h2 id="layoutTemplatesTitle">Modelos de layout</h2><p>Escolha uma base e continue editando normalmente.</p></div>
                <button type="button" data-template-close aria-label="Fechar"><i class="fas fa-xmark"></i></button>
            </header>
            <div class="layout-templates-grid">
                ${TEMPLATES.map(template => `<button type="button" class="layout-template-card" data-template-id="${template.id}">
                    <span class="layout-template-preview">${renderPreview(template)}</span>
                    <span class="layout-template-copy"><small>${template.category}</small><strong>${template.name}</strong><span>${template.description}</span><em>${template.widthCm / 100} × ${template.heightCm / 100} m · ${template.resources.length} itens</em></span>
                    <i class="fas fa-arrow-right" aria-hidden="true"></i>
                </button>`).join('')}
            </div>
            <footer><i class="fas fa-circle-info"></i><span>O modelo cria uma cópia totalmente editável. Seu projeto atual será salvo no histórico antes da troca.</span></footer>
        </section>`;
    document.body.appendChild(overlay);

    const open = () => {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
    };
    const close = () => {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        openButton.focus();
    };

    openButton.addEventListener('click', open);
    overlay.querySelector('[data-template-close]').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.layout-templates-grid').addEventListener('click', async event => {
        const card = event.target.closest('[data-template-id]');
        const template = TEMPLATES.find(item => item.id === card?.dataset.templateId);
        if (!template) return;
        const confirmed = await showConfirmDialog({
            title: `Usar o modelo “${template.name}”?`,
            message: 'O projeto atual será guardado no histórico e substituído por uma cópia editável deste modelo.',
            confirmLabel: 'Usar modelo'
        });
        if (!confirmed) return;
        window.dispatchEvent(new CustomEvent('gregorios:create-version'));
        close();
        await loadFromSnapshotAsync(createTemplateSnapshot(template));
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('open')) close();
    });
}
