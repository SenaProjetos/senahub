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

Plano de execução: [`docs/superpowers/specs/2026-09-15-menu-contexto.md`](../superpowers/specs/2026-09-15-menu-contexto.md).
