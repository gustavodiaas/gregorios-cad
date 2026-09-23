// Módulo de Aberturas - Sistema Simples de Corte de Paredes
// Cria duas paredes menores com abertura entre elas
// Suporta aberturas em paredes internas E em bordas de áreas de movimentação
import { walls, getScale, getCtx, registerOpeningsBinding, movementAreas } from './state.js';
import { saveStateToHistory } from './history.js'; // Sistema de undo/redo
import { pixelsPerCm, openingControlMinSize, openingControlMaxSize, openingTextOffsetMin, openingTextOffsetMax, getScaledSizeWithLimits, DIMENSION_SYSTEM, dimensionLineWidth, dimensionTickSize, getGlobalShowDimensions } from './config.js';
import { generateId, ID_PREFIXES } from './utils/idGenerator.js';
import { layoutChangeNotifier } from './core/layout-change-notifier.js';
// Estado global das aberturas
let openings = [];
let selectedOpeningId = null;
let hoveredControlPoint = null; // 'start' ou 'end' para os cubos de controle
let isCreatingOpening = false;
let virtualOpening = null; // Abertura virtual seguindo o mouse
const DEFAULT_OPENING_WIDTH = 80; // 80cm padrão
const MIN_OPENING_SEGMENT_CM = 3; // Segmentos menores que isso não são criados
// Estado para redimensionamento
let isResizingOpening = false;
let resizingOpeningId = null;
let resizingControlPoint = null; // 'start' ou 'end'
let resizeStartPosition = null; // Posição inicial do mouse
let originalOpeningData = null; // Dados originais da abertura para restaurar se necessário
let hasResizedDuringDrag = false; // Flag para saber se houve arraste real de resize

// Mantém o array de aberturas alinhado ao pavimento ativo
registerOpeningsBinding((newOpeningsArray) => {
    openings = Array.isArray(newOpeningsArray) ? newOpeningsArray : [];
    // Limpa estados de interação ao trocar de pavimento
    selectedOpeningId = null;
    hoveredControlPoint = null;
    isCreatingOpening = false;
    virtualOpening = null;
    isResizingOpening = false;
    resizingOpeningId = null;
    resizingControlPoint = null;
    resizeStartPosition = null;
    originalOpeningData = null;
});
/**
 * Estrutura simplificada da abertura
 */
class Opening {
    constructor(wall, startPosition, endPosition, type = 'door', options = {}) {
        this.id = generateId(ID_PREFIXES.OPENING);
        this.originalWallId = wall.id;
        this.parentWallId = wall.id; // Adicionado para facilitar duplicação
        this.parentAreaId = wall.parentAreaId || options.parentAreaId || null;
        this.type = type;
        
        // === BOUNDARY OPENING SUPPORT ===
        // Indica se esta abertura está em uma borda da área de movimentação
        this.isBoundaryOpening = options.isBoundaryOpening || false;
        // Índice da aresta na área (para aberturas de borda)
        this.boundaryEdgeIndex = options.boundaryEdgeIndex ?? null;
        // ID da área de borda (para aberturas de borda)
        this.boundaryAreaId = options.boundaryAreaId || null;
        // Vetor normal apontando para fora da área (para hub attachment)
        this.outwardNormal = options.outwardNormal || null;
        
        // Posições na parede original (0-1)
        this.startPosition = Math.min(startPosition, endPosition);
        this.endPosition = Math.max(startPosition, endPosition);
        
        // IDs das duas novas paredes criadas
        this.wallBefore = null; // Parede antes da abertura
        this.wallAfter = null;  // Parede depois da abertura
        
        // Pontos absolutos da abertura
        this.startPoint = this.calculateAbsolutePoint(wall, this.startPosition);
        this.endPoint = this.calculateAbsolutePoint(wall, this.endPosition);
        this.selected = false;
        this.visible = true;
        this.name = options.name || null; // Nome personalizado da abertura (ex: "DOCA RECEBIMENTO")
        
        // NOVO: Guardar pontos da parede original
        this.originalWallStart = wall.startPoint ? [...wall.startPoint] : null;
        this.originalWallEnd = wall.endPoint ? [...wall.endPoint] : null;
    }
    calculateAbsolutePoint(wall, position) {
        const dx = wall.endPoint[0] - wall.startPoint[0];
        const dy = wall.endPoint[1] - wall.startPoint[1];
        return [
            wall.startPoint[0] + dx * position,
            wall.startPoint[1] + dy * position
        ];
    }
    getWidth() {
        const dx = this.endPoint[0] - this.startPoint[0];
        const dy = this.endPoint[1] - this.startPoint[1];
        return Math.sqrt(dx * dx + dy * dy) / pixelsPerCm; // em cm
    }
}
/**
 * Abertura virtual que segue o mouse antes do clique
 */
class VirtualOpening {
    constructor(wall, mousePosition, width = DEFAULT_OPENING_WIDTH) {
        this.wall = wall;
        this.centerPosition = mousePosition; // Posição 0-1 na parede
        this.width = width;
        
        const wallLength = this.getWallLength(wall);
        const minSegmentRatio = (MIN_OPENING_SEGMENT_CM * (pixelsPerCm || 0.5)) / wallLength;
        
        // Calcular posições de início e fim
        const halfWidthRatio = (width * pixelsPerCm) / (2 * wallLength);
        this.startPosition = Math.max(minSegmentRatio, mousePosition - halfWidthRatio);
        this.endPosition = Math.min(1 - minSegmentRatio, mousePosition + halfWidthRatio);
        // Pontos absolutos
        this.startPoint = this.calculateAbsolutePoint(wall, this.startPosition);
        this.endPoint = this.calculateAbsolutePoint(wall, this.endPosition);
    }
    calculateAbsolutePoint(wall, position) {
        const dx = wall.endPoint[0] - wall.startPoint[0];
        const dy = wall.endPoint[1] - wall.startPoint[1];
        return [
            wall.startPoint[0] + dx * position,
            wall.startPoint[1] + dy * position
        ];
    }
    getWallLength(wall) {
        const dx = wall.endPoint[0] - wall.startPoint[0];
        const dy = wall.endPoint[1] - wall.startPoint[1];
        return Math.sqrt(dx * dx + dy * dy);
    }
}

/**
 * Calcula a largura de uma abertura em cm
 * Funciona tanto com instâncias da classe Opening quanto com objetos simples (carregados de arquivo)
 */
function calculateOpeningWidth(opening) {
    if (!opening || !opening.startPoint || !opening.endPoint) return 0;
    const dx = opening.endPoint[0] - opening.startPoint[0];
    const dy = opening.endPoint[1] - opening.startPoint[1];
    return Math.sqrt(dx * dx + dy * dy) / pixelsPerCm; // em cm
}

/**
 * Encontra uma parede na posição especificada e calcula a posição relativa.
 * Também detecta bordas de áreas de movimentação (boundary edges).
 */
function findWallAtPosition(x, y) {
    const tolerance = 15 / getScale(); // Tolerância em coordenadas do mundo
    
    // 1. Primeiro, tentar encontrar uma parede interna real
    for (let wall of walls) {
        if (!wall.startPoint || !wall.endPoint) continue;
        const A = x - wall.startPoint[0];
        const B = y - wall.startPoint[1];
        const C = wall.endPoint[0] - wall.startPoint[0];
        const D = wall.endPoint[1] - wall.startPoint[1];
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        if (lenSq === 0) continue;
        const param = dot / lenSq;
        if (param < 0 || param > 1) continue;
        const closestX = wall.startPoint[0] + param * C;
        const closestY = wall.startPoint[1] + param * D;
        const distance = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
        if (distance <= tolerance) {
            return {
                wall: wall,
                position: param,
                closestPoint: { x: closestX, y: closestY },
                distance: distance
            };
        }
    }
    
    // 2. Se não encontrou parede interna, tentar bordas de áreas de movimentação
    return findBoundaryEdgeAtPosition(x, y, tolerance);
}

/**
 * Encontra uma borda de área de movimentação na posição especificada.
 * Cria um objeto "virtual wall" que representa a borda da área.
 * @param {number} x - Coordenada X do mouse
 * @param {number} y - Coordenada Y do mouse
 * @param {number} tolerance - Tolerância de detecção
 * @returns {Object|null} Resultado com wall virtual, position, etc.
 */
