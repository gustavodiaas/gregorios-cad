import { Tool } from './Tool.js';
import { getCanvas, isPanning } from '../state.js';
import { 
    activateHubPlacementMode, 
    deactivateHubPlacementMode,
    updateHubPreview,
    clearHubPreview,
    getHubPreviewPosition,
    getHubPreviewNormal,
    getHubPlacementTargetResource
} from '../state.js';
import { setActiveTool } from '../active_tool.js';
import { createHub, createHubForBoundaryOpening } from '../hubs.js';
import { findResourceAtPosition } from '../resources.js';
import { saveStateToHistory } from '../history.js';
import { getMousePos } from '../events/mouseUtils.js';
import { drawAll } from '../drawing.js';
import { 
    calculateValidHubPosition, 
    findResourceUnderCursor,
    findNearestResourceToCursor,
    findNearestDockTarget
} from '../hub-placement-helper.js';

export class HubTool extends Tool {
    constructor() {
        super();
        this.name = 'HubTool';
        /** @type {Object|null} Alvo de doca para posicionamento de hub */
        this._dockTarget = null;
    }

    activate() {
        super.activate();
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'crosshair';
        }
        
        // Ativar modo de posicionamento de hub
        activateHubPlacementMode(null);
    }

    deactivate() {
        super.deactivate();
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'default';
        }
        
        // Desativar modo de posicionamento
        deactivateHubPlacementMode();
        drawAll();
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        // Se estamos sobre uma doca, criar hub nela
        if (this._dockTarget) {
            if (this._dockTarget.type === 'opening') {
                // Abertura sem hub — criar hub
                const hub = createHubForBoundaryOpening(this._dockTarget.opening.id);
                if (hub) {
                    saveStateToHistory('Adicionar hub na doca');
                }
            }
            // Se já existe hub (type === 'hub'), não fazer nada (já existe)
            this._dockTarget = null;
            setActiveTool(null);
            return;
        }

        const previewPos = getHubPreviewPosition();
        const previewNormal = getHubPreviewNormal();
        const targetResource = getHubPlacementTargetResource();
        
        // Se não há preview válido, não criar hub
        if (!previewPos || !targetResource) {
            return;
        }
        
        // Criar hub na posição do preview (já validada) com a normal para a seta de direção
        createHub(previewPos.x, previewPos.y, targetResource.id, previewNormal);
        saveStateToHistory('Adicionar hub');
        setActiveTool(null); // Voltar para ferramenta padrão
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;
        
        const pos = getMousePos(e);
        
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
            
            updateHubPreview(dockPos, dockNormal, false, null);
            drawAll(false);
            return;
        }
        this._dockTarget = null;
        
        // Primeiro tentar encontrar recurso sob o cursor
        let resource = findResourceUnderCursor(pos.x, pos.y);
        
        // Se não encontrou, tentar encontrar recurso próximo (para permitir posicionar na borda de fora)
        if (!resource) {
            const nearest = findNearestResourceToCursor(pos.x, pos.y, 50); // 50px de distância máxima
            if (nearest) {
                resource = nearest.resource;
            }
        }
        
        if (resource) {
            // Calcular posição válida do hub
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
            // Nenhum recurso próximo - limpar preview
            clearHubPreview();
        }
        
        drawAll(false); // Redesenhar apenas camada dinâmica
    }

    onMouseUp(e) {
        super.onMouseUp(e);
        // Nenhuma ação específica no mouse up
    }
}
