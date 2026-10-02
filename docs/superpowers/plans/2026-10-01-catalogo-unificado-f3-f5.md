# Catálogo de nomenclatura — Fases 3, 4 e 5 (lente Todas, Formatos de folha, retirada, verificação) — Plano

> **Para quem executa:** superpowers:executing-plans (inline). **Modelo: Sonnet** (spec §0: F3, F4 e F5).
> Passos com `- [ ]`. Plano enxuto, como o da F2: fixa arquivos, contratos (assinaturas), regras e
> casos de teste; o código segue os vizinhos e o mockup aprovado.

**Goal:** A tela "Disciplinas e nomenclatura" ganha a lente **Todas as versões** (o cadastro inteiro,
com arquivados, ordem, lote) e a aba **Formatos de folha**; as telas antigas Disciplinas e Lista
Mestre saem (redirecionam) e o código morto vai embora; tudo verificado de ponta a ponta.

**Architecture:** Uma regra pura nova (`catalogo/todas.ts`: fotografia "todas as versões" a partir do
mesmo `CatalogoSnap`) + um descritor de menu puro para a lente (`itensDaLinhaTodas`). A rota
`[lente]` aceita `todas`. A tela nova reaproveita o lápis da F2 (extraído para um hook) e o lote
(`useSelecao`/`useLote`/`BarraSelecao`) da tela Disciplinas de hoje. Na F4, redirecionamentos,
guarda de links e remoção do que ficou sem chamador; a A2 passa a valer também no servidor.

**Tech Stack:** Next 15 / React 19, Prisma 7, Zod, vitest (node), shadcn sobre base-ui.

**Spec:** [2026-09-30-catalogo-nomenclatura-unificado.md](../specs/2026-09-30-catalogo-nomenclatura-unificado.md) —
F3: E2, E7, E8, E11, §4.3, §4.6, A3. F4: §6, A2, A5. F5: §7 F5, A1–A6. (E12, a rota de versões, já
saiu na F2.) **Mockup (contrato):** artifact `2YtpNHYrCbRPNLDJ8mQRMR`, board **"Lente Todas as
versões — o cadastro"**; cópia local em
`C:\Users\Admin\AppData\Local\Temp\claude\c--SENA-ADM-SENAHUB-SENAHub-remake-vscode\90986d54-1fc6-40a9-9a33-952c0856b4b7\scratchpad\mock-catalogo\project\Todas.dc.html`
(abrir no Chrome para conferir).

**Desvios do mockup aprovados pelo dono antes da execução** (ver a seção "Decisões" no fim; se
alguma não estiver marcada como aprovada, PARAR e perguntar).

## Global Constraints
- Commits Conventional em pt-BR, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage arquivo a arquivo (nunca `git add -A`); `git show --stat` depois.
- Toda mutação por `defineAction` (+ `capturarAntes`); erro de negócio = `ActionError`; arquivo `"use server"` só exporta funções async.
- Sem `Promise.all` em transação. Regras puras em arquivo sem Prisma/Next/React, com teste.
- shadcn sobre base-ui (`render=`, nunca `asChild`); `Select.onValueChange` recebe `string | null`; componente de linha no nível do arquivo (ADR-0002); `await confirm()` antes de `startTransition`; nada de `contextmenu` à mão.
- Menu de contexto (ADR-0002): o MESMO array alimenta `LinhaComMenu`, `BotaoAcoes` e `BarraSelecao`; ação proibida pelo perfil é omitida; proibida pelo estado fica desabilitada com a frase do `ActionError` do servidor; linha com uma ação só vira botão (`acaoUnica`).
- `CabecalhoPagina` é o 1º elemento; descrição curta, sem link; filas de botões com `flex-wrap`. Tela pronta só com `scrollWidth` = 390 em 390×844 e cabeçalho sem sobrepor a barra em 1366×768 com o menu **aberto**.
- Permissões não mudam (E10): cadastro do card em `projetos:gerir` (`catalogoBase`); subs, fases/tipos, folhas e operações de versão em `configuracoes:gerir`; a página abre com `configuracoes:disciplinas` **ou** `configuracoes:gerir`. Sem par novo, sem `db:seed`, sem migração.
- UI em pt-BR. Banco/.env: `DOTENV_CONFIG_PATH=../SENAHub-remake-vscode/.env` (nunca copiar o `.env`); build com `NODE_ENV=production` na frente e `rm -rf .next` antes; dev em :3002 (`AUTH_COOKIE_PREFIX=senahub-catalogo`). Nunca build com dev no ar.
- Login de teste: `claude.admin@dev.senahub` / `ClaudeDev@2026` (admin) e `helena@demo.senahub` / `Demo@2026` (supervisor: tem `projetos:gerir`, não tem `configuracoes:gerir`), pela API `fetch('/api/auth/sign-in/email')`.

