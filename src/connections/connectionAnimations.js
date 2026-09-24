/**
 * @fileoverview Sistema de animação de operadores em conexões
 * 
 * @description
 * Gerencia sprites animados (operadores virtuais) que se movem ao longo das conexões.
 * Suporta múltiplos modos de sprite (caminhando, trabalhando, com palete) e 
 * sincroniza posição com o viewport do canvas.
 * 
 * @module connections/connectionAnimations
 */

/** @typedef {import('../types.js').Connection} Connection */
/** @typedef {import('../types.js').EntityId} EntityId */

import { getScale, getOffsetXCanvas, getOffsetYCanvas, getConnections } from '../state.js';
import { pixelsPerCm } from '../config.js';

// ============================================================================
// CONSTANTES
// ============================================================================

/** @constant {string} ID da camada DOM de animações */
const LAYER_ID = 'connectionAnimationsLayer';

/** @constant {string} Classe CSS dos sprites */
const SPRITE_CLASS = 'connection-operator';

/** @constant {number} Offset de rotação do sprite em radianos */
const SPRITE_ROTATION_OFFSET_RAD = Math.PI / 2;

/**
 * Opções padrão para animações de operadores
 * @constant {Object}
 */
const DEFAULT_OPTIONS = {
    frameRate: 30,
    spriteSrc: 'assets/operator-walking.svg',
    workingSpriteSrc: 'assets/operator-working.svg',
    palletSpriteSrc: 'assets/operator-pallet.svg',
    speedCmPerSec: 60,
    baseScale: 0.85,
    scaleMultiplier: 2
};

/** @constant {number} Multiplicador de velocidade global */
const SPEED_MULTIPLIER = 2.0;

/** @constant {number} Tempo de ocultação durante teleporte (ms) */
const TELEPORT_HIDE_MS = 200;

/** @constant {number} Epsilon para detecção de teleporte */
const TELEPORT_RESUME_EPSILON = 2;

// ============================================================================
// ESTADO DO MÓDULO
// ============================================================================

/**
 * Opções de runtime (podem ser alteradas dinamicamente)
 * @type {typeof DEFAULT_OPTIONS}
 */
const runtimeOptions = {
    frameRate: DEFAULT_OPTIONS.frameRate,
    spriteSrc: DEFAULT_OPTIONS.spriteSrc,
    workingSpriteSrc: DEFAULT_OPTIONS.workingSpriteSrc,
    palletSpriteSrc: DEFAULT_OPTIONS.palletSpriteSrc,
    speedCmPerSec: DEFAULT_OPTIONS.speedCmPerSec,
    baseScale: DEFAULT_OPTIONS.baseScale,
    scaleMultiplier: DEFAULT_OPTIONS.scaleMultiplier
};

/** @type {HTMLElement|null} Elemento da camada de animações */
let layerElement = null;

/** @type {boolean} Se animações automáticas estão habilitadas */
let autoAnimationsEnabled = true;

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

/**
 * Retorna o elemento DOM da camada de animações
 * @returns {HTMLElement|null}
 */
function getLayerElement() {
    if (layerElement && layerElement.isConnected) {
        return layerElement;
    }
    layerElement = document.getElementById(LAYER_ID);
    return layerElement;
}

/**
 * Resolve o caminho do sprite baseado no modo
 * @param {'walking'|'working'|'pallet'} [mode] - Modo do sprite
 * @returns {string} Caminho do sprite
 */
function resolveSpriteSrc(mode) {
    if (typeof window !== 'undefined') {
        if (mode === 'working' && window.connectionOperatorWorkingSpriteSrc) {
            return window.connectionOperatorWorkingSpriteSrc;
        }
        if (mode === 'pallet' && window.connectionOperatorPalletSpriteSrc) {
            return window.connectionOperatorPalletSpriteSrc;
        }
        if (window.connectionOperatorSpriteSrc && (!mode || mode === 'walking')) {
            return window.connectionOperatorSpriteSrc;
        }
    }

    if (mode === 'working') {
        return runtimeOptions.workingSpriteSrc;
    }
    if (mode === 'pallet') {
        return runtimeOptions.palletSpriteSrc;
    }
    return runtimeOptions.spriteSrc;
}

