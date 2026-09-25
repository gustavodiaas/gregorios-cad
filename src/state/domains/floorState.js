/**
 * @fileoverview Gerenciamento de estado de pavimentos e estruturas
 * 
 * @description
 * Este módulo gerencia o estado de todos os elementos estruturais do layout:
 * áreas de movimentação, paredes, linhas livres, aberturas, recursos e conexões.
 * Suporta múltiplos pavimentos (andares) com troca dinâmica.
 * 
 * @module state/domains/floorState
 */

/** @typedef {import('../../types.js').MovementArea} MovementArea */
/** @typedef {import('../../types.js').Wall} Wall */
/** @typedef {import('../../types.js').FreeLine} FreeLine */
/** @typedef {import('../../types.js').Opening} Opening */
/** @typedef {import('../../types.js').Resource} Resource */
/** @typedef {import('../../types.js').Connection} Connection */
/** @typedef {import('../../types.js').Floor} Floor */
/** @typedef {import('../../types.js').EntityId} EntityId */

import { generateId, ID_PREFIXES } from '../../utils/idGenerator.js';

// =============================================================================
// ARRAYS DE ESTADO (referências ao pavimento atual)
// =============================================================================

/** @type {MovementArea[]} Áreas de movimentação do pavimento atual */
let movementAreas = [];

/** @type {Wall[]} Paredes do pavimento atual */
let walls = [];

/** @type {FreeLine[]} Linhas livres do pavimento atual */
let freeLines = [];

/** @type {Opening[]} Aberturas do pavimento atual */
let openings = [];

/** @type {Resource[]} Recursos do pavimento atual */
let resources = [];

/** @type {Connection[]} Conexões do pavimento atual */
let connections = [];

/** @type {Array} Zonas de exclusão standalone do pavimento atual */
let exclusionZones = [];

// =============================================================================
// ESTADO DE PAVIMENTOS
// =============================================================================

/** @type {Floor[]} Lista de todos os pavimentos */
let floors = [];

/** @type {EntityId|null} ID do pavimento atualmente ativo */
let currentFloorId = null;

/** Contador para nomes de pavimentos */
let floorCounter = 1;

/** @type {Opening[]} Referência ao array de aberturas ativo */
let activeOpeningsArray = openings;

/** @type {Function|null} Callback para atualização de aberturas */
let openingsBindingSetter = null;

/** Próximo ID de área (legado) */
export let nextAreaId = 1;

/** @type {Set<string>} IDs de pavimentos cujas linhas de projeção estão visíveis */
const overlayVisibleFloorIds = new Set();

// =============================================================================
// SISTEMA DE EVENTOS
// =============================================================================

/** @type {Set<Function>} Listeners de eventos de pavimento */
const floorListeners = new Set();

/**
 * Emite um evento de pavimento para todos os listeners registrados
 * @param {string} type - Tipo do evento ('update', 'switch', etc.)
 * @private
 */
function emitFloorEvent(type = 'update') {
    const payload = {
        type,
        currentFloorId,
        floors: floors.map(floor => ({ id: floor.id, name: floor.name }))
    };
    floorListeners.forEach(listener => {
        try {
            listener(payload);
        } catch (error) {
            console.error("[Gregório's CAD] Erro em listener de pavimento:", error);
        }
    });
}

/**
 * Registra um callback para sincronizar aberturas com módulos externos
 * @param {function(Opening[]): void} setter - Função callback que recebe o array de aberturas
 */
export function registerOpeningsBinding(setter) {
    openingsBindingSetter = setter;
    if (activeOpeningsArray) {
        openingsBindingSetter(activeOpeningsArray);
    }
}

/**
 * Atualiza o array de aberturas e notifica listeners
 * @param {Opening[]} newArray - Novo array de aberturas
 */
export function updateOpeningsBinding(newArray) {
    activeOpeningsArray = Array.isArray(newArray) ? newArray : [];
    if (typeof window !== 'undefined') {
        window.baseOpenings = activeOpeningsArray;
    }
    if (openingsBindingSetter) {
        openingsBindingSetter(activeOpeningsArray);
    }
}

/**
 * Vincula as variáveis de estado ao pavimento especificado
 * @param {Floor} floor - Pavimento para vincular
 * @private
 */
function bindStateToFloor(floor) {
    movementAreas = floor.movementAreas;
    walls = floor.walls;
    freeLines = floor.freeLines;
    openings = floor.openings;
    resources = floor.resources;
    connections = floor.connections;
    exclusionZones = floor.exclusionZones || [];
    if (!floor.exclusionZones) floor.exclusionZones = exclusionZones;
    updateOpeningsBinding(openings);
}

