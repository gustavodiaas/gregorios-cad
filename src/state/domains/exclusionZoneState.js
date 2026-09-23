import { exclusionZones } from './floorState.js';

export function getExclusionZones() {
    return exclusionZones;
}

export function setExclusionZones(zones) {
    exclusionZones.length = 0;
    if (Array.isArray(zones)) {
        exclusionZones.push(...zones);
    }
}
