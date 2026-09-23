import { getCtx, scale, movementAreas, walls, connections, openings, getFloorBelowCurrent, getOverlayVisibleFloorIds, getFloorById, getCurrentFloorId } from '../../state.js';

function drawOverlayAreas(areas) {
    if (!Array.isArray(areas) || areas.length === 0) {
        return;
    }

    const ctx = getCtx();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 107, 0, 0.35)';
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([6 / scale, 6 / scale]);

    areas.forEach(area => {
        if (!area) {
            return;
        }

        if (Array.isArray(area.vertices) && area.vertices.length > 1) {
            ctx.beginPath();
            ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
            for (let i = 1; i < area.vertices.length; i++) {
                ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
            }
            ctx.closePath();
            ctx.stroke();
            return;
        }

        if (Array.isArray(area.rings) && area.rings.length > 0) {
            const outer = area.rings[0];
            if (Array.isArray(outer) && outer.length > 1) {
                ctx.beginPath();
                ctx.moveTo(outer[0][0], outer[0][1]);
                for (let i = 1; i < outer.length; i++) {
                    ctx.lineTo(outer[i][0], outer[i][1]);
                }
                ctx.closePath();
                ctx.stroke();
            }
            return;
        }

        if (typeof area.x === 'number' && typeof area.y === 'number') {
            ctx.strokeRect(area.x, area.y, area.width || 0, area.height || 0);
        }
    });

    ctx.restore();
}

function drawOverlayWalls(wallsToRender) {
    if (!Array.isArray(wallsToRender) || wallsToRender.length === 0) {
        return;
    }

    const ctx = getCtx();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 107, 0, 0.35)';
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([6 / scale, 6 / scale]);

    wallsToRender.forEach(wall => {
        if (!wall || !wall.startPoint || !wall.endPoint) {
            return;
        }
        ctx.beginPath();
        ctx.moveTo(wall.startPoint[0], wall.startPoint[1]);
        ctx.lineTo(wall.endPoint[0], wall.endPoint[1]);
        ctx.stroke();
    });

    ctx.restore();
}

function drawOverlayConnections(connectionsToRender) {
    if (!Array.isArray(connectionsToRender) || connectionsToRender.length === 0) {
        return;
    }

    const ctx = getCtx();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 107, 0, 0.25)';
    ctx.lineWidth = 2 / scale;
    ctx.setLineDash([4 / scale, 6 / scale]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    connectionsToRender.forEach(connection => {
        if (!connection) {
            return;
        }

        const path = connection.path || connection.points;
        if (!Array.isArray(path) || path.length < 2) {
            return;
        }

        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
    });

    ctx.restore();
}

function drawFloorOverlay() {
    const currentId = getCurrentFloorId();
    const visibleIds = getOverlayVisibleFloorIds();

    // Desenhar overlays de todos os pavimentos flagados
    for (const floorId of visibleIds) {
        if (floorId === currentId) continue; // nunca projetar sobre si mesmo
        const floor = getFloorById(floorId);
        if (!floor) continue;
        drawOverlayAreas(floor.movementAreas);
        drawOverlayWalls(floor.walls);
        drawOverlayConnections(floor.connections);
    }
}

function drawNavigationGraph() {
    const ctx = getCtx();
    movementAreas.forEach(area => {
        let cx;
        let cy;
        if (area.vertices && area.vertices.length > 0) {
            let sumX = 0;
            let sumY = 0;
            area.vertices.forEach(v => {
                sumX += v.x;
                sumY += v.y;
            });
            cx = sumX / area.vertices.length;
            cy = sumY / area.vertices.length;
        } else {
            cx = area.x + area.width / 2;
            cy = area.y + area.height / 2;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, 10 / scale, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 120, 255, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#0050a0';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
    });

    if (typeof openings !== 'undefined' && Array.isArray(openings)) {
        openings.forEach(opening => {
            if (opening.areaIdA && opening.areaIdB) {
                const areaA = movementAreas.find(a => a.id === opening.areaIdA);
                const areaB = movementAreas.find(a => a.id === opening.areaIdB);
                if (areaA && areaB) {
                    let ax;
                    let ay;
                    let bx;
                    let by;
                    if (areaA.vertices && areaA.vertices.length > 0) {
                        let sumX = 0;
                        let sumY = 0;
                        areaA.vertices.forEach(v => {
                            sumX += v.x;
                            sumY += v.y;
                        });
                        ax = sumX / areaA.vertices.length;
                        ay = sumY / areaA.vertices.length;
                    } else {
                        ax = areaA.x + areaA.width / 2;
                        ay = areaA.y + areaA.height / 2;
                    }
                    if (areaB.vertices && areaB.vertices.length > 0) {
                        let sumX = 0;
                        let sumY = 0;
                        areaB.vertices.forEach(v => {
                            sumX += v.x;
                            sumY += v.y;
                        });
                        bx = sumX / areaB.vertices.length;
                        by = sumY / areaB.vertices.length;
                    } else {
                        bx = areaB.x + areaB.width / 2;
                        by = areaB.y + areaB.height / 2;
                    }
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                    ctx.strokeStyle = 'rgba(0, 200, 80, 0.7)';
                    ctx.lineWidth = 4 / scale;
                    ctx.stroke();
                }
            }
        });
    }
}

export {
    drawOverlayAreas,
    drawOverlayWalls,
    drawOverlayConnections,
    drawFloorOverlay,
    drawNavigationGraph
};
