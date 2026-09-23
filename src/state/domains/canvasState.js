// Canvas state (DOM references)
let canvas = null;
let ctx = null;
let staticCanvas = null;
let staticCtx = null;

export function getCanvas() {
    return canvas;
}

export function setCanvas(value) {
    canvas = value;
}

export function getCtx() {
    return ctx;
}

export function setCtx(value) {
    ctx = value;
}

export function getStaticCanvas() {
    return staticCanvas;
}

export function setStaticCanvas(value) {
    staticCanvas = value;
}

export function getStaticCtx() {
    return staticCtx;
}

export function setStaticCtx(value) {
    staticCtx = value;
}

export {
    canvas,
    ctx,
    staticCanvas,
    staticCtx
};
