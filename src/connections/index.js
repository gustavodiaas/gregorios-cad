/**
 * @fileoverview Sistema de conexões - Exportações centralizadas
 * 
 * @description
 * Ponto de entrada principal para o módulo de conexões.
 * Este arquivo simplifica as importações no resto da aplicação,
 * consolidando 8 arquivos originais em 4 módulos principais:
 * 
 * - **connectionCore.js**: CRUD, pathfinding e lifecycle
 * - **connectionUtils.js**: Utilitários e transformações geométricas
 * - **connectionAnimations.js**: Sistema de sprites animados
 * - **hubs.js**: Gerenciamento de hubs (re-exportado)
 * 
 * @module connections
 * @example
 * // Importar tudo do módulo de conexões
 * import { createAnchoredConnection, removeConnection, getHubVisualRadius } from './connections/index.js';
 * 
 * // Ou importar específico
 * import { createAnchoredConnection } from './connections/connectionCore.js';
 */

// ============================================================================
// ARQUIVOS CONSOLIDADOS (código real)
// ============================================================================

// Connection Core - Combina CRUD, Pathfinding e Lifecycle
export * from './connectionCore.js';

// Connection Utils - Combina utilitários e transformações
export * from './connectionUtils.js';

// Connection Animations - Mantido separado (826 linhas, sistema isolado)
export * from './connectionAnimations.js';

// Hubs - Re-exporta do módulo principal de hubs
export * from '../hubs.js';

// ============================================================================
// RE-EXPORTS EXPLÍCITOS PARA RETROCOMPATIBILIDADE
// ============================================================================

// Re-exportar funções importantes do connectionUtils
export { 
    findNearestResource,
    getResourceCenter,
    calculateAnchorPoint,
    anchorToWorldCoordinates,
    findResourceById,
    rotateConnectionsWithArea,
    moveConnectionsWithArea,
    getHubVisualRadius,
    getHubSnapRadius,
    getHubNumericId,
    getHubDisplayLabel
} from './connectionUtils.js';

// Re-exportar funções do connectionCore
export {
    createAnchoredConnection,
    removeConnection,
    deleteConnection,
    getConnectionsForResource,
    calculateConnectionDistance,
    getConnectionAtPosition,
    convertPointsToAnchors,
    updateConnectionPath,
    updateAllConnectionPaths,
    updateConnectionPathsForResource,
    startCreatingConnection,
    addConnectionPoint,
    finishConnection,
    completeConnectionToResource,
    cancelConnectionCreation
} from './connectionCore.js';

// Re-exportar função de estado
export { getIsDrawingConnection } from '../state.js';
