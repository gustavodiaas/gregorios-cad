// Lightweight pub/sub hub for cross-feature layout updates
const listeners = [];

function dispatchBrowserEvent(changeType, data) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }
    try {
        const event = new CustomEvent('layoutChange', {
            detail: { changeType, data }
        });
        window.dispatchEvent(event);
    } catch (error) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('layoutChangeNotifier: failed to dispatch event', error);
        }
    }
}

export const layoutChangeNotifier = {
    addListener(callback) {
        if (typeof callback !== 'function') {
            return;
        }
        listeners.push(callback);
    },
    removeListener(callback) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    },
    notifyChange(changeType, data) {
        listeners.slice().forEach(callback => {
            try {
                callback(changeType, data);
            } catch (error) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('layoutChangeNotifier listener failed', error);
                }
            }
        });
        dispatchBrowserEvent(changeType, data);
    }
};

if (typeof window !== 'undefined') {
    window.layoutChangeNotifier = layoutChangeNotifier;
}
