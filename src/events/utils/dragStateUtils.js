/**
 * Utilitários para gerenciamento de estado de arraste (drag)
 */
import { 
    resources, movementAreas, activeGuideLines,
    getSelectedResourceIds, getActiveResourceDragState, setActiveResourceDragState,
    setActiveGuideLines, setIsDragging,
    getHoveredAreaVirtualDimensions, setHoveredAreaVirtualDimensions,
    getIsAreaHoverActive, setIsAreaHoverActive,
    getCanvas
} from '../../state.js';
import { drawAll } from '../../drawing.js';
import { migrateResourceToPolygonal, calculatePolygonBounds } from '../../resources.js';
import { endResourceDrag } from '../../resource-dimensions.js';
import { updateConnectionPathsForResource } from '../../connections.js';
import { updateConnectionDistancesTable } from '../../flow-metrics.js';
import { updateNavMeshWithObstacles, getNavMeshForWidth } from '../../navMeshBaker.js';
import { cloneResourceBoundingBox, createResourceDragState } from '../handlers/resourceHandlers.js';

/**
 * Manipula o mouseup durante arraste
 */
export function handleDragMouseUp() {
    const canvas = getCanvas();
    
    setIsDragging(false);
    activeGuideLines.length = 0;
    
    // Finalizar modo de arraste de recurso (restaura cotas globais)
    const selectedResourceIds = getSelectedResourceIds();
    if (selectedResourceIds.length > 0) {
        endResourceDrag();
        setActiveGuideLines([]);
        
        selectedResourceIds.forEach(id => {
            updateConnectionPathsForResource(id);
        });

        // Atualizar NavMesh para as áreas afetadas pelo arraste
        const updatedAreaIds = new Set();
        selectedResourceIds.forEach(id => {
            const resource = resources.find(r => r.id === id);
            if (resource && resource.parentAreaId && !updatedAreaIds.has(resource.parentAreaId)) {
                updatedAreaIds.add(resource.parentAreaId);
                const area = movementAreas.find(a => a.id === resource.parentAreaId);
                if (area && area.navMeshes) {
                    for (const widthKey of Object.keys(area.navMeshes)) {
                        const navMesh = area.navMeshes[widthKey];
                        if (navMesh && navMesh.baked) {
                            updateNavMeshWithObstacles(area, navMesh);
                        }
                    }
                }
            }
        });

        setActiveResourceDragState(null);
        
        // Atualizar tabela de distâncias ao soltar o recurso
        updateConnectionDistancesTable();
    }
    
    if (getIsAreaHoverActive()) {
        setHoveredAreaVirtualDimensions(null);
        setIsAreaHoverActive(false);
    }
    
    canvas.style.cursor = 'default';
    drawAll();
}

// Re-exportar funções do resourceHandlers para uso externo
export { cloneResourceBoundingBox, createResourceDragState };
