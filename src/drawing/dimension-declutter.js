/**
 * Sistema de Declutter (anti-sobreposição) de Cotas
 * 
 * Em softwares CAD/layout profissionais (AutoCAD, Revit, SketchUp), é padrão
 * ocultar automaticamente cotas cujos rótulos se sobrepõem, especialmente
 * quando itens idênticos estão lado a lado e o zoom está distante.
 * 
 * Este módulo implementa:
 * 1. Detecção de sobreposição de rótulos (bounding box em screen-space)
 * 2. Supressão inteligente por prioridade (segmentos maiores têm prioridade)
 * 3. LOD (Level of Detail) adaptativo ao zoom
 * 4. Agrupamento de cotas iguais repetidas (ex: "100 cm × 5")
 */

import { getScale, getCtx } from '../state.js';
import { DIMENSION_SYSTEM, pixelsPerCm } from '../config.js';

/**
 * Representa o retângulo de um rótulo de cota em coordenadas de mundo
 */
class LabelRect {
    constructor(x, y, width, height, angle, textValue, segmentLength, priority) {
        this.x = x;               // Centro X (mundo)
        this.y = y;               // Centro Y (mundo)
        this.width = width;       // Largura (mundo) 
        this.height = height;     // Altura (mundo)
        this.angle = angle;       // Ângulo de rotação
        this.textValue = textValue;
        this.segmentLength = segmentLength;
        this.priority = priority; // Maior = mais importante
        this.visible = true;
        this.groupId = null;      // Para agrupar iguais
    }

    /**
     * Retorna os 4 cantos do retângulo rotacionado
     */
    getCorners() {
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        const hw = this.width / 2;
        const hh = this.height / 2;

        return [
            [this.x + (-hw * cos - (-hh) * sin), this.y + (-hw * sin + (-hh) * cos)],
            [this.x + ( hw * cos - (-hh) * sin), this.y + ( hw * sin + (-hh) * cos)],
            [this.x + ( hw * cos - ( hh) * sin), this.y + ( hw * sin + ( hh) * cos)],
            [this.x + (-hw * cos - ( hh) * sin), this.y + (-hw * sin + ( hh) * cos)]
        ];
    }

    /**
     * Retorna o AABB (Axis-Aligned Bounding Box) do retângulo rotacionado
     */
    getAABB() {
        const corners = this.getCorners();
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const [cx, cy] of corners) {
            if (cx < minX) minX = cx;
            if (cy < minY) minY = cy;
            if (cx > maxX) maxX = cx;
            if (cy > maxY) maxY = cy;
        }
        return { minX, minY, maxX, maxY };
    }

    /**
     * Verifica se este rótulo se sobrepõe a outro (AABB simples com margem)
     */
    overlaps(other, margin = 0) {
        const a = this.getAABB();
        const b = other.getAABB();
        return !(a.maxX + margin < b.minX || 
                 b.maxX + margin < a.minX || 
                 a.maxY + margin < b.minY || 
                 b.maxY + margin < a.minY);
    }
}

/**
 * Sistema principal de declutter de cotas.
 * Deve ser instanciado uma vez e resetado a cada frame de desenho.
 */
class DimensionDeclutter {
    constructor() {
        /** @type {LabelRect[]} */
        this.labels = [];
        this._enabled = true;
        this._lodEnabled = true;
        
        // Configurações de LOD (Level of Detail)
        // Segmentos menores que estes thresholds (em pixels na tela) são ocultados
        this._lodThresholds = {
            // Se o segmento tem menos de X pixels na tela, ocultar a cota
            hideTextBelow: 35,        // Ocultar texto se segmento < 35px na tela
            hideLineBelow: 15,        // Ocultar a linha de cota inteira se < 15px
            showOnlyLargestBelow: 60, // Se segmento < 60px, mostrar apenas o maior da série
        };

        // Margem extra entre labels (em pixels de tela) para evitar quase-sobreposições
        this._overlapMarginPx = 4;
    }

    /**
     * Ativa/desativa o sistema de declutter
     */
    setEnabled(enabled) {
        this._enabled = Boolean(enabled);
    }

    /**
     * Ativa/desativa LOD adaptativo ao zoom
     */
    setLodEnabled(enabled) {
        this._lodEnabled = Boolean(enabled);
    }

