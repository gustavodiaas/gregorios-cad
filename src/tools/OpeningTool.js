import { Tool } from './Tool.js';
import { 
    getCanvas, 
    getIsCreatingOpening, 
    setIsCreatingOpening, 
    getOpeningPreviewPosition, 
    setOpeningPreviewPosition,
    isPanning
} from '../state.js';
import { getMousePos } from '../events/mouseUtils.js';
import { 
    startCreatingOpening, 
    stopCreatingOpening, 
    confirmVirtualOpening, 
    updateVirtualOpening, 
    findWallAtPosition,
    getIsCreatingOpeningFromOpenings,
    findBoundaryEdgeAtPosition
} from '../openings.js';
import { drawAll } from '../drawing.js';

export class OpeningTool extends Tool {
    constructor() {
        super();
        this.name = 'OpeningTool';
    }

    activate() {
        super.activate();
        // Preview logic handled in mouse move
    }

    deactivate() {
        super.deactivate();
        // Desativar preview de abertura se estava ativo
        stopCreatingOpening();
        if (getIsCreatingOpening()) {
            setIsCreatingOpening(false);
            setOpeningPreviewPosition(null);
        }
        drawAll();
    }

    onMouseDown(e) {
        if (e.button !== 0) { super.onMouseDown(e); return; }

        const pos = getMousePos(e);

        // Modo criação de abertura
        // Se já estamos em modo de criação, confirmar a abertura virtual
        if (getIsCreatingOpening()) {
            const newOpening = confirmVirtualOpening();
            if (newOpening) {
                // Não desativar o modo - permitir criar múltiplas aberturas
            }
        } else {
            // Iniciar modo de criação de abertura - sincronizar ambos os sistemas
            startCreatingOpening(); // Sistema openings.js
            setIsCreatingOpening(true); // Sistema state.js
        }
        drawAll();
    }

    onMouseMove(e) {
        super.onMouseMove(e);
        if (isPanning) return;
        
        const canvas = getCanvas();
        const pos = getMousePos(e);

        if (getIsCreatingOpening()) {
            updateVirtualOpening(pos.x, pos.y);
            drawAll();
        }

        // Cursor and preview logic
        const wallHit = findWallAtPosition(pos.x, pos.y);
        if (wallHit) {
            if (!getIsCreatingOpening()) {
                setIsCreatingOpening(true);
                if (!getIsCreatingOpeningFromOpenings()) {
                    startCreatingOpening();
                }
            }
            
            const currentPreview = getOpeningPreviewPosition();
            const isBoundary = wallHit.isBoundaryEdge || false;
            const newPreview = {
                x: pos.x,
                y: pos.y,
                wall: wallHit.wall,
                position: wallHit.position,
                isBoundaryEdge: isBoundary
            };
            
            const hasChanged = !currentPreview || 
                             currentPreview.wall?.id !== newPreview.wall.id ||
                             Math.abs(currentPreview.position - newPreview.position) > 0.01;
            
            if (hasChanged) {
                setOpeningPreviewPosition(newPreview);
                drawAll();
            }
        } else {
            if (getIsCreatingOpening()) {
                // Only stop if we are not in the middle of creating one (wait, logic in mouseEvents was slightly different)
                // In mouseEvents:
                /*
                } else {
                    if (getIsCreatingOpening()) {
                        setIsCreatingOpening(false);
                        setOpeningPreviewPosition(null);
                        if (getIsCreatingOpeningFromOpenings()) {
                            stopCreatingOpening();
                        }
                        drawAll();
                    }
                }
                */
               // But wait, if I clicked to start creating, I want it to persist?
               // The original logic in handleOpeningToolCursor:
               /*
                if (wallHit) {
                    ...
                } else {
                    if (getIsCreatingOpening()) {
                        setIsCreatingOpening(false);
                        setOpeningPreviewPosition(null);
                        if (getIsCreatingOpeningFromOpenings()) {
                            stopCreatingOpening();
                        }
                        drawAll();
                    }
                }
               */
               // This implies that if I move off a wall, it stops creating.
               // But `handleCreateOpeningMouseDown` sets `setIsCreatingOpening(true)`.
               // If I click, I expect it to stay active?
               // Actually, `handleCreateOpeningMouseDown` says:
               /*
                if (getIsCreatingOpening()) {
                    const newOpening = confirmVirtualOpening();
                    ...
                } else {
                    startCreatingOpening();
                    setIsCreatingOpening(true);
                }
               */
               // So if I click on a wall, it confirms. If I click elsewhere (handled by empty space click), it cancels.
               // The cursor logic seems to auto-enable creation when hovering a wall if the tool is active.
               
               setIsCreatingOpening(false);
               setOpeningPreviewPosition(null);
               if (getIsCreatingOpeningFromOpenings()) {
                   stopCreatingOpening();
               }
               drawAll();
            }
        }
        
        if (canvas) {
            if (wallHit) {
                canvas.style.cursor = wallHit.isBoundaryEdge ? 'cell' : 'crosshair';
            } else {
                canvas.style.cursor = 'not-allowed';
            }
        }
    }

    onMouseUp(e) {
        super.onMouseUp(e);
        // No specific mouse up action for openings
    }
}
