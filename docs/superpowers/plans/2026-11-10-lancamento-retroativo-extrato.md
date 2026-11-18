# Lançamento retroativo a partir do extrato — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deixar o importador financeiro seguro para receber o extrato do banco já categorizado pelo Claude, travar o
fechamento das folhas anteriores ao corte e entregar o roteiro + o acesso só de leitura que o Claude usa no servidor.

**Architecture:** o importador continua com o mesmo pipeline (`normalizarLinhas` puro → prévia → `executarCommit` numa
transação). Entra um módulo puro novo de validação de cadastros (`importacao/cadastros.ts`) usado pela prévia E pelo
commit, para a tela nunca aceitar o que o commit recusa. A trava da folha é uma regra pura (`rh/folha/corte.ts`) lida
por `fecharFolhaNoBanco`. O roteiro do Claude é documentação + SQL, sem código no app.

**Tech Stack:** Next 15 / React 19, Prisma 7, Zod, Vitest (node), ExcelJS, PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-11-10-lancamento-retroativo-extrato-design.md`

## Global Constraints

- Trabalhar numa branch própria `feat/lancamento-retroativo` a partir de `dev-vscode`, num worktree à parte (o worktree
  `SENAHub-remake-vscode` está com outra sessão na `feat/calculadora-cargas-demanda`). Use superpowers:using-git-worktrees.
- Código em inglês nos identificadores onde o módulo já usa; textos de tela e mensagens em pt-BR; commits Conventional em pt-BR.
- Toda Server Action continua em `defineAction`; erro que o usuário vê é `ActionError`.
- Sem `Promise.all` dentro de `$transaction`.
- Mensagens exatas (copiar como está):
  - `Categoria «X» não existe no plano de contas.`
  - `Categoria «X» é de despesa, a linha é receita.` / `Categoria «X» é de receita, a linha é despesa.`
  - `Conta «X» não existe.` · `Forma de pagamento «X» não existe.` · `Centro de custo «X» não existe.`
  - `Projeto «X» não existe.` · `Sócio «X» não encontrado.` · `Sócio «X» é ambíguo.`
  - `Contato «X» não existe e a linha não tem CPF/CNPJ válido.`
  - Folha: `A folha de MM/AAAA foi lançada no Financeiro pelo extrato. Fechar criaria as contas em dobro.`
- Chave de configuração do corte: `rh.folha.fechaNoFinanceiroDesde`, valor JSON string `"2026-10"`.
- Opção da tela: rótulo `Criar cadastros que não existirem`, **desmarcada** por padrão.
- A migração do Meu Dinheiro continua funcionando com a opção marcada (comportamento de hoje).

## Review Focus

- Planilha do Meu Dinheiro já importada antes (hash no formato antigo) importada de novo: nenhuma linha duplica.
- Duas linhas idênticas no mesmo arquivo (mesma conta, data, valor e descrição): viram dois lançamentos, e reimportar o
  arquivo não cria um terceiro.
- Categoria com o mesmo nome em pais diferentes ("Outros" em duas árvores) sem subcategoria: a linha usa o nome de topo;
  com código, o código decide. Nunca cai na categoria errada em silêncio.
- Saldo inicial de conta inexistente em modo estrito: erro na prévia, nenhuma conta criada.
- Folha de 13º de 2026 (competência 12/2026) e folhas sem a chave de configuração: fecham normalmente.

---

### Task 1: Colunas novas e chave anti-duplicata (normalização pura)

**Files:**
- Modify: `src/lib/import/mapeamento.ts` (novos `CampoSenaHub` + entradas em `CAMPOS`)
- Modify: `src/modules/financeiro/importacao/processar.ts`
- Test: `src/modules/financeiro/importacao/processar.test.ts`, `src/lib/import/mapeamento.test.ts`

**Interfaces:**
- Produces:
  - `CampoSenaHub` ganha `"projeto" | "socio" | "numeroDocumento"`. Sinônimos: projeto `["projeto", "codigo projeto",
    "obra"]`; socio `["socio", "sócio"]` (via `chaveMatch`, sem acento); numeroDocumento `["numero documento",
    "nº documento", "n documento", "documento bancario", "num doc"]`. Nenhum obrigatório. Cuidado: "documento" já é o
    CPF/CNPJ — o sinônimo exato "documento" continua lá.
  - `LinhaNorm` ganha `projetoCodigo: string`, `socioRef: string`, `numeroDocumento: string`, `hashLegado: string | null`.
  - `SaldoInicial` ganha `data: Date | null`.
  - `hash` novo (sem ID único): `"x:" + sha256(conta|dataISO|centavos|chaveMatch(descricao)|n).slice(0,32)`, onde `n` é
    a ordem (0, 1, 2…) da linha entre as que têm a mesma chave no arquivo. Pernas de transferência: mesma base com
    `:out`/`:in` (mantém `transferenciaIdDoHash`). Com ID único: `md:<id>` como hoje.
  - `hashLegado`: a fórmula antiga (`h:` + sha256 de `tipo|data|valor|descrição|categoria`; base antiga para pernas),
    só para a deduplicação; `null` quando há ID único.

- [ ] **Step 1: Testes que falham** em `processar.test.ts`:
  - `"lê projeto, sócio e nº do documento"`: colunas mapeadas → `projetoCodigo === "260031"`, `socioRef === "Lucio"`,
    `numeroDocumento === "15342466"`.
  - `"linhas idênticas no mesmo arquivo têm hashes diferentes e estáveis"`: duas linhas iguais → `hash` diferentes;
    normalizar o mesmo arquivo de novo → os mesmos dois hashes.
  - `"hash não depende da categoria"`: mesma linha com categoria A e B → mesmo `hash`, `hashLegado` diferente.
  - `"hashLegado reproduz a fórmula antiga"`: a linha do teste existente sem ID único → `hashLegado` igual ao valor
    calculado pela fórmula antiga (fixe o valor esperado rodando a função antiga antes de mudar o código).
  - `"saldo inicial guarda a data"`: linha tipo "Saldo inicial" com data `01/01/2026` → `saldosIniciais[0].data` = UTC
    2026-01-01.
  - Em `mapeamento.test.ts`: cabeçalhos `["Data", "Histórico", "Nº Documento", "Valor", "Projeto", "Sócio", "CPF/CNPJ"]`
    → `numeroDocumento` = 2, `projeto` = 4, `socio` = 5, `documento` = 6.
- [ ] **Step 2:** `npx vitest run src/modules/financeiro/importacao/processar.test.ts src/lib/import/mapeamento.test.ts` → FAIL.
- [ ] **Step 3:** implementar em `mapeamento.ts` e `processar.ts`. Atualize `contarDryRun` para tratar como duplicada a
  linha cujo `hash` OU `hashLegado` está em `ex.hashes`.
- [ ] **Step 4:** mesmo comando → PASS; `npx vitest run src/modules/financeiro/importacao` inteiro → PASS.
- [ ] **Step 5:** commit `feat(financeiro): importador lê projeto, sócio e nº do documento; chave anti-duplicata sem categoria`.

### Task 2: Validação de cadastros (pura, compartilhada por prévia e commit)

**Files:**
- Create: `src/modules/financeiro/importacao/cadastros.ts`
- Create: `src/modules/financeiro/importacao/cadastros.test.ts`

**Interfaces:**
- Consumes: `LinhaNorm`, `SaldoInicial` (Task 1); `chaveMatch` (`lib/import/valores`); `validarCpfCnpj` (`lib/documento`).
- Produces:
  ```ts
  export type CategoriaIdx = { id: string; tipo: "receita" | "despesa"; codigo: string; nomeChave: string; paiNomeChave: string | null };
  export type IndiceCadastros = {
    categorias: CategoriaIdx[];
    contas: Map<string, string>;        // chaveMatch(nome) → id
    formas: Map<string, string>;
    centros: Map<string, string>;
    projetos: Map<string, string>;      // codigo em maiúsculas → id
    socios: { id: string; nomeChave: string; emailChave: string }[];
    fornecedores: { porDoc: Map<string, string>; porNome: Map<string, string> };
    clientes: { porDoc: Map<string, string>; porNome: Map<string, string> };
  };
  export type ResolucaoLinha = {
    erros: string[];
    categoriaId: string | null;   // null = criar (só com criarCadastros)
    projetoId: string | null;
    socioId: string | null;
    criaContato: boolean;
  };
  export function resolverLinha(l: LinhaNorm, idx: IndiceCadastros, o: { criarCadastros: boolean }): ResolucaoLinha;
  export function errosDoSaldoInicial(s: SaldoInicial, idx: IndiceCadastros, o: { criarCadastros: boolean }): string[];
  ```
- Regras de `resolverLinha` (nesta ordem, mensagens da Global Constraints):
  1. Categoria: se o texto bate com um `codigo` → essa (tipo errado = erro de tipo). Senão por nome: com subcategoria,
     a filha `pai>filha`; sem, a de topo com esse nome. Existe só no outro tipo → erro de tipo (nos dois modos). Não
     existe → erro, ou `categoriaId: null` com `criarCadastros`.
  2. Conta, forma, centro: desconhecido → erro só sem `criarCadastros`.
  3. Projeto (quando preenchido): por código, sem diferenciar caixa; desconhecido → erro nos dois modos.
  4. Sócio (quando preenchido): `chaveMatch` igual ao nome, OU o nome do sócio começa com o texto (truncamento do banco),
     OU igual ao e-mail. Zero → `não encontrado`; dois ou mais → `é ambíguo`. Nos dois modos.
  5. Contato: despesa → fornecedores, receita → clientes; por documento, depois por nome. Desconhecido: com documento
     válido → `criaContato: true`; sem documento válido → erro sem `criarCadastros`, `criaContato: true` com ela.
  6. Transferência (`categoriaNome === CATEGORIA_TRANSFERENCIA`) pula a regra 1 (a categoria é a do sistema).

- [ ] **Step 1: Testes que falham** em `cadastros.test.ts`, um por regra, com um `IndiceCadastros` montado à mão:
  categoria por código `2.08`; código de despesa em linha de receita → `Categoria «2.08» é de despesa, a linha é receita.`;
  nome inexistente estrito → `Categoria «Software» não existe no plano de contas.` e com `criarCadastros` → sem erro,
  `categoriaId: null`; `"Outros"` existindo como topo e como filha de outro pai, sem subcategoria → o id do topo; conta
  desconhecida estrita → `Conta «Itaú» não existe.`; projeto `"260031"` e `"260031 "` minúsculo/maiúsculo → mesmo id,
  `"999999"` → erro mesmo com `criarCadastros`; sócio `"LUCIO HENRIQUE SENA DA SI"` contra `"Lucio Henrique Sena da
  Silva"` → id; dois sócios começando com `"Lucio"` → `Sócio «Lucio» é ambíguo.`; contato novo com CNPJ válido →
  `criaContato: true` sem erro; contato novo sem documento estrito → erro exato; `errosDoSaldoInicial` de conta
  inexistente estrito → `Conta «X» não existe.`
