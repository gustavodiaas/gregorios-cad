import { createUnionPreview } from './createUnionPreview.js';
import { createVisualWallsFromEdges } from './createVisualWallsFromEdges.js';
import { walls } from '../state.js';
import { isWallAlongEdge } from '../features/walls/divisory-walls.js';
import { mergeAreas } from '../areas.js';

/**
 * Cria dialog HTML para gerenciar paredes divisórias.
 */
function createDivisoryWallsDialog(areasToMerge, divisoryWalls, sharedEdges) {
    const dialog = document.createElement('div');
    dialog.id = 'divisory-walls-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #f8fafc;
        color: #222;
        border: 2px solid #007bff;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        min-width: 450px;
        max-width: 600px;
        font-family: Arial, sans-serif;
        max-height: 80vh;
        overflow-y: auto;
    `;
    let mergedAreaPreview = null;
    // Função para gerar mergedAreaPreview (polígono unido) para o preview
    function getMergedAreaPreview(areasToMerge, callback) {
        if (areasToMerge.length > 1) {
            import('../config.js').then(({ polygonClipping, rectangleToVertices }) => {
                // Importar a função normalizePolygon das áreas
                import('../areas.js').then(({ normalizePolygon }) => {
                    const polygons = areasToMerge.map(area => {
                        return [ (area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height)) ];
                    });
                    let unionResult = polygons[0];
                    
                    for (let i = 1; i < polygons.length; i++) {
                        // Normalizar antes da união (mesmo que na função mergeAreas)
                        const normalizedUnionResult = normalizePolygon(unionResult);
                        const normalizedCurrentPolygon = normalizePolygon(polygons[i]);
                        unionResult = polygonClipping.union(normalizedUnionResult, normalizedCurrentPolygon);
                    }
                    
                    if (unionResult && unionResult.length > 0) {
                        const mainPolygon = unionResult[0][0];
                        callback({
                            id: Math.min(...areasToMerge.map(a => a.id)),
                            vertices: mainPolygon
                        });
                    } else {
                        console.error('❌ Preview - União falhou');
                        callback(null);
                    }
                }).catch((error) => {
                    console.error('❌ Preview - Erro ao importar normalizePolygon:', error);
                    callback(null);
                });
            }).catch(() => callback(null));
        } else {
            callback(areasToMerge[0]);
        }
    }
    // Inicializar preview (async)
    getMergedAreaPreview(areasToMerge, (mergedAreaPreview) => {
        const previewContainer = dialog.querySelector('#union-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = createUnionPreview(areasToMerge, sharedEdges, mergedAreaPreview);
        }
    });
    dialog.innerHTML = `
        <h3 style="margin-top: 0; color: #007bff;">
            <i class="fas fa-unite"></i> Unir Áreas: Área ${Math.min(...areasToMerge.map(a => a.id))}
        </h3>
        <div style="color: red; font-weight: bold;">[DEBUG: DIALOGO NOVO]</div>
        <div id="union-preview-container">
            ${createUnionPreview(areasToMerge, sharedEdges, null)}
        </div>
        ${sharedEdges.length > 0 ? `
        <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 6px;">
            <label style="display: flex; align-items: center; margin-bottom: 8px;">
                <input type="radio" name="edgeAction" value="keep" checked style="margin-right: 8px;">
                <span style="color: #222; opacity: 1;">Manter paredes como elementos visuais</span>
            </label>
            <label style="display: flex; align-items: center;">
                <input type="radio" name="edgeAction" value="remove" style="margin-right: 8px;">
                <span style="color: #222; opacity: 1;">Remover paredes internas (união suave)</span>
            </label>
        </div>
        ` : ''}
        <div style="text-align: center; padding-top: 15px; border-top: 1px solid #eee;">
            <button id="cancelBtn" style="margin-right: 10px; padding: 10px 20px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer; color: #333; font-weight: 600;">
                Cancelar
            </button>
            <button id="confirmBtn" style="padding: 10px 20px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer; font-weight: 600;">
                <i class="fas fa-check"></i> Unir Áreas
            </button>
        </div>    `;
    // Event listeners (must be after innerHTML)
    const cancelBtn = dialog.querySelector('#cancelBtn');
    const confirmBtn = dialog.querySelector('#confirmBtn');
    cancelBtn.onclick = () => {
        if (typeof safeRemoveDialog === 'function') safeRemoveDialog(dialog, closeOnEsc);
    };
    confirmBtn.addEventListener('click', async (e) => {
        // Evitar duplo clique
        if (confirmBtn.disabled) return;
        confirmBtn.disabled = true;
        
        try {
            await performMerge();
        } finally {
            if (typeof safeRemoveDialog === 'function') safeRemoveDialog(dialog, closeOnEsc);
        }
    });
    
    // Função performMerge consolidada
    async function performMerge() {
        
        // Obter ações selecionadas para arestas e paredes
        const edgeAction = dialog.querySelector('input[name="edgeAction"]:checked')?.value || 'remove';
        
        let wallsToRemove = [];
        
        // Determinar paredes a remover baseado na ação selecionada
        if (edgeAction === 'remove' && sharedEdges.length > 0) {
            // Remover paredes correspondentes às bordas compartilhadas
            const tolerance = 10;
            for (const sharedEdge of sharedEdges) {
                for (let i = walls.length - 1; i >= 0; i--) {
                    const wall = walls[i];
                    if (isWallAlongEdge(wall, sharedEdge.edge1.start, sharedEdge.edge1.end, tolerance) ||
                        isWallAlongEdge(wall, sharedEdge.edge2.start, sharedEdge.edge2.end, tolerance)) {
                        wallsToRemove.push(wall);
                        walls.splice(i, 1);
                    }
                }
            }
        }
        
        // Executar união das áreas
        const mergedArea = await mergeAreas(areasToMerge);
        
        // Se o usuário escolheu manter arestas visuais, criar paredes visuais na nova área
        if (edgeAction === 'keep' && sharedEdges.length > 0 && mergedArea) {
            createVisualWallsFromEdges(sharedEdges, mergedArea.id);
        }
        
        if (mergedArea) {
            // Importar setSelectedAreaId dinamicamente para evitar dependências circulares
            const { setSelectedAreaId } = await import('../state.js');
            const { drawAll } = await import('../drawing.js');
            setSelectedAreaId(mergedArea.id);
            drawAll();
        }
    }
    
    // Mutation observer to detect dialog changes
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
        }
    });
    observer.observe(dialog, { childList: true, subtree: true });
    
    // Fechar dialog com ESC
    const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
            if (typeof safeRemoveDialog === 'function') safeRemoveDialog(dialog, closeOnEsc);
        }
    };
    document.addEventListener('keydown', closeOnEsc);
    // --- Dynamic preview update logic (safe innerHTML replacement) ---
    const previewContainer = dialog.querySelector('#union-preview-container');
    function updatePreview() {
        const edgeAction = dialog.querySelector('input[name="edgeAction"]:checked')?.value || 'remove';
        const showSharedEdges = edgeAction === 'keep';
        getMergedAreaPreview(areasToMerge, (mergedAreaPreview) => {
            if (previewContainer) {
                previewContainer.innerHTML = createUnionPreview(
                    areasToMerge,
                    showSharedEdges ? sharedEdges : [],
                    mergedAreaPreview
                );
            }
        });
    }
    const edgeRadios = dialog.querySelectorAll('input[name="edgeAction"]');
    edgeRadios.forEach(radio => {
        radio.addEventListener('change', updatePreview);
    });
    return dialog;
}

// Função local, não exportada de events.js, então copiamos a implementação aqui
function safeRemoveDialog(dialog, escListener) {
    if (dialog) {
        dialog.remove();
    }
    if (escListener) {
        document.removeEventListener('keydown', escListener);
    }
}

export { createDivisoryWallsDialog };
