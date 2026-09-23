import { rectangleToVertices, pointInPolygon } from './areas.js';
import { createPolygonalResource, createPolygonalResourceOnFloor, isStairResource, calculatePolygonBounds, translateLabelAnchor } from './resources.js';
import { pixelsPerCm } from './config.js';
import {
    getCurrentStairRect,
    setCurrentStairRect,
    setIsDrawingStair,
    getFloorAboveCurrent,
    createFloor,
    getCurrentFloorId,
    getFloorById,
    getAllFloors,
    setActiveFloor,
    getActiveConnectionStairGroup,
    setActiveConnectionStairGroup,
    getIsConnectionMousePressed,
    setIsConnectionMousePressed,
    getIsDrawingConnection,
    getCurrentConnection,
    resources,
    movementAreas
} from './state.js';
import { startCreatingConnection, addConnectionPoint, completeConnectionToResource } from './connections.js';
import { drawAll } from './drawing.js';
import { generateId, ID_PREFIXES } from './utils/idGenerator.js';

const STAIR_DEFAULT_COLOR = '#FFFFFF';
const PORTAL_DEPTH_RATIO = 0.35;
const MIN_PORTAL_DEPTH = 24;
const STEP_SPACING_CM = 20;

function floorHasExistingLayout(floor) {
    if (!floor) {
        return false;
    }
    const collections = [
        floor.movementAreas,
        floor.walls,
        floor.resources,
        floor.connections,
        floor.freeLines,
        floor.openings
    ];
    return collections.some(collection => Array.isArray(collection) && collection.length > 0);
}

function allocateAreaId() {
    return generateId(ID_PREFIXES.AREA);
}

function cloneMovementAreaForFloor(area) {
    if (!area) {
        return null;
    }
    const clone = JSON.parse(JSON.stringify(area));
    clone.id = allocateAreaId();
    if (clone.navMesh) {
        clone.navMesh = null;
    }
    return clone;
}

function findFloorContainingResource(resourceId, floorsOverride = null) {
    if (!resourceId) {
        return null;
    }
    const floors = Array.isArray(floorsOverride) ? floorsOverride : getAllFloors();
    for (const floor of floors) {
        if (!floor || !Array.isArray(floor.resources)) {
            continue;
        }
        const found = floor.resources.some(candidate => candidate && String(candidate.id) === String(resourceId));
        if (found) {
            return floor;
        }
    }
    return null;
}

function cloneOrientationData(orientation) {
    if (!orientation) {
        return null;
    }
    const clonePortal = portal => Array.isArray(portal)
        ? portal.map(vertex => (Array.isArray(vertex) ? [vertex[0], vertex[1]] : vertex))
        : portal;
    return {
        axis: orientation.axis,
        angle: orientation.angle,
        major: orientation.major,
        minor: orientation.minor,
        center: orientation.center ? { x: orientation.center.x, y: orientation.center.y } : null,
        direction: orientation.direction ? { x: orientation.direction.x, y: orientation.direction.y } : null,
        entryPoint: orientation.entryPoint ? { x: orientation.entryPoint.x, y: orientation.entryPoint.y } : null,
        exitPoint: orientation.exitPoint ? { x: orientation.exitPoint.x, y: orientation.exitPoint.y } : null,
        entryPortal: clonePortal(orientation.entryPortal),
        exitPortal: clonePortal(orientation.exitPortal),
        stepSpacing: orientation.stepSpacing,
        portalDepth: orientation.portalDepth
    };
}

export function resetStairDrawingState() {
    const rect = getCurrentStairRect();
    rect.x = 0;
    rect.y = 0;
    rect.width = 0;
    rect.height = 0;
    rect.parentAreaId = null;
    setCurrentStairRect(rect);
    setIsDrawingStair(false);
}

function normalizeRect(rect) {
    if (!rect) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    let { x, y, width, height } = rect;
    if (width < 0) {
        x += width;
        width = Math.abs(width);
    }
    if (height < 0) {
        y += height;
        height = Math.abs(height);
    }
    return { x, y, width, height };
}

function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y) || 1;
    return {
        x: vector.x / length,
        y: vector.y / length
    };
}

