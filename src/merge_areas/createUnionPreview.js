import { rectangleToVertices } from '../areas.js';

/**
 * Cria uma prévia visual da união das áreas.
 * @param {Array} areasToMerge - Áreas que serão unidas
 * @param {Array} sharedEdges - Paredes internas a mostrar (apenas se manter paredes)
 * @param {Object} [mergedArea] - Área resultante da união (opcional, para preview realista)
 * @returns {string} - HTML da prévia
 */
function createUnionPreview(areasToMerge, sharedEdges, mergedArea = null) {
    const svgWidth = 200;
    const svgHeight = 150;
    // Calcular bounding box de todas as áreas
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let allVertices = [];
    if (mergedArea && mergedArea.vertices) {
        allVertices = mergedArea.vertices;
    } else {
        areasToMerge.forEach(area => {
            const vertices = area.vertices || rectangleToVertices(area.x, area.y, area.width, area.height);
            allVertices = allVertices.concat(vertices);
        });
    }
    allVertices.forEach(vertex => {
        minX = Math.min(minX, vertex[0]);
        maxX = Math.max(maxX, vertex[0]);
        minY = Math.min(minY, vertex[1]);
        maxY = Math.max(maxY, vertex[1]);
    });
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const scale = Math.min(svgWidth / contentWidth, svgHeight / contentHeight) * 0.8;
    const offsetX = (svgWidth - contentWidth * scale) / 2 - minX * scale;
    const offsetY = (svgHeight - contentHeight * scale) / 2 - minY * scale;
    let svgContent = '';
    // Desenhar polígono unido (preview realista)
    let previewArea = mergedArea;
    if (!previewArea) {
        // Simular união: usar todos os vértices juntos (não é perfeito, mas serve para preview)
        // Se só uma área, usar ela
        if (areasToMerge.length === 1) {
            previewArea = areasToMerge[0];
        } else {
            // Fallback: desenhar bounding box de todas as áreas
            previewArea = {
                id: Math.min(...areasToMerge.map(a => a.id)),
                vertices: [
                    [minX, minY],
                    [maxX, minY],
                    [maxX, maxY],
                    [minX, maxY]
                ]
            };
        }
    }
    const vertices = previewArea.vertices || rectangleToVertices(previewArea.x, previewArea.y, previewArea.width, previewArea.height);
    const points = vertices.map(v => `${v[0] * scale + offsetX},${v[1] * scale + offsetY}`).join(' ');
    const color = '#e3f2fd'; // Cor única para área unida
    svgContent += `
        <polygon points="${points}" 
                 fill="${color}" 
                 stroke="#666" 
                 stroke-width="1" 
                 opacity="0.85"/>
        <text x="${(vertices[0][0]) * scale + offsetX + 10}" 
              y="${(vertices[0][1]) * scale + offsetY + 15}" 
              font-size="12" 
              fill="#333">
            Área ${previewArea.id}
        </text>
    `;
    // Desenhar paredes internas (apenas se solicitado)
    if (sharedEdges && sharedEdges.length > 0) {
        sharedEdges.forEach(edge => {
            const x1 = edge.overlap.start[0] * scale + offsetX;
            const y1 = edge.overlap.start[1] * scale + offsetY;
            const x2 = edge.overlap.end[0] * scale + offsetX;
            const y2 = edge.overlap.end[1] * scale + offsetY;
            svgContent += `
                <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
                      stroke="#ff6b00" 
                      stroke-width="3" 
                      opacity="0.8"/>
            `;
        });
    }
    return `
        <div style="text-align: center; margin: 15px 0;">
            <h5 style="margin: 0 0 10px 0; color: #333;">Prévia da União</h5>
            <svg width="${svgWidth}" height="${svgHeight}" style="border: 1px solid #ddd; border-radius: 4px; background: #fafafa;">
                ${svgContent}
            </svg>
            ${sharedEdges && sharedEdges.length > 0 ? `<p style="margin: 10px 0 0 0; font-size: 12px; color: #666;"><span style="color: #ff6b00;">●</span> Paredes internas</p>` : ''}
        </div>
    `;
}

export { createUnionPreview };