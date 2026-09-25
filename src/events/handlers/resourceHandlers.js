/**
 * Handlers para eventos de mouse relacionados a recursos
 */
import { 
    resources, movementAreas, getCanvas,
    setSelectedAreaId, setSelectedWallId, setSelectedConnectionId,
    setSelectedFreeLineId, setSelectedExclusionZoneId, setIsDragging, setOffsetX, setOffsetY, setDragStartX, setDragStartY,
    getSelectedResourceId, setSelectedResourceId, getSelectedResourceIds,
    setHoveredAreaVirtualDimensions, setIsAreaHoverActive, getIsAreaHoverActive,
    getIsEditingPolygon, setIsEditingPolygon, setEditingAreaId,
    getIsEditingResourcePolygon, setIsEditingResourcePolygon,
    getEditingResourceId, setEditingResourceId,
    setDraggingMidpointIndex, setHoveredMidpointIndex, setOriginalVerticesOnDrag,
    getIsCtrlPressed, isResourceSelected, getActiveResourceDragState, setActiveResourceDragState,
    setActiveGuideLines, getCurrentResourceRect, setCurrentResourceRect, setIsDrawingResource,
    // PPT handles para recursos
    getActiveResourceResizeHandle, setActiveResourceResizeHandle,
    getIsRotatingResource, setIsRotatingResource,
    getResourceRotationStartAngle, setResourceRotationStartAngle,
    getResourceRotationCenter, setResourceRotationCenter,
    getResourceVerticesBeforeRotation, setResourceVerticesBeforeRotation,
    getCurrentResourceRotationAngle, setCurrentResourceRotationAngle,
    getHoveredResourceResizeHandle, setHoveredResourceResizeHandle,
    getOriginalResourceVerticesOnDrag, setOriginalResourceVerticesOnDrag,
    getOriginalHubPositionsBeforeRotation, setOriginalHubPositionsBeforeRotation
} from '../../state.js';
import { setSelectedOpeningId } from '../../openings.js';
import { saveStateToHistory } from '../../history.js';
import { drawAll } from '../../drawing.js';
import { 
    migrateResourceToPolygonal, toggleResourceSelection, addResourceToSelection,
    setResourceSelection, calculatePolygonBounds, createResource, stopResourcePolygonEditing,
    updateResourceCompatibilityProperties
} from '../../resources.js';
import { pointInPolygon, rectangleToVertices } from '../../areas.js';
import { canMoveResourceTo } from '../../merge_resources/resource_operations.js';
import { 
    getResourceMidpointAtPos, getResourceMidpointCursor, updateResourceMidpointDrag,
    getResourceHandleAtPos, getResourceHandleCursor,
    updateResourceCornerDrag, updateResourceEdgeDrag, updateResourceRotation,
    calculateResourcePPTHandles
} from '../../resource-polygon.js';
import { generateResourceAlignmentGuides, applyResourceSnapToGuides } from '../resourceutils.js';
import { startResourceDrag, endResourceDrag } from '../../resource-dimensions.js';
import { updateConnectionPathsForResource } from '../../connections.js';
import { isStairResource, translateLabelAnchor, applyLabelTransformAfterRotation, updateResourceCompatibilityProperties as updateResCompat } from '../../resources.js';
import { getStairLinkedResource } from '../../stairs.js';
import { getHubsForResource } from '../../hubs.js';
import { getAreaAtPos } from '../mouseUtils.js';
import { calculatePolygonCentroid } from '../../navigation.js';
import { findClosestEdgePoint, getPolygonCentroid as getHPCentroid } from '../../hub-placement-helper.js';
import { updateNavMeshWithObstacles } from '../../navMeshBaker.js';

// Throttle para atualização de NavMesh durante arraste (evita overhead em cada mousemove)
let _lastNavMeshUpdateTime = 0;
const NAVMESH_DRAG_UPDATE_INTERVAL_MS = 100; // ~10 FPS para navmesh

/**
 * Clona o bounding box de um recurso
 */
export function cloneResourceBoundingBox(resource) {
    if (!resource) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    if (resource.boundingBox) {
        const { x = resource.x || 0, y = resource.y || 0, width = resource.width || 0, height = resource.height || 0 } = resource.boundingBox;
        return { x, y, width, height };
    }

    if (resource.vertices && resource.vertices.length > 0) {
        const bounds = calculatePolygonBounds(resource.vertices);
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }

    return {
        x: resource.x || 0,
        y: resource.y || 0,
        width: resource.width || 0,
        height: resource.height || 0
    };
}

/**
 * Cria o estado de arraste para recursos
 */