function buildPortalPolygon(edgeStart, edgeEnd, direction, depth) {
    if (!edgeStart || !edgeEnd) {
        return null;
    }
    const unit = normalizeVector(direction);
    const offset = {
        x: unit.x * depth,
        y: unit.y * depth
    };

    return [
        [edgeStart[0], edgeStart[1]],
        [edgeEnd[0], edgeEnd[1]],
        [edgeEnd[0] + offset.x, edgeEnd[1] + offset.y],
        [edgeStart[0] + offset.x, edgeStart[1] + offset.y]
    ];
}

function computeEntryExitEdges(bounds, axis, direction) {
    if (axis === 'horizontal') {
        const entryX = direction.x >= 0 ? bounds.minX : bounds.maxX;
        const exitX = direction.x >= 0 ? bounds.maxX : bounds.minX;
        return {
            entry: [
                [entryX, bounds.minY],
                [entryX, bounds.maxY]
            ],
            exit: [
                [exitX, bounds.minY],
                [exitX, bounds.maxY]
            ]
        };
    }

    const entryY = direction.y >= 0 ? bounds.minY : bounds.maxY;
    const exitY = direction.y >= 0 ? bounds.maxY : bounds.minY;
    return {
        entry: [
            [bounds.minX, entryY],
            [bounds.maxX, entryY]
        ],
        exit: [
            [bounds.minX, exitY],
            [bounds.maxX, exitY]
        ]
    };
}

function computeStairOrientation(vertices, { directionMultiplier = 1 } = {}) {
    const bounds = calculatePolygonBounds(vertices);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    const axis = width >= height ? 'horizontal' : 'vertical';
    let direction = axis === 'horizontal' ? { x: 1, y: 0 } : { x: 0, y: 1 };
    direction = normalizeVector({
        x: direction.x * Math.sign(directionMultiplier || 1),
        y: direction.y * Math.sign(directionMultiplier || 1)
    });

    const angle = Math.atan2(direction.y, direction.x);
    const major = axis === 'horizontal' ? width : height;
    const minor = axis === 'horizontal' ? height : width;
    const center = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2
    };

    const margin = Math.min(major * 0.18, 32);
    const entryPoint = {
        x: center.x - direction.x * (major / 2 - margin),
        y: center.y - direction.y * (major / 2 - margin)
    };
    const exitPoint = {
        x: center.x + direction.x * (major / 2 - margin),
        y: center.y + direction.y * (major / 2 - margin)
    };

    const edges = computeEntryExitEdges(bounds, axis, direction);
    const portalDepth = Math.max(MIN_PORTAL_DEPTH, minor * PORTAL_DEPTH_RATIO);
    const exitPortal = buildPortalPolygon(edges.exit[0], edges.exit[1], direction, portalDepth);
    const entryPortal = buildPortalPolygon(edges.entry[0], edges.entry[1], { x: -direction.x, y: -direction.y }, portalDepth);

    const stepSpacing = STEP_SPACING_CM * pixelsPerCm;

    return {
        axis,
        angle,
        major,
        minor,
        center,
        direction,
        entryPoint,
        exitPoint,
        entryPortal,
        exitPortal,
        stepSpacing,
        portalDepth
    };
}

function invertOrientation(orientation) {
    if (!orientation) {
        return null;
    }
    const invertedDirection = {
        x: -orientation.direction.x,
        y: -orientation.direction.y
    };

    return {
        ...orientation,
        direction: invertedDirection,
        angle: Math.atan2(invertedDirection.y, invertedDirection.x),
        entryPoint: { ...orientation.exitPoint },
        exitPoint: { ...orientation.entryPoint },
        entryPortal: orientation.exitPortal ? orientation.exitPortal.map(([x, y]) => [x, y]) : null,
        exitPortal: orientation.entryPortal ? orientation.entryPortal.map(([x, y]) => [x, y]) : null
    };
}

function generateStairGroupId() {
    return generateId(ID_PREFIXES.GROUP);
}

function findAreaContainingPointOnFloor(floor, point) {
    if (!floor || !Array.isArray(floor.movementAreas)) {
        return null;
    }
    for (const area of floor.movementAreas) {
        const areaVertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
        if (pointInPolygon([point.x, point.y], areaVertices)) {
            return area;
        }
    }
    return null;
}