function resolveSpeedCmPerSec(connection) {
    if (connection?.animation?.speedCmPerSec && connection.animation.speedCmPerSec > 0) {
        return connection.animation.speedCmPerSec;
    }

    const windowSpeed = typeof window !== 'undefined' ? Number(window.connectionOperatorSpeedCm) : NaN;
    const base = Number.isFinite(windowSpeed) && windowSpeed > 0
        ? windowSpeed
        : runtimeOptions.speedCmPerSec;

    return base * SPEED_MULTIPLIER;
}

function normalizePoint(point) {
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
        return { x: point.x, y: point.y };
    }

    if (Array.isArray(point) && point.length >= 2) {
        const [x, y] = point;
        if (typeof x === 'number' && typeof y === 'number') {
            return { x, y };
        }
    }

    return null;
}

function extractConnectionPoints(connection) {
    const source = Array.isArray(connection?.path) && connection.path.length > 1
        ? connection.path
        : Array.isArray(connection?.points) && connection.points.length > 1
            ? connection.points
            : null;

    if (!source) {
        return null;
    }

    const points = [];
    for (const entry of source) {
        const normalized = normalizePoint(entry);
        if (normalized) {
            points.push(normalized);
        }
    }

    return points.length > 1 ? points : null;
}

function buildConnectionMap() {
    const map = new Map();
    const list = getConnections();
    if (Array.isArray(list)) {
        list.forEach(item => {
            if (item?.id) {
                map.set(item.id, item);
            }
        });
    }
    return map;
}

function measurePolyline(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        total += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    }
    return total;
}

function makePathSignature(points, portalBreaks) {
    if (!Array.isArray(points) || points.length === 0) {
        return null;
    }
    const pointSignature = points
        .map(point => `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}`)
        .join('|');
    if (!Array.isArray(portalBreaks) || portalBreaks.length === 0) {
        return pointSignature;
    }
    const portalSignature = portalBreaks
        .map(value => Math.round(value))
        .join(',');
    return `${pointSignature}#${portalSignature}`;
}

function flattenConnectionPath(connection) {
    const basePoints = extractConnectionPoints(connection);
    if (!connection?.stairTransition) {
        return basePoints
            ? {
                points: basePoints,
                portalBreaks: [],
                headId: connection?.id || null,
                signature: makePathSignature(basePoints, [])
            }
            : null;
    }

    const connectionsById = buildConnectionMap();

    // Encontrar o início da cadeia (retroceder até a primeira conexão)
    let head = connection;
    const backwardVisited = new Set();
    while (head?.stairTransition?.previousConnectionId) {
        const prev = connectionsById.get(head.stairTransition.previousConnectionId);
        if (!prev || backwardVisited.has(prev.id)) {
            break;
        }
        backwardVisited.add(prev.id);
        head = prev;
    }

    const combinedPoints = [];
    const portalBreaks = [];
    let accumulated = 0;
    const forwardVisited = new Set();
    let current = head;

    while (current && !forwardVisited.has(current.id)) {
        forwardVisited.add(current.id);
        const points = extractConnectionPoints(current);

        const transition = current.stairTransition;
        const hasNext = Boolean(transition?.nextConnectionId);

        // CORREÇÃO: Se houver transição de escada, o segmento atual deve terminar EXATAMENTE na entrada da escada.
        if (points && points.length > 0 && hasNext && transition.portalEntry) {
            const entry = normalizePoint(transition.portalEntry);
            if (entry) {
                
                points[points.length - 1] = entry;
            }
        }
        
        if (points && points.length > 0) {
            if (combinedPoints.length === 0) {
                combinedPoints.push(...points);
            } else {
                // Evitar duplicar pontos se o início da nova for igual ao fim da anterior
                const previous = combinedPoints[combinedPoints.length - 1];
                const first = points[0];
                if (previous && first && Math.abs(previous.x - first.x) < 0.1 && Math.abs(previous.y - first.y) < 0.1) {
                    combinedPoints.push(...points.slice(1));
                } else {
                    combinedPoints.push(...points);
                }
            }
        }

        // Calcular comprimento do segmento atual
        let segmentLength = measurePolyline(points || []);
        accumulated += segmentLength;

        
        // --- MELHORIA DA TRANSIÇÃO DE ESCADA ---
        if (hasNext) {
            // Se temos geometria da escada (entrada e saída), adicionar esse trajeto ao caminho visual
            if (transition.portalEntry && transition.portalExit) {
                const entry = normalizePoint(transition.portalEntry);
                const exit = normalizePoint(transition.portalExit);

                if (entry && exit) {

                    // Adicionar ponto de entrada se não estiver conectado visualmente
                    const lastPoint = combinedPoints[combinedPoints.length - 1];
                    if (!lastPoint || Math.abs(lastPoint.x - entry.x) > 1 || Math.abs(lastPoint.y - entry.y) > 1) {
                        combinedPoints.push(entry);
                        accumulated += Math.hypot(entry.x - (lastPoint?.x || entry.x), entry.y - (lastPoint?.y || entry.y));
                    }

                    // Adicionar ponto de saída (o personagem caminha sobre a escada)
                    combinedPoints.push(exit);
                    const stairLength = Math.hypot(exit.x - entry.x, exit.y - entry.y);
                    accumulated += stairLength;
                }
            }
            
            // O "break" (piscar/troca de andar) acontece APÓS percorrer a escada
            if (accumulated > 0) {
                portalBreaks.push(accumulated);
            }
            
            const nextConnection = connectionsById.get(transition.nextConnectionId);
            if (!nextConnection) break;
            current = nextConnection;
        } else {
            break;
        }
    }


    if (combinedPoints.length <= 1) {
        return basePoints
            ? {
                points: basePoints,
                portalBreaks: [],
                headId: head?.id || connection?.id || null,
                signature: makePathSignature(basePoints, [])
            }
            : null;
    }

    return {
        points: combinedPoints,
        portalBreaks,
        headId: head?.id || connection?.id || null,
        signature: makePathSignature(combinedPoints, portalBreaks)
    };
}

