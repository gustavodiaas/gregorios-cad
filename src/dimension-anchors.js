import { movementAreas, resources, walls, getScale } from './state.js';
import { pixelsPerCm } from './config.js';
import { rectangleToVertices } from './areas.js';

const SNAP_RADIUS_SCREEN_PX = 18;

function sameId(left, right) {
    return String(left) === String(right);
}

function projectPointToSegment(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const rawT = lengthSquared > 0
        ? ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared
        : 0;
    const t = Math.max(0, Math.min(1, rawT));
    const projected = [start[0] + dx * t, start[1] + dy * t];
    return { point: projected, t, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]) };
}

function getResourceVertices(resource) {
    if (Array.isArray(resource?.vertices) && resource.vertices.length >= 2) return resource.vertices;
    if (!resource) return [];
    return rectangleToVertices(resource.x || 0, resource.y || 0, resource.width || 0, resource.height || 0);
}

function getAreaVertices(area) {
    if (Array.isArray(area?.vertices) && area.vertices.length >= 2) return area.vertices;
    if (!area) return [];
    return rectangleToVertices(area.x || 0, area.y || 0, area.width || 0, area.height || 0);
}

function getClosestPolygonEdge(point, vertices) {
    let closest = null;
    for (let index = 0; index < vertices.length; index += 1) {
        const projection = projectPointToSegment(point, vertices[index], vertices[(index + 1) % vertices.length]);
        if (!closest || projection.distance < closest.distance) closest = { ...projection, edgeIndex: index };
    }
    return closest;
}

function considerCandidate(current, candidate, maxDistance) {
    if (!candidate || candidate.distance > maxDistance) return current;
    if (!current || candidate.distance < current.distance - 0.001) return candidate;
    if (Math.abs(candidate.distance - current.distance) <= 0.001 && candidate.priority < current.priority) return candidate;
    return current;
}

export function findDimensionAnchor(point) {
    if (!Array.isArray(point)) return null;
    const maxDistance = SNAP_RADIUS_SCREEN_PX / Math.max(getScale(), 0.0001);
    let closest = null;

    resources.forEach(resource => {
        const vertices = getResourceVertices(resource);
        if (vertices.length < 2) return;
        const projection = getClosestPolygonEdge(point, vertices);
        closest = considerCandidate(closest, projection && {
            ...projection,
            priority: 0,
            anchor: { kind: 'resource-edge', entityId: resource.id, edgeIndex: projection.edgeIndex, t: projection.t },
            label: resource.name || 'Máquina'
        }, maxDistance);
    });

    walls.forEach(wall => {
        if (!wall?.startPoint || !wall?.endPoint) return;
        const projection = projectPointToSegment(point, wall.startPoint, wall.endPoint);
        closest = considerCandidate(closest, {
            ...projection,
            priority: 1,
            anchor: { kind: 'wall', entityId: wall.id, t: projection.t },
            label: 'Parede'
        }, maxDistance);
    });

    movementAreas.forEach(area => {
        const vertices = getAreaVertices(area);
        if (vertices.length < 2) return;
        const projection = getClosestPolygonEdge(point, vertices);
        closest = considerCandidate(closest, projection && {
            ...projection,
            priority: 2,
            anchor: { kind: 'area-edge', entityId: area.id, edgeIndex: projection.edgeIndex, t: projection.t },
            label: area.name || 'Área'
        }, maxDistance);
    });

    return closest;
}

function pointOnEdge(vertices, edgeIndex, t) {
    if (!Array.isArray(vertices) || vertices.length < 2) return null;
    const index = Number(edgeIndex);
    if (!Number.isInteger(index) || index < 0 || index >= vertices.length) return null;
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const normalizedT = Math.max(0, Math.min(1, Number(t) || 0));
    return [
        start[0] + (end[0] - start[0]) * normalizedT,
        start[1] + (end[1] - start[1]) * normalizedT
    ];
}

export function resolveDimensionAnchor(anchor) {
    if (!anchor?.kind) return null;
    if (anchor.kind === 'resource-edge') {
        const resource = resources.find(item => sameId(item.id, anchor.entityId));
        return resource ? pointOnEdge(getResourceVertices(resource), anchor.edgeIndex, anchor.t) : null;
    }
    if (anchor.kind === 'area-edge') {
        const area = movementAreas.find(item => sameId(item.id, anchor.entityId));
        return area ? pointOnEdge(getAreaVertices(area), anchor.edgeIndex, anchor.t) : null;
    }
    if (anchor.kind === 'wall') {
        const wall = walls.find(item => sameId(item.id, anchor.entityId));
        if (!wall?.startPoint || !wall?.endPoint) return null;
        return projectPointToSegment(
            [
                wall.startPoint[0] + (wall.endPoint[0] - wall.startPoint[0]) * (Number(anchor.t) || 0),
                wall.startPoint[1] + (wall.endPoint[1] - wall.startPoint[1]) * (Number(anchor.t) || 0)
            ],
            wall.startPoint,
            wall.endPoint
        ).point;
    }
    return null;
}

export function attachDimensionEndpoints(line, startPoint, endPoint) {
    if (!line || line.shapeType !== 'dimension') return line;
    const startMatch = findDimensionAnchor(startPoint);
    const endMatch = findDimensionAnchor(endPoint);
    line.startAnchor = startMatch?.anchor || null;
    line.endAnchor = endMatch?.anchor || null;
    line.startPoint = startMatch?.point ? [...startMatch.point] : [...startPoint];
    line.endPoint = endMatch?.point ? [...endMatch.point] : [...endPoint];
    line.dimensionVersion = 1;
    return line;
}

export function syncDimensionEndpoints(line) {
    if (!line || line.shapeType !== 'dimension') return line;
    const resolvedStart = resolveDimensionAnchor(line.startAnchor);
    const resolvedEnd = resolveDimensionAnchor(line.endAnchor);
    if (resolvedStart) line.startPoint = resolvedStart;
    if (resolvedEnd) line.endPoint = resolvedEnd;
    return line;
}

export function getDimensionLengthCm(line) {
    syncDimensionEndpoints(line);
    if (!line?.startPoint || !line?.endPoint) return 0;
    return Math.hypot(
        line.endPoint[0] - line.startPoint[0],
        line.endPoint[1] - line.startPoint[1]
    ) / pixelsPerCm;
}