## Review Focus
1. Sub com faixa maior que a do card-mãe (sub "v1 em diante" num card "só v1"): a lente Todas mostra a faixa **efetiva** ("só v1"), igual às lentes vN. → teste em Task 1 (A3).
2. Card arquivado com "Arquivadas" desligado some **com as subs**; lote misto (card + sub) arquiva cada um pelo seu caminho e o relatório nomeia os que falharam. → teste de `filtrarTodas` (Task 1) + conferência em navegador (Task 6).
3. "+ Disciplina" na lente Todas: a prévia de conflito usa a versão **escolhida** no diálogo e se refaz quando ela muda. → conferência em navegador (Task 6), com ESG.
4. Excluir sub/fase em uso: item inerte com a frase igual à do servidor; com a tela velha, o servidor recusa com a mesma frase. → testes das frases (Task 1) e do descritor (Task 2); servidor usa a mesma função (Task 3).
5. Links antigos e favoritos (`/configuracoes/disciplinas`, `/configuracoes/lista-mestre`) redirecionam sem laço (inclusive sem versão cadastrada), e nenhum link interno aponta para eles. → guarda de links (Task 7) + navegador (Task 9).

## Mapa de arquivos
| Arquivo | Papel | Task |
|---|---|---|
| `src/modules/projetos/nomenclatura/catalogo/todas.ts` (+test) | `catalogoTodasVersoes`, `rotuloExisteEm`, `versaoParaAbrir`, `filtrarTodas`, `filtrarLinhasTodas`, frases de "em uso" (puros) | 1 |
| `src/modules/projetos/nomenclatura/catalogo/apresentacao.ts` | `agruparCards` genérico | 1 |
| `src/modules/projetos/nomenclatura/catalogo/acoes.ts` (+test) | `itensDaLinhaTodas`, `itensDoLoteTodas` | 2 |
| `src/modules/projetos/subdisciplinas/actions.ts`, `pranchas/catalogo-actions.ts`, `projetos/actions.ts` | `definirAtivoSubdisciplina`, `definirAtivoItemListaMestre`; frases compartilhadas | 3 |
| `src/modules/projetos/nomenclatura/catalogo/queries.ts` | `usoDoCatalogo` | 3 |
| `src/app/(dashboard)/configuracoes/nomenclatura/[lente]/page.tsx`, `nomenclatura/acesso.ts` | lente `todas`, aba `folhas` | 4 |
| `src/components/configuracoes/catalogo/{seletor-versao,adicionar-item-dialog}.tsx`, `lista-mestre-config-view.tsx` | seletor → `/todas`; versão no diálogo; folha só | 4 |
| `src/components/configuracoes/catalogo/{use-lapis,linha-todas,historico-siglas-dialog,renomear-categoria-dialog}.tsx`, `catalogo-todas-view.tsx`, `catalogo-versao-view.tsx` | tela | 5 |
| `docs/manual/…` | manual | 6, 8 |
| `src/app/(dashboard)/configuracoes/{disciplinas,lista-mestre}/page.tsx`, `configuracoes/page.tsx`, `nomenclatura/versoes/page.tsx` | redirecionamentos, índice, regras globais | 7 |
| `src/modules/projetos/nomenclatura/catalogo/rotas-antigas.test.ts` | guarda de links (A5) | 7 |
| telas/diálogos/actions sem chamador | remoção; A2 no servidor | 8 |

---

## F3 — Lente "Todas as versões" e aba "Formatos de folha"

### Task 1: Regras puras da lente Todas
**Files:** criar `catalogo/todas.ts` + `todas.test.ts`; modificar `catalogo/apresentacao.ts` (só a assinatura de `agruparCards`).

