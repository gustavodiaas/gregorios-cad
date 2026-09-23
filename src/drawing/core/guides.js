import { activeGuideLines, scale, getCtx } from '../../state.js';
import { guideLineWidth, guideLineColor } from '../../config.js';

function renderAlignmentGuides() {
    if (!activeGuideLines || activeGuideLines.length === 0) {
        return;
    }

    const ctx = getCtx();
    ctx.save();

    activeGuideLines.forEach(guide => {
        if (!guide) {
            return;
        }

        if (guide.isActive) {
            ctx.strokeStyle = '#ff3333';
            ctx.lineWidth = (guideLineWidth * 2) / scale;
            ctx.setLineDash([8 / scale, 4 / scale]);
        } else if (guide.isCenterGuide) {
            ctx.strokeStyle = '#ff6b00';
            ctx.lineWidth = (guideLineWidth * 1.5) / scale;
            ctx.setLineDash([6 / scale, 3 / scale]);
        } else {
            ctx.strokeStyle = guideLineColor;
            ctx.lineWidth = guideLineWidth / scale;
            ctx.setLineDash([4 / scale, 2 / scale]);
        }

        ctx.beginPath();
        if (guide.type === 'vertical') {
            ctx.moveTo(guide.position, guide.start || -10000);
            ctx.lineTo(guide.position, guide.end || 10000);
        } else {
            ctx.moveTo(guide.start || -10000, guide.position);
            ctx.lineTo(guide.end || 10000, guide.position);
        }
        ctx.stroke();
    });

    ctx.setLineDash([]);
    ctx.restore();
}

function drawSmartGuides() {
    if (!activeGuideLines || activeGuideLines.length === 0) {
        return;
    }

    const ctx = getCtx();
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2 / scale;

    for (const guide of activeGuideLines) {
        if (!guide || !guide.startPoint || !guide.endPoint) {
            continue;
        }

        switch (guide.type) {
            case 'right-angle':
                ctx.strokeStyle = '#ff3300';
                ctx.setLineDash([8 / scale, 4 / scale]);
                break;
            case 'parallel':
            case 'parallel-edge':
                ctx.strokeStyle = '#3366ff';
                ctx.setLineDash([6 / scale, 6 / scale]);
                break;
            case 'perpendicular':
            case 'perpendicular-edge':
                ctx.strokeStyle = '#ff6600';
                ctx.setLineDash([4 / scale, 8 / scale]);
                break;
            case 'wall-extension':
                ctx.strokeStyle = '#9933ff';
                ctx.setLineDash([2 / scale, 4 / scale]);
                break;
            case 'alignment':
            case 'horizontal-alignment':
            case 'vertical-alignment':
                ctx.strokeStyle = '#00cc66';
                ctx.setLineDash([10 / scale, 2 / scale]);
                break;
            default:
                ctx.strokeStyle = '#888888';
                ctx.setLineDash([5 / scale, 5 / scale]);
                break;
        }

        if (guide.color) {
            ctx.strokeStyle = guide.color;
        }

        ctx.beginPath();
        ctx.moveTo(guide.startPoint[0], guide.startPoint[1]);
        ctx.lineTo(guide.endPoint[0], guide.endPoint[1]);
        ctx.stroke();
    }

    ctx.restore();
}

export {
    renderAlignmentGuides,
    drawSmartGuides
};
