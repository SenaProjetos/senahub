# Menu de contexto — onda 2 (seleção múltipla e telas de lista)

**Data:** 2026-09-20 · **Status:** F1 e F2 entregues em 2026-09-20; F3–F5 pendentes · **Vem de:**
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
| **F1** | **Opus** | ✔ **Entregue.** `lib/selecao.ts` + `lib/lote.ts` (puros, testados), `ui/use-selecao.ts`, `ui/use-lote.tsx` (confirmação com contagem, progresso, relatório de falha parcial), `ui/barra-selecao.tsx` (come o mesmo `AcaoItem[]`), `ui/botao-selecionados.tsx`. **Sem consumidor ainda** — a prova real vem na F2. |
| **F2** | **Sonnet** | ✔ **Entregue.** Diretório, aprovações e pedidos de exclusão. Ver §3.2. |
| **F3** | **Sonnet** | As 10 tabelas, em commits por grupo (financeiro primeiro, que é onde o lote mais rende). |
| **F4** | **Sonnet** | Quadros do comercial + correção de arrastar no toque. |
| **F5** | **Sonnet** | Agenda (dia/horário + `...` no evento). |

Ao iniciar cada fase, a primeira linha da resposta diz o modelo esperado; se o ativo for outro,
**parar** e esperar a troca.

---

## 3.1. O que a F1 deixou pronto (e o que ficou para a F2)

O motor não tem consumidor: **nenhuma tela mudou na F1**. A tabela de documentos, que já tem
seleção, ficou de fora de propósito — a barra dela tem seis ações de domínio (zip, validar,
escopo de exclusão, listas, link público) e o cálculo do que está selecionado hoje olha só a
página corrente. Trocar isso exige a consulta "linhas por id" que a seleção atravessando filtros
pede, e isso é trabalho da F2/F3, não um ajuste de passagem.

Contrato para quem consumir:

```tsx
const selecao = useSelecao();           // marcado/alternar/alternarPagina/limpar/soSelecionados
const lote = useLote();                 // executar({ ids, acao, substantivo, verbo, confirmar })
// no menu da linha: const alvos = selecao.aoAbrirMenu(linha.id)  → já aplica a regra do explorador
<BarraSelecao total={selecao.total} itens={itensDoLote} onSelect={...} onLimpar={selecao.limpar}
              substantivo={["documento", "documentos"]} progresso={lote.progresso} />
<BotaoSelecionados total={selecao.total} ativo={selecao.soSelecionados} onChange={selecao.verSelecionados} />
{lote.portal}
```

## 3.2. O que a F2 entregou (e o que aprendeu)

- **Diretório `/arquivos`:** seleção que atravessa filtro e página; "Selecionados (N)" busca por id
  no servidor (`carregarDocumentosPorIds`) ignorando os filtros; menu de contexto e `...` por linha;
  lote só de leitura (baixar .zip, copiar nomes). O `documentoIds` da consulta **só estreita o
  escopo**, nunca o substitui — coberto por 5 casos novos no `smoke:documentos-escopo`, incluindo a
  lista vazia, que devolve zero (não "sem filtro").
- **Aprovações:** seleção e barra única no lugar do "Aprovar (n)" por projeto. O lote valida **item a
  item** (`validarArquivo`), que devolve o motivo de cada falha; a ação em lote antiga só dizia
  "N ignorados". É o primeiro consumidor de `useLote`.
- **Pedidos de exclusão:** seleção, barra, "Manter" em lote (um motivo para todos) e "Excluir" em lote
  (confirmação com a contagem). Menu de uma linha enxuto.
- **Descritor de documento** ganhou o modo `consulta` (sem Detalhes nem Renomear, com "Abrir no
  projeto") e aceita o projeto por linha, porque o diretório mistura projetos.
- **Motor:** `useLote` passou a repassar o rótulo do botão de confirmar (saía "Confirmar" genérico).
- **Verificado no navegador:** seleção sobrevive a filtro; "Selecionados" mostra os marcados com a lista
  vazia; botão direito dentro da seleção → menu de lote, fora → seleção vira só a linha; recarregar
  zera; aprovar 2 em lote (banco confirma exatamente 2 validados); recusar em lote com motivo; excluir
  em lote com confirmação (cancelar preserva).
- **Não verificado em tela:** o cartão de celular (toque longo) do diretório.

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
