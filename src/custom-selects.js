const enhancedSelects = new WeakSet();
let openInstance = null;

function closeOpenSelect() {
    if (!openInstance) return;
    openInstance.host.classList.remove('open');
    openInstance.button.setAttribute('aria-expanded', 'false');
    openInstance.menu.remove();
    openInstance = null;
}

function getSelectedLabel(select) {
    return select.selectedOptions?.[0]?.textContent?.trim() || 'Selecionar';
}

function positionMenu(instance) {
    const rect = instance.button.getBoundingClientRect();
    const margin = 8;
    instance.menu.style.minWidth = `${Math.max(rect.width, 180)}px`;
    instance.menu.style.left = `${Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - margin)}px`;
    instance.menu.style.top = `${rect.bottom + 6}px`;
    requestAnimationFrame(() => {
        const menuRect = instance.menu.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight - margin) {
            instance.menu.style.top = `${Math.max(margin, rect.top - menuRect.height - 6)}px`;
        }
    });
}

function renderMenu(instance) {
    const { select, button, menu } = instance;
    button.querySelector('.cad-select-label').textContent = getSelectedLabel(select);
    button.disabled = select.disabled;
    menu.innerHTML = '';

    Array.from(select.options).forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'cad-select-option';
        item.disabled = option.disabled;
        item.dataset.value = option.value;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.innerHTML = `<span>${option.textContent}</span>${option.selected ? '<i class="fas fa-check" aria-hidden="true"></i>' : ''}`;
        item.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            button.querySelector('.cad-select-label').textContent = getSelectedLabel(select);
            closeOpenSelect();
            button.focus();
        });
        menu.appendChild(item);
    });
}

function openSelect(instance) {
    if (openInstance === instance) {
        closeOpenSelect();
        return;
    }
    closeOpenSelect();
    renderMenu(instance);
    document.body.appendChild(instance.menu);
    instance.host.classList.add('open');
    instance.button.setAttribute('aria-expanded', 'true');
    openInstance = instance;
    positionMenu(instance);
}

function enhanceSelect(select) {
    if (!(select instanceof HTMLSelectElement) || select.multiple || enhancedSelects.has(select)) return;
    enhancedSelects.add(select);

    const host = document.createElement('div');
    host.className = 'cad-select';
    select.parentNode.insertBefore(host, select);
    host.appendChild(select);
    select.classList.add('cad-select-source');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cad-select-trigger';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `<span class="cad-select-label">${getSelectedLabel(select)}</span><i class="fas fa-chevron-down" aria-hidden="true"></i>`;
    host.appendChild(button);

    const menu = document.createElement('div');
    menu.className = 'cad-select-menu';
    menu.setAttribute('role', 'listbox');
    const instance = { select, host, button, menu };

    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!select.disabled) openSelect(instance);
    });
    button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openSelect(instance);
            requestAnimationFrame(() => menu.querySelector('[aria-selected="true"]')?.focus());
        } else if (event.key === 'Escape') {
            closeOpenSelect();
        }
    });
    select.addEventListener('change', () => {
        button.querySelector('.cad-select-label').textContent = getSelectedLabel(select);
        if (openInstance === instance) renderMenu(instance);
    });
    select.addEventListener('focus', () => button.focus());
    button.disabled = select.disabled;
}

export function initializeCustomSelects() {
    document.querySelectorAll('select').forEach(enhanceSelect);

    const observer = new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(node => {
            if (!(node instanceof Element)) return;
            if (node.matches('select')) enhanceSelect(node);
            node.querySelectorAll?.('select').forEach(enhanceSelect);
        }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', event => {
        if (!openInstance) return;
        if (!openInstance.host.contains(event.target) && !openInstance.menu.contains(event.target)) closeOpenSelect();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeOpenSelect();
    });
    window.addEventListener('resize', closeOpenSelect);
    window.addEventListener('scroll', closeOpenSelect, true);
}
