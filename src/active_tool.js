// Gerencia o estado ativo das ferramentas e seus botões
import { 
    getIsEditingPolygon,
    setIsEditingPolygon,
    setEditingAreaId,
    getIsDrawingConnection,
    setIsDrawingFreeLine,
    setFreeLineStartPoint,
    setFreeLinePreviewEnd
} from './state.js';
import { clearFreeLineSnapIndicator, clearFreeLineClosureIndicator } from './free-lines.js';
import { stopCreatingOpening } from './openings.js';
import { stopResourcePreview } from './resources.js';
import { cancelConnectionCreation } from './connections.js';
import { resetStairDrawingState } from './stairs.js';
import { SelectTool } from './tools/SelectTool.js';
import { WallTool } from './tools/WallTool.js';
import { AreaTool } from './tools/AreaTool.js';
import { ResourceTool } from './tools/ResourceTool.js';
import { ConnectionTool } from './tools/ConnectionTool.js';
import { OpeningTool } from './tools/OpeningTool.js';
import { FreeLineTool } from './tools/FreeLineTool.js';
import { OperatorTool } from './tools/OperatorTool.js';
import { HubTool } from './tools/HubTool.js';
import { StairTool } from './tools/StairTool.js';
import { ExclusionZoneTool } from './tools/ExclusionZoneTool.js';
import { Tool } from './tools/Tool.js';
import { legacyToolInstance } from './tools/LegacyTool.js';

const tools = {
    'default': new SelectTool(),
    'createWallBtn': new WallTool(),
    'createAreaBtn': new AreaTool(),
    'createResourceBtn': new ResourceTool(),
    'createConnectionBtn': new ConnectionTool(),
    'createOpeningBtn': new OpeningTool(),
    'createFreeLineBtn': new FreeLineTool(),
    'createOperatorBtn': new OperatorTool(),
    'createHubBtn': new HubTool(),
    'createStairBtn': new StairTool(),
    'createExclusionZoneBtn': new ExclusionZoneTool(),
};

// Fallback for unimplemented tools
const defaultTool = legacyToolInstance;

let currentTool = null;
// Lista de botões que podem ser ativos
const toolButtons = ['createAreaBtn', 'createWallBtn', 'createFreeLineBtn', 'createBlockingBtn', 'createResourceBtn', 'createOperatorBtn', 'createHubBtn', 'createStairBtn', 'createExclusionZoneBtn', 'createConnectionBtn', 'createOpeningBtn'];
export function setActiveTool(toolId) {
    const previousTool = getCurrentToolInstance();
    if (previousTool) {
        previousTool.deactivate();
    }

    // Remove a classe active de todos os botões de ferramenta
    toolButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('active');
        }
    });
    // Se um novo tool foi especificado, marca ele como ativo
    if (toolId) {
        currentTool = toolId;
        const activeBtn = document.getElementById(toolId);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        const newTool = getCurrentToolInstance();
        if (newTool) {
            newTool.activate();
        }
    } else {
        currentTool = null;
        const newTool = getCurrentToolInstance();
        if (newTool) {
            newTool.activate();
        }
    }
}
export function getCurrentTool() {
    return currentTool;
}

export function getCurrentToolInstance() {
    return tools[currentTool] || defaultTool;
}

