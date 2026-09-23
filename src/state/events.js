const actionListeners = new Map();
const wildcardListeners = new Set();

function safeInvoke(listener, action) {
    try {
        listener(action);
    } catch (error) {
            console.error("[Gregório's CAD] Erro em listener de ação de estado:", error, action);
    }
}

export function onStateAction(type, listener) {
    if (typeof listener !== 'function' || !type) {
        return () => {};
    }
    const listeners = actionListeners.get(type) || new Set();
    listeners.add(listener);
    actionListeners.set(type, listeners);
    return () => offStateAction(type, listener);
}

export function offStateAction(type, listener) {
    if (!type || typeof listener !== 'function') {
        return;
    }
    const listeners = actionListeners.get(type);
    if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
            actionListeners.delete(type);
        }
    }
}

export function onAnyStateAction(listener) {
    if (typeof listener !== 'function') {
        return () => {};
    }
    wildcardListeners.add(listener);
    return () => wildcardListeners.delete(listener);
}

export function emitStateAction(type, data = null) {
    if (!type) {
        return;
    }
    const action = { type, data, timestamp: Date.now() };
    const listeners = actionListeners.get(type);
    if (listeners) {
        listeners.forEach(listener => safeInvoke(listener, action));
    }
    wildcardListeners.forEach(listener => safeInvoke(listener, action));
}
