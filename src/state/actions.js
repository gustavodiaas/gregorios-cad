import {
    setSelectedAreaId,
    setSelectedWallId,
    setSelectedFreeLineId,
    setEditingAreaId,
    setIsEditingWall,
    setEditingWallId,
    setEditingWallHandle
} from './domains/selectionState.js';
import {
    setSelectedResourceId,
    setEditingResourceId
} from './domains/resourceState.js';
import {
    setSelectedConnectionId,
    setCurrentConnection
} from './domains/connectionState.js';
import { emitStateAction } from './events.js';

export function clearAllSelections(reason = 'manual-reset') {
    setSelectedAreaId(null);
    setSelectedResourceId(null);
    setSelectedConnectionId(null);
    setSelectedWallId(null);
    setSelectedFreeLineId(null);
    setEditingAreaId(null);
    setEditingResourceId(null);
    setCurrentConnection(null);
    setIsEditingWall(false);
    setEditingWallId(null);
    setEditingWallHandle(null);

    emitStateAction('selection/cleared', { reason });
}