export function createResourceDragState(primaryResourceId) {
    const selectionIds = getSelectedResourceIds();
    const initialIds = selectionIds.length > 0 ? selectionIds : [primaryResourceId];
    const uniqueIds = Array.from(new Set(initialIds.concat(primaryResourceId).filter(id => id !== null && id !== undefined)));

    const snapshots = {};
    const movableResourceIds = [];

    uniqueIds.forEach(id => {
        const resource = resources.find(r => r.id === id);
        if (!resource) return;

        const migrated = migrateResourceToPolygonal(resource);
        if (!migrated || !Array.isArray(migrated.vertices)) return;

        const vertices = migrated.vertices.map(([x, y]) => [x, y]);
        let boundingBox;

        if (resource.boundingBox) {
            const { x = resource.x || 0, y = resource.y || 0, width = resource.width || 0, height = resource.height || 0 } = resource.boundingBox;
            boundingBox = { x, y, width, height };
        } else {
            const bounds = calculatePolygonBounds(vertices);
            boundingBox = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        }

        snapshots[id] = {
            id,
            resource,
            vertices,
            boundingBox,
            lastDeltaX: 0,
            lastDeltaY: 0
        };

        if (!resource.locked) {
            movableResourceIds.push(id);
        }
    });

    return {
        primaryId: primaryResourceId,
        resourceIds: uniqueIds,
        movableResourceIds,
        snapshots
    };
}

/**
 * Manipula o clique em recurso
 */
export function handleResourceClick(clickedResource, pos) {
    const canvas = getCanvas();
    const migratedResource = migrateResourceToPolygonal(clickedResource);
    const isEditingThisResource = getIsEditingResourcePolygon() && getEditingResourceId() === migratedResource.id;
    const ctrlPressed = getIsCtrlPressed();

    if (isEditingThisResource) {
        // Verificar se clicou em um handle PPT
        const handleType = getResourceHandleAtPos(pos.x, pos.y, migratedResource);
        
        if (handleType) {
            saveStateToHistory('Editar forma do recurso');
            
            if (handleType === 'rotate') {
                // Iniciar rotação
                const handles = calculateResourcePPTHandles(migratedResource);
                if (handles) {
                    setIsRotatingResource(true);
                    setResourceRotationCenter(handles.center);
                    setResourceRotationStartAngle(Math.atan2(pos.y - handles.center.y, pos.x - handles.center.x));
                    setResourceVerticesBeforeRotation(migratedResource.vertices.map(([x, y]) => [x, y]));
                    setCurrentResourceRotationAngle(0);
                    
                    // Guardar posições originais dos hubs para rotação em tempo real
                    const resourceHubs = getHubsForResource(migratedResource.id) || [];
                    const originalHubPositions = resourceHubs.map(hub => ({
                        id: hub.id,
                        localX: hub.localX,
                        localY: hub.localY,
                        normalX: hub.normalX,
                        normalY: hub.normalY
                    }));
                    setOriginalHubPositionsBeforeRotation(originalHubPositions);
                    
                    canvas.style.cursor = 'crosshair';
                    drawAll();
                    return;
                }
            } else {
                // Iniciar resize (corner ou edge)
                setActiveResourceResizeHandle(handleType);
                setOriginalResourceVerticesOnDrag(migratedResource.vertices.map(([x, y]) => [x, y]));
                
                // Guardar posições originais dos hubs para resize em tempo real
                const resourceHubs = getHubsForResource(migratedResource.id) || [];
                const originalHubPositions = resourceHubs.map(hub => ({
                    id: hub.id,
                    localX: hub.localX,
                    localY: hub.localY,
                    normalX: hub.normalX,
                    normalY: hub.normalY
                }));
                setOriginalHubPositionsBeforeRotation(originalHubPositions);
                
                canvas.style.cursor = getResourceHandleCursor(handleType, migratedResource);
                drawAll();
                return;
            }
        }
        
        // Fallback para sistema legado de midpoints (compatibilidade)
        const midpointIndex = getResourceMidpointAtPos(pos.x, pos.y, migratedResource);
        if (midpointIndex !== -1) {
            saveStateToHistory('Editar forma do recurso');
            setDraggingMidpointIndex(midpointIndex);
            setHoveredMidpointIndex(midpointIndex);
            setOriginalVerticesOnDrag(migratedResource.vertices.map(([x, y]) => [x, y]));
            canvas.style.cursor = getResourceMidpointCursor(migratedResource, midpointIndex);
            drawAll();
            return;
        }
    } else if (getIsEditingResourcePolygon()) {
        stopResourcePolygonEditing();
    }

    const alreadySelected = isResourceSelected(clickedResource.id);
    const selectedIds = getSelectedResourceIds();

    if (ctrlPressed) {
        if (alreadySelected) {
            toggleResourceSelection(clickedResource.id);
        } else {
            addResourceToSelection(clickedResource.id, { makePrimary: selectedIds.length === 0 });
        }

        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        setSelectedFreeLineId(null);

        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (!isEditingThisResource) {
            stopResourcePolygonEditing();
        }
        setActiveResourceDragState(null);
        return;
    }

    if (!alreadySelected) {
        setResourceSelection([clickedResource.id], { primaryId: clickedResource.id });
    }

    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedFreeLineId(null);
    setSelectedExclusionZoneId(null);

    if (!clickedResource.locked) {
        const dragState = createResourceDragState(clickedResource.id);
        if (!dragState.movableResourceIds.length) {
            return; // Nada para mover (todos bloqueados)
        }

        saveStateToHistory(dragState.movableResourceIds.length > 1 ? 'Mover recursos' : 'Mover recurso');
        setIsDragging(true);
        startResourceDrag();

        const primarySnapshot = dragState.snapshots[clickedResource.id];
        const boundingBox = primarySnapshot ? primarySnapshot.boundingBox : cloneResourceBoundingBox(clickedResource);

        setOffsetX(pos.x - boundingBox.x);
        setOffsetY(pos.y - boundingBox.y);
        setDragStartX(pos.x);
        setDragStartY(pos.y);

        if (getIsAreaHoverActive()) {
            setHoveredAreaVirtualDimensions(null);
            setIsAreaHoverActive(false);
        }

        setActiveResourceDragState(dragState);
        canvas.style.cursor = 'grabbing';
    } else {
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        setSelectedFreeLineId(null);
        setSelectedExclusionZoneId(null);

        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (!isEditingThisResource) {
            stopResourcePolygonEditing();
        }
        setActiveResourceDragState(null);
    }
}

