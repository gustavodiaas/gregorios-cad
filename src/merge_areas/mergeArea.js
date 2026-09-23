import { getMergeableAreas } from '../areas.js';
import { showDivisoryWallsDialog } from './showDivisoryWallsDialog.js';

function mergeArea(area) {
    if (area.locked) {
        alert('Não é possível unir uma área bloqueada.');
        return;
    }
    
    // Encontrar áreas que podem ser unidas
    const mergeableAreas = getMergeableAreas(area);
    if (mergeableAreas.length === 0) {
        alert('Não há áreas adjacentes ou sobrepostas disponíveis para união.');
        return;
    }
    
    // Sempre mostrar o dialog de divisórias, passando a área base e as mergeáveis
    // O dialog pode ser adaptado para permitir seleção múltipla se necessário
    showDivisoryWallsDialog([area, ...mergeableAreas]);
}

export { mergeArea };