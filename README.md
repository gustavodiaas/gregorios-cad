# Gregório's CAD

Ferramenta web para criação, análise e otimização de layouts industriais diretamente no navegador.

O projeto permite representar áreas de movimentação, paredes, recursos, operadores, hubs, zonas de exclusão e conexões. Também inclui planejamento de rotas, simulação operacional, múltiplos pavimentos e algoritmos de otimização.

> Uma dedicatória a **Gregório Wachter**, idealizador deste projeto.

## Funcionalidades

- Construção visual de layouts industriais em canvas.
- Paredes, portas, recursos e áreas de movimentação.
- Operadores, hubs e conexões com larguras configuráveis.
- Zonas de bloqueio e exclusão.
- Múltiplos pavimentos.
- Cotas, alinhamento, encaixe inteligente e histórico de alterações.
- Roteiro de produto com etapas, tempos e animação.
- Algoritmos de otimização de layout.
- Importação, exportação e geração de documentos.
- Temas claro e escuro.

## Tecnologia

- HTML5 e CSS modular.
- JavaScript com módulos ES.
- Canvas 2D.
- jsPDF e polygon-clipping.
- Processamento e persistência no navegador, sem backend próprio.

## Executar localmente

Requer Node.js 18 ou mais recente.

```sh
git clone https://github.com/gustavodiaas/gregorios-cad.git
cd gregorios-cad
node scripts/serve.mjs
```

Abra `http://127.0.0.1:4173/`.

Se o npm estiver disponível, `npm start` executa o mesmo servidor.

## Estrutura

- `index.html`: entrada e estrutura da aplicação.
- `src/`: ferramentas, estado, desenho, otimização e simulação.
- `css/`: estilos modulares e identidade visual.
- `scripts/serve.mjs`: servidor estático local sem dependências.

## Integração futura com Indicadores

A identidade visual usa a mesma base do projeto Indicadores: Inter, superfícies claras, sombras discretas, cantos moderados e laranja como cor principal.

Como etapa inicial, o CAD pode ser publicado em uma rota própria e incorporado ao Indicadores por `iframe`. Uma integração nativa futura deve encapsular o estado e os estilos globais antes de converter a ferramenta em um módulo React.

## Dados e privacidade

O aplicativo funciona no navegador e não possui banco de dados ou contas de usuário. Arquivos importados são processados localmente. Evite dados sensíveis em computadores compartilhados e mantenha cópias dos layouts exportados.

## Situação do projeto

O projeto está em desenvolvimento. Cálculos, rotas e resultados de otimização devem ser revisados antes de uso em decisões financeiras, contratuais, regulatórias ou relacionadas à segurança.

## English summary

Gregório's CAD is a browser-based tool for creating, simulating, and optimizing industrial layouts. It runs without an application backend and is being prepared for future integration with the Indicadores toolkit.
