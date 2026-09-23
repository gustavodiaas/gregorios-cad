/**
 * Sistema Unificado de Geração de IDs Semânticos
 * 
 * Este módulo centraliza toda a lógica de geração de IDs para as entidades do Gregório's CAD.
 * Os IDs seguem o formato: [prefixo]-[timestampCurto][random]
 * 
 * Exemplo: wall-x9s2-j8k2a
 * - prefixo: identifica o tipo de entidade
 * - timestampCurto: últimos 4 caracteres do timestamp em base-36
 * - random: 6 caracteres aleatórios em base-36
 * 
 * @module utils/idGenerator
 */

/**
 * Prefixos permitidos para cada tipo de entidade
 * @constant {Object<string, string>}
 */
export const ID_PREFIXES = Object.freeze({
    AREA: 'area',
    WALL: 'wall',
    RESOURCE: 'res',
    FLOOR: 'floor',
    CONNECTION: 'conn',
    OPENING: 'op',
    STAIR: 'stair',
    FREE_LINE: 'line',
    HUB: 'hub',
    OPERATOR: 'oper',
    GROUP: 'grp',
    EXCLUSION_ZONE: 'exz'
});

/**
 * Set de prefixos válidos para validação rápida
 * @constant {Set<string>}
 */
const VALID_PREFIXES = new Set(Object.values(ID_PREFIXES));

/**
 * Gera um caractere aleatório em base-36 (0-9, a-z)
 * @returns {string}
 */
function randomBase36Char() {
    return Math.floor(Math.random() * 36).toString(36);
}

/**
 * Gera uma string aleatória em base-36 com o tamanho especificado
 * @param {number} length - Tamanho da string
 * @returns {string}
 */
function randomBase36String(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += randomBase36Char();
    }
    return result;
}

/**
 * Gera os últimos N caracteres do timestamp atual em base-36
 * @param {number} [chars=4] - Quantidade de caracteres
 * @returns {string}
 */
function getShortTimestamp(chars = 4) {
    const timestamp = Date.now().toString(36);
    return timestamp.slice(-chars);
}

/**
 * Gera um ID semântico único para uma entidade.
 * 
 * Formato: [prefixo]-[timestampCurto]-[random]
 * Exemplo: wall-x9s2-j8k2a0
 * 
 * @param {string} prefix - O prefixo da entidade (deve estar em ID_PREFIXES)
 * @throws {Error} Se o prefixo não for válido
 * @returns {string} ID único no formato semântico
 * 
 * @example
 * // Gerar ID para uma parede
 * const wallId = generateId(ID_PREFIXES.WALL);
 * // Resultado: "wall-x9s2-j8k2a0"
 * 
 * @example
 * // Gerar ID para uma área
 * const areaId = generateId(ID_PREFIXES.AREA);
 * // Resultado: "area-k3m1-p9r4t2"
 */
export function generateId(prefix) {
    // Validar prefixo
    if (!prefix || typeof prefix !== 'string') {
        throw new Error(`[idGenerator] Prefixo inválido: ${prefix}. Use um dos prefixos de ID_PREFIXES.`);
    }
    
    if (!VALID_PREFIXES.has(prefix)) {
        throw new Error(
            `[idGenerator] Prefixo "${prefix}" não é permitido. ` +
            `Prefixos válidos: ${Array.from(VALID_PREFIXES).join(', ')}`
        );
    }
    
    const timestampPart = getShortTimestamp(4);
    const randomPart = randomBase36String(6);
    
    return `${prefix}-${timestampPart}-${randomPart}`;
}

/**
 * Valida se um ID está no formato semântico esperado.
 * 
 * @param {string|number} id - O ID a ser validado
 * @returns {boolean} true se o ID está no formato correto
 * 
 * @example
 * isValidSemanticId('wall-x9s2-j8k2a0'); // true
 * isValidSemanticId('area-k3m1-p9r4t2'); // true
 * isValidSemanticId(12345); // false (ID numérico legado)
 * isValidSemanticId('invalid'); // false
 */