**Contratos** (`todas.ts`, puro, client-safe; importa só de `./versao` e `@/modules/uploads/nomenclatura/siglas-versao`):
```ts
export type SiglaNaFaixa = {
  sigla: string;
  oficial: boolean;
  faixa: FaixaVersao;          // efetiva: linha ∩ faixa efetiva do item
  rotulo: string | null;       // rotuloExisteEm(faixa) só quando difere da faixa do item; senão null
};
export type LinhaTodas = {
  alvo: AlvoCatalogo;
  nome: string;
  ativo: boolean;              // o próprio item (sub: a sub; o card-mãe arquivado esconde a sub pelo filtro)
  faixa: FaixaVersao | null;   // efetiva: item ∩ card-mãe (sub); null = não vale em versão nenhuma
  existeEm: string;            // rotuloExisteEm(faixa)
  versoes: number[];           // números cadastrados em que a faixa efetiva vale (ignora `ativo`)
  siglas: SiglaNaFaixa[];      // ordem: versaoDesde asc → oficial antes de sinônimo → sigla
};
export type CardTodas = LinhaTodas & { categoria: string | null; subs: LinhaTodas[] };
export type CatalogoTodas = { cards: CardTodas[]; fases: LinhaTodas[]; tipos: LinhaTodas[] };

export function rotuloExisteEm(faixa: FaixaVersao | null): string;
export function catalogoTodasVersoes(snap: CatalogoSnap, numeros: readonly number[]): CatalogoTodas;
export function versaoParaAbrir(linha: Pick<LinhaTodas, "versoes">, numeros: readonly number[]): number;
export function filtrarTodas(cards: CardTodas[], f: { busca: string; categoria: string | null; arquivadas: boolean }): CardTodas[];
export function filtrarLinhasTodas(linhas: LinhaTodas[], f: { busca: string; arquivadas: boolean }): LinhaTodas[];
export function fraseCardEmUso(projetos: number): string;
export function fraseSubEmUso(documentos: number): string;
export function fraseFaseEmUso(etapas: number): string;
```
Regras:
- `rotuloExisteEm`: `{1,null}` → "v1 em diante"; `{2,null}` → "a partir da v2"; `{1,1}` → "só v1"; `{1,2}` → "até a v2"; `{2,3}` → "da v2 à v3"; `null` → "em nenhuma versão". (Textos do mockup; `rotuloFaixa` de `siglas-versao.ts` não muda, é de outras telas.)
- Ordem de cards, subs e itens: a mesma de `catalogoNaVersao` (`ordem`, depois `nome` pt-BR). Arquivados entram.
- Sigla cuja faixa efetiva dá vazio (linha toda fora da faixa do item) não aparece.
- `versaoParaAbrir`: maior número de `linha.versoes`; vazio → maior de `numeros` (sem versões → 1).
- `filtrarTodas`: `busca` sem acento/caixa casa nome, qualquer `siglas[].sigla` e a categoria; o card aparece se ele ou alguma sub casar; subs mostradas = as que casam (todas, se o card casa). `arquivadas: false` esconde card arquivado (com as subs) e sub arquivada. `categoria`: `null` = todas; `"Outras"` (`SEM_CATEGORIA`) casa card sem categoria.
- `filtrarLinhasTodas`: mesma busca (nome + siglas) e mesmo corte de arquivados.
- Frases (iguais às do servidor, que passa a usá-las na Task 3):
  - `fraseCardEmUso(4)` = "Em uso em 4 projetos — arquive em vez de excluir." (1 → "1 projeto")
  - `fraseSubEmUso(3)` = "Em uso em 3 documentos — arquive em vez de excluir." (1 → "1 documento")
  - `fraseFaseEmUso(2)` = "Usada por 2 etapas de disciplina — arquive em vez de excluir." (1 → "1 etapa")
- `agruparCards` vira genérica: `agruparCards<T extends { categoria: string | null }>(cards: readonly T[]): { categoria: string; cards: T[] }[]` — mesmo comportamento (os testes de hoje seguem verdes).

**Casos de teste** (`todas.test.ts`; montar o snap à mão, como `versao.test.ts`):
1. `rotuloExisteEm`: os seis casos acima.
2. Sub "v1 em diante" num card "só v1" → `faixa {1,1}`, `existeEm` "só v1", `versoes [1]` (com `numeros [1,2]`).
3. Siglas de Hidrossanitário (card `{1,null}`): HID oficial `{1,null}`, HDR sinônimo `{1,null}`, ESG sinônimo `{1,1}` → `[HID(rotulo null), HDR(null), ESG("só v1")]`. Orçamento: ORÇ oficial `{1,1}` + ORC oficial `{2,null}` → rótulos "só v1" e "a partir da v2".
4. Linha `{3,null}` num item `{1,2}` → fora de `siglas`.
5. Card arquivado aparece com `ativo: false`.
6. **A3**: com um snap de ≥ 6 itens (card só v1, card a partir da v2, sub a partir da v2 em card v1+, sub v1+ em card só v1, fase, tipo, um card arquivado e uma sub arquivada), para cada `n` de `[1,2,3]`: o conjunto de `chaveAlvo` de `catalogoNaVersao(snap, n)` (cards + subs + fases + tipos) é igual ao conjunto dos itens ativos (sub: sub **e** card ativos) com `n` em `linha.versoes`.
7. `versaoParaAbrir`: `versoes [1,2]` → 2; `versoes []` com `numeros [1,2,3]` → 3.
8. `filtrarTodas`: busca "hdr" acha Hidrossanitário; busca pelo nome de uma sub mostra o card só com ela; `arquivadas: false` esconde card arquivado e sub arquivada; `categoria: "Outras"` pega card sem categoria.
9. Frases: os seis valores acima (plural e singular).