export function getStairLinkedResource(stairResource) {
    if (!stairResource || !stairResource.stairConfig) {
        return null;
    }

    const stairConfig = stairResource.stairConfig;

    const resolveById = resourceId => {
        if (!resourceId) {
            return null;
        }
        if (String(resourceId) === String(stairResource.id)) {
            return stairResource;
        }
        const local = resources.find(res => res && String(res.id) === String(resourceId));
        if (local) {
            return local;
        }
        const floor = findFloorContainingResource(resourceId);
        if (floor && Array.isArray(floor.resources)) {
            return floor.resources.find(item => item && String(item.id) === String(resourceId)) || null;
        }
        return null;
    };

    const directMatch = resolveById(stairConfig.linkedResourceId);
    if (directMatch) {
        return directMatch;
    }

    const candidateFloorIds = [stairConfig.targetFloorId, stairConfig.originFloorId].filter(Boolean);
    for (const floorId of candidateFloorIds) {
        const floor = getFloorById(floorId);
        if (!floor || !Array.isArray(floor.resources)) {
            continue;
        }
        const match = floor.resources.find(res => res && String(res.id) === String(stairConfig.linkedResourceId));
        if (match) {
            return match;
        }
    }

    if (!stairConfig.groupId) {
        return null;
    }

    const floors = getAllFloors();
    const currentFloor = findFloorContainingResource(stairResource.id, floors) || null;

    for (const floor of floors) {
        if (!floor || !Array.isArray(floor.resources)) {
            continue;
        }
        for (const candidate of floor.resources) {
            if (!candidate || String(candidate.id) === String(stairResource.id)) {
                continue;
            }
            const candidateConfig = candidate.stairConfig;
            if (!candidateConfig || candidateConfig.groupId !== stairConfig.groupId) {
                continue;
            }

            stairConfig.linkedResourceId = candidate.id;
            if (!candidateConfig.linkedResourceId) {
                candidateConfig.linkedResourceId = stairResource.id;
            }

            if (currentFloor && !stairConfig.originFloorId) {
                stairConfig.originFloorId = currentFloor.id;
            }
            if (!stairConfig.targetFloorId) {
                stairConfig.targetFloorId = floor.id;
            }
            if (!candidateConfig.originFloorId) {
                candidateConfig.originFloorId = floor.id;
            }
            if (currentFloor && !candidateConfig.targetFloorId) {
                candidateConfig.targetFloorId = currentFloor.id;
            }
            if (!candidateConfig.groupId) {
                candidateConfig.groupId = stairConfig.groupId;
            }

            return candidate;
        }
    }

    return null;
}

function ensureStairOrientation(stairResource) {
    if (!stairResource || !stairResource.stairConfig) {
        return null;
    }

    const stairConfig = stairResource.stairConfig;
    if (stairConfig.orientation && stairConfig.orientation.entryPortal && stairConfig.orientation.exitPortal) {
        return stairConfig.orientation;
    }

    const linked = getStairLinkedResource(stairResource);
    const linkedOrientation = linked?.stairConfig?.orientation;
    if (linkedOrientation && linkedOrientation.entryPortal && linkedOrientation.exitPortal) {
        const derived = stairConfig.role === 'upper'
            ? invertOrientation(linkedOrientation)
            : linkedOrientation;
        stairConfig.orientation = cloneOrientationData(derived);
        return stairConfig.orientation;
    }

    if (Array.isArray(stairResource.vertices) && stairResource.vertices.length >= 3) {
        const directionMultiplier = stairConfig.role === 'upper' ? -1 : 1;
        const computed = computeStairOrientation(stairResource.vertices, { directionMultiplier });
        stairConfig.orientation = cloneOrientationData(computed);
        if (linked) {
            linked.stairConfig = linked.stairConfig || {};
            const shouldAssign = !linked.stairConfig.orientation || !linked.stairConfig.orientation.entryPortal || !linked.stairConfig.orientation.exitPortal;
            if (shouldAssign) {
                linked.stairConfig.orientation = cloneOrientationData(invertOrientation(stairConfig.orientation));
            }
        }
        return stairConfig.orientation;
    }

    return null;
}

export function getStairPortalAnchor(resource, type = 'exit') {
    ensureStairOrientation(resource);
    const orientation = resource?.stairConfig?.orientation;
    if (!orientation) {
        return null;
    }
    if (type === 'entry') {
        return { x: orientation.entryPoint.x, y: orientation.entryPoint.y };
    }
    return { x: orientation.exitPoint.x, y: orientation.exitPoint.y };
}

