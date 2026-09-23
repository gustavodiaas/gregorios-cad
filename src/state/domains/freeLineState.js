import { freeLines } from './floorState.js';

export function getFreeLines() {
    return freeLines;
}

export function setFreeLines(lines) {
    freeLines.length = 0;
    if (Array.isArray(lines)) {
        freeLines.push(...lines);
    }
}