/**
 * Cria um novo pavimento no sistema
 * @param {Object} options - Opções de criação
 * @param {string|null} [options.name=null] - Nome do pavimento (auto-gerado se não fornecido)
 * @param {boolean} [options.makeActive=false] - Se true, torna o pavimento ativo após criação
 * @returns {Floor} O pavimento criado
 */
export function createFloor({ name = null, makeActive = false } = {}) {
    const index = floors.length;
    const floorId = generateId(ID_PREFIXES.FLOOR);
    const defaultName = name || (index === 0 ? 'Térreo' : `${index}º Andar`);
    const floor = {
        id: floorId,
        name: defaultName,
        movementAreas: [],
        walls: [],
        freeLines: [],
        resources: [],
        connections: [],
        openings: [],
        exclusionZones: []
    };
    floors.push(floor);

    if (floors.length === 1 || makeActive) {
        bindStateToFloor(floor);
        currentFloorId = floor.id;
        emitFloorEvent('active-change');
    } else {
        emitFloorEvent('create');
    }

    return floor;
}

/**
 * Inicializa o sistema de pavimentos criando o térreo se necessário
 */
export function initializeFloorSystem() {
    if (!currentFloorId) {
        createFloor({ name: 'Térreo', makeActive: true });
    }
}

/**
 * Retorna o ID do pavimento atualmente ativo
 * @returns {EntityId|null} ID do pavimento atual ou null
 */
export function getCurrentFloorId() {
    return currentFloorId;
}

/**
 * Retorna metadados resumidos de todos os pavimentos
 * @returns {{id: EntityId, name: string}[]} Lista de {id, name} de cada pavimento
 */
export function getFloorsMeta() {
    return floors.map(floor => ({ id: floor.id, name: floor.name }));
}

/**
 * Inscreve um listener para mudanças de pavimento
 * @param {function({type: string, currentFloorId: EntityId|null, floors: {id: EntityId, name: string}[]}): void} listener - Callback para eventos
 * @returns {function(): void} Função para cancelar inscrição
 */
export function subscribeToFloorChanges(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }
    floorListeners.add(listener);
    try {
        listener({ type: 'init', currentFloorId, floors: getFloorsMeta() });
    } catch (error) {
            console.error("[Gregório's CAD] Erro ao enviar estado inicial para listener de pavimento:", error);
    }
    return () => floorListeners.delete(listener);
}

/**
 * Busca um pavimento pelo ID
 * @param {EntityId} floorId - ID do pavimento
 * @returns {Floor|null} O pavimento encontrado ou null
 */
export function getFloorById(floorId) {
    if (!floorId) {
        return null;
    }
    return floors.find(floor => floor.id === floorId) || null;
}

/**
 * Retorna todos os pavimentos
 * @returns {Floor[]} Array de todos os pavimentos
 */
export function getAllFloors() {
    return floors;
}

/**
 * Define o pavimento ativo
 * @param {EntityId} floorId - ID do pavimento a ativar
 * @returns {boolean} True se a troca foi bem sucedida
 */
export function setActiveFloor(floorId) {
    if (!floorId || floorId === currentFloorId) {
        return false;
    }
    const targetFloor = getFloorById(floorId);
    if (!targetFloor) {
        return false;
    }
    bindStateToFloor(targetFloor);
    currentFloorId = targetFloor.id;
    emitFloorEvent('active-change');
    return true;
}

/**
 * Renomeia um pavimento
 * @param {EntityId} floorId - ID do pavimento
 * @param {string} newName - Novo nome
 * @returns {boolean} True se renomeado com sucesso
 */
export function renameFloor(floorId, newName) {
    if (!floorId) {
        return false;
    }
    const floor = getFloorById(floorId);
    if (!floor) {
        return false;
    }
    const trimmed = (newName || '').trim();
    if (!trimmed) {
        return false;
    }
    floor.name = trimmed;
    emitFloorEvent('rename');
    return true;
}

/**
 * Retorna o índice de um pavimento no array
 * @param {EntityId} floorId - ID do pavimento
 * @returns {number} Índice do pavimento ou -1 se não encontrado
 * @private
 */
function getFloorIndex(floorId) {
    if (!floorId) {
        return -1;
    }
    return floors.findIndex(floor => floor.id === floorId);
}

/**
 * Retorna o pavimento abaixo do atual (índice menor)
 * @returns {Floor|null} Pavimento abaixo ou null se não existir
 */
export function getFloorBelowCurrent() {
    const currentIndex = getFloorIndex(currentFloorId);
    if (currentIndex <= 0) {
        return null;
    }
    return floors[currentIndex - 1] || null;
}

/**
 * Retorna o pavimento acima do atual (índice maior)
 * @returns {Floor|null} Pavimento acima ou null se não existir
 */
export function getFloorAboveCurrent() {
    const currentIndex = getFloorIndex(currentFloorId);
    if (currentIndex === -1) {
        return null;
    }
    if (currentIndex >= floors.length - 1) {
        return null;
    }
    return floors[currentIndex + 1] || null;
}

