# Engenharia de Custos — Orçamento: busca em tempo real, vínculo na raiz, criação inline de insumo/composição

**Data:** 2026-08-05 · **Status:** plano — aguardando "ok" · **Branch:** `dev` · **Modelo:** Sonnet

Depende de: onda anterior (colunas Item/Código/Banco/Valor com BDI, commit `5541fe9`) e busca-banco-integrada
(commit `1f41e48`). Fonte: 2 screenshots do usuário (diálogo "Vincular composição" + toolbar "Novo grupo")
+ 3 pedidos em texto. Escopo fechado via 2 `AskUserQuestion` (2026-08-05).

## 1. Goal

3 fricções na tela `/custos/[id]` (planilha):

1. **Busca não é em tempo real** — `BuscaBancoDialog` só busca ao apertar Enter ou clicar na lupa.
   Digitar "88" e ver a lista atualizar sozinha ajuda a reconhecer a composição certa.
2. **Vincular direto da raiz** — hoje só dá pra criar serviço vinculado a composição/insumo entrando
   num grupo (hover "+" ou menu "..."). Toolbar ganha "Vincular composição"/"Vincular insumo" ao lado
   de "Novo grupo", criando o serviço direto na raiz do orçamento (`parentId: null` — já suportado pelo
   `criarItem` do service, sem mudança de backend).
3. **Criar insumo/composição própria sem sair da tela** — hoje só existe em `/custos/bancos` (e mesmo
   lá, insumo próprio não existe: preço só entra pela importação SINAPI). `BuscaBancoDialog` ganha um
   "não achou? criar novo" que cadastra ali mesmo e já pré-seleciona o resultado.

Decisões fechadas com o usuário (`AskUserQuestion`, 2026-08-05):
- Botões de vínculo no toolbar criam **na raiz** (não vou mexer no atalho de hover, que hoje só oferece
  composição — fica pra outra hora).
- Insumo próprio criado na tela do orçamento ganha **cadastro + preço na hora** (não só o cadastro vazio
  que a composição própria já tem) — precisa de um caminho pra gravar `CustoPreco`, que hoje só existe
  no job de importação SINAPI.

## 2. O que já existe (não reinventar)

- `criarItem` (`orcamento/service.ts:234`) só valida o pai quando `input.parentId` é truthy — root-level
  (`parentId: null`) com `tipo: "servico"` já é aceito sem mudança nenhuma no service.
- `BuscaBancoDialog` já tem `Props.modo:"criar"` com `parentId: string | null` — só o tipo local
  `NovoServicoAlvo` em `orcamento-arvore-view.tsx` (`parentId: string`, não-nulo) precisa abrir pra aceitar
  `null`.
- `buscarComposicoesParaVinculo`/`buscarInsumosParaVinculo` (`orcamento/actions.ts:258,285`) já usam
  `leitura` = `{..., audit: false}` — busca por tecla não vai spammar `AuditLog`. `take: 20` fixo em ambas
  — sem guarda de tamanho mínimo necessária pro debounce (custo da query é limitado independente do `q`).
  **Confirmado por teste do reviewer antes de escrever este plano.**
- `criarComposicaoPropria` (`composicoes/service.ts:312`) já existe — cria composição vazia na base
  singleton `fonte: "propria"`. Vou reusar a action `criarComposicao` (`composicoes/actions.ts:84`) tal
  qual, só chamando ela de dentro do diálogo. Nasce com custo 0 (sem itens) — mesmo comportamento de hoje,
  só acessível de um lugar novo.
- `base` const em `composicoes/actions.ts:23` = `{modulo:"custos", recurso:"custos", permissao:"bancos"}`
  — toda escrita de catálogo (composição/insumo próprio) é gate `custos:bancos`, **diferente** do
  `custos:gerir` que já gerencia a árvore do orçamento. Os botões novos de criação inline só aparecem pra
  quem tem as duas permissões.

## 3. Onde grava o preço do insumo próprio (a decisão de design)

`custoDoInsumo(db, insumoId, basePrecoId)` faz 1 lookup direto: `CustoPreco` onde `baseId = basePrecoId
do orçamento`. Pra um insumo recém-criado ficar **usável imediatamente** neste orçamento, o preço tem que
existir exatamente nessa base — não numa base "própria" separada (que o `custoDoInsumo` nunca ia olhar
sem eu reescrever a lookup + `previewTrocaBase` pra ter fallback entre bases, mudança bem maior que o
pedido).

Mecanismo: `criarInsumoProprio` grava o `CustoPreco` direto na base ativa do orçamento
(`orc.basePrecoId`, que a tela já manda pro diálogo). Isso é uma linha extra numa base já existente — não
mexe em nenhum preço SINAPI (chave é `[baseId, insumoId]`, e o novo insumo tem `fonte: "propria"`, código
isolado do namespace SINAPI). Efeito colateral aceito e documentado: se o orçamento depois trocar de base
(`aplicarTrocaBase`), esse insumo ad-hoc fica "sem cotação" na base nova — correto, é um preço manual de
uma cotação específica, não um dado oficial que deveria migrar de base em base.