- [ ] **Step 2:** `npx vitest run src/modules/financeiro/importacao/cadastros.test.ts` → FAIL.
- [ ] **Step 3:** implementar `cadastros.ts` (puro: sem Prisma, sem `server-only`).
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5:** commit `feat(financeiro): validação de cadastros da importação (modo estrito)`.

### Task 3: Commit, prévia e action usando a validação

**Files:**
- Modify: `src/modules/financeiro/importacao/queries.ts` (novo `carregarIndice`)
- Modify: `src/modules/financeiro/importacao/commit-core.ts`
- Modify: `src/modules/financeiro/importacao/actions.ts`, `schemas.ts`
- Create: `scripts/smoke-importacao-extrato.ts`; Modify: `package.json` (`smoke:importacao-extrato`), `CLAUDE.md` (linha do smoke na lista de comandos)

**Interfaces:**
- Consumes: `resolverLinha`, `errosDoSaldoInicial`, `IndiceCadastros` (Task 2); `LinhaNorm.hashLegado` (Task 1).
- Produces:
  - `carregarIndice(db: PrismaClient | Prisma.TransactionClient): Promise<IndiceCadastros>` em `commit-core.ts`
    (arquivo sem `server-only`, para o smoke usar) e reexportado por `queries.ts`.
  - `hashesExistentes` passa a receber os dois hashes de cada linha.
  - `executarCommit(db, { nomeArquivo, mapeamento, res, autorId, criarCadastros: boolean })`.
  - Schemas: `validarImportSchema` e `commitImportSchema` ganham `criarCadastros: z.boolean().default(false)`.
  - `validarImportacao` devolve, além de `contagens`, `linhas: LinhaPrevia[]` com TODAS as linhas:
    `{ idx, tipo, descricao, valor, data, status, categoria, conta, contato, projeto, socio, erros, duplicada, criaCadastro }`.
    `amostra` sai.
