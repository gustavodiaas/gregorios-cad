// Configurações e variáveis globais do Gregório's CAD
// Este arquivo contém constantes e variáveis de configuração usadas em todo o sistema.
// Import polygon-clipping library (assumindo que está carregada via CDN)
const polygonClipping = window.polygonClipping;

// Importações para a função getDynamicDimensionColor
import { movementAreas } from './state.js';
import { isPointInArea } from './areas.js';

// Controle global de exibição de cotas - simplificado
let globalShowDimensions = true;

// Configurações de grid, canvas, dimensões, paredes, ângulos, etc.
const PIXELS_PER_METER = 50;
const CM_IN_METER = 100;
const pixelsPerCm = PIXELS_PER_METER / CM_IN_METER;
const gridSpacingCm = 10;
const majorGridSpacingCm = 100;
const gridSpacingPx = gridSpacingCm * pixelsPerCm;
const majorGridSpacingPx = majorGridSpacingCm * pixelsPerCm;
const moveStepPx = pixelsPerCm;
const selectionColor = "#007bff";
const selectionLineWidth = 2;
const floatTolerance = 0.1;
// Função para obter a cor das cotas baseada no CSS
function getDimensionColor() {
    // Verificar múltiplas formas de detecção de tema
    const isDarkTheme = document.body.classList.contains('dark-theme') || 
                       document.documentElement.classList.contains('dark-theme') ||
                       document.body.classList.contains('dark') ||
                       document.documentElement.classList.contains('dark');
    
    // Obter valor computado da variável CSS
    const computedColor = getComputedStyle(document.documentElement).getPropertyValue('--dimension-color').trim();
    
    // Se a variável CSS não funcionar, usar detecção manual
    if (!computedColor || computedColor === '') {
        return isDarkTheme ? '#ffffff' : '#000000';
    }
    
    // Validar se a cor faz sentido para o tema atual
    if (isDarkTheme && computedColor === '#000000') {
        console.warn('Tema escuro detectado mas cor das cotas é preta. Forçando branco.');
        return '#ffffff';
    }
    
    if (!isDarkTheme && computedColor === '#ffffff') {
        console.warn('Tema claro detectado mas cor das cotas é branca. Forçando preto.');
        return '#000000';
    }
    
    return computedColor;
}

/**
 * Função para obter cor dinâmica das cotas baseada na posição e no tema
 * @param {number} x - Coordenada X onde a cota será desenhada
 * @param {number} y - Coordenada Y onde a cota será desenhada
 * @returns {string} Cor apropriada para a cota
 */
function getDynamicDimensionColor(x, y) {
    // Verificar se o tema escuro está ativo
    const isDarkTheme = document.body.classList.contains('dark-theme') || 
                       document.documentElement.classList.contains('dark-theme') ||
                       document.body.classList.contains('dark') ||
                       document.documentElement.classList.contains('dark');
    
    // Se não for tema escuro, sempre retornar preto
    if (!isDarkTheme) {
        return '#000000';
    }
    
    // No tema escuro, verificar se o ponto está dentro de alguma movementArea
    try {
        for (const area of movementAreas) {
            if (isPointInArea([x, y], area)) {
                // Se estiver dentro de uma área (fundo branco), usar preto
                return '#000000';
            }
        }
        
        // Se não estiver dentro de nenhuma área (fundo escuro do canvas), usar branco
        return '#ffffff';
    } catch (error) {
        // Em caso de erro, usar fallback da função original
        console.warn('Erro ao calcular cor dinâmica da cota:', error);
        return getDimensionColor();
    }
}

const dimensionLineWidth = 0.5;
const dimensionFontSize = 12;
const dimensionOffset = 20;
const dimensionExtension = 8;
const dimensionTickSize = 4;

