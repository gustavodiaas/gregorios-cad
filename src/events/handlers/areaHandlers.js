/**
 * Handlers para eventos de mouse relacionados a áreas de movimentação
 */
import { 
    selectedAreaId, movementAreas, activeGuideLines,
    getCanvas, setSelectedAreaId, setSelectedWallId,
    setIsDragging, setOffsetX, setOffsetY, setDragStartX, setDragStartY,
    getHoveredAreaVirtualDimensions, setHoveredAreaVirtualDimensions,
    getIsAreaHoverActive, setIsAreaHoverActive,
    getIsEditingPolygon, setIsEditingPolygon, getEditingAreaId, setEditingAreaId,
    setDraggingMidpointIndex, setOriginalVerticesOnDrag, setSelectedConnectionId, setSelectedFreeLineId,
    setSelectedExclusionZoneId,
    getActiveResizeHandle, setActiveResizeHandle,
    getIsRotatingArea, setIsRotatingArea,
    setRotationStartAngle, setRotationCenter, setVerticesBeforeRotation,
    setHoveredResizeHandle, getHoveredResizeHandle,
    resources, walls,
    getConnections, getScale,
    setOriginalAreaResourcesBeforeRotation,
    setOriginalAreaWallsBeforeRotation,
    setOriginalAreaConnectionsBeforeRotation,
    setOriginalAreaResourceHubsBeforeRotation
} from '../../state.js';
import { setSelectedOpeningId } from '../../openings.js';
import { saveStateToHistory } from '../../history.js';
import { drawAll } from '../../drawing.js';
import { deselectAllResources, stopResourcePolygonEditing } from '../../resources.js';
import { getHubsForResource } from '../../hubs.js';
import { getMidpointAtPos, getMidpointCursor, getHandleAtPos, getHandleCursor, calculatePPTHandles } from '../../polygon.js';
import { snapToGrid, getAlignmentGuides } from '../mouseUtils.js';
import { updateAreaPosition, calculateMaxAllowedMovement } from '../utils/movementUtils.js';
import { calculateBoundingBox } from '../../areas.js';

const AREA_DRAG_EDGE_TOLERANCE_PX = 14;

function distanceToSegment(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0
        ? Math.max(0, Math.min(1, ((point.x - start[0]) * dx + (point.y - start[1]) * dy) / lengthSquared))
        : 0;
    return Math.hypot(point.x - (start[0] + dx * t), point.y - (start[1] + dy * t));
}

function isPointNearAreaBoundary(area, point) {
    const vertices = area?.vertices?.length >= 2
        ? area.vertices
        : [
            [area.x, area.y],
            [area.x + area.width, area.y],
            [area.x + area.width, area.y + area.height],
            [area.x, area.y + area.height]
        ];
    const tolerance = AREA_DRAG_EDGE_TOLERANCE_PX / Math.max(getScale(), 0.1);
    return vertices.some((vertex, index) => (
        distanceToSegment(point, vertex, vertices[(index + 1) % vertices.length]) <= tolerance
    ));
}

/**
 * Manipula o clique para criar área
 */
export function handleCreateAreaMouseDown(pos, e, { currentRect, setIsDrawing, setStartX, setStartY }) {
    const canvas = getCanvas();

    setIsDrawing(true);
    setStartX(pos.x);
    setStartY(pos.y);
    setDragStartX(pos.x);
    setDragStartY(pos.y);

    currentRect.x = pos.x;
    currentRect.y = pos.y;
    currentRect.width = 0;
    currentRect.height = 0;

    canvas.style.cursor = 'crosshair';
    drawAll();

    if (e) {
        setTimeout(() => {
            const event = new MouseEvent('mousemove', {
                clientX: e.clientX,
                clientY: e.clientY
            });
            canvas.dispatchEvent(event);
        }, 1);
    }
}

/**
 * Manipula o clique em área
 */
