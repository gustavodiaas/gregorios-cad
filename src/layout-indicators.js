import { getAllFloors, subscribeToFloorChanges } from './state.js';
import { calculateConnectionDistance } from './connections.js';
import { pixelsPerCm } from './config.js';
import { getMeasurementUnit } from './measurement-units.js';
import { getPlannerData } from './product-planner.js';

const EPSILON = 0.001;

function polygonArea(vertices = []) {
    if (!Array.isArray(vertices) || vertices.length < 3) return 0;
    let sum = 0;
    for (let index = 0; index < vertices.length; index += 1) {
        const current = vertices[index];
        const next = vertices[(index + 1) % vertices.length];
        sum += (Number(current?.[0]) || 0) * (Number(next?.[1]) || 0)
            - (Number(next?.[0]) || 0) * (Number(current?.[1]) || 0);
    }
    return Math.abs(sum) / 2;
}

function entityArea(entity) {
    if (Array.isArray(entity?.rings) && entity.rings.length) {
        const [outer, ...holes] = entity.rings;
        return Math.max(0, polygonArea(outer) - holes.reduce((total, ring) => total + polygonArea(ring), 0));
    }
    if (Array.isArray(entity?.vertices) && entity.vertices.length >= 3) return polygonArea(entity.vertices);
    return Math.max(0, Number(entity?.width) || 0) * Math.max(0, Number(entity?.height) || 0);
}

function connectionPath(connection) {
    if (Array.isArray(connection?.path) && connection.path.length > 1) return connection.path;
    if (Array.isArray(connection?.points) && connection.points.length > 1) return connection.points;
    return [];
}

function pointNear(point, target) {
    return Math.abs(point.x - target.x) < EPSILON && Math.abs(point.y - target.y) < EPSILON;
}

function segmentIntersection(a, b, c, d) {
    const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denominator) < EPSILON) return null;
    const crossA = a.x * b.y - a.y * b.x;
    const crossB = c.x * d.y - c.y * d.x;
    const x = (crossA * (c.x - d.x) - (a.x - b.x) * crossB) / denominator;
    const y = (crossA * (c.y - d.y) - (a.y - b.y) * crossB) / denominator;
    const within = (value, first, second) => value >= Math.min(first, second) - EPSILON
        && value <= Math.max(first, second) + EPSILON;
    if (!within(x, a.x, b.x) || !within(y, a.y, b.y)
        || !within(x, c.x, d.x) || !within(y, c.y, d.y)) return null;
    const point = { x, y };
    if ([a, b, c, d].some(endpoint => pointNear(point, endpoint))) return null;
    return point;
}

function countCrossings(connections) {
    const crossings = new Set();
    for (let first = 0; first < connections.length; first += 1) {
        const firstPath = connectionPath(connections[first]);
        for (let second = first + 1; second < connections.length; second += 1) {
            const secondPath = connectionPath(connections[second]);
            for (let a = 1; a < firstPath.length; a += 1) {
                for (let b = 1; b < secondPath.length; b += 1) {
                    const point = segmentIntersection(firstPath[a - 1], firstPath[a], secondPath[b - 1], secondPath[b]);
                    if (point) crossings.add(`${Math.round(point.x * 10)}:${Math.round(point.y * 10)}`);
                }
            }
        }
    }
    return crossings.size;
}

function formatNumber(value, decimals = 1) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: decimals }).format(Number(value) || 0);
}

function formatArea(areaPx) {
    const unit = getMeasurementUnit();
    const areaCm = areaPx / (pixelsPerCm * pixelsPerCm);
    const converted = areaCm / (unit.cmPerUnit * unit.cmPerUnit);
    return `${formatNumber(converted, Math.max(1, unit.decimals))} ${unit.symbol}²`;
}

function formatDistance(distancePx) {
    const unit = getMeasurementUnit();
    const distanceCm = distancePx / pixelsPerCm;
    return `${formatNumber(distanceCm / unit.cmPerUnit, unit.decimals)} ${unit.symbol}`;
}

