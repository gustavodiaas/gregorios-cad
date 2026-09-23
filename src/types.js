/**
 * @fileoverview Definições de tipos JSDoc para o Gregório's CAD
 * Este arquivo centraliza todos os typedefs das entidades principais do sistema.
 * Importe este arquivo para obter autocomplete e validação de tipos no editor.
 * 
 * @example
 * // Em qualquer arquivo JS:
 * // @ts-check
 * import './types.js';
 */

// =============================================================================
// TIPOS PRIMITIVOS E UTILITÁRIOS
// =============================================================================

/**
 * Ponto 2D como array [x, y]
 * @typedef {[number, number]} Point2D
 */

/**
 * Ponto 2D como objeto {x, y}
 * @typedef {Object} PointXY
 * @property {number} x - Coordenada X
 * @property {number} y - Coordenada Y
 */

/**
 * Cor hexadecimal (ex: '#FF0000')
 * @typedef {string} HexColor
 */

/**
 * ID semântico no formato "prefixo-xxxx-yyyyyy"
 * @typedef {string} EntityId
 */

// =============================================================================
// ÁREA DE MOVIMENTAÇÃO
// =============================================================================

/**
 * NavMesh para pathfinding A*
 * @typedef {Object} NavMesh
 * @property {Array<Point2D>} nodes - Nós da malha de navegação
 * @property {Array<Array<number>>} edges - Conexões entre nós
 * @property {number} cellSize - Tamanho da célula em pixels
 * @property {Object} grid - Grid de navegação
 */

/**
 * Área de Movimentação - Define o "chão" onde a navegação ocorre
 * @typedef {Object} MovementArea
 * @property {EntityId} id - ID semântico (ex: "area-x9s2-j8k2a1")
 * @property {number} x - Coordenada X do bounding box (legado)
 * @property {number} y - Coordenada Y do bounding box (legado)
 * @property {number} width - Largura do bounding box (legado)
 * @property {number} height - Altura do bounding box (legado)
 * @property {Array<Point2D>} vertices - Polígono real da área
 * @property {Array<Array<Point2D>>|null} [rings] - [contorno, ...buracos] para união de áreas
 * @property {boolean} [locked=false] - Se está travado para edição
 * @property {boolean} [showDimensions=false] - Exibir cotas
 * @property {EntityId} [floorId] - ID do pavimento (multi-andar)
 * @property {string} [name] - Nome da área
 * @property {HexColor} [color] - Cor da área
 * @property {NavMesh} [navMesh] - NavMesh padrão (60cm)
 * @property {Object<string, NavMesh>} [navMeshes] - NavMeshes por largura ('60', '120', '250')
 */

// =============================================================================
// PAREDE
// =============================================================================

/**
 * Parede - Bloqueia navegação e visão
 * @typedef {Object} Wall
 * @property {EntityId} id - ID semântico (ex: "wall-abc1-def234")
 * @property {Point2D} startPoint - Ponto inicial [x, y]
 * @property {Point2D} endPoint - Ponto final [x, y]
 * @property {EntityId|null} [parentAreaId] - ID da Área pai (se interna)
 * @property {number} [length] - Comprimento em pixels
 * @property {number} [angle] - Ângulo em radianos
 * @property {boolean} [showDimensions=false] - Exibir cotas
 * @property {number} [thickness=10] - Espessura da parede em cm
 */

// =============================================================================
// ABERTURA
// =============================================================================

/**
 * Tipo de abertura
 * @typedef {'door'|'window'|'passage'} OpeningType
 */

/**
 * Abertura - Portas, janelas e passagens em paredes
 * @typedef {Object} Opening
 * @property {EntityId} id - ID único
 * @property {EntityId} wallId - ID da parede pai
 * @property {EntityId} parentAreaId - ID da área pai
 * @property {OpeningType} type - Tipo de abertura
 * @property {Point2D} startPoint - Ponto inicial na parede
 * @property {Point2D} endPoint - Ponto final na parede
 * @property {number} width - Largura em cm
 * @property {number} [height] - Altura em cm
 * @property {number} position - Posição relativa na parede (0-1)
 */

// =============================================================================
// RECURSO
// =============================================================================

/**
 * Tipo de recurso
 * @typedef {'resource'|'stair'|'operator'} ResourceType
 */

