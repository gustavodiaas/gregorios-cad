import { Tool } from './Tool.js';
import { 
    getMousePos, getAreaAtPos 
} from '../events/mouseUtils.js';
import { findWallAtPosition } from '../openings.js';
import { findResourceAtPosition } from '../resources.js';
import { getConnectionAtPosition } from '../connections.js';
import { getHubAtPosition } from '../hubs.js';
import { findFreeLineAtPosition } from '../free-lines.js';
import { 
    setSelectedAreaId, setSelectedWallId, setSelectedResourceId, 
    setSelectedConnectionId, setSelectedHubId, 
    setHoveredConnectionId, getHoveredConnectionId,
    setHoveredHubId, getHoveredHubId,
    setHoveredResourceId, getHoveredResourceId,
    setHoveredWallId, getHoveredWallId,
    getIsEditingPolygon, setIsEditingPolygon, 
    setEditingAreaId, getIsEditingResourcePolygon, setEditingResourceId,
    isResourceSelected,
    getIsCtrlPressed,
    getCanvas,
    isPanning, setIsPanning, setPanStart,
    isRightMouseDown, setIsRightMouseDown, setRightMouseStartPos, getRightMouseStartPos,
    setDidRightMouseDrag, getDidRightMouseDrag, getRightClickDragThreshold,
    setSelectedWallSubSegment, setHoveredWallSubSegment,
    setSelectedFreeLineSubSegment, setHoveredFreeLineSubSegment,
    getHoveredFreeLineId, setHoveredFreeLineId,
    setSelectedFreeLineId
} from '../state.js';
import { computeSubSegment } from '../utils/segment-split.js';
import { 
    setResourceSelection, addResourceToSelection, stopResourcePolygonEditing 
} from '../resources.js';
import { showContextMenuForArea } from '../showcontextmenu/showcontextmenuforarea.js';
import { showContextMenuForResource } from '../showcontextmenu/showcontextmenuforresource.js';
import { showContextMenuForWall } from '../showcontextmenu/showcontextmenuforwall.js';
import { showContextMenuForConnection } from '../showcontextmenu/showcontextmenuforconnection.js';
import { showContextMenuForFreeLine } from '../showcontextmenu/showcontextmenuforfreeline.js';
import { hideContextMenu } from '../events/contextMenuUtils.js';
import { handlePanMove } from '../events/handlers/panZoomHandlers.js';
import { drawAll } from '../drawing.js';

// NOTA: Estado de hover agora vem do state centralizado (resourceState.js e selectionState.js)
// getHoveredResourceId/setHoveredResourceId -> resourceState.js
// getHoveredWallId/setHoveredWallId -> selectionState.js

export class SelectTool extends Tool {
    constructor() {
        super();
        this.name = 'SelectTool';
    }

