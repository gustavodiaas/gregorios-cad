import { 
    setIsCtrlPressed,
    getIsCreatingOpening, setIsCreatingOpening, setOpeningPreviewPosition,
    getIsDrawingResource, setIsDrawingResource, getCurrentResourceRect, setCurrentResourceRect,
    getIsEditingPolygon, setIsEditingPolygon, setEditingAreaId,
    getIsEditingResourcePolygon,
    isDrawingWall, setIsDrawingWall, setWallStartPoint, setWallPreviewEnd,
    isDrawing, setIsDrawing, currentRect,
    isDragging, setIsDragging, activeGuideLines,
    selectedAreaId, setSelectedAreaId,
    selectedWallId, setSelectedWallId,
    getSelectedResourceId, getSelectedResourceIds, setSelectedResourceId,
    getIsDrawingFreeLine, setIsDrawingFreeLine,
    setFreeLineStartPoint, setFreeLinePreviewEnd,
    getSelectedConnectionId, setSelectedConnectionId,
    getIsDrawingConnection, setIsDrawingConnection,
    setIsConnectionMousePressed, setCurrentConnection,
    getSelectedFreeLineId, setSelectedFreeLineId,
    getSelectedHubId, setSelectedHubId,
    getSelectedExclusionZoneId, setSelectedExclusionZoneId,
    // Estados de edição de parede
    getIsEditingWall, setIsEditingWall, getEditingWallId, setEditingWallId, getEditingWallHandle, setEditingWallHandle,
    walls, movementAreas, resources,
    getMidpointArrowsVisible,
    // Sub-segmentos
    getSelectedWallSubSegment, setSelectedWallSubSegment,
    getSelectedFreeLineSubSegment, setSelectedFreeLineSubSegment
} from '../state.js';
import { drawAll } from '../drawing.js';
import { setActiveTool, getCurrentTool } from '../active_tool.js';
import { hideContextMenu } from './contextMenuUtils.js';
import { saveStateToHistory } from '../history.js'; // Sistema de undo/redo
import { 
    getIsCreatingOpeningFromOpenings, stopCreatingOpening,
    getSelectedOpeningId, setSelectedOpeningId, deleteOpening
} from '../openings.js';
import { removeResource, moveResourcesWithArea, translateLabelAnchor, stopResourcePolygonEditing } from '../resources.js';
import { deleteConnection, moveConnectionsWithArea } from '../connections.js';
import { removeHub } from '../hubs.js';
import { removeExclusionZone } from '../exclusion-zones.js';
import { deleteArea } from '../areaactions/areaactions.js';
import { calculateBoundingBox, canMoveTo } from '../areas.js';
import { moveWallsWithArea, deleteWall, createWall } from '../walls.js';
import { getRemainingSubSegments } from '../utils/segment-split.js';
import { ensureAreaHasNavMesh } from '../navMeshBaker.js';
import { invalidateNavigationGraph } from '../navigation.js';
import { layoutChangeNotifier } from '../core/layout-change-notifier.js';
import { canMoveResourceTo } from '../merge_resources/resource_operations.js';
import { migrateResourceToPolygonal } from '../resources.js';
import { moveMidpointWithArrows, hideMidpointArrowsIndicator } from '../midpoint-arrows.js';
import { getCanvas } from '../state.js';
import { moveStepPx } from '../config.js';
import { startResourceDrag, endResourceDrag } from '../resource-dimensions.js';
import { generateResourceAlignmentGuides, applyResourceSnapToGuides, calculateResourceBounds } from './resourceutils.js';
import { removeFreeLine, removeFreeLineSubSegment, moveFreeLinesWithArea, clearFreeLineSnapIndicator, clearFreeLineClosureIndicator } from '../free-lines.js';
import { moveExclusionZonesWithArea } from '../exclusion-zones.js';

/**
 * Inicializa os listeners de eventos de teclado
 */
export function initializeKeyboardEvents() {
    // Eventos de teclado
    document.addEventListener('keydown', (e) => {
        const isEditingField = e.target instanceof HTMLElement
            && Boolean(e.target.closest('input, textarea, select, [contenteditable="true"]'));
        // Detectar tecla Ctrl
        if (e.ctrlKey || e.metaKey) {
            setIsCtrlPressed(true);
        }

        if (e.key === 'Escape') {
            handleEscapeKey();
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditingField) {
            e.preventDefault();
            handleDeleteKey();
        } else {
            handleArrowKeys(e);
        }
    });

    // Detectar quando Ctrl é liberado
    document.addEventListener('keyup', (e) => {
        if (!e.ctrlKey && !e.metaKey) {
            setIsCtrlPressed(false);
        }
    });
}

/**
 * Manipula a tecla ESC para cancelar operações
 */
