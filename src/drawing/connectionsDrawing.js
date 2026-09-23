// Sistema de conexões - Lógica de desenho centralizada
import { 
    getCtx, 
    getConnections, 
    getSelectedConnectionId, 
    getHoveredConnectionId, 
    getCurrentConnection,
    getScale,
    resources
} from '../state.js';
import { pixelsPerCm } from '../config.js';
import { getHubVisualRadius, anchorToWorldCoordinates, getHubDisplayLabel } from '../connections/connectionUtils.js';
import { registerConnectionForAnimation, pruneConnectionAnimations } from '../connections/connectionAnimations.js';
import { findHubById } from '../hubs.js';
import { migrateResourceToPolygonal } from '../resources.js';

// ============================================================================
// FALLBACK PULSE ANIMATION
// ============================================================================
/** @type {number|null} ID do interval de animação de fallback */
let _fallbackPulseIntervalId = null;

/**
 * Calcula o fator de pulso (0-1) para conexões em fallback.
 * Oscila suavemente entre 0 e 1 com período de ~1.5s.
 * @returns {number}
 */
function getFallbackPulseFactor() {
    return (Math.sin(performance.now() / 750 * Math.PI) + 1) / 2; // 0..1
}

/**
 * Inicia o loop de redraw para animação de pulso de fallback (se necessário).
 * @param {boolean} hasFallback - Se existem conexões em fallback
 */
function manageFallbackPulseLoop(hasFallback) {
    if (hasFallback && !_fallbackPulseIntervalId) {
        _fallbackPulseIntervalId = setInterval(() => {
            if (typeof window !== 'undefined' && window.drawAll) {
                window.drawAll(false); // Apenas camada dinâmica
            }
        }, 50); // ~20fps para o pulso
    } else if (!hasFallback && _fallbackPulseIntervalId) {
        clearInterval(_fallbackPulseIntervalId);
        _fallbackPulseIntervalId = null;
    }
}

/**
 * Aplica clip invertido para excluir o interior de polígonos de recursos.
 * Usa a mesma técnica de drawExclusionArc: rect grande + polígono anti-horário + evenodd.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<[number,number]>>} resourcePolygons - Polígonos dos recursos a excluir
 * @param {Array<{x:number,y:number}>} path - Path da conexão (para calcular bounding box)
 */
function applyResourceClip(ctx, resourcePolygons, path) {
    if (!resourcePolygons || resourcePolygons.length === 0) return;

    // Bounding box do path com margem generosa
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    const margin = 500;
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;

    ctx.beginPath();
    // Retângulo grande (sentido horário)
    ctx.rect(minX, minY, maxX - minX, maxY - minY);

    // Cada polígono de recurso em sentido anti-horário (para excluir)
    for (const verts of resourcePolygons) {
        ctx.moveTo(verts[verts.length - 1][0], verts[verts.length - 1][1]);
        for (let i = verts.length - 1; i >= 0; i--) {
            ctx.lineTo(verts[i][0], verts[i][1]);
        }
        ctx.closePath();
    }
    ctx.clip('evenodd');
}

/**
 * Obtém os polígonos de recursos ligados a uma conexão (via hubs).
 */
function getConnectionResourcePolygons(connection) {
    const polys = [];
    const seenIds = new Set();

    for (const hubId of [connection.startHubId, connection.endHubId]) {
        if (!hubId) continue;
        const hub = findHubById(hubId);
        if (!hub || !hub.resourceId || seenIds.has(hub.resourceId)) continue;
        seenIds.add(hub.resourceId);
        const res = resources.find(r => r.id === hub.resourceId);
        if (!res) continue;
        const migrated = migrateResourceToPolygonal(res);
        if (migrated && migrated.vertices && migrated.vertices.length >= 3) {
            polys.push(migrated.vertices);
        }
    }
    return polys;
}

/** @type {string} Cache do último resumo de fallback para evitar spam */
let _lastFallbackSummary = '';

/**
 * Desenha todas as conexões no canvas
 */