function normalizeDistance(rawDistance, totalLength) {
    if (!Number.isFinite(rawDistance) || !Number.isFinite(totalLength) || totalLength <= 0) {
        return 0;
    }
    const value = rawDistance % totalLength;
    return value < 0 ? value + totalLength : value;
}

class MotionPath {
    constructor(points = [], portalBreaks = [], headId = null) {
        this.points = points;
        this.portalBreaks = Array.isArray(portalBreaks) ? portalBreaks.slice().sort((a, b) => a - b) : [];
        this.headId = headId;
        this.segments = [];
        this.totalLength = 0;
        this.#buildSegments();
    }

    #buildSegments() {
        if (!Array.isArray(this.points) || this.points.length < 2) {
            this.segments = [];
            this.totalLength = 0;
            return;
        }

        const segments = [];
        let accumulated = 0;

        for (let i = 1; i < this.points.length; i += 1) {
            const start = this.points[i - 1];
            const end = this.points[i];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.hypot(dx, dy);
            if (length === 0) {
                continue;
            }
            accumulated += length;
            segments.push({
                start,
                end,
                length,
                angle: Math.atan2(dy, dx),
                accumulated
            });
        }

        this.segments = segments;
        this.totalLength = accumulated;
    }

    sample(distance) {
        if (!Array.isArray(this.segments) || this.segments.length === 0 || !Number.isFinite(distance)) {
            return null;
        }

        const total = this.totalLength;
        if (!Number.isFinite(total) || total <= 0) {
            return null;
        }

        const normalized = normalizeDistance(distance, total);
        for (const segment of this.segments) {
            const startDistance = segment.accumulated - segment.length;
            if (normalized >= startDistance && normalized <= segment.accumulated) {
                const offset = normalized - startDistance;
                const ratio = segment.length === 0 ? 0 : offset / segment.length;
                const x = segment.start.x + (segment.end.x - segment.start.x) * ratio;
                const y = segment.start.y + (segment.end.y - segment.start.y) * ratio;
                return {
                    x,
                    y,
                    angle: segment.angle,
                    distance: normalized
                };
            }
        }

        const last = this.segments[this.segments.length - 1];
        return {
            x: last.end.x,
            y: last.end.y,
            angle: last.angle,
            distance: normalized
        };
    }
}

class ConnectionSprite {
    constructor() {
        this.element = document.createElement('img');
        this.element.className = SPRITE_CLASS;
        this.element.alt = 'Operador';
        this.element.draggable = false;
        this.element.decoding = 'async';
        this.element.loading = 'lazy';
        this.element.addEventListener('error', () => {
            if (this.currentSrc !== 'stopped man.gif') {
                this.currentSrc = 'stopped man.gif';
                this.element.src = this.currentSrc;
            }
        });
        this.mode = null;
        this.currentSrc = null;
        this.setMode('walking');
    }