// Sistema unificado de cotas - configurações centralizadas
const DIMENSION_SYSTEM = {
    // Tamanhos de fonte FIXOS para diferentes tipos (não variam com zoom)
    baseFontSize: 8,             // Tamanho base padrão reduzido (era 12)
    minFontSize: 6,              // Tamanho mínimo (pixels)
    maxFontSize: 10,             // Tamanho máximo (pixels)
    
    // Multiplicadores por tipo de cota
    fontMultipliers: {
        areas: 1.0,            // Áreas de movimentação (padrão)
        resources: 1.25,       // Recursos (levemente maior)
        walls: 1.0,            // Paredes (padrão)
        openings: 1.0,         // Aberturas (portas/janelas)
        virtual: 1.1,          // Cotas virtuais (10% maior)
        adjacency: 0.9,        // Cotas de adjacência (10% menor)
        divisions: 1.0,        // Divisões automáticas (padrão)
        blocking: 1.0,         // Áreas de bloqueio (padrão)
        angles: 0.85           // Ângulos (15% menor - fonte mais discreta)
    },
    
    // Função para calcular tamanho de fonte FIXO (independente do zoom)
    // Divide pelo scale para compensar a transformação do canvas
    getScaledFontSize: function(type, scale) {
        const baseSize = this.baseFontSize * (this.fontMultipliers[type] || 1.0);
        // Tamanho fixo em pixels na tela, dividido pelo scale para compensar
        // a transformação do canvas e manter o tamanho visual constante
        const fixedScreenSize = Math.max(this.minFontSize, Math.min(this.maxFontSize, baseSize));
        return fixedScreenSize / scale;
    },
    
    // Função para obter configuração de fonte padronizada
    getFontConfig: function(type, scale) {
        const fontSize = this.getScaledFontSize(type, scale);
        return {
            size: fontSize,
            family: 'Arial',
            string: `${fontSize}px Arial`
        };
    }
};
const pasteOffset = 10;
const collisionCheckTolerance = 0.01;
const alignmentTolerance = 3;
const guideLineColor = "rgba(255, 0, 0, 0.7)";
const guideLineWidth = 0.75;
const centerGuideColor = "#ff6b00"; // Cor para guias de centralização
// Polígonos e vértices
const vertexRadius = 6;
const vertexColor = "#007bff";
const vertexHoverColor = "#0056b3";
const polygonVertexColor = "#0066cc";
const polygonVertexHoverColor = "#ff6600";
const polygonLineColor = "#333";
const polygonLineWidth = 1;
// Paredes
const wallColor = "#333333";
const wallHoverColor = "#555555";
const wallSelectedColor = "#007bff"; // Mesma cor das áreas selecionadas
const wallPreviewColor = "rgba(51, 51, 51, 0.6)";
const wallLineWidth = 2;
const wallThickness = 4;
const wallVisualThicknessCm = 10;
const wallVisualLineWidth = wallVisualThicknessCm * pixelsPerCm;
const wallMinLength = 5;
const wallAreaBorderTolerance = 10; // Tolerância em pixels para criação de paredes próximas às bordas das áreas
const wallSnapRadius = 8;
const wallDimensionColor = "#000000";
// Linhas livres decorativas
const freeLineDefaultColor = "#4A5568";
const freeLineHoverColor = "#2D3748";
const freeLineSelectedColor = "#3182CE";
const freeLinePreviewColor = "rgba(74, 85, 104, 0.5)";
const freeLineLineWidth = 2;
const freeLineSnapRadius = 14;
const freeLineAngleSnapEnabled = true;
const freeLineAngleSnapIncrementDeg = 15;
const freeLineAngleSnapToleranceDeg = 7;
const freeLineMinAngleSnapLength = 8;
const freeLineSnapIndicatorColor = "#3182CE";
const freeLineSnapIndicatorRadius = 6;
const freeLineClosureSnapRadius = 16;
const freeLineClosureGuideColor = "rgba(49, 130, 206, 0.6)";
// Ângulos e snap
const rightAngleSnapEnabled = true;
const rightAngleSnapTolerance = 3; // Reduzido para 1/3 do valor anterior (10 → 3)
const cardinalAngleSnapTolerance = 8; // Aumentado de 3 para 8 para permitir melhor desenho entre direções
const wallAngleSnapEnabled = true;
const wallAngleSnapTolerance = 5; // Reduzido para 1/3 do valor anterior (15 → 5)
const vertexSnapPriority = 1.5;
const rightAngleGuideColor = "#ff6b00";
const cardinalAngleGuideColor = "#0066ff";
const wallAngleConstraintColor = "#00ff00";
const wallAngleConstraintLineWidth = 1;
const angleGuideLineWidth = 1;
const angleGuideLength = 100;
const angleColor = "#9c27b0";
const angleEditColor = "#7b1fa2";
const angleRadius = 15;
const angleFontSize = 10;
const snapRadius = 3; // Reduzido para 1/3 do valor anterior (10 → 3)
// Midpoints
const midpointRadius = 5;
const midpointColor = "#28a745";
const midpointHoverColor = "#1e7e34";
const midpointSnapThreshold = 8;