**Passos:**
- [ ] Escrever `todas.test.ts` com os casos 1–9.
- [ ] Rodar `npx vitest run src/modules/projetos/nomenclatura/catalogo/todas.test.ts` → FALHA (módulo não existe).
- [ ] Implementar `todas.ts` e tornar `agruparCards` genérica.
- [ ] Rodar `npx vitest run src/modules/projetos/nomenclatura/catalogo/` → tudo PASSA.
- [ ] Commit `feat(nomenclatura): regras puras da lente Todas (faixa efetiva, siglas por faixa, filtro)`.

### Task 2: Descritor de menu da lente Todas
**Files:** `catalogo/acoes.ts` + `acoes.test.ts`.

**Contratos:**
```ts
export const ACAO_ABRIR_NA_VERSAO = "abrir-na-versao";
// reaproveita de "@/modules/projetos/acoes-catalogo-disciplina": ACAO_SUBIR, ACAO_DESCER,
// ACAO_ARQUIVAR, ACAO_DESARQUIVAR, ACAO_EXCLUIR, MOTIVO_LIMPAR_BUSCA, MOTIVO_PRIMEIRA,
// MOTIVO_ULTIMA, ACAO_LOTE_*; e daqui: ACAO_EDITAR.
export type ContextoLinhaTodas = {
  podeGerir: boolean;
  podeEditarCard: boolean;
  versaoAbrir: number;
  uso: number;                 // card: projetos; sub: documentos; fase: etapas; tipo: 0
  reordenar?: { pode: boolean; temCima: boolean; temBaixo: boolean }; // só card
};
export function itensDaLinhaTodas(linha: { alvo: AlvoCatalogo; ativo: boolean }, ctx: ContextoLinhaTodas): AcaoItem[];
export function itensDoLoteTodas(selecionadas: readonly { ativo: boolean; uso: number }[]): AcaoItem[]; // = itensDeLoteDisciplinas, substantivo neutro
```
Regras (ordem e rótulos do mockup):
- **Card** com `podeEditarCard`: "Editar cadastro…" (`editar`) · "Abrir na v{n}" · separador · "Subir" · "Descer" · separador · "Arquivar" ou "Desarquivar" · "Excluir" (destrutivo; `desabilitado: fraseCardEmUso(uso)` se `uso > 0`). Subir/Descer desabilitados com `MOTIVO_LIMPAR_BUSCA` se `!reordenar.pode`, `MOTIVO_PRIMEIRA`/`MOTIVO_ULTIMA` sem vizinho.
- **Sub**, **fase** e **tipo** com `podeGerir`: "Editar cadastro…" · "Abrir na v{n}" · separador · "Arquivar"/"Desarquivar" · "Excluir" (sub: `fraseSubEmUso(uso)`; fase: `fraseFaseEmUso(uso)` se `uso > 0`).
- Sem a permissão do tipo: só "Abrir na v{n}" (ler não exige escrita) → vira botão por `acaoUnica`.
- Nunca "Siglas nesta versão" nem "Tirar da vN" na lente Todas (E8; A2).
- Excluir sem `confirmar` no descritor: a tela confirma (como hoje em Disciplinas).

**Casos de teste** (acrescentar em `acoes.test.ts`): ids na ordem certa para card/sub/fase com permissão; card `uso 4` → Excluir desabilitado com a frase exata, `uso 1` no singular; card inativo → `desarquivar`; card sem `podeEditarCard` → só `abrir-na-versao` e `acaoUnica` devolve ele; reordenar (`pode: false` → os dois com `MOTIVO_LIMPAR_BUSCA`; `temCima: false` → Subir com `MOTIVO_PRIMEIRA`); sub `uso 3` e fase `uso 2` com as frases; sub sem `podeGerir` → só abrir; nenhum item com id `siglas` ou `tirar` em nenhum caso; rótulo "Abrir na v2" com `versaoAbrir: 2`.

**Passos:** testes → ver falhar → implementar → `npx vitest run src/modules/projetos/nomenclatura/catalogo/acoes.test.ts` verde → commit `feat(nomenclatura): menu da lente Todas (abrir na versão, ordem, arquivar, excluir)`.

### Task 3: Actions e consultas da lente Todas
**Files:** `subdisciplinas/actions.ts`, `pranchas/catalogo-actions.ts`, `projetos/actions.ts`, `catalogo/queries.ts`.

