import { Tool } from './Tool.js';
import { 
    getCanvas, 
    getIsDrawingConnection,
    setIsConnectionMousePressed,
    setActiveConnectionStairGroup,
    setHoveredConnectionId,
    getHoveredConnectionId,
    activateHubPlacementMode,
    deactivateHubPlacementMode,
    updateHubPreview,
    clearHubPreview,
    getHubPreviewPosition,
    getHubPlacementTargetResource,
    getIsHubPlacementActive,
    isPanning
} from '../state.js';
import { getMousePos } from '../events/mouseUtils.js';
import { 
    startCreatingConnection,
    finishConnection,
    addConnectionPoint,
    cancelConnectionCreation,
    getConnectionAtPosition
} from '../connections.js';
import { transitionConnectionThroughStair } from '../stairs.js';
import { drawAll } from '../drawing.js';
import { 
    calculateValidHubPosition, 
    findResourceUnderCursor,
    findNearestResourceToCursor,
    findNearestDockTarget
} from '../hub-placement-helper.js';
import { createHubForBoundaryOpening } from '../hubs.js';

export class ConnectionTool extends Tool {
    constructor() {
        super();
        this.name = 'ConnectionTool';
        /** @type {Object|null} Hub de doca sendo alvo para início/fim de conexão */
        this._dockTarget = null;
    }

    activate() {
        super.activate();
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'default';
        }
        
