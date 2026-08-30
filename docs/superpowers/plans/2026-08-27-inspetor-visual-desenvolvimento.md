# Inspetor Visual de Desenvolvimento

**Data:** 2026-08-27  
**Status:** em execução — F1 (mapeamento explícito de JSX)

## 1. Contexto

O SenaHub usa Next 15.5 com React 19 e Turbopack em desenvolvimento (`package.json:6`). A raiz da aplicação é renderizada por `src/app/layout.tsx`, que instala os provedores comuns em `src/components/providers.tsx`. O projeto centraliza sua linguagem visual em tokens CSS de `src/app/globals.css:7` e os primitivos da interface já expõem `data-slot` em `src/components/ui/`.

Hoje um ajuste pequeno de texto, espaçamento, cor ou ícone requer localizar manualmente o componente responsável ou pedir uma investigação assistida. A origem de um nó no DOM não é visível na tela e a relação entre DOM e JSX é especialmente indireta em componentes compostos e `cn()`.

## 2. Problema

Durante o desenvolvimento local, a pessoa precisa descobrir rapidamente **qual componente JSX produziu o elemento que está vendo**, sem abrir ferramentas externas nem alterar o comportamento da tela. O primeiro risco técnico é saber se a compilação de desenvolvimento preserva informação suficiente para mapear um elemento do DOM ao arquivo e à linha de origem.

## 3. Decisões

### D1 — POC somente leitura antes de qualquer escrita de código

O POC adicionará um overlay de inspeção visual ativado por `Ctrl+Shift+E`. Ele destaca o elemento sob o cursor e, ao clicar, mostra tag, classes, `data-slot` e a melhor origem React disponível (arquivo/linha/coluna).

**Alternativa descartada:** iniciar com editor de Tailwind, gravador AST e Git. Sem confirmar a origem do JSX, essas camadas seriam especulativas e poderiam gravar no componente errado.

### D2 — Usar a informação de depuração já presente no React em desenvolvimento

O POC lê a Fiber associada ao elemento DOM somente em desenvolvimento e procura a fonte de depuração da Fiber e de seus donos. Não configura loader, Babel ou transformação de TSX nesta fase.

**Alternativa descartada:** instrumentar todo JSX imediatamente via loader do Turbopack. É a rota para uma versão de escrita confiável, mas é mais invasiva e deve ser considerada apenas se a Fiber não fornecer origem suficiente.

### D3 — Interface de ferramenta, discreta e excluída da própria seleção

O painel será flutuante, de baixa interferência e terá uma única assinatura visual: a moldura de medição azul do elemento selecionado. Não reutilizará navegação, dados ou permissões do ERP e ficará marcado com atributo próprio para não ser capturado.

### D4 — Zero disponibilidade em produção

O componente só será incluído quando `NODE_ENV === "development"`. Não haverá rota, Server Action, banco, permissão, upload, escrita de arquivo ou comando Git. A produção não recebe controles, listeners ou dependências do inspetor.

**Alternativa descartada:** proteger a ferramenta por papel de usuário. A ferramenta é de código-fonte local; ela não pertence ao modelo de autorização do produto e não deve sequer existir no bundle de produção.

## 4. Modelo de dados

Não há alteração de Prisma, migration, seed ou persistência. O estado do inspetor permanece apenas no navegador.

## 5. Fases

| Fase | Entrega verificável |
| --- | --- |
| F0 — POC | Implementado: atalho ativa/desativa a inspeção, elemento é destacado, clique mostra metadados DOM e a melhor origem React encontrada. A ferramenta não aparece em produção. Falta confirmar no navegador uma origem de arquivo/linha em tela real. |
| F1 — mapeamento explícito | Em execução: o POC confirmou que React 19 não expõe arquivo/linha. Instrumentar JSX via loader do Turbopack limitado a `src/**/*.tsx` e ao ambiente de desenvolvimento; o inspetor lê o atributo gerado antes do fallback de Fiber. |
| F2 — futura | Somente após F1: edição de literais estáticos, prévia e diff; sem escrita em nós dinâmicos. |
| F3 — futura | Serviço local para aplicar patches AST e fluxo explícito de validação/commit, isolado de alterações pré-existentes do worktree. |

**Critério de corte:** se uma tela composta real não revelar arquivo e linha recuperáveis por Fiber, F0 termina como inspetor de DOM e F1 precisa de nova decisão. Não haverá tentativa de inferir o arquivo por busca textual.

## 6. Permissões

Não há novo recurso, permissão, navegação ou alteração em `nav-config.ts`. O POC não acessa dados nem executa mutações do ERP.

## 7. Testes e validação

- Teste puro para a extração de origem a partir de objetos Fiber simulados, incluindo subida pelos donos.
- Teste manual em `npm run dev`: ativar/desativar, mover sobre elementos, selecionar um primitivo `data-slot`, confirmar que o painel não se seleciona e navegar normalmente após desativar.
- Conferência em produção: `npm run build` somente sem servidor de desenvolvimento usando a mesma `.next`; o trecho de desenvolvimento precisa ser eliminado do bundle de produção.
- Rodar `npm run lint` e o teste focado.

## 8. Fora de escopo

- Alterar texto, classes, estilos, ícones ou imagens.
- Persistir uma seleção, criar API, Server Action, migration ou tabela.
- Criar commit ou mudar arquivos do usuário.
- Instrumentar JSX, introduzir Babel ou alterar a configuração do Turbopack.
- Suportar elementos que não pertencem à árvore React (por exemplo, extensões do navegador).
