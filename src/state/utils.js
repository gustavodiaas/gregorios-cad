export function projectPointOutOfRectangle(point, rect) {
    const distTop = point.y - rect.y;
    const distBottom = (rect.y + rect.height) - point.y;
    const distLeft = point.x - rect.x;
    const distRight = (rect.x + rect.width) - point.x;

    const minDist = Math.min(distTop, distBottom, distLeft, distRight);

    if (minDist === distLeft) {
        return { x: rect.x, y: point.y };
    }
    if (minDist === distRight) {
        return { x: rect.x + rect.width, y: point.y };
    }
    if (minDist === distTop) {
        return { x: point.x, y: rect.y };
    }
    return { x: point.x, y: rect.y + rect.height };
}