        // Ativar modo de posicionamento de hub para escolha do ponto inicial
        activateHubPlacementMode(null);
    }

    deactivate() {
        super.deactivate();
        if (getIsDrawingConnection()) {
            cancelConnectionCreation();
        }
        
        // Desativar modo de posicionamento
        deactivateHubPlacementMode();
        
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'default';
        }
        drawAll();
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        const pos = getMousePos(e);

        setActiveConnectionStairGroup(null);
        
        if (!getIsDrawingConnection()) {
            // Verificar se está sobre uma doca (prioridade sobre recursos)
            if (this._dockTarget) {
                let dockHub = null;
                if (this._dockTarget.type === 'hub') {
                    dockHub = this._dockTarget.hub;
                } else if (this._dockTarget.type === 'opening') {
                    // Criar hub automaticamente na abertura
                    dockHub = createHubForBoundaryOpening(this._dockTarget.opening.id);
                }
                
                if (dockHub) {
                    // Iniciar conexão a partir do hub da doca
                    startCreatingConnection(dockHub.x, dockHub.y, { dockHubId: dockHub.id });
                    deactivateHubPlacementMode();
                    this._dockTarget = null;
                    setIsConnectionMousePressed(true);
                    drawAll();
                    return;
                }
            }
            
            // Verificar se há um preview válido (recurso)
            const previewPos = getHubPreviewPosition();
            const targetResource = getHubPlacementTargetResource();
            
            if (previewPos && targetResource) {
                // Iniciar conexão na posição validada do preview
                startCreatingConnection(previewPos.x, previewPos.y);
                
                // Desativar o feedback visual da zona após iniciar a conexão
                // (a conexão agora está sendo desenhada)
                deactivateHubPlacementMode();
            } else {
                // Fallback: tentar iniciar conexão na posição do cursor
                // O sistema de conexões já tenta encontrar o recurso mais próximo
                startCreatingConnection(pos.x, pos.y);
                deactivateHubPlacementMode();
            }
        }
        
        // Marcar que o mouse está pressionado para desenho livre
        setIsConnectionMousePressed(true);
        drawAll();
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;
        
        const pos = getMousePos(e);

        // Se está desenhando conexão, usar lógica de desenho E mostrar preview do destino
        if (getIsDrawingConnection()) {
            // Tentar fazer a transição através da escada
            const transitioned = transitionConnectionThroughStair({ x: pos.x, y: pos.y });
            if (!transitioned) {
                // Continuar adicionando pontos normalmente
                addConnectionPoint(pos.x, pos.y);
            }
            
            // Verificar doca como destino (prioridade sobre recursos)
            const dockTarget = findNearestDockTarget(pos.x, pos.y, 40);
            if (dockTarget) {
                this._dockTarget = dockTarget;
                const dockPos = dockTarget.type === 'hub' 
                    ? { x: dockTarget.hub.x, y: dockTarget.hub.y }
                    : { x: dockTarget.anchorInfo.x, y: dockTarget.anchorInfo.y };
                const dockNormal = dockTarget.type === 'hub'
                    ? { x: dockTarget.hub.normalX || 0, y: dockTarget.hub.normalY || 0 }
                    : { x: dockTarget.anchorInfo.normalX, y: dockTarget.anchorInfo.normalY };
                
                // Mostrar preview na posição da doca
                if (!getIsHubPlacementActive()) {
                    activateHubPlacementMode(null, false);
                }
                updateHubPreview(dockPos, dockNormal, false, null);
                return;
            }
            this._dockTarget = null;
            
            // Mostrar preview do hub de destino durante o desenho (recursos)
            let resource = findResourceUnderCursor(pos.x, pos.y);
            if (!resource) {
                const nearest = findNearestResourceToCursor(pos.x, pos.y, 50);
                if (nearest) {
                    resource = nearest.resource;
                }
            }
            
            if (resource) {
                // Ativar modo temporariamente para mostrar preview
                if (!getIsHubPlacementActive()) {
                    activateHubPlacementMode(resource, false); // Só no recurso alvo, não todos
                }
                
                const result = calculateValidHubPosition(pos.x, pos.y, resource);
                if (result) {
                    updateHubPreview(
                        result.position,
                        result.normal,
                        result.isConstrained,
                        resource
                    );
                } else {
                    clearHubPreview();
                }
            } else {
                // Não está sobre recurso - desativar preview
                if (getIsHubPlacementActive()) {
                    deactivateHubPlacementMode();
                }
            }
        } else {
            // Não está desenhando - mostrar preview do hub inicial
            // Verificar doca primeiro (prioridade)
            const dockTarget = findNearestDockTarget(pos.x, pos.y, 40);
            if (dockTarget) {
                this._dockTarget = dockTarget;
                const dockPos = dockTarget.type === 'hub'
                    ? { x: dockTarget.hub.x, y: dockTarget.hub.y }
                    : { x: dockTarget.anchorInfo.x, y: dockTarget.anchorInfo.y };
                const dockNormal = dockTarget.type === 'hub'
                    ? { x: dockTarget.hub.normalX || 0, y: dockTarget.hub.normalY || 0 }
                    : { x: dockTarget.anchorInfo.normalX, y: dockTarget.anchorInfo.normalY };
                
                if (!getIsHubPlacementActive()) {
                    activateHubPlacementMode(null, false);
                }
                updateHubPreview(dockPos, dockNormal, false, null);
                
                const canvas = getCanvas();
                if (canvas) canvas.style.cursor = 'crosshair';
                drawAll(false);
                return;
            }
            this._dockTarget = null;
            
            if (getIsHubPlacementActive()) {
                // Primeiro tentar encontrar recurso sob o cursor
                let resource = findResourceUnderCursor(pos.x, pos.y);
                
                // Se não encontrou, tentar encontrar recurso próximo
                if (!resource) {
                    const nearest = findNearestResourceToCursor(pos.x, pos.y, 50);
                    if (nearest) {
                        resource = nearest.resource;
                    }
                }
                
                if (resource) {
                    const result = calculateValidHubPosition(pos.x, pos.y, resource);
                    if (result) {
                        updateHubPreview(
                            result.position,
                            result.normal,
                            result.isConstrained,
                            resource
                        );
                    } else {
                        clearHubPreview();
                    }
                } else {
                    clearHubPreview();
                }
                
                drawAll(false);
            } else {
                // Hover logic para conexões existentes
                this.updateConnectionHover(pos);
            }
        }
    }

    onMouseUp(e) {
        if (e.button !== 0) { super.onMouseUp(e); return; }

        // Parar o desenho livre
        setIsConnectionMousePressed(false);
        setActiveConnectionStairGroup(null);
        
        // Finalizar conexão
        if (getIsDrawingConnection()) {
            // Se estamos sobre uma doca, finalizar nela
            if (this._dockTarget) {
                let dockHub = null;
                if (this._dockTarget.type === 'hub') {
                    dockHub = this._dockTarget.hub;
                } else if (this._dockTarget.type === 'opening') {
                    dockHub = createHubForBoundaryOpening(this._dockTarget.opening.id);
                }
                if (dockHub) {
                    finishConnection({ dockHubId: dockHub.id });
                } else {
                    finishConnection();
                }
            } else {
                finishConnection();
            }
            
            this._dockTarget = null;
            
            // Reativar modo de posicionamento para permitir criar outra conexão
            activateHubPlacementMode(null);
            
            // Manter cursor crosshair
            const canvas = getCanvas();
            if (canvas) {
                canvas.style.cursor = 'crosshair';
            }
        }
    }

    updateConnectionHover(pos) {
        const connection = getConnectionAtPosition(pos.x, pos.y);
        const currentHoveredId = getHoveredConnectionId();
        
        if (connection) {
            if (currentHoveredId !== connection.id) {
                setHoveredConnectionId(connection.id);
                drawAll();
            }
        } else {
            if (currentHoveredId !== null) {
                setHoveredConnectionId(null);
                drawAll();
            }
        }
    }
}