- `definirAtivoSubdisciplina({ id, ativo: boolean })` — `configuracoes:gerir` (`base`), `entidade: "SubdisciplinaCatalogo"`, `capturarAntes`; atualiza **só** `ativo`; `rev()`.
- `definirAtivoItemListaMestre({ id, ativo: boolean })` — `configuracoes:gerir`, `capturarAntes`; só item global (`projetoId = null`) de categoria fase/tipo, senão `ActionError("Item da Lista Mestre não encontrado.")`; atualiza **só** `ativo`. (Arquivar de card segue `arquivarDisciplinaCatalogo`, que alterna.)
- Frases compartilhadas: `excluirDisciplinaCatalogo` usa `fraseCardEmUso(uso)`; `excluirSubdisciplina` usa `fraseSubEmUso(uso)`; `excluirCatalogoPrancha` usa `fraseFaseEmUso(emUso)` (import de `@/modules/projetos/nomenclatura/catalogo/todas`).
- `usoDoCatalogo(): Promise<{ subs: Record<string, number>; fases: Record<string, number> }>` em `catalogo/queries.ts`: `documentoDisciplina.groupBy({ by: ["subdisciplinaId"], where: { subdisciplinaId: { not: null } }, _count: { _all: true } })` e `disciplinaEtapa.groupBy({ by: ["etapaId"], _count: { _all: true } })` (consultas em sequência).

**Passos:** implementar → `npx tsc --noEmit` + `npm run lint` limpos → `npx vitest run src/modules/projetos` verde → commit `feat(nomenclatura): arquivar sub/fase/tipo sem mexer em sigla e frases de "em uso" compartilhadas`. (I/O conferido em navegador na Task 6.)

### Task 4: Rota `todas`, aba `folhas`, seletor e versão no "+ Adicionar"
**Files:** `[lente]/page.tsx`, `nomenclatura/acesso.ts`, `catalogo/seletor-versao.tsx`, `catalogo/adicionar-item-dialog.tsx`, `lista-mestre-config-view.tsx`, `catalogo-versao-view.tsx` (só a aba nova e o seletor).

- `[lente]`: `"todas"` → lente Todas; número ≥ 1 cadastrado → lente vN (como hoje); outro valor → `notFound()`. `ABAS = ["disciplinas", "fases", "tipos", "folhas"]`; `folhas` sem `podeGerir` cai em `disciplinas`.
- Dados da lente Todas: `listarVersoesAdmin()`, `carregarCatalogoSnap()`, `catalogoDisciplinasAdmin()` (mapa `cadastro` igual ao da vN, que já leva `uso`), `usoDoCatalogo()`, `catalogoTodasVersoes(snap, numeros)`. Aba `folhas` (as duas lentes): `catalogosPranchaConfig(null)` filtrado `categoria === "folha"`.
- `exigirAcessoNomenclatura`: sai `podeVerCadastro` (a lente Todas está dentro da página; quem abre a página abre a lente). Tirar todos os usos (`grep -rn "podeVerCadastro\|mostrarTodas" src`).
- `SeletorVersao`: `atual: number | "todas"`; "Todas as versões" → `/configuracoes/nomenclatura/todas` (+ `?aba=` como hoje); sempre visível.
- `AdicionarItemDialog`: prop opcional `opcoesVersao?: OpcaoVersao[]`. Com ela, mostra "Vale a partir da" (`Select`, padrão = a mais nova, `opcoesVersao[0]`), e a prévia de conflito (`usePlanoTransferencia`) roda com a versão escolhida; `onSalvar(operacao, transferencias, versao)` (a lente vN passa a própria versão).
- `ListaMestreConfigView`: prop `categorias?: ("fase" | "tipo" | "folha")[]` (padrão: as três); com uma só, sem `lg:grid-cols-3`.
- Aba "Formatos de folha" (E11), nas duas lentes: esconde seletor de versão, faixa de aviso, contagem e busca; mostra `<ListaMestreConfigView catalogos={folhas} categorias={["folha"]} />` (sem `versoes`: sem nada de versão). Rótulo da aba: "Formatos de folha". Sem `podeGerir`, a aba não aparece.
- O "+" do cabeçalho some na aba Formatos de folha (o formulário é o da própria seção).

**Passos:** implementar → `npx tsc --noEmit` + lint → navegar `/configuracoes/nomenclatura/2?aba=folhas` e `/configuracoes/nomenclatura/abc` (404) em dev → commit `feat(nomenclatura): rota da lente Todas, aba Formatos de folha e versão escolhida ao adicionar`.

### Task 5: Tela da lente Todas (segue o mockup)
**Files:** criar `catalogo/use-lapis.tsx`, `catalogo/linha-todas.tsx`, `catalogo/historico-siglas-dialog.tsx`, `catalogo/renomear-categoria-dialog.tsx`, `catalogo-todas-view.tsx`; modificar `catalogo-versao-view.tsx`.

