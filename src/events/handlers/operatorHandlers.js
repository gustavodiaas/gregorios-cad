/**
 * Handlers para eventos de mouse relacionados a operadores
 */
import { 
    getCanvas,
    setSelectedResourceId, setSelectedAreaId, setSelectedWallId, setSelectedConnectionId, setSelectedFreeLineId,
    setSelectedExclusionZoneId
} from '../../state.js';
import { saveStateToHistory } from '../../history.js';
import { drawAll } from '../../drawing.js';
import { createOperatorAtPosition } from '../../operators.js';

/**
 * Manipula o clique para criar operador
 */
export function handleCreateOperatorMouseDown(pos) {
    const canvas = getCanvas();
    const { resource, error } = createOperatorAtPosition(pos.x, pos.y);

    if (!resource) {
        if (error === 'outside-area') {
            canvas.style.cursor = 'not-allowed';
        }
        return;
    }

    saveStateToHistory('Incluir operador');
    setSelectedResourceId(resource.id);
    setSelectedAreaId(null);
    setSelectedWallId(null);
    setSelectedConnectionId(null);
    setSelectedFreeLineId(null);
    setSelectedExclusionZoneId(null);
    drawAll();
}