// Handles estilo PowerPoint
const pptHandleRadius = 5;           // Raio dos handles de resize
const pptHandleFillColor = "#FFFFFF"; // Branco
const pptHandleStrokeColor = "#666666"; // Cinza
const pptHandleStrokeWidth = 1;
const pptHandleHoverFillColor = "#E3F2FD"; // Azul claro no hover
const pptRotationHandleDistance = 30; // Distância do handle de rotação do topo (aumentado)
const pptRotationHandleRadius = 8;   // Raio do handle de rotação (aumentado)
const pptRotationLineColor = "#666666"; // Cor da linha até o handle de rotação
const pptRotationHandleFillColor = "#4CAF50"; // Verde para o handle de rotação
const pptRotationHandleHoverFillColor = "#81C784"; // Verde claro no hover
const pptRotationHandleStrokeColor = "#2E7D32"; // Verde escuro para borda
// Dimensões
const dimensionEditColor = "#28a745";
const dimensionEditHoverColor = "#1e7e34";
// Cores das áreas
const areaColors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#dda0dd", "#98d8c8", "#f7dc6f", "#bb8fce", "#85c1e9"];
const areaHoverColor = "rgba(255, 255, 255, 0.3)";
const areaSelectedColor = "rgba(0, 123, 255, 0.3)";
// Cores dos recursos
const resourceColors = {
    equipment: "#ff6b35",
    furniture: "#8b4513", 
    storage: "#2e7d32",
    workstation: "#1976d2",
    transport: "#7b1fa2",
    safety: "#d32f2f",
    utility: "#455a64",
    default: "#ff6b35"
};
const resourceSelectedColor = "#ef4444"; // Vermelho para selecionado (igual conexões)
const resourceHoverColor = "#f59e0b"; // Laranja para hover (igual conexões)
// Ferramentas
const TOOL_SELECT = 'select';
const TOOL_AREA = 'area';
const TOOL_WALL = 'wall';
const TOOL_POLYGON = 'polygon';
// Shape types
const SHAPE_RECTANGLE = 'rectangle';
const SHAPE_CIRCLE = 'circle';
const SHAPE_L = 'l';
const SHAPE_U = 'u';
const SHAPE_T = 't';
// Cotas dinâmicas entre áreas
const interAreaDimensionColor = "#000000"; // Preto para cotas entre áreas
const interAreaDimensionLineWidth = 2; // Aumentar espessura
const interAreaDimensionFontSize = 12; // Aumentar tamanho da fonte
const interAreaDimensionOffset = 15;
const interAreaDimensionMaxDistance = 200; // Aumentar distância máxima
const interAreaDimensionTolerance = 50; // Aumentar tolerância
// Cotas de adjacência entre áreas
const adjacencyDimensionColor = "#000000"; // Preto para cotas de adjacência
const adjacencyDimensionLineWidth = 1.5;
const adjacencyDimensionFontSize = 11;
const adjacencyDimensionOffset = 20;
const adjacencyDimensionTolerance = 5; // Distância máxima para considerar áreas "encostadas"
// Cotas virtuais de união
const virtualUnionDimensionColor = "#000000"; // Preto para cotas virtuais
const virtualUnionDimensionLineWidth = 1;
const virtualUnionDimensionFontSize = 10;
const virtualUnionDimensionOffset = 30; // Offset maior para diferenciar
// Cotas virtuais durante criação de paredes
const virtualDimensionsEnabled = true;
const virtualDimensionColor = "#000000"; // Preto para cotas virtuais durante criação
const virtualDimensionSecondaryColor = "#333333"; // Cinza escuro para cor secundária
const virtualDimensionAlpha = 0.9; // Aumentado para mais opacidade
const virtualDimensionFontSize = 12;
const virtualDimensionLineWidth = 1;
const virtualDimensionMaxDistance = 150; // cm - Aumentado para aparecer de mais longe
const virtualDimensionMaxCount = 3;
// Configurações de Aberturas (Portas, Janelas, Passagens)
const openingSnapRadius = 8; // Raio para snap em aberturas
const openingMinPosition = 0.1; // Posição mínima na parede (10%)
const openingMaxPosition = 0.9; // Posição máxima na parede (90%)

