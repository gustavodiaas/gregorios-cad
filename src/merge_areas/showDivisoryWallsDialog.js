import { findDivisoryWalls, detectSharedEdges } from '../features/walls/divisory-walls.js';
import { createDivisoryWallsDialog } from './createDivisoryWallsDialog.js';

/**
 * Mostra dialog específico para gerenciar paredes divisórias durante união de áreas.
 */
function showDivisoryWallsDialog(areasToMerge) {
    
    // Detectar paredes divisórias e arestas compartilhadas
    // Detectar paredes divisórias e arestas compartilhadas
    const divisoryWalls = findDivisoryWalls(areasToMerge);
    const sharedEdges = detectSharedEdges(areasToMerge);
    
    // Se não há paredes divisórias nem arestas compartilhadas, fazer união direta
    if (divisoryWalls.length === 0 && sharedEdges.length === 0) {
        performMerge(areasToMerge, [], 'remove', sharedEdges);
        return;
    }
    
    // Criar e mostrar dialog
    const dialog = createDivisoryWallsDialog(areasToMerge, divisoryWalls, sharedEdges);
    
    document.body.appendChild(dialog);
    dialog.style.display = 'block';
}

export { showDivisoryWallsDialog };
