# 06 — Log de progresso da reforma do CRM

> **Correção transversal (2026-08-13):** a auditoria (P1) afirmou que não existia catálogo de
> disciplinas. **Existe** — `DisciplinaCatalogo` (`schema.prisma:906`), seedado com 20 entradas, com
> sigla/numeração/categoria, já usado por engenharia, projetos, ferramentas e uploads. O P3 chegou a
> propor criar um `DisciplinaPadrao`; **cancelado** — seriam duas fontes de verdade concorrentes.
> Corrigido em `00-auditoria.md`, `02-schema.md` §8.1, `03-migracao.md` §5 e Q3 de `01-decisoes.md`.

Uma entrada por prompt executado, do mais recente para o mais antigo.

**Formato de cada entrada:**

```
## Pn — <nome> · <data> · <modelo>
**Feito:** o que saiu de fato
**Arquivos:** o que foi tocado
**Pendente:** o que ficou em aberto e depende de quem
**Riscos:** o que pode morder depois
```

---

## Fase 1a — Dívida técnica primeiro · 2026-08-14 · Sonnet (F1.1/F1.2 Opus na decisão de modelo, executadas em Sonnet)

Início da execução do backlog (`04-plano-fases.md`). F1.0 já estava feito (bullet no CLAUDE.md, P5).

**F1.1 — `src/modules/comercial/status.ts` + `.test.ts`** (commit `80ac5d8`)
- `etapaEhPerdido` extraído de arrow function anônima em `actions.ts` para função nomeada,
  documentada e testada. **Mesma regra, mesmo comportamento em produção** — substring
  case-insensitive `"perdid"`, cobre "Perdido"/"Perdida". Teste cobre explicitamente a limitação
  já conhecida (auditoria §E.1): etapa renomeada para fora do padrão deixa de ser reconhecida
  silenciosamente — documentado como comportamento atual, não bug escondido.
- `calcularStatusComercial(temPropostaAceita, override)` — função pura pronta para quando F1.5/F1.9
  trouxerem `Cliente.status` via migration (ADR-08, `02-schema.md` §6).

**F1.2 — `src/modules/comercial/numeracao.ts` + `.test.ts`** (commit `0924430`)
- `formatarNumeroProposta(ano, sequencial)` extraído do template literal inline em
  `proximoNumeroProposta`. O contador (`PropostaSequencia`, upsert transacional) continua em
  `actions.ts` — é estado, não regra. Testa explicitamente `sequencial >= 10000` (cresce, não
  trunca) e virada de ano. Número já emitido a clientes reais **não muda**.

**Verificação:** `npx vitest run` → **189 arquivos, 1938 testes, todos verdes** (14 novos:
`status.test.ts` + `numeracao.test.ts`). `eslint` limpo. `tsc --noEmit` (heap 8GB) → mesmos 2 erros
pré-existentes de `src/lib/backup-storage.test.ts` (commit `d27e270`), nada no código novo. `next
build` não rodado (regra: nunca junto com `next dev` ativo na mesma `.next`; nenhuma mudança de
bundle client aqui).

**Arquivos:** `src/modules/comercial/status.ts` + `.test.ts` (novos), `numeracao.ts` + `.test.ts`
(novos), `actions.ts` (religado nos dois extraídos), `CLAUDE.md` (corrige 99→104 tarefas).

**Nota de modelo:** F1.1/F1.2 estavam marcadas Sonnet no backlog; sessão trocou de Opus→Sonnet
antes de começar (regra do projeto: parar e trocar, não só avisar).

**F1.3 — `service.ts` + caracterização do aceite** (commit `a7498ee`, Opus)
- `criarPropostaDeLead`, `salvarProposta`, `aceitarProposta` + `proximoNumeroProposta` saem de
  `actions.ts` para `service.ts`. `actions.ts` fica com sessão/permissão/Zod/auditoria e
  revalidação de rota. **607 → 445 linhas.**
- `disciplinas.ts` + teste — mapeamento item→disciplina, puro e **genérico no tipo do valor**
  (assim o `Decimal` do Prisma atravessa sem virar `number` e perder precisão).
- `scripts/smoke-crm-fase1.ts` + `npm run smoke:crm-fase1` — **23 checks** contra o banco de dev.

**Preservado de propósito** (é movimentação, não reescrita):
`ActionError` continua sendo lançado do service; `ensureCanaisProjeto`/`notificarNovosMembros`/
`notificarMuitos` continuam **fora** da transação (falha de notificação não desfaz o aceite);
os callbacks `entidadeId` ficam na config do `defineAction`, alimentando a auditoria.

**Como a equivalência foi provada, e o que não deu para provar:**
- `git diff --color-moved=zebra --color-moved-ws=allow-indentation-change` → **317 linhas
  detectadas como movimentação**. As 113 restantes foram auditadas uma a uma: docblock novo,
  import, assinatura exportada e renomeação de parâmetro (`i.leadId`→`input.leadId`,
  `user.id`→`autorId`). Única troca semântica: `p.itens.map(...)` → `disciplinasDeItens(p.itens)`.
- ⚠️ **O smoke não pôde rodar ANTES da extração** — a lógica estava dentro de um `defineAction`,
  que exige sessão (`getSession()`), e não é invocável de um script `tsx`. Montar sessão falsa
  seria mais arriscado que o refactor. A equivalência apoia-se então no diff de movimentação
  literal **mais** os deltas de estado: sequência de proposta +1, de projeto +1, projetos +1,
  disciplinas +3 — todos lidos no início do próprio run, nunca hardcodados (o banco de dev é
  compartilhado com outras frentes).
- Baseline do dev antes de tudo: `propostaSeq=8, projetoSeq=15, proposta=6, projeto=10, disciplina=32`.

**F1.4 — `labels.ts` + teste** (commit `d2b8d64`, Sonnet no lugar do Haiku previsto, a pedido do usuário)
- 10 enums, **55 valores**, cobrindo tudo que `02-schema.md` define. Implementa a decisão
  transversal T6: identificador em código, rótulo pt-BR centralizado num arquivo só.
- Exaustividade por `satisfies Record<Enum, string>` — faltar valor quebra a **compilação**, não o
  teste. **Mecanismo verificado na prática**, não assumido: um mapa incompleto produz `TS1360`.
- O teste cobre o que o compilador não pega: contagem por enum contra o schema alvo, rótulo vazio,
  rótulo idêntico ao identificador (esqueceram de traduzir) e underscore vazando para o usuário.
- Tipos declarados localmente porque os enums só entram no `schema.prisma` na F1.5. Quando a
  migration vier, troca-se `type X` por `import type { X }` e o `satisfies` passa a validar contra
  a fonte real.
- Inclui `opcoesDe()`, que monta `value/label` para `Select` preservando a **ordem do funil**
  (ordem de declaração), não alfabética.

**Fase 1a completa** (F1.0–F1.4). Verificação: **192 arquivos, 1961 testes verdes**, lint limpo.

**F1.5 — catálogos e enums** (commit `97a0ecb`, Sonnet) — **primeira migration do CRM**
- 5 tabelas (`tipo_empreendimento`, `motivo_perda` +`exigeConcorrente`, `canal_aquisicao`,
  `segmento`, `probabilidade_estagio`) + 7 enums. **Puramente aditiva** — nada existente alterado.
- Disciplina **não** entra: `disciplina_catalogo` já é o catálogo do sistema (§8.1). As relações
  inversas (`Negociacao[]`, `Lead[]`, `Campanha[]`, `Cliente[]`) ficam para as tarefas que criam
  esses models — é lá que entram as FKs e seus índices.