    setMode(mode) {
        if (this.mode === mode) {
            return;
        }
        const nextSrc = resolveSpriteSrc(mode);
        if (typeof nextSrc === 'string' && nextSrc.length > 0 && this.currentSrc !== nextSrc) {
            this.element.src = nextSrc;
            this.currentSrc = nextSrc;
        }
        this.mode = mode;
    }

    place(sample, scale, offsetX, offsetY, connection) {
        if (!sample) {
            this.hide();
            return;
        }

        const baseScale = typeof window !== 'undefined' && Number(window.connectionOperatorScale) > 0
            ? Number(window.connectionOperatorScale)
            : runtimeOptions.baseScale;
        const scaleMultiplier = typeof window !== 'undefined' && Number(window.connectionOperatorScaleMultiplier) > 0
            ? Number(window.connectionOperatorScaleMultiplier)
            : runtimeOptions.scaleMultiplier;

        const worldWidth = (connection.width ?? 60) * pixelsPerCm * baseScale * scaleMultiplier;
        const ratio = this.element?.naturalHeight > 0 ? this.element.naturalWidth / this.element.naturalHeight : 2;
        const worldHeight = worldWidth / ratio;

        const screenWidth = worldWidth * scale;
        const screenHeight = worldHeight * scale;
        const screenX = sample.x * scale + offsetX;
        const screenY = sample.y * scale + offsetY;
        const rotation = sample.angle + SPRITE_ROTATION_OFFSET_RAD;

        const style = this.element.style;
        style.width = `${screenWidth}px`;
        style.height = `${screenHeight}px`;
        style.left = `${screenX - screenWidth / 2}px`;
        style.top = `${screenY - screenHeight / 2}px`;
        style.transform = `rotate(${rotation}rad)`;
        style.display = 'block';
    }

    hide() {
        this.element.style.display = 'none';
    }

    destroy() {
        if (this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

class ConnectionRunner {
    constructor(connection, layer) {
        this.id = connection.id;
        this.connection = connection;
        this.layer = layer;
        this.sprite = new ConnectionSprite();
        this.distance = 0;
        this.accumulatedDistance = 0;
        this.prevDistance = 0;
        this.lastTimestamp = null;
        this.pathSignature = null;
        this.path = null;
        this.teleport = null;
        this.speedCmPerSec = resolveSpeedCmPerSec(connection);
        this.speedPxPerMs = (this.speedCmPerSec * pixelsPerCm) / 1000;
        this.layer.appendChild(this.sprite.element);
        this.updateFromConnection(connection);
    }

    updateFromConnection(connection) {
        this.connection = connection;
        this.speedCmPerSec = resolveSpeedCmPerSec(connection);
        this.speedPxPerMs = (this.speedCmPerSec * pixelsPerCm) / 1000;

        const flattened = flattenConnectionPath(connection);
        if (!flattened) {
            this.path = null;
            this.pathSignature = null;
            this.distance = 0;
            this.accumulatedDistance = 0;
            this.prevDistance = 0;
            this.sprite.hide();
            return;
        }

        if (this.pathSignature !== flattened.signature) {
            this.path = new MotionPath(flattened.points, flattened.portalBreaks, flattened.headId);
            this.pathSignature = flattened.signature;
            this.distance = 0;
            this.accumulatedDistance = 0;
            this.prevDistance = 0;
            const total = this.path.totalLength;
            if (total > 0) {
                const seed = Math.random() * total;
                this.distance = seed;
                this.accumulatedDistance = seed;
                this.prevDistance = seed;
            }
        } else if (this.path) {
            const total = this.path.totalLength;
            if (total > 0) {
                this.distance = normalizeDistance(this.distance, total);
                this.accumulatedDistance = Math.max(0, this.accumulatedDistance);
                this.prevDistance = this.distance;
            }
        }
    }

    isRenderable() {
        return Boolean(this.path && this.path.totalLength > 0);
    }

    destroy() {
        this.sprite.destroy();
        this.path = null;
    }

    #findPortalCrossing(prevAccumulated, nextAccumulated) {
        if (!this.path || !Array.isArray(this.path.portalBreaks) || this.path.portalBreaks.length === 0) {
            return null;
        }
        const total = this.path.totalLength;
        if (!Number.isFinite(total) || total <= 0) {
            return null;
        }

        const startLoop = Math.floor(prevAccumulated / total);
        const endLoop = Math.floor(nextAccumulated / total);
        for (let loop = startLoop; loop <= endLoop; loop += 1) {
            const base = loop * total;
            for (const breakDistance of this.path.portalBreaks) {
                const raw = base + breakDistance;
                if (raw > prevAccumulated && raw <= nextAccumulated) {
                    return raw;
                }
            }
        }
        return null;
    }

    #startTeleport(rawDistance, timestamp) {
        if (!this.path || !Number.isFinite(this.path.totalLength) || this.path.totalLength <= 0) {
            return;
        }

        const total = this.path.totalLength;
        const resumeRaw = rawDistance + TELEPORT_RESUME_EPSILON;
        this.teleport = {
            active: true,
            endTime: timestamp + TELEPORT_HIDE_MS,
            resumeRawDistance: resumeRaw
        };
        this.accumulatedDistance = rawDistance;
        this.distance = normalizeDistance(rawDistance, total);
        this.prevDistance = this.distance;
        this.sprite.hide();
    }

    #finishTeleport(timestamp, scale, offsetX, offsetY) {
        if (!this.teleport || !this.path || !Number.isFinite(this.path.totalLength) || this.path.totalLength <= 0) {
            this.teleport = null;
            this.lastTimestamp = timestamp;
            return;
        }

        const total = this.path.totalLength;
        const resumeRaw = this.teleport.resumeRawDistance;
        this.accumulatedDistance = resumeRaw;
        this.distance = normalizeDistance(resumeRaw, total);
        this.prevDistance = this.distance;
        this.teleport = null;
        this.lastTimestamp = timestamp;

        const sample = this.path.sample(this.distance);
        if (sample) {
            this.sprite.setMode('walking');
            this.sprite.place(sample, scale, offsetX, offsetY, this.connection);
        } else {
            this.sprite.hide();
        }
    }

