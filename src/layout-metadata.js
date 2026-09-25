const TITLE_CHANGE_EVENT = 'gregorios:layout-title-change';
const MAX_TITLE_LENGTH = 96;

let layoutTitle = '';

export function getLayoutTitle() {
    return layoutTitle.trim();
}

export function setLayoutTitle(value = '', { notify = true } = {}) {
    const nextTitle = String(value || '').slice(0, MAX_TITLE_LENGTH);
    layoutTitle = nextTitle;

    const input = document.getElementById('layoutTitleInput');
    if (input && input.value !== nextTitle) input.value = nextTitle;

    if (notify) {
        window.dispatchEvent(new CustomEvent(TITLE_CHANGE_EVENT, { detail: { title: nextTitle } }));
        window.dispatchEvent(new CustomEvent('layoutChange', { detail: { reason: 'layout-title' } }));
    }
    return nextTitle;
}

export function getLayoutGeometryBounds(areas = [], layoutWalls = [], layoutResources = []) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const includePoint = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    };

    areas.forEach(area => {
        if (Array.isArray(area.vertices) && area.vertices.length) {
            area.vertices.forEach(([x, y]) => includePoint(x, y));
        } else {
            includePoint(area.x, area.y);
            includePoint(area.x + area.width, area.y + area.height);
        }
    });

    layoutWalls.forEach(wall => {
        if (wall.startPoint) includePoint(wall.startPoint[0], wall.startPoint[1]);
        if (wall.endPoint) includePoint(wall.endPoint[0], wall.endPoint[1]);
    });

    layoutResources.forEach(resource => {
        if (resource.visible === false) return;
        if (Array.isArray(resource.vertices) && resource.vertices.length) {
            resource.vertices.forEach(([x, y]) => includePoint(x, y));
        } else {
            includePoint(resource.x, resource.y);
            includePoint(resource.x + resource.width, resource.y + resource.height);
        }
    });

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function drawLayoutTitle(ctx, areas, layoutWalls, layoutResources, viewScale = 1) {
    const title = getLayoutTitle();
    const bounds = getLayoutGeometryBounds(areas, layoutWalls, layoutResources);
    if (!title || !bounds || !ctx) return;

    const safeScale = Math.max(0.1, Number(viewScale) || 1);
    const fontSize = 18 / safeScale;
    const y = bounds.minY - (52 / safeScale);

    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, bounds.minX + (bounds.width / 2), y);
    ctx.restore();
}

export function initializeLayoutMetadata({ onChange } = {}) {
    const input = document.getElementById('layoutTitleInput');
    if (input) {
        input.maxLength = MAX_TITLE_LENGTH;
        input.value = layoutTitle;
        input.addEventListener('input', () => setLayoutTitle(input.value));
    }

    if (typeof onChange === 'function') {
        window.addEventListener(TITLE_CHANGE_EVENT, event => onChange(event.detail?.title || ''));
    }
}