/**
 * Manipula o clique para criar recurso
 */
export function handleCreateResourceMouseDown(pos) {
    const canvas = getCanvas();
    
    // Modo criação de recurso - iniciar clique e arrasto
    // Verificar se estamos dentro de uma área de movimentação
    const parentArea = getAreaAtPos(pos);
    if (parentArea) {
        // Iniciar desenho de recurso
        const currentRect = getCurrentResourceRect();
        currentRect.x = pos.x;
        currentRect.y = pos.y;
        currentRect.width = 0;
        currentRect.height = 0;
        currentRect.parentAreaId = parentArea.id;
        setCurrentResourceRect(currentRect);
        setIsDrawingResource(true);
        canvas.style.cursor = 'crosshair';
    }
    drawAll();
}

/**
 * Manipula o movimento durante criação de recurso
 */
export function handleCreateResourceMove(pos) {
    const currentRect = getCurrentResourceRect();
    currentRect.width = pos.x - currentRect.x;
    currentRect.height = pos.y - currentRect.y;
    setCurrentResourceRect(currentRect);
    drawAll(false);
}

/**
 * Manipula o mouseup durante criação de recurso
 */
export function handleCreateResourceMouseUp(pos) {
    const canvas = getCanvas();
    
    const currentRect = getCurrentResourceRect();
    const finalX = currentRect.width < 0 ? currentRect.x + currentRect.width : currentRect.x;
    const finalY = currentRect.height < 0 ? currentRect.y + currentRect.height : currentRect.y;
    const finalWidth = Math.abs(currentRect.width);
    const finalHeight = Math.abs(currentRect.height);
    
    if (finalWidth > 0 && finalHeight > 0) {
        const parentArea = movementAreas.find(area => area.id === currentRect.parentAreaId);
        if (parentArea) {
            const areaVertices = parentArea.vertices || rectangleToVertices(parentArea.x, parentArea.y, parentArea.width, parentArea.height);
            const resourceVertices = rectangleToVertices(finalX, finalY, finalWidth, finalHeight);
            const allPointsInside = resourceVertices.every(vertex => {
                return pointInPolygon(vertex, areaVertices);
            });
            
            if (allPointsInside) {
                saveStateToHistory('Criar recurso');
                createResource(finalX, finalY, null, finalWidth, finalHeight);
            }
        }
    }
    
    setIsDrawingResource(false);
    const resetRect = getCurrentResourceRect();
    resetRect.x = 0;
    resetRect.y = 0;
    resetRect.width = 0;
    resetRect.height = 0;
    resetRect.parentAreaId = null;
    setCurrentResourceRect(resetRect);
    canvas.style.cursor = 'default';
    drawAll();
}

/**
 * Manipula o arraste de midpoint de recurso
 */
export function handleResourceMidpointDrag(pos) {
    const canvas = getCanvas();
    const editingResourceId = getEditingResourceId();
    if (!editingResourceId) {
        return;
    }

    const editingResource = resources.find(resource => resource.id === editingResourceId);
    if (!editingResource) {
        return;
    }

    updateResourceMidpointDrag(editingResource, require('../../state.js').getDraggingMidpointIndex(), pos.x, pos.y);
    canvas.style.cursor = getResourceMidpointCursor(editingResource, require('../../state.js').getDraggingMidpointIndex());
    drawAll();
}

/**
 * Manipula o arraste de recurso
 */
