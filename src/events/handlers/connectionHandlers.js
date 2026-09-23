/**
 * Handlers para eventos de mouse relacionados a conexões
 */
import { 
    getCanvas,
    setSelectedAreaId, setSelectedWallId, setSelectedConnectionId, setSelectedFreeLineId,
    setSelectedExclusionZoneId,
    getIsDrawingConnection, getIsConnectionMousePressed, setIsConnectionMousePressed,
    getActiveConnectionStairGroup, setActiveConnectionStairGroup,
    getIsEditingPolygon, setIsEditingPolygon, setEditingAreaId,
    getIsEditingResourcePolygon, getHoveredConnectionId, setHoveredConnectionId
} from '../../state.js';
import { setSelectedOpeningId } from '../../openings.js';
import { drawAll } from '../../drawing.js';
import { deselectAllResources, stopResourcePolygonEditing } from '../../resources.js';
import { 
    startCreatingConnection,
    finishConnection,
    addConnectionPoint,
    getConnectionAtPosition
} from '../../connections.js';
import { transitionConnectionThroughStair } from '../../stairs.js';

/**
 * Manipula o clique para criar conexão
 */
export function handleCreateConnectionMouseDown(pos) {
    setActiveConnectionStairGroup(null);
    if (!getIsDrawingConnection()) {
        // Iniciar nova conexão
        startCreatingConnection(pos.x, pos.y);
    }
    // Marcar que o mouse está pressionado para desenho livre
    setIsConnectionMousePressed(true);
    drawAll();
}

/**
 * Manipula o movimento durante criação de conexão
 */
export function handleCreateConnectionMove(pos) {
    // Usar o sistema novo de addConnectionPoint que suporta desenho manual e hubs
    if (getIsDrawingConnection()) {
        // Tentar fazer a transição através da escada
        // Se não houver transição (transitioned = false), continua o drawing normal
        const transitioned = transitionConnectionThroughStair({ x: pos.x, y: pos.y });
        if (!transitioned) {
            // Continuar adicionando pontos normalmente se não estiver em transição
            addConnectionPoint(pos.x, pos.y);
        }
    }
}

/**
 * Manipula o mouseup durante criação de conexão
 */
export function handleCreateConnectionMouseUp(pos) {
    // Parar o desenho livre (soltar o "pincel")
    setIsConnectionMousePressed(false);
    setActiveConnectionStairGroup(null);
    
    // Finalizar conexão
    if (getIsDrawingConnection()) {
        finishConnection();
        
        // Manter cursor crosshair para permitir criar outra conexão
        getCanvas().style.cursor = 'crosshair';
    }
}

/**
 * Manipula o clique em conexão
 */
export function handleConnectionClick(clickedConnection) {
    setSelectedConnectionId(clickedConnection.id);
    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
    setSelectedFreeLineId(null);
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
}

/**
 * Atualiza o hover sobre conexões
 */
export function updateConnectionHover(pos) {
    const connection = getConnectionAtPosition(pos.x, pos.y);
    const currentHoveredId = getHoveredConnectionId();
    
    if (connection) {
        if (currentHoveredId !== connection.id) {
            setHoveredConnectionId(connection.id);
            drawAll(false);
        }
    } else {
        if (currentHoveredId !== null) {
            setHoveredConnectionId(null);
            drawAll(false);
        }
    }
}