function translateVerticesSet(vertices, deltaX, deltaY) {
    if (!Array.isArray(vertices) || (!deltaX && !deltaY)) {
        return vertices;
    }
    return vertices.map(vertex => {
        if (!Array.isArray(vertex) || vertex.length < 2) {
            return vertex;
        }
        return [vertex[0] + deltaX, vertex[1] + deltaY];
    });
}

function translateStairOrientation(orientation, deltaX, deltaY) {
    if (!orientation || (!deltaX && !deltaY)) {
        return;
    }

    if (orientation.center) {
        orientation.center.x += deltaX;
        orientation.center.y += deltaY;
    }
    if (orientation.entryPoint) {
        orientation.entryPoint.x += deltaX;
        orientation.entryPoint.y += deltaY;
    }
    if (orientation.exitPoint) {
        orientation.exitPoint.x += deltaX;
        orientation.exitPoint.y += deltaY;
    }
    if (Array.isArray(orientation.entryPortal)) {
        orientation.entryPortal = translateVerticesSet(orientation.entryPortal, deltaX, deltaY);
    }
    if (Array.isArray(orientation.exitPortal)) {
        orientation.exitPortal = translateVerticesSet(orientation.exitPortal, deltaX, deltaY);
    }
}

function applyGeometryTranslation(resource, deltaX, deltaY) {
    if (!resource || (!deltaX && !deltaY)) {
        return;
    }

    if (Array.isArray(resource.vertices)) {
        resource.vertices = translateVerticesSet(resource.vertices, deltaX, deltaY);
    }

    if (resource.boundingBox) {
        resource.boundingBox.x += deltaX;
        resource.boundingBox.y += deltaY;
    }

    if (typeof resource.x === 'number') {
        resource.x += deltaX;
    }
    if (typeof resource.y === 'number') {
        resource.y += deltaY;
    }

    if (typeof resource.labelAnchor !== 'undefined') {
        translateLabelAnchor(resource, deltaX, deltaY);
    }
}

function ensureBoundingBox(resource) {
    if (!resource || !Array.isArray(resource.vertices)) {
        return;
    }
    if (!resource.boundingBox) {
        const bounds = calculatePolygonBounds(resource.vertices);
        resource.boundingBox = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
        };
    }
}

export function applyStairTranslation(stairResource, deltaX, deltaY, { skipGeometry = false, updateLinked = true } = {}) {
    if (!stairResource || !isStairResource(stairResource) || (!deltaX && !deltaY)) {
        return;
    }

    if (!skipGeometry) {
        applyGeometryTranslation(stairResource, deltaX, deltaY);
        ensureBoundingBox(stairResource);
    }

    if (stairResource.stairConfig?.orientation) {
        translateStairOrientation(stairResource.stairConfig.orientation, deltaX, deltaY);
    }

    if (!updateLinked) {
        return;
    }

    const linked = getStairLinkedResource(stairResource);
    if (!linked || linked === stairResource) {
        return;
    }

    applyStairTranslation(linked, deltaX, deltaY, { skipGeometry: false, updateLinked: false });

    if (typeof window !== 'undefined' && window.updateConnectionPathsForResource) {
        try {
            window.updateConnectionPathsForResource(linked.id);
        } catch (error) {
            console.warn('⚠️ Erro ao atualizar conexões vinculadas à escada:', error);
        }
    }
}

function pointInsidePortal(point, portal) {
    if (!Array.isArray(portal) || portal.length < 3) {
        return false;
    }
    return pointInPolygon([point.x, point.y], portal);
}

