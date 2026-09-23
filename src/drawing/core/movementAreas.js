import { getCtx, getScale, selectedAreaId, getIsEditingPolygon, getEditingAreaId, getSelectedEdgeInfo, getMidpointVertices, getSelectedResourceId } from '../../state.js';
import { selectionColor, selectionLineWidth, gridSpacingPx, majorGridSpacingPx, floatTolerance, wallVisualLineWidth } from '../../config.js';
import { drawEditableVertices } from '../../polygon.js';
import { drawDimensions } from '../dimensions.js';
import { calculateBoundingBox } from '../../areas.js';

function drawMovementArea(area) {
    const ctx = getCtx();

    if (area.vertices && area.vertices.length < 3) {
        return;
    }

    // ── 1. Preencher área com branco ──
    ctx.fillStyle = '#FFFFFF';

    if (area.rings && area.rings.length > 0) {
        ctx.beginPath();
        const outerRing = area.rings[0];
        if (outerRing && outerRing.length > 0) {
            ctx.moveTo(outerRing[0][0], outerRing[0][1]);
            for (let i = 1; i < outerRing.length; i++) {
                ctx.lineTo(outerRing[i][0], outerRing[i][1]);
            }
            ctx.closePath();
            ctx.fill();
        }
        drawAreaGrid(area);
        if (area.rings.length > 1) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = '#000000';
            for (let i = 1; i < area.rings.length; i++) {
                const holeRing = area.rings[i];
                if (holeRing && holeRing.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(holeRing[0][0], holeRing[0][1]);
                    for (let j = 1; j < holeRing.length; j++) {
                        ctx.lineTo(holeRing[j][0], holeRing[j][1]);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            }
            ctx.restore();
        }
    } else if (area.vertices && area.vertices.length > 0) {
        ctx.beginPath();
        ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) {
            ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        drawAreaGrid(area);
    } else {
        ctx.fillRect(area.x, area.y, area.width, area.height);
        drawAreaGrid(area);
    }

}

/**
 * Desenha apenas a borda (parede) e overlays UI (seleção, edição, cotas, vértices) de uma área.
 * Deve ser chamada DEPOIS de drawAllResources() para garantir que as paredes aparecem
 * sempre por cima dos recursos, evitando que recursos se sobreponham visualmente à linha da parede.
 */
function drawMovementAreaBorder(area) {
    if (area.vertices && area.vertices.length < 3) {
        return;
    }

    const ctx = getCtx();

    // ── 2. Desenhar borda centrada na fronteira (sem clip) ──
    // A parede é centrada no limite do polígono (wallVisualLineWidth/2 para cada lado).
    // Quando duas áreas tocam com precisão exata, a área desenhada DEPOIS tem seu fill
    // branco cobrindo a metade interna da parede da área anterior, e então desenha sua
    // própria parede na mesma posição.
    // Resultado: parede única de wallVisualLineWidth centralizada na fronteira compartilhada.
    ctx.strokeStyle = area.locked ? '#A0A0A0' : '#333333';
    ctx.lineWidth = wallVisualLineWidth;
    ctx.lineJoin = 'miter';

    if (area.rings && area.rings.length > 0) {
        const outerRing = area.rings[0];
        if (outerRing && outerRing.length > 0) {
            ctx.beginPath();
            ctx.moveTo(outerRing[0][0], outerRing[0][1]);
            for (let i = 1; i < outerRing.length; i++) {
                ctx.lineTo(outerRing[i][0], outerRing[i][1]);
            }
            ctx.closePath();
            ctx.stroke();
        }
    } else if (area.vertices && area.vertices.length > 0) {
        ctx.beginPath();
        ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) {
            ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
    } else {
        ctx.strokeRect(area.x, area.y, area.width, area.height);
    }

    // Bordas dos buracos — centradas na fronteira do buraco
    if (area.rings && area.rings.length > 1) {
        for (let i = 1; i < area.rings.length; i++) {
            const holeRing = area.rings[i];
            if (holeRing && holeRing.length > 0) {
                ctx.beginPath();
                ctx.moveTo(holeRing[0][0], holeRing[0][1]);
                for (let j = 1; j < holeRing.length; j++) {
                    ctx.lineTo(holeRing[j][0], holeRing[j][1]);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
    }

    if (area.id === selectedAreaId) {
            ctx.strokeStyle = selectionColor;
            const selLineWidth = selectionLineWidth / getScale();
            ctx.lineWidth = selLineWidth;

        if (area.vertices && area.vertices.length > 0) {
            ctx.beginPath();
            ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
            for (let i = 1; i < area.vertices.length; i++) {
                ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
            }
            ctx.closePath();
            ctx.stroke();
        } else if (area.isRectangular && !area.rings) {
            const areaBB = area.vertices && area.vertices.length > 0
                ? calculateBoundingBox(area.vertices)
                : { x: area.x, y: area.y, width: area.width, height: area.height };
            ctx.strokeRect(
                areaBB.x - selLineWidth / 2,
                areaBB.y - selLineWidth / 2,
                areaBB.width + selLineWidth,
                areaBB.height + selLineWidth
            );
        }

        if (area.rings && area.rings.length > 1) {
            for (let i = 1; i < area.rings.length; i++) {
                const holeRing = area.rings[i];
                if (holeRing && holeRing.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(holeRing[0][0], holeRing[0][1]);
                    for (let j = 1; j < holeRing.length; j++) {
                        ctx.lineTo(holeRing[j][0], holeRing[j][1]);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }
    }

    if (getIsEditingPolygon() && area.id === getEditingAreaId() && area.id !== selectedAreaId) {
        ctx.save();
        ctx.strokeStyle = '#ff6b0050';
                ctx.lineWidth = wallVisualLineWidth;
        ctx.setLineDash([6 / getScale(), 6 / getScale()]);
        ctx.beginPath();
        ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) {
            ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    // Não desenhar cotas de áreas quando há recurso selecionado
    if (!getSelectedResourceId()) {
        drawDimensions(area);
    }
    drawEditableVertices(area);
    drawSelectedEdgeHighlight(area);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

function drawAreaGrid(area) {
    const ctx = getCtx();
    ctx.save();

    ctx.beginPath();
    if (area.vertices && area.vertices.length > 0) {
        ctx.moveTo(area.vertices[0][0], area.vertices[0][1]);
        for (let i = 1; i < area.vertices.length; i++) {
            ctx.lineTo(area.vertices[i][0], area.vertices[i][1]);
        }
    } else {
        ctx.rect(area.x, area.y, area.width, area.height);
    }
    ctx.closePath();
    ctx.clip();

    const bb = area;
    const scaledGridSpacingPx = gridSpacingPx;
    const scaledMajorGridSpacingPx = majorGridSpacingPx;

    const startGridX = Math.floor((bb.x - 1) / scaledGridSpacingPx) * scaledGridSpacingPx;
    const endGridX = Math.ceil((bb.x + bb.width + 1) / scaledGridSpacingPx) * scaledGridSpacingPx;
    const startGridY = Math.floor((bb.y - 1) / scaledGridSpacingPx) * scaledGridSpacingPx;
    const endGridY = Math.ceil((bb.y + bb.height + 1) / scaledGridSpacingPx) * scaledGridSpacingPx;

    for (let x = startGridX; x <= endGridX; x += scaledGridSpacingPx) {
        const isMajor = Math.abs(x % scaledMajorGridSpacingPx) < floatTolerance ||
            Math.abs(scaledMajorGridSpacingPx - (x % scaledMajorGridSpacingPx)) < floatTolerance;
        ctx.beginPath();
        ctx.moveTo(x, bb.y);
        ctx.lineTo(x, bb.y + bb.height);
        ctx.lineWidth = (isMajor ? 1 : 0.5) / getScale();
        ctx.strokeStyle = isMajor ? '#CCCCCC' : '#E0E0E0';
        ctx.stroke();
    }

    for (let y = startGridY; y <= endGridY; y += scaledGridSpacingPx) {
        const isMajor = Math.abs(y % scaledMajorGridSpacingPx) < floatTolerance ||
            Math.abs(scaledMajorGridSpacingPx - (y % scaledMajorGridSpacingPx)) < floatTolerance;
        ctx.beginPath();
        ctx.moveTo(bb.x, y);
        ctx.lineTo(bb.x + bb.width, y);
        ctx.lineWidth = (isMajor ? 1 : 0.5) / getScale();
        ctx.strokeStyle = isMajor ? '#CCCCCC' : '#E0E0E0';
        ctx.stroke();
    }

    ctx.restore();
}

function drawSelectedEdgeHighlight(area) {
    const info = getSelectedEdgeInfo();
    if (!info || !info.isActive || info.areaId !== area.id) {
        return;
    }

    const midpoints = getMidpointVertices();
    if (!midpoints || info.midpointIndex < 0 || info.midpointIndex >= midpoints.length) {
        return;
    }

    const midpoint = midpoints[info.midpointIndex];
    if (!area.vertices || midpoint.vertex1Index >= area.vertices.length || midpoint.vertex2Index >= area.vertices.length) {
        return;
    }

    const vertex1 = area.vertices[midpoint.vertex1Index];
    const vertex2 = area.vertices[midpoint.vertex2Index];

    const ctx = getCtx();
    ctx.save();
    ctx.strokeStyle = '#ff6b00';
    ctx.lineWidth = 4 / getScale();
    ctx.setLineDash([8 / getScale(), 4 / getScale()]);
    ctx.beginPath();
    ctx.moveTo(vertex1[0], vertex1[1]);
    ctx.lineTo(vertex2[0], vertex2[1]);
    ctx.stroke();
    ctx.restore();
}

export {
    drawMovementArea,
    drawMovementAreaBorder,
    drawAreaGrid,
    drawSelectedEdgeHighlight
};