    /**
     * Reseta o sistema para um novo frame de desenho.
     * DEVE ser chamado no início de cada drawAll().
     */
    reset() {
        this.labels = [];
    }

    /**
     * Registra um rótulo de cota e retorna se ele deve ser desenhado.
     * Esta é a função principal - chamada antes de desenhar cada texto de cota.
     * 
     * @param {number} textPosX - Centro X do texto (coordenadas de mundo)
     * @param {number} textPosY - Centro Y do texto (coordenadas de mundo)
     * @param {string} textValue - O texto da cota (ex: "100 cm")
     * @param {number} angle - Ângulo de rotação do texto
     * @param {number} segmentLength - Comprimento do segmento em coordenadas de mundo
     * @param {string} type - Tipo de cota: 'areas', 'resources', 'walls', etc.
     * @param {number} [extraPriority=0] - Prioridade extra (para cotas selecionadas, etc.)
     * @returns {{ visible: boolean, grouped: boolean, groupText: string|null }}
     */
    registerLabel(textPosX, textPosY, textValue, angle, segmentLength, type = 'areas', extraPriority = 0) {
        if (!this._enabled) {
            return { visible: true, grouped: false, groupText: null };
        }

        const scale = getScale();

        // --- LOD Check ---
        if (this._lodEnabled) {
            const segmentScreenPx = segmentLength * scale;
            
            if (segmentScreenPx < this._lodThresholds.hideLineBelow) {
                return { visible: false, grouped: false, groupText: null };
            }
            
            if (segmentScreenPx < this._lodThresholds.hideTextBelow) {
                return { visible: false, grouped: false, groupText: null };
            }
        }

        // Calcular tamanho do texto em coordenadas de mundo
        const fontConfig = DIMENSION_SYSTEM.getFontConfig(type, scale);
        const ctx = getCtx();
        if (!ctx) {
            return { visible: true, grouped: false, groupText: null };
        }

        const savedFont = ctx.font;
        ctx.font = fontConfig.string;
        const metrics = ctx.measureText(textValue);
        ctx.font = savedFont;

        const textWidth = metrics.width;
        const textHeight = fontConfig.size;

        // Margem de sobreposição convertida para coordenadas de mundo
        const overlapMargin = this._overlapMarginPx / scale;

        // Criar LabelRect com padding extra
        const padding = 2 / scale;
        const label = new LabelRect(
            textPosX,
            textPosY,
            textWidth + padding * 2,
            textHeight + padding * 2,
            angle,
            textValue,
            segmentLength,
            segmentLength + extraPriority  // Prioridade = comprimento do segmento + bônus
        );

        // --- Detecção de sobreposição ---
        let isOverlapping = false;
        for (const existing of this.labels) {
            if (!existing.visible) continue;
            if (label.overlaps(existing, overlapMargin)) {
                isOverlapping = true;
                // Quem tem MENOR prioridade perde
                if (label.priority <= existing.priority) {
                    // O label novo é menos importante → ocultar ele
                    label.visible = false;
                } else {
                    // O label novo é mais importante → ocultar o existente
                    existing.visible = false;
                    label.visible = true;
                }
            }
        }

        this.labels.push(label);
        
        return { 
            visible: label.visible, 
            grouped: false, 
            groupText: null 
        };
    }

    /**
     * Verifica se um segmento deve ter sua cota desenhada com base apenas no LOD.
     * Versão leve que não registra o label (para uso em verificações rápidas).
     * 
     * @param {number} segmentLength - Comprimento do segmento em coordenadas de mundo
     * @returns {boolean} true se deve ser desenhado
     */
    shouldDrawByLOD(segmentLength) {
        if (!this._enabled || !this._lodEnabled) return true;
        const scale = getScale();
        const segmentScreenPx = segmentLength * scale;
        return segmentScreenPx >= this._lodThresholds.hideTextBelow;
    }

    /**
     * Retorna estatísticas do frame atual para debug
     */
    getStats() {
        const total = this.labels.length;
        const visible = this.labels.filter(l => l.visible).length;
        const hidden = total - visible;
        return { total, visible, hidden };
    }
}

// Instância singleton
const dimensionDeclutter = new DimensionDeclutter();

export { dimensionDeclutter, DimensionDeclutter, LabelRect };