// Configurações de escala para elementos das aberturas
const openingControlMinSize = 6; // Tamanho mínimo dos cubos de controle (pixels)
const openingControlMaxSize = 16; // Tamanho máximo dos cubos de controle (pixels)
const openingFontMinSize = 10; // Tamanho mínimo da fonte das cotas (pixels)
const openingFontMaxSize = 18; // Tamanho máximo da fonte das cotas (pixels)
const openingTextOffsetMin = 10; // Offset mínimo do texto das cotas (pixels)
const openingTextOffsetMax = 25; // Offset máximo do texto das cotas (pixels)
// Cores e estilos por tipo de abertura
const doorColor = "#4CAF50"; // Verde para portas
const doorHoverColor = "#66BB6A";
const doorSelectedColor = "#2196F3";
const doorLineWidth = 3;
const doorSwingRadius = 20; // Raio do arco de abertura da porta
const windowColor = "#03A9F4"; // Azul claro para janelas
const windowHoverColor = "#29B6F6";
const windowSelectedColor = "#2196F3";
const windowLineWidth = 2;
const windowFrameOffset = 2; // Offset da moldura da janela
const passageColor = "#9C27B0"; // Roxo para passagens
const passageHoverColor = "#BA68C8";
const passageSelectedColor = "#2196F3";
const passageLineWidth = 2;
const passageMarkerSize = 3; // Tamanho dos marcadores de passagem
// Dimensões padrão das aberturas (em cm)
const defaultOpeningWidths = {
    door: 80,      // 80cm padrão para portas
    window: 120,   // 120cm padrão para janelas
    passage: 100   // 100cm padrão para passagens
};
const defaultOpeningHeights = {
    door: 210,     // 2.1m padrão para portas
    window: 120,   // 1.2m padrão para janelas
    passage: 210   // 2.1m padrão para passagens
};
// Configurações para algoritmos futuros
const openingNavigationWeight = {
    door: 1.0,     // Peso padrão para portas
    window: 0.0,   // Janelas normalmente não permitem passagem
    passage: 1.2   // Passagens têm peso maior (mais preferíveis)
};
const openingCapacity = {
    door: 100,     // Capacidade de fluxo para portas
    window: 0,     // Janelas não têm fluxo
    passage: 150   // Passagens têm maior capacidade
};
// Sistema de Snap Inteligente e Linhas Guia
const smartSnapEnabled = true;
const snapPushDistance = 8; // Distância em pixels para push automático (reduzido para menos agressivo)
// Push diferenciado por tipo de elemento - RAIOS REDUZIDOS para menos agressividade  
const edgePushThreshold = 6; // Raio reduzido para bordas (8→6)
const cornerPushThreshold = 6; // Raio reduzido para vértices (8→6)
const wallEndPushThreshold = 6; // Raio reduzido para extremidades (8→6)
const wallIntersectionPushThreshold = 6; // 🆕 Raio para interseções de paredes (mesmo que vértices)
// Sistema de push simplificado - SEM multiplicadores, apenas snap direto
const edgePushStrength = 1.0; // Snap direto, sem push calculado
const cornerPushStrength = 1.0; // Snap direto, sem push calculado  
const wallEndPushStrength = 1.0; // Snap direto, sem push calculado
const wallIntersectionPushStrength = 1.0; // 🆕 Snap direto para interseções
const guideLineExtension = 200; // Extensão das linhas guia
const smartGuideColor = "#ff6b00"; // Laranja para guias inteligentes
const smartGuideLineWidth = 1.5;
const snapIndicatorRadius = 6; // Reduzido de 8 para 6 - indicadores mais sutis
const snapIndicatorColor = "#00ff00";
const snapIndicatorLineWidth = 2;
// Configurações de Linhas Guia
const rightAngleGuideEnabled = true;
const parallelGuideEnabled = true;
const perpendicularGuideEnabled = true;
const extensionGuideEnabled = true;
const alignmentGuideEnabled = true;
const guideSnapDistance = 8; // Aumentado para dar mais liberdade ao usuário (4 → 8)
const guideLineAlpha = 0.7;
const angleSnapTolerance = 15; // Tolerância em graus para snap em ângulos (novo parâmetro)
// Cores diferenciadas para tipos de guia
const rightAngleGuideColor2 = "#ff3300"; // Vermelho para ângulos retos
const parallelGuideColor = "#3366ff"; // Azul para paralelas
const perpendicularGuideColor = "#ff6600"; // Laranja para perpendiculares
const extensionGuideColor = "#9933ff"; // Roxo para extensões
const alignmentGuideColor = "#00cc66"; // Verde para alinhamentos
// Configurações de Push Automático
const autoPushEnabled = true;
const pushAnimationDuration = 200; // ms para animação suave
const pushEasingFactor = 0.3; // Fator de suavização
// Exportar todas as constantes
export {
    polygonClipping,
    PIXELS_PER_METER,
    CM_IN_METER,
    pixelsPerCm,
    gridSpacingCm,
    majorGridSpacingCm,
    gridSpacingPx,
    majorGridSpacingPx,
    moveStepPx,
    selectionColor,
    selectionLineWidth,
    floatTolerance,
    dimensionLineWidth,
    dimensionFontSize,
    dimensionOffset,
    dimensionExtension,
    dimensionTickSize,
    DIMENSION_SYSTEM,
    pasteOffset,
    collisionCheckTolerance,
    alignmentTolerance,
    guideLineColor,
    guideLineWidth,
    centerGuideColor,
    vertexRadius,
    vertexColor,
    vertexHoverColor,
    polygonVertexColor,
    polygonVertexHoverColor,
    polygonLineColor,
    polygonLineWidth,
    wallColor,
    wallHoverColor,
    wallSelectedColor,
    wallPreviewColor,
    wallLineWidth,
    wallThickness,
    wallVisualThicknessCm,
    wallVisualLineWidth,
    wallMinLength,
    wallAreaBorderTolerance,
    wallSnapRadius,
    wallDimensionColor,
    freeLineDefaultColor,
    freeLineHoverColor,
    freeLineSelectedColor,
    freeLinePreviewColor,
    freeLineLineWidth,
    freeLineSnapRadius,
    freeLineAngleSnapEnabled,
    freeLineAngleSnapIncrementDeg,
    freeLineAngleSnapToleranceDeg,
    freeLineMinAngleSnapLength,
    freeLineSnapIndicatorColor,
    freeLineSnapIndicatorRadius,
    freeLineClosureSnapRadius,
    freeLineClosureGuideColor,
    rightAngleSnapEnabled,
    rightAngleSnapTolerance,
    cardinalAngleSnapTolerance,
    wallAngleSnapEnabled,
    wallAngleSnapTolerance,
    vertexSnapPriority,
    rightAngleGuideColor,
    cardinalAngleGuideColor,
    wallAngleConstraintColor,
    wallAngleConstraintLineWidth,
    angleGuideLineWidth,
    angleGuideLength,
    angleColor,
    angleEditColor,
    angleRadius,
    angleFontSize,
    snapRadius,
    midpointRadius,
    midpointColor,
    midpointHoverColor,
    midpointSnapThreshold,
    pptHandleRadius,
    pptHandleFillColor,
    pptHandleStrokeColor,
    pptHandleStrokeWidth,
    pptHandleHoverFillColor,
    pptRotationHandleDistance,
    pptRotationHandleRadius,
    pptRotationLineColor,
    pptRotationHandleFillColor,
    pptRotationHandleHoverFillColor,
    pptRotationHandleStrokeColor,
    dimensionEditColor,
    dimensionEditHoverColor,    areaColors,
    areaHoverColor,
    areaSelectedColor,
    resourceColors,
    resourceSelectedColor,
    resourceHoverColor,
    TOOL_SELECT,
    TOOL_AREA,
    TOOL_WALL,
    TOOL_POLYGON,
    SHAPE_RECTANGLE,
    SHAPE_CIRCLE,
    SHAPE_L,
    SHAPE_U,
    SHAPE_T,
    interAreaDimensionColor,
    interAreaDimensionLineWidth,
    interAreaDimensionFontSize,
    interAreaDimensionOffset,
    interAreaDimensionMaxDistance,
    interAreaDimensionTolerance,
    adjacencyDimensionColor,
    adjacencyDimensionLineWidth,
    adjacencyDimensionFontSize,
    adjacencyDimensionOffset,
    adjacencyDimensionTolerance,
    virtualUnionDimensionColor,
    virtualUnionDimensionLineWidth,
    virtualUnionDimensionFontSize,
    virtualUnionDimensionOffset,
    virtualDimensionsEnabled,
    virtualDimensionColor,
    virtualDimensionSecondaryColor,
    virtualDimensionAlpha,
    virtualDimensionFontSize,
    virtualDimensionLineWidth,
    virtualDimensionMaxDistance,
    virtualDimensionMaxCount,
    smartSnapEnabled,    snapPushDistance,    edgePushThreshold,
    cornerPushThreshold,
    wallEndPushThreshold,
    wallIntersectionPushThreshold,
    edgePushStrength,
    cornerPushStrength,
    wallEndPushStrength,
    wallIntersectionPushStrength,
    guideLineExtension,
    smartGuideColor,
    smartGuideLineWidth,
    snapIndicatorRadius,
    snapIndicatorColor,
    snapIndicatorLineWidth,
    rightAngleGuideEnabled,    parallelGuideEnabled,
    perpendicularGuideEnabled,
    extensionGuideEnabled,
    alignmentGuideEnabled,
    guideSnapDistance,
    guideLineAlpha,
    angleSnapTolerance,
    rightAngleGuideColor2,
    parallelGuideColor,    perpendicularGuideColor,
    extensionGuideColor,
    alignmentGuideColor,    autoPushEnabled,
    pushAnimationDuration,
    pushEasingFactor,
    // Configurações de Aberturas
    openingSnapRadius,
    openingMinPosition,
    openingMaxPosition,
    openingControlMinSize,
    openingControlMaxSize,
    openingFontMinSize,
    openingFontMaxSize,
    openingTextOffsetMin,
    openingTextOffsetMax,
    doorColor,
    doorHoverColor,
    doorSelectedColor,
    doorLineWidth,
    doorSwingRadius,
    windowColor,
    windowHoverColor,
    windowSelectedColor,
    windowLineWidth,
    windowFrameOffset,
    passageColor,
    passageHoverColor,
    passageSelectedColor,
    passageLineWidth,
    passageMarkerSize,
    defaultOpeningWidths,
    defaultOpeningHeights,
    openingNavigationWeight,
    openingCapacity,
    // Funções para controle de exibição de cotas
    toggleGlobalDimensions,
    getGlobalShowDimensions,
    setGlobalShowDimensions,
    globalShowDimensions,
    // Função para obter cor das cotas do CSS
    getDimensionColor,
    // Função para obter cor dinâmica das cotas baseada na posição
    getDynamicDimensionColor,
    // Função utilitária para escala com limites
    getScaledSizeWithLimits
};

// Funções para controle global de exibição de cotas
function toggleGlobalDimensions() {
    globalShowDimensions = !globalShowDimensions;
    return globalShowDimensions;
}

function getGlobalShowDimensions() {
    return globalShowDimensions;
}

function setGlobalShowDimensions(value) {
    globalShowDimensions = Boolean(value);
    return globalShowDimensions;
}

/**
 * Calcula tamanho escalonado com limites mínimo e máximo
 * @param {number} baseSize - Tamanho base
 * @param {number} scale - Escala atual
 * @param {number} minSize - Tamanho mínimo em pixels
 * @param {number} maxSize - Tamanho máximo em pixels
 * @returns {number} Tamanho escalonado limitado
 */
function getScaledSizeWithLimits(baseSize, scale, minSize, maxSize) {
    const scaledSize = baseSize / scale;
    return Math.max(minSize, Math.min(maxSize, scaledSize));
}