Se `basePrecoId` não vier (chamada futura de fora de um orçamento, ex. tela `/custos/bancos`), o service
aceita e só não grava preço — vira cadastro puro, mesmo comportamento hoje inexistente mas simétrico ao
de composição própria.

## 4. Mudanças por arquivo

### 4.1 Busca em tempo real — `busca-banco-dialog.tsx`

- Debounce de 300ms sobre `busca` (useEffect + setTimeout) chamando a mesma `buscar()`.
- Guarda de corrida: `useRef` sequencial — resposta de uma busca antiga (usuário já digitou mais) é
  descartada em vez de sobrescrever a lista mais nova.
- Botão de lupa e Enter continuam funcionando (buscam imediatamente, sem esperar o debounce).

### 4.2 Vínculo na raiz — `orcamento-arvore-view.tsx`

- `NovoServicoAlvo.parentId`: `string` → `string | null`.
- Nova função `abrirNovoServicoRaiz(fonte)` → `setNovoServicoAlvo({ parentId: null, parentDescricao: null, fonte })`.
- Toolbar (ao lado de "Novo grupo", dentro do mesmo `podeGerir &&`): 2 botões novos, `variant="outline"`,
  desabilitados quando `!temBasePreco` (mesma regra que já vale pro resto do vínculo):
  ```
  Vincular composição   Vincular insumo   [Novo grupo]
  ```

### 4.3 Criação inline de insumo/composição própria

**Schema** (`composicoes/schemas.ts`) — novo `criarInsumoSchema`:
```ts
export const criarInsumoSchema = z.object({
  codigo: z.string().min(1, "Código é obrigatório."),
  descricao: z.string().min(1, "Descrição é obrigatória."),
  unidade: z.string().min(1, "Unidade é obrigatória."),
  categoria: z.enum(["servicos", "material", "mao_de_obra", "encargos_complementares", "equipamento", "especiais"]),
  basePrecoId: z.string().optional(),
  preco: z.number().positive("Preço precisa ser maior que zero.").optional(),
});
```

**Service** (`composicoes/service.ts`, ao lado de `criarComposicaoPropria`) — novo `criarInsumoProprio`:
cria `CustoInsumo` com `fonte: "propria"`; se `basePrecoId` + `preco` vierem, cria também o `CustoPreco`
(ver §3). Confere duplicidade de `[fonte, codigo]` antes, mesmo padrão de `criarComposicaoPropria`.

**Action** (`composicoes/actions.ts`) — novo `criarInsumo`, mesmo formato de `criarComposicao`
(`...base`, `entidade: "CustoInsumo"`, `entidadeId` = id criado, `revBancos()` no final).

**`busca-banco-dialog.tsx`** — novas props `podeGerirBancos: boolean` e `basePrecoId: string | null`
(só usada quando `fonte === "insumo"`). Abaixo da lista de resultados, um link "Não encontrou? Criar
[insumo|composição] própria" (só renderiza se `podeGerirBancos`) que revela um mini-formulário:
- composição: código, descrição, unidade, grupo (opcional) → chama `criarComposicao` existente.
- insumo: código, descrição, unidade, categoria (`Select`, mesmo `CATEGORIA_LABEL` de `insumos-tab.tsx`),
  preço (só se `basePrecoId` existir — sem base escolhida no orçamento o campo some, já que o botão pai
  já fica desabilitado por `!temBasePreco` de qualquer forma) → chama `criarInsumo` novo.
- Em ambos os casos, sucesso chama `escolher({id, codigo, descricao, unidade})` automaticamente — o
  fluxo normal de "Criar"/"Vincular" segue dali, sem passo extra.

**Prop drilling do `basePrecoId`/`podeGerirBancos`**: `custos/[id]/page.tsx` já busca `orcamento` (tem
`basePrecoId`) e `podeGerir` via `can(user.role,"custos","gerir")` — soma
`can(user.role,"custos","bancos")` na mesma `Promise.all`, passa pra `orcamento-detalhe-view.tsx` →
`OrcamentoArvoreView` → as 2 instâncias de `BuscaBancoDialog` (criar e vincular).

## 5. Fora de escopo (explicitado, não esquecido)

- Atalho de hover ("+") na linha de grupo continua só-composição — usuário decidiu não mexer agora.
- Composição própria criada pela tela do orçamento nasce vazia (0 itens, custo 0) — igual ao fluxo já
  existente em `/custos/bancos`. Preencher os itens continua sendo em `/custos/composicoes/[id]`; pra
  esse custo refletir no item do orçamento depois de editada, o usuário precisa clicar "Vincular
  composição" de novo (não existe recálculo automático hoje — não é parte deste pedido).
- Nenhuma tela de "editar preço de insumo existente" — só criação com preço inicial.

## 6. Verificação

- `npx tsc --noEmit`, `npm run lint`, `npm test`.
- Smoke real na dev DB: criar insumo próprio com preço a partir do diálogo (via chamada direta às
  actions, simulando o fluxo), confirmar `CustoPreco` gravado na base certa e que `custoDoInsumo` resolve
  o valor pro orçamento em questão; confirmar duplicidade de código bloqueada; limpar linhas de teste.
- `npm run build` (checar porta 3000 livre antes).
- Sem migração de schema — nenhuma coluna nova.