export function handleAreaClick(clickedArea, pos) {
    const canvas = getCanvas();
    stopResourcePolygonEditing();
    setSelectedFreeLineId(null);
    setSelectedExclusionZoneId(null);
    
    // Verificar se estamos em modo de edição de polígono (handles estilo PowerPoint)
    if (getIsEditingPolygon() && getEditingAreaId() === clickedArea.id) {
        // Verificar se clicou em algum handle
        const handleType = getHandleAtPos(pos.x, pos.y, clickedArea);
        
        if (handleType) {
            saveStateToHistory('Editar forma da área');
            
            if (handleType === 'rotate') {
                // Iniciar rotação
                setIsRotatingArea(true);
                const handles = calculatePPTHandles(clickedArea);
                setRotationCenter(handles.center);
                setVerticesBeforeRotation(clickedArea.vertices.map(v => [v[0], v[1]]));
                
                // Guardar posições originais dos itens indexados para rotação em tempo real
                const areaResources = resources.filter(r => r.parentAreaId === clickedArea.id);
                const originalResources = areaResources.map(r => ({
                    id: r.id,
                    vertices: r.vertices ? r.vertices.map(v => [v[0], v[1]]) : null
                }));
                setOriginalAreaResourcesBeforeRotation(originalResources);
                
                const areaWalls = walls.filter(w => w.parentAreaId === clickedArea.id);
                const originalWalls = areaWalls.map(w => ({
                    id: w.id,
                    startPoint: [w.startPoint[0], w.startPoint[1]],
                    endPoint: [w.endPoint[0], w.endPoint[1]],
                    angle: w.angle
                }));
                setOriginalAreaWallsBeforeRotation(originalWalls);
                
                const allConnections = getConnections();
                const areaConnections = allConnections.filter(c => 
                    c.parentAreaId === clickedArea.id ||
                    c.parentAreaId == clickedArea.id ||
                    c.parentAreaId?.toString() === clickedArea.id?.toString()
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
                
                // Calcular ângulo inicial
                const startAngle = Math.atan2(pos.y - handles.center.y, pos.x - handles.center.x);
                setRotationStartAngle(startAngle);
                canvas.style.cursor = 'grabbing';
            } else {
                // Iniciar redimensionamento
                setActiveResizeHandle(handleType);
                setOriginalVerticesOnDrag(clickedArea.vertices.map(v => [v[0], v[1]]));
                canvas.style.cursor = getHandleCursor(handleType, clickedArea);
            }
            
            if (getIsAreaHoverActive()) {
                setHoveredAreaVirtualDimensions(null);
                setIsAreaHoverActive(false);
            }
            
            return;
        }
        
        // Compatibilidade com sistema antigo de midpoints
        const midpointIndex = getMidpointAtPos(pos.x, pos.y, clickedArea);
        if (midpointIndex !== -1) {
            saveStateToHistory('Editar forma da área');
            setDraggingMidpointIndex(midpointIndex);
            setOriginalVerticesOnDrag(clickedArea.vertices.map(v => [v[0], v[1]]));
            
            if (getIsAreaHoverActive()) {
                setHoveredAreaVirtualDimensions(null);
                setIsAreaHoverActive(false);
            }
            
            canvas.style.cursor = getMidpointCursor(clickedArea, midpointIndex);
            return;
        }
    }
    
    if (selectedAreaId === clickedArea.id && !clickedArea.locked && isPointNearAreaBoundary(clickedArea, pos)) {
        // A área inteira só pode ser movida pela borda, evitando arrastes acidentais do layout.
        saveStateToHistory('Mover área');
        setIsDragging(true);
        setOffsetX(pos.x - clickedArea.x);
        setOffsetY(pos.y - clickedArea.y);
        setDragStartX(pos.x);
        setDragStartY(pos.y);
        
        if (getIsAreaHoverActive()) {
            setHoveredAreaVirtualDimensions(null);
            setIsAreaHoverActive(false);
        }
        
        canvas.style.cursor = 'grabbing';
    } else {
        // Selecionar área
        setSelectedAreaId(clickedArea.id);
        setSelectedWallId(null);
        setSelectedOpeningId(null);
        deselectAllResources();
        
        if (getIsEditingPolygon() && getEditingAreaId() !== clickedArea.id) {
            setIsEditingPolygon(false);
            setEditingAreaId(null);
        }
        drawAll();
    }
}

/**
 * Manipula o movimento durante criação de área
 */
export function handleCreateAreaMove(pos, { currentRect, startX, startY }) {
    currentRect.width = pos.x - startX;
    currentRect.height = pos.y - startY;
    drawAll(false);
}

/**
 * Manipula o arraste de área
 */
export function handleAreaDrag(pos, { offsetX, offsetY }) {
    const selectedArea = movementAreas.find(a => a.id === selectedAreaId);
    if (selectedArea && !selectedArea.locked) {
        const rawPotentialX = pos.x - offsetX;
        const rawPotentialY = pos.y - offsetY;
        
        const snapped = snapToGrid(rawPotentialX, rawPotentialY);
        let finalX = snapped.x;
        let finalY = snapped.y;
        
        // Código de guias de alinhamento
        const guides = getAlignmentGuides(selectedArea, finalX, finalY);
        activeGuideLines.length = 0;
        
        guides.forEach(guide => {
            if (guide.type === 'horizontal' && guide.snapY !== undefined) {
                finalY = guide.snapY;
                activeGuideLines.push({ type: 'horizontal', position: guide.value, start: -1000, end: 1000 });
            } else if (guide.type === 'vertical' && guide.snapX !== undefined) {
                finalX = guide.snapX;
                activeGuideLines.push({ type: 'vertical', position: guide.value, start: -1000, end: 1000 });
            }
        });

        const desiredDeltaX = finalX - selectedArea.x;
        const desiredDeltaY = finalY - selectedArea.y;

        // Calcula o movimento máximo permitido com a lógica corrigida
        const allowedMovement = calculateMaxAllowedMovement(selectedArea, desiredDeltaX, desiredDeltaY);
        
        // Aplica o movimento permitido diretamente
        if (Math.abs(allowedMovement.dx) > 0.01 || Math.abs(allowedMovement.dy) > 0.01) {
            updateAreaPosition(selectedArea, allowedMovement.dx, allowedMovement.dy);
        }
        
        drawAll();
    }
}

/**
 * Manipula o cursor para áreas
 */
export function handleAreaCursor(pos, hoveredArea, { getIsCtrlPressed, getCurrentTool }) {
    const canvas = getCanvas();
    const activeTool = getCurrentTool();
    
    // Check for Ctrl key first - show hand cursor for panning
    if (getIsCtrlPressed()) {
        canvas.style.cursor = 'grab';
        return;
    }
    
    // Não alterar cursor se ferramenta de conexão estiver ativa
    if (activeTool === 'createConnectionBtn') {
        return;
    }
    
    if (getIsEditingPolygon() && getEditingAreaId() === hoveredArea.id) {
        // Verificar handles estilo PowerPoint
        const handleType = getHandleAtPos(pos.x, pos.y, hoveredArea);
        
        if (handleType) {
            // Atualizar hover do handle
            if (getHoveredResizeHandle() !== handleType) {
                setHoveredResizeHandle(handleType);
                drawAll();
            }
            canvas.style.cursor = getHandleCursor(handleType, hoveredArea);
            return;
        }
        
        // Limpar hover se não está sobre nenhum handle
        if (getHoveredResizeHandle() !== null) {
            setHoveredResizeHandle(null);
            drawAll();
        }
        
        // Compatibilidade com midpoints
        const midpointIndex = getMidpointAtPos(pos.x, pos.y, hoveredArea);
        if (midpointIndex !== -1) {
            const { getHoveredMidpointIndex, setHoveredMidpointIndex } = require('../../state.js');
            if (getHoveredMidpointIndex() !== midpointIndex) {
                setHoveredMidpointIndex(midpointIndex);
                drawAll();
            }
            canvas.style.cursor = getMidpointCursor(hoveredArea, midpointIndex);
        } else {
            const { getHoveredMidpointIndex, setHoveredMidpointIndex } = require('../../state.js');
            if (getHoveredMidpointIndex() !== null) {
                setHoveredMidpointIndex(null);
                drawAll();
            }
            canvas.style.cursor = selectedAreaId === hoveredArea.id && isPointNearAreaBoundary(hoveredArea, pos) ? 'grab' : 'pointer';
        }
    } else {
        // Limpar hover quando não está em modo de edição
        if (getHoveredResizeHandle() !== null) {
            setHoveredResizeHandle(null);
        }
        canvas.style.cursor = selectedAreaId === hoveredArea.id && isPointNearAreaBoundary(hoveredArea, pos) ? 'grab' : 'pointer';
    }
}