- **`useLapis`** (extrair da lente vN, sem mudar o comportamento): recebe `{ cadastro, categorias, versoes }`, devolve `{ abrir(linha: { alvo; nome }), dialogo: ReactNode, pending }`; leva junto a leitura do SVG sob demanda com a guarda de resposta atrasada (`pedidoAtual` + `setDialogo(atual => atual ?? …)`) e `gravarCadastro`. A lente vN passa a usar o hook (conferir que o lápis da v2 segue igual).
- **`RenomearCategoriaDialog`**: mover de `disciplinas-catalogo-view.tsx` como está (`renomearCategoriaDisciplinas`).
- **`HistoricoSiglasDialog`** (só leitura; substitui "Siglas por versão" — §4.3): título "Siglas de {nome} — todas as versões"; uma linha por `SiglaNaFaixa`: selo (`SiglaOficial`/`SiglaSinonimo`), "oficial"/"sinônimo", `rotuloExisteEm(faixa)`; rodapé "Siglas mudam dentro de uma versão." com link "abrir a v{versaoParaAbrir}".
- **`LinhaTodasItem`** (nível do arquivo): caixa de seleção (`aria-label` "Selecionar {nome}" / "Selecionar {nome}, sub de {card}") só se a linha tem Arquivar/Excluir no menu · nome (card em negrito; "arquivada" em selo quando `!ativo`) · CARD/SUB · `existeEm` · siglas (botão que abre o histórico; sinônimo tracejado; `rotulo` ao lado do selo quando houver) · em uso ("{n} proj." no card; "—" quando 0 e nas subs) · `⋯` (`BotaoAcoes`, `aria-label` "Ações de {nome}" / "Ações de {nome}, sub de {card}") ou o botão da ação única. `LinhaComMenu` com o mesmo array. Desktop: grade `28px minmax(0,1fr) 44px 130px minmax(0,320px) 72px 40px` (mockup); celular: quebra como a linha da lente vN.
- **`CatalogoTodasView`**:
  - Cabeçalho (1º elemento): "Disciplinas e nomenclatura", mesma descrição e trilha da lente vN; ações "+ Disciplina"/"+ Fase"/"+ Tipo" (segue a aba; só com `podeGerir`) e "Versões" (link, só com `podeGerir`).
  - Depois: `SeletorVersao atual="todas"`; abas Disciplinas · Fases · Tipos de documento · Formatos de folha; faixa "Aqui fica o cadastro: nome, ícone, categoria, ordem, arquivar. Siglas e o que entra em cada versão mudam dentro da versão — abrir a v{mais nova}." (link na última parte).
  - Barra: busca ("Buscar nome ou sigla"), categoria (só aba Disciplinas; "Todas as categorias" + categorias + "Outras" se houver), interruptor "Arquivadas ({n})", `BotaoSelecionados`; `DicaMenuContexto`.
  - Aba Disciplinas: cabeçalho de colunas DISCIPLINA · EXISTE EM · SIGLAS (TODAS AS VERSÕES) · EM USO; grupos por categoria (`agruparCards`), título do grupo com o lápis "Renomear categoria" (só `podeEditarCard`, não em "Outras"); card e **todas** as subs dele como linhas (decisão D1).
  - Fases / Tipos: mesma linha, sem CARD/SUB, sem lote, sem "em uso" no tipo (fase mostra "{n} etapas" quando > 0).
  - Ações: Editar → `useLapis().abrir`; Abrir na vN → `router.push("/configuracoes/nomenclatura/{n}" + (fase/tipo ? "?aba=fases|tipos" : ""))`; Subir/Descer → `moverDisciplinaCatalogo` (`reordenar.pode` = sem busca e sem "só selecionados"; vizinhos = linhas visíveis do mesmo grupo); Arquivar/Desarquivar → card `arquivarDisciplinaCatalogo`, sub `definirAtivoSubdisciplina`, fase/tipo `definirAtivoItemListaMestre`; Excluir → `confirm` destrutivo ("Excluir “{nome}”? … não pode ser desfeita.") **antes** do `start`, depois `excluirDisciplinaCatalogo` / `excluirSubdisciplina` / `excluirCatalogoPrancha`.
  - Lote (só aba Disciplinas; cards e subs): `useSelecao` com `chaveAlvo`, `useLote`, `BarraSelecao` com `itensDoLoteTodas`; arquivar/desarquivar só os que estão no estado de partida; excluir só os de `uso = 0`, cada um pela action do seu tipo (cap 100, relatório de falha parcial — o `useLote` já faz). Menu da linha marcada com ≥ 2 selecionados = itens do lote (como em Disciplinas hoje).
  - "+ Disciplina/Fase/Tipo": `AdicionarItemDialog` com `opcoesVersao` → `alterarCatalogoNaVersao({ versao, operacoes, transferencias })`; toast como na lente vN.
  - Rodapé: "{n} disciplinas ativas · {m} arquivadas (ocultas). Selecione várias para arquivar ou excluir de uma vez." ("(ocultas)" só com o interruptor desligado).
  - Estados: lista vazia → `EmptyState` ("Nada encontrado — ajuste a busca ou os filtros." / "Nenhuma disciplina no cadastro.").

**Passos:** extrair `useLapis` e conferir a lente vN (lápis de card com SVG, sub e fase) → criar os componentes → `npx tsc --noEmit` + lint → commit `feat(nomenclatura): lente Todas as versões (cadastro, histórico de siglas, ordem, lote)`.