export function handleResourceDrag(pos, { offsetX, offsetY }) {
    const canvas = getCanvas();
    const primarySelectedId = getSelectedResourceId();
    if (!primarySelectedId) {
        return;
    }

    let dragState = getActiveResourceDragState();
    if (!dragState || dragState.primaryId !== primarySelectedId) {
        dragState = createResourceDragState(primarySelectedId);
        setActiveResourceDragState(dragState);
    }

    const primaryResource = resources.find(r => r.id === primarySelectedId);
    if (!primaryResource) {
        return;
    }

    const primarySnapshot = dragState.snapshots[primarySelectedId] || {
        boundingBox: cloneResourceBoundingBox(primaryResource),
        vertices: migrateResourceToPolygonal(primaryResource).vertices.map(([x, y]) => [x, y])
    };

    const proposedX = pos.x - offsetX;
    const proposedY = pos.y - offsetY;

    const guides = generateResourceAlignmentGuides(primaryResource, proposedX, proposedY);
    const snapResult = applyResourceSnapToGuides(primaryResource, proposedX, proposedY, guides);
    const finalX = snapResult.x;
    const finalY = snapResult.y;

    let deltaX = finalX - primarySnapshot.boundingBox.x;
    let deltaY = finalY - primarySnapshot.boundingBox.y;

    const allSelectedIds = dragState.resourceIds.length ? dragState.resourceIds : getSelectedResourceIds();
    const movableIds = dragState.movableResourceIds.length
        ? dragState.movableResourceIds
        : allSelectedIds.filter(id => {
            const resource = resources.find(r => r.id === id);
            return resource && !resource.locked;
        });

    if (!movableIds.length) {
        canvas.style.cursor = 'not-allowed';
        return;
    }

    const ignoreIds = movableIds;

    // Helper: build and validate move candidates for a given delta
    const buildAndTestCandidates = (dx, dy) => {
        const candidates = [];
        movableIds.forEach(id => {
            const resource = resources.find(r => r.id === id);
            if (!resource) return;
            const snapshot = dragState.snapshots[id];
            const baseVertices = snapshot
                ? snapshot.vertices
                : migrateResourceToPolygonal(resource).vertices.map(([x, y]) => [x, y]);
            const newVertices = baseVertices.map(([x, y]) => [x + dx, y + dy]);
            const baseBoundingBox = snapshot ? snapshot.boundingBox : cloneResourceBoundingBox(resource);
            const newBoundingBox = {
                x: baseBoundingBox.x + dx,
                y: baseBoundingBox.y + dy,
                width: baseBoundingBox.width,
                height: baseBoundingBox.height
            };
            candidates.push({ resource, newVertices, newBoundingBox, snapshot });
        });
        const valid = candidates.every(c =>
            canMoveResourceTo(c.resource, c.newVertices, {
                ignoreResourceIds: ignoreIds,
                coMovingResourceIds: movableIds,
                coMovingDeltaX: dx,
                coMovingDeltaY: dy
            })
        );
        return { candidates, valid };
    };

    // Try full movement first
    let { candidates: moveCandidates, valid: canMoveAll } = buildAndTestCandidates(deltaX, deltaY);

    // === SLIDING COLLISION RESPONSE with BINARY SEARCH snap-to-contact ===
    //
    // When movement is blocked we:
    //  1. Decompose into axis-aligned components (slide along free axis).
    //  2. For every blocked axis, binary-search 8 iterations to find the
    //     closest valid position to the obstacle — so the resource always
    //     "hugs" the wall/boundary regardless of mouse speed.
    //
    // The frozen axis keeps its LAST APPLIED delta so the resource doesn't
    // snap back to the drag origin.

    // Binary search helper: finds the maximum valid value of `target` on
    // one axis while the other axis is fixed.  `goodVal` is the last known
    // valid value, `badVal` is the desired (but blocked) value.
    // Returns { val, result } where result is the buildAndTestCandidates output.
    const BISECT_ITERATIONS = 8; // 2^8 = 256 → sub-pixel precision
    const binarySearchAxis = (axis, goodVal, badVal, fixedAxisVal) => {
        let lo = goodVal, hi = badVal;
        let bestVal = goodVal;
        let bestResult = null;
        for (let i = 0; i < BISECT_ITERATIONS; i++) {
            const mid = (lo + hi) / 2;
            const testDx = axis === 'x' ? mid : fixedAxisVal;
            const testDy = axis === 'y' ? mid : fixedAxisVal;
            const r = buildAndTestCandidates(testDx, testDy);
            if (r.valid) {
                bestVal = mid;
                bestResult = r;
                lo = mid; // try to get even closer to the obstacle
                if (badVal < goodVal) { lo = hi; hi = mid; } // handle negative direction
            } else {
                hi = mid;
                if (badVal < goodVal) { hi = lo; lo = mid; } // handle negative direction
            }
        }
        return { val: bestVal, result: bestResult };
    };

    // Simpler directional binary search that always converges toward target
    const snapToContact = (axis, safeVal, targetVal, fixedAxisVal) => {
        if (Math.abs(targetVal - safeVal) < 0.05) return { val: safeVal, result: null };
        let lo, hi;
        if (targetVal > safeVal) { lo = safeVal; hi = targetVal; }
        else { lo = targetVal; hi = safeVal; }

        let bestVal = safeVal;
        let bestResult = null;
        for (let i = 0; i < BISECT_ITERATIONS; i++) {
            const mid = (lo + hi) / 2;
            const testDx = axis === 'x' ? mid : fixedAxisVal;
            const testDy = axis === 'y' ? mid : fixedAxisVal;
            const r = buildAndTestCandidates(testDx, testDy);
            if (r.valid) {
                bestVal = mid;
                bestResult = r;
                // Push towards target (the blocked side)
                if (targetVal > safeVal) lo = mid;
                else hi = mid;
            } else {
                // Pull back towards safe side
                if (targetVal > safeVal) hi = mid;
                else lo = mid;
            }
        }
        return { val: bestVal, result: bestResult };
    };

    if (!canMoveAll) {
        const lastDx = primarySnapshot ? (primarySnapshot.lastDeltaX || 0) : 0;
        const lastDy = primarySnapshot ? (primarySnapshot.lastDeltaY || 0) : 0;

        // Try advancing only X, keeping Y at its last valid position
        const tryX = Math.abs(deltaX - lastDx) > 0.0001;
        const xResult = tryX ? buildAndTestCandidates(deltaX, lastDy) : null;

        // Try advancing only Y, keeping X at its last valid position
        const tryY = Math.abs(deltaY - lastDy) > 0.0001;
        const yResult = tryY ? buildAndTestCandidates(lastDx, deltaY) : null;

        let canSlideX = xResult && xResult.valid;
        let canSlideY = yResult && yResult.valid;

        // --- Snap-to-contact: if a single-axis slide is also blocked,
        //     binary-search to find the closest valid position on that axis.
        let snappedX = null, snappedY = null;

        if (!canSlideX && tryX) {
            snappedX = snapToContact('x', lastDx, deltaX, lastDy);
            if (snappedX.result) { canSlideX = true; }
        }
        if (!canSlideY && tryY) {
            snappedY = snapToContact('y', lastDy, deltaY, lastDx);
            if (snappedY.result) { canSlideY = true; }
        }

        if (canSlideX && canSlideY) {
            // Both axes can advance — pick the one with larger movement
            const dxAmount = Math.abs((snappedX ? snappedX.val : deltaX) - lastDx);
            const dyAmount = Math.abs((snappedY ? snappedY.val : deltaY) - lastDy);
            if (dxAmount >= dyAmount) {
                moveCandidates = snappedX ? snappedX.result.candidates : xResult.candidates;
                deltaX = snappedX ? snappedX.val : deltaX;
                deltaY = lastDy;
            } else {
                moveCandidates = snappedY ? snappedY.result.candidates : yResult.candidates;
                deltaX = lastDx;
                deltaY = snappedY ? snappedY.val : deltaY;
            }
            canMoveAll = true;
        } else if (canSlideX) {
            moveCandidates = snappedX ? snappedX.result.candidates : xResult.candidates;
            deltaX = snappedX ? snappedX.val : deltaX;
            deltaY = lastDy;
            canMoveAll = true;
        } else if (canSlideY) {
            moveCandidates = snappedY ? snappedY.result.candidates : yResult.candidates;
            deltaX = lastDx;
            deltaY = snappedY ? snappedY.val : deltaY;
            canMoveAll = true;
        }

        // Last resort: both axes fully blocked — try bisecting the full
        // diagonal to at least get as close as possible to the obstacle.
        if (!canMoveAll && (tryX || tryY)) {
            const diagSnap = (() => {
                let lo = 0, hi = 1;
                let bestT = 0, bestResult = null;
                for (let i = 0; i < BISECT_ITERATIONS; i++) {
                    const mid = (lo + hi) / 2;
                    const testDx = lastDx + (deltaX - lastDx) * mid;
                    const testDy = lastDy + (deltaY - lastDy) * mid;
                    const r = buildAndTestCandidates(testDx, testDy);
                    if (r.valid) { bestT = mid; bestResult = r; lo = mid; }
                    else { hi = mid; }
                }
                return { t: bestT, result: bestResult };
            })();
            if (diagSnap.result) {
                moveCandidates = diagSnap.result.candidates;
                deltaX = lastDx + (deltaX - lastDx) * diagSnap.t;
                deltaY = lastDy + (deltaY - lastDy) * diagSnap.t;
                canMoveAll = true;
            }
        }
    }

    if (snapResult.usedGuides) {
        if (snapResult.usedGuides.vertical) {
            snapResult.usedGuides.vertical.isActive = true;
        }
        if (snapResult.usedGuides.horizontal) {
            snapResult.usedGuides.horizontal.isActive = true;
        }
    }

    setActiveGuideLines(guides);

    if (!canMoveAll) {
        canvas.style.cursor = 'not-allowed';
        drawAll();
        return;
    }

    moveCandidates.forEach(candidate => {
        const { snapshot } = candidate;
        const lastDeltaX = snapshot ? snapshot.lastDeltaX || 0 : 0;
        const lastDeltaY = snapshot ? snapshot.lastDeltaY || 0 : 0;
        const incrementalDeltaX = deltaX - lastDeltaX;
        const incrementalDeltaY = deltaY - lastDeltaY;

        candidate.resource.vertices = candidate.newVertices;

        if (candidate.resource.boundingBox) {
            candidate.resource.boundingBox.x = candidate.newBoundingBox.x;
            candidate.resource.boundingBox.y = candidate.newBoundingBox.y;
            candidate.resource.boundingBox.width = candidate.newBoundingBox.width;
            candidate.resource.boundingBox.height = candidate.newBoundingBox.height;
        }

        if (typeof candidate.resource.x === 'number') {
            candidate.resource.x = candidate.newBoundingBox.x;
        }
        if (typeof candidate.resource.y === 'number') {
            candidate.resource.y = candidate.newBoundingBox.y;
        }
        if (typeof candidate.resource.width === 'number') {
            candidate.resource.width = candidate.newBoundingBox.width;
        }
        if (typeof candidate.resource.height === 'number') {
            candidate.resource.height = candidate.newBoundingBox.height;
        }

        if (incrementalDeltaX || incrementalDeltaY) {
            translateLabelAnchor(candidate.resource, incrementalDeltaX, incrementalDeltaY);

            if (isStairResource(candidate.resource) && typeof window !== 'undefined' && window.applyStairTranslation) {
                const linkedId = candidate.resource?.stairConfig?.linkedResourceId;
                const updateLinked = !(linkedId && movableIds.includes(linkedId));
                window.applyStairTranslation(candidate.resource, incrementalDeltaX, incrementalDeltaY, {
                    skipGeometry: true,
                    updateLinked
                });
            }
        }

        updateConnectionPathsForResource(candidate.resource.id);

        if (snapshot) {
            snapshot.lastDeltaX = deltaX;
            snapshot.lastDeltaY = deltaY;
        }
    });

    // Atualizar NavMesh em tempo real (throttled) para feedback visual dos nós
    const now = performance.now();
    if (now - _lastNavMeshUpdateTime > NAVMESH_DRAG_UPDATE_INTERVAL_MS) {
        _lastNavMeshUpdateTime = now;
        const updatedAreaIds = new Set();
        moveCandidates.forEach(c => {
            const areaId = c.resource.parentAreaId;
            if (areaId && !updatedAreaIds.has(areaId)) {
                updatedAreaIds.add(areaId);
                const area = movementAreas.find(a => a.id === areaId);
                if (area && area.navMeshes) {
                    for (const widthKey of Object.keys(area.navMeshes)) {
                        const navMesh = area.navMeshes[widthKey];
                        if (navMesh && navMesh.baked) {
                            updateNavMeshWithObstacles(area, navMesh);
                        }
                    }
                }
            }
        });
    }

    canvas.style.cursor = 'grabbing';
    drawAll();
}