function findStairTransitionCandidate(point, previousPoint = null) {
    const currentFloorId = getCurrentFloorId();
    
    for (const resource of resources) {
        if (!isStairResource(resource)) {
            continue;
        }
        const orientation = ensureStairOrientation(resource);
        if (!orientation) {
            continue;
        }
        const role = resource.stairConfig.role;
        
        // Verificar se a escada pertence ao andar atual
        const resourceFloor = findFloorContainingResource(resource.id);
        if (!resourceFloor || resourceFloor.id !== currentFloorId) {
            continue; // Ignorar escadas de outros andares
        }
        
        // Verificar se o ponto está dentro da escada (área principal)
        const vertices = resource.vertices;
        if (!vertices || !pointInPolygon([point.x, point.y], vertices)) {
            continue;
        }

        // Calcular a distância do ponto atual ao centro da escada
        const distanceToCenter = Math.hypot(
            point.x - orientation.center.x,
            point.y - orientation.center.y
        );

        // Calcular a distância do ponto ao portal de saída
        const exitPoint = role === 'lower' ? orientation.exitPoint : orientation.exitPoint;
        const distanceToExit = Math.hypot(
            point.x - exitPoint.x,
            point.y - exitPoint.y
        );

        // Usar um threshold baseado no tamanho da escada
        const transitionThreshold = orientation.major * 0.3; // 30% do comprimento da escada

        // Determinar direção do movimento se temos o ponto anterior
        let movementDirection = null;
        let isMovingTowardExit = false;
        
        if (previousPoint) {
            const dx = point.x - previousPoint.x;
            const dy = point.y - previousPoint.y;
            const length = Math.hypot(dx, dy);
            if (length > 0.01) {
                movementDirection = { x: dx / length, y: dy / length };
                
                // Verificar se está se movendo em direção ao ponto de saída
                const directionToExit = {
                    x: exitPoint.x - point.x,
                    y: exitPoint.y - point.y
                };
                const lengthToExit = Math.hypot(directionToExit.x, directionToExit.y);
                if (lengthToExit > 0) {
                    directionToExit.x /= lengthToExit;
                    directionToExit.y /= lengthToExit;
                    
                    const dotProduct = movementDirection.x * directionToExit.x + 
                                     movementDirection.y * directionToExit.y;
                    isMovingTowardExit = dotProduct > 0.3; // Tolerância de 30%
                }
            }
        }

        if (role === 'lower') {
            // Na escada inferior (térreo): transição quando passar pela metade superior
            // ou quando estiver próximo ao exitPortal
            if (distanceToExit < transitionThreshold || 
                (orientation.exitPortal && pointInsidePortal(point, orientation.exitPortal))) {
                return { stairResource: resource, portalType: 'exit', isMovingForward: true };
            }
        } else if (role === 'upper') {
            // Na escada superior (1º andar): transição quando passar pela metade inferior
            // ou quando estiver próximo ao exitPortal
            if (distanceToExit < transitionThreshold || 
                (orientation.exitPortal && pointInsidePortal(point, orientation.exitPortal))) {
                return { stairResource: resource, portalType: 'exit', isMovingForward: true };
            }
        }
    }
    return null;
}

function resolveStairTransitionAnchors(stairResource, portalType) {
    const stairConfig = stairResource?.stairConfig;
    if (!stairConfig) {
        return null;
    }
    const linkedResource = getStairLinkedResource(stairResource);
    if (!linkedResource || !linkedResource.stairConfig) {
        return null;
    }

    const currentOrientation = ensureStairOrientation(stairResource);
    const linkedOrientation = ensureStairOrientation(linkedResource);
    
    if (!currentOrientation || !linkedOrientation) {
        return null;
    }

    const currentExit = getStairPortalAnchor(stairResource, 'exit');
    const currentEntry = getStairPortalAnchor(stairResource, 'entry');
    const linkedEntry = getStairPortalAnchor(linkedResource, 'entry');
    const linkedExit = getStairPortalAnchor(linkedResource, 'exit');

    if (stairConfig.role === 'lower') {
        // Na escada inferior (térreo):
        // - O usuário entra pela base (entry) e sai pelo topo (exit)
        // - O âncora de saída no térreo se conecta ao âncora de entrada no andar superior
        return {
            currentRole: 'lower',
            nextRole: 'upper',
            currentAnchor: currentExit || currentEntry,
            targetAnchor: linkedEntry || linkedExit,
            targetResource: linkedResource,
            targetFloorId: stairConfig.targetFloorId
        };
    }

    if (stairConfig.role === 'upper') {
        // Na escada superior (1º andar):
        // - O usuário entra pelo topo (entry) e sai pela base (exit)
        // - O âncora de saída no andar superior se conecta ao âncora de entrada no térreo
        return {
            currentRole: 'upper',
            nextRole: 'lower',
            currentAnchor: currentExit || currentEntry,
            targetAnchor: linkedEntry || linkedExit,
            targetResource: linkedResource,
            targetFloorId: stairConfig.targetFloorId || stairConfig.originFloorId
        };
    }

    return null;
}

