// Sistema de Snap Inteligente com Push Automático e Linhas Guia
// Este módulo implementa snap inteligente que empurra automaticamente as linhas
// para bordas e quinas, além de um sistema completo de linhas guia de ajuda
import { walls, movementAreas, setActiveGuideLines } from './state.js';
import { 
    smartSnapEnabled, edgePushThreshold, cornerPushThreshold, wallEndPushThreshold,
    wallIntersectionPushThreshold, edgePushStrength, cornerPushStrength, wallEndPushStrength, 
    wallIntersectionPushStrength, guideLineExtension, 
    snapIndicatorRadius, snapIndicatorColor, rightAngleGuideEnabled, 
    parallelGuideEnabled, perpendicularGuideEnabled, extensionGuideEnabled, alignmentGuideEnabled,
    guideSnapDistance, rightAngleGuideColor2, parallelGuideColor,
    perpendicularGuideColor, extensionGuideColor, alignmentGuideColor,
    autoPushEnabled, angleSnapTolerance
} from './config.js';
/**
 * Interface principal para o sistema de snap inteligente
 */
class SmartSnapSystem {
    constructor() {
        this.activeGuides = [];
        this.snapIndicators = [];
        this.pushTargets = [];
        this.lastMousePos = null;
    }    /**
     * Função principal chamada durante o movimento do mouse ou no primeiro clique
     * @param {Array} currentPos - Posição atual do mouse [x, y]
     * @param {Array} startPoint - Ponto inicial da parede [x, y] ou null para primeiro clique
     * @returns {Object} Resultado do snap com posição corrigida e informações
     */
    processSmartSnap(currentPos, startPoint = null) {
        if (!smartSnapEnabled) {
            return { point: currentPos, guides: [], indicators: [] };
        }
        this.lastMousePos = currentPos;
        this.activeGuides = [];
        this.snapIndicators = [];
        this.pushTargets = [];
        // 1. Detectar oportunidades de push automático (funciona mesmo sem startPoint)
        const pushResult = this.detectPushOpportunities(currentPos, startPoint);
        let adjustedPos = pushResult.adjustedPosition || currentPos;
        // 2. Se há startPoint, gerar linhas guia baseadas na posição ajustada
        let guideResult = { guides: [] };
        if (startPoint) {
            guideResult = this.generateSmartGuides(adjustedPos, startPoint);
        }
        // 3. Verificar se o usuário está claramente tentando desenhar livremente
        let finalResult = { snappedPosition: adjustedPos };
        if (startPoint) {
            const currentAngle = Math.atan2(adjustedPos[1] - startPoint[1], adjustedPos[0] - startPoint[0]);
            const isNearRightAngle = this.isNearRightAngleWithExistingWalls(currentAngle);
            // Só aplicar snap se o usuário estiver claramente próximo a um ângulo reto
            // ou se a distância do snap for muito pequena
            const snapResult = this.applyGuideSnap(adjustedPos, startPoint, guideResult.guides);
            const snapDistance = this.distance(adjustedPos, snapResult.snappedPosition);
            if ((isNearRightAngle && snapDistance <= guideSnapDistance) || 
                snapDistance <= guideSnapDistance / 2) {  // Snap muito próximo sempre aplicado
                finalResult = snapResult;
            }
        }
        return {
            point: finalResult.snappedPosition,
            guides: guideResult.guides,
            indicators: this.snapIndicators,
            pushTargets: this.pushTargets,
            snapType: finalResult.snapType || pushResult.pushType
        };
    }
    /**
     * Verifica se o ângulo atual está próximo de formar um ângulo reto com paredes existentes
     */
    isNearRightAngleWithExistingWalls(currentAngle) {
        const angleDeg = currentAngle * 180 / Math.PI;
        for (let wall of walls) {
            const wallAngle = Math.atan2(
                wall.endPoint[1] - wall.startPoint[1],
                wall.endPoint[0] - wall.startPoint[0]
            ) * 180 / Math.PI;
            const angleDiff = Math.abs(angleDeg - (wallAngle + 90)) % 360;
            const normalizedDiff = Math.min(angleDiff, 360 - angleDiff);
            if (normalizedDiff <= angleSnapTolerance) {
                return true;
            }
        }
        return false;
    }    /**
     * Detecta oportunidades de push automático para bordas e quinas
     */
    detectPushOpportunities(currentPos, startPoint) {
        if (!autoPushEnabled) return { adjustedPosition: currentPos };
        let bestPush = null;
        let minPriorityDistance = Infinity;
        // Coletar todos os push candidates
        const pushCandidates = [];
        // Verificar push para bordas de áreas
        for (let area of movementAreas) {
            if (!area.vertices || area.vertices.length < 3) continue;
            const pushResults = this.checkAreaPushOpportunities(currentPos, startPoint, area);
            pushCandidates.push(...pushResults);
        }        // Verificar push para paredes existentes
        for (let wall of walls) {
            const pushResult = this.checkWallPushOpportunities(currentPos, startPoint, wall);
            if (pushResult) {
                pushCandidates.push(pushResult);
            }
        }        // 🆕 NOVA FUNCIONALIDADE: Verificar push para interseções de paredes (PRIORIDADE MÁXIMA)
        const wallIntersections = this.findWallIntersections();
        for (let intersection of wallIntersections) {
            const distance = this.distance(currentPos, intersection.point);
            if (distance <= wallIntersectionPushThreshold) { // 🆕 Usar threshold específico
                pushCandidates.push({
                    type: 'wall-intersection', // 🆕 NOVO TIPO com prioridade máxima
                    targetPosition: [...intersection.point], // Snap direto na interseção
                    distance: distance,
                    wall1Id: intersection.wall1.id,
                    wall2Id: intersection.wall2.id,
                    pushStrength: wallIntersectionPushStrength, // 🆕 Usar strength específico
                    priority: 'maximum' // 🆕 Prioridade ainda maior que vértices
                });
            }
        }// Priorizar por tipo e distância (interseções > vértices > extremidades > bordas)
        const getPriority = (pushType) => {
            switch (pushType) {
                case 'wall-intersection': return 0; // 🆕 PRIORIDADE SUPREMA para interseções
                case 'vertex': return 1; // MÁXIMA prioridade para vértices
                case 'wall-end': return 2; // ALTA prioridade para extremidades  
                case 'edge':
                case 'wall-edge': return 3; // Prioridade normal para bordas
                default: return 4;
            }
        };
        for (let candidate of pushCandidates) {
            const priority = getPriority(candidate.type);
            const priorityDistance = candidate.distance + (priority * 5); // Offset por prioridade
            if (priorityDistance < minPriorityDistance) {
                minPriorityDistance = priorityDistance;
                bestPush = candidate;
            }
        }        // Verificar se o melhor push está dentro dos thresholds apropriados
        const maxThreshold = Math.max(edgePushThreshold, cornerPushThreshold, wallEndPushThreshold, wallIntersectionPushThreshold);
        if (bestPush && bestPush.distance <= maxThreshold) {
            // Log para debug do push diferenciado
            this.pushTargets.push(bestPush);
              // Adicionar indicador visual com cor baseada na prioridade
            let indicatorColor = snapIndicatorColor;
            switch (bestPush.type) {
                case 'wall-intersection':
                    indicatorColor = '#ff0080'; // 🆕 Rosa/magenta para interseções de paredes
                    break;
                case 'vertex':
                    indicatorColor = '#ff6600'; // Laranja para vértices
                    break;
                case 'wall-end':
                    indicatorColor = '#0099ff'; // Azul para extremidades de paredes
                    break;
                case 'edge':
                case 'wall-edge':
                    indicatorColor = '#00ff00'; // Verde para bordas
                    break;
            }this.snapIndicators.push({
                position: bestPush.targetPosition,
                type: 'push',
                color: indicatorColor,
                radius: snapIndicatorRadius, // RAIO FIXO - sem multiplicação por pushStrength
                pushStrength: bestPush.pushStrength || 1
            });
            return {
                adjustedPosition: bestPush.targetPosition,
                pushType: bestPush.type,
                distance: bestPush.distance,
                pushStrength: bestPush.pushStrength
            };
        }
        return { adjustedPosition: currentPos };
    }
    /**
     * Verifica oportunidades de push para uma área específica
     */
    checkAreaPushOpportunities(currentPos, startPoint, area) {
        const pushResults = [];
        const vertices = area.vertices;
        for (let i = 0; i < vertices.length; i++) {
            const p1 = vertices[i];
            const p2 = vertices[(i + 1) % vertices.length];            // Verificar push para quina (PRIORIDADE ALTA) - Algoritmo suave
            const cornerDist1 = this.distance(currentPos, p1);
            const cornerDist2 = this.distance(currentPos, p2);
            if (cornerDist1 <= cornerPushThreshold) {
                // Push suave para vértices - sem empurrar contra o movimento do mouse
                pushResults.push({
                    type: 'vertex',
                    targetPosition: [...p1], // Snap direto no vértice, sem calcular push
                    distance: cornerDist1,
                    areaId: area.id,
                    vertex: p1,
                    pushStrength: cornerPushStrength,
                    priority: 'high'
                });
            }
            if (cornerDist2 <= cornerPushThreshold) {
                // Push suave para vértices - sem empurrar contra o movimento do mouse
                pushResults.push({
                    type: 'vertex',
                    targetPosition: [...p2], // Snap direto no vértice, sem calcular push
                    distance: cornerDist2,
                    areaId: area.id,
                    vertex: p2,
                    pushStrength: cornerPushStrength,
                    priority: 'high'
                });
            }            // Verificar push para borda (menor prioridade) - Algoritmo suave
            const edgeResult = this.getClosestPointOnSegment(currentPos, p1, p2);
            if (edgeResult.distance <= edgePushThreshold) {
                // Push suave para bordas - snap direto no ponto mais próximo
                pushResults.push({
                    type: 'edge',
                    targetPosition: edgeResult.point, // Snap direto no ponto, sem cálculo extra
                    distance: edgeResult.distance,
                    areaId: area.id,
                    edge: [p1, p2],
                    pushStrength: edgePushStrength,
                    priority: 'normal'
                });
            }
        }
        return pushResults;
    }    /**
     * Verifica oportunidades de push para uma parede específica
     */
    checkWallPushOpportunities(currentPos, startPoint, wall) {
        // Push para extremidades da parede (SNAP DIRETO - SEM CÁLCULO COMPLEXO)
        const startDist = this.distance(currentPos, wall.startPoint);
        const endDist = this.distance(currentPos, wall.endPoint);
        if (startDist <= wallEndPushThreshold) {
            return {
                type: 'wall-end',
                targetPosition: [...wall.startPoint], // SNAP DIRETO no ponto final
                distance: startDist,
                wallId: wall.id,
                pushStrength: wallEndPushStrength,
                priority: 'medium-high'
            };
        }
        if (endDist <= wallEndPushThreshold) {
            return {
                type: 'wall-end',
                targetPosition: [...wall.endPoint], // SNAP DIRETO no ponto final
                distance: endDist,
                wallId: wall.id,
                pushStrength: wallEndPushStrength,
                priority: 'medium-high'
            };
        }
        // Push para linha da parede (SNAP DIRETO no ponto mais próximo)
        const edgeResult = this.getClosestPointOnSegment(currentPos, wall.startPoint, wall.endPoint);
        if (edgeResult.distance <= edgePushThreshold) {
            return {
                type: 'wall-edge',
                targetPosition: edgeResult.point, // SNAP DIRETO no ponto mais próximo
                distance: edgeResult.distance,
                wallId: wall.id,
                pushStrength: edgePushStrength,
                priority: 'normal'
            };
        }
        return null;
    }
    /**
     * Gera linhas guia inteligentes baseadas no contexto
     */
    generateSmartGuides(currentPos, startPoint) {
        const guides = [];
        // Linhas guia para ângulos retos
        if (rightAngleGuideEnabled) {
            guides.push(...this.generateRightAngleGuides(currentPos, startPoint));
        }
        // Linhas guia paralelas
        if (parallelGuideEnabled) {
            guides.push(...this.generateParallelGuides(currentPos, startPoint));
        }
        // Linhas guia perpendiculares
        if (perpendicularGuideEnabled) {
            guides.push(...this.generatePerpendicularGuides(currentPos, startPoint));
        }
        // Linhas guia de extensão
        if (extensionGuideEnabled) {
            guides.push(...this.generateExtensionGuides(currentPos, startPoint));
        }
        // Linhas guia de alinhamento
        if (alignmentGuideEnabled) {
            guides.push(...this.generateAlignmentGuides(currentPos, startPoint));
        }
        return { guides };
    }
    /**
     * Gera guias para ângulos retos com paredes existentes
     */
    generateRightAngleGuides(currentPos, startPoint) {
        const guides = [];
        for (let wall of walls) {
            const wallAngle = Math.atan2(
                wall.endPoint[1] - wall.startPoint[1],
                wall.endPoint[0] - wall.startPoint[0]
            );
            // Ângulo perpendicular (90 graus)
            const perpAngle = wallAngle + Math.PI / 2;
            // Gerar linha guia perpendicular passando pelo ponto inicial
            const guideEnd1 = [
                startPoint[0] + Math.cos(perpAngle) * guideLineExtension,
                startPoint[1] + Math.sin(perpAngle) * guideLineExtension
            ];
            const guideEnd2 = [
                startPoint[0] - Math.cos(perpAngle) * guideLineExtension,
                startPoint[1] - Math.sin(perpAngle) * guideLineExtension
            ];
            guides.push({
                type: 'right-angle',
                startPoint: guideEnd2,
                endPoint: guideEnd1,
                referenceWall: wall.id,
                color: rightAngleGuideColor2,
                angle: perpAngle,
                snapAngle: perpAngle
            });
            // Também gerar guia paralela
            const guideEnd3 = [
                startPoint[0] + Math.cos(wallAngle) * guideLineExtension,
                startPoint[1] + Math.sin(wallAngle) * guideLineExtension
            ];
            const guideEnd4 = [
                startPoint[0] - Math.cos(wallAngle) * guideLineExtension,
                startPoint[1] - Math.sin(wallAngle) * guideLineExtension
            ];
            guides.push({
                type: 'parallel',
                startPoint: guideEnd4,
                endPoint: guideEnd3,
                referenceWall: wall.id,
                color: parallelGuideColor,
                angle: wallAngle,
                snapAngle: wallAngle
            });
        }
        return guides;
    }
    /**
     * Gera guias paralelas às bordas das áreas
     */
    generateParallelGuides(currentPos, startPoint) {
        const guides = [];
        for (let area of movementAreas) {
            if (!area.vertices || area.vertices.length < 3) continue;
            for (let i = 0; i < area.vertices.length; i++) {
                const p1 = area.vertices[i];
                const p2 = area.vertices[(i + 1) % area.vertices.length];
                const edgeAngle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
                // Linha guia paralela à borda passando pelo ponto inicial
                const guideEnd1 = [
                    startPoint[0] + Math.cos(edgeAngle) * guideLineExtension,
                    startPoint[1] + Math.sin(edgeAngle) * guideLineExtension
                ];
                const guideEnd2 = [
                    startPoint[0] - Math.cos(edgeAngle) * guideLineExtension,
                    startPoint[1] - Math.sin(edgeAngle) * guideLineExtension
                ];
                guides.push({
                    type: 'parallel-edge',
                    startPoint: guideEnd2,
                    endPoint: guideEnd1,
                    referenceArea: area.id,
                    referenceEdge: [p1, p2],
                    color: parallelGuideColor,
                    angle: edgeAngle,
                    snapAngle: edgeAngle
                });
            }
        }
        return guides;
    }
    /**
     * Gera guias perpendiculares às bordas das áreas
     */
    generatePerpendicularGuides(currentPos, startPoint) {
        const guides = [];
        for (let area of movementAreas) {
            if (!area.vertices || area.vertices.length < 3) continue;
            for (let i = 0; i < area.vertices.length; i++) {
                const p1 = area.vertices[i];
                const p2 = area.vertices[(i + 1) % area.vertices.length];
                const edgeAngle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
                const perpAngle = edgeAngle + Math.PI / 2;
                // Linha guia perpendicular à borda passando pelo ponto inicial
                const guideEnd1 = [
                    startPoint[0] + Math.cos(perpAngle) * guideLineExtension,
                    startPoint[1] + Math.sin(perpAngle) * guideLineExtension
                ];
                const guideEnd2 = [
                    startPoint[0] - Math.cos(perpAngle) * guideLineExtension,
                    startPoint[1] - Math.sin(perpAngle) * guideLineExtension
                ];
                guides.push({
                    type: 'perpendicular-edge',
                    startPoint: guideEnd2,
                    endPoint: guideEnd1,
                    referenceArea: area.id,
                    referenceEdge: [p1, p2],
                    color: perpendicularGuideColor,
                    angle: perpAngle,
                    snapAngle: perpAngle
                });
            }
        }
        return guides;
    }
    /**
     * Gera guias de extensão de paredes e bordas existentes
     */
    generateExtensionGuides(currentPos, startPoint) {
        const guides = [];
        // Extensões de paredes
        for (let wall of walls) {
            const wallAngle = Math.atan2(
                wall.endPoint[1] - wall.startPoint[1],
                wall.endPoint[0] - wall.startPoint[0]
            );
            // Extensão a partir do final da parede
            const extendEnd = [
                wall.endPoint[0] + Math.cos(wallAngle) * guideLineExtension,
                wall.endPoint[1] + Math.sin(wallAngle) * guideLineExtension
            ];
            // Extensão a partir do início da parede
            const extendStart = [
                wall.startPoint[0] - Math.cos(wallAngle) * guideLineExtension,
                wall.startPoint[1] - Math.sin(wallAngle) * guideLineExtension
            ];
            guides.push({
                type: 'wall-extension',
                startPoint: extendStart,
                endPoint: extendEnd,
                referenceWall: wall.id,
                color: extensionGuideColor,
                angle: wallAngle,
                snapAngle: wallAngle
            });
        }
        return guides;
    }
    /**
     * Gera guias de alinhamento com vértices e pontos importantes
     */
    generateAlignmentGuides(currentPos, startPoint) {
        const guides = [];
        const importantPoints = [];
        // Coletar pontos importantes
        for (let area of movementAreas) {
            if (area.vertices) {
                importantPoints.push(...area.vertices);
            }
        }
        for (let wall of walls) {
            importantPoints.push(wall.startPoint, wall.endPoint);
        }
        // Gerar guias de alinhamento horizontal e vertical
        for (let point of importantPoints) {
            // Alinhamento horizontal
            if (Math.abs(point[1] - startPoint[1]) < guideSnapDistance) {
                guides.push({
                    type: 'horizontal-alignment',
                    startPoint: [startPoint[0] - guideLineExtension, point[1]],
                    endPoint: [startPoint[0] + guideLineExtension, point[1]],
                    referencePoint: point,
                    color: alignmentGuideColor,
                    isHorizontal: true
                });
            }
            // Alinhamento vertical
            if (Math.abs(point[0] - startPoint[0]) < guideSnapDistance) {
                guides.push({
                    type: 'vertical-alignment',
                    startPoint: [point[0], startPoint[1] - guideLineExtension],
                    endPoint: [point[0], startPoint[1] + guideLineExtension],
                    referencePoint: point,
                    color: alignmentGuideColor,
                    isVertical: true
                });
            }
        }
        return guides;
    }    /**
     * Aplica snap às linhas guia se o cursor estiver próximo
     */
    applyGuideSnap(currentPos, startPoint, guides) {
        let bestSnap = null;
        let minDistance = Infinity;
        for (let guide of guides) {
            if (guide.snapAngle !== undefined) {
                // Snap baseado em ângulo - usar tolerância configurável
                const currentAngle = Math.atan2(
                    currentPos[1] - startPoint[1],
                    currentPos[0] - startPoint[0]
                );
                const angleDiff = Math.abs(currentAngle - guide.snapAngle);
                const normalizedDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
                const angleToleranceRad = (angleSnapTolerance * Math.PI / 180); // Converter graus para radianos
                // Só aplicar snap se estiver dentro da tolerância configurada
                if (normalizedDiff <= angleToleranceRad) {
                    const distance = this.distance(currentPos, startPoint);
                    const snappedPos = [
                        startPoint[0] + Math.cos(guide.snapAngle) * distance,
                        startPoint[1] + Math.sin(guide.snapAngle) * distance
                    ];
                    if (normalizedDiff < minDistance) {
                        minDistance = normalizedDiff;
                        bestSnap = {
                            snappedPosition: snappedPos,
                            snapType: guide.type,
                            guide: guide
                        };
                    }
                }
            } else if (guide.isHorizontal || guide.isVertical) {
                // Snap baseado em posição
                let snapDistance, snappedPos;
                if (guide.isHorizontal) {
                    snapDistance = Math.abs(currentPos[1] - guide.startPoint[1]);
                    snappedPos = [currentPos[0], guide.startPoint[1]];
                } else {
                    snapDistance = Math.abs(currentPos[0] - guide.startPoint[0]);
                    snappedPos = [guide.startPoint[0], currentPos[1]];
                }
                if (snapDistance <= guideSnapDistance && snapDistance < minDistance) {
                    minDistance = snapDistance;
                    bestSnap = {
                        snappedPosition: snappedPos,
                        snapType: guide.type,
                        guide: guide
                    };
                }
            }
        }
        return bestSnap || { snappedPosition: currentPos };
    }
    /**
     * Calcula o ponto mais próximo em um segmento de linha
     */
    getClosestPointOnSegment(point, segStart, segEnd) {
        const dx = segEnd[0] - segStart[0];
        const dy = segEnd[1] - segStart[1];
        const length = dx * dx + dy * dy;
        if (length === 0) {
            return {
                point: [...segStart],
                distance: this.distance(point, segStart)
            };
        }
        let t = ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / length;
        t = Math.max(0, Math.min(1, t));
        const closestPoint = [
            segStart[0] + t * dx,
            segStart[1] + t * dy
        ];
        return {
            point: closestPoint,
            distance: this.distance(point, closestPoint),
            t: t
        };
    }
    /**
     * Calcula a distância entre dois pontos
     */
    distance(p1, p2) {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        return Math.sqrt(dx * dx + dy * dy);
    }
    /**
     * Limpa todas as guias ativas
     */
    clearGuides() {
        this.activeGuides = [];
        this.snapIndicators = [];
        this.pushTargets = [];
        setActiveGuideLines([]);
    }
    /**
     * Obtém as guias ativas para renderização
     */
    getActiveGuides() {
        return this.activeGuides;
    }    /**
     * Obtém os indicadores de snap para renderização
     */
    getSnapIndicators() {
        return this.snapIndicators;
    }
    /**
     * 🆕 Encontra todas as interseções entre paredes existentes
     * @returns {Array} Array de objetos {point, wall1, wall2}
     */
    findWallIntersections() {
        const intersections = [];
        for (let i = 0; i < walls.length; i++) {
            for (let j = i + 1; j < walls.length; j++) {
                const wall1 = walls[i];
                const wall2 = walls[j];
                // Calcular interseção entre as duas paredes
                const intersection = this.lineIntersection(
                    wall1.startPoint, wall1.endPoint,
                    wall2.startPoint, wall2.endPoint
                );
                if (intersection) {
                    intersections.push({
                        point: intersection,
                        wall1: wall1,
                        wall2: wall2
                    });
                }
            }
        }
        return intersections;
    }
    /**
     * 🆕 Calcula interseção entre duas linhas (segmentos)
     * @param {Array} p1 - Início da primeira linha
     * @param {Array} p2 - Fim da primeira linha
     * @param {Array} p3 - Início da segunda linha
     * @param {Array} p4 - Fim da segunda linha
     * @returns {Array|null} Ponto de interseção [x, y] ou null se não há interseção
     */
    lineIntersection(p1, p2, p3, p4) {
        const x1 = p1[0], y1 = p1[1];
        const x2 = p2[0], y2 = p2[1];
        const x3 = p3[0], y3 = p3[1];
        const x4 = p4[0], y4 = p4[1];
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null; // Linhas paralelas
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        // Verificar se a interseção está dentro dos segmentos (0 <= t,u <= 1)
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return [
                x1 + t * (x2 - x1),
                y1 + t * (y2 - y1)
            ];
        }
        return null;
    }
}
// Instância singleton do sistema
const smartSnapSystem = new SmartSnapSystem();
export {
    smartSnapSystem,
    SmartSnapSystem
};