function handleEscapeKey() {
    const canvas = getCanvas();
    
    hideContextMenu();

    let needsRedraw = false;

    // Cancelar modos de criação/edição em andamento
    if (getIsCreatingOpening()) {
        setIsCreatingOpening(false);
        setOpeningPreviewPosition(null);
        needsRedraw = true;
    }

    if (getIsCreatingOpeningFromOpenings()) {
        stopCreatingOpening();
        needsRedraw = true;
    }

    if (getIsDrawingResource()) {
        setIsDrawingResource(false);
        const resetRect = getCurrentResourceRect();
        resetRect.x = 0;
        resetRect.y = 0;
        resetRect.width = 0;
        resetRect.height = 0;
        resetRect.parentAreaId = null;
        setCurrentResourceRect(resetRect);
        canvas.style.cursor = 'default';
        needsRedraw = true;
    }

    if (getIsDrawingFreeLine()) {
        setIsDrawingFreeLine(false);
        setFreeLineStartPoint(null);
        setFreeLinePreviewEnd(null);
        clearFreeLineSnapIndicator();
        clearFreeLineClosureIndicator();
        needsRedraw = true;
    }

    if (getIsDrawingConnection()) {
        setIsDrawingConnection(false);
        setIsConnectionMousePressed(false);
        setCurrentConnection(null);
        needsRedraw = true;
    }

    if (getIsEditingPolygon()) {
        if (getMidpointArrowsVisible()) {
            hideMidpointArrowsIndicator();
        }
        setIsEditingPolygon(false);
        setEditingAreaId(null);
        needsRedraw = true;
    }

    // Cancelar edição de polígono de recurso
    if (getIsEditingResourcePolygon()) {
        stopResourcePolygonEditing();
        canvas.style.cursor = 'default';
        needsRedraw = true;
    }

    if (isDrawingWall) {
        setIsDrawingWall(false);
        setWallStartPoint(null);
        setWallPreviewEnd(null);
        needsRedraw = true;
    }

    if (isDrawing) {
        setIsDrawing(false);
        currentRect.x = 0;
        currentRect.y = 0;
        currentRect.width = 0;
        currentRect.height = 0;
        needsRedraw = true;
    }

    if (isDragging) {
        setIsDragging(false);
        activeGuideLines.length = 0;
        if (getSelectedResourceIds().length > 0) {
            endResourceDrag();
        }
        canvas.style.cursor = 'default';
        needsRedraw = true;
    }

    if (getIsEditingWall()) {
        setIsEditingWall(false);
        setEditingWallId(null);
        setEditingWallHandle(null);
        needsRedraw = true;
    }

    // Limpar seleções de todos os tipos de elementos
    if (selectedAreaId) {
        setSelectedAreaId(null);
        needsRedraw = true;
    }

    if (selectedWallId) {
        setSelectedWallId(null);
        needsRedraw = true;
    }

    const selectedOpeningId = getSelectedOpeningId();
    if (selectedOpeningId) {
        setSelectedOpeningId(null);
        needsRedraw = true;
    }

    const selectedConnectionId = getSelectedConnectionId();
    if (selectedConnectionId) {
        setSelectedConnectionId(null);
        needsRedraw = true;
    }

    const selectedFreeLineId = getSelectedFreeLineId();
    if (selectedFreeLineId) {
        setSelectedFreeLineId(null);
        needsRedraw = true;
    }

    const selectedResourceIds = getSelectedResourceIds();
    if (selectedResourceIds.length > 0) {
        setSelectedResourceId(null);
        needsRedraw = true;
    }

    const currentTool = getCurrentTool();
    if (currentTool) {
        setActiveTool(null);
    }

    if (needsRedraw) {
        drawAll();
    }
}

/**
 * Manipula as teclas Delete/Backspace para excluir elementos
 */