export function drawConnections() {
    const ctx = getCtx();
    const connections = getConnections();
    const selectedConnectionId = getSelectedConnectionId();
    const hoveredConnectionId = getHoveredConnectionId();
    const currentConnection = getCurrentConnection();
    
    if (!ctx || !connections) return;
    
    const animatedConnections = new Set();
    let hasFallbackConnections = false;
    const fallbackPulse = getFallbackPulseFactor();
    // Cor de aviso para fallback: vermelho (#ef4444)
    const FALLBACK_WARN_COLOR = '#ef4444';

    // [Fallback Debug] Log apenas quando o estado muda
    const fbSummary = connections.map(c => `${(c.id || '?').toString().slice(-8)}:${c.isFallback === true ? 'FB' : c.isFallback === false ? 'OK' : '??'}`).join(' ');
    if (fbSummary !== _lastFallbackSummary) {
        _lastFallbackSummary = fbSummary;
        const fbCount = connections.filter(c => c.isFallback === true).length;
        console.log(`%c[Fallback] ${connections.length} conexões, ${fbCount} em fallback → ${fbSummary}`, 'color: #ff6600; font-weight: bold');
    }

    connections.forEach(connection => {
        ctx.save();
        
        const isFallback = connection.isFallback && !connection.isCreating;
        if (isFallback) hasFallbackConnections = true;

        let strokeColor = connection.color || '#6366f1';
        let strokeWidth = 2;
        let strokeStyle = 'solid';
        const isSelected = connection.id === selectedConnectionId;
        const isHovered = connection.id === hoveredConnectionId;
        // Cores especiais para conexões selecionadas/hover
        if (isSelected) {
            strokeColor = '#ef4444';
        } else if (isHovered) {
            strokeColor = '#f59e0b';
        }
        
        // Estilo especial para conexão em criação
        if (connection.isCreating) {
            strokeStyle = 'dashed';
            strokeColor = '#94a3b8'; // Cinza mais claro para prévia
        }
        
        // Pulsação visual para conexões em fallback (linha reta por falha de A*)
        if (isFallback && !isSelected && !isHovered) {
            strokeColor = FALLBACK_WARN_COLOR;
        }
        
        // Obter largura da conexão (padrão 60cm se não especificada)
        const connectionWidth = connection.width || 60;
    // Alpha pulsante para fallback: oscila entre 0.08 e o valor normal
    const fallbackPavementAlpha = isFallback ? 0.08 + fallbackPulse * 0.30 : 0;
    const fallbackLineAlpha = isFallback ? 0.25 + fallbackPulse * 0.70 : 0;
    const pavementAlpha = isFallback ? fallbackPavementAlpha
        : connection.isCreating ? 0.2 : (isSelected || isHovered) ? 0.28 : 0.14;
    const lineAlpha = isFallback ? fallbackLineAlpha
        : connection.isCreating ? 0.75 : (isSelected || isHovered) ? 0.9 : 0.65;
    const centralLineWidth = 3 / getScale();
        
        // Obter polígonos de recursos para clip (excluir interior dos recursos)
        const resPolygons = getConnectionResourcePolygons(connection);

        // Desenhar caminho da conexão
        if (connection.path && connection.path.length > 1) {
            // Clip para não desenhar dentro dos recursos
            ctx.save();
            applyResourceClip(ctx, resPolygons, connection.path);

            // PRIMEIRO: Desenhar o "Pavimento" (fundo semi-transparente)
            const pavementWidth = connectionWidth * pixelsPerCm; // SEM dividir por scale
            
            ctx.save();
            ctx.lineWidth = pavementWidth;
            ctx.strokeStyle = strokeColor;
            ctx.globalAlpha = pavementAlpha;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (strokeStyle === 'dashed') {
                ctx.setLineDash([8, 4]);
            } else {
                ctx.setLineDash([]);
            }
            
            ctx.beginPath();
            ctx.moveTo(connection.path[0].x, connection.path[0].y);
            for (let i = 1; i < connection.path.length; i++) {
                ctx.lineTo(connection.path[i].x, connection.path[i].y);
            }
            ctx.stroke();
            ctx.restore();
            
            // SEGUNDO: Desenhar a "Linha Central" (linha fina sólida)
            ctx.save();
            ctx.lineWidth = centralLineWidth;
            ctx.strokeStyle = strokeColor;
            ctx.globalAlpha = lineAlpha;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (strokeStyle === 'dashed') {
                ctx.setLineDash([8, 4]);
            } else {
                ctx.setLineDash([]);
            }
            
            ctx.beginPath();
            ctx.moveTo(connection.path[0].x, connection.path[0].y);
            for (let i = 1; i < connection.path.length; i++) {
                ctx.lineTo(connection.path[i].x, connection.path[i].y);
            }
            ctx.stroke();
            ctx.restore();

            ctx.restore(); // Restaura clip
        }
    // Tratamento para conexões antigas com points
        else if (connection.points && connection.points.length > 1) {
            // Clip para não desenhar dentro dos recursos
            ctx.save();
            applyResourceClip(ctx, resPolygons, connection.points);

            // PRIMEIRO: Desenhar o "Pavimento" (fundo semi-transparente)
            const pavementWidth = connectionWidth * pixelsPerCm; // SEM dividir por scale
            
            ctx.save();
            ctx.lineWidth = pavementWidth;
            ctx.strokeStyle = strokeColor;
            ctx.globalAlpha = pavementAlpha;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (strokeStyle === 'dashed') {
                ctx.setLineDash([8, 4]);
            } else {
                ctx.setLineDash([]);
            }
            
            ctx.beginPath();
            ctx.moveTo(connection.points[0].x, connection.points[0].y);
            for (let i = 1; i < connection.points.length; i++) {
                ctx.lineTo(connection.points[i].x, connection.points[i].y);
            }
            ctx.stroke();
            ctx.restore();
            
            // SEGUNDO: Desenhar a "Linha Central" (linha fina sólida)
            ctx.save();
            ctx.lineWidth = centralLineWidth;
            ctx.strokeStyle = strokeColor;
            ctx.globalAlpha = lineAlpha;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            if (strokeStyle === 'dashed') {
                ctx.setLineDash([8, 4]);
            } else {
                ctx.setLineDash([]);
            }
            
            ctx.beginPath();
            ctx.moveTo(connection.points[0].x, connection.points[0].y);
            for (let i = 1; i < connection.points.length; i++) {
                ctx.lineTo(connection.points[i].x, connection.points[i].y);
            }
            ctx.stroke();
            ctx.restore();

            ctx.restore(); // Restaura clip
        }

        const hasStairParent = Boolean(connection.stairTransition?.previousConnectionId);

        // Animações apenas para conexões auto-geradas (de roteiros)
        // Conexões manuais não têm animação para evitar conflitos
        if (
            !connection.isCreating &&
            !hasStairParent &&
            (connection.path?.length > 1 || connection.points?.length > 1) &&
            (connection.width ?? 0) === 60 &&
            connection.isAutoGenerated &&
            !connection.disableAutoAnimation // Aparência estática após execução do planner
        ) {
            registerConnectionForAnimation(connection);
            if (connection.id) {
                animatedConnections.add(connection.id);
            }
        }
        
        // Desenhar prévia adicional para conexões manuais em criação
        if (connection.isCreating && connection.previewPath && connection.previewPath.length > (connection.path?.length || 0)) {
            const connectionWidth = connection.width || 60;
            
            ctx.save();
            // Pavimento da prévia
            const pavementWidth = connectionWidth * pixelsPerCm; // SEM dividir por scale
            ctx.lineWidth = pavementWidth;
            ctx.strokeStyle = '#cbd5e155'; // Cor ainda mais clara para prévia com transparência
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.setLineDash([4, 2]); // Linha tracejada mais sutil
            
            // Desenhar a parte da prévia que vai além do caminho atual
            const startIndex = connection.path ? connection.path.length - 1 : 0;
            if (startIndex < connection.previewPath.length - 1) {
                ctx.beginPath();
                ctx.moveTo(connection.previewPath[startIndex].x, connection.previewPath[startIndex].y);
                for (let i = startIndex + 1; i < connection.previewPath.length; i++) {
                    ctx.lineTo(connection.previewPath[i].x, connection.previewPath[i].y);
                }
                ctx.stroke();
            }
            
            // Linha central da prévia
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#cbd5e1'; // Cor ainda mais clara para prévia
            if (startIndex < connection.previewPath.length - 1) {
                ctx.beginPath();
                ctx.moveTo(connection.previewPath[startIndex].x, connection.previewPath[startIndex].y);
                for (let i = startIndex + 1; i < connection.previewPath.length; i++) {
                    ctx.lineTo(connection.previewPath[i].x, connection.previewPath[i].y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }
        
        ctx.restore();
    });

    pruneConnectionAnimations(animatedConnections);

    // Gerenciar loop de redraw para pulsação de fallback
    manageFallbackPulseLoop(hasFallbackConnections);
}

/**
 * DEPRECATED: Desenho de hubs agora é feito por drawHubs() em drawing.js
 * Esta função existe apenas para compatibilidade - não faz nada.
 */
export function drawConnectionHubs() {
    // UNIFICADO: Todo o desenho de hubs é feito por drawHubs() em drawing.js
    // usando o registro global hubs[]
    return;
}