function findBoundaryEdgeAtPosition(x, y, tolerance) {
    let bestResult = null;
    let bestDistance = Infinity;
    
    for (const area of movementAreas) {
        const vertices = area.vertices || [];
        if (vertices.length < 3) continue;
        
        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];
            
            const A = x - p1[0];
            const B = y - p1[1];
            const C = p2[0] - p1[0];
            const D = p2[1] - p1[1];
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            if (lenSq === 0) continue;
            const param = dot / lenSq;
            if (param < 0 || param > 1) continue;
            
            const closestX = p1[0] + param * C;
            const closestY = p1[1] + param * D;
            const distance = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
            
            if (distance <= tolerance && distance < bestDistance) {
                // Calcular vetor normal apontando para fora da área
                const edgeLen = Math.sqrt(lenSq);
                const nx = -D / edgeLen; // Normal perpendicular
                const ny = C / edgeLen;
                
                // Verificar se a normal aponta para fora da área (teste com ponto deslocado)
                const testX = (p1[0] + p2[0]) / 2 + nx * 5;
                const testY = (p1[1] + p2[1]) / 2 + ny * 5;
                let normalPointsOut = !isPointInsidePolygon(testX, testY, vertices);
                
                const outNx = normalPointsOut ? nx : -nx;
                const outNy = normalPointsOut ? ny : -ny;
                
                // Criar objeto "virtual wall" que representa esta borda
                const virtualWallId = `boundary-${area.id}-edge-${i}`;
                const virtualWall = {
                    id: virtualWallId,
                    startPoint: [...p1],
                    endPoint: [...p2],
                    parentAreaId: area.id,
                    type: 'boundary',
                    isBoundaryEdge: true,
                    boundaryEdgeIndex: i,
                    boundaryAreaId: area.id,
                    length: edgeLen,
                    angle: Math.atan2(D, C),
                    showDimensions: false
                };
                
                bestResult = {
                    wall: virtualWall,
                    position: param,
                    closestPoint: { x: closestX, y: closestY },
                    distance: distance,
                    isBoundaryEdge: true,
                    boundaryAreaId: area.id,
                    boundaryEdgeIndex: i,
                    outwardNormal: { x: outNx, y: outNy }
                };
                bestDistance = distance;
            }
        }
    }
    
    return bestResult;
}

/**
 * Verifica se um ponto está dentro de um polígono (ray casting)
 */
function isPointInsidePolygon(px, py, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i][0], yi = vertices[i][1];
        const xj = vertices[j][0], yj = vertices[j][1];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}
/**
 * Atualiza a abertura virtual baseada na posição do mouse
 */
function updateVirtualOpening(mouseX, mouseY) {
    if (!isCreatingOpening) {
        virtualOpening = null;
        return;
    }
    const wallHit = findWallAtPosition(mouseX, mouseY);
    if (wallHit) {
        virtualOpening = new VirtualOpening(wallHit.wall, wallHit.position);
        // Guardar informações de boundary para uso na confirmação
        virtualOpening._wallHit = wallHit;
        virtualOpening._isBoundaryEdge = wallHit.isBoundaryEdge || false;
    } else {
        virtualOpening = null;
    }
}
/**
 * Desenha a abertura virtual
 */
function drawVirtualOpening() {
    if (!virtualOpening) return;
    const ctx = getCtx();
    ctx.save();
    // Desenhar a abertura virtual com transparência
    ctx.globalAlpha = 0.6;
    
    // Cor diferente para aberturas de borda vs paredes internas
    const isBoundary = virtualOpening._isBoundaryEdge || false;
    const previewColor = isBoundary ? '#2e7d32' : '#FF6B35';
    
    // Desenhar o corte na parede (linha mais grossa)
    ctx.strokeStyle = previewColor;
    ctx.lineWidth = Math.max(2, 8 / getScale()); // Espessura mínima de 2 pixels
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(virtualOpening.startPoint[0], virtualOpening.startPoint[1]);
    ctx.lineTo(virtualOpening.endPoint[0], virtualOpening.endPoint[1]);
    ctx.stroke();
    // Desenhar cubos de controle virtuais com tamanho limitado
    const cubeSize = getScaledSizeWithLimits(8, getScale(), openingControlMinSize, openingControlMaxSize);
    ctx.fillStyle = previewColor;
    // Cubo de início
    ctx.fillRect(
        virtualOpening.startPoint[0] - cubeSize/2, 
        virtualOpening.startPoint[1] - cubeSize/2, 
        cubeSize, 
        cubeSize
    );
    // Cubo de fim
    ctx.fillRect(
        virtualOpening.endPoint[0] - cubeSize/2, 
        virtualOpening.endPoint[1] - cubeSize/2, 
        cubeSize, 
        cubeSize
    );
    // Mostrar largura
    const midX = (virtualOpening.startPoint[0] + virtualOpening.endPoint[0]) / 2;
    const midY = (virtualOpening.startPoint[1] + virtualOpening.endPoint[1]) / 2;
      ctx.globalAlpha = 1.0;
    ctx.fillStyle = previewColor;
    
    // Sistema unificado de cotas para aberturas virtuais
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('openings', getScale());
    const scaledTextOffset = getScaledSizeWithLimits(15, getScale(), openingTextOffsetMin, openingTextOffsetMax);
    
    ctx.font = fontConfig.string;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Mostrar "DOCA" para aberturas de borda
    const labelText = isBoundary 
        ? `DOCA ${Math.round(virtualOpening.width)} cm`
        : `${Math.round(virtualOpening.width)} cm`;
    ctx.fillText(labelText, midX, midY - scaledTextOffset);
    ctx.restore();

    if (getGlobalShowDimensions()) {
        drawOpeningDimensionLine(virtualOpening);
    }
}
/**
 * Cria uma abertura real dividindo a parede.
 * Suporta tanto paredes internas quanto bordas de áreas de movimentação.
 */