/**
 * Configuração de escada
 * @typedef {Object} StairConfig
 * @property {EntityId} [connectedFloorId] - ID do pavimento conectado
 * @property {string} [direction='up'] - Direção ('up' | 'down')
 * @property {number} [steps=10] - Número de degraus
 */

/**
 * Âncora de label
 * @typedef {Object} LabelAnchor
 * @property {number} x - Offset X do centro
 * @property {number} y - Offset Y do centro
 */

/**
 * Recurso - Máquinas, estoques, mobiliário
 * @typedef {Object} Resource
 * @property {EntityId} id - ID único (formato: "res-xxx-yyy")
 * @property {Array<Point2D>} [vertices] - Polígono do recurso
 * @property {number} x - Coordenada X (legado/bounding box)
 * @property {number} y - Coordenada Y (legado/bounding box)
 * @property {number} width - Largura
 * @property {number} height - Altura
 * @property {HexColor} color - Cor hexadecimal
 * @property {EntityId} parentAreaId - ID da área que contém o recurso
 * @property {string} name - Nome do recurso
 * @property {boolean} [locked=false] - Se está travado
 * @property {boolean} [visible=true] - Se está visível
 * @property {boolean} [isRectangular=true] - Se é retangular (vs polígono livre)
 * @property {ResourceType} [type='resource'] - Tipo do recurso
 * @property {number} [rotation=0] - Rotação acumulada em graus
 * @property {StairConfig|null} [stairConfig] - Config especial para escadas
 * @property {boolean} [allowConnectionsThrough=false] - Se conexões podem atravessar
 * @property {LabelAnchor|null} [labelAnchor] - Posição do label (se customizada)
 * @property {number} [initialStock=0] - Estoque inicial do recurso
 */

// =============================================================================
// CONEXÃO
// =============================================================================

/**
 * Âncora de conexão em um recurso
 * @typedef {Object} ConnectionAnchor
 * @property {EntityId} resourceId - ID do recurso
 * @property {PointXY} anchor - Posição local no recurso (relativa ao centroide)
 */

/**
 * Tipo de conexão
 * @typedef {'pedestrian'|'vehicle'} ConnectionType
 */

/**
 * Conexão - Caminhos lógicos para agentes
 * @typedef {Object} Connection
 * @property {EntityId} id - ID único
 * @property {Array<PointXY>} path - Caminho calculado (pontos do A*)
 * @property {Array<Point2D>} [points] - Alias legado para path
 * @property {EntityId} [startHubId] - ID do hub de origem
 * @property {EntityId} [endHubId] - ID do hub de destino
 * @property {ConnectionAnchor} [start] - Âncora de origem (legado)
 * @property {ConnectionAnchor} [end] - Âncora de destino (legado)
 * @property {number} [width=60] - Largura: 60 (pedestre), 120 (paleteira), 250 (empilhadeira)
 * @property {ConnectionType} [type='pedestrian'] - Tipo de conexão
 * @property {HexColor} [color] - Cor da conexão
 * @property {string} [name] - Nome da conexão
 * @property {EntityId} [parentAreaId] - ID da área onde a conexão existe
 * @property {boolean} [isCreating=false] - Se está em processo de criação
 * @property {boolean} [isManualDraw=false] - Se foi desenhada manualmente
 * @property {boolean} [isFallback=false] - Se o pathfinding falhou e usou linha reta
 * @property {Array<PointXY>} [previewPath] - Preview durante criação
 */

// =============================================================================
// HUB
// =============================================================================

/**
 * Origem do hub
 * @typedef {'menu'|'connection'} HubSource
 */

/**
 * Hub - Ponto de conexão em recursos para definição de rotas
 * @typedef {Object} Hub
 * @property {EntityId} id - ID semântico único (ex: "hub-x9s2-j8k2a1")
 * @property {number} displayNumber - Número sequencial por recurso (1, 2, 3...)
 * @property {number} x - Coordenada X global no canvas (cache)
 * @property {number} y - Coordenada Y global no canvas (cache)
 * @property {EntityId|null} resourceId - ID do recurso associado (se ancorado)
 * @property {number|null} localX - Posição X local relativa ao centroide do recurso
 * @property {number|null} localY - Posição Y local relativa ao centroide do recurso
 * @property {number|null} [normalX] - Vetor normal X (direção para fora)
 * @property {number|null} [normalY] - Vetor normal Y (direção para fora)
 * @property {boolean} isAnchored - Se está ancorado a um recurso
 * @property {HubSource} source - Origem ('menu' ou 'connection')
 * @property {string} [name] - Nome exibido (ex: "MESA 2 - HUB 1")
 * @property {EntityId} [floorId] - ID do pavimento
 * @property {HexColor} [color='#4f46e5'] - Cor hexadecimal do hub
 * @property {number} [radius] - Raio visual do hub
 * @property {Array<EntityId>} connectionIds - IDs das conexões que usam este hub
 */