    onMouseDown(e) {
        const pos = getMousePos(e);
        
        // Handle context menu hiding
        hideContextMenu();

        // Right click - iniciar tracking para pan ou context menu
        if (e.button === 2) {
            setIsRightMouseDown(true);
            setRightMouseStartPos({ x: e.clientX, y: e.clientY });
            setDidRightMouseDrag(false);
            return;
        }

        // Left click selection logic - HUBS TÊM PRIORIDADE MÁXIMA
        const clickedHub = getHubAtPosition(pos.x, pos.y);
        
        if (clickedHub) {
            // Hub selecionado - tem prioridade sobre TUDO
            setSelectedHubId(clickedHub.id);
            setSelectedConnectionId(null);
            setSelectedResourceId(null);
            setSelectedAreaId(null);
            setSelectedWallId(null);
            setResourceSelection([], { primaryId: null });
            
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            if (getIsEditingResourcePolygon()) {
                stopResourcePolygonEditing();
            }
            
            drawAll();
            return; // Sair imediatamente - hub tem prioridade
        }
        
        // Se não clicou em hub, verificar outros objetos
        const clickedConnection = getConnectionAtPosition(pos.x, pos.y);
        const clickedResource = findResourceAtPosition(pos.x, pos.y);
        const clickedWall = findWallAtPosition(pos.x, pos.y);
        const clickedFreeLine = findFreeLineAtPosition(pos.x, pos.y);
        const clickedArea = getAreaAtPos(pos);
        
        // Limpar seleção de hub
        setSelectedHubId(null);

        if (clickedConnection) {
            setSelectedConnectionId(clickedConnection.id);
            setSelectedResourceId(null);
            setSelectedAreaId(null);
            setSelectedWallId(null);
            
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            if (getIsEditingResourcePolygon()) {
                stopResourcePolygonEditing();
            }
        } else if (clickedFreeLine) {
            setSelectedFreeLineId(clickedFreeLine.id);
            setSelectedWallId(null);
            setSelectedAreaId(null);
            setSelectedResourceId(null);
            setSelectedConnectionId(null);
            setResourceSelection([], { primaryId: null });

            const clickPt = [pos.x, pos.y];
            if (!clickedFreeLine.shapeType || clickedFreeLine.shapeType === 'line') {
                const sub = computeSubSegment(clickedFreeLine, clickPt, 'freeline');
                setSelectedFreeLineSubSegment(sub);
            } else {
                setSelectedFreeLineSubSegment(null);
            }
            setSelectedWallSubSegment(null);

            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            if (getIsEditingResourcePolygon()) {
                stopResourcePolygonEditing();
            }
        } else if (clickedResource) {
            const alreadySelected = isResourceSelected(clickedResource.id);
            if (!alreadySelected) {
                if (getIsCtrlPressed()) {
                     addResourceToSelection(clickedResource.id, { makePrimary: true });
                } else {
                    setResourceSelection([clickedResource.id], { primaryId: clickedResource.id });
                }
            } else {
                if (getIsCtrlPressed()) {
                    addResourceToSelection(clickedResource.id, { makePrimary: true });
                }
            }
            
            setSelectedAreaId(null);
            setSelectedWallId(null);
            setSelectedConnectionId(null);
            
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            if (getIsEditingResourcePolygon() && getEditingResourceId() !== clickedResource.id) {
                stopResourcePolygonEditing();
            }
        } else if (clickedWall) {
            setSelectedWallId(clickedWall.wall.id);
            setSelectedAreaId(null);
            setSelectedResourceId(null);
            setSelectedConnectionId(null);
            setSelectedFreeLineId(null);
            
            // Calcular sub-segmento baseado em interseções
            const wallObj = clickedWall.wall;
            const clickPt = [pos.x, pos.y];
            const sub = computeSubSegment(wallObj, clickPt, 'wall');
            setSelectedWallSubSegment(sub);
            setSelectedFreeLineSubSegment(null);
            
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            if (getIsEditingResourcePolygon()) {
                stopResourcePolygonEditing();
            }
        } else if (clickedArea) {
            setSelectedAreaId(clickedArea.id);
            setSelectedWallId(null);
            setSelectedResourceId(null);
            setSelectedConnectionId(null);
            
            if (getIsEditingPolygon() && getEditingAreaId() !== clickedArea.id) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            if (getIsEditingResourcePolygon()) {
                stopResourcePolygonEditing();
            }
        } else {
            // Clicked on empty space
            setSelectedAreaId(null);
            setSelectedWallId(null);
            setSelectedResourceId(null);
            setSelectedConnectionId(null);
            setSelectedFreeLineId(null);
            setResourceSelection([], { primaryId: null });
            setSelectedWallSubSegment(null);
            setSelectedFreeLineSubSegment(null);
            
            if (getIsEditingPolygon()) {
                setIsEditingPolygon(false);
                setEditingAreaId(null);
            }
            if (getIsEditingResourcePolygon()) {
                stopResourcePolygonEditing();
            }
        }
    }

    onContextMenu(e) {
        e.preventDefault();
        // O menu de contexto é exibido no onMouseUp baseado em se houve drag ou não
    }

