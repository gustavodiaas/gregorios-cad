// Index file for merge_resources module
// Centraliza as exportações de todas as funcionalidades relacionadas a recursos

// Operações principais
export { 
    mergeResources,
    canMoveResourceTo,
    checkResourceAdjacency,
    getMergeableResources,
    canMergeResources 
} from './resource_operations.js';

// Duplicação (versão melhorada)
export { duplicateResource } from './duplicateResource.js';

// Rotação de recursos
export { 
    rotateResource, 
    rotateResourcesWithArea,
    rotateVertices,
    tryRotateWithPullSystem,
    tryAdvancedPullAdjustment
} from './rotateresource.js';

// Re-export helper from resources for compatibility
export { removeResourcesFromArea } from '../resources.js';
