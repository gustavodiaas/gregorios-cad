/**
 * Handlers para eventos de mouse relacionados a seleção
 */
import { 
    getCanvas, movementAreas, resources,
    setSelectedAreaId, setSelectedWallId, setSelectedConnectionId, setSelectedFreeLineId,
    setIsPanning, setPanStart,
    getIsEditingPolygon, setIsEditingPolygon, getEditingAreaId, setEditingAreaId,
    getIsEditingResourcePolygon, getEditingResourceId, getIsCreatingOpening, setIsCreatingOpening, setOpeningPreviewPosition,
    setSelectedHubId,
    setActiveResizeHandle, setOriginalVerticesOnDrag,
    setIsRotatingArea, setRotationStartAngle, setRotationCenter, setVerticesBeforeRotation,
    // Estados para rotação em tempo real dos itens da área
    walls,
    getConnections,
    setOriginalAreaResourcesBeforeRotation,
    setOriginalAreaWallsBeforeRotation,
    setOriginalAreaConnectionsBeforeRotation,
    setOriginalAreaResourceHubsBeforeRotation,
    setOriginalAreaOpeningsBeforeRotation,
    // PPT handles para recursos
    setActiveResourceResizeHandle, setOriginalResourceVerticesOnDrag,
    setIsRotatingResource, setResourceRotationStartAngle, setResourceRotationCenter, 
    setResourceVerticesBeforeRotation, setCurrentResourceRotationAngle,
    setOriginalHubPositionsBeforeRotation,
    // Sub-segmento
    setSelectedWallSubSegment, setSelectedFreeLineSubSegment
} from '../../state.js';
import { computeSubSegment } from '../../utils/segment-split.js';
import { setSelectedOpeningId } from '../../openings.js';
import { drawAll } from '../../drawing.js';
import { deselectAllResources, stopResourcePolygonEditing, findResourceAtPosition, migrateResourceToPolygonal } from '../../resources.js';
import { getAreaAtPos, findWallAtPos } from '../mouseUtils.js';
import { findOpeningAtPosition, getIsCreatingOpeningFromOpenings, stopCreatingOpening, openings as allOpenings } from '../../openings.js';
import { getConnectionAtPosition } from '../../connections.js';
import { findFreeLineAtPosition } from '../../free-lines.js';
import { setActiveTool, getCurrentTool } from '../../active_tool.js';
import { getHubAtPosition, getHubsForResource } from '../../hubs.js';
import { getHandleAtPos, getHandleCursor, calculatePPTHandles } from '../../polygon.js';
import { getResourceHandleAtPos, getResourceHandleCursor, calculateResourcePPTHandles } from '../../resource-polygon.js';
import { saveStateToHistory } from '../../history.js';

// Importar handlers específicos
import { handleOpeningClick, findHoveredControlPointGlobal, startResizingOpening, setHoveredControlPoint } from './openingHandlers.js';
import { handleResourceClick } from './resourceHandlers.js';
import { handleConnectionClick } from './connectionHandlers.js';
import { handleWallClick } from './wallHandlers.js';
import { handleAreaClick } from './areaHandlers.js';
import { findStandaloneExclusionZoneAtPoint, getExclusionZoneHandleAtPos, getExclusionZoneHandleCursor } from '../../exclusion-zones.js';
import {
    setSelectedExclusionZoneId, getSelectedExclusionZoneId,
    setIsDraggingExclusionZone, setExclusionZoneDragOffset,
    setExclusionZoneOriginalStart, setExclusionZoneOriginalEnd,
    setActiveExclusionZoneResizeHandle, getScale,
    exclusionZones
} from '../../state.js';

/**
 * Manipula o clique em linha livre
 */
export function handleFreeLineClick(clickedLine, clickPoint) {
    setSelectedFreeLineId(clickedLine.id);
    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedExclusionZoneId(null);
    deselectAllResources();
    setSelectedConnectionId(null);
    setSelectedWallSubSegment(null);

    // Calcular sub-segmento baseado em interseções
    if (clickPoint && (!clickedLine.shapeType || clickedLine.shapeType === 'line')) {
        const sub = computeSubSegment(clickedLine, clickPoint, 'freeline');
        setSelectedFreeLineSubSegment(sub);
    } else {
        setSelectedFreeLineSubSegment(null);
    }

    if (getIsEditingPolygon()) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }
    if (getIsEditingResourcePolygon()) {
        stopResourcePolygonEditing();
    }
    drawAll();
}