### Task 6: Manual e conferência da F3
- Manual `docs/manual/sistema/configuracoes.md`: seção da tela única ganha "Lente **Todas as versões**" (o que mostra, Existe em, siglas com faixa, histórico, ordem, arquivar/excluir, lote, renomear categoria, "+ Disciplina" pergunta a versão) e "Aba **Formatos de folha**". `novidades.md`: entrada nova. `search-index.json`: palavras-chave "todas as versões", "formatos de folha", "arquivar disciplina", "histórico de siglas".
- Conferência em navegador (dev :3002, script no scratchpad; dados descartáveis "ZZ …" removidos no fim):
  1. `/configuracoes/nomenclatura/todas`: Hidrossanitário com "v1 em diante" e ESG "só v1" (se o banco de dev tiver o caso; senão um card montado pelo script); sub de card "só v1" com "só v1".
  2. Interruptor Arquivadas: card arquivado some com as subs.
  3. "+ Disciplina" com versão v1 e sigla ESG → aviso de conflito com Hidrossanitário na v1; trocar para v2 → aviso refeito para a v2.
  4. Excluir sub em uso: item inerte com a frase; card sem uso: confirma e exclui.
  5. Subir/Descer muda a ordem e a lente v2 reflete.
  6. Lote: marcar 1 card + 1 sub descartáveis → Arquivar → os dois arquivados.
  7. Supervisor (helena): sem caixas de seleção em subs; aba Formatos de folha oculta; card com lápis, Subir/Descer, Arquivar.
  8. `?aba=folhas`: sem seletor de versão; adicionar e excluir um formato descartável.
  9. 390×844: `scrollWidth` 390 em `/todas` (Disciplinas e Fases) e `?aba=folhas`; 1366×768 com menu aberto: cabeçalho sem sobrepor a barra.
- `npm run lint`, `npx vitest run`, build (`rm -rf .next`, `NODE_ENV=production`) verdes.
- Commit `docs(manual): lente Todas as versões e aba Formatos de folha`.

---

## F4 — Retirada das telas antigas

### Task 7: Redirecionamentos, índice de Configurações, regras globais e guarda de links (A5)
**Files:** `configuracoes/disciplinas/page.tsx`, `configuracoes/lista-mestre/page.tsx`, `configuracoes/page.tsx`, `nomenclatura/versoes/page.tsx`, criar `catalogo/rotas-antigas.test.ts`, e os arquivos com `revalidatePath`/comentários apontando para as rotas antigas.

- `/configuracoes/disciplinas` → `permanentRedirect("/configuracoes/nomenclatura/todas")`.
- `/configuracoes/lista-mestre` → `permanentRedirect("/configuracoes/nomenclatura/{maior número}?aba=fases")`; sem versão cadastrada → `/configuracoes/nomenclatura/todas?aba=fases` (nunca a raiz, que redireciona de novo).
- Índice de Configurações: saem os cartões "Disciplinas" e "Lista Mestre"; fica "Disciplinas e nomenclatura" (conferir que o cartão aparece para quem tem `configuracoes:disciplinas` **ou** `configuracoes:gerir`).
- Regras globais de nomenclatura (`NomenclaturaForm escopo="global"`, "exigir nomenclatura/fase", hoje só na página Lista Mestre) vão para `/configuracoes/nomenclatura/versoes`, num bloco depois da lista de versões (decisão D3), com `nomenclaturaGlobal()`.
- `revalidatePath("/configuracoes/disciplinas")` e `("/configuracoes/lista-mestre")` saem (o `revalidatePath("/configuracoes/nomenclatura", "layout")` já cobre); comentário de `chat-view.tsx` passa a citar "Disciplinas e nomenclatura".
- **Guarda** `rotas-antigas.test.ts` (no padrão de `src/lib/promise-all-em-transacao.test.ts`): varre `src/**/*.{ts,tsx}` e falha se achar `"/configuracoes/disciplinas"` ou `"/configuracoes/lista-mestre"` em qualquer arquivo fora das duas páginas de redirecionamento (que não contêm o texto).

**Passos:** escrever a guarda → ver falhar (links de hoje) → corrigir → guarda verde → lint/tsc → commit `feat(nomenclatura): telas Disciplinas e Lista Mestre redirecionam para a tela única`.

### Task 8: Remoção do que ficou sem chamador; A2 no servidor; manual
**Files:** os listados abaixo; manual.

