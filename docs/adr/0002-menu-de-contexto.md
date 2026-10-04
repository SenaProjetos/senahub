---
status: accepted
date: 2026-09-15
---

# ADR-0002 — Menu de contexto só substitui o nativo onde entrega mais que ele

O SenaHub passa a usar menu de contexto próprio (botão direito / toque longo) em superfícies onde
existe uma **entidade** sob o cursor — linha de arquivo, card de tarefa. Duas regras valem para o
sistema todo, em qualquer onda:

1. **Nenhum `preventDefault` escrito à mão em `contextmenu`.** A supressão do menu nativo acontece
   **só** dentro de um `ContextMenu.Trigger` (`src/components/ui/context-menu.tsx`) — que chama
   `preventDefault()` + `stopPropagation()` internamente — e só onde o menu próprio **repõe** o que
   o nativo oferecia ali (abrir em nova aba, copiar link, copiar texto) e acrescenta ações da
   entidade. Espaço vazio, cabeçalho, texto corrido e tabela sem menu próprio mantêm o nativo.
   Exceção única prevista: superfície de **manipulação direta** (canvas do Estúdio, onda 2), e
   mesmo nela `<input>`/`<textarea>` de edição mantêm o nativo (colar, corretor).
2. **Paridade: o menu de contexto nunca é o único caminho.** Toda ação dele existe também em um
   `...`, toolbar ou botão. Motivo técnico: o `ContextMenu` do base-ui não abre por teclado
   (`Shift+F10` / tecla Menu) — o `...` é o caminho acessível.
3. **Onde há seleção, o menu age sobre a seleção** (decidido em 2026-09-20, onda 2). Botão direito
   numa linha **fora** da seleção seleciona essa linha e limpa o resto, como no explorador de
   arquivos. Item que só funciona num item de cada vez (renomear, abrir detalhes) fica
   **desabilitado com o motivo**, pela regra 5 — nunca escondido.
4. **Linha com uma ação só não ganha menu.** Menu existe para oferecer escolha; ação única continua
   sendo um botão visível na linha.

## Contexto

Pedido do dono (2026-09-15): o sistema "tem cara de site" porque nada usa o botão direito; a ideia
inicial era **desativar** o botão direito. Rejeitado como regra global porque quebra coisas que o
usuário usa todo dia: abrir link em nova aba, copiar valor de tabela (ERP financeiro), tradutor,
gerenciador de senhas, colar/corretor em campo. E o botão direito já tem dono em dois lugares: o
viewer BIM (`CameraControls` gira a câmera com ele) e o viewer DWG.

## Alternativas consideradas

1. **Desativar o menu nativo no app inteiro.** Rejeitada pelos motivos acima.
2. **Menu próprio delegado no container da lista** (um `Trigger` só, alvo resolvido por
   `data-id`). Rejeitada: suprime o nativo também nos vãos entre linhas, cabeçalhos e padding —
   viola a regra 1.
3. **Menu próprio por entidade, com reposição explícita e paridade** (escolhida).

## Consequências

- Todo menu de contexto novo precisa listar o que tirou do nativo e repor (regra 1). Linha com
  `<a href>` ganha "Abrir em nova aba" e "Copiar link" (via `MenuLinkItem`, link de verdade).
- Superfície que ganha menu de contexto sem ter `...` precisa ganhar `...` junto (regra 2).
- A regra 1 é guardada por teste que varre `src/` (`src/components/ui/context-menu.test.ts`):
  `onContextMenu` / `"contextmenu"` só são aceitos em `context-menu.tsx` e numa lista explícita de
  exceções. Em 2026-09-15 `src/` não tem nenhuma ocorrência (o viewer BIM usa
  `CameraControls.mouseButtons`, não o evento), então a lista **nasce vazia**; a primeira entrada
  prevista é o canvas do Estúdio (onda 2). **Incluir qualquer arquivo na lista exige emendar esta
  ADR.** A supressão feita pela biblioteca vive em `node_modules` e não é alvo do teste.
- Chat e viewers (BIM/DWG) ficam fora do menu de contexto.
- **Emenda (2026-09-28) — visualizador de pranchas (PDF):** ganha menu próprio a pedido do dono, em
  duas superfícies, sem entrar na lista de exceções (usa a primitiva): a **prancha** (ferramentas da
  barra, "Novo apontamento aqui" e o **Copiar texto** que o nativo daria na seleção) e a **bolinha do
  apontamento** (as ações do painel de detalhes). Paridade: a barra acima da prancha e os botões do
  painel são o caminho por teclado; os dois menus leem descritores puros
  (`pendencias/acoes-visualizador.ts`, `pendencias/acoes-apontamento.ts`). No toque, o menu da prancha
  fica desligado com uma ferramenta de desenho na mão (o toque longo parado abriria no meio do traço).

- **Emenda (2026-09-29) — página Disciplinas do projeto:** a pedido do dono, é a **primeira exceção à
  regra 1 no espaço vazio**: o fundo da página (fora dos cards) abre um menu com as ações da página
  (Adicionar disciplina, Adicionar do catálogo, Mostrar ▸ por status), sem repor o menu do navegador
  ali. Paridade: o ⋯ do cabeçalho tem o mesmo array (`itensDaPaginaDisciplinas`). Cada card tem o
  próprio menu (`itensDeDisciplina`), que ganha do da página. Não entra na lista de exceções do
  teste-guarda: usa a primitiva. Outras páginas continuam com o nativo no vazio — estender isto
  exige nova emenda.
- **Emenda (2026-09-29) — clique vindo de portal:** um clique direito dentro de algo desenhado em
  portal (janela aberta pelo card, menu ⋯ aberto) chegava ao gatilho pela árvore do React e abria o
  menu do card (ou da página) por cima da janela. O `ContextMenuTrigger` agora ignora o evento cujo
  alvo não está DENTRO dele no DOM (`preventBaseUIHandler`): ali vale o menu do navegador.
- **Emenda (2026-10-04) — seleção na aba Arquivos:** botão direito numa linha marcada, com duas ou mais
  marcadas, abre SÓ as ações da seleção (baixar .zip, validar, listas, link público, excluir), pedido do
  dono. Exceção à parte "desabilitado com o motivo, nunca escondido" da regra 3: os nove itens de um
  documento só, cada um com o mesmo motivo embaixo, enterravam as ações da seleção. Paridade: eles
  continuam no `...` da linha, que age sempre na linha. Descritor puro:
  `uploads/acoes-selecao-documentos.ts` (o mesmo array da barra da seleção).

Planos de execução: [onda 1](../superpowers/specs/2026-09-15-menu-contexto.md) (entregue) ·
[onda 2](../superpowers/specs/2026-09-20-menu-contexto-onda2.md) (decidida, não implementada).
