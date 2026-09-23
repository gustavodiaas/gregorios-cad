/**
 * @fileoverview Estado de conexões e hubs
 * 
 * @description
 * Gerencia o estado de conexões entre recursos/áreas e hubs de junção.
 * Inclui estado de desenho, seleção, hover e configuração de largura.
 * 
 * @module state/domains/connectionState
 */

/** @typedef {import('../../types.js').Connection} Connection */
/** @typedef {import('../../types.js').Hub} Hub */
/** @typedef {import('../../types.js').EntityId} EntityId */

import { connections } from './floorState.js';
import { updateConnectionDistancesTable } from '../../flow-metrics.js';
import { generateId, ID_PREFIXES } from '../../utils/idGenerator.js';

// =============================================================================
// ESTADO DE DESENHO
// =============================================================================

/** @type {boolean} Se está no modo de desenho de conexão */
let isDrawingConnection = false;

/** @type {boolean} Se o mouse está pressionado durante desenho de conexão */
let isConnectionMousePressed = false;

/** @type {Connection|null} Conexão temporária sendo desenhada */
let currentConnection = null;

// =============================================================================
// ESTADO DE SELEÇÃO
// =============================================================================

/** @type {EntityId|null} ID da conexão selecionada */
let selectedConnectionId = null;

/** @type {EntityId|null} ID do hub selecionado */
let selectedHubId = null;

// =============================================================================
// ESTADO DE HOVER
// =============================================================================

/** @type {EntityId|null} ID da conexão sob o cursor */
let hoveredConnectionId = null;

/** @type {EntityId|null} ID do hub sob o cursor */
let hoveredHubId = null;

// =============================================================================
// CONFIGURAÇÕES
// =============================================================================

/** @type {EntityId|null} Grupo de escadas ativo para conexões multi-pavimento */
let activeConnectionStairGroup = null;

/** @type {number} Largura padrão de conexão em centímetros (60cm-500cm) */
let currentConnectionWidth = 60;

// =============================================================================
// GETTERS E SETTERS - CONEXÕES
// =============================================================================

/**
 * Retorna o array de conexões do pavimento atual
 * @returns {Connection[]}
 */
export function getConnections() {
    return connections;
}

/**
 * Substitui todas as conexões do pavimento atual
 * @param {Connection[]} newConnections - Novo array de conexões
 */
export function setConnections(newConnections) {
    if (!Array.isArray(newConnections)) {
        connections.length = 0;
        updateConnectionDistancesTable();
        return;
    }

    if (newConnections === connections) {
        return;
    }

    connections.length = 0;
    connections.push(...newConnections);
    
    // Atualizar métricas quando conexões mudam
    updateConnectionDistancesTable();
}

/**
 * Retorna se está no modo de desenho de conexão
 * @returns {boolean}
 */
export function getIsDrawingConnection() {
    return isDrawingConnection;
}

/**
 * Define o modo de desenho de conexão
 * @param {boolean} drawing
 */
export function setIsDrawingConnection(drawing) {
    isDrawingConnection = drawing;
}

/**
 * Retorna se o mouse está pressionado durante desenho
 * @returns {boolean}
 */
export function getIsConnectionMousePressed() {
    return isConnectionMousePressed;
}

/**
 * Define estado do mouse durante desenho de conexão
 * @param {boolean} pressed
 */
export function setIsConnectionMousePressed(pressed) {
    isConnectionMousePressed = pressed;
}

/**
 * Retorna a conexão temporária sendo desenhada
 * @returns {Connection|null}
 */
export function getCurrentConnection() {
    return currentConnection;
}

/**
 * Define a conexão temporária sendo desenhada
 * @param {Connection|null} connection
 */
export function setCurrentConnection(connection) {
    currentConnection = connection;
}

/**
 * Retorna o ID da conexão selecionada
 * @returns {EntityId|null}
 */
export function getSelectedConnectionId() {
    return selectedConnectionId;
}

/**
 * Define o ID da conexão selecionada
 * @param {EntityId|null} id
 */
export function setSelectedConnectionId(id) {
    selectedConnectionId = id;
}

/**
 * Retorna o ID do hub selecionado
 * @returns {EntityId|null}
 */
export function getSelectedHubId() {
    return selectedHubId;
}

/**
 * Define o ID do hub selecionado
 * @param {EntityId|null} id
 */
export function setSelectedHubId(id) {
    selectedHubId = id;
}

/**
 * Retorna o ID da conexão sob o cursor
 * @returns {EntityId|null}
 */
export function getHoveredConnectionId() {
    return hoveredConnectionId;
}

/**
 * Define o ID da conexão sob o cursor
 * @param {EntityId|null} id
 */
export function setHoveredConnectionId(id) {
    hoveredConnectionId = id;
}

/**
 * Retorna o ID do hub sob o cursor
 * @returns {EntityId|null}
 */
export function getHoveredHubId() {
    return hoveredHubId;
}

/**
 * Define o ID do hub sob o cursor
 * @param {EntityId|null} id
 */
export function setHoveredHubId(id) {
    hoveredHubId = id;
}

/**
 * Retorna o grupo de escadas ativo para conexões
 * @returns {EntityId|null}
 */
export function getActiveConnectionStairGroup() {
    return activeConnectionStairGroup;
}

/**
 * Define o grupo de escadas ativo para conexões
 * @param {EntityId|null} groupId
 */
export function setActiveConnectionStairGroup(groupId) {
    activeConnectionStairGroup = groupId;
}

/**
 * Gera um novo ID único para hub
 * @returns {EntityId}
 */
export function getNextHubId() {
    return generateId(ID_PREFIXES.HUB);
}

/**
 * Retorna a largura atual de conexão em centímetros
 * @returns {number}
 */
export function getCurrentConnectionWidth() {
    return currentConnectionWidth;
}

/**
 * Define a largura de conexão em centímetros (limitada entre 10-500cm)
 * @param {number} width - Largura desejada
 */
export function setCurrentConnectionWidth(width) {
    currentConnectionWidth = Math.max(10, Math.min(500, parseInt(width) || 60));
}

export {
    isDrawingConnection,
    isConnectionMousePressed,
    currentConnection,
    selectedConnectionId,
    selectedHubId,
    hoveredConnectionId,
    hoveredHubId,
    activeConnectionStairGroup,
    currentConnectionWidth
};