function handleDeleteKey() {
    // Handle Delete/Backspace for hubs first (highest priority - small clickable area)
    const selectedHubId = getSelectedHubId();
    if (selectedHubId) {
        saveStateToHistory('Excluir hub');
        const removed = removeHub(selectedHubId);
        if (removed) {
            setSelectedHubId(null);
            drawAll();
        }
        return;
    }
    
    // Handle Delete/Backspace for standalone exclusion zones
    const selectedExclusionZoneId = getSelectedExclusionZoneId();
    if (selectedExclusionZoneId) {
        saveStateToHistory('Excluir zona de exclusão');
        const removed = removeExclusionZone(selectedExclusionZoneId);
        if (removed) {
            setSelectedExclusionZoneId(null);
            drawAll();
        }
        return;
    }
    
    // Handle Delete/Backspace for openings second
    if (getSelectedOpeningId()) {
        const openingId = getSelectedOpeningId();
        saveStateToHistory('Excluir abertura');
        const deleted = deleteOpening(openingId);
        if (deleted) {
            setSelectedOpeningId(null);
            // Cancelar modo de edição de polígono
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            drawAll();
        }
        return;
    }
    
    // Handle Delete/Backspace for connections third
    if (getSelectedConnectionId()) {
        const connectionId = getSelectedConnectionId();
        deleteConnection(connectionId); // Esta função já tem saveStateToHistory
        // Nota: deleteConnection já chama setSelectedConnectionId(null) e drawAll()
        return;
    }

    // Handle Delete/Backspace for free lines third
    const selectedFreeLineId = getSelectedFreeLineId();
    if (selectedFreeLineId) {
        saveStateToHistory('Excluir linha livre');
        const freeLineSub = getSelectedFreeLineSubSegment();
        let removed;
        if (freeLineSub) {
            removed = removeFreeLineSubSegment(selectedFreeLineId, freeLineSub);
        } else {
            removed = removeFreeLine(selectedFreeLineId);
        }
        if (removed) {
            setSelectedFreeLineId(null);
            setSelectedFreeLineSubSegment(null);
            drawAll();
        }
        return;
    }
    
    // Handle Delete/Backspace for resources fourth
    const selectedResourceIds = getSelectedResourceIds();
    if (selectedResourceIds.length > 0) {
        saveStateToHistory(selectedResourceIds.length > 1 ? 'Excluir recursos' : 'Excluir recurso');
        let removedAny = false;
        selectedResourceIds.slice().forEach(resourceId => {
            if (removeResource(resourceId)) {
                removedAny = true;
            }
        });

        if (removedAny) {
            setSelectedResourceId(null);
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            drawAll();
        }
        return;
    }
    
    // Handle Delete/Backspace for walls fifth
    if (selectedWallId) {
        const wall = walls.find(w => w.id === selectedWallId);
        if (wall) {
            saveStateToHistory('Excluir parede');
            // deleteWall já lida com sub-segmentos automaticamente
            deleteWall(wall);
            // Cancelar modo de edição de polígono
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
        }
        return;
    }
    
    // Handle Delete/Backspace for areas last
    if (selectedAreaId) {
        const area = movementAreas.find(a => a.id === selectedAreaId);
        if (area && !area.locked) {
            // deleteArea já tem saveStateToHistory
            deleteArea(area);
        }
    }
}

/**
 * Manipula as teclas de seta para mover elementos
 */
