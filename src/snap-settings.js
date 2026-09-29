import { convertFromCm, convertToCm, getMeasurementUnit } from './measurement-units.js';

const STORAGE_KEY = 'gregorios-cad-snap-settings';
const DEFAULTS = Object.freeze({
    enabled: true,
    snapPx: 8,
    objects: true,
    walls: true,
    area: true,
    clearanceEnabled: false,
    clearanceCm: 60
});

let altPressed = false;
let settings = loadSettings();

function loadSettings() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return { ...DEFAULTS, ...stored };
    } catch {
        return { ...DEFAULTS };
    }
}

function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // A preferência continua válida durante a sessão.
    }
    window.dispatchEvent(new CustomEvent('snap-settings-changed', { detail: getSnapSettings() }));
}

export function getSnapSettings() {
    return { ...settings };
}

export function isResourceSnapEnabled() {
    return settings.enabled && !altPressed;
}

export function initializeSnapSettings() {
    const control = document.getElementById('smartSnapControl');
    const button = document.getElementById('smartSnapBtn');
    const panel = document.getElementById('smartSnapPanel');
    if (!control || !button || !panel) return;

    const enabledInput = document.getElementById('smartSnapEnabled');
    const objectInput = document.getElementById('snapToObjects');
    const wallInput = document.getElementById('snapToWalls');
    const areaInput = document.getElementById('snapToArea');
    const clearanceInput = document.getElementById('snapClearanceEnabled');
    const clearanceValue = document.getElementById('snapClearanceValue');
    const clearanceUnit = document.getElementById('snapClearanceUnit');

    const render = () => {
        enabledInput.checked = settings.enabled;
        objectInput.checked = settings.objects;
        wallInput.checked = settings.walls;
        areaInput.checked = settings.area;
        clearanceInput.checked = settings.clearanceEnabled;
        clearanceValue.disabled = !settings.clearanceEnabled;
        clearanceValue.value = Number(convertFromCm(settings.clearanceCm).toFixed(getMeasurementUnit().decimals));
        clearanceUnit.textContent = getMeasurementUnit().symbol;
        button.classList.toggle('active', settings.enabled);
        button.setAttribute('aria-pressed', String(settings.enabled));
        button.querySelector('span').textContent = settings.enabled ? 'Encaixe inteligente' : 'Encaixe desligado';
    };

    button.addEventListener('click', event => {
        event.stopPropagation();
        const opening = panel.hidden;
        panel.hidden = !opening;
        button.setAttribute('aria-expanded', String(opening));
    });

    document.addEventListener('click', event => {
        if (!control.contains(event.target)) {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        }
    });

    const bindToggle = (input, key) => input.addEventListener('change', () => {
        settings[key] = input.checked;
        saveSettings();
        render();
    });

    bindToggle(enabledInput, 'enabled');
    bindToggle(objectInput, 'objects');
    bindToggle(wallInput, 'walls');
    bindToggle(areaInput, 'area');
    bindToggle(clearanceInput, 'clearanceEnabled');

    clearanceValue.addEventListener('change', () => {
        const valueCm = convertToCm(Number(String(clearanceValue.value).replace(',', '.')));
        if (Number.isFinite(valueCm) && valueCm >= 0) {
            settings.clearanceCm = valueCm;
            saveSettings();
        }
        render();
    });

    window.addEventListener('measurement-unit-changed', render);
    window.addEventListener('keydown', event => {
        if (event.key === 'Alt') altPressed = true;
    });
    window.addEventListener('keyup', event => {
        if (event.key === 'Alt') altPressed = false;
    });
    window.addEventListener('blur', () => { altPressed = false; });
    render();
}