/**
 * Manipula o clique em zona de exclusão standalone
 */
export function handleExclusionZoneClick(zone, pos) {
    const currentSelectedId = getSelectedExclusionZoneId();

    // Se já está selecionada, verificar handle de resize primeiro
    if (currentSelectedId === zone.id && pos) {
        const scale = getScale();
        const handle = getExclusionZoneHandleAtPos(pos.x, pos.y, zone, scale);
        if (handle) {
            // Iniciar resize
            saveStateToHistory('Redimensionar zona de exclusão');
            setActiveExclusionZoneResizeHandle(handle);
            setExclusionZoneOriginalStart([zone.startPoint[0], zone.startPoint[1]]);
            setExclusionZoneOriginalEnd([zone.endPoint[0], zone.endPoint[1]]);
            getCanvas().style.cursor = getExclusionZoneHandleCursor(handle);
            return;
        }
        // Iniciar drag
        saveStateToHistory('Mover zona de exclusão');
        setIsDraggingExclusionZone(true);
        setExclusionZoneDragOffset({
            dx: pos.x - zone.startPoint[0],
            dy: pos.y - zone.startPoint[1]
        });
        setExclusionZoneOriginalStart([zone.startPoint[0], zone.startPoint[1]]);
        setExclusionZoneOriginalEnd([zone.endPoint[0], zone.endPoint[1]]);
        getCanvas().style.cursor = 'grabbing';
        return;
    }

    setSelectedExclusionZoneId(zone.id);
    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedFreeLineId(null);
    deselectAllResources();
    setSelectedConnectionId(null);
    setSelectedWallSubSegment(null);
    setSelectedFreeLineSubSegment(null);

    if (getIsEditingPolygon()) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }
    if (getIsEditingResourcePolygon()) {
        stopResourcePolygonEditing();
    }
    drawAll();
}

/**
 * Manipula o clique em espaço vazio
 */
export function handleEmptySpaceClick(pos, e) {
    const canvas = getCanvas();
    
    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedFreeLineId(null);
    setSelectedExclusionZoneId(null);
    deselectAllResources();
    setSelectedWallSubSegment(null);
    setSelectedFreeLineSubSegment(null);
    
    if (getIsEditingPolygon()) {
        setIsEditingPolygon(false);
        setEditingAreaId(null);
    }
    stopResourcePolygonEditing();
    
    // Desativar modo de criação de abertura se ativo
    if (getCurrentTool() === 'createOpeningBtn') {
        setActiveTool(null);
        
        if (getIsCreatingOpening()) {
            setIsCreatingOpening(false);
            setOpeningPreviewPosition(null);
        }
        if (getIsCreatingOpeningFromOpenings()) {
            stopCreatingOpening();
        }
    }
    
    // O botão esquerdo apenas limpa a seleção. Para navegar, use Espaço + arrastar,
    // botão do meio ou botão direito, evitando confundir o fundo com a área inteira.
    canvas.style.cursor = 'default';
    drawAll();
}

/**
 * Manipula o clique para seleção/arrastar
 */