- Comportamento:
  - Prévia e commit calculam `erros = [...l.erros, ...resolverLinha(...).erros]`; o commit recalcula sobre o banco
    dentro da transação e grava só linhas sem erro e não duplicadas.
  - `criarCadastros: false` nunca chama `create` de categoria, conta, forma ou centro; contato só com documento válido.
  - Grava `projetoId` (a coluna vence a regra; vazio deixa a regra preencher), `socioId`, `numeroDocumento`.
  - Saldo inicial com data grava `saldoInicial` e `saldoInicialEm`.
  - `exigirPeriodoAberto` continua antes da transação.

- [ ] **Step 1: Smoke que falha** `scripts/smoke-importacao-extrato.ts` (padrão de `scripts/smoke-financeiro-core.ts`:
  `check(nome, condição, detalhe)`, dados próprios com prefixo `SMOKE-EXTRATO`, limpeza no fim, ano 2041), chamando
  `normalizarLinhas` + `executarCommit` direto. Checks:
  1. extrato com projeto, sócio, nº do documento e uma transferência → lançamentos com `projetoId`, `socioId`,
     `numeroDocumento` e as duas pernas com o mesmo `transferenciaId`;
  2. modo estrito com uma categoria inexistente → essa linha não entra, as outras entram, `categoriaFinanceira.count`
     não muda;
  3. reimportar o mesmo arquivo → `lancamentosCriados` = 0 na segunda (ou erro "Nada a importar");
  4. lote gravado com hash no formato antigo (crie um lançamento com `importHash` = `hashLegado` da linha) → a linha não
     entra de novo;
  5. linha "Saldo inicial" com data → `contaBancaria.saldoInicialEm` = 2041-01-01;
  6. `criarCadastros: true` com fornecedor sem documento → fornecedor criado (comportamento antigo preservado).