function createOpening(wallHit, type = 'door') {
    if (!wallHit || !virtualOpening) return null;
    const wall = wallHit.wall;
    
    // Verificar se é uma abertura de borda (boundary opening)
    const isBoundary = wallHit.isBoundaryEdge || wall.isBoundaryEdge || false;
    
    const openingOptions = {
        isBoundaryOpening: isBoundary,
        boundaryEdgeIndex: wallHit.boundaryEdgeIndex ?? null,
        boundaryAreaId: wallHit.boundaryAreaId || null,
        parentAreaId: wall.parentAreaId || null,
        outwardNormal: wallHit.outwardNormal || null
    };
    
    const opening = new Opening(wall, virtualOpening.startPosition, virtualOpening.endPosition, type, openingOptions);
    
    // Para aberturas de borda, criar paredes de borda reais no array de walls
    if (isBoundary) {
        return createBoundaryOpening(wall, opening, wallHit);
    }
    
    // Fluxo normal para paredes internas
    const wallIndex = walls.findIndex(w => w.id === wall.id);
    if (wallIndex === -1) {
        return null;
    }
    saveStateToHistory('Criar abertura');
    
    // Verificar se a parede é visual (criada em união de áreas)
    const isVisualWall = wall.isVisual || false;
    
    // Tentar encontrar paredes idênticas (possível duplicação)
    const identicalWalls = walls.filter(w => 
        w.id !== wall.id &&
        Math.abs(w.startPoint[0] - wall.startPoint[0]) < 1 && 
        Math.abs(w.startPoint[1] - wall.startPoint[1]) < 1 &&
        Math.abs(w.endPoint[0] - wall.endPoint[0]) < 1 &&
        Math.abs(w.endPoint[1] - wall.endPoint[1]) < 1);
    
    if (identicalWalls.length > 0) {
    }
    
    // Remover a parede original com verificação extra para paredes visuais
    walls.splice(wallIndex, 1);
    
    // Verificação adicional para garantir que a parede foi removida
    const wallStillExists = walls.some(w => w.id === wall.id);
    if (wallStillExists) {
        const newWallIndex = walls.findIndex(w => w.id === wall.id);
        if (newWallIndex !== -1) {
            walls.splice(newWallIndex, 1);
        }
    }
    
    // Verificar novamente
    const stillExistsAfterSecondAttempt = walls.some(w => w.id === wall.id);
    if (stillExistsAfterSecondAttempt) {
    }

    // Criar IDs únicos para as novas paredes para evitar duplicatas
    const wallBeforeId = generateId(ID_PREFIXES.WALL);
    const wallAfterId = generateId(ID_PREFIXES.WALL);
    
    
    // Verificar e remover possíveis paredes duplicadas antes de criar novas
    const duplicatesBefore = walls.filter(w => 
        Math.abs(w.startPoint[0] - wall.startPoint[0]) < 1 && 
        Math.abs(w.startPoint[1] - wall.startPoint[1]) < 1 &&
        Math.abs(w.endPoint[0] - opening.startPoint[0]) < 1 &&
        Math.abs(w.endPoint[1] - opening.startPoint[1]) < 1);
    
    if (duplicatesBefore.length > 0) {
        duplicatesBefore.forEach(dupWall => {
            const dupIndex = walls.findIndex(w => w.id === dupWall.id);
            if (dupIndex !== -1) {
                walls.splice(dupIndex, 1);
            }
        });
    }
    
    const duplicatesAfter = walls.filter(w => 
        Math.abs(w.startPoint[0] - opening.endPoint[0]) < 1 && 
        Math.abs(w.startPoint[1] - opening.endPoint[1]) < 1 &&
        Math.abs(w.endPoint[0] - wall.endPoint[0]) < 1 &&
        Math.abs(w.endPoint[1] - wall.endPoint[1]) < 1);
    
    if (duplicatesAfter.length > 0) {
        duplicatesAfter.forEach(dupWall => {
            const dupIndex = walls.findIndex(w => w.id === dupWall.id);
            if (dupIndex !== -1) {
                walls.splice(dupIndex, 1);
            }
        });
    }
    
    // Verificar se a parede original continua no array de alguma forma (busca ampliada)
    // Precisamos de uma busca robusta considerando que pode haver pequenas diferenças numéricas
    // Incrementamos a tolerância para ter certeza de capturar paredes duplicadas
    const wallStillExistsAfterCleanup = walls.filter(w => {
        // Verificamos se é a mesma parede (mesma posição)
        const samePosition = 
            Math.abs(w.startPoint[0] - wall.startPoint[0]) < 2 && 
            Math.abs(w.startPoint[1] - wall.startPoint[1]) < 2 &&
            Math.abs(w.endPoint[0] - wall.endPoint[0]) < 2 && 
            Math.abs(w.endPoint[1] - wall.endPoint[1]) < 2;
            
        // Ou se é a mesma parede com pontos invertidos
        const reversedPosition = 
            Math.abs(w.startPoint[0] - wall.endPoint[0]) < 2 && 
            Math.abs(w.startPoint[1] - wall.endPoint[1]) < 2 &&
            Math.abs(w.endPoint[0] - wall.startPoint[0]) < 2 && 
            Math.abs(w.endPoint[1] - wall.startPoint[1]) < 2;
            
        return samePosition || reversedPosition;
    });
        
    if (wallStillExistsAfterCleanup.length > 0) {
        // Remover forçadamente todas as instâncias da parede original
        for (let i = walls.length - 1; i >= 0; i--) {
            const w = walls[i];
            // Verificamos com os mesmos critérios acima
            const samePosition = 
                Math.abs(w.startPoint[0] - wall.startPoint[0]) < 2 && 
                Math.abs(w.startPoint[1] - wall.startPoint[1]) < 2 &&
                Math.abs(w.endPoint[0] - wall.endPoint[0]) < 2 && 
                Math.abs(w.endPoint[1] - wall.endPoint[1]) < 2;
                
            const reversedPosition = 
                Math.abs(w.startPoint[0] - wall.endPoint[0]) < 2 && 
                Math.abs(w.startPoint[1] - wall.endPoint[1]) < 2 &&
                Math.abs(w.endPoint[0] - wall.startPoint[0]) < 2 && 
                Math.abs(w.endPoint[1] - wall.startPoint[1]) < 2;
                
            if (samePosition || reversedPosition) {
                walls.splice(i, 1);
            }
        }
    }

    // Verificação final para garantir que não existem paredes duplicadas
    // que possam interferir com a criação das novas paredes da abertura
    const finalCheck = () => {
        for (let i = walls.length - 1; i >= 0; i--) {
            const w = walls[i];
            // Se tem alguma parede que corresponda à original ou parte dela
            if (
                // Parede original
                (Math.abs(w.startPoint[0] - wall.startPoint[0]) < 2 && 
                Math.abs(w.startPoint[1] - wall.startPoint[1]) < 2 &&
                Math.abs(w.endPoint[0] - wall.endPoint[0]) < 2 && 
                Math.abs(w.endPoint[1] - wall.endPoint[1]) < 2) ||
                // Ou parte da original (início à abertura)
                (Math.abs(w.startPoint[0] - wall.startPoint[0]) < 2 && 
                Math.abs(w.startPoint[1] - wall.startPoint[1]) < 2 &&
                Math.abs(w.endPoint[0] - opening.startPoint[0]) < 2 && 
                Math.abs(w.endPoint[1] - opening.startPoint[1]) < 2) ||
                // Ou parte da original (abertura ao fim)
                (Math.abs(w.startPoint[0] - opening.endPoint[0]) < 2 && 
                Math.abs(w.startPoint[1] - opening.endPoint[1]) < 2 &&
                Math.abs(w.endPoint[0] - wall.endPoint[0]) < 2 && 
                Math.abs(w.endPoint[1] - wall.endPoint[1]) < 2)
            ) {
                walls.splice(i, 1);
            }
        }
    };
    
    // Fazer limpeza final antes de criar novas paredes
    finalCheck();

    const minimalSegmentLengthPx = MIN_OPENING_SEGMENT_CM * pixelsPerCm;

    // Criar parede antes da abertura (se houver espaço suficiente)
    const beforeDx = opening.startPoint[0] - wall.startPoint[0];
    const beforeDy = opening.startPoint[1] - wall.startPoint[1];
    const beforeLength = Math.sqrt(beforeDx * beforeDx + beforeDy * beforeDy);
    if (beforeLength >= minimalSegmentLengthPx) {
        const dx = opening.startPoint[0] - wall.startPoint[0];
        const dy = opening.startPoint[1] - wall.startPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const wallBefore = {
            id: wallBeforeId,
            startPoint: [...wall.startPoint],
            endPoint: [...opening.startPoint],
            parentAreaId: wall.parentAreaId,
            type: wall.type || 'wall',
            isVisual: isVisualWall, // Usar a variável que já verificamos
            length: length,
            angle: Math.atan2(dy, dx),
            showDimensions: true // Usar apenas controle global
        };
        walls.push(wallBefore);
        opening.wallBefore = wallBefore.id;
    }

    // Criar parede depois da abertura (se houver espaço suficiente)
    const afterDx = wall.endPoint[0] - opening.endPoint[0];
    const afterDy = wall.endPoint[1] - opening.endPoint[1];
    const afterLength = Math.sqrt(afterDx * afterDx + afterDy * afterDy);
    if (afterLength >= minimalSegmentLengthPx) {
        const dx = wall.endPoint[0] - opening.endPoint[0];
        const dy = wall.endPoint[1] - opening.endPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const wallAfter = {
            id: wallAfterId,
            startPoint: [...opening.endPoint],
            endPoint: [...wall.endPoint],
            parentAreaId: wall.parentAreaId,
            type: wall.type || 'wall',
            isVisual: isVisualWall, // Usar a variável que já verificamos
            length: length,
            angle: Math.atan2(dy, dx),
            showDimensions: true // Usar apenas controle global
        };
        walls.push(wallAfter);
        opening.wallAfter = wallAfter.id;
    }
    
    
    // Verificação final para garantir que a parede original não existe mais
    const originalStillExists = walls.some(w => w.id === wall.id);
    if (originalStillExists) {
    }
    openings.push(opening);
    
    // 🔔 Notificar sistema sobre criação de abertura
    if (typeof layoutChangeNotifier !== 'undefined') {
        layoutChangeNotifier.notifyChange('opening', {
            action: 'create',
            entity: opening
        });
    }
    
    return opening;
}

/**
 * Cria uma abertura em uma borda de área de movimentação.
 * Cria paredes de borda reais no array de walls para que o sistema de corte funcione.
 */
function createBoundaryOpening(virtualWall, opening, wallHit) {
    saveStateToHistory('Criar abertura em borda');
    
    const minimalSegmentLengthPx = MIN_OPENING_SEGMENT_CM * pixelsPerCm;
    
    // Criar parede antes da abertura (se houver espaço suficiente)
    const beforeDx = opening.startPoint[0] - virtualWall.startPoint[0];
    const beforeDy = opening.startPoint[1] - virtualWall.startPoint[1];
    const beforeLength = Math.sqrt(beforeDx * beforeDx + beforeDy * beforeDy);
    
    if (beforeLength >= minimalSegmentLengthPx) {
        const dx = opening.startPoint[0] - virtualWall.startPoint[0];
        const dy = opening.startPoint[1] - virtualWall.startPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const wallBefore = {
            id: generateId(ID_PREFIXES.WALL),
            startPoint: [...virtualWall.startPoint],
            endPoint: [...opening.startPoint],
            parentAreaId: virtualWall.parentAreaId,
            type: 'boundary',
            isBoundaryEdge: true,
            boundaryAreaId: wallHit.boundaryAreaId,
            boundaryEdgeIndex: wallHit.boundaryEdgeIndex,
            length: length,
            angle: Math.atan2(dy, dx),
            showDimensions: false
        };
        walls.push(wallBefore);
        opening.wallBefore = wallBefore.id;
    }
    
    // Criar parede depois da abertura (se houver espaço suficiente)
    const afterDx = virtualWall.endPoint[0] - opening.endPoint[0];
    const afterDy = virtualWall.endPoint[1] - opening.endPoint[1];
    const afterLength = Math.sqrt(afterDx * afterDx + afterDy * afterDy);
    
    if (afterLength >= minimalSegmentLengthPx) {
        const dx = virtualWall.endPoint[0] - opening.endPoint[0];
        const dy = virtualWall.endPoint[1] - opening.endPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const wallAfter = {
            id: generateId(ID_PREFIXES.WALL),
            startPoint: [...opening.endPoint],
            endPoint: [...virtualWall.endPoint],
            parentAreaId: virtualWall.parentAreaId,
            type: 'boundary',
            isBoundaryEdge: true,
            boundaryAreaId: wallHit.boundaryAreaId,
            boundaryEdgeIndex: wallHit.boundaryEdgeIndex,
            length: length,
            angle: Math.atan2(dy, dx),
            showDimensions: false
        };
        walls.push(wallAfter);
        opening.wallAfter = wallAfter.id;
    }
    
    openings.push(opening);
    
    // 🔔 Notificar sistema sobre criação de abertura de borda
    if (typeof layoutChangeNotifier !== 'undefined') {
        layoutChangeNotifier.notifyChange('opening', {
            action: 'create',
            entity: opening,
            isBoundary: true
        });
    }
    
    return opening;
}

/**
 * Desenha uma abertura (os cubos de controle)
 */
