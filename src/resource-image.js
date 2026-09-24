/**
 * Módulo para colar imagens da área de transferência em recursos.
 * A imagem é armazenada como data URL no recurso (imageDataUrl)
 * e renderizada clipped ao polígono do recurso no canvas.
 */

// Cache de HTMLImageElement por resource id para evitar recriar a cada frame
const imageCache = new Map();

function resolveImageSource(source) {
    if (!source) return '';
    try {
        return new URL(source, document.baseURI).href;
    } catch (_error) {
        return source;
    }
}

/**
 * Lê uma imagem da área de transferência e aplica ao recurso.
 * @param {Object} resource - O recurso alvo
 * @returns {Promise<boolean>} true se a imagem foi colada com sucesso
 */
export async function pasteImageToResource(resource) {
    try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            alert('Seu navegador não suporta leitura de imagens da área de transferência.');
            return false;
        }

        const clipboardItems = await navigator.clipboard.read();

        for (const item of clipboardItems) {
            const imageType = item.types.find(t => t.startsWith('image/'));
            if (imageType) {
                const blob = await item.getType(imageType);
                const dataUrl = await blobToDataUrl(blob);

                resource.imageDataUrl = dataUrl;

                // Pre-load into cache
                await loadImageForResource(resource);

                return true;
            }
        }

        alert('Nenhuma imagem encontrada na área de transferência.');
        return false;
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            alert('Permissão negada para acessar a área de transferência. Permita o acesso nas configurações do navegador.');
        } else {
            alert('Erro ao colar imagem: ' + err.message);
        }
        return false;
    }
}

/**
 * Remove a imagem de um recurso.
 * @param {Object} resource - O recurso alvo
 */
export function removeImageFromResource(resource) {
    delete resource.imageDataUrl;
    imageCache.delete(resource.id);
}

/**
 * Copia a imagem de um recurso para outro.
 * @param {Object} sourceResource - O recurso de origem
 * @param {Object} targetResource - O recurso de destino
 */
export function copyImageToResource(sourceResource, targetResource) {
    if (!sourceResource.imageDataUrl) return;
    targetResource.imageDataUrl = sourceResource.imageDataUrl;
    loadImageForResource(targetResource);
}

/**
 * Copia a imagem do recurso para a área de transferência do sistema.
 * @param {Object} resource - O recurso com imagem
 * @returns {Promise<boolean>} true se copiou com sucesso
 */
export async function copyResourceImageToClipboard(resource) {
    if (!resource.imageDataUrl) return false;
    try {
        const resp = await fetch(resource.imageDataUrl);
        const blob = await resp.blob();
        await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
        ]);
        return true;
    } catch (err) {
        console.warn('Erro ao copiar imagem para clipboard:', err);
        return false;
    }
}

/**
 * Retorna o HTMLImageElement cacheado para o recurso, ou null se não houver imagem.
 * Inicia carregamento assíncrono se necessário.
 * @param {Object} resource - O recurso
 * @returns {HTMLImageElement|null}
 */
export function getResourceImage(resource) {
    if (!resource.imageDataUrl) return null;

    const cached = imageCache.get(resource.id);
    const resolvedSource = resolveImageSource(resource.imageDataUrl);
    if (cached && cached.src === resolvedSource && cached.complete) {
        return cached;
    }

    // Se ainda não está no cache, iniciar carregamento (não bloqueia renderização)
    if (!cached || cached.src !== resolvedSource) {
        loadImageForResource(resource);
    }

    return null;
}

/**
 * Carrega a imagem do recurso no cache.
 * @param {Object} resource
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageForResource(resource) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            imageCache.set(resource.id, img);
            resolve(img);
        };
        img.onerror = () => {
            imageCache.delete(resource.id);
            reject(new Error('Falha ao carregar imagem do recurso'));
        };
        img.src = resolveImageSource(resource.imageDataUrl);
    });
}

/**
 * Converte um Blob para data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Limpa entradas do cache para recursos que não existem mais.
 * @param {Array} currentResourceIds - IDs de recursos existentes
 */
export function cleanImageCache(currentResourceIds) {
    const idSet = new Set(currentResourceIds);
    for (const id of imageCache.keys()) {
        if (!idSet.has(id)) {
            imageCache.delete(id);
        }
    }
}

/**
 * Recarrega imagens de todos os recursos que possuem imageDataUrl
 * (útil após carregar um layout salvo).
 * @param {Array} resources - Lista de recursos
 */
export async function reloadResourceImages(resources) {
    const promises = [];
    for (const resource of resources) {
        if (resource.imageDataUrl) {
            promises.push(loadImageForResource(resource).catch(() => {}));
        }
    }
    await Promise.all(promises);
}