/**
 * Cria um snapshot (deep copy) de todos os pavimentos para save/undo
 * @returns {Floor[]} Cópia profunda de todos os pavimentos
 */
export function getFloorsSnapshot() {
    return floors.map((floor, index) => ({
        id: floor.id || `floor-${index + 1}`,
        name: floor.name,
        movementAreas: JSON.parse(JSON.stringify(floor.movementAreas || [])),
        walls: JSON.parse(JSON.stringify(floor.walls || [])),
        freeLines: JSON.parse(JSON.stringify(floor.freeLines || [])),
        resources: JSON.parse(JSON.stringify(floor.resources || [])),
        connections: JSON.parse(JSON.stringify(floor.connections || [])),
        openings: JSON.parse(JSON.stringify(floor.openings || [])),
        exclusionZones: JSON.parse(JSON.stringify(floor.exclusionZones || []))
    }));
}

/**
 * Aplica um snapshot previamente salvo, restaurando todo o estado
 * @param {Floor[]} snapshot - Snapshot de pavimentos a aplicar
 * @param {EntityId|null} [activeFloor=null] - ID do pavimento a ativar após aplicação
 */
export function applyFloorsSnapshot(snapshot, activeFloor = null) {
    overlayVisibleFloorIds.clear();
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
        floors = [];
        currentFloorId = null;
        movementAreas = [];
        walls = [];
        freeLines = [];
        openings = [];
        resources = [];
        connections = [];
        exclusionZones = [];
        updateOpeningsBinding(openings);
        emitFloorEvent('reset');
        return;
    }

    floors = snapshot.map((floorData, index) => ({
        id: floorData.id || `floor-${index + 1}`,
        name: floorData.name || (index === 0 ? 'Térreo' : `${index}º Andar`),
        movementAreas: JSON.parse(JSON.stringify(floorData.movementAreas || [])),
        walls: JSON.parse(JSON.stringify(floorData.walls || [])),
        freeLines: JSON.parse(JSON.stringify(floorData.freeLines || [])),
        resources: JSON.parse(JSON.stringify(floorData.resources || [])),
        connections: JSON.parse(JSON.stringify(floorData.connections || [])),
        openings: JSON.parse(JSON.stringify(floorData.openings || [])),
        exclusionZones: JSON.parse(JSON.stringify(floorData.exclusionZones || []))
    }));

    floorCounter = floors.length + 1;

    let targetId = activeFloor;
    if (!targetId || !floors.some(floor => floor.id === targetId)) {
        targetId = floors[0]?.id || null;
    }

    if (targetId) {
        const active = getFloorById(targetId);
        bindStateToFloor(active);
        currentFloorId = targetId;
    } else {
        movementAreas = [];
        walls = [];
        freeLines = [];
        openings = [];
        resources = [];
        connections = [];
        exclusionZones = [];
        updateOpeningsBinding(openings);
        currentFloorId = null;
    }

    emitFloorEvent('snapshot');
}

/**
 * Retorna todas as áreas de movimentação do pavimento atual
 * @returns {MovementArea[]} Array de áreas de movimentação
 */
export function getAllMovementAreas() {
    return movementAreas;
}

/**
 * Retorna os IDs dos pavimentos com overlay (projeção) visível
 * @returns {string[]} Array de IDs de pavimentos com overlay ativo
 */
export function getOverlayVisibleFloorIds() {
    return Array.from(overlayVisibleFloorIds);
}

/**
 * Verifica se um pavimento tem overlay visível
 * @param {string} floorId - ID do pavimento
 * @returns {boolean}
 */
export function isOverlayVisible(floorId) {
    return overlayVisibleFloorIds.has(floorId);
}

/**
 * Alterna a visibilidade do overlay de um pavimento
 * @param {string} floorId - ID do pavimento
 * @returns {boolean} Novo estado (true = visível)
 */
export function toggleOverlayVisibility(floorId) {
    if (overlayVisibleFloorIds.has(floorId)) {
        overlayVisibleFloorIds.delete(floorId);
        emitFloorEvent('overlay-change');
        return false;
    } else {
        overlayVisibleFloorIds.add(floorId);
        emitFloorEvent('overlay-change');
        return true;
    }
}

/**
 * Define a visibilidade do overlay de um pavimento
 * @param {string} floorId - ID do pavimento
 * @param {boolean} visible - Se deve estar visível
 */
export function setOverlayVisibility(floorId, visible) {
    if (visible) {
        overlayVisibleFloorIds.add(floorId);
    } else {
        overlayVisibleFloorIds.delete(floorId);
    }
    emitFloorEvent('overlay-change');
}

initializeFloorSystem();

export {
    movementAreas,
    walls,
    freeLines,
    openings,
    resources,
    connections,
    exclusionZones
};