    update(timestamp, scale, offsetX, offsetY) {
        if (!this.path || !Number.isFinite(this.path.totalLength) || this.path.totalLength <= 0) {
            this.sprite.hide();
            this.lastTimestamp = timestamp;
            return;
        }

        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
        }

        if (this.teleport?.active) {
            if (timestamp >= this.teleport.endTime) {
                this.#finishTeleport(timestamp, scale, offsetX, offsetY);
            } else {
                this.sprite.hide();
                this.lastTimestamp = timestamp;
            }
            return;
        }

        const deltaMs = timestamp - this.lastTimestamp;
        if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
            this.lastTimestamp = timestamp;
            return;
        }

        const distanceStep = this.speedPxPerMs * deltaMs;
        if (!Number.isFinite(distanceStep) || distanceStep <= 0) {
            this.lastTimestamp = timestamp;
            return;
        }

        const total = this.path.totalLength;
        const prevAccumulated = this.accumulatedDistance;
        const nextAccumulated = prevAccumulated + distanceStep;

        const portalCrossing = this.#findPortalCrossing(prevAccumulated, nextAccumulated);
        if (portalCrossing !== null) {
            this.#startTeleport(portalCrossing, timestamp);
            this.lastTimestamp = timestamp;
            return;
        }

        const loopsBefore = Math.floor(prevAccumulated / total);
        const loopsAfter = Math.floor(nextAccumulated / total);
        if (loopsAfter > loopsBefore) {
            const wrapBoundary = loopsAfter * total;
            this.#startTeleport(wrapBoundary, timestamp);
            this.lastTimestamp = timestamp;
            return;
        }

        this.accumulatedDistance = nextAccumulated;
        this.distance = normalizeDistance(nextAccumulated, total);
        this.prevDistance = this.distance;
        this.lastTimestamp = timestamp;

        const sample = this.path.sample(this.distance);
        if (sample) {
            this.sprite.setMode('walking');
            this.sprite.place(sample, scale, offsetX, offsetY, this.connection);
        } else {
            this.sprite.hide();
        }
    }
}

class ConnectionAnimationController {
    constructor() {
        this.runners = new Map();
        this.frameId = null;
        this.lastFrameTimestamp = 0;
    }

