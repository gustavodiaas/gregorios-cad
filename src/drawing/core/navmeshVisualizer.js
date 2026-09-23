import { getCtx, scale } from '../../state.js';
import { calculateBoundingBox } from '../../areas.js';
import { getNavMeshForWidth, SUPPORTED_CONNECTION_WIDTHS } from '../../navMeshBaker.js';

const NAVMESH_VISUAL_COLORS = {
    60: { fill: 'rgba(0, 255, 0, 0.6)', stroke: 'rgba(0, 200, 0, 0.8)', name: 'Pedestre' },
    120: { fill: 'rgba(0, 0, 255, 0.6)', stroke: 'rgba(0, 0, 200, 0.8)', name: 'Paleteira' },
    250: { fill: 'rgba(128, 0, 128, 0.6)', stroke: 'rgba(100, 0, 100, 0.8)', name: 'Empilhadeira' },
    default: { fill: 'rgba(128, 128, 128, 0.6)', stroke: 'rgba(100, 100, 100, 0.8)', name: 'Padrão' }
};

let showNavMeshNodes = false;
let navMeshVisualWidth = 60;

function toggleNavMeshVisualization() {
    showNavMeshNodes = !showNavMeshNodes;
    return showNavMeshNodes;
}

function getNavMeshVisualizationState() {
    return showNavMeshNodes;
}

function setNavMeshVisualWidth(width) {
    if (SUPPORTED_CONNECTION_WIDTHS.includes(width)) {
        navMeshVisualWidth = width;
    } else {
        console.warn(`⚠️ Largura ${width}cm não suportada. Use uma das: ${SUPPORTED_CONNECTION_WIDTHS.join(', ')}`);
    }
}

function drawNavMeshNodes(area) {
    if (!showNavMeshNodes || !area) {
        return;
    }

    const ctx = getCtx();
    const navMesh = getNavMeshForWidth(area, navMeshVisualWidth);

    if (!navMesh || !navMesh.nodes || navMesh.nodes.size === 0) {
        return;
    }

    const nodeSize = 2 / scale;
    const stairNodeSize = 3 / scale;
    const fontSize = Math.max(8, 12 / scale);

    ctx.save();

    for (const [, node] of navMesh.nodes.entries()) {
        const { x, y, walkable, isStairWalkway } = node;
        if (walkable) {
            if (isStairWalkway) {
                ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                ctx.strokeStyle = 'rgba(255, 140, 0, 1)';
            } else {
                const colors = NAVMESH_VISUAL_COLORS[navMeshVisualWidth] || NAVMESH_VISUAL_COLORS.default;
                ctx.fillStyle = colors.fill;
                ctx.strokeStyle = colors.stroke;
            }
        } else {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            ctx.strokeStyle = 'rgba(200, 0, 0, 0.8)';
        }

        ctx.lineWidth = 0.5 / scale;
        const size = isStairWalkway ? stairNodeSize : nodeSize;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    const boundingBox = calculateBoundingBox(area.vertices);
    const infoX = boundingBox.minX + 10;
    const infoY = boundingBox.minY + 20;

    const walkableCount = Array.from(navMesh.nodes.values()).filter(n => n.walkable).length;
    const stairWalkwayCount = Array.from(navMesh.nodes.values()).filter(n => n.isStairWalkway).length;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(infoX - 5, infoY - 15, 250, 55);

    ctx.fillStyle = 'white';
    ctx.font = `${fontSize}px Arial`;
    ctx.fillText(`NavMesh ${navMeshVisualWidth}cm`, infoX, infoY);
    ctx.fillText(`Nós: ${navMesh.nodes.size} | Navegáveis: ${walkableCount}`, infoX, infoY + 15);
    if (stairWalkwayCount > 0) {
        ctx.fillStyle = 'rgba(255, 165, 0, 1)';
        ctx.fillText(`🔸 Escadas: ${stairWalkwayCount}`, infoX, infoY + 30);
    }

    ctx.restore();
}

export {
    drawNavMeshNodes,
    toggleNavMeshVisualization,
    setNavMeshVisualWidth,
    getNavMeshVisualizationState,
    showNavMeshNodes,
    navMeshVisualWidth
};