    handleRightClick(e, pos) {
        const clickedResource = findResourceAtPosition(pos.x, pos.y);
        const clickedFreeLine = findFreeLineAtPosition(pos.x, pos.y);
        const clickedArea = getAreaAtPos(pos);
        const clickedWall = findWallAtPosition(pos.x, pos.y);
        const clickedConnection = getConnectionAtPosition(pos.x, pos.y);

        if (clickedConnection) {
            setSelectedConnectionId(clickedConnection.id);
            showContextMenuForConnection(clickedConnection, e.clientX, e.clientY, e);
        } else if (clickedFreeLine) {
            setSelectedFreeLineId(clickedFreeLine.id);
            setSelectedResourceId(null);
            setSelectedAreaId(null);
            setSelectedWallId(null);
            setSelectedConnectionId(null);
            setResourceSelection([], { primaryId: null });
            showContextMenuForFreeLine(clickedFreeLine, e);
        } else if (clickedResource) {
            const alreadySelected = isResourceSelected(clickedResource.id);
            if (!alreadySelected) {
                setResourceSelection([clickedResource.id], { primaryId: clickedResource.id });
            }
            showContextMenuForResource(clickedResource, pos.x, pos.y, e);
        } else if (clickedWall) {
            setSelectedWallId(clickedWall.wall.id);
            // Calcular sub-segmento para o menu de contexto
            const wallObj = clickedWall.wall;
            const clickPt = [pos.x, pos.y];
            const sub = computeSubSegment(wallObj, clickPt, 'wall');
            setSelectedWallSubSegment(sub);
            showContextMenuForWall(clickedWall.wall, pos.x, pos.y, e);
        } else if (clickedArea) {
            setSelectedAreaId(clickedArea.id);
            showContextMenuForArea(clickedArea, pos.x, pos.y, e);
        }
    }