**Como o drift foi contornado (sem reset):** `prisma migrate dev` pediu reset por drift acumulado em
`pendencia`/`pendencia_anexo`, **vindo de outra frente**. Reset recusado — apagaria o dataset de dev.
Caminho manual da skill `nova-migracao`:
`migrate diff --from-config-datasource --to-schema` (não precisa de shadow DB, que não está
configurada) gerou o SQL → revisado → `migrate deploy` aplicou. **O diff provou que o delta é só do
CRM**: 7 `CREATE TYPE` + 5 `CREATE TABLE` + 4 índices únicos, zero menção ao drift alheio.
`migrate status` limpo depois (161 migrations).

**`labels.ts` e `status.ts` religados:** os tipos agora vêm de `@/generated/prisma/enums` em vez de
declarados à mão — era a nota deixada na F1.4. **Verificado na prática**, não assumido: adicionei um
valor ao enum no Prisma, regenerei, e o `satisfies` acusou `TS1360`; depois restaurei o schema. O
arquivo de rótulos está genuinamente amarrado à fonte real agora.

Ainda declarados localmente, com o motivo: `StatusPropostaCrm` (`em_negociacao` só entra na Fase 5) e
`TipoProximaAcao`/`TipoAncoraCompromisso` (chegam na F2.1b, `Compromisso` v2).

**Erro meu, pego pelo tsc:** ao religar, deixei declarações locais duplicadas de `BaseLegalLgpd` e
`StatusRelacionamentoContato` conflitando com os imports (`TS2440`/`TS2484`). Corrigido antes do commit.

**Verificação:** `prisma validate` ✅ · `migrate status` limpo ✅ · `grep DisciplinaPadrao prisma/`
vazio ✅ (os 3 critérios de aceite) · 192 arquivos, 1961 testes verdes · lint limpo · tsc só os 2
pré-existentes de `backup-storage.test.ts`.

**Não rodei `db:seed`:** os catálogos nascem vazios e seu seed idempotente é a **F1.6**. Nenhum campo
obrigatório novo nem permissão nova nesta migration, que são os gatilhos que a skill lista.