// =============================================================================
// HANDLERS PPT PARA RECURSOS
// =============================================================================

/**
 * Manipula o hover sobre handles PPT de recursos
 */
export function handleResourcePPTHover(pos) {
    const canvas = getCanvas();
    const editingResourceId = getEditingResourceId();
    
    if (!getIsEditingResourcePolygon() || !editingResourceId) {
        return false;
    }
    
    const editingResource = resources.find(r => r.id === editingResourceId);
    if (!editingResource) {
        return false;
    }
    
    const migratedResource = migrateResourceToPolygonal(editingResource);
    // skipValidation=true porque já validamos que estamos editando este recurso
    const handleType = getResourceHandleAtPos(pos.x, pos.y, migratedResource, true);
    const currentHovered = getHoveredResourceResizeHandle();
    
    if (handleType !== currentHovered) {
        setHoveredResourceResizeHandle(handleType);
        
        if (handleType) {
            canvas.style.cursor = getResourceHandleCursor(handleType, migratedResource);
        }
        
        drawAll();
        return true;
    }
    
    return !!handleType;
}

/**
 * Manipula o arraste de resize de recurso via PPT handle
 */
export function handleResourcePPTResizeDrag(pos) {
    const canvas = getCanvas();
    const editingResourceId = getEditingResourceId();
    const activeHandle = getActiveResourceResizeHandle();
    
    if (!editingResourceId || !activeHandle) {
        return;
    }
    
    const editingResource = resources.find(r => r.id === editingResourceId);
    if (!editingResource) {
        return;
    }
    
    const originalVertices = getOriginalResourceVerticesOnDrag();
    if (!originalVertices || originalVertices.length === 0) {
        return;
    }
    
    if (activeHandle.startsWith('corner_')) {
        const cornerIndex = parseInt(activeHandle.replace('corner_', ''));
        updateResourceCornerDrag(editingResource, cornerIndex, pos.x, pos.y, originalVertices);
    } else if (activeHandle.startsWith('edge_')) {
        const edgeIndex = parseInt(activeHandle.replace('edge_', ''));
        updateResourceEdgeDrag(editingResource, edgeIndex, pos.x, pos.y, originalVertices);
    }
    
    // Atualizar posições dos hubs após o resize — reprojetar nas bordas do novo polígono
    const originalHubPositions = getOriginalHubPositionsBeforeRotation();
    if (originalHubPositions && originalHubPositions.length > 0) {
        const resourceHubs = getHubsForResource(editingResource.id) || [];
        const oldCentroid = getHPCentroid(originalVertices);
        const newVertices = editingResource.vertices;
        const newCentroid = getHPCentroid(newVertices);
        
        resourceHubs.forEach(hub => {
            const originalHub = originalHubPositions.find(h => h.id === hub.id);
            if (!originalHub) return;
            
            // 1. Converter posição local original para mundo usando centroide antigo
            const hubWorldX = oldCentroid.x + originalHub.localX;
            const hubWorldY = oldCentroid.y + originalHub.localY;
            
            // 2. Encontrar a aresta mais próxima no polígono ORIGINAL para obter t paramétrico
            const oldEdgeResult = findClosestEdgePoint(hubWorldX, hubWorldY, originalVertices);
            if (!oldEdgeResult) return;
            
            // 3. Calcular t paramétrico ao longo da aresta original
            const oldEdgeStart = oldEdgeResult.edgeStart;
            const oldEdgeEnd = oldEdgeResult.edgeEnd;
            const oldEdgeDx = oldEdgeEnd.x - oldEdgeStart.x;
            const oldEdgeDy = oldEdgeEnd.y - oldEdgeStart.y;
            const oldEdgeLen = Math.sqrt(oldEdgeDx * oldEdgeDx + oldEdgeDy * oldEdgeDy);
            let t = 0;
            if (oldEdgeLen > 0.001) {
                t = ((oldEdgeResult.point.x - oldEdgeStart.x) * oldEdgeDx + 
                     (oldEdgeResult.point.y - oldEdgeStart.y) * oldEdgeDy) / (oldEdgeLen * oldEdgeLen);
                t = Math.max(0, Math.min(1, t));
            }
            
            // 4. Aplicar t na mesma aresta do polígono NOVO
            const edgeIdx = oldEdgeResult.edgeIndex;
            const newEdgeStart = newVertices[edgeIdx];
            const newEdgeEnd = newVertices[(edgeIdx + 1) % newVertices.length];
            const newPointX = newEdgeStart[0] + t * (newEdgeEnd[0] - newEdgeStart[0]);
            const newPointY = newEdgeStart[1] + t * (newEdgeEnd[1] - newEdgeStart[1]);
            
            // 5. Converter de volta para coordenadas locais usando novo centroide
            hub.localX = newPointX - newCentroid.x;
            hub.localY = newPointY - newCentroid.y;
            
            // 6. Calcular nova normal a partir da aresta do novo polígono
            const newEdgeDx = newEdgeEnd[0] - newEdgeStart[0];
            const newEdgeDy = newEdgeEnd[1] - newEdgeStart[1];
            const newEdgeLen = Math.sqrt(newEdgeDx * newEdgeDx + newEdgeDy * newEdgeDy);
            if (newEdgeLen > 0) {
                let normalX = -newEdgeDy / newEdgeLen;
                let normalY = newEdgeDx / newEdgeLen;
                // Garantir que aponta para fora (dot com centroide deve ser negativo)
                const midX = (newEdgeStart[0] + newEdgeEnd[0]) / 2;
                const midY = (newEdgeStart[1] + newEdgeEnd[1]) / 2;
                const toCenterX = newCentroid.x - midX;
                const toCenterY = newCentroid.y - midY;
                if (normalX * toCenterX + normalY * toCenterY > 0) {
                    normalX = -normalX;
                    normalY = -normalY;
                }
                hub.normalX = normalX;
                hub.normalY = normalY;
            }
        });
    }
    
    // Se for escada, sincronizar redimensionamento com a escada espelhada no outro pavimento
    if (isStairResource(editingResource)) {
        const linked = getStairLinkedResource(editingResource);
        if (linked && linked !== editingResource && Array.isArray(editingResource.vertices)) {
            linked.vertices = editingResource.vertices.map(([x, y]) => [x, y]);
            updateResourceCompatibilityProperties(linked);
            // Recalcular orientação de ambas as escadas
            if (editingResource.stairConfig && editingResource.stairConfig.orientation) {
                editingResource.stairConfig.orientation = null;
            }
            if (linked.stairConfig && linked.stairConfig.orientation) {
                linked.stairConfig.orientation = null;
            }
        }
    }

    canvas.style.cursor = getResourceHandleCursor(activeHandle, editingResource);
    updateConnectionPathsForResource(editingResource.id);
    drawAll();
}

