import { exclusionZones, getCtx, getScale, movementAreas, resources } from './state.js';
import { pixelsPerCm } from './config.js';
import { pointInPolygon, rectangleToVertices } from './areas.js';
import { getExclusionZoneVertices } from './exclusion-zones.js';
import { formatLength } from './measurement-units.js';

function sameId(left, right) {
    return String(left) === String(right);
}

export function getResourceSafetyDistanceCm(resource) {
    const value = Number(resource?.safetyClearanceCm);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getResourceVertices(resource) {
    if (Array.isArray(resource?.vertices) && resource.vertices.length >= 3) return resource.vertices;
    if (!resource) return [];
    return rectangleToVertices(resource.x || 0, resource.y || 0, resource.width || 0, resource.height || 0);
}

function signedArea(vertices) {
    return vertices.reduce((sum, point, index) => {
        const next = vertices[(index + 1) % vertices.length];
        return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2;
}

function intersectLines(first, second) {
    const denominator = first.dx * second.dy - first.dy * second.dx;
    if (Math.abs(denominator) < 1e-8) return [first.x, first.y];
    const t = ((second.x - first.x) * second.dy - (second.y - first.y) * second.dx) / denominator;
    return [first.x + first.dx * t, first.y + first.dy * t];
}

export function createSafetyPolygon(resource, clearanceCm = getResourceSafetyDistanceCm(resource)) {
    const vertices = getResourceVertices(resource);
    const distance = clearanceCm * pixelsPerCm;
    if (vertices.length < 3 || !(distance > 0)) return [];

    const clockwise = signedArea(vertices) < 0;
    const lines = vertices.map((point, index) => {
        const next = vertices[(index + 1) % vertices.length];
        const dx = next[0] - point[0];
        const dy = next[1] - point[1];
        const length = Math.hypot(dx, dy) || 1;
        const normalX = clockwise ? -dy / length : dy / length;
        const normalY = clockwise ? dx / length : -dx / length;
        return { x: point[0] + normalX * distance, y: point[1] + normalY * distance, dx, dy };
    });

    return lines.map((line, index) => intersectLines(lines[(index - 1 + lines.length) % lines.length], line));
}

function orientation(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

function polygonsOverlap(first, second) {
    if (first.length < 3 || second.length < 3) return false;
    if (first.some(point => pointInPolygon(point, second))) return true;
    if (second.some(point => pointInPolygon(point, first))) return true;
    for (let i = 0; i < first.length; i += 1) {
        const firstEnd = first[(i + 1) % first.length];
        for (let j = 0; j < second.length; j += 1) {
            if (segmentsIntersect(first[i], firstEnd, second[j], second[(j + 1) % second.length])) return true;
        }
    }
    return false;
}

export function getResourceSafetyStatus(resource) {
    const polygon = createSafetyPolygon(resource);
    if (!polygon.length) return { active: false, conflict: false, reasons: [], polygon: [] };

    const reasons = [];
    const parentArea = movementAreas.find(area => sameId(area.id, resource.parentAreaId));
    if (parentArea) {
        const areaVertices = getResourceVertices(parentArea);
        if (!polygon.every(point => pointInPolygon(point, areaVertices))) reasons.push('fora dos limites do layout');
    }

    const conflictingResources = resources.filter(other => {
        if (!other || sameId(other.id, resource.id) || other.visible === false || other._plannerHidden) return false;
        if (other.machineType === 'overhead-crane') return false;
        const otherSafety = createSafetyPolygon(other);
        return polygonsOverlap(polygon, otherSafety.length ? otherSafety : getResourceVertices(other));
    });
    if (conflictingResources.length) reasons.push(`próxima de ${conflictingResources.length} equipamento${conflictingResources.length > 1 ? 's' : ''}`);

    if (exclusionZones.some(zone => polygonsOverlap(polygon, getExclusionZoneVertices(zone)))) {
        reasons.push('invade uma zona de exclusão');
    }

    return { active: true, conflict: reasons.length > 0, reasons, polygon };
}

export function drawResourceSafetyZones(resourceList = resources, selectedIds = []) {
    const ctx = getCtx();
    if (!ctx) return;
    const scale = getScale();
    const selectedSet = new Set(selectedIds.map(String));

    resourceList.forEach(resource => {
        if (!resource || resource.visible === false || resource._plannerHidden || resource.safetyZoneVisible === false) return;
        const status = getResourceSafetyStatus(resource);
        if (!status.active) return;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(status.polygon[0][0], status.polygon[0][1]);
        status.polygon.slice(1).forEach(point => ctx.lineTo(point[0], point[1]));
        ctx.closePath();
        ctx.fillStyle = status.conflict ? 'rgba(255, 59, 48, 0.07)' : 'rgba(52, 199, 89, 0.055)';
        ctx.strokeStyle = status.conflict ? 'rgba(255, 59, 48, 0.78)' : 'rgba(40, 160, 75, 0.62)';
        ctx.lineWidth = (selectedSet.has(String(resource.id)) ? 1.6 : 1.1) / scale;
        ctx.setLineDash([7 / scale, 5 / scale]);
        ctx.fill();
        ctx.stroke();

        if (selectedSet.has(String(resource.id))) {
            const topPoint = status.polygon.reduce((best, point) => point[1] < best[1] ? point : best, status.polygon[0]);
            const label = `Segurança ${formatLength(getResourceSafetyDistanceCm(resource))}`;
            ctx.setLineDash([]);
            ctx.font = `600 ${10 / scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const width = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.fillRect(topPoint[0] - width / 2 - 4 / scale, topPoint[1] - 18 / scale, width + 8 / scale, 15 / scale);
            ctx.fillStyle = status.conflict ? '#c62828' : '#237a3b';
            ctx.fillText(label, topPoint[0], topPoint[1] - 5 / scale);
        }
        ctx.restore();
    });
}
