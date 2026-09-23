import { Tool } from './Tool.js';

export class LegacyTool extends Tool {
    constructor() {
        super();
        this.name = 'LegacyTool';
        this.handlers = {
            mousedown: null,
            mousemove: null,
            mouseup: null,
            wheel: null,
            contextmenu: null,
            keydown: null,
            keyup: null
        };
    }

    setHandlers(handlers) {
        this.handlers = { ...this.handlers, ...handlers };
    }

    onMouseDown(e) {
        if (this.handlers.mousedown) this.handlers.mousedown(e);
    }

    onMouseMove(e) {
        if (this.handlers.mousemove) this.handlers.mousemove(e);
    }

    onMouseUp(e) {
        if (this.handlers.mouseup) this.handlers.mouseup(e);
    }

    onWheel(e) {
        if (this.handlers.wheel) this.handlers.wheel(e);
    }

    onContextMenu(e) {
        if (this.handlers.contextmenu) this.handlers.contextmenu(e);
    }
    
    // Add other events if needed
}

export const legacyToolInstance = new LegacyTool();