- [ ] **Step 2:** `npm run smoke:importacao-extrato` → falha nos checks novos.
- [ ] **Step 3:** implementar `carregarIndice`, as mudanças em `executarCommit`, `schemas.ts` e `actions.ts`.
- [ ] **Step 4:** `npm run smoke:importacao-extrato` → todos OK; `npx vitest run src/modules/financeiro/importacao` → PASS.
- [ ] **Step 5:** commit `feat(financeiro): importação em modo estrito com projeto, sócio e saldo inicial datado`.

### Task 4: Tela do importador — opção de criar cadastros e prévia completa

**Files:**
- Modify: `src/components/financeiro/importacao/importador-view.tsx` (substitui `AmostraTabela`)

**Interfaces:**
- Consumes: `validarImportacao` / `commitImportacao` com `criarCadastros`, `LinhaPrevia[]` (Task 3).

- Checkbox `Criar cadastros que não existirem` no passo do mapeamento, desmarcado; trocar o valor refaz a prévia.
  Texto de ajuda: `Deixe desmarcado para extrato do banco. Marque só para migrar do Meu Dinheiro.`
- Tabela da prévia com todas as linhas, paginada no cliente (50 por página), filtros `Todas`, `Só com erro`,
  `Só cadastros a criar`, `Só duplicadas`; colunas Linha, Data, Descrição, Valor, Categoria, Projeto, Sócio, Situação
  (erros em texto, "Duplicada", "Cria cadastro"). A tabela rola dentro do card (`minmax(0,1fr)`, `overflow-auto`).
  Se a página ainda usa o título antigo (`text-2xl font-extrabold`), migre para `CabecalhoPagina`.
- O mapeamento manual ganha as três colunas novas automaticamente (vêm de `CAMPOS`).