function handleArrowKeys(e) {
    // Prioridade 1: Verificar se existe um midpoint ativo para movimento preciso
    handleMidpointArrowMovement(e);
    
    // Prioridade 2: Arrow key movement for selected areas
    const selectedArea = movementAreas.find(a => a.id === selectedAreaId);
    const selectedResource = resources.find(r => r.id === getSelectedResourceId());
    
    if (selectedArea && !selectedArea.locked) {
        let dx = 0, dy = 0;
        switch (e.key) {
            case "ArrowUp": dy = -moveStepPx; break;
            case "ArrowDown": dy = moveStepPx; break;
            case "ArrowLeft": dx = -moveStepPx; break;
            case "ArrowRight": dx = moveStepPx; break;
            default: break;
        }
        
        if (dx !== 0 || dy !== 0) {
            const previousVertices = selectedArea.vertices.map(([x, y]) => [x, y]);
            const previousRings = Array.isArray(selectedArea.rings)
                ? selectedArea.rings.map(ring => ring.map(([x, y]) => [x, y]))
                : null;

            // Calculate new vertices
            const newVertices = selectedArea.vertices.map(([x, y]) => [x + dx, y + dy]);
            // Check if the area can move to the new position
            if (canMoveTo(selectedArea, newVertices)) {
                // Update area position
                selectedArea.vertices = newVertices;
                // Update rings if they exist
                if (selectedArea.rings) {
                    selectedArea.rings = selectedArea.rings.map(ring => 
                        ring.map(([x, y]) => [x + dx, y + dy])
                    );
                }
                // Update bounding box
                const bb = calculateBoundingBox(selectedArea.vertices);
                selectedArea.x = bb.x;
                selectedArea.y = bb.y;
                selectedArea.width = bb.width;
                selectedArea.height = bb.height;
                
                // Move walls that belong to this area
                const movedCount = moveWallsWithArea(selectedArea.id, dx, dy);
                
                // Mover recursos junto com a área (via teclado)
                moveResourcesWithArea(selectedArea.id, dx, dy);
                
                // Mover conexões junto com a área (via teclado)
                moveConnectionsWithArea(selectedArea.id, dx, dy);

                moveFreeLinesWithArea(selectedArea.id, dx, dy, {
                    verticesBeforeMove: previousVertices,
                    ringsBeforeMove: previousRings
                });
                moveExclusionZonesWithArea(selectedArea.id, dx, dy);
                
                // Regenerar a NavMesh para refletir a nova posição da área
                ensureAreaHasNavMesh(selectedArea);
                invalidateNavigationGraph();
                
                // Notificar o sistema de mudança de layout
                layoutChangeNotifier.notifyChange('area', { action: 'move', entity: selectedArea });
                
                drawAll();
            }
            return; // Impedir que continue para o movimento de recursos
        }
    } else {
        const selectedResourceIds = getSelectedResourceIds();
        const movableResources = selectedResourceIds
            .map(id => resources.find(r => r.id === id))
            .filter(resource => resource && !resource.locked);

        if (movableResources.length > 0) {
            let dx = 0, dy = 0;
            switch (e.key) {
                case "ArrowUp": dy = -moveStepPx; break;
                case "ArrowDown": dy = moveStepPx; break;
                case "ArrowLeft": dx = -moveStepPx; break;
                case "ArrowRight": dx = moveStepPx; break;
                default: return;
            }

            const primaryResource = (selectedResource && !selectedResource.locked)
                ? selectedResource
                : movableResources[0];

            startResourceDrag();

            const bounds = calculateResourceBounds(primaryResource);
            const proposedX = bounds.x + dx;
            const proposedY = bounds.y + dy;

            const guides = generateResourceAlignmentGuides(primaryResource, proposedX, proposedY);
            const snapResult = applyResourceSnapToGuides(primaryResource, proposedX, proposedY, guides);

            const finalDeltaX = snapResult.x - bounds.x;
            const finalDeltaY = snapResult.y - bounds.y;

            if (Math.abs(finalDeltaX) < 0.01 && Math.abs(finalDeltaY) < 0.01) {
                endResourceDrag();
                return;
            }

            const movableIds = movableResources.map(resource => resource.id);
            const moveCandidates = movableResources.map(resource => {
                const migrated = migrateResourceToPolygonal(resource);
                const newVertices = migrated.vertices.map(([x, y]) => [x + finalDeltaX, y + finalDeltaY]);
                const resourceBounds = calculateResourceBounds(resource);
                const newBoundingBox = {
                    x: resourceBounds.x + finalDeltaX,
                    y: resourceBounds.y + finalDeltaY,
                    width: resourceBounds.width,
                    height: resourceBounds.height
                };

                return { resource, newVertices, newBoundingBox };
            });

            const canMoveAll = moveCandidates.every(candidate =>
                canMoveResourceTo(candidate.resource, candidate.newVertices, { ignoreResourceIds: movableIds })
            );

            if (!canMoveAll) {
                endResourceDrag();
                return;
            }

            moveCandidates.forEach(candidate => {
                const { resource, newVertices, newBoundingBox } = candidate;
                resource.vertices = newVertices;

                if (resource.boundingBox) {
                    resource.boundingBox.x = newBoundingBox.x;
                    resource.boundingBox.y = newBoundingBox.y;
                    resource.boundingBox.width = newBoundingBox.width;
                    resource.boundingBox.height = newBoundingBox.height;
                }

                if (typeof resource.x === 'number') {
                    resource.x = newBoundingBox.x;
                }
                if (typeof resource.y === 'number') {
                    resource.y = newBoundingBox.y;
                }
                if (typeof resource.width === 'number') {
                    resource.width = newBoundingBox.width;
                }
                if (typeof resource.height === 'number') {
                    resource.height = newBoundingBox.height;
                }

                translateLabelAnchor(resource, finalDeltaX, finalDeltaY);

                if (window.updateConnectionPathsForResource) {
                    window.updateConnectionPathsForResource(resource.id);
                }

                if (window.applyStairTranslation) {
                    window.applyStairTranslation(resource, finalDeltaX, finalDeltaY, { skipGeometry: true });
                }
            });

            drawAll();
            endResourceDrag();
            return;
        }

        // Movimento de midpoints com setas
        moveMidpointWithArrows(e);
    }
}

/**
 * Manipula movimento de midpoints com setas do teclado
 */
function handleMidpointArrowMovement(e) {
    // Verificar se temos um midpoint ativo
    import('../state.js').then(({ getActiveMidpointIndex, getMidpointArrowsVisible }) => {
        if (getMidpointArrowsVisible() && getActiveMidpointIndex() !== null) {
            let direction = null;
            switch (e.key) {
                case "ArrowUp": direction = 'up'; break;
                case "ArrowDown": direction = 'down'; break;
                case "ArrowLeft": direction = 'left'; break;
                case "ArrowRight": direction = 'right'; break;
                default: return;
            }
            
            if (direction) {
                e.preventDefault(); // Prevenir scroll da página
                moveMidpointWithArrows(direction);
            }
        }
    });
}

// Exportar as novas funções para testes
export { handleMidpointArrowMovement };