export function handleSelectionMouseDown(pos, e) {
    const canvas = getCanvas();
    
    // 🎯 PRIORIDADE ABSOLUTA: Verificar cubos de controle ANTES de qualquer outra detecção
    const globalControlPoint = findHoveredControlPointGlobal(pos.x, pos.y);
    if (globalControlPoint) {
        startResizingOpening(globalControlPoint.openingId, globalControlPoint.point, pos.x, pos.y);
        setHoveredControlPoint(globalControlPoint.point);
        setSelectedOpeningId(globalControlPoint.openingId);
        drawAll();
        return;
    }
    
    // 🎯 PRIORIDADE MÁXIMA: Verificar HUBs ANTES de qualquer outro objeto
    const clickedHub = getHubAtPosition(pos.x, pos.y);
    if (clickedHub) {
        setSelectedHubId(clickedHub.id);
        setSelectedConnectionId(null);
        setSelectedAreaId(null);
        setSelectedWallId(null);
        setSelectedFreeLineId(null);
        setSelectedOpeningId(null);
        setSelectedExclusionZoneId(null);
        deselectAllResources();
        
        if (getIsEditingPolygon()) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        if (getIsEditingResourcePolygon()) {
            stopResourcePolygonEditing();
        }
        
        drawAll();
        return;
    }
    
    // Limpar seleção de hub quando clica em outra coisa
    setSelectedHubId(null);
    
    // 🎯 PRIORIDADE ALTA: Verificar handles PPT de ÁREAS (especialmente o handle de rotação que fica FORA da área)
    if (getIsEditingPolygon()) {
        const editingAreaId = getEditingAreaId();
        const editingArea = movementAreas.find(a => a.id === editingAreaId);
        
        if (editingArea) {
            const handleType = getHandleAtPos(pos.x, pos.y, editingArea);
            
            if (handleType) {
                const canvas = getCanvas();
                saveStateToHistory('Editar forma da área');
                
                if (handleType === 'rotate') {
                    // Iniciar rotação
                    setIsRotatingArea(true);
                    const handles = calculatePPTHandles(editingArea);
                    setRotationCenter(handles.center);
                    setVerticesBeforeRotation(editingArea.vertices.map(v => [v[0], v[1]]));
                    
                    // Guardar posições originais dos itens indexados para rotação em tempo real
                    const areaResources = resources.filter(r => r.parentAreaId === editingArea.id);
                    const originalResources = areaResources.map(r => ({
                        id: r.id,
                        vertices: r.vertices ? r.vertices.map(v => [v[0], v[1]]) : null
                    }));
                    setOriginalAreaResourcesBeforeRotation(originalResources);
                    
                    const areaWalls = walls.filter(w => w.parentAreaId === editingArea.id);
                    const originalWalls = areaWalls.map(w => ({
                        id: w.id,
                        startPoint: [w.startPoint[0], w.startPoint[1]],
                        endPoint: [w.endPoint[0], w.endPoint[1]],
                        angle: w.angle
                    }));
                    setOriginalAreaWallsBeforeRotation(originalWalls);
                    
                    const allConnections = getConnections();
                    const areaConnections = allConnections.filter(c => 
                        c.parentAreaId === editingArea.id ||
                        c.parentAreaId == editingArea.id ||
                        c.parentAreaId?.toString() === editingArea.id?.toString()
                    );
                    const originalConnections = areaConnections.map(c => ({
                        id: c.id,
                        path: c.path ? c.path.map(p => ({x: p.x, y: p.y})) : null,
                        points: c.points ? c.points.map(p => ({x: p.x, y: p.y})) : null
                    }));
                    setOriginalAreaConnectionsBeforeRotation(originalConnections);
                    
                    // Guardar posições originais dos hubs dos recursos
                    const originalResourceHubs = new Map();
                    for (const resource of areaResources) {
                        const hubs = getHubsForResource(resource.id) || [];
                        if (hubs.length > 0) {
                            originalResourceHubs.set(resource.id, hubs.map(hub => ({
                                id: hub.id,
                                localX: hub.localX,
                                localY: hub.localY,
                                normalX: hub.normalX,
                                normalY: hub.normalY
                            })));
                        }
                    }
                    setOriginalAreaResourceHubsBeforeRotation(originalResourceHubs);
                    
                    // Guardar posições originais das aberturas da área
                    const areaOpenings = allOpenings.filter(o => {
                        if (o.wallBefore) {
                            const wb = walls.find(w => w.id === o.wallBefore);
                            if (wb && wb.parentAreaId === editingArea.id) return true;
                        }
                        if (o.wallAfter) {
                            const wa = walls.find(w => w.id === o.wallAfter);
                            if (wa && wa.parentAreaId === editingArea.id) return true;
                        }
                        return false;
                    });
                    const originalOpenings = areaOpenings.map(o => ({
                        id: o.id,
                        startPoint: [o.startPoint[0], o.startPoint[1]],
                        endPoint: [o.endPoint[0], o.endPoint[1]],
                        outwardNormal: o.outwardNormal ? { x: o.outwardNormal.x, y: o.outwardNormal.y } : null
                    }));
                    setOriginalAreaOpeningsBeforeRotation(originalOpenings);
                    
                    // Calcular ângulo inicial
                    const startAngle = Math.atan2(pos.y - handles.center.y, pos.x - handles.center.x);
                    setRotationStartAngle(startAngle);
                    canvas.style.cursor = 'grabbing';
                } else {
                    // Iniciar redimensionamento
                    setActiveResizeHandle(handleType);
                    setOriginalVerticesOnDrag(editingArea.vertices.map(v => [v[0], v[1]]));
                    canvas.style.cursor = getHandleCursor(handleType, editingArea);
                }
                
                return; // Handle encontrado, não processar mais nada
            }
        }
    }
    
    // 🎯 PRIORIDADE ALTA: Verificar handles PPT de RECURSOS (especialmente o handle de rotação que fica FORA do recurso)
    if (getIsEditingResourcePolygon()) {
        const editingResourceId = getEditingResourceId();
        const editingResource = resources.find(r => r.id === editingResourceId);
        
        if (editingResource) {
            const migratedResource = migrateResourceToPolygonal(editingResource);
            // skipValidation=true porque já validamos que estamos editando este recurso
            const handleType = getResourceHandleAtPos(pos.x, pos.y, migratedResource, true);
            
            if (handleType) {
                const canvas = getCanvas();
                saveStateToHistory('Editar forma do recurso');
                
                if (handleType === 'rotate') {
                    // Iniciar rotação
                    setIsRotatingResource(true);
                    const handles = calculateResourcePPTHandles(migratedResource);
                    setResourceRotationCenter(handles.center);
                    setResourceVerticesBeforeRotation(migratedResource.vertices.map(v => [v[0], v[1]]));
                    
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
                    
                    // Calcular ângulo inicial
                    const startAngle = Math.atan2(pos.y - handles.center.y, pos.x - handles.center.x);
                    setResourceRotationStartAngle(startAngle);
                    setCurrentResourceRotationAngle(0);
                    canvas.style.cursor = 'crosshair';
                } else {
                    // Iniciar redimensionamento (corner ou edge)
                    setActiveResourceResizeHandle(handleType);
                    setOriginalResourceVerticesOnDrag(migratedResource.vertices.map(v => [v[0], v[1]]));
                    
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
                }
                
                drawAll();
                return; // Handle encontrado, não processar mais nada
            }
        }
    }
    
    // 🎯 PRIORIDADE: Verificar handles de zona de exclusão (se selecionada)
    const currentExclusionZoneId = getSelectedExclusionZoneId();
    if (currentExclusionZoneId) {
        const selectedZone = exclusionZones.find(z => z.id === currentExclusionZoneId);
        if (selectedZone) {
            const scale = getScale();
            const handle = getExclusionZoneHandleAtPos(pos.x, pos.y, selectedZone, scale);
            if (handle) {
                saveStateToHistory('Redimensionar zona de exclusão');
                setActiveExclusionZoneResizeHandle(handle);
                setExclusionZoneOriginalStart([selectedZone.startPoint[0], selectedZone.startPoint[1]]);
                setExclusionZoneOriginalEnd([selectedZone.endPoint[0], selectedZone.endPoint[1]]);
                canvas.style.cursor = getExclusionZoneHandleCursor(handle);
                return;
            }
        }
    }

    // 🎯 PRIORIDADE: Verificar recursos ANTES das áreas
    const clickedResource = findResourceAtPosition(pos.x, pos.y);
    const clickedArea = getAreaAtPos(pos);
    const clickedWall = findWallAtPos(pos.x, pos.y);
    const clickedFreeLine = findFreeLineAtPosition(pos.x, pos.y);
    const clickedOpening = findOpeningAtPosition(pos.x, pos.y);
    const clickedConnection = getConnectionAtPosition(pos.x, pos.y);
    const clickedExclusionZone = findStandaloneExclusionZoneAtPoint(pos.x, pos.y);
    
    // 🎯 PRIORIDADE: Abertura tem prioridade máxima
    if (clickedOpening) {
        handleOpeningClick(clickedOpening);
        return;
    } else if (clickedFreeLine) {
        handleFreeLineClick(clickedFreeLine, [pos.x, pos.y]);
        return;
    } else if (clickedResource) {
        handleResourceClick(clickedResource, pos);
        return;
    } else if (clickedConnection) {
        handleConnectionClick(clickedConnection);
        return;
    } else if (clickedWall) {
        handleWallClick(clickedWall, pos);
    } else if (clickedExclusionZone) {
        handleExclusionZoneClick(clickedExclusionZone, pos);
        return;
    } else if (clickedArea) {
        handleAreaClick(clickedArea, pos);
    } else {
        handleEmptySpaceClick(pos, e);
    }
}