function drawOpening(opening) {
    if (!opening.visible) {
        return;
    }
    const ctx = getCtx();
    const isSelected = selectedOpeningId === opening.id;
    
    ctx.save();
    const baseCubeSize = isSelected ? 10 : 8;
    const cubeSize = getScaledSizeWithLimits(baseCubeSize, getScale(), openingControlMinSize, openingControlMaxSize);
    const cubeColor = isSelected ? '#2196F3' : '#666666';
    
    // Criar gap visual transparente que deixa o grid visível
    ctx.save();
    
    // Calcular as coordenadas do grid que passam pela abertura
    const gapWidth = Math.max(12, 10 / getScale());
    
    // Cor diferente para aberturas de borda (doca/recebimento/expedição)
    const isBoundary = opening.isBoundaryOpening || false;
    const bgColor = isBoundary ? '#e8f5e9' : '#f8f9fa';
    
    // Desenhar linha de fundo que simula o grid
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = gapWidth;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(opening.startPoint[0], opening.startPoint[1]);
    ctx.lineTo(opening.endPoint[0], opening.endPoint[1]);
    ctx.stroke();
    
    // Desenhar linhas do grid por cima para simular transparência
    const gridSpacing = 50; // Espaçamento do grid em pixels
    const scale = getScale();
    
    // Calcular direção perpendicular para desenhar linhas do grid
    const dx = opening.endPoint[0] - opening.startPoint[0];
    const dy = opening.endPoint[1] - opening.startPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 0) {
        const perpX = -dy / length;
        const perpY = dx / length;
        
        // Desenhar algumas linhas de grid atravessando a abertura
        ctx.strokeStyle = '#e9ecef';
        ctx.lineWidth = 1 / scale;
        
        const numLines = Math.ceil(gapWidth / (gridSpacing / scale));
        for (let i = -numLines; i <= numLines; i++) {
            const offsetX = perpX * i * (gridSpacing / scale);
            const offsetY = perpY * i * (gridSpacing / scale);
            
            ctx.beginPath();
            ctx.moveTo(
                opening.startPoint[0] + offsetX - dx * 0.1,
                opening.startPoint[1] + offsetY - dy * 0.1
            );
            ctx.lineTo(
                opening.endPoint[0] + offsetX + dx * 0.1,
                opening.endPoint[1] + offsetY + dy * 0.1
            );
            ctx.stroke();
        }
    }
    
    ctx.restore();
    
    // Desenhar indicador visual para aberturas de borda (seta para fora + ícone de doca)
    if (isBoundary) {
        drawBoundaryOpeningIndicator(opening, isSelected);
    }
    
    // Cores de hover para os cubos — só aplica na abertura selecionada
    const boundaryColor = isBoundary ? '#2e7d32' : null;
    let startCubeColor = boundaryColor || cubeColor;
    let endCubeColor = boundaryColor || cubeColor;
    if (isSelected && hoveredControlPoint === 'start') {
        startCubeColor = '#FF9800';
    } else if (isSelected && hoveredControlPoint === 'end') {
        endCubeColor = '#FF9800';
    }
    // Desenhar cubo de início
    ctx.fillStyle = startCubeColor;
    ctx.fillRect(
        opening.startPoint[0] - cubeSize/2, 
        opening.startPoint[1] - cubeSize/2, 
        cubeSize, 
        cubeSize
    );
    // Desenhar cubo de fim
    ctx.fillStyle = endCubeColor;
    ctx.fillRect(
        opening.endPoint[0] - cubeSize/2, 
        opening.endPoint[1] - cubeSize/2, 
        cubeSize, 
        cubeSize
    );
        // Mostrar largura se selecionada
        if (isSelected) {
        const midX = (opening.startPoint[0] + opening.endPoint[0]) / 2;
        const midY = (opening.startPoint[1] + opening.endPoint[1]) / 2;
          ctx.fillStyle = '#2196F3';
        
        // Sistema unificado de cotas para aberturas
        const fontConfig = DIMENSION_SYSTEM.getFontConfig('openings', getScale());
        const scaledTextOffset = getScaledSizeWithLimits(15, getScale(), openingTextOffsetMin, openingTextOffsetMax);
        
        ctx.font = fontConfig.string;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const openingWidth = calculateOpeningWidth(opening);
        ctx.fillText(`${Math.round(openingWidth)} cm`, midX, midY - scaledTextOffset);
    }
    ctx.restore();
    if (getGlobalShowDimensions()) {
        drawOpeningDimensionLine(opening);
    }
}

