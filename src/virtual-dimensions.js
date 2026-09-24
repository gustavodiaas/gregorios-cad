// Virtual Dimensions System - Extracted from walls.js
// This module handles all virtual dimension display and management
// Import necessary functions from state.js
import { walls, movementAreas } from './state.js';
// Import configuration constants
import { 
    virtualDimensionsEnabled, 
    virtualDimensionColor, 
    virtualDimensionMaxCount, 
    pixelsPerCm,
    DIMENSION_SYSTEM
} from './config.js';
// Import utility functions from areas.js
import { pointInPolygon } from './areas.js';
import { formatLength } from './measurement-units.js';
class VirtualDimensionsSystem {
    constructor() {
        this.virtualDimensions = [];
        this.snapDistances = [];
    }
    /**
     * Calcula cotas virtuais baseadas no snap ativo
     * @param {Array} currentPos - Posição atual do mouse [x, y]
     * @param {Array} startPoint - Ponto inicial da parede [x, y] ou null
     * @param {Object} snapResult - Resultado do sistema de snap
     * @returns {Array} Array de objetos de dimensão virtual
     */
    calculateVirtualDimensions(currentPos, startPoint, snapResult) {
        // Verificar se as cotas virtuais estão habilitadas (globalmente ou por configuração)
        const enabled = (window.config && window.config.virtualDimensionsEnabled !== undefined) 
            ? window.config.virtualDimensionsEnabled 
            : virtualDimensionsEnabled;
        if (!enabled) {
            return [];
        }
        this.virtualDimensions = [];
        this.snapDistances = [];
        if (!snapResult && !currentPos) {
            return this.virtualDimensions;
        }
        const snapPoint = snapResult ? snapResult.point : currentPos;
        // Calcular distâncias direcionais (Norte, Sul, Leste, Oeste) para paredes
        this.calculateDirectionalDistancesToWalls(snapPoint);
        // Calcular distâncias direcionais para bordas das áreas de movimentação
        this.calculateDistancesToAreaEdges(snapPoint);
        // Ordenar por prioridade e limitar o número de cotas exibidas
        this.virtualDimensions.sort((a, b) => a.priority - b.priority);
        if (this.virtualDimensions.length > virtualDimensionMaxCount) {
            this.virtualDimensions = this.virtualDimensions.slice(0, virtualDimensionMaxCount);
        }
        return this.virtualDimensions;
    }
    /**
     * Calcula distâncias direcionais do ponto para paredes nas 4 direções cardeais
     * Versão robusta que garante encontrar paredes em todas as direções disponíveis
     * @param {Array} snapPoint - Ponto atual [x, y]
     */
    calculateDirectionalDistancesToWalls(snapPoint) {
        if (!walls || walls.length === 0) {
            return;
        }
        const directions = [
            { name: 'norte', vector: [0, -1], color: '#FF0000' }, // Norte (cima) - vermelho
            { name: 'sul', vector: [0, 1], color: '#FF0000' },   // Sul (baixo) - vermelho
            { name: 'leste', vector: [1, 0], color: '#FF0000' }, // Leste (direita) - vermelho
            { name: 'oeste', vector: [-1, 0], color: '#FF0000' } // Oeste (esquerda) - vermelho
        ];
        let totalCotasAdicionadas = 0;
        directions.forEach(direction => {
            const closestWallData = this.findClosestWallInDirectionRobust(snapPoint, direction.vector, direction.name);
            if (closestWallData) {
                if (closestWallData.distance > 0.5) { // Tolerância menor para capturar mais cotas
                    this.virtualDimensions.push({
                        type: 'directional-wall-distance',
                        startPoint: snapPoint,
                        endPoint: closestWallData.intersectionPoint,
                        value: closestWallData.distance,
                        label: formatLength(closestWallData.distance / pixelsPerCm),
                        color: direction.color,
                        priority: this.getDirectionPriority(direction.name),
                        direction: direction.name,
                        targetWall: closestWallData.wall
                    });
                    totalCotasAdicionadas++;
                } else {
                }
            } else {
            }
        });
    }
    /**
     * Versão mais robusta para encontrar paredes em uma direção específica
     * Usa múltiplas estratégias para garantir que encontramos paredes válidas
     * @param {Array} point - Ponto de origem [x, y]
     * @param {Array} direction - Vetor de direção [dx, dy]
     * @param {string} directionName - Nome da direção (para debug)
     * @returns {Object|null} Dados da parede mais próxima ou null
     */
    findClosestWallInDirectionRobust(point, direction, directionName) {
        let closestDistance = Infinity;
        let closestWallData = null;
        let candidatesFound = 0;
        walls.forEach((wall, wallIndex) => {
            if (!wall.startPoint || !wall.endPoint) {
                return;
            }
            // Criar uma linha muito longa na direção desejada
            const rayEnd = [
                point[0] + direction[0] * 10000,
                point[1] + direction[1] * 10000
            ];
            // Calcular interseção da linha de direção com a parede
            const intersection = this.lineIntersection(point, rayEnd, wall.startPoint, wall.endPoint);
            if (intersection) {
                candidatesFound++;
                // Verificar se a interseção está dentro dos limites da parede
                const withinWallLimits = this.isPointOnLineSegment(intersection, wall.startPoint, wall.endPoint);
                if (withinWallLimits) {
                    // Verificar se está na direção correta
                    const toIntersection = [intersection[0] - point[0], intersection[1] - point[1]];
                    const dotProduct = toIntersection[0] * direction[0] + toIntersection[1] * direction[1];
                    if (dotProduct > 0.1) { // Tolerância para direção correta
                        const distance = Math.sqrt(toIntersection[0] * toIntersection[0] + toIntersection[1] * toIntersection[1]);
                        if (distance < closestDistance && distance > 0.1) { // Distância mínima
                            closestDistance = distance;
                            closestWallData = {
                                wall: wall,
                                distance: distance,
                                intersectionPoint: intersection,
                                wallIndex: wallIndex
                            };
                        } else if (distance <= 0.1) {
                        }
                    } else {
                    }
                } else {
                }
            } else {
            }
        });
        return closestWallData;
    }
    /**
     * Encontra a parede mais próxima em uma direção específica
     * Respeita os limites das paredes (não projeta além dos endpoints)
     * @param {Array} point - Ponto de origem [x, y]
     * @param {Array} direction - Vetor de direção [dx, dy]
     * @returns {Object|null} Dados da parede mais próxima ou null
     */
    findClosestWallInDirection(point, direction) {
        let closestDistance = Infinity;
        let closestWallData = null;
        let wallsChecked = 0;
        let intersectionsFound = 0;
        walls.forEach((wall, index) => {
            if (!wall.startPoint || !wall.endPoint) {
                return;
            }
            wallsChecked++;
            // Calcular interseção da linha de direção com a parede
            const intersection = this.lineIntersection(
                point,
                [point[0] + direction[0] * 10000, point[1] + direction[1] * 10000], // Linha muito longa na direção
                wall.startPoint,
                wall.endPoint
            );
            if (intersection) {
                intersectionsFound++;
                // Verificar se a interseção está dentro dos limites da parede
                if (this.isPointOnLineSegment(intersection, wall.startPoint, wall.endPoint)) {
                    // Verificar se está na direção correta
                    const toIntersection = [intersection[0] - point[0], intersection[1] - point[1]];
                    const dotProduct = toIntersection[0] * direction[0] + toIntersection[1] * direction[1];
                    if (dotProduct > 0) { // Está na direção correta
                        const distance = Math.sqrt(toIntersection[0] * toIntersection[0] + toIntersection[1] * toIntersection[1]);
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestWallData = {
                                wall: wall,
                                distance: distance,
                                intersectionPoint: intersection
                            };
                        }
                    } else {
                    }
                } else {
                }
            } else {
            }
        });
        return closestWallData;
    }
    /**
     * Calcula interseção entre uma linha de direção (raio) e um segmento de borda
     * @param {Array} rayStart - Ponto inicial do raio [x, y]
     * @param {Array} rayDirection - Vetor de direção do raio [dx, dy]
     * @param {Array} edgeStart - Ponto inicial da borda [x, y]
     * @param {Array} edgeEnd - Ponto final da borda [x, y]
     * @returns {Object|null} Objeto com ponto de interseção e distância ou null se não há interseção
     */
    rayEdgeIntersection(rayStart, rayDirection, edgeStart, edgeEnd) {
        // Verificar se a borda é uma linha real (pontos diferentes)
        if (this.isSamePoint(edgeStart, edgeEnd)) {
            return null;
        }
        // Normalizar o vetor de direção
        const magnitude = Math.sqrt(rayDirection[0] * rayDirection[0] + rayDirection[1] * rayDirection[1]);
        if (magnitude === 0) return null;
        const dx = rayDirection[0] / magnitude;
        const dy = rayDirection[1] / magnitude;
        // Calcular o ponto final do raio (muito distante)
        const rayEnd = [
            rayStart[0] + dx * 100000,
            rayStart[1] + dy * 100000
        ];
        // Vetores para representar as linhas
        const r = [rayEnd[0] - rayStart[0], rayEnd[1] - rayStart[1]];
        const s = [edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]];
        // Calculando determinante
        const rxs = r[0] * s[1] - r[1] * s[0];
        // Se o determinante é zero, as linhas são paralelas
        if (Math.abs(rxs) < 0.000001) return null;
        // Ponto de início relativo
        const qp = [edgeStart[0] - rayStart[0], edgeStart[1] - rayStart[1]];
        // Calcular parâmetros t e u
        const t = (qp[0] * s[1] - qp[1] * s[0]) / rxs;
        const u = (qp[0] * r[1] - qp[1] * r[0]) / rxs;
        // Verificar se a interseção está dentro dos segmentos
        if (t >= 0 && u >= 0 && u <= 1) {
            // Calcular ponto de interseção
            const intersection = [
                Math.round((rayStart[0] + t * r[0]) * 10) / 10,
                Math.round((rayStart[1] + t * r[1]) * 10) / 10
            ];
            // Calcular distância
            const distance = Math.sqrt(
                Math.pow(intersection[0] - rayStart[0], 2) +
                Math.pow(intersection[1] - rayStart[1], 2)
            );
            return {
                point: intersection,
                distance: distance
            };
        }
        return null;
    }
    /**
     * Calcula interseção entre duas linhas
     * @param {Array} line1Start - Início da linha 1 [x, y]
     * @param {Array} line1End - Fim da linha 1 [x, y]
     * @param {Array} line2Start - Início da linha 2 [x, y]
     * @param {Array} line2End - Fim da linha 2 [x, y]
     * @returns {Array|null} Ponto de interseção [x, y] ou null se não há interseção
     */
    lineIntersection(line1Start, line1End, line2Start, line2End) {
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
    /**
     * Verifica se um ponto está dentro de um segmento de linha
     * @param {Array} point - Ponto a verificar [x, y]
     * @param {Array} lineStart - Início do segmento [x, y]
     * @param {Array} lineEnd - Fim do segmento [x, y]
     * @returns {boolean} True se o ponto está no segmento
     */
    isPointOnLineSegment(point, lineStart, lineEnd) {
        const tolerance = 1.0; // Tolerância mais generosa para capturar mais interseções
        // Verificar se o ponto está dentro do bounding box do segmento
        const minX = Math.min(lineStart[0], lineEnd[0]) - tolerance;
        const maxX = Math.max(lineStart[0], lineEnd[0]) + tolerance;
        const minY = Math.min(lineStart[1], lineEnd[1]) - tolerance;
        const maxY = Math.max(lineStart[1], lineEnd[1]) + tolerance;
        if (!(point[0] >= minX && point[0] <= maxX && 
             point[1] >= minY && point[1] <= maxY)) {
            return false;
        }
        // Para maior precisão, verificar a distância do ponto à linha
        // Se o segmento for muito curto, simplificar a verificação
        const length = Math.sqrt(
            Math.pow(lineEnd[0] - lineStart[0], 2) + 
            Math.pow(lineEnd[1] - lineStart[1], 2)
        );
        if (length < tolerance * 2) {
            return true; // Segmento muito curto, aceitar se dentro do bounding box
        }
        // Para segmentos mais longos, verificar a distância perpendicular
        const distToLine = this.distancePointToLine(point, lineStart, lineEnd);
        return distToLine < tolerance;
    }
    /**
     * Define prioridade de exibição por direção
     * @param {string} direction - Nome da direção
     * @returns {number} Valor de prioridade (menor = maior prioridade)
     */
    getDirectionPriority(direction) {
        const priorities = {
            'norte': 1,   // Cima - maior prioridade
            'sul': 2,     // Baixo
            'leste': 3,   // Direita
            'oeste': 4    // Esquerda
        };
        return priorities[direction] || 5;
    }
    /*
     * MÉTODOS ANTIGOS - COMENTADOS PARA MANTER COMO BACKUP
     * Agora usando calculateDirectionalDistancesToWalls() que respeita limites das paredes
     */
    /*
     * Calcula distâncias do ponto de snap para paredes existentes próximas
     * @param {Array} snapPoint - Ponto de snap atual [x, y]
     */
    /*
    calculateDistancesToWalls(snapPoint) {
        if (!walls || walls.length === 0) return;
        const maxWallDistances = Math.min(virtualDimensionMaxCount, 3); // Máximo 3 paredes
        // Calcular distâncias e ordenar por proximidade
        const wallDistances = [];
        walls.forEach(wall => {
            const wallDistance = this.distancePointToLine(
                snapPoint, 
                wall.startPoint, 
                wall.endPoint
            );
            if (wallDistance > 0.1) { // Apenas limite mínimo para evitar divisão por zero
                const closestPoint = this.closestPointOnLine(
                    snapPoint, 
                    wall.startPoint, 
                    wall.endPoint
                );
                wallDistances.push({ 
                    wall, 
                    distance: wallDistance, 
                    closestPoint: closestPoint 
                });
            }
        });
        // Ordenar por distância e pegar apenas as mais próximas
        wallDistances
            .sort((a, b) => a.distance - b.distance)
            .slice(0, maxWallDistances)
            .forEach(({ wall, distance, closestPoint }, index) => {
                this.virtualDimensions.push({
                    type: 'wall-distance',
                    startPoint: snapPoint,
                    endPoint: closestPoint,
                    value: distance,
                    label: formatLength(distance / pixelsPerCm),
                    color: virtualDimensionSecondaryColor,
                    priority: 1 + index,
                    targetWall: wall
                });
            });
    }
    */
    /**
     * Calcula distâncias do ponto de snap para bordas das áreas de movimentação
     * @param {Array} snapPoint - Ponto de snap atual [x, y]
     */
    calculateDistancesToAreaEdges(snapPoint) {
        if (!movementAreas || movementAreas.length === 0) {
            return;
        }
        // Primeiro determinar em qual área o ponto está
        let containingArea = null;
        for (const area of movementAreas) {
            if (this.isPointInArea(snapPoint, area)) {
                containingArea = area;
                break;
            }
        }
        if (!containingArea) {
            return;
        }
        // Calcular distâncias para cada segmento da borda da área
        const vertices = containingArea.vertices || 
            (containingArea.x !== undefined ? this.rectangleToVertices(containingArea) : null);
        if (!vertices || vertices.length < 3) {
            return;
        }
        // Calcular direções principais (N, S, L, O) para as bordas
        this.calculateDirectionalDistancesToAreaEdges(snapPoint, vertices, containingArea);
    }
    /**
     * Calcula distâncias direcionais do ponto para as bordas da área nas 4 direções cardeais
     * @param {Array} snapPoint - Ponto atual [x, y]
     * @param {Array} vertices - Vértices da área
     * @param {Object} area - Área contendo o ponto
     */
    calculateDirectionalDistancesToAreaEdges(snapPoint, vertices, area) {
        const directions = [
            { name: 'norte', vector: [0, -1], color: virtualDimensionColor }, 
            { name: 'sul', vector: [0, 1], color: virtualDimensionColor },   
            { name: 'leste', vector: [1, 0], color: virtualDimensionColor }, 
            { name: 'oeste', vector: [-1, 0], color: virtualDimensionColor } 
        ];
        let cotasAdicionadas = 0;
        directions.forEach(direction => {
            // Criar um raio a partir do ponto na direção especificada
            const rayEnd = [
                snapPoint[0] + direction.vector[0] * 10000,
                snapPoint[1] + direction.vector[1] * 10000
            ];
            // Encontrar a interseção mais próxima com as bordas da área
            let closestIntersection = null;
            let closestDistance = Infinity;
            for (let i = 0; i < vertices.length; i++) {
                const j = (i + 1) % vertices.length;
                const edgeStart = vertices[i];
                const edgeEnd = vertices[j];
                const intersection = this.lineIntersection(snapPoint, rayEnd, edgeStart, edgeEnd);
                if (intersection) {
                    // Verificar se a interseção está na direção correta
                    const dx = intersection[0] - snapPoint[0];
                    const dy = intersection[1] - snapPoint[1];
                    const dotProduct = dx * direction.vector[0] + dy * direction.vector[1];
                    if (dotProduct > 0) {
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestIntersection = intersection;
                        }
                    }
                }
            }
            // Adicionar a dimensão virtual se encontrou uma interseção
            if (closestIntersection && closestDistance > 0.5) {
                this.virtualDimensions.push({
                    type: 'area-edge-distance',
                    startPoint: snapPoint,
                    endPoint: closestIntersection,
                    value: closestDistance,
                    label: formatLength(closestDistance / pixelsPerCm),
                    color: direction.color,
                    priority: this.getDirectionPriority(direction.name),
                    direction: direction.name,
                    targetArea: area
                });
                cotasAdicionadas++;
            }
        });
    }
    /**
     * Verifica se um ponto está dentro de uma área
     * @param {Array} point - Ponto [x, y]
     * @param {Object} area - Área a verificar
     * @returns {boolean} - True se o ponto está dentro da área
     */
    isPointInArea(point, area) {
        if (!area) return false;
        // Verificar se a área tem vértices ou precisa converter de retângulo
        const vertices = area.vertices || 
            (area.x !== undefined ? this.rectangleToVertices(area) : null);
        if (!vertices || vertices.length < 3) return false;
        // Usar a função importada pointInPolygon
        return pointInPolygon(point, vertices);
    }
    /**
     * Converte um retângulo em um array de vértices
     * @param {Object} rect - Objeto com x, y, width, height
     * @returns {Array} - Array de vértices no formato [[x,y], [x,y], ...]
     */
    rectangleToVertices(rect) {
        if (!rect || rect.x === undefined || rect.y === undefined || 
            rect.width === undefined || rect.height === undefined) {
            return null;
        }
        return [
            [rect.x, rect.y],
            [rect.x + rect.width, rect.y],
            [rect.x + rect.width, rect.y + rect.height],
            [rect.x, rect.y + rect.height]
        ];
    }
    /**
     * Calcula distância de um ponto a uma linha
     * @param {Array} point - Ponto [x, y]
     * @param {Array} lineStart - Início da linha [x, y]
     * @param {Array} lineEnd - Fim da linha [x, y]
     * @returns {number} - Distância do ponto à linha
     */
    distancePointToLine(point, lineStart, lineEnd) {
        const x = point[0], y = point[1];
        const x1 = lineStart[0], y1 = lineStart[1];
        const x2 = lineEnd[0], y2 = lineEnd[1];
        // Caso especial: linha é um ponto
        if (x1 === x2 && y1 === y2) {
            return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
        }
        // Cálculo da distância perpendicular
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        const param = dot / len_sq;
        let xx, yy;
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    /**
     * Calcula o ponto mais próximo em uma linha a partir de um ponto
     * @param {Array} point - Ponto [x, y]
     * @param {Array} lineStart - Início da linha [x, y]
     * @param {Array} lineEnd - Fim da linha [x, y]
     * @returns {Array} - Ponto mais próximo na linha [x, y]
     */
    closestPointOnLine(point, lineStart, lineEnd) {
        const x = point[0], y = point[1];
        const x1 = lineStart[0], y1 = lineStart[1];
        const x2 = lineEnd[0], y2 = lineEnd[1];
        // Caso especial: linha é um ponto
        if (x1 === x2 && y1 === y2) {
            return [x1, y1];
        }
        // Cálculo do ponto mais próximo
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        const param = dot / len_sq;
        let xx, yy;
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        return [xx, yy];
    }
    /**
     * Verifica se dois pontos são iguais
     * @param {Array} p1 - Primeiro ponto [x, y]
     * @param {Array} p2 - Segundo ponto [x, y]
     * @returns {boolean} - True se os pontos são iguais
     */
    isSamePoint(p1, p2) {
        if (!p1 || !p2) return false;
        const tolerance = 0.001;
        return Math.abs(p1[0] - p2[0]) < tolerance && Math.abs(p1[1] - p2[1]) < tolerance;
    }
    /**
     * Calcula cotas virtuais durante hover sobre áreas
     * Agora usa o sistema de cotas direcionais (Norte, Sul, Leste, Oeste) igual ao preview de parede
     * @param {Array} mousePos - Posição atual do mouse [x, y]
     * @param {Object} hoveredArea - Área sendo hovereada
     * @returns {Array} Array de objetos de dimensão virtual
     */
    calculateAreaHoverDimensions(mousePos, hoveredArea) {
        if (!mousePos || !hoveredArea) {
            return [];
        }
        // Limpar dimensões virtuais antes de calcular
        this.virtualDimensions = [];
        // Sistema unificado: nossa função simplificada que sempre considera paredes E bordas
        // e escolhe o que estiver mais próximo em cada direção
        this.calculateUnifiedDirectionalDistances(mousePos, hoveredArea);
        // Retornar as dimensões virtuais calculadas
        return this.virtualDimensions;
    }
    /**
     * Calcula cotas virtuais quando a ferramenta de parede está ativa mas ainda não está desenhando
     * Agora usa o sistema de cotas direcionais (Norte, Sul, Leste, Oeste) para consistência
     * @param {Array} mousePos - Posição atual do mouse [x, y]
     * @returns {Array} Array de objetos de dimensão virtual
     */
    calculateWallToolHoverDimensions(mousePos) {
        if (!mousePos) {
            return [];
        }
        // Limpar dimensões virtuais
        this.virtualDimensions = [];
        // Usar o mesmo sistema de cotas direcionais do preview de parede
        // Calcular as 4 direções (Norte, Sul, Leste, Oeste) para máxima visibilidade
        this.calculateDirectionalDistancesToWalls(mousePos);
        // Retornar as dimensões virtuais calculadas
        return this.virtualDimensions;
    }
    /**
     * Limpa todas as dimensões virtuais
     */
    clear() {
        this.virtualDimensions = [];
        this.snapDistances = [];
    }
    /**
     * Calcula cotas virtuais para a ferramenta de parede em modo hover
     * @param {Array} point - Posição do mouse [x, y]
     * @returns {Array} Array de objetos de dimensão virtual
     */
    calculateWallToolHoverDimensions(point) {
        if (!point) {
            return [];
        }
        this.virtualDimensions = [];
        // Calcular distâncias direcionais para paredes
        this.calculateDirectionalDistancesToWalls(point);
        // Ordenar por prioridade e limitar o número de cotas exibidas
        this.virtualDimensions.sort((a, b) => a.priority - b.priority);
        if (this.virtualDimensions.length > virtualDimensionMaxCount) {
            this.virtualDimensions = this.virtualDimensions.slice(0, virtualDimensionMaxCount);
        }
        return this.virtualDimensions;
    }
    /**
     * Calcula as distâncias direcionais considerando tanto paredes quanto bordas de áreas
     * @param {Array} point - Ponto atual [x, y]
     * @param {Object} area - Área sobre a qual o hover está ativo
     */
    calculateUnifiedDirectionalDistances(point, area) {
        if (!point || !area) return;
        // Direções cardeais (Norte, Sul, Leste, Oeste)
        const directions = [
            { name: 'norte', vector: [0, -1], color: virtualDimensionColor }, 
            { name: 'sul', vector: [0, 1], color: virtualDimensionColor },   
            { name: 'leste', vector: [1, 0], color: virtualDimensionColor }, 
            { name: 'oeste', vector: [-1, 0], color: virtualDimensionColor } 
        ];
        // Limpeza para garantir que não haja valores antigos causando problemas
        this.virtualDimensions = [];
        // Para cada direção (Norte, Sul, Leste, Oeste), calcular as distâncias
        directions.forEach(direction => {
            // Criar um raio com 10000 pixels de comprimento na direção especificada 
            const rayEnd = [
                point[0] + direction.vector[0] * 10000,
                point[1] + direction.vector[1] * 10000
            ];
            // Estruturas para armazenar o objeto mais próximo em cada direção
            let closestIntersection = null;  // Ponto de interseção mais próximo
            let closestDistance = Infinity;  // Distância ao objeto mais próximo
            let closestType = null;          // Tipo do objeto mais próximo (parede ou borda)
            let closestTarget = null;        // O objeto em si (wall ou area)
            // 1. Verificar TODAS as paredes - importante verificar TODAS, não apenas algumas
            for (let i = 0; i < walls.length; i++) {
                const wall = walls[i];
                if (!wall || !wall.startPoint || !wall.endPoint) continue;
                // Calcular interseção entre o raio e a parede
                const intersection = this.lineIntersection(
                    point, rayEnd, 
                    wall.startPoint, wall.endPoint
                );
                // Se houver interseção e estiver nos limites da parede
                if (intersection && this.isPointOnLineSegment(
                    intersection, wall.startPoint, wall.endPoint)) {
                    // Verificar se a interseção está na direção correta do raio
                    const toIntersection = [
                        intersection[0] - point[0], 
                        intersection[1] - point[1]
                    ];
                    // Produto escalar para confirmar que está na mesma direção
                    const dotProduct = 
                        toIntersection[0] * direction.vector[0] + 
                        toIntersection[1] * direction.vector[1];
                    // Se o produto escalar é positivo, está na direção correta
                    if (dotProduct > 0) {
                        // Calcular distância
                        const distance = Math.sqrt(
                            toIntersection[0] * toIntersection[0] + 
                            toIntersection[1] * toIntersection[1]
                        );
                        // Debugging: imprimir todas as distâncias encontradas
                        // Se esta parede é a mais próxima até agora
                        if (distance < closestDistance && distance > 0.5) {
                            closestDistance = distance;
                            closestIntersection = intersection;
                            closestType = 'wall';
                            closestTarget = wall;
                        }
                    }
                }
            }
            // 2. Verificar bordas da área atual
            const vertices = area.vertices || (area.x !== undefined ? this.rectangleToVertices(area) : null);
            if (vertices && vertices.length >= 3) {
                // Para cada aresta do polígono
                for (let i = 0; i < vertices.length; i++) {
                    const j = (i + 1) % vertices.length;
                    const edgeStart = vertices[i];
                    const edgeEnd = vertices[j];
                    // Calcular interseção entre o raio e a aresta
                    const intersection = this.lineIntersection(
                        point, rayEnd,
                        edgeStart, edgeEnd
                    );
                    // Se houver interseção
                    if (intersection) {
                        // Verificar se está na direção correta
                        const toIntersection = [
                            intersection[0] - point[0],
                            intersection[1] - point[1]
                        ];
                        // Produto escalar para confirmar direção
                        const dotProduct = 
                            toIntersection[0] * direction.vector[0] + 
                            toIntersection[1] * direction.vector[1];
                        if (dotProduct > 0) {
                            // Calcular distância
                            const distance = Math.sqrt(
                                toIntersection[0] * toIntersection[0] + 
                                toIntersection[1] * toIntersection[1]
                            );
                            // Debugging
                            // Se esta borda é a mais próxima até agora
                            if (distance < closestDistance && distance > 0.5) {
                                closestDistance = distance;
                                closestIntersection = intersection;
                                closestType = 'edge';
                                closestTarget = area;
                            }
                        }
                    }
                }
            }
            // 3. Se encontramos alguma interseção, criar a dimensão virtual
            if (closestIntersection && closestDistance < Infinity) {
                // Formatar o label com a distância em cm
                const label = formatLength(closestDistance / pixelsPerCm);
                // Criar objeto base da dimensão virtual
                const dimensionBase = {
                    startPoint: point,
                    endPoint: closestIntersection,
                    value: closestDistance,
                    label: label,
                    color: direction.color,
                    priority: this.getDirectionPriority(direction.name),
                    direction: direction.name
                };
                // Criar objeto de dimensão específico de acordo com o tipo encontrado
                if (closestType === 'wall') {
                    // É uma parede - foi o limite mais próximo
                    this.virtualDimensions.push({
                        ...dimensionBase,
                        type: 'directional-wall-distance',
                        targetWall: closestTarget
                    });
                } else if (closestType === 'edge') {
                    // É uma borda de área - foi o limite mais próximo
                    this.virtualDimensions.push({
                        ...dimensionBase,
                        type: 'area-edge-distance',
                        targetArea: closestTarget
                    });
                }
            } else {
            }
        });
        const results = {};
        this.virtualDimensions.forEach(dim => {
            results[dim.direction] = {
                type: dim.type,
                distance: Math.round(dim.value),
                cm: Math.round(dim.value / pixelsPerCm)
            };
        });
    }
    /**
     * Desenha todas as cotas virtuais no contexto 2D
     * @param {CanvasRenderingContext2D} ctx - Contexto 2D do canvas
     * @param {number} scale - Escala atual de visualização
     */
    drawVirtualDimensions(ctx, scale) {
        if (!this.virtualDimensions || this.virtualDimensions.length === 0) {
            return;
        }
        // Definir estilos
        ctx.save();
        ctx.lineWidth = 1 / scale;
        
        // Sistema unificado de cotas para dimensões virtuais
        const fontConfig = DIMENSION_SYSTEM.getFontConfig('virtual', scale);
        ctx.font = fontConfig.string;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Desenhar cada dimensão virtual
        this.virtualDimensions.forEach(dim => {
            this.drawVirtualDimension(ctx, dim, scale);
        });
        ctx.restore();
    }
    /**
     * Desenha uma única cota virtual
     * @param {CanvasRenderingContext2D} ctx - Contexto 2D do canvas
     * @param {Object} dimension - Objeto de dimensão virtual
     * @param {number} scale - Escala atual de visualização
     */
    drawVirtualDimension(ctx, dimension, scale) {
        const { startPoint, endPoint, label, color } = dimension;
        // Definir cor da dimensão
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        // Configurar estilo de linha tracejada para dimensões virtuais
        ctx.setLineDash([4 / scale, 3 / scale]);
        // Desenhar linha principal
        ctx.beginPath();
        ctx.moveTo(startPoint[0], startPoint[1]);
        ctx.lineTo(endPoint[0], endPoint[1]);
        ctx.stroke();
        // Resetar linha tracejada para indicadores
        ctx.setLineDash([]);
        // Desenhar indicadores nas extremidades (círculos pequenos)
        const indicatorRadius = 3 / scale;
        // Indicador início
        ctx.beginPath();
        ctx.arc(startPoint[0], startPoint[1], indicatorRadius, 0, 2 * Math.PI);
        ctx.fill();
        // Indicador fim
        ctx.beginPath();
        ctx.arc(endPoint[0], endPoint[1], indicatorRadius, 0, 2 * Math.PI);
        ctx.fill();
        // Calcular posição do texto
        const midX = (startPoint[0] + endPoint[0]) / 2;
        const midY = (startPoint[1] + endPoint[1]) / 2;
        // Fundo semi-transparente para o texto
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 10 / scale;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(
            midX - textWidth / 2 - 2 / scale,
            midY - textHeight / 2 - 1 / scale,
            textWidth + 4 / scale,
            textHeight + 2 / scale
        );
        // Texto da dimensão
        ctx.fillStyle = color;
        ctx.fillText(label, midX, midY);
    }
    /**
     * Verifica se duas áreas estão conectadas (formam uma área unificada)
     * @param {Object} area1 - Primeira área
     * @param {Object} area2 - Segunda área
     * @returns {boolean} - True se as áreas estão conectadas
     */
    isAreaConnectedTo(area1, area2) {
        if (!area1 || !area2) return false;
        // Caso trivial: é a mesma área
        if (area1.id === area2.id) return true;
        // Caso unificado: verificar se uma área contém a outra ou se compartilham vértices
        const vertices1 = area1.vertices || (area1.x !== undefined ? this.rectangleToVertices(area1) : []);
        const vertices2 = area2.vertices || (area2.x !== undefined ? this.rectangleToVertices(area2) : []);
        if (vertices1.length < 3 || vertices2.length < 3) return false;
        // Verificar se algum vértice de area2 está dentro de area1
        for (const vertex of vertices2) {
            if (pointInPolygon(vertex, vertices1)) {
                return true;
            }
        }
        // Verificar se algum vértice de area1 está dentro de area2
        for (const vertex of vertices1) {
            if (pointInPolygon(vertex, vertices2)) {
                return true;
            }
        }
        // Verificar se compartilham alguma aresta (interseção de arestas)
        for (let i = 0; i < vertices1.length; i++) {
            const edge1Start = vertices1[i];
            const edge1End = vertices1[(i + 1) % vertices1.length];
            for (let j = 0; j < vertices2.length; j++) {
                const edge2Start = vertices2[j];
                const edge2End = vertices2[(j + 1) % vertices2.length];
                if (this.lineIntersection(edge1Start, edge1End, edge2Start, edge2End)) {
                    return true;
                }
            }
        }
        return false;
    }
}
// Criar instância global do sistema
const virtualDimensionsSystem = new VirtualDimensionsSystem();
/**
 * Desenha cotas virtuais para o ponto de hover atual
 * @param {CanvasRenderingContext2D} ctx - Contexto 2D do canvas
 * @param {Array} point - Ponto de hover [x, y]
 * @param {number} scale - Escala atual
 */
function drawVirtualHoverDimensions(ctx, point, scale) {
    if (!virtualDimensionsEnabled) return;
    // Usar as dimensões já calculadas pelo sistema de hover
    // Isso garante que usamos os valores processados pelo calculateAreaHoverDimensions
    // e não recalculamos desnecessariamente
    virtualDimensionsSystem.drawVirtualDimensions(ctx, scale);
}
export {
    virtualDimensionsSystem,
    drawVirtualHoverDimensions,
    VirtualDimensionsSystem
};