**F1.6 — seed dos catálogos** (commit `2645028`, Sonnet)
- 10 tipos de empreendimento · 8 motivos de perda (com `exigeConcorrente` em "Perdemos para
  concorrente") · 8 canais · 8 segmentos · 5 probabilidades por estágio (20/35/55/75/100).
- **Listas aprovadas pelo dono em 2026-08-14**, derivadas dos empreendimentos reais de produção
  (EDIF. ISA BEACH/MARMARES/BELA BEACH, RES. PLINIO PAIVA, CAPIBA MALL). Não foram inventadas:
  perguntei antes de semear, porque conteúdo de catálogo é decisão de produto.
- Estágios terminais (`PERDIDO`/`EM_ESPERA`/`CANCELADO`) ficam fora de `ProbabilidadeEstagio` de
  propósito — não são ponto do funil.

**Idempotência verificada nas duas pontas**, não só na contagem:
1. `npm run db:seed` **duas vezes** → 10/8/8/8/5 idêntico (o aceite pedia isto).
2. **O que a contagem não prova:** desativei `Hotelaria` (`ativo=false, ordem=99`) e mudei
   `NEGOCIACAO` para 80 à mão, rodei o seed de novo — **as duas edições sobreviveram**. É o
   `update: {}` fazendo seu trabalho: o seed garante existência, nunca desfaz edição do usuário.
   Estado de teste restaurado depois (`Hotelaria` ativa/ordem 5, `NEGOCIACAO` 75).

⚠️ **O deploy exige `npm run db:seed`** — sem ele os catálogos ficam vazios em produção e os selects
do CRM aparecem sem nenhuma opção.

**Verificação:** 192 arquivos, 1961 testes verdes · lint limpo · tsc só os 2 pré-existentes.

**F1.7 — parâmetros configuráveis** (commit `1c267c3`, Opus)
- `comercial.config` em `ConfigSistema` com 4 limiares: `descontoMaxSemJustificativa` (**10**,
  decisão Q6), `diasSemContato` (15), `diasAvisoValidadeProposta` (7), `diasClienteInativo` (180).
- **Critério de aceite cumprido:** `grep` não acha nenhum desses números solto em
  `src/modules/comercial/` — quem precisar de limiar chama a query.
- `padroes.ts` puro + testado (11 casos) separado de `queries.ts` (só o `findUnique`), seguindo o
  padrão do projeto de isolar lógica testável do I/O.

**Emenda de critério, com o motivo:** o backlog pedia "seed roda 2× sem duplicar". **Não se aplica.**
O padrão real dos ~8 módulos que usam `ConfigSistema` (`financeiro/config`, `financeiro/aprovacao`,
`licitacoes/config`, `rh/encargos`) é **não semear**: o default mora no código e a chave só nasce
quando alguém edita na tela. Semear duplicaria a fonte do default — mudar o padrão no código não
teria efeito nos bancos onde o seed já gravou o valor antigo. Corrigido no `04-plano-fases.md`.

**Decisões de implementação que valem registro:**
- O parse é defensivo **campo a campo**: um valor inválido derruba só o próprio campo para o
  default, nunca o objeto inteiro.
- Rejeita negativo, `NaN` e `Infinity`. `diasSemContato: -5` não é "config exótica" — é um alerta
  que nunca dispara, e falha em silêncio, que é o pior modo de falha para isso.
- `exigeJustificativaDesconto` compara com `>`, não `>=`: o limite é o **teto do que passa livre**,
  então 10% exato não exige justificativa; 10,01% exige.
- Zero é aceito: desligar um limiar é configuração legítima.

⚠️ **Três dos quatro defaults são meus, não seus:** só o desconto (10%) veio de decisão registrada
(Q6). `diasSemContato=15`, `diasAvisoValidadeProposta=7` e `diasClienteInativo=180` são pontos de
partida operacionais que escolhi — por isso vivem em configuração, para você ajustar ao ritmo real
do time assim que a tela existir.

**Verificação:** 193 arquivos, **1972 testes verdes** · lint limpo · tsc só os 2 pré-existentes.

**F1.8 — campos comerciais no `Cliente`** (commit `01b324f`, Sonnet)
- `status` + `statusOverride` (ADR-08), `linkedinUrl`, `salesNavigatorUrl`, `segmentoId` (FK) e
  `porte`; índices de `status`, `documento` e `segmentoId` (o Prisma não cria o da FK sozinho).
- `status` é **NOT NULL com DEFAULT** — seguro em tabela populada (46 registros em produção). Todo
  o resto nullable.

**Backfill incluído, e é o ponto da tarefa:** quem já tem proposta aceita nasce `CLIENTE`, não
`PROSPECT`. Sem isso, **todo cliente com contrato fechado apareceria como prospect** no primeiro
acesso — o default da coluna não sabe olhar o histórico. Verificado no dev: 2 clientes com proposta
aceita viraram `CLIENTE`, 6 ficaram `PROSPECT`, e a contagem **bate com a consulta ao histórico**
(`comPropostaAceita === marcadosCliente`).

- `statusOverride` fica `NULL`: ninguém sobrescreveu nada ainda, e `EX_CLIENTE`/`PARCEIRO` nunca são
  inferidos (ADR-08).
- `categoria` (texto livre) **não é tocada** — fica deprecada em favor de `segmentoId`/`porte`, com o
  conteúdo histórico preservado. Nada reescrito.
- O índice **único parcial** de `documento` (ADR-03) **não** entra aqui: é a F1.15, e depende de
  resolver as 3 duplicatas de nome antes. Aqui vai só o índice de busca.

**Aceite "os clientes continuam listando":** não abri browser; exercitei as queries reais
(`listarClientes`, `listarClientesPaginado`) direto — seguem retornando, com os campos novos
presentes. Vale confirmar em `/clientes` no navegador quando for conveniente.

**F1.9 — LGPD no `ContatoCliente`** (commit `73599d8`, Sonnet)
- `optOut`/`optOutAt`, `baseLegal`, `dataCollectionSource`, `dataCollectedAt`, `linkedinUrl`,
  `salesNavigatorUrl`, `papelDecisao`, `statusRelacionamento` e **`createdAt`** (que faltava).
- Aditiva e segura: os dois NOT NULL têm DEFAULT, `createdAt` usa `CURRENT_TIMESTAMP`.
- `@@index([optOut])` — é o filtro de toda lista de abordagem.

⚠️ **Ressalva registrada na própria migration, sobre o backfill de `dataCollectedAt` (Q5):** a
decisão foi usar `createdAt` como proxy da data de coleta. Só que, para linhas pré-existentes,
`createdAt` acabou de ser preenchido com a **data da migration**, não com a data real do cadastro —
esse dado nunca foi guardado. O proxy vale para contatos criados daqui em diante; para os antigos é
só o instante em que a coluna nasceu. **Hoje o ponto é teórico: há zero contatos em produção e em
dev.** O `UPDATE` fica pelo caso de algum ambiente ter dado que não conhecemos.

**F1.10 — `lgpd.ts`** (commit `02bc217`, Sonnet no lugar do Haiku previsto)
- `podeAbordar(contato)` + `WHERE_PODE_ABORDAR` (o filtro Prisma equivalente, lado a lado para as
  duas mudarem juntas) + `registrarOptOut(agora)` com relógio injetado.
- **Critério de aceite cumprido:** `optOut` aparece **só** em `lgpd.ts` dentro de
  `src/modules/comercial/`.
- **Decisão explícita:** ter e-mail/telefone **não** faz parte da regra. Contato sem e-mail ainda
  pode ser abordado por telefone, LinkedIn ou visita — filtrar por canal é de quem monta a lista.
  Misturar as duas coisas faria o sistema "proteger" quem nunca pediu proteção.
- O motivo de centralizar: quando a regra crescer, muda num lugar só. Espalhada, sempre sobra um
  ponto esquecido — e o modo de falha é mandar e-mail para quem pediu descadastro.

**Verificação (F1.9+F1.10):** 194 arquivos, **1979 testes verdes** · lint limpo · tsc limpo ·
`migrate status` limpo (163 migrations).

**F1.11 — `/clientes`: filtros, form em abas, contatos inline** (commit `a8f3c3d`, Sonnet) —
primeira tarefa de UI da reforma
- Busca/filtros/paginação server-side **já existiam** (`parseListParams`+`useSetParams`); só
  acrescentei filtro por **Segmento** (catálogo — `listarFiltrosClientes` agora consulta o model
  `Segmento` direto, não `distinct` sobre uso passado, que ficaria vazio até o primeiro cliente
  ganhar um) e por **Classificação** (`StatusComercialCliente` — é o termo "classificação da
  empresa" do playbook original, P6). Coluna de classificação nova na tabela.
- `cliente-form.tsx` reescrito em 5 abas: Identificação, Comercial (classificação **somente
  leitura**, Segmento, Porte, Categoria realocada com nota "campo legado"), LinkedIn (com aviso
  "sem scraping — Fase 4"), Observações (**ganhou textarea** — não era editável no dialog antes),
  Contatos (só ao editar).
- `contatos-tab.tsx` (novo): edição **inline**, sem modal — diferente do `ContatoDialog`
  existente, que fica intocado e continua servindo a página de detalhe.

**Decisão explícita: não editar `statusOverride` nesta tarefa.** A aba "Comercial" listada no
backlog não pede isso, e construir a UI de override sem decidir quem pode usá-la ou como auditar
seria inventar feature além do pedido. Mostro o status calculado como badge, e paro aí.

**Erro real que cometi e corrigi:** a primeira versão do `contatos-tab.tsx` chamava
`startTransition` **durante o render** (`if (contatos === null) { carregar(); return … }`) — efeito
colateral impuro, contra as regras do React. Corrigido com `useEffect` na montagem, guardado por
`clienteId`. O componente só monta (e só então busca) quando a aba Contatos é aberta pela primeira
vez — carregar contatos não deveria ser o custo de editar Identificação.

**`editarContato` reconcilia "principal":** marcar um contato como principal desmarca os demais do
mesmo cliente, na mesma transação. O schema não tem constraint para isso; sem a reconciliação,
um cliente acumularia N "principais" sem que nada avisasse.

**Verificação:** sem migration (os campos já existiam desde F1.8/F1.9). Queries exercitadas contra
o dev, não só teste unitário: filtro por segmento (achou o cliente certo), por classificação (3
`CLIENTE`), paginação combinada com filtro, e `contatosDoCliente`. 194 arquivos, 1979 testes
verdes · lint limpo · tsc limpo.

⚠️ **Não abri browser.** O critério "recarregar a página preserva o filtro" segue pendente de
confirmação visual, no mesmo padrão de `searchParams`+`useSetParams` que já funciona para os
filtros existentes (tipo/situação/UF/categoria) — os dois novos foram fiados nele.

**F1.12 — `dedupe.ts`** (commit `1da56be`, Sonnet)
- Extraído **literalmente** de `scripts/auditoria-crm.ts` (que já validou os 3 grupos reais de
  duplicata de produção). O script agora **importa** em vez de manter uma segunda cópia.
- 3 primitivos novos: `normalizarTelefone` (heurística E.164, não validação — comprimento fora do
  esperado retorna `null`, nunca um número inventado), `dominioDoSite`, `similaridade`
  (Levenshtein normalizado, para o que a normalização exata não pega: erro de digitação, abreviação).
- **Erro que cometi e corrigi:** reintroduzi o bug de encoding do P4 (combining marks Unicode
  literais na classe de regex, em vez do escape `[\u0300-\u036f]`) — provavelmente digitei o
  comentário de cabeça em vez de copiar o
  arquivo fonte. Corrigido com o mesmo método de antes, antes do commit.
- Teste (24 casos) reproduz os 3 grupos reais de produção e confirma que PF não come "Sá"/"Me".

⚠️ **Achado colateral, não corrigido (fora de escopo desta tarefa):** `auditoria-crm.ts:272` chama
`normalizarNomeEmpresa(c.nome)` sem o parâmetro `tipo` — sempre assume PJ, mesmo quando
`Cliente.tipo === "PF"`. Já era assim antes da minha mudança (call site preexistente, só religuei o
import). Vale corrigir quando alguém mexer nesse script de novo.

**Verificação:** só função pura, sem migration. 195 arquivos, **2003 testes verdes** · lint limpo ·
tsc limpo · rodei o script religado contra o dev (0 duplicatas hoje, como esperado).

**Correção a pedido do usuário (commit `eda1216`):** `auditoria-crm.ts:272` chamava
`normalizarNomeEmpresa(c.nome)` sem `tipo` — `tipo` nem estava no `select`. Corrigido: `tipo` entra
no select, e a chamada passa `c.tipo`.

**F1.13 — alerta não bloqueante de duplicata** (commit `543e242`, Sonnet)
- `candidatosDuplicata` (dedupe.ts) — casa a entrada contra os clientes existentes por documento
  (mais forte), nome exato, domínio de e-mail corporativo, nome parecido (mais fraco, só esse usa
  `similaridade`). Um cliente batendo por dois motivos aparece **uma vez só**, com o mais forte.
- `clientesParaDedupe` + `buscarCandidatosDuplicata` (leitura) expõem isso pro client.
- `cliente-form.tsx`: debounce de 400ms ao digitar nome/documento/email, **só na criação**
  (`form.id` ausente — editar não compara contra si mesmo). Banner entre o header e as abas,
  visível independente da aba ativa.
- **Genuinamente não bloqueante:** "Criar mesmo assim" só dispensa o banner — o botão Salvar nunca
  fica desabilitado por causa dele. "Usar este" abre o cliente existente em nova aba (preferi isso
  a tentar abrir a edição inline via estado entre componentes, mais frágil para pouco ganho).

**Verificado contra o dev reproduzindo o cenário exato do aceite:** criei 2 clientes
"Madano"/"MADANO", digitei "Madano" na busca → achou os 2 por `nome_exato`; criei um 3º igual
mesmo assim → funcionou (confirma que não bloqueia). Dados de teste removidos ao final.

**Verificação:** 34 testes puros no `dedupe.ts` (10 novos de `candidatosDuplicata`) · 195 arquivos,
**2013 testes verdes** · lint limpo · tsc limpo.

**F1.14 — fusão de clientes duplicados** (commit `e0eb9f4`, Opus) — ⚠️ move projeto entre empresas
- Migration aditiva: `fundidoEmId` (auto-referência) + `fusaoEm` + índice. `ON DELETE SET NULL`,
  não `CASCADE` — se o sobrevivente for removido um dia, o absorvido não some junto.
- `mesclarClientes` move tudo e arquiva o absorvido com a referência. **Nada é apagado.**

**O backlog listava 5 relações. O schema tem 11, e 3 não são descobríveis:**
- `documento_financeiro.clienteId` e `oportunidade.clienteId` são **FK escalar sem `@relation`**
  ("p/ não inflar Cliente", diz o schema) — não aparecem em `Cliente.xxx[]`, não têm constraint no
  banco, então **nem introspecção acha**.
- `custo_orcamento` aponta por **`contratanteId`**, não `clienteId` — um grep ingênuo passa direto.

Mover só as 5 do backlog deixaria documento, orçamento de custo e documento jurídico órfãos,
apontando para um cliente arquivado. O usuário procuraria o arquivo no cliente sobrevivente e não
acharia.

**O check mais importante do smoke não é o do critério de aceite:** ele enumera as FKs reais do
`information_schema` e **falha** se aparecer alguma que a fusão não trata. É o que impede
`REFERENCIAS_CLIENTE` de virar retrato de hoje quando a Fase 2 adicionar `Negociacao.clienteId` e a
Fase 3 `Atividade.clienteId`. **Verifiquei o guarda na prática:** removi `projeto` da lista e o
smoke acusou `⚠ NÃO TRATADAS: projeto.clienteId`, com a instrução de onde corrigir. Restaurei.

**Decisão sobre `usuarioId` (@unique):** se os **dois** clientes têm login de portal, a fusão é
**recusada** com `ActionError`, em vez de descartar um em silêncio — o cliente perderia acesso ao
portal sem ninguém saber por quê. Se só o absorvido tem, o login migra.

**Além do critério de aceite:** o smoke conta as linhas das 12 tabelas antes e depois e exige total
idêntico. É a prova de "nada é apagado" que checagem por tabela não dá.

`capturarAntes` grava os dois clientes no `AuditLog` — é o registro que alguém vai querer daqui a
seis meses quando um projeto parecer estar na empresa errada.

**Verificação:** `npm run smoke:crm-dedupe` → **13/13** · 195 arquivos, 2013 testes verdes · lint
limpo · tsc limpo · `migrate status` limpo (164 migrations).

⚠️ **Sem UI ainda.** A action existe e está auditada, mas nenhuma tela chama `mesclarClientesAction`
— a F1.15 usa direto via script, com confirmação humana por grupo. Botão de mesclar na tela não
está no backlog da Fase 1.

---

### Decisão de sequência (2026-08-14)

F1.15/F1.16/F1.21 tocam **produção** e ficaram para depois. Ordem acertada com o usuário:
**terminar as 8 tarefas de dev (F1.17–F1.24) → um único deploy → as 3 de produção em bloco.**
Evita deixar produção com a Fase 1 pela metade e reduz a dois eventos (deploy + janela de fusão).

**F1.17 — soft delete em `Cliente`** (commit `a4f7ab6`, Opus) — ⚠️⚠️ respinga em 6 módulos fora do CRM

**Inventário antes de ligar** (o critério de aceite exigia): **11 leituras top-level** em busca,
clientes, comercial, custos, documentos e financeiro — mais **27 leituras aninhadas** via
`include`/`select`, que **não passam pela extensão**. As aninhadas ficam como estão de propósito:
projeto/proposta antigo deve continuar mostrando de qual cliente era.

**Duas exceções reais que o inventário revelou:**

1. **Lookup só por id** (`{ id }` / `{ id: { in: [...] } }`) não é listagem — é `findUnique` em
   lote, resolvendo nome de algo já referenciado. Filtrar faria o nome sumir de documento
   histórico. Resolvido **na própria extensão** (`ehLookupPorId`): corrige os 2 call sites sem
   tocá-los e o próximo que alguém escrever.
2. **Índice de dedupe da importação financeira** (`commit-core.ts:79`, `importacao/queries.ts:18`)
   **precisa** enxergar os excluídos. Se um cliente soft-deleted sumisse do índice, o mesmo nome no
   CSV criaria cadastro novo — **exatamente a duplicata que a Fase 1 está removendo**. Seria
   entregar um bug que fabrica duplicata na fase que existe para eliminá-las.

**A sintaxe do escape foi verificada contra o banco, não inferida** — e o resultado é
contra-intuitivo:

| forma | resultado |
|---|---|
| `excluidoEm: { not: undefined }` | ✅ vê todos |
| `excluidoEm: undefined` | ❌ o `??` converte para `null` |
| `OR: [{excluidoEm: null}, {not: null}]` | ❌ AND implícito com o filtro injetado anula |

Documentado no cabeçalho da extensão, porque vale também para `lancamento` e `upload`.

**Verificação:** smoke novo `npm run smoke:crm-soft-delete` → **11/11**. Além dele, exercitei as
queries reais de cada módulo: ao excluir 1 cliente, `/clientes`, busca global, opções de custos e
de financeiro caem **exatamente 1** cada, o índice de dedupe **não muda**, e tudo volta ao normal
ao limpar `excluidoEm`. `smoke:crm-dedupe` e `smoke:crm-fase1` seguem passando · 2013 testes ·
lint e tsc limpos.

**Nota sobre o critério de aceite:** ele dizia "continuam listando os 43 clientes". Dev tem 10 e
produção 46 (a F1.15 ainda não rodou). Troquei por asserção de **delta** — mais forte, porque prova
que a extensão faz o que deve e **nada além disso**.

**F1.18 — soft delete em `Lead` e `ContatoCliente`** (commit `87e130e`, Opus; backlog pedia Sonnet)

**A diferença em relação à F1.17 é o que define a tarefa:** aqui a leitura **principal** dos dois
models é **aninhada** — o Kanban lê leads via `FunilEtapa.leads`, a ficha do cliente lê contatos via
`include`. Leitura aninhada **não passa pela extensão**. Ou seja: ligar a extensão sozinha **não
cumpriria** o critério de aceite ("funil não mostra lead com `excluidoEm`").

**5 filtros explícitos**, todos em leitura aninhada:
`funilCompleto` (leads do Kanban) · `obterCliente` (contatos da ficha) · `listarEtapasFunil`
(`_count` de leads) · `listarClientes` e `listarClientesPaginado` (`_count` de contatos).

Os `_count` são leitura aninhada igualmente — sem `where`, a etapa mostraria **"3 leads" com 2 na
tela**. Esse é o tipo de divergência que ninguém reporta como bug, só desconfia do sistema.

**`Lead.excluidoEm` ≠ `Lead.arquivado`** (que já existia): arquivar tira do funil mas mantém o lead
vivo e reversível pela UI; excluir é remoção lógica. Coexistem de propósito — a Fase 2 substitui
`arquivado` pelo status `DESCARTADO` do funil novo, e só então o campo antigo fica órfão.

**O smoke pegou uma inconsistência — e o errado era o teste, não o código.** Eu havia escrito o
check como `count({ where: { id } }) === 0`, mas lookup por id é **isento** do filtro de propósito
(exemption criada na F1.17, para resolver nome em histórico). Corrigi o teste e transformei o
comportamento num check explícito, para ninguém tropeçar nisso de novo.

**Verificação:** smoke novo `npm run smoke:crm-soft-delete-lead` → **13/13**. Os 3 smokes anteriores
(`crm-fase1`, `crm-dedupe`, `crm-soft-delete`) seguem passando · 2013 testes · lint e tsc limpos.

**F1.19 — `PropostaItem.disciplina` vira FK do catálogo** (commit `f5e5cb4`, Opus) — ⚠️ toca proposta

**A coluna física NÃO foi renomeada.** No schema Prisma ela passa a se chamar
`disciplinaTextoLegado` via `@map("disciplina")` — o nome muda só no código. Duas consequências
boas: nenhum `RENAME` numa tabela ligada ao link público já enviado a cliente, e os **9 pontos de
leitura falharam em COMPILAÇÃO**, não em runtime. O tsc listou todos; nada foi descoberto por acaso.

`disciplinaId` é **nullable de propósito**: produção tem 24 grafias, 18 batendo exato e 6 pendentes
(F1.21). Item que não resolve fica sem FK — estado esperado. O backfill casa por **nome exato**;
casar por aproximação apontaria o item para a disciplina errada, e valor de disciplina vira
pagamento de projetista.

Leitura sempre por `nomeDisciplinaItem()`: prefere o catálogo, cai no texto original. **O fallback
não é defensivo — é o estado correto** enquanto houver grafia não consolidada. Sem ele, a proposta
pública e o PDF mostrariam disciplina em branco. Os 2 pontos mais sensíveis: `/a/proposta/[token]`
e o token `[Disciplina]` do Estúdio, onde documento gerado em branco seria falha silenciosa.

⚠️ **Risco documentado no `proposta-editor.tsx`:** a aplicação de tabela de preço casa por **texto**.
Hoje é equivalente (o backfill só resolve FK em nome exato, então o nome exibido não muda), mas
**divergirá quando alguém renomear uma disciplina no catálogo** — o item passa a exibir o nome novo
e a tabela continua com o antigo, e o preço para de casar em silêncio. Verificado no dev: **10 de 11
grafias** de `ItemTabelaPreco` batem com o catálogo; a exceção é `Lógica`, que o catálogo renomeou
para `Cabeamento`. A **F1.20** converte `ItemTabelaPreco` e a comparação deve passar a usar `disciplinaId`.

**O smoke estava se enganando:** ele criava itens com `createMany` direto, contornando a resolução
de FK — registrava **0/3 resolvidos** e passava mesmo assim. Troquei para `salvarProposta`, o
caminho real da aplicação: agora dá **3/3** e checa que todo item resolve um nome, que o texto
original é preservado e que a soma dos valores não muda.

**Verificação:** 195 arquivos, **2017 testes verdes** · lint e tsc limpos · os 4 smokes do CRM e o
`smoke:onda4` (que também toca proposta) passando.

**F1.20 — `ItemTabelaPreco.disciplina` vira FK do catálogo** (commit `2416318`, Sonnet)

Mesmo padrão da F1.19: `@map("disciplina")` mantém a coluna física, `disciplinaId` nullable com
backfill por nome exato. **Verificado com dado real do dev: 10/11 itens resolveram FK.** O único que
não resolveu é `Lógica` — exatamente o caso que o comentário da F1.19 já citava (o catálogo renomeou
para `Cabeamento`), confirmando que o risco documentado ali era real, não hipotético.

⚠️ **Decisão explícita: não fechei o risco do `proposta-editor.tsx`** (comparação de preço por texto,
não por FK) nesta tarefa. Fechar isso exigiria fiar `disciplinaId` ponta a ponta pelos tipos locais
`Item`/`Tabela` do editor, que hoje só carregam `string` — mais escopo do que F1.20 pede (só "continua
listando"). Atualizei o comentário no código para deixar claro que é decisão, não esquecimento: o
caso comum já funciona por construção (item escolhido agora vem do mesmo catálogo dos dois lados);
só quebra para item salvo **antes** de um rename no catálogo — o mesmo cenário que acabou de acontecer
de verdade com `Lógica`→`Cabeamento`.

**Verificação:** 195 arquivos, 2017 testes verdes · lint e tsc limpos · `listarTabelasPreco()`
exercitada contra o dev · os 4 smokes do CRM + `smoke:onda4` passando.

**F1.22 — Gancho de adoção: proposta pré-preenchida pela tabela de preço** (commit `2ecab67`, Opus)
— ⚠️ número errado vai para o cliente

O que existia não era o que a tarefa pedia. O botão "Aplicar (R$/m² × área)" **só reprecificava itens
já digitados** — um `arr.map()` que nunca adicionava linha. Montar proposta continuava exigindo
adicionar cada disciplina à mão antes de ver qualquer preço, que é justamente o atrito que faz o time
preferir o Word. Agora um diálogo lista as disciplinas da tabela com o valor de cada uma **calculado
antes de confirmar**, com o total marcado: 800 m² × 3 disciplinas marcadas = 3 itens precificados.
O não marcado fica intocado — a operação nunca remove item, inclusive os digitados à mão fora da tabela.

`honorarios.ts` (puro, 22 testes) — `arredondarMoeda`, `valorPorArea`, `itensPersistiveis`,
`totalItens`, `preencherItensDaTabela`.

**Achado que muda o código, não só o teste:** `Math.round(v * 100) / 100` **não** é o arredondamento
do banco. `PropostaItem.valor` é `Decimal(14,2)` e o que trafega até lá é a representação decimal
mais curta do double (`String(v)`) — é ela que o Prisma serializa e o PG arredonda meio-para-cima.
Em `1.005`, `Math.round` devolve `1.00` (o double é 1.00499…) e o banco grava `1.01`: **um centavo de
divergência entre a tela e o que o cliente lê no PDF**. `arredondarMoeda` arredonda sobre a mesma
string que o banco vê. Conferido contra o PG do dev, não inferido — `1.005`, `2.675`, `1.115`,
`1234.567` e `-1.005` batem nos cinco.

**Assimetria de resolução de nome, fechada aqui — mas ela era LATENTE, não uma falha em curso.**
A F1.19+F1.20 deixaram o item da proposta sendo exibido pelo nome do **catálogo** e a linha da tabela
como **texto legado**, com o editor casando os dois por texto. `listarTabelasPreco()` passa a resolver
pelo mesmo `nomeDisciplinaItem()` nas duas pontas e as duas páginas pararam de mapear à mão.

⚠️ **Correção de uma afirmação minha exagerada** (a mensagem do commit `2ecab67` a repete; fica
corrigida aqui, que é o que a F1.21 vai ler). Escrevi que `Lógica`→`Cabeamento` "deixava de casar em
silêncio". **Não deixava.** Medido no dev: dos 18 `PropostaItem`, **0** têm texto ≠ nome do catálogo —
porque os dois backfills resolveram por nome EXATO e `salvarProposta` continua fazendo isso, então
todo item com FK tem `disciplinaTextoLegado === disciplina.nome`. E `Lógica` está **sem FK dos dois
lados**, resolvendo para `"Lógica"` antes e depois da mudança: a correção **não a cobre**.

O que a correção realmente fecha: o sub-caso em que **as duas pontas têm FK** e alguém renomeia a
disciplina no catálogo depois. **Continuam abertos** o caso misto (item com FK, linha de tabela sem) e
o caso sem FK nenhuma — ambos são a **F1.21**. Ou seja: o risco de disciplina **não** está aposentado.

**Risco NOVO que a própria F1.22 criava, e que só apareceu na revisão:** `preencherItensDaTabela`
nomeia o item com o nome resolvido da linha da tabela, e o `<Select>` de cada linha do editor só
oferece nomes do **catálogo**. Um clique numa linha fora do catálogo (em dev, `Lógica` — 1 de 11)
mintava um item com valor e dropdown em branco; e quem "consertasse" esse dropdown trocaria a
disciplina mantendo o valor — o ⚠️ da tarefa entrando por outra porta. Travado na função pura
(`disciplinasValidas`, 3 testes) e não só na UI, para ser verificável sem browser; o diálogo ainda
mostra a linha **desabilitada com o motivo**, em vez de escondê-la — alguém precisa notar que existe
disciplina com preço cadastrado fora do catálogo, que é o trabalho da F1.21.

**Critério 3 ("total na tela = total no PDF") não estava coberto por nada.** O PDF é renderizado da
própria página pública (`page.goto` em `/a/proposta/[token]`), então PDF ≡ página pública por
construção; o que faltava garantir era **editor = persistido**. Dois caminhos quebravam, ambos
independentes da tabela: (a) valor de 3 casas digitado à mão — o critério 2 põe esse caminho em jogo
de propósito; (b) o total somava todos os itens, mas o salvar filtrava os sem disciplina. Ambos
fechados pela mesma decisão: `itensPersistiveis()` é a lista **única** que o editor exibe *e* envia,
então a igualdade vale por construção. Input de valor ganhou `step="0.01"`.

`smoke-crm-fase1.ts` ganhou a asserção de ida-e-volta — salva itens com 3 casas, lê de volta, compara
(3001,97 dos dois lados) — mais uma checagem de que a soma **sem** quantizar daria outro número
(3001,96), para o teste discriminar de verdade em vez de passar por coincidência. Teste puro não
alcança isto: a divergência nasce no arredondamento do banco.

**Verificação:** 196 arquivos, 2039 testes verdes · `eslint .` limpo · `tsc` só os 2 pré-existentes
de `backup-storage.test.ts` · `smoke:crm-fase1` 30/30.

**Pendente — duas coisas, ambas para a F1.25:**
1. `npm run build` **não rodou** — a guarda do `scripts/build.mjs` barrou por haver processo na `:3000`
   (dev server subiu 21:09 durante a sessão). Não derrubei processo alheio.
2. **A verificação em browser não foi feita**, e a coluna "Prova" da F1.22 pede `puro + browser`. O
   diálogo é a entrega inteira do lado do usuário e nada dele é alcançável por vitest ou smoke:
   `Select` aninhado dentro de `DialogContent` (portal/foco do base-ui) e o reset de `marcadas` ao
   trocar de tabela. O que **está** provado sem browser: o cálculo, a trava de catálogo e a igualdade
   tela = banco.

**F1.23 + F1.23a — Lead ganha atribuição/origem/parceiro estruturados** (commit `ce8f96f`, Opus)
— ⚠️ toca os 8 leads

Junta as duas tarefas: F1.23a (`Parceiro`) toca o mesmo `Lead` e a mesma migration que F1.23,
separar duplicaria alteração na mesma tabela. `responsavelId`/`canalId`/`origemDetalhada`/
`campaignId` (+ model `Campanha`, vazia, UI só na Fase 4) e `parceiroId` (+ model `Parceiro`,
ADR-19, sem campo de comissão de propósito). `Negociacao.parceiroId` não entra — esse model ainda
não existe, nasce na Fase 2.

**Achado que travou a leitura literal do Q4, e a resposta do usuário:** não há como saber quem
criou um lead já existente — `Lead` nunca teve campo de autor, e `criarLead` não passa
`entidadeId` ao `AuditLog`. Perguntei; o usuário mandou checar o dump de produção de 2026-08-14
antes de decidir. Restaurado num banco throwaway (`pg_restore`, só descoberta, descartado depois):
produção tem 8 linhas de audit "criar-lead", **todas do mesmo usuário** (Lúcio Sena), casando por
horário (~10ms) com os 8 leads reais — e **zero** linhas em `atividade_lead` para eles. O oposto
do dev, que não tem audit nenhum pros 8 leads de `seed:demo` mas tem 1 `AtividadeLead` cada.
`scripts/backfill-lead-f123.ts` usa as duas fontes nessa ordem (audit_log por proximidade de
horário, senão `AtividadeLead` mais antiga, senão null) — cobre os dois ambientes com o dado real
de cada um, sem inventar nenhum.

⚠️ **Bug achado na revisão, corrigido antes de commitar.** A primeira versão gravava o backfill de
`canalId`/`origemDetalhada` **dentro da migration**, guardado por "se a linha 'Outro' existir no
catálogo". Funciona no dev (F1.6 semeou o catálogo dias atrás) mas quebraria em silêncio na
produção: `migrate deploy` roda **antes** de `db:seed` no fluxo padrão, e este é o primeiro deploy
de toda a reforma — `canal_aquisicao` estaria vazio quando a migration roda, o `UPDATE` não
encontraria nada, e nada re-rodaria depois. Os 8 leads reais perderiam "SMERALDA DEL MARE" etc. de
`origemDetalhada` para sempre — exatamente o que `03-migracao.md` §3 proíbe. Migration virou só
estrutura; os dois backfills ficam no script, rodado depois do seed. Provado simulando o cenário:
reset dos 3 campos dos 8 leads do dev para null (imita pós-migrate/pré-seed) e rodando o script de
novo — os 8 voltaram certos. Checksum da migration recalculado e sincronizado com
`_prisma_migrations` depois da edição (sha256 do arquivo == coluna, conferido, não inferido).

**Verificação:** 2042 testes verdes · lint e tsc limpos · `migrate status` limpo · `smoke:crm-fase1`
(seção nova: parceiro/campanha/canal/responsável no lead) · `smoke:crm-soft-delete` (seção nova:
`Parceiro`) · `smoke:crm-dedupe`, `smoke:crm-soft-delete-lead`, `smoke:onda4` — todos OK.

**Pendente — as mesmas duas da F1.22, ambas para a F1.25:** browser (Campanha/Parceiro ainda sem
UI — F1.23b/F1.23c/Fase 4) e `npm run build` (dev server ocupando a `:3000`).

**F1.23b — CRUD de parceiros + seleção por lista no lead** (commit `4f57b25`, Sonnet)

Tela `/comercial/parceiros` (lista + `ParceiroDialog`: criar/editar/arquivar/reativar) e o
`LeadDialog` ganha `Select` de parceiro alimentado por `parceirosAtivos()` — nenhum campo de texto
livre em lugar nenhum, que é a razão de a entidade existir (ADR-19). `Negociacao` não entra: o
model ainda não existe (Fase 2).

**Corrigida contradição interna do próprio backlog:** a linha F1.23b de `04-plano-fases.md` marcava
`Mig/Seed = seed (permissão)`, mas o §5 do mesmo arquivo diz "nenhuma ação nova entra em
`permissions-catalog.ts` em nenhuma das 7 fases". Implementado: CRUD de `Parceiro` reusa
`comercial:gerir`, igual a toda outra action do módulo — confirmado sem tocar
`permissions-catalog.ts`. §5 estava certo; a célula da linha, desatualizada. Doc corrigido com nota
de rodapé.

**Dois achados na revisão, corrigidos antes de commitar:**
1. Nada impedia `parceiroId` de apontar para um id que não existe — o Zod (`opt(z.string())`)
   deixa passar qualquer string, e Server Action aceita payload arbitrário do cliente. Sem
   checagem, um id inválido virava `P2003` (violação de FK) e o `defineAction` devolvia "erro
   inesperado" em vez de mensagem de negócio — e um parceiro **arquivado numa aba desatualizada**
   continuaria sendo aceito, já que "nunca texto livre" só estava garantido no `Select`, não no
   servidor. `validarParceiroId()` adicionado em `criarLead`/`editarLead`, mesmo padrão que
   `moverLead` já usa para `etapaId`: checa **existência**, não "está ativo" — um lead já vinculado
   a um parceiro arquivado continua legítimo, e `moverLead` também não checa se a etapa está ativa.
2. `listarParceiros()` contava `_count.leads` sem filtrar `excluidoEm` — leitura ANINHADA não passa
   pela extensão de soft delete de `lib/prisma.ts` (mesmo bug que a F1.18 já tinha corrigido em
   `listarEtapasFunil`, esquecido aqui). Verificado contra o dev: 1 lead vivo + 1 excluído contava
   **2** antes da correção, **1** depois.

**Verificação:** 2042 testes verdes · lint e tsc limpos · `smoke:crm-fase1` com seção nova
(cadastrar 2 parceiros, vincular, trocar, arquivar tira da lista de ativos sem quebrar o
histórico) + os outros 4 smokes do CRM. E2E fora do smoke, contra dado real do dev: parceiro
criado/vinculado/trocado, contagem de leads excluídos confirmada 1 (não 2).

⚠️ **Pendente — diferente das últimas tarefas: aqui o próprio aceite não está confirmado, não é
rotina.** "Digitar nome livre não é possível" é uma alegação de UI que nenhum smoke em Prisma
alcança — `Select` aninhado em `DialogContent`, `DropdownMenuTrigger render={...}`, reset do form
ao trocar entre "novo" e parceiro existente. F1.23b só fecha de verdade depois da verificação em
browser (junto com o `npm run build`, mesma pendência de porta 3000 das tarefas anteriores).

---

**Verificação:** 193 arquivos, 1972 testes verdes · lint limpo · tsc só os 2 pré-existentes ·
`migrate status` limpo (162 migrations).

⚠️ **Erro de tsc alheio detectado em `dev`:** `src/components/certidoes/certidoes-view.tsx:153` —
`return toast.error(...)` dentro de `startTransition`, cuja assinatura exige `void` (TS2345). Vem do
commit `77e5ce6` (frente de certidões), **não** do CRM. Registrado aqui porque quebra `tsc` na branch
compartilhada e alguém precisa corrigir.

---

**Critério de aceite emendado, com o motivo:** o backlog pedia `actions.ts < 250 linhas`. Ficou em
**445**. Para chegar a 250 seria preciso mover também Leads, Etapas do funil e Tabelas de preço —
que F1.3 não nomeia — inflando justamente o diff da tarefa cujo aceite é "só movimentação, nenhuma
regra alterada". A contagem de linhas era proxy; o objetivo real (lógica de negócio alcançável fora
do `defineAction`, com o aceite caracterizado) está cumprido. Critério corrigido no `04-plano-fases.md`.

**Verificação:** `npx vitest run` → **190 arquivos, 1953 testes, verdes**. `eslint` limpo.
`tsc --noEmit` → só os 2 pré-existentes de `backup-storage.test.ts`. `npm run smoke:crm-fase1` → 23/23.
`tsc` pegou um erro real que lint/vitest/smoke deixaram passar (`unknown` não atribuível a `Decimal`) —
corrigido com o genérico antes do commit.

---

## P5 — Plano de fases e backlog · 2026-08-14 · Opus

**Feito:**
- `docs/crm/04-plano-fases.md` — **99 tarefas** de ≤ meio dia em 7 fases, cada uma com ID estável,
  dependências, critério de aceite verificável, ideia de origem, marca de risco alto, modelo de IA
  recomendado e se exige migration / `db:seed` no deploy / teste puro / smoke.
- **Fusão dos dois planos concorrentes** (decisão do usuário): o roadmap de Ondas A–F
  (`docs/superpowers/specs/2026-07-24-crm-comercial-roadmap.md`) foi absorvido e marcado como
  **superseded**. Os vereditos do dono foram todos preservados; só a ordenação por Ondas mudou.
- `CLAUDE.md` — um bullet novo em `## Architecture` apontando para `docs/crm/`, no formato dos
  bullets vizinhos (`legal`, Ajuda/Manual). Nada do que já existia foi reescrito.

**Decisões do usuário nesta sessão:**
- **Fundir** os dois planos num só (em vez de arquivar um ou manter os dois).
- **Sem feature flag** — substituição direta. O projeto não tem mecanismo de flag, e com o módulo
  contornado não há operação ativa a proteger. Nenhuma tarefa desenha convivência antigo/novo.
- **Ordem das 7 fases do playbook** (em vez de "adoção primeiro").

**Arquivos:** `docs/crm/04-plano-fases.md` (novo), `docs/crm/06-progresso.md`, `CLAUDE.md`,
`docs/superpowers/specs/2026-07-24-crm-comercial-roadmap.md` (cabeçalho de superseded).

**Verificação** (P5 é planejamento — nenhum código mudou, lint/test/build não se aplicam):
99 tarefas com ID · **zero** critérios de aceite vagos · as **34 ideias A–F todas endereçadas**
(alocadas, rejeitadas com veredito preservado, ou em "não coube" com o porquê) · as únicas 2
menções a "feature flag"/"convivência" estão na seção que declara o cancelamento.

**Pendências FECHADAS no mesmo dia (2026-08-14), viraram ADR-17/18/19:**
- **F2.1 → ADR-17:** a Próxima Ação **reaproveita `Compromisso`** em vez de tabela nova. O follow-up
  comercial passa a viver na agenda existente (visão mês/semana/dia + export `.ics` de graça).
  ⚠️ Custo aceito e virou tarefa bloqueante **F2.1a**: a agenda precisa de filtro por `tipo` **antes**
  de o volume comercial entrar, senão "Ligar para a Záphis" polui a visão de reuniões.
- **F2.2 → ADR-18:** prospecção qualificada **libera** a empresa. Só `IDENTIFICADO`,
  `CONTATO_INICIADO`, `EM_CONTATO` e `QUALIFICADO` travam. Decidido com dado real: `Záphis` aparece
  3× e `Rbarros` 2× — **múltiplas obras por cliente é o padrão do escritório**, travar brigaria com
  a operação. (Detalhe técnico anotado no schema: `NULL` é distinto em índice único no Postgres, então
  `campaignId` nulo precisa de `COALESCE` ou sentinela para cumprir a Q1.)
- **#13 → ADR-19:** `Parceiro` vira **entidade própria**, escolhida de lista. Saiu de "não coube" e
  virou **F1.23a–F1.23c** (model + CRUD/seleção + relatório de negócios por parceiro).
  ⚠️ A **regra de comissão** (percentual ou fixo? sobre proposto ou contratado? vence no aceite ou no
  recebimento?) **não foi decidida** — o schema nasce sem campo de comissão e nenhum cálculo será
  implementado até a regra existir. Inventá-la seria fabricar política financeira.

Backlog passou de 99 → **104 tarefas** (F2.1a, F2.1b, F1.23a, F1.23b, F1.23c).

**Riscos:** os 8 em `04-plano-fases.md` §7. O maior continua sendo **adoção, não técnica** — nenhum
backlog faz o time parar de contornar o módulo; por isso cada fase declara seu próprio gancho, e o
mais forte (proposta que ganha do Word, F1.22) foi puxado para dentro da Fase 1.

**➡️ PARADA OBRIGATÓRIA do playbook:** revisar `00` a `04` pessoalmente antes de qualquer código.
É o último ponto em que corrigir rumo custa texto, não implementação.

---

## P4 — Plano de migração de dados · 2026-08-13 · Opus

**Feito:**
- `scripts/auditoria-crm.ts` — auditoria pré-migração, **100% somente leitura** (item 1 do P4).
  Rodado em dev (só `seed:demo`, inútil para decidir) e depois **em produção** pelo usuário.
- `docs/crm/03-migracao.md` — escrito como plano de 4 fases e **reescrito por completo** depois dos
  números de produção. O plano EXPAND→BACKFILL→SWITCH→CONTRACT foi **descartado**.
- Q2 e Q3 **fechadas com dado de produção**.

**O achado que decidiu tudo:** o módulo Comercial não é pouco usado — é **contornado**. 8 leads,
1 proposta *sem itens*, 0 atividades, 0 contatos, 0 oportunidades; contra **31 projetos e 46 clientes**.
O trabalho entra direto como `Projeto`; propostas e histórico comercial vivem fora do SenaHub.
Não há migração de dados relevante: o plano virou backup → schema novo → mover 8 leads à mão →
fundir 3 duplicatas de cliente → consolidar 24 grafias de disciplina.

**Outros achados de produção:**
- `Lead.origem` era para ser canal de aquisição, mas foi preenchido com **nome de empreendimento**
  (confirmado pelo usuário). Os 8 valores viram canal "Outro" com o texto preservado; `CanalAquisicao` e
  `Campanha` nascem **vazios** — não há de-para a fazer.
- 3 grupos de `Cliente` duplicado por nome (MADANO ×2, Záphis ×3, Nominal Engenharia ×2). Zero por
  documento — o índice único parcial não está bloqueado. A normalização se validou casando
  `NOMINAL ENGENHARIA` com `Nominal Engenharia LTDA`.
- 100% dos leads caíram em "ambíguo", mas isso é a **regra medindo a coisa errada**: R3/R4 tratam
  "sem proposta" como anomalia, quando aqui é o estado normal (existe 1 proposta em todo o sistema).

**Arquivos:** `docs/crm/03-migracao.md` (novo, reescrito), `scripts/auditoria-crm.ts` (novo),
`docs/crm/01-decisoes.md` (Q2/Q3 fechadas + nota pós-auditoria), `docs/crm/06-progresso.md` (novo).

**Verificação:** `npx eslint scripts/auditoria-crm.ts` → limpo.
`npx tsc --noEmit -p tsconfig.server.json` (com `--max-old-space-size=8192`, senão estoura heap) → 2 erros,
ambos **pré-existentes** em `src/lib/backup-storage.test.ts` (commit `d27e270`), nenhum no código novo.
`next build` não rodado: nada do bundle mudou e o CLAUDE.md alerta contra buildar com `next dev` ativo.

**Pendente:** nada bloqueando o P5.
- ✅ Nomenclatura `Negociacao` aprovada pelo usuário. `DisciplinaPadrao` **cancelado** (ver correção no topo).
- ✅ `Lógica` vs `CFTV`: são disciplinas **diferentes**; as 3 strings compostas viram `Cabeamento` + `CFTV`,
  desmembradas à mão (`Disciplina` carrega valor de pagamento, revisões e arquivos — não é `UPDATE` de texto).
- Decisões §2.1 (ordem R6/R7) e §2.2 (leads arquivados): **não se aplicam** — zero leads em `Perdido`,
  zero arquivados. Ficam documentadas para quando houver dado.

**Riscos:** os 6 em `03-migracao.md` §8. O mais concreto: fundir cliente duplicado pode mover projeto de
obra para a empresa errada (31 projetos em 46 clientes). O mais importante: **o risco real é de adoção,
não técnico** — migrar 8 leads é trivial, fazer o time parar de contornar o módulo é o problema de verdade.

---

## P3 — Schema alvo · 2026-08-13 · Sonnet

**Feito:** `docs/crm/02-schema.md` — diagrama ER em Mermaid, definição Prisma de cada entidade, índices
com a query que cada um serve, unicidade parcial de CNPJ, derivação do status comercial da Empresa.
Schema real **não** foi tocado; nenhuma migration gerada.

**Arquivos:** `docs/crm/02-schema.md` (novo).

**Pendente:** nada. Nomenclatura `Negociacao` aprovada pelo usuário; a proposta `DisciplinaPadrao` foi
**cancelada** — o catálogo `DisciplinaCatalogo` já existia (ver correção no topo deste arquivo).

**Riscos:** documentados em §8. Destaques: o funil de prospecção deixa de ser configurável (`FunilEtapa`)
e vira enum fixo — perda deliberada de flexibilidade em troca de eliminar o `etapaEhPerdido()` por
substring; e `Proposta.projetoId` deixa de ser o único caminho para o `Projeto` (ADR-06), o que cria
dois lugares respondendo "de onde veio esse projeto".

---

## P2 — Decisões de produto (ADR) · 2026-08-13 · Sonnet

**Feito:** `docs/crm/01-decisoes.md` — 16 ADRs (tabela A.3) + 7 decisões transversais (LGPD, permissões,
soft delete, moeda, timezone, enums/labels, Timeline × AuditLog). Defaults do playbook aceitos, com uma
exceção: **ADR-15 revisado** — o usuário optou por manter as permissões atuais (`comercial:ver`/`gerir`,
sem gate de dono), descartando o default "edita só responsável + admin".

**Arquivos:** `docs/crm/01-decisoes.md`.

**Pendente:** Q2 e Q3 (ver P4).

**Riscos:** conflitos com o código atual registrados ADR a ADR. O mais direto: `excluirOportunidade`
faz hard delete hoje e passa a ser soft delete — mudança de comportamento visível para quem usa.

---

## P1 — Auditoria do Comercial · 2026-08-13 · Sonnet

**Feito:** `docs/crm/00-auditoria.md` — modelo de dados, código, comportamento real, classificação
REAPROVEITAR/EVOLUIR/MIGRAR/DEPRECIAR, 11 inconsistências e 9 riscos de migração.

**Arquivos:** `docs/crm/00-auditoria.md`.

**Achado principal:** o model `Oportunidade` tem um comentário no schema dizendo "estágio entre Lead e
Proposta", mas **não tem FK para nenhum dos dois** — é uma feature isolada, com Kanban próprio, que
nunca se conectou ao fluxo real. Zero testes cobrem o módulo Comercial (0 de 186 arquivos de teste).

**Pendente na época:** contagens de volume — o banco de dev estava fora do ar (`ECONNREFUSED`).
Resolvido no P4 com `scripts/auditoria-crm.ts`, mas os números continuam sendo de demo.

---

## P0 — Reconhecimento do repositório · 2026-08-13 · Sonnet

**Feito:** resposta em chat (sem arquivo, conforme o playbook): stack, organização, como são feitas as
mutações, camada de services, comandos, testes, permissões, multi-tenant, timezone/moeda, riscos.

**Achados que valem para todas as fases:** não é multi-tenant (nenhum `tenantId` no schema); toda mutação
passa por `defineAction` com auditoria automática; valores monetários já são `Decimal(14,2)`; o Comercial
não tem nenhum teste.