    onMouseMove(e) {
        const pos = getMousePos(e);
        const canvas = getCanvas();
        
        // Verificar se botão direito está pressionado - possível pan
        if (isRightMouseDown) {
            const startPos = getRightMouseStartPos();
            const dx = e.clientX - startPos.x;
            const dy = e.clientY - startPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (!isPanning && distance > getRightClickDragThreshold()) {
                setDidRightMouseDrag(true);
                setIsPanning(true);
                setPanStart({ x: e.clientX, y: e.clientY });
                canvas.style.cursor = 'grabbing';
            }
        }
        
        if (isPanning) {
            handlePanMove(e);
            return;
        }
        let needsRedraw = false;
        let newCursor = 'default';
        
        // Verificar hover na ordem de prioridade: Hub > Conexão > Recurso > Parede
        const hoveredHub = getHubAtPosition(pos.x, pos.y);
        const currentHoveredHubId = getHoveredHubId();
        
        if (hoveredHub) {
            // Hub tem hover - prioridade máxima
            if (currentHoveredHubId !== hoveredHub.id) {
                setHoveredHubId(hoveredHub.id);
                needsRedraw = true;
            }
            // Limpar outros hovers
            if (getHoveredConnectionId()) {
                setHoveredConnectionId(null);
                needsRedraw = true;
            }
            if (getHoveredResourceId()) {
                setHoveredResourceId(null);
                needsRedraw = true;
            }
            if (getHoveredWallId()) {
                setHoveredWallId(null);
                needsRedraw = true;
            }
            newCursor = 'pointer';
        } else {
            // Não está sobre hub - limpar hover de hub
            if (currentHoveredHubId) {
                setHoveredHubId(null);
                needsRedraw = true;
            }
            
            // Verificar conexão
            const hoveredConnection = getConnectionAtPosition(pos.x, pos.y);
            const currentHoveredConnId = getHoveredConnectionId();
            
            if (hoveredConnection) {
                if (currentHoveredConnId !== hoveredConnection.id) {
                    setHoveredConnectionId(hoveredConnection.id);
                    needsRedraw = true;
                }
                // Limpar outros hovers
                if (getHoveredResourceId()) {
                    setHoveredResourceId(null);
                    needsRedraw = true;
                }
                if (getHoveredWallId()) {
                    setHoveredWallId(null);
                    needsRedraw = true;
                }
                newCursor = 'pointer';
            } else {
                if (currentHoveredConnId) {
                    setHoveredConnectionId(null);
                    needsRedraw = true;
                }
                
                // Verificar recurso
                const hoveredResource = findResourceAtPosition(pos.x, pos.y);
                
                if (hoveredResource) {
                    if (getHoveredResourceId() !== hoveredResource.id) {
                        setHoveredResourceId(hoveredResource.id);
                        needsRedraw = true;
                    }
                    if (getHoveredWallId()) {
                        setHoveredWallId(null);
                        needsRedraw = true;
                    }
                    newCursor = 'pointer';
                } else {
                    if (getHoveredResourceId()) {
                        setHoveredResourceId(null);
                        needsRedraw = true;
                    }
                    
                    // Verificar parede
                    const hoveredWall = findWallAtPosition(pos.x, pos.y);
                    
                    if (hoveredWall) {
                        if (getHoveredWallId() !== hoveredWall.wall.id) {
                            setHoveredWallId(hoveredWall.wall.id);
                            needsRedraw = true;
                        }
                        // Calcular sub-segmento hover para parede
                        const wallObj = hoveredWall.wall;
                        const hoverPt = [pos.x, pos.y];
                        const sub = computeSubSegment(wallObj, hoverPt, 'wall');
                        setHoveredWallSubSegment(sub);
                        // Limpar hover de linha livre
                        if (getHoveredFreeLineId()) {
                            setHoveredFreeLineId(null);
                            setHoveredFreeLineSubSegment(null);
                        }
                        newCursor = 'pointer';
                    } else {
                        if (getHoveredWallId()) {
                            setHoveredWallId(null);
                            setHoveredWallSubSegment(null);
                            needsRedraw = true;
                        }
                        
                        // Verificar linha livre
                        const hoveredLine = findFreeLineAtPosition(pos.x, pos.y);
                        
                        if (hoveredLine) {
                            if (getHoveredFreeLineId() !== hoveredLine.id) {
                                setHoveredFreeLineId(hoveredLine.id);
                                needsRedraw = true;
                            }
                            // Calcular sub-segmento hover para linha livre
                            if (!hoveredLine.shapeType || hoveredLine.shapeType === 'line') {
                                const hoverPt = [pos.x, pos.y];
                                const sub = computeSubSegment(hoveredLine, hoverPt, 'freeline');
                                setHoveredFreeLineSubSegment(sub);
                            } else {
                                setHoveredFreeLineSubSegment(null);
                            }
                            newCursor = 'pointer';
                        } else {
                            if (getHoveredFreeLineId()) {
                                setHoveredFreeLineId(null);
                                setHoveredFreeLineSubSegment(null);
                                needsRedraw = true;
                            }
                        }
                    }
                }
            }
        }
        
        // Atualizar cursor
        if (canvas) {
            canvas.style.cursor = newCursor;
        }
        
        // Redesenhar se hover mudou
        if (needsRedraw) {
            drawAll();
        }
    }

    onMouseUp(e) {
        const canvas = getCanvas();
        
        // Tratamento do botão direito: pan ou context menu
        if (e.button === 2) {
            const wasPanning = isPanning;
            const didDrag = getDidRightMouseDrag();
            
            if (wasPanning) {
                setIsPanning(false);
            }
            setIsRightMouseDown(false);
            
            if (didDrag) {
                // Houve drag - era pan, restaurar cursor
                canvas.style.cursor = 'default';
            } else {
                // Não houve drag - abrir context menu
                const pos = getMousePos(e);
                this.handleRightClick(e, pos);
            }
            
            setDidRightMouseDrag(false);
            return;
        }
        
        // Middle button pan end
        if (isPanning) {
            setIsPanning(false);
            canvas.style.cursor = 'default';
            return;
        }
        
        // Implement drag end logic here
    }
    
    deactivate() {
        super.deactivate();
        // Limpar todos os hovers ao desativar a tool
        setHoveredHubId(null);
        setHoveredConnectionId(null);
        setHoveredResourceId(null);
        setHoveredWallId(null);
        setHoveredFreeLineId(null);
        setHoveredWallSubSegment(null);
        setHoveredFreeLineSubSegment(null);
    }
}