- [ ] **Step 1:** implementar.
- [ ] **Step 2:** `npm run lint` (sem `--quiet`) e `npx tsc --noEmit -p tsconfig.json` → sem erros novos.
- [ ] **Step 3:** verificação em tela (protocolo de auditoria §13): `npm run dev -- -p 3001`, importar um CSV de teste
  com 120 linhas (3 com erro, 2 duplicadas), conferir paginação, filtros, opção desmarcada por padrão; a 390×844
  `document.documentElement.scrollWidth === 390`. Prints em `prints-auditoria/2026-11-10_importador-extrato/` + `LEIAME.md`.
- [ ] **Step 4:** commit `feat(financeiro): prévia completa e opção de criar cadastros no importador`.

### Task 5: Trava do corte no fechamento da folha

**Files:**
- Create: `src/modules/rh/folha/corte.ts`, `src/modules/rh/folha/corte.test.ts`
- Modify: `src/modules/rh/folha/fechamento-service.ts` (`fecharFolhaNoBanco`, logo após as checagens de status)
- Modify: `src/components/rh/folha/folha-detalhe-view.tsx` (botão "Fechar folha")
- Modify: `src/modules/rh/folha/detalhe-queries.ts` (expor o motivo)
- Create: migração `prisma/migrations/<timestamp>_corte_folha_financeiro/migration.sql`
- Modify: `scripts/smoke-folha-financeiro.ts`

**Interfaces:**
- Produces:
  - `CHAVE_CORTE_FOLHA = "rh.folha.fechaNoFinanceiroDesde"`
  - `motivoCorteFolha(competencia: string /* "YYYY-MM" */, corte: string | null): string | null` — `null` quando
    `corte` é nulo ou `competencia >= corte`; senão a mensagem exata com `MM/AAAA` da competência.
  - `lerCorteFolha(db): Promise<string | null>` em `fechamento-service.ts` (lê `ConfigSistema`; valor que não é string
    `YYYY-MM` = `null`).
- `fecharFolhaNoBanco` lança `ActionError(motivo)` com a competência de `competenciaDaFolha(folha)`. Reabrir não muda.
- A tela de detalhe recebe `motivoNaoFechar: string | null` e mostra o botão desabilitado com o texto do motivo
  (mesma frase do servidor, ADR-0002).
- Migração: `INSERT INTO config_sistema (chave, valor, "updatedAt") VALUES ('rh.folha.fechaNoFinanceiroDesde', '"2026-10"', now()) ON CONFLICT (chave) DO NOTHING;`

- [ ] **Step 1: Testes que falham** em `corte.test.ts`: `("2026-07", "2026-10")` → `"A folha de 07/2026 foi lançada no
  Financeiro pelo extrato. Fechar criaria as contas em dobro."`; `("2026-10", "2026-10")` → `null`; `("2026-12", "2026-10")`
  → `null`; `("2026-07", null)` → `null`.
- [ ] **Step 2:** `npx vitest run src/modules/rh/folha/corte.test.ts` → FAIL.
- [ ] **Step 3:** implementar `corte.ts`, `lerCorteFolha` e a chamada em `fecharFolhaNoBanco`.
- [ ] **Step 4:** no smoke, novo check: com a chave em `"2042-01"` (grave e restaure o valor original no fim), fechar uma
  folha de `ANO` (2041) é recusado com a mensagem exata e nenhuma `FolhaLancamento` nasce; com a chave restaurada, os
  checks existentes continuam passando.
- [ ] **Step 5:** `npx prisma migrate dev --name corte_folha_financeiro` no banco do worktree; `npx vitest run
  src/modules/rh/folha` e `npm run smoke:folha-financeiro` → PASS.
- [ ] **Step 6:** botão desabilitado na tela; conferir em tela a folha 07/2026 do banco de dev (crie uma se não houver).
- [ ] **Step 7:** commit `feat(rh): folha anterior ao corte não fecha no Financeiro`.

### Task 6: Roteiro do Claude e usuário só de leitura

**Files:**
- Create: `docs/financeiro/retroativo/ROTEIRO.md`
- Create: `docs/financeiro/retroativo/CLAUDE.md.modelo` (o `CLAUDE.md` da pasta de trabalho no servidor)
- Create: `docs/financeiro/retroativo/papel-leitura.sql`
- Create: `docs/financeiro/retroativo/modelo-saida.csv` (só o cabeçalho, `;` como separador se o `parseCsv` aceitar,
  senão `,`)

