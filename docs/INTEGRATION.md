# Integração com Indicadores

## Curto prazo

Publicar o Gregório's CAD em uma rota independente e carregá-lo no Indicadores por meio de um `iframe`. Essa opção mantém isolados o canvas, os eventos de teclado, os estilos globais e o estado da aplicação.

## Contrato recomendado

- O Indicadores controla navegação, título do módulo e permissões da página.
- O CAD controla desenho, arquivos, simulação e preferências internas.
- A comunicação entre os dois aplicativos deve usar `window.postMessage` com origem explicitamente permitida.
- Eventos iniciais sugeridos: `cad:ready`, `cad:layout-changed`, `cad:save-requested` e `indicadores:theme-changed`.
- Dados recebidos devem ser validados antes de alterar o estado do canvas.

## Integração nativa futura

Antes de transformar o CAD em módulo React do Indicadores:

1. Encapsular seletores globais de CSS sob uma raiz própria.
2. Separar o estado do canvas dos elementos do DOM.
3. Transformar inicialização e descarte em funções explícitas.
4. Substituir listeners globais por listeners registrados por instância.
5. Criar testes para importação, exportação, desenho e otimização.