/**
 * Manipula o arraste de rotação de recurso via PPT handle
 */
export function handleResourcePPTRotationDrag(pos) {
    const canvas = getCanvas();
    const editingResourceId = getEditingResourceId();
    
    if (!editingResourceId || !getIsRotatingResource()) {
        return;
    }
    
    const editingResource = resources.find(r => r.id === editingResourceId);
    if (!editingResource) {
        return;
    }
    
    const center = getResourceRotationCenter();
    const startAngle = getResourceRotationStartAngle();
    const originalVertices = getResourceVerticesBeforeRotation();
    
    if (!center || startAngle === null || !originalVertices) {
        return;
    }
    
    const deltaAngle = updateResourceRotation(editingResource, pos.x, pos.y, center, startAngle, originalVertices);
    setCurrentResourceRotationAngle(deltaAngle);
    
    // Atualizar posições dos hubs em tempo real durante o arraste
    const originalHubPositions = getOriginalHubPositionsBeforeRotation();
    if (originalHubPositions && originalHubPositions.length > 0) {
        const resourceHubs = getHubsForResource(editingResource.id) || [];
        
        if (deltaAngle === 0) {
            // Quando o ângulo é zero, restaurar as posições originais dos hubs
            for (const hub of resourceHubs) {
                const originalPos = originalHubPositions.find(p => p.id === hub.id);
                if (originalPos) {
                    hub.localX = originalPos.localX;
                    hub.localY = originalPos.localY;
                    
                    if (originalPos.normalX !== undefined && originalPos.normalY !== undefined) {
                        hub.normalX = originalPos.normalX;
                        hub.normalY = originalPos.normalY;
                    }
                    
                    // Limpar cache de coordenadas mundo para forçar recálculo
                    delete hub.x;
                    delete hub.y;
                }
            }
        } else {
            // Quando há rotação, calcular as novas posições
            const cos = Math.cos(deltaAngle);
            const sin = Math.sin(deltaAngle);
            
            // Calcular o centroide original e o novo centroide
            const originalCentroid = {
                x: originalVertices.reduce((sum, v) => sum + v[0], 0) / originalVertices.length,
                y: originalVertices.reduce((sum, v) => sum + v[1], 0) / originalVertices.length
            };
            
            const newCentroid = {
                x: editingResource.vertices.reduce((sum, v) => sum + v[0], 0) / editingResource.vertices.length,
                y: editingResource.vertices.reduce((sum, v) => sum + v[1], 0) / editingResource.vertices.length
            };
            
            for (const hub of resourceHubs) {
                const originalPos = originalHubPositions.find(p => p.id === hub.id);
                if (originalPos) {
                    // Calcular posição mundo original do hub
                    const originalWorldX = originalCentroid.x + originalPos.localX;
                    const originalWorldY = originalCentroid.y + originalPos.localY;
                    
                    // Rotacionar a posição mundo em torno do centro de rotação
                    const relX = originalWorldX - center.x;
                    const relY = originalWorldY - center.y;
                    const rotatedWorldX = center.x + relX * cos - relY * sin;
                    const rotatedWorldY = center.y + relX * sin + relY * cos;
                    
                    // Converter de volta para coordenadas locais usando o novo centroide
                    hub.localX = Math.round((rotatedWorldX - newCentroid.x) * 1000) / 1000;
                    hub.localY = Math.round((rotatedWorldY - newCentroid.y) * 1000) / 1000;
                    
                    // Rotacionar também a normal (se existir)
                    if (originalPos.normalX !== undefined && originalPos.normalY !== undefined) {
                        hub.normalX = Math.round((originalPos.normalX * cos - originalPos.normalY * sin) * 1000) / 1000;
                        hub.normalY = Math.round((originalPos.normalX * sin + originalPos.normalY * cos) * 1000) / 1000;
                    }
                    
                    // Limpar cache de coordenadas mundo para forçar recálculo
                    delete hub.x;
                    delete hub.y;
                }
            }
        }
    }
    
    canvas.style.cursor = 'crosshair';
    updateConnectionPathsForResource(editingResource.id);
    drawAll();
}