export function createStairFromRect(rect) {
    if (!rect) {
        return null;
    }

    const normalized = normalizeRect(rect);
    if (normalized.width === 0 || normalized.height === 0) {
        return null;
    }

    const lowerFloorId = getCurrentFloorId();
    if (!lowerFloorId) {
        return null;
    }

    const parentAreaId = rect.parentAreaId || null;
    const sourceArea = parentAreaId
        ? movementAreas.find(area => area && String(area.id) === String(parentAreaId))
        : null;

    let targetFloor = getFloorAboveCurrent();
    const targetHadLayout = floorHasExistingLayout(targetFloor);
    if (!targetFloor) {
        targetFloor = createFloor();
    }

    if (!targetHadLayout && sourceArea) {
        // Copia a área base para o pavimento superior vazio, garantindo continuidade de navegação
        if (!Array.isArray(targetFloor.movementAreas)) {
            targetFloor.movementAreas = [];
        }
        const clonedArea = cloneMovementAreaForFloor(sourceArea);
        if (clonedArea) {
            targetFloor.movementAreas.push(clonedArea);
        }
    }

    const baseVertices = rectangleToVertices(normalized.x, normalized.y, normalized.width, normalized.height);
    const lowerOrientation = computeStairOrientation(baseVertices, { directionMultiplier: 1 });
    const groupId = generateStairGroupId();
    const portalId = `stair-portal-${groupId}`;

    const baseResource = createPolygonalResource(
        baseVertices,
        STAIR_DEFAULT_COLOR,
        rect.parentAreaId || null,
        true,
        {
            type: 'stair',
            name: 'Escada - Base',
            stairConfig: {
                groupId,
                role: 'lower',
                originFloorId: lowerFloorId,
                targetFloorId: targetFloor.id,
                portalId,
                orientation: lowerOrientation
            },
            allowConnectionsThrough: true,
            isConnectionPassThrough: true
        }
    );

    const landingOrientation = invertOrientation(lowerOrientation);
    const landingCenter = {
        x: landingOrientation.center.x,
        y: landingOrientation.center.y
    };
    const landingArea = findAreaContainingPointOnFloor(targetFloor, landingCenter);

    const landingResource = createPolygonalResourceOnFloor(
        baseVertices,
        STAIR_DEFAULT_COLOR,
        landingArea?.id || null,
        targetFloor.id,
        true,
        {
            type: 'stair',
            name: 'Escada - Topo',
            stairConfig: {
                groupId,
                role: 'upper',
                originFloorId: targetFloor.id,
                targetFloorId: lowerFloorId,
                portalId,
                orientation: landingOrientation,
                linkedResourceId: baseResource.id
            },
            allowConnectionsThrough: true,
            isConnectionPassThrough: true
        }
    );

    if (baseResource && landingResource) {
        baseResource.stairConfig.linkedResourceId = landingResource.id;
    }

    // Regenerar NavMesh para as áreas que contêm as escadas
    // para garantir que os nós de navegação sejam criados no centro da escada
    if (typeof window !== 'undefined' && window.bakeNavigationMesh) {
        try {
            const lowerFloor = getFloorById(lowerFloorId);
            if (lowerFloor && Array.isArray(lowerFloor.movementAreas)) {
                const lowerArea = lowerFloor.movementAreas.find(area => 
                    area && String(area.id) === String(rect.parentAreaId)
                );
                if (lowerArea) {
                    window.bakeNavigationMesh(lowerArea);
                }
            }
            
            if (targetFloor && Array.isArray(targetFloor.movementAreas)) {
                const upperArea = targetFloor.movementAreas.find(area => {
                    if (!area || !area.vertices) return false;
                    const landingCenter = {
                        x: landingOrientation.center.x,
                        y: landingOrientation.center.y
                    };
                    return pointInPolygon([landingCenter.x, landingCenter.y], area.vertices);
                });
                if (upperArea) {
                    window.bakeNavigationMesh(upperArea);
                }
            }
        } catch (error) {
            console.warn('⚠️ Erro ao regenerar NavMesh após criar escada:', error);
        }
    }

    return {
        lower: baseResource,
        upper: landingResource,
        targetFloorId: targetFloor.id,
        groupId
    };
}

