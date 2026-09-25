const ONBOARDING_STORAGE_KEY = 'gregorios-cad-onboarding-seen-v1';

const steps = [
    {
        icon: 'fa-vector-square',
        title: 'Defina o espaço',
        text: 'Crie a área do layout, escolha a unidade de medida e use a grade como referência do chão de fábrica.'
    },
    {
        icon: 'fa-industry',
        title: 'Posicione as máquinas',
        text: 'Abra Máquinas, arraste os stencils para a prancha e use o botão direito para editar medidas, dados e rotação.'
    },
    {
        icon: 'fa-ruler-combined',
        title: 'Valide e apresente',
        text: 'Adicione cotas e fluxos, confira o Diagrama de Espaguete e salve ou exporte a versão final.'
    }
];

const shortcuts = [
    ['Espaço + arrastar', 'Navegar pela prancha'],
    ['Ctrl + roda do mouse', 'Aproximar ou afastar'],
    ['Botão direito', 'Editar o item selecionado'],
    ['Delete', 'Excluir linha ou objeto selecionado'],
    ['Ctrl + Z', 'Desfazer a última ação'],
    ['Ctrl + Y', 'Refazer a última ação'],
    ['Esc', 'Cancelar a ferramenta atual']
];

function markAsSeen() {
    try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
        // O guia segue funcional quando o armazenamento não está disponível.
    }
}

function closeOnboarding(overlay) {
    markAsSeen();
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
}

function createOnboarding() {
    const overlay = document.createElement('div');
    overlay.id = 'onboardingOverlay';
    overlay.className = 'onboarding-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <section class="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
            <button class="onboarding-close" type="button" aria-label="Fechar guia"><i class="fas fa-xmark"></i></button>
            <header class="onboarding-header">
                <span class="onboarding-kicker">Primeiros passos</span>
                <h2 id="onboardingTitle">Bem-vindo ao Gregório's CAD</h2>
                <p>Monte layouts industriais em escala, conecte o fluxo e leve uma prancha organizada para análise ou impressão.</p>
            </header>
            <div class="onboarding-steps">
                ${steps.map((step, index) => `
                    <article class="onboarding-step">
                        <span class="onboarding-step-number">${index + 1}</span>
                        <i class="fas ${step.icon}" aria-hidden="true"></i>
                        <div><h3>${step.title}</h3><p>${step.text}</p></div>
                    </article>
                `).join('')}
            </div>
            <section class="onboarding-shortcuts" aria-labelledby="shortcutTitle">
                <div class="onboarding-section-title">
                    <i class="fas fa-keyboard" aria-hidden="true"></i>
                    <h3 id="shortcutTitle">Atalhos essenciais</h3>
                </div>
                <div class="shortcut-grid">
                    ${shortcuts.map(([keys, action]) => `<div class="shortcut-row"><kbd>${keys}</kbd><span>${action}</span></div>`).join('')}
                </div>
            </section>
            <footer class="onboarding-footer">
                <span>Você pode reabrir este guia na aba Projeto.</span>
                <button class="onboarding-start" type="button">Entendi, começar</button>
            </footer>
        </section>`;

    const close = () => closeOnboarding(overlay);
    overlay.querySelector('.onboarding-close')?.addEventListener('click', close);
    overlay.querySelector('.onboarding-start')?.addEventListener('click', close);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) close();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('open')) close();
    });
    document.body.appendChild(overlay);
    return overlay;
}

export function initializeOnboarding() {
    const overlay = document.getElementById('onboardingOverlay') || createOnboarding();
    const open = () => {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        overlay.querySelector('.onboarding-close')?.focus();
    };

    document.getElementById('openOnboardingBtn')?.addEventListener('click', open);

    let alreadySeen = false;
    try {
        alreadySeen = localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
    } catch {
        alreadySeen = false;
    }
    if (!alreadySeen) window.setTimeout(open, 350);
}