/**
 * Finaliza o resize de recurso via PPT handle
 */
export function handleResourcePPTResizeMouseUp() {
    const activeHandle = getActiveResourceResizeHandle();
    
    if (!activeHandle) {
        return false;
    }
    
    const editingResourceId = getEditingResourceId();
    if (editingResourceId) {
        const editingResource = resources.find(r => r.id === editingResourceId);
        if (editingResource) {
            updateResourceCompatibilityProperties(editingResource);
            updateConnectionPathsForResource(editingResource.id);

            // Sincronizar escada espelhada ao finalizar resize
            if (isStairResource(editingResource)) {
                const linked = getStairLinkedResource(editingResource);
                if (linked && linked !== editingResource && Array.isArray(editingResource.vertices)) {
                    linked.vertices = editingResource.vertices.map(([x, y]) => [x, y]);
                    updateResourceCompatibilityProperties(linked);
                    if (editingResource.stairConfig && editingResource.stairConfig.orientation) {
                        editingResource.stairConfig.orientation = null;
                    }
                    if (linked.stairConfig && linked.stairConfig.orientation) {
                        linked.stairConfig.orientation = null;
                    }
                }
            }
        }
    }
    
    // Limpar estado
    setActiveResourceResizeHandle(null);
    setOriginalResourceVerticesOnDrag(null);
    
    drawAll();
    return true;
}