export function transitionConnectionThroughStair(point) {
    if (!point || !getIsDrawingConnection()) {
        return false;
    }

    const previousConnection = getCurrentConnection();
    if (!previousConnection) {
        return false;
    }

    // Obter o último ponto do caminho para calcular a direção do movimento
    let previousPoint = null;
    if (previousConnection.path && previousConnection.path.length > 0) {
        previousPoint = previousConnection.path[previousConnection.path.length - 1];
    }

    const wasMousePressed = getIsConnectionMousePressed();

    const candidate = findStairTransitionCandidate(point, previousPoint);
    if (!candidate) {
        if (getActiveConnectionStairGroup()) {
            setActiveConnectionStairGroup(null);
        }
        return false;
    }

    const { stairResource, portalType } = candidate;
    const stairConfig = stairResource.stairConfig;
    if (!stairConfig) {
        return false;
    }

    // Evitar transições duplicadas na mesma escada
    if (getActiveConnectionStairGroup() && getActiveConnectionStairGroup() === stairConfig.groupId) {
        return false;
    }

    // Só permitir transição se estiver no portal de saída (exit)
    if (portalType !== 'exit') {
        return false;
    }

    const anchors = resolveStairTransitionAnchors(stairResource, portalType);
    if (!anchors || !anchors.currentAnchor || !anchors.targetAnchor || !anchors.targetResource) {
        return false;
    }

    if (!previousConnection.startHubId) {
        return false;
    }

    const previousConnectionId = previousConnection.id;
    
    // Adicionar ponto da escada ao caminho atual ANTES de completar
    // Isso garante que a conexão passe pelo meio da escada
    const stairOrientation = ensureStairOrientation(stairResource);
    if (stairOrientation && stairOrientation.center) {
        // Adicionar o centro da escada ao caminho para garantir que passe pelo meio
        if (!previousConnection.path) {
            previousConnection.path = [];
        }
        previousConnection.path.push({ x: stairOrientation.center.x, y: stairOrientation.center.y });
    }
    
    previousConnection.stairTransition = {
        groupId: stairConfig.groupId,
        role: anchors.currentRole,
        linkedResourceId: anchors.targetResource.id,
        portalEntry: anchors.currentAnchor,
        portalExit: anchors.targetAnchor
    };

    setActiveConnectionStairGroup(stairConfig.groupId);
    completeConnectionToResource(stairResource, anchors.currentAnchor);

    // Forçar regeneração do NavMesh da área que contém a escada
    // para garantir que os nós de navegação estejam atualizados
    if (typeof window !== 'undefined' && window.bakeNavigationMesh) {
        try {
            const stairFloor = findFloorContainingResource(stairResource.id);
            if (stairFloor && Array.isArray(stairFloor.movementAreas)) {
                const stairArea = stairFloor.movementAreas.find(area => 
                    area && String(area.id) === String(stairResource.parentAreaId)
                );
                if (stairArea) {
                    window.bakeNavigationMesh(stairArea);
                }
            }
        } catch (error) {
            console.warn('⚠️ Erro ao regenerar NavMesh antes da transição:', error);
        }
    }

    // Mudar para o andar de destino
    const didActivateFloor = anchors.targetFloorId ? setActiveFloor(anchors.targetFloorId) : false;
    const targetPoint = { x: anchors.targetAnchor.x, y: anchors.targetAnchor.y };
    drawAll();

    // Criar nova conexão no andar de destino
    const newConnection = startCreatingConnection(targetPoint.x, targetPoint.y);
    if (!newConnection) {
        setActiveConnectionStairGroup(null);
        return true;
    }

    newConnection.stairTransition = {
        groupId: stairConfig.groupId,
        role: anchors.nextRole,
        previousConnectionId,
        portalEntry: { x: targetPoint.x, y: targetPoint.y },
        linkedResourceId: anchors.targetResource.id
    };

    previousConnection.stairTransition.nextConnectionId = newConnection.id;
    newConnection.stairTransition.previousConnectionId = previousConnectionId;

    setIsConnectionMousePressed(wasMousePressed);
    
    // Adicionar o ponto de continuação no novo andar
    addConnectionPoint(targetPoint.x, targetPoint.y);

    return true;
}

if (typeof window !== 'undefined') {
    window.applyStairTranslation = applyStairTranslation;
}
