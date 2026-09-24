const STORAGE_KEY = 'gregorios-cad-measurement-unit';

export const MEASUREMENT_UNITS = Object.freeze({
    cm: { id: 'cm', label: 'Centímetros', symbol: 'cm', cmPerUnit: 1, decimals: 1 },
    m: { id: 'm', label: 'Metros', symbol: 'm', cmPerUnit: 100, decimals: 2 },
    mm: { id: 'mm', label: 'Milímetros', symbol: 'mm', cmPerUnit: 0.1, decimals: 0 },
    in: { id: 'in', label: 'Polegadas', symbol: 'in', cmPerUnit: 2.54, decimals: 2 },
    ft: { id: 'ft', label: 'Pés', symbol: 'ft', cmPerUnit: 30.48, decimals: 2 }
});

function readStoredUnit() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return MEASUREMENT_UNITS[stored] ? stored : 'cm';
    } catch {
        return 'cm';
    }
}

let activeUnitId = readStoredUnit();

export function getMeasurementUnit() {
    return MEASUREMENT_UNITS[activeUnitId];
}

export function setMeasurementUnit(unitId) {
    if (!MEASUREMENT_UNITS[unitId] || unitId === activeUnitId) return false;
    const previousUnit = getMeasurementUnit();
    activeUnitId = unitId;
    try {
        localStorage.setItem(STORAGE_KEY, unitId);
    } catch {
        // Mantém a preferência durante a sessão quando o armazenamento não está disponível.
    }
    window.dispatchEvent(new CustomEvent('measurement-unit-changed', {
        detail: { unit: getMeasurementUnit(), previousUnit }
    }));
    return true;
}

export function convertFromCm(valueCm, unitId = activeUnitId) {
    const unit = MEASUREMENT_UNITS[unitId] || MEASUREMENT_UNITS.cm;
    return Number(valueCm) / unit.cmPerUnit;
}

export function convertToCm(value, unitId = activeUnitId) {
    const unit = MEASUREMENT_UNITS[unitId] || MEASUREMENT_UNITS.cm;
    return Number(value) * unit.cmPerUnit;
}

export function parseMeasurementInput(value, unitId = activeUnitId) {
    if (typeof value !== 'string' && typeof value !== 'number') return NaN;
    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
    if (!normalized) return NaN;
    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) ? convertToCm(numericValue, unitId) : NaN;
}

export function formatMeasurementInput(valueCm, unitId = activeUnitId) {
    const unit = MEASUREMENT_UNITS[unitId] || MEASUREMENT_UNITS.cm;
    const converted = convertFromCm(valueCm, unitId);
    return Number(converted.toFixed(unit.decimals)).toString();
}

export function formatLength(valueCm, options = {}) {
    const unit = MEASUREMENT_UNITS[options.unitId || activeUnitId] || MEASUREMENT_UNITS.cm;
    const converted = convertFromCm(valueCm, unit.id);
    const decimals = Number.isInteger(options.decimals) ? options.decimals : unit.decimals;
    const formatted = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: options.fixed ? decimals : 0,
        maximumFractionDigits: decimals
    }).format(converted);
    return `${formatted} ${unit.symbol}`;
}

export function getMeasurementUnitSymbol() {
    return getMeasurementUnit().symbol;
}

export function onMeasurementUnitChange(listener) {
    const handler = event => listener(event.detail.unit, event.detail.previousUnit);
    window.addEventListener('measurement-unit-changed', handler);
    return () => window.removeEventListener('measurement-unit-changed', handler);
}
