/**
 * Sistema de cotas para recursos
 * Desenha linhas de cota mostrando as distâncias entre as bordas do recurso e as paredes da área de movimentação
 * Só mostra cotas durante movimentação de recursos (arraste)
 */

import { 
    getCtx, 
    getScale, 
    getSelectedResourceId, 
    getIsDragging,
    movementAreas, 
    resources,
    walls
} from './state.js';
import { pointInPolygon, rectangleToVertices } from './areas.js';
import { 
    virtualDimensionColor, 
    virtualDimensionAlpha, 
    virtualDimensionLineWidth,
    getGlobalShowDimensions,
    setGlobalShowDimensions,
    pixelsPerCm,
    DIMENSION_SYSTEM
} from './config.js';
import { formatLength } from './measurement-units.js';

// Estado para gerenciar visibilidade das cotas globais
let globalDimensionsStateBeforeDrag = null;
let isMovingResource = false; // Controla se está movimentando recurso (mouse ou teclado)

/**
 * Encontra a área de movimentação que contém o recurso
 * @param {Object} resource - O recurso
 * @returns {Object|null} - A área de movimentação ou null se não encontrada
 */
function findContainingArea(resource) {
    if (!resource || !movementAreas || movementAreas.length === 0) {
        return null;
    }
    
    // Ponto central do recurso
    const resourceCenterX = resource.x + (resource.width || 0) / 2;
    const resourceCenterY = resource.y + (resource.height || 0) / 2;
    
    const area = movementAreas.find(area => {
        if (area.vertices && area.vertices.length > 0) {
            // Área poligonal
            return pointInPolygon([resourceCenterX, resourceCenterY], area.vertices);
        } else {
            // Área retangular
            return resourceCenterX >= area.x && 
                   resourceCenterY >= area.y && 
                   resourceCenterX <= area.x + area.width && 
                   resourceCenterY <= area.y + area.height;
        }
    });
    
    return area;
}

/**
 * Desenha as cotas de um recurso em relação à área de movimentação
 * Agora usa o mesmo estilo visual e lógica das virtual dimensions
 * @param {Object} resource - O recurso sendo arrastado
 */
function drawResourceDimensions(resource) {
    const area = findContainingArea(resource);
    
    if (!area) {
        return;
    }
    
    const ctx = getCtx();
    if (!ctx) {
        return;
    }
    
    const scale = getScale();
    
    ctx.save();
    
    // Usar o mesmo estilo das virtual dimensions
    ctx.globalAlpha = virtualDimensionAlpha;
    ctx.strokeStyle = virtualDimensionColor;
    ctx.fillStyle = virtualDimensionColor;
    ctx.lineWidth = virtualDimensionLineWidth / scale;
    
    // Sistema unificado de cotas para dimensões de recursos
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('resources', scale);
    ctx.font = fontConfig.string;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Calcular distâncias usando a lógica corrigida (da borda do recurso)
    const dimensions = calculateResourceDimensionsToAreaEdges(resource, area);
    
    // Desenhar cada dimensão
    dimensions.forEach(dim => {
        drawVirtualDimensionLine(
            ctx, 
            dim.value, 
            dim.startPoint[0], 
            dim.startPoint[1], 
            dim.endPoint[0], 
            dim.endPoint[1], 
            dim.direction === 'norte' || dim.direction === 'sul' ? 'vertical' : 'horizontal',
            scale
        );
    });
    
    ctx.restore();
}

/**
 * Desenha uma linha de cota no estilo das virtual dimensions de hover.
 */
