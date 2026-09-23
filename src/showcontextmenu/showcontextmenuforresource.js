import { 
    toggleLockResource,
    deleteResourceFromMenu, 
    renameResource,
    toggleEditResourcePolygonMode,
    promptResourceDimensions,
    promptInitialStock,
    isComplexResource
} from '../resources.js';
import { mergeResources } from '../merge_resources/resource_operations.js';
import { duplicateResource } from '../merge_resources/duplicateResource.js';
import { rotateResource } from '../merge_resources/rotateResource.js';
import { ensureContextMenuElement, hideContextMenu } from './showcontextmenuutils.js';
import { applyColorToResource } from '../color-palette.js';
import { pasteImageToResource, removeImageFromResource, copyResourceImageToClipboard } from '../resource-image.js';
import { drawAll } from '../drawing.js';

// Função para exibir o menu de contexto para um recurso
// A implementação será movida de events.js

function showContextMenuForResource(resource, x, y, mouseEvent) {
    const menuOptions = [
        { label: resource.locked ? 'Desbloquear' : 'Bloquear', action: () => toggleLockResource(resource) },
        { label: 'Editar Polígono', action: () => toggleEditResourcePolygonMode(resource) }
    ];

    if (!isComplexResource(resource)) {
        menuOptions.push({ label: 'Digitar dimensões', action: () => promptResourceDimensions(resource) });
    }

    menuOptions.push(
        { label: 'Renomear', action: () => renameResource(resource) },
        { label: 'Alterar Cor', action: () => applyColorToResource(resource) },
        { label: 'Colar Imagem', action: async () => {
            const success = await pasteImageToResource(resource);
            if (success) drawAll();
        }},
    );

    if (resource.imageDataUrl) {
        menuOptions.push(
            { label: 'Copiar Imagem', action: async () => {
                await copyResourceImageToClipboard(resource);
            }},
            { label: 'Remover Imagem', action: () => {
                removeImageFromResource(resource);
                drawAll();
            }}
        );
    }

    menuOptions.push(
        { label: resource.initialStock ? `Estoque Inicial (${resource.initialStock})` : 'Definir Estoque Inicial', action: () => promptInitialStock(resource) },
        { label: 'Rotacionar 90°', action: () => rotateResource(resource, 90) },
        { label: 'Duplicar', action: async () => await duplicateResource(resource) },
        { label: 'Unir Recursos', action: async () => await mergeResources(resource) },
        { label: 'Excluir', action: () => deleteResourceFromMenu(resource) }
    );
    const menu = ensureContextMenuElement();
    menu.innerHTML = '';
    menuOptions.forEach(opt => {
        const item = document.createElement('div');
        item.textContent = opt.label;
        item.style.padding = '8px 15px';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid #eee';
        item.style.fontSize = '13px';
        item.style.fontFamily = 'Arial, sans-serif';
        item.style.lineHeight = '1.2';
        item.style.whiteSpace = 'nowrap';
        item.style.minWidth = '120px';
        item.style.boxSizing = 'border-box';
        item.style.color = '#333333';
        item.style.background = 'transparent';
        item.onmouseenter = () => { 
            item.style.background = '#e6f3ff'; 
            item.style.color = '#0066cc';
        };
        item.onmouseleave = () => { 
            item.style.background = 'transparent'; 
            item.style.color = '#333333';
        };
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideContextMenu();
            setTimeout(async () => {
                try {
                    await opt.action();
                } catch (error) {
                    // Erro silencioso
                }
            }, 100);
        };
        menu.appendChild(item);
    });
    if (mouseEvent) {
        menu.style.left = `${mouseEvent.clientX + 5}px`;
        menu.style.top = `${mouseEvent.clientY + 5}px`;
    }
    menu.style.visibility = 'visible';
    menu.style.opacity = '1';
    menu.style.display = 'block';
    menu.style.pointerEvents = 'auto';
    // Prevenir que o menu saia da tela
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (rect.right > viewportWidth) {
        menu.style.left = `${viewportWidth - rect.width - 10}px`;
    }
    if (rect.bottom > viewportHeight) {
        menu.style.top = `${viewportHeight - rect.height - 10}px`;
    }
}

export { showContextMenuForResource };