/**
 * Resultado de busca de hub
 * @typedef {Object} HubLookupResult
 * @property {Hub} hub - O hub encontrado
 * @property {Resource} resource - O recurso associado
 */

// =============================================================================
// LINHA LIVRE
// =============================================================================

/**
 * Linha Livre - Linhas decorativas/informativas
 * @typedef {Object} FreeLine
 * @property {EntityId} id - ID único
 * @property {Array<Point2D>} points - Pontos da linha
 * @property {HexColor} [color='#000000'] - Cor da linha
 * @property {number} [width=2] - Espessura em pixels
 * @property {boolean} [closed=false] - Se a linha é fechada (polígono)
 * @property {EntityId} [parentAreaId] - ID da área pai
 * @property {string} [style='solid'] - Estilo ('solid', 'dashed', 'dotted')
 */

// =============================================================================
// PAVIMENTO/ANDAR
// =============================================================================

/**
 * Pavimento - Representa um andar do prédio
 * @typedef {Object} Floor
 * @property {EntityId} id - ID único
 * @property {string} name - Nome do pavimento (ex: "Térreo", "1º Andar")
 * @property {Array<MovementArea>} movementAreas - Áreas do pavimento
 * @property {Array<Wall>} walls - Paredes do pavimento
 * @property {Array<FreeLine>} freeLines - Linhas livres do pavimento
 * @property {Array<Resource>} resources - Recursos do pavimento
 * @property {Array<Connection>} connections - Conexões do pavimento
 * @property {Array<Opening>} openings - Aberturas do pavimento
 */

// =============================================================================
// OPERADOR (PRODUCT PLANNER)
// =============================================================================

/**
 * Tipo de ação do planner
 * @typedef {'acao'|'onde'|'sprite'|'tempo'} PlannerColumnType
 */

/**
 * Coluna do planner
 * @typedef {Object} PlannerColumn
 * @property {EntityId} id - ID único
 * @property {PlannerColumnType} type - Tipo da coluna
 * @property {*} value - Valor conforme o tipo
 * @property {boolean} [locked=false] - Se está travado para edição
 */

/**
 * Layer do planner (representa um operador)
 * @typedef {Object} PlannerLayer
 * @property {EntityId} id - ID único
 * @property {EntityId} operatorId - ID do operador associado
 * @property {Array<PlannerColumn>} columns - Colunas da timeline
 */

// =============================================================================
// VIEWPORT E TRANSFORMAÇÕES
// =============================================================================

/**
 * Estado do viewport
 * @typedef {Object} ViewportState
 * @property {number} scale - Nível de zoom (1.0 = 100%)
 * @property {number} offsetX - Offset X do pan
 * @property {number} offsetY - Offset Y do pan
 * @property {boolean} isPanning - Se está em modo pan
 * @property {boolean} isDragging - Se está arrastando algo
 */

/**
 * Posição do mouse
 * @typedef {Object} MousePosition
 * @property {number} x - Coordenada X no espaço do mundo
 * @property {number} y - Coordenada Y no espaço do mundo
 * @property {number} clientX - Coordenada X na tela
 * @property {number} clientY - Coordenada Y na tela
 */

// =============================================================================
// EVENTOS DE ESTADO
// =============================================================================

/**
 * Ação de estado emitida pelo sistema de eventos
 * @typedef {Object} StateAction
 * @property {string} type - Tipo da ação (ex: 'selection/cleared')
 * @property {*} [data] - Dados da ação
 * @property {number} timestamp - Timestamp da ação
 */

/**
 * Listener de ação de estado
 * @callback StateActionListener
 * @param {StateAction} action - A ação emitida
 * @returns {void}
 */

// =============================================================================
// EXPORTS (para compatibilidade com imports)
// =============================================================================

// Este arquivo não exporta nada em runtime - apenas define tipos JSDoc
// Para usar os tipos, adicione no topo do seu arquivo:
// /** @typedef {import('./types.js').MovementArea} MovementArea */

export {};