function drawOpeningDimensionLine(opening) {
    if (!opening || !opening.startPoint || !opening.endPoint) return;
    if (!getGlobalShowDimensions()) return;
    const ctx = getCtx();
    const scale = getScale();
    const dx = opening.endPoint[0] - opening.startPoint[0];
    const dy = opening.endPoint[1] - opening.startPoint[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.001) return;

    const nx = -dy / length;
    const ny = dx / length;
    const offsetDistance = Math.max(10 / scale, 12 / scale);
    const startDim = [opening.startPoint[0] + nx * offsetDistance, opening.startPoint[1] + ny * offsetDistance];
    const endDim = [opening.endPoint[0] + nx * offsetDistance, opening.endPoint[1] + ny * offsetDistance];
    ctx.save();
    ctx.lineWidth = dimensionLineWidth / scale;
    ctx.strokeStyle = '#343a40';
    ctx.setLineDash([4 / scale, 3 / scale]);
    ctx.beginPath();
    ctx.moveTo(startDim[0], startDim[1]);
    ctx.lineTo(endDim[0], endDim[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    const tickSizeScaled = dimensionTickSize / scale;
    ctx.beginPath();
    ctx.moveTo(startDim[0] - nx * tickSizeScaled, startDim[1] - ny * tickSizeScaled);
    ctx.lineTo(startDim[0] + nx * tickSizeScaled, startDim[1] + ny * tickSizeScaled);
    ctx.moveTo(endDim[0] - nx * tickSizeScaled, endDim[1] - ny * tickSizeScaled);
    ctx.lineTo(endDim[0] + nx * tickSizeScaled, endDim[1] + ny * tickSizeScaled);
    ctx.stroke();
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('openings', scale);
    ctx.font = fontConfig.string;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const openingWidthCm = calculateOpeningWidth(opening);
    const widthText = `${Math.round(openingWidthCm * 10) / 10} cm`;
    const midX = (startDim[0] + endDim[0]) / 2;
    const midY = (startDim[1] + endDim[1]) / 2;
    const textOffset = 8 / scale;
    const textMetrics = ctx.measureText(widthText);
    const textBackHeight = fontConfig.size + 2 / scale;
    const textX = midX + nx * textOffset;
    const textY = midY + ny * textOffset;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(
        textX - textMetrics.width / 2 - 2 / scale,
        textY - textBackHeight / 2 - 1 / scale,
        textMetrics.width + 4 / scale,
        textBackHeight
    );
    ctx.fillStyle = '#343a40';
    ctx.fillText(widthText, textX, textY);
    ctx.restore();
}
/**
 * Desenha todas as aberturas
 */
function drawAllOpenings() {
    openings.forEach(opening => drawOpening(opening));
    drawVirtualOpening();
}
/**
 * Encontra qual cubo de controle está sendo hovereado
 */
function findHoveredControlPoint(x, y) {
    if (!selectedOpeningId) return null;
      const opening = openings.find(o => o.id === selectedOpeningId);
    if (!opening) return null;
    const tolerance = 15 / getScale();
    // Verificar cubo de início
    const distStart = Math.sqrt(
        (x - opening.startPoint[0]) ** 2 + (y - opening.startPoint[1]) ** 2
    );
    if (distStart <= tolerance) {
        return 'start';
    }
    // Verificar cubo de fim
    const distEnd = Math.sqrt(
        (x - opening.endPoint[0]) ** 2 + (y - opening.endPoint[1]) ** 2
    );
    if (distEnd <= tolerance) {
        return 'end';
    }
    return null;
}
/**
 * Encontra abertura na posição especificada
 */
function findOpeningAtPosition(x, y) {
    const tolerance = 20 / getScale();
    for (let opening of openings) {
        // Verificar distância até o centro da abertura
        const centerX = (opening.startPoint[0] + opening.endPoint[0]) / 2;
        const centerY = (opening.startPoint[1] + opening.endPoint[1]) / 2;
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distance <= tolerance) {
            return opening;
        }
    }
    return null;
}
/**
 * Remove uma abertura e reconstrói a parede original
 */
function deleteOpening(openingId) {
    const opening = openings.find(o => o.id === openingId);
    if (!opening) return false;
    
    // === BOUNDARY OPENING: apenas remover paredes de borda, não reconstruir ===
    if (opening.isBoundaryOpening) {
        saveStateToHistory('Excluir abertura de borda');
        // Remover paredes de borda criadas para esta abertura
        if (opening.wallBefore) {
            const idx = walls.findIndex(w => w.id === opening.wallBefore);
            if (idx > -1) walls.splice(idx, 1);
        }
        if (opening.wallAfter) {
            const idx = walls.findIndex(w => w.id === opening.wallAfter);
            if (idx > -1) walls.splice(idx, 1);
        }
        // Remover a abertura
        const openingIndex = openings.findIndex(o => o.id === openingId);
        if (openingIndex > -1) {
            openings.splice(openingIndex, 1);
            if (selectedOpeningId === openingId) {
                selectedOpeningId = null;
            }
            // 🔔 Notificar sistema
            if (typeof layoutChangeNotifier !== 'undefined') {
                layoutChangeNotifier.notifyChange('opening', {
                    action: 'delete',
                    entityId: openingId,
                    isBoundary: true
                });
            }
            return true;
        }
        return false;
    }
    
    // === FLUXO NORMAL para paredes internas ===
    // Encontrar as paredes antes e depois
    const wallBefore = walls.find(w => w.id === opening.wallBefore);
    const wallAfter = walls.find(w => w.id === opening.wallAfter);
    let originalStartPoint, originalEndPoint, parentAreaId;
    if (wallBefore && wallAfter) {
        // Ambas as paredes existem
        originalStartPoint = wallBefore.startPoint;
        originalEndPoint = wallAfter.endPoint;
        parentAreaId = wallBefore.parentAreaId || wallAfter.parentAreaId;
        // Remover as duas paredes com verificação adicional
        const beforeIndex = walls.findIndex(w => w.id === opening.wallBefore);
        const afterIndex = walls.findIndex(w => w.id === opening.wallAfter);
        if (beforeIndex > -1) {
            walls.splice(beforeIndex, 1);
            // Verificação adicional
            if (walls.some(w => w.id === opening.wallBefore)) {
                const newBeforeIndex = walls.findIndex(w => w.id === opening.wallBefore);
                if (newBeforeIndex !== -1) walls.splice(newBeforeIndex, 1);
            }
        }
        if (afterIndex > -1) {
            walls.splice(afterIndex, 1);
            // Verificação adicional
            if (walls.some(w => w.id === opening.wallAfter)) {
                const newAfterIndex = walls.findIndex(w => w.id === opening.wallAfter);
                if (newAfterIndex !== -1) walls.splice(newAfterIndex, 1);
            }
        }
    } else if (wallBefore) {
        // Só a parede antes existe
        originalStartPoint = wallBefore.startPoint;
        originalEndPoint = opening.endPoint;
        parentAreaId = wallBefore.parentAreaId;
        const beforeIndex = walls.findIndex(w => w.id === opening.wallBefore);
        if (beforeIndex > -1) {
            walls.splice(beforeIndex, 1);
            // Verificação adicional
            if (walls.some(w => w.id === opening.wallBefore)) {
                const newBeforeIndex = walls.findIndex(w => w.id === opening.wallBefore);
                if (newBeforeIndex !== -1) walls.splice(newBeforeIndex, 1);
            }
        }
    } else if (wallAfter) {
        // Só a parede depois existe
        originalStartPoint = opening.startPoint;
        originalEndPoint = wallAfter.endPoint;
        parentAreaId = wallAfter.parentAreaId;
        const afterIndex = walls.findIndex(w => w.id === opening.wallAfter);
        if (afterIndex > -1) {
            walls.splice(afterIndex, 1);
            // Verificação adicional
            if (walls.some(w => w.id === opening.wallAfter)) {
                const newAfterIndex = walls.findIndex(w => w.id === opening.wallAfter);
                if (newAfterIndex !== -1) walls.splice(newAfterIndex, 1);
            }
        }
    }
    // Verificar e remover possíveis duplicatas da parede original antes de recriá-la
    if (originalStartPoint && originalEndPoint) {
        
        // Verificar se já existe uma parede similar
        const duplicates = walls.filter(w => 
            Math.abs(w.startPoint[0] - originalStartPoint[0]) < 1 && 
            Math.abs(w.startPoint[1] - originalStartPoint[1]) < 1 &&
            Math.abs(w.endPoint[0] - originalEndPoint[0]) < 1 &&
            Math.abs(w.endPoint[1] - originalEndPoint[1]) < 1);
        
        if (duplicates.length > 0) {
            duplicates.forEach(dupWall => {
                const dupIndex = walls.findIndex(w => w.id === dupWall.id);
                if (dupIndex !== -1) {
                    walls.splice(dupIndex, 1);
                }
            });
        }

        const dx = originalEndPoint[0] - originalStartPoint[0];
        const dy = originalEndPoint[1] - originalStartPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Herdar propriedade isVisual de uma das paredes segmentadas (se existir)
        const isVisualWall = (wallBefore && wallBefore.isVisual) || (wallAfter && wallAfter.isVisual) || false;
        
        const originalWall = {
            id: opening.originalWallId, // Manter o ID original se possível
            startPoint: originalStartPoint,
            endPoint: originalEndPoint,
            parentAreaId: parentAreaId,
            type: 'wall',
            isVisual: isVisualWall, // Herdar propriedade visual das paredes segmentadas
            length: length,
            angle: Math.atan2(dy, dx),
            showDimensions: true // Usar apenas controle global
        };
        walls.push(originalWall);
        
        // Verificar se existem paredes duplicadas após a reconstrução
        const duplicatesAfterReconstruction = walls.filter(w => 
            w.id !== originalWall.id && 
            Math.abs(w.startPoint[0] - originalStartPoint[0]) < 1 && 
            Math.abs(w.startPoint[1] - originalStartPoint[1]) < 1 &&
            Math.abs(w.endPoint[0] - originalEndPoint[0]) < 1 &&
            Math.abs(w.endPoint[1] - originalEndPoint[1]) < 1);
            
        if (duplicatesAfterReconstruction.length > 0) {
        }
    }
    // Remover a abertura
    const openingIndex = openings.findIndex(o => o.id === openingId);
    if (openingIndex > -1) {
        openings.splice(openingIndex, 1);
        if (selectedOpeningId === openingId) {
            selectedOpeningId = null;
        }
        return true;
    }
    return false;
}
/**
 * Inicia o modo de criação de abertura
 */
function startCreatingOpening() {
    isCreatingOpening = true;
    virtualOpening = null;
}
/**
 * Para o modo de criação de abertura
 */
function stopCreatingOpening() {
    isCreatingOpening = false;
    virtualOpening = null;
}
/**
 * Confirma a criação da abertura virtual
 */
function confirmVirtualOpening(type = 'door') {
    if (!virtualOpening) return null;
    
    // Recuperar informações de boundary do wallHit armazenado
    const originalWallHit = virtualOpening._wallHit || {};
    
    const wallHit = {
        wall: virtualOpening.wall,
        position: virtualOpening.centerPosition,
        // Propagar informações de boundary
        isBoundaryEdge: originalWallHit.isBoundaryEdge || virtualOpening._isBoundaryEdge || false,
        boundaryAreaId: originalWallHit.boundaryAreaId || null,
        boundaryEdgeIndex: originalWallHit.boundaryEdgeIndex ?? null,
        outwardNormal: originalWallHit.outwardNormal || null
    };
    const newOpening = createOpening(wallHit, type);
    virtualOpening = null;
    return newOpening;
}
/**
 * Atualiza as posições das aberturas quando uma área é movida
 */
function updateOpeningsWithAreaMovement(areaId, dx, dy) {
    // Se não há movimento, pular
    if (dx === 0 && dy === 0) {
        return { count: 0, movedIds: [] };
    }
    let updatedOpenings = 0;
    const movedIds = [];
    openings.forEach((opening, index) => {
        // Verificar se a abertura pertence a paredes da área movida
        let shouldUpdate = false;
        if (opening.wallBefore) {
            const wallBefore = walls.find(w => w.id === opening.wallBefore);
            if (wallBefore && wallBefore.parentAreaId === areaId) {
                shouldUpdate = true;
            }
        }
        if (opening.wallAfter) {
            const wallAfter = walls.find(w => w.id === opening.wallAfter);
            if (wallAfter && wallAfter.parentAreaId === areaId) {
                shouldUpdate = true;
            }
        }
        if (shouldUpdate) {
            // Atualizar pontos absolutos da abertura
            opening.startPoint[0] += dx;
            opening.startPoint[1] += dy;
            opening.endPoint[0] += dx;
            opening.endPoint[1] += dy;
            updatedOpenings++;
            movedIds.push(opening.id);
        }
    });
    return { count: updatedOpenings, movedIds };
}
/**
 * Atualiza as posições das aberturas quando uma área é rotacionada
 * @param {string|number} areaId - ID da área
 * @param {number} centerX - Centro de rotação X
 * @param {number} centerY - Centro de rotação Y
 * @param {number} angleDegrees - Ângulo de rotação em graus (padrão: 90)
 */
function updateOpeningsWithAreaRotation(areaId, centerX, centerY, angleDegrees = 90) {
    const angleRad = angleDegrees * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    let rotatedOpenings = 0;
    const rotatedIds = [];
    openings.forEach((opening, index) => {
        // Verificar se a abertura pertence a paredes da área rotacionada
        let shouldUpdate = false;
        if (opening.wallBefore) {
            const wallBefore = walls.find(w => w.id === opening.wallBefore);
            if (wallBefore && wallBefore.parentAreaId === areaId) {
                shouldUpdate = true;
            }
        }
        if (opening.wallAfter) {
            const wallAfter = walls.find(w => w.id === opening.wallAfter);
            if (wallAfter && wallAfter.parentAreaId === areaId) {
                shouldUpdate = true;
            }
        }
        if (shouldUpdate) {
            // Rotacionar ponto inicial
            const startRelX = opening.startPoint[0] - centerX;
            const startRelY = opening.startPoint[1] - centerY;
            opening.startPoint[0] = centerX + startRelX * cos - startRelY * sin;
            opening.startPoint[1] = centerY + startRelX * sin + startRelY * cos;
            // Rotacionar ponto final
            const endRelX = opening.endPoint[0] - centerX;
            const endRelY = opening.endPoint[1] - centerY;
            opening.endPoint[0] = centerX + endRelX * cos - endRelY * sin;
            opening.endPoint[1] = centerY + endRelX * sin + endRelY * cos;
            rotatedOpenings++;
            rotatedIds.push(opening.id);
            // Para boundary openings, rotacionar também a outwardNormal
            if (opening.outwardNormal) {
                const nx = opening.outwardNormal.x;
                const ny = opening.outwardNormal.y;
                opening.outwardNormal.x = nx * cos - ny * sin;
                opening.outwardNormal.y = nx * sin + ny * cos;
            }
        }
    });
    return { count: rotatedOpenings, rotatedIds };
}
/**
 * Valida o alinhamento das aberturas após transformações
 */
function validateOpeningsAlignment(areaId) {
    let allAligned = true;
    let checkedOpenings = 0;
    const issues = [];
    openings.forEach(opening => {
        let belongsToArea = false;
        if (opening.wallBefore) {
            const wallBefore = walls.find(w => w.id === opening.wallBefore);
            if (wallBefore && wallBefore.parentAreaId === areaId) {
                belongsToArea = true;
            }
        }
        if (opening.wallAfter) {
            const wallAfter = walls.find(w => w.id === opening.wallAfter);
            if (wallAfter && wallAfter.parentAreaId === areaId) {
                belongsToArea = true;
            }
        }
        if (belongsToArea) {
            checkedOpenings++;
            // Verificar se os pontos da abertura estão colineares com as paredes adjacentes
            // Tolerância para verificação de alinhamento
            const tolerance = 2.0;
            // Para simplificação, assumir que está alinhada se chegou até aqui
            // Em uma implementação mais robusta, seria necessário verificar colinearidade
        }
    });
    return {
        allAligned,
        checkedOpenings,
        issues
    };
}
/**
 * Função híbrida que detecta em qual sistema as aberturas foram criadas
 * e aplica transformações de movimento em ambos os sistemas quando necessário
 */
function synchronizeOpeningsMovement(areaId, dx, dy) {
    // Força migração antes da sincronização
    migrateBaseOpeningsToAdvanced();
    // Atualiza sistema avançado (chamada única — retorna { count, movedIds })
    const result = updateOpeningsWithAreaMovement(areaId, dx, dy);
    return result;
}
function synchronizeOpeningsRotation(areaId, centerX, centerY, angleDegrees = 90) {
    // Força migração antes da sincronização
    migrateBaseOpeningsToAdvanced();
    // Atualiza sistema avançado (chamada única — retorna { count, rotatedIds })
    const result = updateOpeningsWithAreaRotation(areaId, centerX, centerY, angleDegrees);
    return result;
}
// Função para migrar aberturas do sistema base para o avançado
function migrateBaseOpeningsToAdvanced() {
    try {
        // Verifica se há um objeto global com as aberturas do sistema base
        if (window.baseOpeningsForMigration && window.baseOpeningsForMigration.length > 0) {
            window.baseOpeningsForMigration.forEach(baseOpening => {
                // Verifica se a abertura já existe no sistema avançado
                const existsInAdvanced = openings.find(opening => opening.id === baseOpening.id);
                if (!existsInAdvanced) {
                    // Converte abertura do sistema base para o formato avançado
                    const advancedOpening = {
                        id: baseOpening.id,
                        originalWallId: baseOpening.originalWallId,
                        type: baseOpening.type || 'door',
                        startPosition: baseOpening.startPosition || 0.3,
                        endPosition: baseOpening.endPosition || 0.7,
                        startPoint: baseOpening.startPoint || { x: 0, y: 0 },
                        endPoint: baseOpening.endPoint || { x: 0, y: 0 },
                        wallBefore: baseOpening.wallBefore,
                        wallAfter: baseOpening.wallAfter,
                        selected: baseOpening.selected || false,
                        visible: baseOpening.visible !== false,
                        // Dados do sistema avançado
                        parentAreaId: baseOpening.parentAreaId || null,
                        lastUpdate: Date.now()
                    };
                    openings.push(advancedOpening);
                }
            });
            // Limpa o array global após migração
            window.baseOpeningsForMigration.length = 0;
        } else {
        }
    } catch (error) {
        // Erro na migração
    }
}
/**
 * Inicia o redimensionamento de uma abertura
 */
function startResizingOpening(openingId, controlPoint, mouseX, mouseY) {
    const opening = openings.find(o => o.id === openingId);
    if (!opening) {
        return false;
    }
    isResizingOpening = true;
    resizingOpeningId = openingId;
    resizingControlPoint = controlPoint;
    hasResizedDuringDrag = false; // Ainda não houve arraste real
    // Usar a posição real do control point como referência inicial,
    // não a posição do mouse — evita salto ao clicar perto mas não exatamente no centro
    const anchorPoint = controlPoint === 'start' ? opening.startPoint : opening.endPoint;
    resizeStartPosition = { x: anchorPoint[0], y: anchorPoint[1] };
    // Salvar dados originais para possível restauração
    originalOpeningData = {
        startPosition: opening.startPosition,
        endPosition: opening.endPosition,
        startPoint: { x: opening.startPoint[0], y: opening.startPoint[1] },
        endPoint: { x: opening.endPoint[0], y: opening.endPoint[1] }
    };
    return true;
}
/**
 * Para o redimensionamento de uma abertura
 */
function stopResizingOpening() {
    if (isResizingOpening && resizingOpeningId) {
        const opening = openings.find(o => o.id === resizingOpeningId);
        if (opening) {
            // Reconstruir parede original a partir dos fragmentos para finalizar
            const wallBefore = walls.find(w => w.id === opening.wallBefore);
            const wallAfter = walls.find(w => w.id === opening.wallAfter);
            let originalWall;
            if (wallBefore && wallAfter) {
                originalWall = {
                    id: opening.originalWallId,
                    startPoint: wallBefore.startPoint,
                    endPoint: wallAfter.endPoint,
                    parentAreaId: wallBefore.parentAreaId || wallAfter.parentAreaId
                };
            } else if (wallBefore) {
                originalWall = {
                    id: opening.originalWallId,
                    startPoint: wallBefore.startPoint,
                    endPoint: opening.endPoint,
                    parentAreaId: wallBefore.parentAreaId
                };
            } else if (wallAfter) {
                originalWall = {
                    id: opening.originalWallId,
                    startPoint: opening.startPoint,
                    endPoint: wallAfter.endPoint,
                    parentAreaId: wallAfter.parentAreaId
                };
            }
            if (originalWall) {
                if (hasResizedDuringDrag) {
                    // Só recalcular pontos se houve arraste real de resize
                    updateOpeningPoints(opening, originalWall);
                }
            }
        }
    }
    // Limpar estado de redimensionamento
    isResizingOpening = false;
    resizingOpeningId = null;
    resizingControlPoint = null;
    resizeStartPosition = null;
    originalOpeningData = null;
    hasResizedDuringDrag = false;
    // Redesenhar para mostrar estado final
    import('./drawing.js').then(drawing => {
        drawing.drawAll();
    });
}

/**
 * Encontra pontos de junção de paredes transversais ao longo da parede original da abertura.
 * Retorna posições relativas (0-1) onde outras paredes se conectam a esta parede,
 * excluindo os próprios fragmentos da abertura (wallBefore e wallAfter).
 * Estes pontos servem como barreiras para o resize dos control points.
 */
function findTransversalJunctions(originalWall, opening, wallVector, wallLength) {
    const SNAP_TOLERANCE = 3; // pixels de tolerância para considerar que um ponto está "na" parede
    const junctions = [];
    const wallLengthSq = wallLength * wallLength;
    
    // IDs das paredes fragmentadas da abertura (não devem ser consideradas como barreiras)
    const excludeIds = new Set([opening.wallBefore, opening.wallAfter]);
    
    for (const w of walls) {
        // Ignorar as paredes fragmentadas da própria abertura
        if (excludeIds.has(w.id)) continue;
        
        // Verificar se o startPoint ou endPoint desta parede toca a parede original
        for (const point of [w.startPoint, w.endPoint]) {
            // Vetor do início da parede original até este ponto
            const toPoint = {
                x: point[0] - originalWall.startPoint[0],
                y: point[1] - originalWall.startPoint[1]
            };
            
            // Projetar na direção da parede
            const proj = (toPoint.x * wallVector.x + toPoint.y * wallVector.y) / wallLengthSq;
            
            // Só considerar pontos que caem dentro do segmento (com margem)
            if (proj < 0.001 || proj > 0.999) continue;
            
            // Calcular distância perpendicular do ponto à linha da parede
            const projectedX = originalWall.startPoint[0] + wallVector.x * proj;
            const projectedY = originalWall.startPoint[1] + wallVector.y * proj;
            const perpDist = Math.sqrt(
                (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2
            );
            
            // Se o ponto está suficientemente perto da linha da parede, é uma junção
            if (perpDist <= SNAP_TOLERANCE) {
                // Evitar duplicatas (múltiplas paredes podem conectar no mesmo ponto)
                const isDuplicate = junctions.some(j => Math.abs(j - proj) < 0.001);
                if (!isDuplicate) {
                    junctions.push(proj);
                }
            }
        }
    }
    
    return junctions;
}

/**
 * Atualiza o redimensionamento durante o movimento do mouse
 */
function updateResizing(mouseX, mouseY) {
    if (!isResizingOpening || !resizingOpeningId) {
        return false;
    }
    const opening = openings.find(o => o.id === resizingOpeningId);
    if (!opening) {
        return false;
    }
    // Reconstruir informações da parede original a partir das paredes fragmentadas
    const wallBefore = walls.find(w => w.id === opening.wallBefore);
    const wallAfter = walls.find(w => w.id === opening.wallAfter);
    let originalWall;
    if (wallBefore && wallAfter) {
        // Reconstruir parede completa a partir dos fragmentos
        originalWall = {
            id: opening.originalWallId,
            startPoint: wallBefore.startPoint,
            endPoint: wallAfter.endPoint,
            parentAreaId: wallBefore.parentAreaId || wallAfter.parentAreaId
        };
    } else if (wallBefore) {
        // Só existe parede antes - abertura vai até o fim
        originalWall = {
            id: opening.originalWallId,
            startPoint: wallBefore.startPoint,
            endPoint: [
                opening.startPoint[0] + (opening.endPoint[0] - opening.startPoint[0]) / (opening.endPosition - opening.startPosition),
                opening.startPoint[1] + (opening.endPoint[1] - opening.startPoint[1]) / (opening.endPosition - opening.startPosition)
            ],
            parentAreaId: wallBefore.parentAreaId
        };
    } else if (wallAfter) {
        // Só existe parede depois - abertura começa no início
        originalWall = {
            id: opening.originalWallId,
            startPoint: [
                opening.endPoint[0] - (opening.endPoint[0] - opening.startPoint[0]) / (opening.endPosition - opening.startPosition),
                opening.endPoint[1] - (opening.endPoint[1] - opening.startPoint[1]) / (opening.endPosition - opening.startPosition)
            ],
            endPoint: wallAfter.endPoint,
            parentAreaId: wallAfter.parentAreaId
        };
    } else {
        return false;
    }    
    // Calcular nova posição baseada no ponto de controle sendo movido
    const wallVector = {
        x: originalWall.endPoint[0] - originalWall.startPoint[0],
        y: originalWall.endPoint[1] - originalWall.startPoint[1]
    };
    const wallLength = Math.sqrt(wallVector.x ** 2 + wallVector.y ** 2);
    if (wallLength === 0) {
        return false;
    }
    // Projetar posição do mouse na linha da parede
    const mouseVector = {
        x: mouseX - originalWall.startPoint[0],
        y: mouseY - originalWall.startPoint[1]
    };
    const projection = (mouseVector.x * wallVector.x + mouseVector.y * wallVector.y) / (wallLength ** 2);
    const clampedProjection = Math.max(0, Math.min(1, projection));
    // Calcular tamanho mínimo em proporção (10cm)
    const minSizeCm = 10;
    const minSizePx = minSizeCm * (pixelsPerCm || 0.5);
    const minRelativeDiff = minSizePx / wallLength;

    // Calcular margem mínima para manter as paredes fragmentadas (wallBefore/wallAfter)
    // Se o startPosition ou endPosition ficam muito perto de 0 ou 1, a parede fragmentada
    // é removida, corrompendo a reconstrução da originalWall nos frames seguintes.
    const minSegmentCm = 5; // mesmo valor de minWallLength em updateOpeningPoints
    const minSegmentRatio = (minSegmentCm * (pixelsPerCm || 0.5)) / wallLength;
    // Margem de segurança adicional para evitar que a parede seja removida por arredondamento
    const wallEdgeMargin = minSegmentRatio + 0.005;

    // === Limitar pelos pontos de junção de paredes transversais ===
    // Encontrar paredes que se conectam transversalmente a esta parede
    const junctionPositions = findTransversalJunctions(originalWall, opening, wallVector, wallLength);
    const sortedJunctions = junctionPositions.sort((a, b) => a - b);
    
    if (resizingControlPoint === 'start') {
        // Barreira inferior: a última junção que está à esquerda do endPosition (extremo fixo)
        // Também respeitar o limite da parede (wallEdgeMargin) para não destruir wallBefore
        let lowerLimit = wallEdgeMargin;
        for (const jp of sortedJunctions) {
            if (jp < opening.endPosition - 0.001) {
                lowerLimit = Math.max(jp, wallEdgeMargin);
            }
        }
        const upperLimit = opening.endPosition - minRelativeDiff;
        opening.startPosition = Math.max(lowerLimit, Math.min(clampedProjection, upperLimit));
    } else if (resizingControlPoint === 'end') {
        // Barreira superior: a primeira junção à direita do startPosition (extremo fixo)
        // Também respeitar o limite da parede (1 - wallEdgeMargin) para não destruir wallAfter
        let upperLimit = 1 - wallEdgeMargin;
        for (const jp of sortedJunctions) {
            if (jp > opening.startPosition + 0.001) {
                upperLimit = Math.min(jp, 1 - wallEdgeMargin);
                break;
            }
        }
        const lowerLimit = opening.startPosition + minRelativeDiff;
        opening.endPosition = Math.min(upperLimit, Math.max(clampedProjection, lowerLimit));
    }
    hasResizedDuringDrag = true; // Marcamos que houve arraste real

    // Atualizar pontos absolutos e paredes fragmentadas
    updateOpeningPoints(opening, originalWall);
    // Redesenhar imediatamente para feedback visual em tempo real
    import('./drawing.js').then(drawing => {
        drawing.drawAll();
    });
    return true; // Retornar true para indicar sucesso
}
/**
 * Atualiza os pontos absolutos de uma abertura baseado na parede original
 * e também atualiza as paredes fragmentadas
 */
function updateOpeningPoints(opening, originalWall) {
    const wallVector = {
        x: originalWall.endPoint[0] - originalWall.startPoint[0],
        y: originalWall.endPoint[1] - originalWall.startPoint[1]
    };
    // Calcular comprimento da parede e razão mínima para segmentos
    const wallLength = Math.sqrt(wallVector.x ** 2 + wallVector.y ** 2);
    const minSegmentRatio = (MIN_OPENING_SEGMENT_CM * (pixelsPerCm || 0.5)) / wallLength;

    // Atualizar pontos absolutos da abertura
    opening.startPoint = [
        originalWall.startPoint[0] + wallVector.x * opening.startPosition,
        originalWall.startPoint[1] + wallVector.y * opening.startPosition
    ];
    opening.endPoint = [
        originalWall.startPoint[0] + wallVector.x * opening.endPosition,
        originalWall.startPoint[1] + wallVector.y * opening.endPosition
    ];
    // Atualizar paredes fragmentadas
    const wallBefore = walls.find(w => w.id === opening.wallBefore);
    const wallAfter = walls.find(w => w.id === opening.wallAfter);
    // Atualizar parede antes da abertura
    if (wallBefore) {
        wallBefore.endPoint = [...opening.startPoint];
    }
    // Atualizar parede depois da abertura
    if (wallAfter) {
        wallAfter.startPoint = [...opening.endPoint];
    }
      // Se uma parede ficou muito pequena, remover ela
    const minWallLength = 5; // 5cm mínimo
    if (wallBefore) {
        const beforeLength = Math.sqrt(
            (wallBefore.endPoint[0] - wallBefore.startPoint[0]) ** 2 +
            (wallBefore.endPoint[1] - wallBefore.startPoint[1]) ** 2
        ) / (pixelsPerCm || 1);
        if (beforeLength < minWallLength) {
            const beforeIndex = walls.findIndex(w => w.id === opening.wallBefore);
            if (beforeIndex > -1) {
                walls.splice(beforeIndex, 1);
                opening.wallBefore = null;
            }
        }
    } else if (opening.startPosition > minSegmentRatio) {
        // Criar parede antes se não existir e há espaço suficiente
        const dx = opening.startPoint[0] - originalWall.startPoint[0];
        const dy = opening.startPoint[1] - originalWall.startPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const newWallBefore = {
            id: generateId(ID_PREFIXES.WALL),
            startPoint: [...originalWall.startPoint],
            endPoint: [...opening.startPoint],
            parentAreaId: originalWall.parentAreaId,
            type: 'wall',
            isVisual: originalWall.isVisual || false, // Herdar propriedade visual da parede original
            length: length,
            angle: Math.atan2(dy, dx),
            showDimensions: true // Usar apenas controle global
        };
        walls.push(newWallBefore);
        opening.wallBefore = newWallBefore.id;
    }
    if (wallAfter) {
        const afterLength = Math.sqrt(
            (wallAfter.endPoint[0] - wallAfter.startPoint[0]) ** 2 +
            (wallAfter.endPoint[1] - wallAfter.startPoint[1]) ** 2
        ) / (pixelsPerCm || 1);
        if (afterLength < minWallLength) {
            const afterIndex = walls.findIndex(w => w.id === opening.wallAfter);
            if (afterIndex > -1) {
                walls.splice(afterIndex, 1);
                opening.wallAfter = null;
            }
        }
    } else if (opening.endPosition < 1 - minSegmentRatio) {
        // Criar parede depois se não existir e há espaço suficiente
        const dx = originalWall.endPoint[0] - opening.endPoint[0];
        const dy = originalWall.endPoint[1] - opening.endPoint[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        const newWallAfter = {
            id: generateId(ID_PREFIXES.WALL),
            startPoint: [...opening.endPoint],
            endPoint: [...originalWall.endPoint],
            parentAreaId: originalWall.parentAreaId,
            type: 'wall',
            isVisual: originalWall.isVisual || false, // Herdar propriedade visual da parede original
            length: length,
            angle: Math.atan2(dy, dx),
            showDimensions: true // Usar apenas controle global
        };
        walls.push(newWallAfter);
        opening.wallAfter = newWallAfter.id;
    }
}
/**
 * Define qual cubo de controle está sendo hovereado
 */
function setHoveredControlPoint(point) {
    hoveredControlPoint = point;
}
/**
 * Getter para selectedOpeningId
 */
function getSelectedOpeningId() {
    return selectedOpeningId;
}
/**
 * Setter para selectedOpeningId
 */
function setSelectedOpeningId(id) {
    selectedOpeningId = id;
}
// Getter functions for resizing state
function getIsResizingOpening() {
    return isResizingOpening;
}
function getResizingOpeningId() {
    return resizingOpeningId;
}
function getResizingControlPoint() {
    return resizingControlPoint;
}
/**
 * Getter para isCreatingOpening (sistema openings.js)
 */
function getIsCreatingOpeningFromOpenings() {
    return isCreatingOpening;
}
/**
 * Encontra qual cubo de controle está sendo hovereado (versão global - não requer seleção)
 * com debug aprimorado
 */
function findHoveredControlPointGlobal(x, y) {
    const scale = getScale();
    const tolerance = 15 / scale;
    let bestMatch = null;
    let bestDist = Infinity;
    
    // Verificar todas as aberturas — encontrar o control point MAIS PRÓXIMO
    // dentro da tolerância, para evitar selecionar o errado quando estão próximos
    for (let opening of openings) {
        if (!opening.visible) {
            continue;
        }
        // Verificar cubo de início
        const distStart = Math.sqrt(
            (x - opening.startPoint[0]) ** 2 + (y - opening.startPoint[1]) ** 2
        );
        if (distStart <= tolerance && distStart < bestDist) {
            bestDist = distStart;
            bestMatch = {
                openingId: opening.id,
                point: 'start'
            };
        }
        // Verificar cubo de fim
        const distEnd = Math.sqrt(
            (x - opening.endPoint[0]) ** 2 + (y - opening.endPoint[1]) ** 2
        );
        if (distEnd <= tolerance && distEnd < bestDist) {
            bestDist = distEnd;
            bestMatch = {
                openingId: opening.id,
                point: 'end'
            };
        }
    }
    return bestMatch || null;
}
/**
 * Desenha o indicador visual de uma abertura de borda (doca industrial)
 * Mostra seta apontando para fora e marcação visual distinta
 */
function drawBoundaryOpeningIndicator(opening, isSelected) {
    const ctx = getCtx();
    const scale = getScale();
    
    const midX = (opening.startPoint[0] + opening.endPoint[0]) / 2;
    const midY = (opening.startPoint[1] + opening.endPoint[1]) / 2;
    
    // Calcular normal para fora
    let nx, ny;
    if (opening.outwardNormal) {
        nx = opening.outwardNormal.x;
        ny = opening.outwardNormal.y;
    } else {
        // Calcular a partir dos pontos da abertura
        const dx = opening.endPoint[0] - opening.startPoint[0];
        const dy = opening.endPoint[1] - opening.startPoint[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;
        nx = -dy / len;
        ny = dx / len;
    }
    
    ctx.save();
    
    // Desenhar seta apontando para fora
    const arrowLen = Math.max(15, 20 / scale);
    const arrowWidth = Math.max(4, 6 / scale);
    const arrowColor = isSelected ? '#1565c0' : '#2e7d32';
    
    const tipX = midX + nx * arrowLen;
    const tipY = midY + ny * arrowLen;
    
    // Linha da seta
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = Math.max(2, 3 / scale);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    
    // Ponta da seta
    const perpX = -ny;
    const perpY = nx;
    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - nx * arrowWidth + perpX * arrowWidth * 0.5, tipY - ny * arrowWidth + perpY * arrowWidth * 0.5);
    ctx.lineTo(tipX - nx * arrowWidth - perpX * arrowWidth * 0.5, tipY - ny * arrowWidth - perpY * arrowWidth * 0.5);
    ctx.closePath();
    ctx.fill();
    
    // Label para aberturas de borda (nome personalizado ou "DOCA")
    const displayName = getOpeningDisplayName(opening);
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('openings', scale);
    const labelOffset = arrowLen + Math.max(8, 10 / scale);
    ctx.font = `bold ${fontConfig.size}px ${fontConfig.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = arrowColor;
    ctx.fillText(displayName, midX + nx * labelOffset, midY + ny * labelOffset);
    
    // Borda tracejada verde nos lados da abertura (visual de doca)
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = Math.max(1, 2 / scale);
    ctx.setLineDash([Math.max(3, 4 / scale), Math.max(2, 3 / scale)]);
    
    const dockDepth = Math.max(8, 10 / scale);
    // Lado esquerdo
    ctx.beginPath();
    ctx.moveTo(opening.startPoint[0], opening.startPoint[1]);
    ctx.lineTo(opening.startPoint[0] + nx * dockDepth, opening.startPoint[1] + ny * dockDepth);
    ctx.stroke();
    // Lado direito
    ctx.beginPath();
    ctx.moveTo(opening.endPoint[0], opening.endPoint[1]);
    ctx.lineTo(opening.endPoint[0] + nx * dockDepth, opening.endPoint[1] + ny * dockDepth);
    ctx.stroke();
    
    ctx.setLineDash([]);
    ctx.restore();
}

/**
 * Retorna aberturas de borda para uma área específica
 */
function getBoundaryOpeningsForArea(areaId) {
    return openings.filter(o => o.isBoundaryOpening && (o.boundaryAreaId === areaId || o.parentAreaId === areaId));
}

/**
 * Retorna o ponto central e a normal de uma abertura de borda (para colocação de hubs)
 */
function getBoundaryOpeningAnchorInfo(openingId) {
    const opening = openings.find(o => o.id === openingId);
    if (!opening || !opening.isBoundaryOpening) return null;
    
    const midX = (opening.startPoint[0] + opening.endPoint[0]) / 2;
    const midY = (opening.startPoint[1] + opening.endPoint[1]) / 2;
    
    let nx, ny;
    if (opening.outwardNormal) {
        nx = opening.outwardNormal.x;
        ny = opening.outwardNormal.y;
    } else {
        const dx = opening.endPoint[0] - opening.startPoint[0];
        const dy = opening.endPoint[1] - opening.startPoint[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return null;
        nx = -dy / len;
        ny = dx / len;
    }
    
    return {
        x: midX,
        y: midY,
        normalX: nx,
        normalY: ny,
        openingId: opening.id,
        openingWidth: calculateOpeningWidth(opening)
    };
}

/**
 * Renomeia uma abertura e atualiza os hubs associados.
 * @param {string} openingId - ID da abertura
 * @param {string} newName - Novo nome
 * @returns {boolean} true se renomeou com sucesso
 */
function renameOpening(openingId, newName) {
    const opening = openings.find(o => o.id === openingId);
    if (!opening) return false;
    opening.name = newName || null;
    return true;
}

/**
 * Retorna o nome de exibição de uma abertura.
 * @param {Object} opening - Objeto da abertura
 * @returns {string} Nome personalizado ou "DOCA" para boundary / "Abertura" para internas
 */
function getOpeningDisplayName(opening) {
    if (opening.name) return opening.name;
    return opening.isBoundaryOpening ? 'DOCA' : 'Abertura';
}

// Exporta a função de migração junto com as outras
export {
    openings,
    createOpening,
    deleteOpening,
    selectedOpeningId,
    getSelectedOpeningId,
    setSelectedOpeningId,
    startCreatingOpening,
    stopCreatingOpening,
    confirmVirtualOpening,
    updateVirtualOpening,
    findOpeningAtPosition,
    findWallAtPosition,
    drawAllOpenings,
    drawVirtualOpening,
    hoveredControlPoint,
    setHoveredControlPoint,
    findHoveredControlPoint,
    findHoveredControlPointGlobal,
    startResizingOpening,
    stopResizingOpening,
    updateResizing,
    getIsResizingOpening,
    getResizingOpeningId,
    getResizingControlPoint,
    getIsCreatingOpeningFromOpenings,
    updateOpeningsWithAreaMovement,
    updateOpeningsWithAreaRotation,
    validateOpeningsAlignment,
    synchronizeOpeningsMovement,
    synchronizeOpeningsRotation,
    migrateBaseOpeningsToAdvanced,
    Opening,
    findBoundaryEdgeAtPosition,
    getBoundaryOpeningsForArea,
    getBoundaryOpeningAnchorInfo,
    calculateOpeningWidth,
    renameOpening,
    getOpeningDisplayName
};