    register(connection) {
        if (!connection?.id) {
            return;
        }

        if (connection.isCreating || (connection.width ?? 0) !== 60) {
            this.remove(connection.id);
            return;
        }

        const layer = getLayerElement();
        if (!layer) {
            console.warn('[ConnectionAnimations] Camada de sprites não encontrada');
            return;
        }

        let runner = this.runners.get(connection.id);
        if (!runner) {
            runner = new ConnectionRunner(connection, layer);
            if (!runner.isRenderable()) {
                runner.sprite.hide();
            }
            this.runners.set(connection.id, runner);
        } else {
            runner.updateFromConnection(connection);
        }

        this.#ensureLoop();
    }

    prune(validIds) {
        this.runners.forEach((runner, id) => {
            if (!validIds.has(id)) {
                runner.destroy();
                this.runners.delete(id);
            }
        });

        if (this.runners.size === 0) {
            this.#stopLoop();
        }
    }

    remove(id) {
        const runner = this.runners.get(id);
        if (runner) {
            runner.destroy();
            this.runners.delete(id);
        }

        if (this.runners.size === 0) {
            this.#stopLoop();
        }
    }

    stopAll() {
        this.runners.forEach(runner => runner.destroy());
        this.runners.clear();
        this.#stopLoop();
    }

    #step = (timestamp) => {
        if (this.runners.size === 0) {
            this.#stopLoop();
            return;
        }

        if (!this.lastFrameTimestamp) {
            this.lastFrameTimestamp = timestamp;
        }

        const minimumDelta = 1000 / Math.max(1, runtimeOptions.frameRate);
        if (timestamp - this.lastFrameTimestamp < minimumDelta) {
            this.frameId = requestAnimationFrame(this.#step);
            return;
        }

        this.lastFrameTimestamp = timestamp;

        const scale = getScale();
        const offsetX = getOffsetXCanvas();
        const offsetY = getOffsetYCanvas();

        this.runners.forEach(runner => {
            runner.update(timestamp, scale, offsetX, offsetY);
        });

        if (this.runners.size > 0) {
            this.frameId = requestAnimationFrame(this.#step);
        } else {
            this.#stopLoop();
        }
    };

    #ensureLoop() {
        if (this.frameId !== null || this.runners.size === 0) {
            return;
        }
        this.lastFrameTimestamp = 0;
        this.frameId = requestAnimationFrame(this.#step);
    }

    #stopLoop() {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        this.lastFrameTimestamp = 0;
    }
}

const controller = new ConnectionAnimationController();

export function registerConnectionForAnimation(connection) {
    if (!autoAnimationsEnabled) {
        return;
    }
    controller.register(connection);
}

export function pruneConnectionAnimations(validConnectionIds) {
    controller.prune(validConnectionIds);
}

export function initializeConnectionAnimator(options = {}) {
    if (typeof options.frameRate === 'number' && options.frameRate > 0) {
        runtimeOptions.frameRate = options.frameRate;
    }

    if (typeof options.spriteSrc === 'string' && options.spriteSrc.trim()) {
        runtimeOptions.spriteSrc = options.spriteSrc.trim();
    }

    if (typeof options.workingSpriteSrc === 'string' && options.workingSpriteSrc.trim()) {
        runtimeOptions.workingSpriteSrc = options.workingSpriteSrc.trim();
    }

    if (typeof options.palletSpriteSrc === 'string' && options.palletSpriteSrc.trim()) {
        runtimeOptions.palletSpriteSrc = options.palletSpriteSrc.trim();
    }

    if (typeof options.speedCmPerSec === 'number' && options.speedCmPerSec > 0) {
        runtimeOptions.speedCmPerSec = options.speedCmPerSec;
    }

    if (typeof options.baseScale === 'number' && options.baseScale > 0) {
        runtimeOptions.baseScale = options.baseScale;
    }

    if (typeof options.scaleMultiplier === 'number' && options.scaleMultiplier > 0) {
        runtimeOptions.scaleMultiplier = options.scaleMultiplier;
    }
}

export function stopAllConnectionAnimations() {
    const activeCount = controller.runners.size;
    controller.stopAll();
}

export function setConnectionAnimationsEnabled(enabled) {
    const nextState = Boolean(enabled);
    if (autoAnimationsEnabled === nextState) {
        return;
    }

    autoAnimationsEnabled = nextState;

    if (!autoAnimationsEnabled) {
        controller.stopAll();
    }
}