function collectMetrics() {
    const floors = getAllFloors();
    let totalArea = 0;
    let occupiedArea = 0;
    let totalFlow = 0;
    let weightedProductDistance = 0;
    let crossingCount = 0;
    let equipmentCount = 0;
    let connectionCount = 0;

    floors.forEach(floor => {
        const areas = Array.isArray(floor.movementAreas) ? floor.movementAreas : [];
        const equipment = (Array.isArray(floor.resources) ? floor.resources : [])
            .filter(resource => resource?.visible !== false && resource?.type !== 'operator'
                && resource?.type !== 'stair' && !resource?.stairConfig);
        const connections = Array.isArray(floor.connections) ? floor.connections : [];
        totalArea += areas.reduce((total, area) => total + entityArea(area), 0);
        occupiedArea += equipment.reduce((total, resource) => total + entityArea(resource), 0);
        equipmentCount += equipment.length;
        connectionCount += connections.length;
        crossingCount += countCrossings(connections);
        connections.forEach(connection => {
            const distance = calculateConnectionDistance({ ...connection, path: connectionPath(connection) });
            totalFlow += distance;
            weightedProductDistance += distance * Math.max(1, Number(connection.usageCount) || 1);
        });
    });

    const occupiedPercent = totalArea > 0 ? Math.min(100, (occupiedArea / totalArea) * 100) : 0;
    const planner = getPlannerData();
    return {
        totalArea,
        occupiedArea,
        occupiedPercent,
        freePercent: Math.max(0, 100 - occupiedPercent),
        totalFlow,
        weightedProductDistance,
        crossingCount,
        equipmentCount,
        connectionCount,
        floorCount: floors.length,
        productName: String(planner?.productName || '').trim() || 'Produto / roteiro'
    };
}

function metricCard(icon, label, value, detail, tone = '') {
    return `<article class="layout-indicator-card ${tone}">
        <i class="fas ${icon}" aria-hidden="true"></i>
        <div><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>
    </article>`;
}

export function initializeLayoutIndicators() {
    const openButton = document.getElementById('openLayoutIndicatorsBtn');
    if (!openButton) return;

    const overlay = document.createElement('div');
    overlay.className = 'layout-indicators-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<section class="layout-indicators-panel" role="dialog" aria-modal="true" aria-labelledby="layoutIndicatorsTitle">
        <header>
            <div><span>Análise</span><h2 id="layoutIndicatorsTitle">Indicadores do layout</h2></div>
            <button type="button" data-indicators-close aria-label="Fechar"><i class="fas fa-xmark"></i></button>
        </header>
        <div id="layoutIndicatorsContent"></div>
        <footer><span>Os valores acompanham a unidade de medida escolhida.</span><button type="button" data-indicators-close>Concluir</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    const content = overlay.querySelector('#layoutIndicatorsContent');

    const render = () => {
        const metrics = collectMetrics();
        content.innerHTML = `<div class="layout-indicators-summary">
            <div><strong>${metrics.floorCount}</strong><span>${metrics.floorCount === 1 ? 'pavimento' : 'pavimentos'}</span></div>
            <div><strong>${metrics.equipmentCount}</strong><span>equipamentos</span></div>
            <div><strong>${metrics.connectionCount}</strong><span>fluxos</span></div>
        </div>
        <div class="layout-indicators-grid">
            ${metricCard('fa-vector-square', 'Área total', formatArea(metrics.totalArea), 'Soma das áreas do projeto')}
            ${metricCard('fa-industry', 'Área ocupada', formatArea(metrics.occupiedArea), `${formatNumber(metrics.occupiedPercent)}% do espaço`, 'accent')}
            ${metricCard('fa-expand', 'Área livre', `${formatNumber(metrics.freePercent)}%`, 'Disponibilidade estimada', metrics.freePercent < 20 ? 'warning' : 'positive')}
            ${metricCard('fa-route', 'Fluxo desenhado', formatDistance(metrics.totalFlow), 'Soma das linhas de fluxo')}
            ${metricCard('fa-shuffle', 'Cruzamentos', formatNumber(metrics.crossingCount, 0), 'Interseções entre trajetos', metrics.crossingCount ? 'warning' : 'positive')}
            ${metricCard('fa-person-walking-arrow-right', 'Distância por produto', formatDistance(metrics.weightedProductDistance), metrics.productName, 'accent')}
        </div>
        <div class="layout-occupancy-bar" role="img" aria-label="${formatNumber(metrics.occupiedPercent)}% da área ocupada">
            <div class="layout-occupancy-fill" style="width:${metrics.occupiedPercent}%"></div>
        </div>
        <div class="layout-occupancy-legend"><span><i class="occupied"></i> Ocupada ${formatNumber(metrics.occupiedPercent)}%</span><span><i></i> Livre ${formatNumber(metrics.freePercent)}%</span></div>`;
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
    overlay.querySelectorAll('[data-indicators-close]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    window.addEventListener('layoutChange', () => overlay.classList.contains('open') && render());
    window.addEventListener('measurement-unit-changed', () => overlay.classList.contains('open') && render());
    subscribeToFloorChanges(() => overlay.classList.contains('open') && render());
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('open')) close();
    });
}