- Apagar (conferir com `grep -rn` em `src` e `scripts` antes de cada um; o que ainda tiver chamador fica e vira linha no ledger):
  - `components/configuracoes/disciplinas-catalogo-view.tsx`, `subdisciplinas-dialog.tsx`, `siglas-versao-dialog.tsx`, `validade-versao-campos.tsx` (e testes deles, se houver);
  - actions `criarDisciplinaCatalogo`, `editarDisciplinaCatalogo` (manter `criarDisciplinaCatalogoSchema` se `editarCadastroDisciplinaSchema` deriva dele), `criarSubdisciplina`, `editarSubdisciplina`, `listarSubdisciplinasAction` (+ `subdisciplinasDoCard`, se ficar sem uso), `criarSiglaVersao`, `encerrarSiglaVersao`, `reabrirSiglaVersao`, `excluirSiglaVersao` (+ o que de `siglas-actions.ts` ficar sem uso); `acoes-catalogo-disciplina.ts` só perde o que ficar sem import (as constantes seguem em uso pelo descritor da Task 2).
- `ListaMestreConfigView`: sai o modo global com versão (prop `versoes`, filtro "Válido na vN", "Vale a partir da", `SiglasVersaoDialog`, `ValidadeVersaoCampos`); ficam o modo de projeto (`nomenclatura-projeto-dialog.tsx`, que não muda — E11) e a aba Formatos de folha.
- **A2 no servidor:** `criarCatalogoPrancha` e `editarCatalogoPrancha` perdem `versaoDesde`/`versaoAte` do schema (a faixa fica como está gravada; criação = `{1, null}`); `criarCatalogoPrancha` global só aceita `folha` — fase/tipo global → `ActionError("Fase e tipo do catálogo se criam numa versão, em Disciplinas e nomenclatura.")`.
- `decidirSiglasAoSalvar`/`espelharSiglasDasColunas` ficam (itens do projeto e folhas).
- Manual: `configuracoes.md` (índice sem "Disciplinas" e "Lista Mestre" separados; sai "Pelas telas de catálogo…"; fica só a tela única), `projetos.md` (~l. 349, telas antigas), `novidades.md` (entrada da retirada), `search-index.json` (tirar "vale a partir da"/"siglas por versão" das páginas que não falam mais disso).

**Passos:** remover arquivo a arquivo com grep → `npx tsc --noEmit` + lint + `npx vitest run` verdes → commit `refactor(nomenclatura): remove telas e actions antigas do catálogo; faixa só muda na versão` → commit `docs(manual): catálogo só na tela Disciplinas e nomenclatura`.

---

## F5 — Verificação

### Task 9: Ponta a ponta e revisão final
- `npm run smoke:catalogo-nomenclatura` (A1, A4) com `DOTENV_CONFIG_PATH`; `npm run lint`; `npx vitest run` (inclui A3 e a guarda A5); build.
- Navegador (dev :3002, só leitura onde der):
  - A2: em nenhuma tela do catálogo existe campo "Vale a partir da/Até a", "Código" ou "Sinônimos" fora da lente vN (o "Vale a partir da" do "+ Adicionar" da lente Todas escolhe onde o item **nasce**, não muda faixa).
  - A5: `/configuracoes/disciplinas` → `/configuracoes/nomenclatura/todas`; `/configuracoes/lista-mestre` → `/configuracoes/nomenclatura/{n}?aba=fases`; índice de Configurações com um cartão só.
  - A6: `scrollWidth` = 390 em 390×844 para `/2`, `/2?aba=fases`, `/todas`, `/todas?aba=tipos`, `/todas?aba=folhas`, `/versoes`; 1366×768 com menu aberto em `/2` e `/todas`.
  - Regras globais (exigir nomenclatura/fase) salvam em `/versoes`.
- Revisão final do branch inteiro por um revisor novo no modelo mais capaz (executing-plans, "Final Review"); corrigir Critical/Important com teste que falha antes.
- Atualizar a memória `catalogo-nomenclatura-unificado.md` e o MEMORY.md.

---

## Decisões (desvios do mockup e lacunas da spec) — aprovar antes de executar
- **D1 — Subs todas em linha.** O mockup mostra duas subs de Hidrossanitário e resume as outras numa linha de texto ("+ Água quente, Destino final…"). Cada sub precisa do próprio menu e da própria caixa de seleção (o mockup dá isso às duas que mostra), então todas viram linha.
- **D2 — Renomear categoria.** A tela Disciplinas de hoje renomeia uma categoria inteira; o mockup não mostra onde. Proposta: lápis pequeno no título do grupo (lente Todas, quem tem `projetos:gerir`). Sem isso a função some com a tela antiga.
- **D3 — Regras globais (exigir nomenclatura/fase).** Hoje ficam só na página Lista Mestre, que sai na F4; a spec não diz para onde vão. Proposta: página Versões.
- **D4 — Frases de "em uso".** Sub e fase em uso diziam "desative"; a tela nova chama de "Arquivar". As frases do servidor passam a dizer "arquive", iguais às do menu.
- **D5 — Fases e Tipos na lente Todas** seguem a linha das disciplinas (o mockup só desenha a aba Disciplinas); lote só na aba Disciplinas.