/**
 * Finaliza a rotação de recurso via PPT handle
 */
export function handleResourcePPTRotationMouseUp() {
    if (!getIsRotatingResource()) {
        return false;
    }
    
    const editingResourceId = getEditingResourceId();
    const rotationAngleRad = getCurrentResourceRotationAngle();
    const rotationCenter = getResourceRotationCenter();
    const originalVertices = getResourceVerticesBeforeRotation();
    
    if (editingResourceId) {
        const editingResource = resources.find(r => r.id === editingResourceId);
        if (editingResource) {
            // Os hubs já foram rotacionados em tempo real durante o drag
            // Agora só precisamos rotacionar o label anchor
            if (rotationAngleRad !== 0 && rotationCenter) {
                applyLabelTransformAfterRotation(
                    editingResource,
                    rotationCenter.x,
                    rotationCenter.y,
                    originalVertices,
                    editingResource.vertices,
                    rotationAngleRad
                );

                // Atualizar ângulo de rotação acumulado (usado para renderizar imagem colada)
                const angleDeg = rotationAngleRad * 180 / Math.PI;
                editingResource.rotation = (editingResource.rotation || 0) + angleDeg;
                editingResource.rotation = editingResource.rotation % 360;
            }
            
            updateResourceCompatibilityProperties(editingResource);
            updateConnectionPathsForResource(editingResource.id);
        }
    }
    
    // Limpar estado
    setIsRotatingResource(false);
    setResourceRotationStartAngle(null);
    setResourceRotationCenter(null);
    setResourceVerticesBeforeRotation(null);
    setCurrentResourceRotationAngle(0);
    setOriginalHubPositionsBeforeRotation(null);
    
    drawAll();
    return true;
}