function drawVirtualDimensionLine(ctx, distance, x1, y1, x2, y2, orientation, scale) {
    if (distance <= DIMENSION_CONFIG.minDistance) {
        return;
    }

    // Estilo unificado
    ctx.setLineDash([4 / scale, 3 / scale]); // Linha tracejada

    // Desenhar linha principal
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Resetar linha tracejada para os indicadores
    ctx.setLineDash([]);

    // Desenhar indicadores de círculo nas extremidades
    const indicatorRadius = 3 / scale;
    ctx.beginPath();
    ctx.arc(x1, y1, indicatorRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y2, indicatorRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Desenhar texto da distância
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const fontConfig = DIMENSION_SYSTEM.getFontConfig('virtual', scale); // Usar a mesma config de fonte
    ctx.font = fontConfig.string;

    const distanceInCm = Math.round(distance / pixelsPerCm);
    const text = formatLength(distanceInCm);
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontConfig.size;
    
    // Fundo semi-transparente para o texto
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(
        centerX - textWidth / 2 - (2 / scale),
        centerY - textHeight / 2 - (1 / scale),
        textWidth + (4 / scale),
        textHeight + (2 / scale)
    );
    
    // Texto da cota
    ctx.fillStyle = virtualDimensionColor;
    ctx.fillText(text, centerX, centerY);
}

/**
 * Desenha uma seta
 */
function drawArrow(ctx, fromX, fromY, toX, toY, arrowSize) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(fromX - arrowSize * Math.cos(angle - Math.PI / 6), fromY - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(fromX - arrowSize * Math.cos(angle + Math.PI / 6), fromY - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
}

/**
 * Função principal para desenhar todas as cotas de recursos
 * Desenha cotas quando um recurso está selecionado
 */
function drawAllResourceDimensions() {
    const selectedResourceId = getSelectedResourceId();
    
    // Desenhar cotas se há um recurso selecionado
    if (!selectedResourceId) {
        return;
    }
    
    const selectedResource = resources.find(r => r.id === selectedResourceId);
    if (selectedResource) {
        drawResourceDimensions(selectedResource);
    }
}

/**
 * Inicia o modo de arraste de recurso (gerencia estado das cotas globais)
 */
function startResourceDrag() {
    isMovingResource = true;
    saveGlobalDimensionsState();
}

/**
 * Finaliza o modo de arraste de recurso (restaura estado das cotas globais)
 */
function endResourceDrag() {
    isMovingResource = false;
    restoreGlobalDimensionsState();
}

/**
 * Configura as cores das cotas
 * @param {Object} colors - Objeto com propriedades line, text e alpha
 */
function setDimensionColors(colors) {
    Object.assign(DIMENSION_COLORS, colors);
}

/**
 * Configura as configurações das cotas
 * @param {Object} config - Objeto com configurações
 */
function setDimensionConfig(config) {
    Object.assign(DIMENSION_CONFIG, config);
}

/**
 * Configurações das cotas (usando o mesmo estilo das virtual dimensions)
 */
const DIMENSION_CONFIG = {
    minDistance: 5, // Distância mínima para mostrar a cota
    textOffset: 15, // Offset do texto em relação à linha
    arrowSize: 6 // Tamanho das setas
};

/**
 * Salva o estado atual das cotas globais antes do arraste
 */
function saveGlobalDimensionsState() {
    // Salvar o estado atual das cotas globais
    globalDimensionsStateBeforeDrag = getGlobalShowDimensions();
    
    // SEMPRE desativar todas as cotas durante o arraste
    if (globalDimensionsStateBeforeDrag) {
        setGlobalShowDimensions(false);
    }
}

/**
 * Restaura o estado das cotas globais após o arraste
 */
function restoreGlobalDimensionsState() {
    if (globalDimensionsStateBeforeDrag !== null) {
        const currentState = getGlobalShowDimensions();
        
        // Restaurar para o estado que estava antes do arraste
        if (globalDimensionsStateBeforeDrag !== currentState) {
            setGlobalShowDimensions(globalDimensionsStateBeforeDrag);
        }
        
        globalDimensionsStateBeforeDrag = null;
    }
}

/**
 * Calcula as dimensões do recurso para os obstáculos mais próximos (paredes, outros recursos, bordas da área)
 * @param {Object} resource - O recurso completo com x, y, width, height
 * @param {Object} area - Área contendo o recurso
 * @returns {Array} Array de objetos de dimensão
 */
function calculateResourceDimensionsToAreaEdges(resource, area) {
    const areaVertices = area.vertices || rectangleToVertices(area);
    if (!areaVertices || areaVertices.length < 3) {
        return [];
    }
    
    const resourceLeft = resource.x;
    const resourceRight = resource.x + resource.width;
    const resourceTop = resource.y;
    const resourceBottom = resource.y + resource.height;
    
    const directions = [
        { name: 'norte', vector: [0, -1], startPoint: [resource.x + resource.width / 2, resourceTop] }, 
        { name: 'sul',   vector: [0, 1],  startPoint: [resource.x + resource.width / 2, resourceBottom] },   
        { name: 'leste', vector: [1, 0],  startPoint: [resourceRight, resource.y + resource.height / 2] }, 
        { name: 'oeste', vector: [-1, 0], startPoint: [resourceLeft, resource.y + resource.height / 2] } 
    ];
    
    const dimensions = [];
    
    // Obter todos os obstáculos potenciais (paredes e outros recursos na mesma área)
    const obstacles = [
        ...walls.filter(w => w.parentAreaId === area.id).map(w => ({ type: 'wall', data: w })),
        ...resources.filter(r => r.id !== resource.id && r.parentAreaId === area.id).map(r => ({ type: 'resource', data: r }))
    ];

    directions.forEach(direction => {
        const rayEnd = [
            direction.startPoint[0] + direction.vector[0] * 10000,
            direction.startPoint[1] + direction.vector[1] * 10000
        ];
        
        let closestIntersection = null;
        let closestDistance = Infinity;

        // 1. Verificar interseção com as bordas da área
        for (let i = 0; i < areaVertices.length; i++) {
            const edgeStart = areaVertices[i];
            const edgeEnd = areaVertices[(i + 1) % areaVertices.length];
            const intersection = lineIntersection(direction.startPoint, rayEnd, edgeStart, edgeEnd);
            if (intersection) {
                const dist = Math.hypot(intersection[0] - direction.startPoint[0], intersection[1] - direction.startPoint[1]);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestIntersection = intersection;
                }
            }
        }

        // 2. Verificar interseção com outros obstáculos (paredes e recursos)
        obstacles.forEach(obstacle => {
            let obstacleVertices;
            if (obstacle.type === 'wall') {
                obstacleVertices = [obstacle.data.startPoint, obstacle.data.endPoint];
            } else { // resource
                obstacleVertices = obstacle.data.vertices || rectangleToVertices(obstacle.data);
            }
            
            for (let i = 0; i < obstacleVertices.length; i++) {
                const edgeStart = obstacleVertices[i];
                const edgeEnd = obstacleVertices[(i + 1) % obstacleVertices.length];
                const intersection = lineIntersection(direction.startPoint, rayEnd, edgeStart, edgeEnd);
                if (intersection) {
                    const dist = Math.hypot(intersection[0] - direction.startPoint[0], intersection[1] - direction.startPoint[1]);
                    if (dist < closestDistance) {
                        closestDistance = dist;
                        closestIntersection = intersection;
                    }
                }
            }
        });

        // Adicionar a dimensão se uma interseção válida foi encontrada
        if (closestIntersection && closestDistance > 0.5) {
            dimensions.push({
                startPoint: direction.startPoint,
                endPoint: closestIntersection,
                value: closestDistance,
                direction: direction.name
            });
        }
    });
    
    return dimensions;
}

/**
 * Calcula interseção entre duas linhas
 * @param {Array} line1Start - Início da primeira linha [x, y]
 * @param {Array} line1End - Fim da primeira linha [x, y]
 * @param {Array} line2Start - Início da segunda linha [x, y] 
 * @param {Array} line2End - Fim da segunda linha [x, y]
 * @returns {Array|null} Ponto de interseção [x, y] ou null se não há interseção
 */
function lineIntersection(line1Start, line1End, line2Start, line2End) {
    const x1 = line1Start[0], y1 = line1Start[1];
    const x2 = line1End[0], y2 = line1End[1];
    const x3 = line2Start[0], y3 = line2Start[1];
    const x4 = line2End[0], y4 = line2End[1];
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    
    // Detecção precisa de linhas paralelas ou quase paralelas
    if (Math.abs(denom) < 0.00001) {
        return null; // Linhas paralelas
    }
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    // Verificar se a interseção está em ambos os segmentos
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        const intersection = [
            x1 + t * (x2 - x1),
            y1 + t * (y2 - y1)
        ];
        
        // Arredondar para evitar erros de ponto flutuante
        intersection[0] = Math.round(intersection[0] * 10) / 10;
        intersection[1] = Math.round(intersection[1] * 10) / 10;
        
        return intersection;
    }
    
    return null;
}

export {
    drawAllResourceDimensions,
    drawResourceDimensions,
    startResourceDrag,
    endResourceDrag,
    setDimensionColors,
    setDimensionConfig,
    DIMENSION_CONFIG
};
