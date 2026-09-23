// Importa funções e variárias globais necessárias
import { createWall } from '../walls.js';
import { walls } from '../state.js';
import { drawAll } from '../drawing.js';

// Proteção contra execução dupla
let isCreatingVisualWalls = false;

/**
 * Cria paredes visuais a partir de arestas compartilhadas preservadas.
 * @param {Array} sharedEdges - Array de arestas compartilhadas a serem preservadas
 * @param {string} parentAreaId - ID da área pai para as novas paredes
 */
export function createVisualWallsFromEdges(sharedEdges, parentAreaId) {
    // Proteção contra execução dupla
    if (isCreatingVisualWalls) {
        console.warn('⚠️ Criação de paredes visuais já em andamento. Ignorando chamada duplicada.');
        return;
    }
    
    isCreatingVisualWalls = true;
    
    try {
        
        if (!sharedEdges || sharedEdges.length === 0) {
            return;
        }
    
    // Antes de criar novas paredes, verificar se existem paredes duplicadas antigas para remover
    // Isso evita o problema de ter paredes duplicadas com IDs diferentes na mesma posição
    const wallPositions = sharedEdges.map(edge => ({
        start: edge.overlap?.start,
        end: edge.overlap?.end
    })).filter(pos => pos.start && pos.end);
    
    // Remover duplicatas antigas antes de criar novas paredes
    if (wallPositions.length > 0) {
        let wallsRemoved = 0;
        
        for (let i = walls.length - 1; i >= 0; i--) {
            const wall = walls[i];
            
            // Verificar se esta parede corresponde a alguma posição que vamos criar
            const isDuplicate = wallPositions.some(pos => 
                (Math.abs(wall.startPoint[0] - pos.start[0]) < 1 && 
                Math.abs(wall.startPoint[1] - pos.start[1]) < 1 &&
                Math.abs(wall.endPoint[0] - pos.end[0]) < 1 && 
                Math.abs(wall.endPoint[1] - pos.end[1]) < 1) ||
                (Math.abs(wall.startPoint[0] - pos.end[0]) < 1 && 
                Math.abs(wall.startPoint[1] - pos.end[1]) < 1 &&
                Math.abs(wall.endPoint[0] - pos.start[0]) < 1 && 
                Math.abs(wall.endPoint[1] - pos.start[1]) < 1)
            );
            
            if (isDuplicate) {
                walls.splice(i, 1);
                wallsRemoved++;
            }
        }
    }
    
    let createdWalls = 0;
    sharedEdges.forEach((edge, index) => {
        try {
            // As arestas compartilhadas têm a estrutura: { overlap: { start: [x,y], end: [x,y] } }
            const startPoint = edge.overlap.start;
            const endPoint = edge.overlap.end;
            if (!startPoint || !endPoint || !Array.isArray(startPoint) || !Array.isArray(endPoint)) {
                return;
            }
            
            // Verificar paredes existentes na mesma posição antes de criar
            const existingWalls = walls.filter(w => 
                (Math.abs(w.startPoint[0] - startPoint[0]) < 1 && 
                Math.abs(w.startPoint[1] - startPoint[1]) < 1 &&
                Math.abs(w.endPoint[0] - endPoint[0]) < 1 && 
                Math.abs(w.endPoint[1] - endPoint[1]) < 1) ||
                (Math.abs(w.startPoint[0] - endPoint[0]) < 1 && 
                Math.abs(w.startPoint[1] - endPoint[1]) < 1 &&
                Math.abs(w.endPoint[0] - startPoint[0]) < 1 && 
                Math.abs(w.endPoint[1] - startPoint[1]) < 1)
            );
            
            if (existingWalls.length > 0) {
                // Se já existe uma parede na mesma posição, não crie uma nova
                // Apenas garanta que ela está marcada como visual
                existingWalls.forEach(existingWall => {
                    existingWall.isVisual = true;
                });
                createdWalls++; // Contar como criada para manter o controle
                return; // Pular a criação de parede nova
            }
            
            const wall = createWall(startPoint, endPoint, parentAreaId);
            if (wall) {
                wall.isVisual = true; // Marcação especial para paredes visuais
                walls.push(wall);
                createdWalls++;
            } else {
            }
        } catch (error) {
            console.error(`DEBUG - ERRO AO CRIAR PAREDE VISUAL:`, error);
        }
    });
    // Redesenhar canvas para mostrar as novas paredes
    if (createdWalls > 0 && typeof drawAll === 'function') {
        drawAll();
    }
    
    } finally {
        // Sempre resetar a flag
        isCreatingVisualWalls = false;
    }
}
