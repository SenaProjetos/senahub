# Menu de contexto — onda 2 (seleção múltipla e telas de lista)

**Data:** 2026-09-20 · **Status:** decidido em grilling, nada implementado · **Vem de:**
[onda 1](2026-09-15-menu-contexto.md) (F1–F3 entregues) · **Regras transversais:**
[ADR-0002](../../adr/0002-menu-de-contexto.md)

A onda 1 provou o formato numa entidade por tela. A onda 2 leva o menu para as listas do sistema
e acrescenta o que faltava para elas: **agir sobre vários itens de uma vez**.

---

## 1. Decisões do dono (2026-09-20)

| # | Decisão |
|---|---|
| 1 | **O menu age sobre a seleção.** Com linhas marcadas, a ação vale para todas as marcadas. |
| 2 | **Botão direito em linha fora da seleção seleciona ela e limpa o resto** — o comportamento do explorador de arquivos. |
| 3 | **Linha com uma ação só não ganha menu.** Menu existe onde há escolha; ação única continua sendo um botão visível. |
| 4 | **Item que não faz lote fica desabilitado com o motivo** (Renomear, Detalhes), nunca escondido — regra 5 da ADR-0002. |
| 5 | **As 8 tabelas sem seleção ganham seleção agora** (só certidões e o diretório têm hoje). |
| 6 | **Uma barra de lote compartilhada** para todas as telas; a barra de documentos de hoje vira caso de uso dela. |
| 7 | **O lote repete a ação existente item a item, no cliente, e relata o resultado** ("5 de 7 concluídos"). Sem action nova no servidor: a auditoria continua registrando item a item, e a falha parcial fica visível. |
| 8 | **Teto de 100 itens** por lote. Acima disso a barra pede para filtrar melhor. |
| 9 | **Lote destrutivo é permitido, com a contagem na confirmação** ("Excluir 7 lançamentos?"). |
| 10 | **A seleção atravessa filtro e página** e um botão **"Selecionados (N)"** na barra de filtros mostra só o que foi marcado, ignorando os demais filtros. É o que permite juntar linhas de filtros diferentes. |
| 11 | **A seleção é zerada ao concluir a ação em lote** e no botão Limpar. |
| 12 | **A seleção não sobrevive a recarregar a página** nem a sair da tela: vale enquanto a tela está aberta. |
| 13 | **EAP fica de fora** — vai ser reformulada, e o trabalho seria perdido. |

**Quais ações ganham lote:** decisão delegada ao implementador, pelo critério "funciona item a item
sem contexto extra". O que exigir contexto de uma linha só (renomear, abrir detalhes, comparar
revisões) fica desabilitado com o motivo quando há mais de um selecionado.

---

## 2. Escopo

**Entra:**
1. **Diretório `/arquivos`** — reaproveita `itensDeDocumento`; tela de consulta, menu só de leitura
   (detalhes, visualizar, baixar, copiar link/nome, ir para o projeto). A linha ganha `...`.
2. **Aprovações e pedidos de exclusão** — aprovar/recusar na linha, sobre o mesmo descritor.
3. **As 10 tabelas com `...`** — `clientes`, `usuarios`, `lancamentos`, `contas-pagar-receber`,
   `acessos`, `certidoes`, `campanhas`, `parceiros`, `disciplinas-catalogo`, `orcamento-arvore`.
   As 8 sem seleção ganham seleção (decisão 5).
4. **Quadros do comercial** (`funil`, `negociacao`, `prospeccao`) — herdam o formato do quadro de
   tarefas. **Levam junto a correção de arrastar no toque**: os três têm o mesmo defeito que as
   tarefas tinham (medido em 2026-09-19 no de prospecção, que não tem menu de contexto e também não
   arrasta por toque). Falta `touch-none` na alça.
5. **Agenda** — botão direito no dia/horário abre "Novo evento aqui"; **o evento ganha `...`** com
   editar, duplicar e excluir (hoje não tem nenhum), para cumprir a paridade.

**Fica de fora:** EAP (decisão 13), chat (`chat-view.tsx`, 4058 linhas) e explorer do projeto
(`arquivos-explorer.tsx`, 2850 linhas) — grandes demais para receber menu antes de refatorar;
viewers BIM/DWG (o botão direito já gira a câmera); canvas do Estúdio (exigiria emendar a ADR).

---

## 3. Fases

| Fase | Modelo | Conteúdo |
|---|---|---|
| **F1** | **Opus** | O motor, que as telas copiam: hook de seleção compartilhado (atravessa filtro/página, zera ao concluir), barra de lote única alimentada pelo mesmo `AcaoItem[]`, executor de lote com relatório parcial e teto de 100, botão "Selecionados (N)". Testes da camada pura. |
| **F2** | **Sonnet** | Diretório + aprovações — o reaproveitamento direto de `itensDeDocumento`. |
| **F3** | **Sonnet** | As 10 tabelas, em commits por grupo (financeiro primeiro, que é onde o lote mais rende). |
| **F4** | **Sonnet** | Quadros do comercial + correção de arrastar no toque. |
| **F5** | **Sonnet** | Agenda (dia/horário + `...` no evento). |

Ao iniciar cada fase, a primeira linha da resposta diz o modelo esperado; se o ativo for outro,
**parar** e esperar a troca.

---

## 4. Riscos conhecidos

- **Seleção que atravessa filtro** é o ponto mais delicado: a linha marcada pode não estar na
  página atual nem no filtro atual. O botão "Selecionados (N)" precisa buscar por id, sem os
  demais filtros. Id que sumiu do banco no meio do caminho vira falha no relatório do lote, não
  erro de tela.
- **Lote repetindo a ação** dispara até 100 chamadas seguidas. Mostrar progresso e não travar a
  tela; falha parcial precisa dizer *o que* falhou, não só quantos.
- **8 tabelas ganhando seleção** é mudança visível em telas que hoje ninguém questiona. Vale
  conferir com o dono a primeira delas antes de replicar nas outras sete.
- **`aprovacoes-view` e o diretório** são telas de consulta e de decisão: cuidado para o lote não
  aprovar em massa o que deveria ser olhado item a item.

---

## 5. Antes de começar

Pendências da onda 1, que não bloqueiam mas deveriam fechar antes:
- roteiro de teste em tela (§3f do spec da onda 1);
- checklist de release: data da dica temporária e issue de remoção.