**Conteúdo:**
- `ROTEIRO.md` = seções 6.2 a 6.4 e 7 do spec, reescritas como instruções para um agente, mais "Como rodar":
  Claude Code (CLI ou app desktop, aba Code) no PC do servidor, numa pasta de trabalho própria (ex.:
  `D:\financeiro-retroativo\`), **nunca** aberto na pasta do app; `.env` da pasta com `LEITURA_DATABASE_URL`; consultas
  por `psql` com essa URL; planilhas de saída geradas por script Node (`exceljs`) ou CSV. O chat comum do Claude
  Desktop não serve: não roda `psql` nem gera os arquivos.
- `CLAUDE.md.modelo`: aponta para `ROTEIRO.md`, proíbe ler fora da pasta de trabalho e qualquer comando que escreva no
  banco, exige parar quando o encadeamento do saldo não bate.
- `papel-leitura.sql`: `CREATE ROLE senahub_leitura LOGIN PASSWORD :'senha'`; `ALTER ROLE ... SET
  default_transaction_read_only = on`; `GRANT CONNECT`, `GRANT USAGE ON SCHEMA public`; `CREATE VIEW leitura_usuario AS
  SELECT id, name, email FROM "user"`; `GRANT SELECT` em `lancamento`, `categoria_financeira`, `conta_bancaria`,
  `forma_pagamento`, `centro_custo`, `fornecedor`, `cliente`, `projeto`, `socio`, `leitura_usuario`,
  `regra_categorizacao`, `compromisso_recorrente`, `fechamento_mensal`, `importacao_financeira` (confira cada nome no
  `@@map` do `schema.prisma`). Nada em `account`, `session`, cofre de acessos, RH e folha.
- `modelo-saida.csv`: `Data;Descrição;Valor;Tipo;Status;Data efetiva;Categoria;Subcategoria;Conta;Conta destino;Contato;CPF/CNPJ;Projeto;Sócio;Nº documento;Observação`
  — cada cabeçalho tem que cair no campo certo pelo `autoMapear` (teste no step 2).

- [ ] **Step 1:** escrever os quatro arquivos.
- [ ] **Step 2:** teste em `mapeamento.test.ts`: os cabeçalhos de `modelo-saida.csv` → cada campo no índice esperado
  (`categoria`, `projeto`, `socio`, `numeroDocumento`, `documento`, `contaTransferencia`, `dataConfirmacao`…). Rodar → PASS.
- [ ] **Step 3:** rodar `papel-leitura.sql` no banco de dev do worktree; com o usuário novo: `SELECT count(*) FROM
  lancamento` funciona, `SELECT * FROM account` dá `permission denied`, `INSERT INTO cliente ...` dá erro de transação só
  de leitura. Registrar a saída no relatório. Depois `DROP VIEW leitura_usuario; DROP OWNED BY senahub_leitura; DROP ROLE
  senahub_leitura;` no dev.
- [ ] **Step 4:** commit `docs(financeiro): roteiro do lançamento retroativo e usuário só de leitura`.

### Task 7: Fechamento

- [ ] Atualizar `docs/manual/` (seção do importador financeiro: opção de criar cadastros, colunas novas) e o
  `CLAUDE.md` (parágrafo curto do importador: modo estrito, `cadastros.ts` é a regra única de prévia e commit, chave
  anti-duplicata com `hashLegado`; trava do corte da folha em `rh/folha/corte.ts`).
- [ ] `npm run lint`, `npm test`, `npm run build` (sem `next dev` ativo na mesma pasta), `npm run smoke:importacao-extrato`,
  `npm run smoke:folha-financeiro`, `npm run smoke:financeiro-core`.
- [ ] Auditoria final (`docs/PROTOCOLO_AUDITORIA_FINAL.md`), nível 3 (dinheiro em produção): revisores
  `action-guardian` e `prisma-migration-reviewer`.
- [ ] Commit do spec e do plano junto (`docs/superpowers/specs/2026-11-10-...`, `docs/superpowers/plans/2026-11-10-...`).
- [ ] Deploy: `migrate deploy` (insere a chave do corte); rodar `papel-leitura.sql` no servidor com senha nova.