export function isValidSemanticId(id) {
    if (typeof id !== 'string') {
        return false;
    }
    
    // Padrão: prefixo-timestamp(4chars)-random(6chars)
    const pattern = /^[a-z]+-[a-z0-9]{4}-[a-z0-9]{6}$/;
    return pattern.test(id);
}

/**
 * Extrai o prefixo de um ID semântico.
 * 
 * @param {string} id - O ID semântico
 * @returns {string|null} O prefixo ou null se inválido
 * 
 * @example
 * getIdPrefix('wall-x9s2-j8k2a0'); // 'wall'
 * getIdPrefix('area-k3m1-p9r4t2'); // 'area'
 */
export function getIdPrefix(id) {
    if (typeof id !== 'string') {
        return null;
    }
    
    const parts = id.split('-');
    if (parts.length >= 1) {
        const prefix = parts[0];
        if (VALID_PREFIXES.has(prefix)) {
            return prefix;
        }
    }
    
    return null;
}

/**
 * Verifica se um ID é legado (numérico ou formato antigo).
 * Útil para compatibilidade com arquivos antigos.
 * 
 * @param {string|number} id - O ID a ser verificado
 * @returns {boolean} true se o ID é legado
 * 
 * @example
 * isLegacyId(12345); // true (número)
 * isLegacyId('1234567890.123456'); // true (float antigo de paredes)
 * isLegacyId('floor-1'); // true (formato antigo de floor)
 * isLegacyId('wall-x9s2-j8k2a0'); // false (novo formato)
 */
export function isLegacyId(id) {
    // Se é um número, é legado
    if (typeof id === 'number') {
        return true;
    }
    
    // Se não é string, não podemos determinar
    if (typeof id !== 'string') {
        return false;
    }
    
    // Se é um ID semântico válido, NÃO é legado
    if (isValidSemanticId(id)) {
        return false;
    }
    
    // Formato antigo de floor: floor-N
    if (/^floor-\d+$/.test(id)) {
        return true;
    }
    
    // String que parece ser um número float (formato antigo de paredes)
    if (/^\d+\.?\d*$/.test(id)) {
        return true;
    }
    
    // Formato antigo de resources: res-XXX (sem o padrão timestamp-random)
    if (/^res-[a-z0-9]+$/.test(id) && !isValidSemanticId(id)) {
        return true;
    }
    
    return true; // Por segurança, assumir legado se não reconhecido
}

/**
 * Converte um ID para string, garantindo consistência de tipo.
 * Útil para comparações e armazenamento.
 * 
 * @param {string|number} id - O ID a ser normalizado
 * @returns {string} O ID como string
 */
export function normalizeIdToString(id) {
    if (id === null || id === undefined) {
        return null;
    }
    return String(id);
}

/**
 * Compara dois IDs de forma segura, independente do tipo.
 * Trata IDs numéricos legados e strings semânticas.
 * 
 * @param {string|number} id1 - Primeiro ID
 * @param {string|number} id2 - Segundo ID
 * @returns {boolean} true se os IDs são equivalentes
 * 
 * @example
 * compareIds('wall-x9s2-j8k2a0', 'wall-x9s2-j8k2a0'); // true
 * compareIds(123, '123'); // true (compatibilidade legado)
 * compareIds('area-1', 1); // false (diferentes)
 */
export function compareIds(id1, id2) {
    // Se ambos são nulos ou undefined
    if (id1 == null && id2 == null) {
        return true;
    }
    
    // Se apenas um é nulo
    if (id1 == null || id2 == null) {
        return false;
    }
    
    // Comparação estrita primeiro
    if (id1 === id2) {
        return true;
    }
    
    // Comparação como strings
    return String(id1) === String(id2);
}

// Exportar constante global para uso externo
export default {
    ID_PREFIXES,
    generateId,
    isValidSemanticId,
    getIdPrefix,
    isLegacyId,
    normalizeIdToString,
    compareIds
};
