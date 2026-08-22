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

## F4.1 — Campos de lista do Sales Navigator · 2026-08-22 · Sonnet

**Feito:** `Cliente`/`ContatoCliente` ganham `listaSalesNavigator` (Boolean, default `false`),
`dataInclusaoLista` (DateTime?), `statusAbordagem` (novo enum `StatusAbordagem`: NAO_ABORDADO →
ABORDADO → RESPONDEU | SEM_RESPOSTA | RECUSADO). Filtro "lista SN" ligado em `/clientes`:
`ListarClientesOpts.listaSalesNavigator` → `buildWhere` → URL `?listaSN=1` → Select na
`ClientesView`, mesmo padrão dos filtros existentes (`status`, `segmentoId`).

**Decisão de modelo do dono:** o backlog pedia Haiku; ficou em Sonnet a pedido explícito
(2026-08-22), registrado aqui por transparência do processo.

**`statusAbordagem` é funil PRÓPRIO, não reaproveita `StatusRelacionamentoContato`.** O primeiro
acompanha "ainda nem tentei → tentei → resultado" da campanha de outbound; o segundo é o vínculo
da pessoa com a empresa dela (ativo/afastado/saiu). Confundir os dois faria uma mudança de emprego
parecer uma resposta de prospecção.

**100% aditivo, sem backfill.** Os 46 clientes/8 leads reais e todo o dataset de dev nascem
`listaSalesNavigator=false` — ninguém "já estava na lista" retroativamente, é o oposto: a lista é
curadoria vindo daqui pra frente. `statusAbordagem` nasce `NAO_ABORDADO` em todo mundo pelo mesmo
motivo (o outbound do Sales Navigator não existia antes desta tarefa).

**Migração com drift** — `migrate dev` pediu reset (drift em `pendencia`/`pendencia_anexo`,
pré-existente, nada a ver com esta tarefa). Caminho da skill `/nova-migracao`: `db push` → SQL
escrito à mão (sem shadow DB configurado neste dev, mesma causa-raiz de F1.15/F1.16) → `migrate
resolve --applied`. `prisma/migrations/20260822090000_crm_f41_sales_navigator_lista/`.

**Arquivos:** `prisma/schema.prisma` (campos + enum + 2 índices); migration acima;
`src/modules/clientes/queries.ts` (`ListarClientesOpts.listaSalesNavigator`, `buildWhere`);
`src/app/(dashboard)/clientes/page.tsx` (`?listaSN=1`); `src/components/clientes/clientes-view.tsx`
(Select "Lista SN").

**Verificação:** `prisma validate` ok, eslint limpo, tsc limpo, 2181 testes, build ok,
`smoke:crm-fase1/2/3` sem regressão. Ensaiado no dev direto (fora de smoke formal, tarefa pequena
demais pra script próprio): marcado 1 cliente, `listarClientesPaginado({})` = 27,
`listarClientesPaginado({ listaSalesNavigator: true })` = 1, achou o certo, `statusAbordagem`
default confirmado `NAO_ABORDADO`. Dev limpo depois (flag desfeita).

**Pendente:** verificação em browser (`/clientes` → Select "Lista SN" → filtra a tabela) — sem
chromium-cli neste ambiente, mesma lacuna recorrente da Fase 3. F4.3 é quem de fato ESCREVE
`statusAbordagem` (registrar abordagem); por ora o campo existe e filtra, mas nada na UI ainda
marca um cliente como "lista SN" — isso também é F4.3 (fluxo rápido de prospecção).

---

## F3.11 — FECHO DA FASE 3 · 2026-08-21 · Sonnet

**Os 4 verdes:** `eslint` limpo (repo inteiro) · `vitest run` **2181 testes** · `npm run build` ✓
· `smoke:crm-fase3` **23/23** (17 F3.7 + 6 F3.8). Sem regressão: `smoke:crm-fase1` e
`smoke:crm-fase2` continuam verdes.

**FASE 3 FECHADA.** F3.1–F3.10, dez tarefas: timeline unificada (`Atividade`), timeline
automática + hooks, dívida de auditoria (ADR-20), registro manual em 2 cliques, templates de
nota, `<Timeline>` reutilizável, Empresa 360, sinal de reativação, `AnexoLead → Documento`,
`kpi-card.tsx` compartilhado.

**Pendente, fora do código (não bloqueia o fecho, mas fica registrado):**
- **F3.9 em produção** — script pronto e ensaiado no dev (`scripts/migrar-anexos-lead-f39.ts`),
  mas o `--gravar` contra o banco real ainda não rodou. Comando: dry-run primeiro, `--gravar`
  só com autorização explícita.
- **Verificação em browser** — F3.4, F3.6, F3.7, F3.8, F3.9, F3.10 todas com essa lacuna:
  sem chromium-cli neste ambiente, a prova ficou em tsc/eslint/vitest/build/smoke, não em
  clique real. Fica para o usuário conferir visualmente antes de considerar a fase 100% provada.
- **Fase 6 herda o follow-up de F3.10** — as ~12 telas com o mesmo padrão de KPI card fora do
  Comercial (financeiro, ponto, qualidade, dashboard raiz), listadas no registro da F3.10.

---

## F3.10 — `ui/kpi-card.tsx` compartilhado · 2026-08-21 · Sonnet

**Feito:** `KpiCard`, com 2 variantes — `"padrao"` (o `<Card>` cheio do dashboard `/comercial`)
e `"compacta"` (o tile denso da Empresa 360, F3.7). São visuais DIFERENTES porque já eram
diferentes antes; a tarefa é nomear e compartilhar, não uniformizar aparência.

**Migrado (Comercial, os 2 pontos do backlog):**
- `/comercial` (dashboard raiz) — os cards "Aceitas no mês" e "Leads ativos", que eram markup
  `<Card><CardHeader>…` repetido duas vezes na mesma página.
- `empresa-360-view.tsx` (F3.7) — os 6 indicadores, que já nasceram com o comentário "F3.10 troca
  isto" apontando exatamente para cá.

**A contagem "7 duplicatas" do backlog está subestimada — corrigido aqui.** `grep` pela mesma
assinatura visual (`CardDescription` mono/uppercase + `CardTitle` grande) achou o padrão em **12
arquivos fora do Comercial**, alguns com várias ocorrências na mesma página (`qualidade/page.tsx`
sozinho tem 8): `financeiro/dfc-view.tsx`, `financeiro/folha/folha-view.tsx`,
`financeiro/orcamento-view.tsx`, `financeiro/relatorios/relatorios-view.tsx`,
`financeiro/relatorios/rentabilidade-view.tsx`, `ponto/espelho-view.tsx`, `ponto/ponto-view.tsx`,
`financeiro/balanco/page.tsx`, `financeiro/fluxo-caixa/page.tsx`, `financeiro/page.tsx`,
`(dashboard)/page.tsx`, `qualidade/page.tsx`. Exatamente o que o aceite previu ("as demais
listadas na PR como follow-up") — ficam registradas aqui, não migradas nesta tarefa: são módulos
diferentes, cada migração merece revisão própria em vez de um PR que toca 12 arquivos de uma vez.

**`MetaCard` NÃO é candidato.** Tem barra de progresso, form de edição inline e lógica própria —
é um widget, não um "número com rótulo". Confundir os dois deixaria o `KpiCard` inchado com props
que só uma tela usa.

**Arquivos:** `src/components/ui/kpi-card.tsx` (novo); `src/app/(dashboard)/comercial/page.tsx`
(2 cards migrados); `src/components/comercial/empresa-360-view.tsx` (6 indicadores migrados, função
`Indicador` local removida).

**Verificação:** eslint limpo, tsc limpo, 2181 testes (inalterado — troca de markup, nenhuma regra
nova), build ok. Visual conferido por leitura: as duas variantes reproduzem o JSX anterior
elemento a elemento (mesmas classes Tailwind, mesma estrutura), sem prop nova sendo usada nos
call sites migrados que mudasse o resultado.

**Pendente:** verificação visual em browser — sem chromium-cli neste ambiente, mesma lacuna já
registrada nas tarefas anteriores da Fase 3.

---

## F3.9 — `AnexoLead` → `Documento` (script pronto, dry-run ensaiado, `--gravar` PENDENTE em produção) · 2026-08-21 · Sonnet

**Feito:** `scripts/migrar-anexos-lead-f39.ts` — migra os anexos do lead para `Documento`
genérico, ancorado no cliente. Ensaiado no dev com fixture (não há `anexo_lead` real fora de
produção): dry-run, abort ao detectar lead sem `clienteId`, `--gravar`, idempotência (rodar 2×
não duplica), e confirmação de que o `Documento` migrado aparece em `documentosDoCliente()`
(bucket "Gerais do cliente") com `downloadUrl` funcionando pela rota genérica
`/api/documentos/[id]/download`.

**Emenda ao backlog: zero migration de schema, não "M".** `Documento` já tem tudo que precisa —
`clienteId` obrigatório, `origem: "comercial"` já em uso desde sempre para anexo de PROPOSTA
(`documentos-cliente/actions.ts:78`), `propostaId`/`projetoId` opcionais (documento "geral do
cliente" já é caso legítimo hoje). Migrar é só leitura de uma tabela + escrita na outra, mesma
forma que `criarDocumento` já usa. Mesmo padrão da F1.7: backlog escrito antes de olhar o dado,
corrigido quando o código mostrou que a premissa não se sustentava.

**Arquivos NÃO se movem — só a linha do banco.** `AnexoLead.caminho` e `DocumentoVersao.caminho`
são o mesmo tipo de valor (caminho relativo sob `STORAGE_BASE_PATH`). A migração cria uma SEGUNDA
referência ao mesmo arquivo em disco; nada é copiado, movido ou reescrito. É por isso que o
⚠️⚠️ do backlog ("arquivos fora do dump do banco") não se aplica aqui como risco de execução — o
risco que aquele aviso descreve é sobre BACKUP (não capturar o storage), não sobre esta migração.

**Por que os 4 reais devem resolver:** `Documento.clienteId` é NOT NULL; `AnexoLead.lead.clienteId`
é nullable (F2.3) — mas a F2.18 (produção, mesma data) preencheu `clienteId` nos 8 leads reais, e
os 4 anexos pertencem a leads desse grupo. O script ainda assim CONFERE e recusa rodar por inteiro
se algum não resolver (mesmo padrão de "recusa executar" da F2.18) — nunca supõe vínculo.

**Idempotência sem coluna nova:** cada `Documento` migrado carrega `"Migrado de
anexo_lead:<id>"` no `descricao` — reprocessar filtra por essa marca antes de criar.

**Escopo deliberadamente NÃO incluído:** o caminho de UPLOAD (`adicionarAnexoLead`,
`LeadAnexos` em `lead-dialog.tsx`) continua escrevendo em `AnexoLead`, sem redirecionar para
`Documento`. O aceite pede migrar o que já existe e manter `anexo_lead` "aditivo" — não pede
unificar o fluxo de escrita, e fazer isso agora exigiria decidir o comportamento para leads sem
`clienteId` (que a F3.8 reduz, mas não elimina). Fica registrado como próximo passo natural, não
como pendência desta tarefa.

**Arquivos:** `scripts/migrar-anexos-lead-f39.ts` (novo). Nenhum arquivo de `src/` mudou — a
migração não precisou de nenhuma query/action nova, só reusou `documentosDoCliente` (F3.7/anterior)
e a rota de download genérica (já existente).

**Verificação:** eslint limpo, tsc limpo, 2181 testes (inalterado — nenhuma lógica nova em `src/`
pra testar; a prova é o dry-run/gravar/idempotência ensaiados contra o Postgres real do dev), build
ok. Fixture criada e apagada (cliente + 2 leads + anexo válido + anexo órfão + documento migrado),
dev conferido sem sobra.

**Pendente — decisão do dono antes de rodar em produção:**
1. Confirmar que os 4 anexos reais realmente resolvem (rodar o script SEM `--gravar` em produção
   primeiro — se o `ABORTANDO` aparecer, algum lead perdeu o `clienteId` da F2.18 e precisa de
   investigação antes de qualquer coisa).
2. Rodar com `--gravar` em produção. ⚠️⚠️ Nenhum arquivo em disco muda, mas é escrita em produção
   — segue a disciplina de sempre: dry-run primeiro, `--gravar` só com autorização explícita.
3. Depois de gravado: abrir `/clientes/[id]` de uma das empresas afetadas e conferir visualmente
   que o documento aparece em "Gerais do cliente" e baixa — sem chromium-cli neste ambiente, essa
   parte fica para verificação manual do usuário (mesma lacuna já registrada em F3.4/F3.6/F3.7/F3.8).

---

## F3.8 — Sinal de reativação · 2026-08-21 · Sonnet

**Feito:** ao criar um lead pelo `LeadDialog` (o único ponto de criação de prospecção hoje — o
`FunilBoard` legado em `/comercial`), digitar o nome de uma empresa que já tem histórico mostra um
alerta ANTES de salvar: nome, contratos/negociações anteriores, e um botão "Vincular" que grava o
`clienteId` no lead que está nascendo.

**Reusa `candidatosDuplicata()` (F1.12/F1.13) num propósito diferente.** A mesma detecção "quase
igual" que já protege o cadastro de Cliente contra duplicata agora serve para OFERECER herdar
histórico, não para alertar sobre duplicar. Só nome entra na comparação (o form de lead não tem
documento nem e-mail de empresa); só matches fortes (nome exato ou similaridade ≥ 0,85, mesmo
limiar padrão da função) chegam à tela. `buscarEmpresaParaVincular()` (nova, `queries.ts`) filtra
por fim para "tem histórico de verdade" — uma homônima vazia (0 projetos/negociações/propostas)
não é sinal de reativação, é só coincidência de nome, e o smoke prova exatamente essa distinção
com duas empresas de nome idêntico, uma vazia e uma com 50 projetos.

**`Lead.clienteId` agora pode nascer preenchido.** Até aqui `criarLead` nunca aceitava
`clienteId` — é por isso que os 8 leads reais chegaram todos órfãos na F2.18, exigindo ligação à
mão depois. `criarLeadSchema` ganhou o campo (opcional, só chega preenchido quando o usuário clica
"Vincular"); `criarLead` valida a existência antes de gravar (`validarClienteId`, mesmo padrão
defensivo de `validarParceiroId` — Server Action aceita payload arbitrário, "veio de um botão que
só mostra empresa real" não é garantia no servidor). O resto da cadeia já funcionava sozinho:
`registrarAtividade` (F3.2) já só dispara quando há `clienteId`, então um lead vinculado já nasce
com o evento PROSPECCAO_CRIADA na timeline da empresa, sem tocar nesse código.

**Fora de `defineAction` de propósito:** `buscarEmpresaParaVincularAction` (busca-enquanto-digita,
debounce 400ms) é leitura, não mutação — gravar `AuditLog` a cada tecla poluiria a auditoria sem
nenhum "o quê mudou" pra registrar. Mesmo padrão de `obterTemplatosNotas` (F3.5). Ainda exige
sessão + `comercial:gerir` (checado à mão, já que não passa pelo gate do `defineAction`) porque
devolve nome e contagem de projetos de empresas que talvez não apareçam pra todo mundo.

**Arquivos:** `src/modules/comercial/queries.ts` (`buscarEmpresaParaVincular`);
`src/modules/comercial/schemas.ts` (`clienteId` em `criarLeadSchema`,
`buscarEmpresaParaVincularSchema`); `src/modules/comercial/actions.ts` (`validarClienteId`,
`clienteId` em `criarLead`, `buscarEmpresaParaVincularAction`);
`src/components/comercial/lead-dialog.tsx` (banner + debounce + estado de vínculo);
`scripts/smoke-crm-fase3.ts` (6 checks novos).

**Verificação:** eslint limpo, tsc limpo, 2181 testes (suíte não cresceu — a lógica nova é
composição do que F1.12/F3.7 já cobrem; a prova daqui é o smoke), build ok,
`npm run smoke:crm-fase3` 23/23 verde (17 da F3.7 + 6 da F3.8), smokes das Fases 1 e 2 sem
regressão. Provado no banco: nome exato acha a empresa certa e ignora a homônima vazia, erro de
digitação de 1 caractere ainda casa, nome sem relação nenhuma não casa, busca com menos de 3
caracteres nem roda.

**Pendente:** verificação em browser do fluxo completo (digitar → ver o alerta → clicar Vincular →
lead nasce com `clienteId` → timeline da empresa mostra o evento) — sem chromium-cli neste
ambiente, mesma lacuna já registrada em F3.4/F3.6/F3.7. O `criarLead` com `clienteId` preenchido
não foi exercitado ponta a ponta pelo smoke porque é uma `defineAction` (exige sessão, que scripts
não têm) — o que o smoke prova é a busca (`buscarEmpresaParaVincular`) e a validação
(`validarClienteId`, coberta pelo mesmo padrão já provado para `validarParceiroId`).

---

## F3.7 — Empresa 360 · 2026-08-21 · Opus

**Feito:** a tela que responde "tudo o que já aconteceu com esta empresa" — resumo comercial,
7 indicadores e 6 abas (Timeline / Contatos / Prospecções / Negociações / Propostas / Projetos).

**Onde mora, e por quê:** dentro de `/clientes/[id]`, **não** numa rota nova em `/comercial`. A
ficha do cliente já É a página da empresa (cadastro, financeiro, contatos, projetos, documentos);
uma segunda tela para a mesma entidade seria exatamente a fragmentação que a reforma existe para
desfazer, e a F3.8 não saberia para onde linkar. O card **"Histórico" bespoke morreu** — remontava
eventos em memória a partir de `createdAt` de projeto/proposta/lançamento a cada leitura; a
timeline de `Atividade` (F3.1/F3.2) é a versão gravada do mesmo card. `historicoCliente()` segue
exportada mas sem chamador.

**Gate separado.** A 360 é dado comercial numa página gateada por `clientes:ver`. Conferido no
banco: **nenhum perfil hoje tem `clientes:ver` sem `comercial:ver`** — mas a matriz é dado editável
pela tela, então a seção é gateada por `can(user, "comercial", "ver")`. Custa uma chamada e evita
que uma edição futura de perfil vaze funil de vendas para quem só devia ver o cadastro.

**Dinheiro vem de `Projeto`, não das tabelas comerciais.** Produção tem 31 projetos contra 1
proposta sem itens e 0 negociações — o Comercial é contornado. "Valor acumulado" e "ticket médio"
derivados de `Negociacao`/`Proposta` mostrariam **R$ 0 para toda empresa real**, matando justamente
a tela que deveria justificar o registro das fases anteriores. Saem de `Projeto.valorContrato`;
`Negociacao` alimenta os indicadores de FUNIL (abertas/encerradas/contratadas), que é o que ela
sabe responder hoje.

### ⚠️ O aceite de performance: medido, e o número literal não fecha

O backlog pede "log do Prisma: **≤ 5 queries** para a página inteira, nenhuma em laço". Medido pelo
`scripts/smoke-crm-fase3.ts` (novo), que conta os eventos de query do próprio Prisma:

| | chamadas ao client | statements SQL |
|---|---|---|
| `empresa360()` | **4** | **14** |

As 4 chamadas são `cliente.findUnique` + `negociacao.groupBy` + `projeto.aggregate` +
`compromisso.findMany`. Viram 14 statements porque **o Prisma emite um SELECT por relação
aninhada** — as 6 listas das abas, o `segmento`, e os `autor`/`responsavel` de dentro delas.

**O que o critério realmente protege está provado.** O smoke monta duas empresas — uma com 50
projetos / 200 atividades / 30 contatos / 12 negociações, outra com 1 de cada — e assere que as
duas gastam o **mesmo** número de consultas: `magra=14 vs gorda=14`. Se qualquer lista estivesse
sendo percorrida com uma ida ao banco por item, esse número dispararia. É a prova de "nenhuma em
laço" sem depender de cronômetro, que varia com a máquina.

**Não baixei o número artificialmente.** As duas saídas seriam `$queryRaw` (perde a extensão de
soft delete — a mesma que já causou bug de leitura aninhada neste módulo) ou ligar o preview
`relationJoins` do Prisma 7 (colapsaria para ~4 via LATERAL JOIN, mas é feature em preview mexendo
no ORM inteiro para melhorar uma página). Nenhuma das duas troca é boa. `EXPLAIN` e afinação de
índice são a **F6.11**, que existe exatamente para isso — fica registrado lá.

**Decisão pendente do dono:** aceitar 4 chamadas / 14 statements como cumprimento do critério, ou
tratar como dívida a resolver na F6.11.

**Outras garantias travadas no smoke:** toda lista é limitada por `take` (25 nas abas, 50 na
timeline) e **todo indicador conta o BANCO**, nunca `array.length` — senão a aba mostraria 25 e o
número ao lado 50, e quem lê concluiria que um dos dois está errado. Quando trunca, a tela diz
("mostrando 25 de 50"). Contato soft-deletado some da aba **e** do indicador (leitura aninhada não
passa pela extensão do `lib/prisma.ts` — o `where` é explícito nas três relações que têm
`excluidoEm`, exatamente como o comentário daquele arquivo já antecipava para "a Empresa 360").

**Arquivos:** `src/modules/comercial/empresa-360/queries.ts` (novo);
`src/components/comercial/empresa-360-view.tsx` (novo); `src/app/(dashboard)/clientes/[id]/page.tsx`
(troca o card Histórico, absorve a query, gate comercial); `src/lib/prisma.ts`
(`PRISMA_LOG_QUERIES=1` opt-in + base exposta em `globalThis` — `$extends` devolve client sem
`$on`); `scripts/smoke-crm-fase3.ts` (novo, 17 checks); `package.json` (`smoke:crm-fase3`).

**Nota para a F3.10:** os cards de indicador ficaram num componente local (`Indicador`) de
propósito — quando o `ui/kpi-card.tsx` compartilhado nascer, a migração daqui é uma troca de uma
linha, não uma caça pelo arquivo.

**Verificação:** eslint limpo, tsc limpo (precisou de `--max-old-space-size=8192`; o `build.mjs` já
bumpa heap pelo mesmo motivo), 2181 testes, build ok, `smoke:crm-fase3` 17/17 verde,
`smoke:crm-fase1` e `smoke:crm-fase2` sem regressão, e o dev conferido sem sobra do smoke.

**Pendente:** verificação em browser (o aceite também diz "browser") — sem chromium-cli neste
ambiente, mesma lacuna já registrada na F3.4/F3.6. A **aba Anexos** do enunciado não virou aba: o
card "Documentos" que já existe na página (`documentosDoCliente`, 1 query, já era chamado) é a
mesma coisa e continua onde estava. A **F3.9** migra `AnexoLead` para dentro dele — é lá que os dois
viram um só.

---

## F3.6 — `<Timeline>` reutilizável · 2026-08-21 · Sonnet

**Feito:** `src/components/ui/timeline.tsx` — domain-agnostic de propósito (como todo `ui/*`):
recebe `tipo` como `string` solto em vez de importar `TipoAtividade`, filtro por tipo é opcional
(`tipos?`) e só aparece se o chamador passar rótulos. Scroll infinito via sentinela +
`IntersectionObserver`: a janela visível cresce em `pageSize` (padrão 20) quando o sentinela entra
na viewport; trocar o filtro reseta a janela, senão sobrariam "buracos" na primeira página depois
de filtrar.

**Nota de escopo (paginação é só de RENDER, não de rede):** o array inteiro de eventos já chega
pronto do servidor — mesmo dado que os componentes antigos recebiam. O aceite ("500 eventos carrega
só a 1ª página") é sobre o que a tela ocupa, não sobre uma nova query por página: com centenas de
eventos numa timeline comercial o array inteiro ainda é leve. Paginar de verdade no servidor é outro
problema (histórico completo de `AuditLog`), fora do escopo aqui.

**Levantamento dos "3 renderizadores bespoke":** hoje só sobra **1 renderizador vivo** com dado
estruturado — `NotasHistorico`, usado por `lead-detalhe-view.tsx` (a ficha atual, com
`atividadesTimeline` já trazendo `tipo` desde a F3.1/F3.2). O 2º candidato histórico
(`oportunidades-view.tsx`, citado em `00-auditoria.md`) **já não existe** — código apagado em fase
anterior junto com o resto de `Oportunidade`. Sobra um 3º ponto, `lead-dialog.tsx` (modal do
`FunilBoard` **legado**, `/comercial` raiz) — também usa `NotasHistorico`, mas só enxerga
`AtividadeLead` (a query `funilCompleto()` não inclui `atividadesComerciais`), então não tem `tipo`
pra filtrar. **Migrado:** `lead-detalhe-view.tsx` → `<Timeline>`, com `ATIVIDADE_ICONE` (ícone por
canal, novo, também usado pela popover da F3.4) e o filtro alimentado por `TIPO_ATIVIDADE_LABEL`.
**Fora de escopo, declarado aqui:** `lead-dialog.tsx`/`NotasHistorico` — é UI do funil legado
(`FunilEtapa`, já deprecado desde a F2.3) sem o dado que o filtro precisa; portá-lo empurraria
`atividadesComerciais` para dentro de uma query que serve uma tela em extinção. Fica pra quando o
`FunilBoard` for removido de vez.

`mesclarTimeline()` ganhou o campo `tipo` no `ItemTimeline` — legado (`AtividadeLead`, sem coluna de
canal) vira `"NOTA"` (mesmo catch-all de `tipoAtividadeDe`), novo (`Atividade`) preserva o `tipo`
real. 2 testes novos cobrindo os dois lados.

**Arquivos:** `src/components/ui/timeline.tsx` (novo); `src/components/comercial/atividade-icones.tsx`
(novo, `ATIVIDADE_ICONE` compartilhado); `src/modules/comercial/atividade.ts` + `.test.ts` (`tipo`
em `ItemTimeline`); `src/components/comercial/lead-detalhe-view.tsx` (migração);
`src/components/comercial/registrar-interacao-popover.tsx` (passou a importar `ATIVIDADE_ICONE` em
vez de duplicar os ícones).

**Verificação:** eslint limpo, tsc limpo, 2181 testes (2 novos), build ok, `smoke:crm-fase2` ainda
verde (a mudança em `atividade.ts` não toca banco).

**Pendente:** prova de "500 eventos, só 1ª página" e "filtrar não recarrega" ficou por leitura de
código (render fatiado, filtro é `useState` local) — sem chromium-cli neste ambiente pra cronometrar
em navegador de verdade, mesma lacuna já registrada na F3.4.

---

## F3.4 — registro manual de interação em 2 cliques · 2026-08-21 · Sonnet

**Feito:** o contraponto manual do `registrarAtividade()` automático da F3.2 — ligação, WhatsApp,
e-mail, LinkedIn, reunião ou nota, disparados por quem vende, sem passar por um formulário.

- `resolverAncoraComercial()` extraído de dentro de `concluirProximaAcao` (era lógica inline) —
  agora reusado pelas duas operações que precisam de `{clienteId, responsavelId, nome}` a partir
  de `entidadeTipo`/`entidadeId` (LEAD/NEGOCIACAO/CLIENTE).
- `registrarInteracaoManual()` **lança** `ActionError` quando não há `clienteId` — ao contrário do
  `registrarAtividade()` automático (que engole e retorna `false`), aqui não existe operação de
  negócio para proteger: é *só* o registro, então sem empresa vinculada não há o que fazer além de
  recusar com mensagem clara ("vincule antes de registrar").
- Action `registrarInteracao` (`entidade: "Atividade"`, `entidadeId` do próprio registro criado —
  ainda cobre pelo teste da F3.3, `auditoria.test.ts` continua 4/4).
- UI: `RegistrarInteracaoPopover` — 1 clique abre, 1 clique no tipo registra. Os 5 tipos
  "rápidos" (ligação/whatsapp/e-mail/linkedin/reunião) têm descrição padrão pronta (“Ligação
  realizada.” etc.) e disparam sozinhos; só `NOTA` abre um campo de texto, porque não há "o que
  aconteceu" óbvio para adivinhar. Encaixado em três pontos: os dois Kanbans (ícone `+` no canto
  do card, `stopPropagation` para não brigar com o drag) e o cabeçalho da ficha do lead (botão
  "Registrar" por extenso).

**Arquivos:** `src/components/comercial/registrar-interacao-popover.tsx` (novo);
`src/modules/comercial/service.ts` (`resolverAncoraComercial`, `registrarInteracaoManual`);
`src/modules/comercial/schemas.ts` (`registrarInteracaoSchema`); `src/modules/comercial/actions.ts`
(`registrarInteracao`); `src/components/comercial/prospeccao-board.tsx`,
`negociacao-board.tsx`, `lead-detalhe-view.tsx` (encaixe); `scripts/smoke-crm-fase2.ts` (7 checks
novos, incluindo o caso de recusa por falta de empresa).

**Verificação:** eslint limpo, tsc limpo, 2179 testes (suíte não cresceu — nenhum teste puro novo,
a regra em si não tem lógica além do que a F3.1/F3.2 já cobrem; a cobertura daqui é o smoke), build
ok, `npm run smoke:crm-fase2` todo verde — provado no banco: `Atividade` nasce com o `tipo`
escolhido (não `SISTEMA`), a descrição é o texto exato (sem reescrita), ancora em `leadId` OU
`negociacaoId` conforme a origem, e lead sem `clienteId` é recusado com a mensagem certa em vez de
silenciado.

**Pendente:** "2 cliques, cronometrado" ficou provado por contagem de cliques no código, não por
cronômetro em navegador de verdade — não há chromium-cli neste ambiente. Sem achados chumbados.

---

## F3.2 + F3.3 — timeline automática (`registrarAtividade`) + fecha a dívida de auditoria · 2026-08-21 · Opus

**F3.2** — `registrarAtividade()` hookado em 11 pontos do fluxo (empresa/contato cadastrados,
prospecção criada, estágio alterado, negociação criada, proposta criada/enviada/revisada/aceita,
projeto criado, negociação perdida). Nunca lança — mesmo princípio do `logAudit`: falha ao gravar
histórico não pode desfazer a operação que o originou. Aceita `tx` opcional para entrar na mesma
transação do chamador (aceite de proposta: projeto e timeline nascem juntos ou nenhum nasce).
Aceite da proposta emite **2 eventos, não 3** — o terceiro (negociação→CONTRATADO) exigiria
`Proposta.negociacaoId`, que só nasce na F5.2; documentado como impossível hoje, não esquecido.

Regressão pega pelas próprias smokes: os hooks passaram a criar `Atividade` (FK NOT NULL para
`Cliente`), e a limpeza de `smoke-crm-fase1`/`fase2` apagava o cliente antes — corrigido nas duas.

**F3.3** — 23 das 31 actions do Comercial não passavam `entidadeId`: o `AuditLog` registrava que
"alguém editou um lead" mas não QUAL, e a tela de histórico por entidade (que filtra exatamente por
esse campo) não mostrava a linha em lugar nenhum. Fechado com `idResultadoOuInput` (id do retorno
quando cria, do input quando edita/apaga) + 3 casos explícitos fora do padrão (`nota-lead` audita o
Lead, não a nota; `converter-lead` audita o Lead do input, não o cliente que retorna;
`definir-meta` usa chave composta ano-mês). O aceite original era um `grep` manual — virou
`auditoria.test.ts`, que parseia os blocos de `defineAction` e falha se uma action nova nascer sem
`entidade`/`entidadeId`.

**ADR-20** (novo) formaliza a fronteira que a F3.2 criou sem documentar: `Atividade` é NARRATIVA
(pt-BR, sempre ancorada num Cliente, pode faltar quando não há empresa) vs `AuditLog` é TÉCNICO
(antes/depois, nunca falta). Registra também por que a timeline não é derivada do `AuditLog`: ele
não ancora em Cliente, e juntar Lead+Negociação+Proposta a cada leitura + traduzir JSON pra
português na tela seria pior que manter as duas.

**Arquivos:** `src/modules/comercial/atividade-eventos.ts` + `.test.ts` (novos, F3.2);
`src/modules/comercial/service.ts`, `actions.ts` (F3.2 hooks); `src/modules/clientes/actions.ts`
(F3.2, `criarCliente`/`adicionarContato`); `src/modules/comercial/auditoria.test.ts` (novo, F3.3);
`src/modules/comercial/actions.ts` (F3.3, `entidadeId` em 23 actions); `docs/crm/01-decisoes.md`
(ADR-20); `scripts/smoke-crm-fase1.ts`, `smoke-crm-fase2.ts` (limpeza corrigida).

**Verificação:** F3.2 — eslint/tsc limpos, 2175 testes (12 novos), build ok, smokes Fase 1 e Fase 2
verdes, provado no banco (aceite gera 2 eventos na mesma transação, 3 mudanças de estágio + perda
geram 5 eventos, metadata cru preservado). F3.3 — eslint/tsc limpos, 2179 testes (4 novos), build
ok, smoke Fase 2 verde.

**Nota de processo:** as duas tarefas foram feitas e commitadas (`9dd6c1a`, `03b861c`) na hora certa,
mas esta entrada do log só foi escrita depois, junto com a da F3.4 — lacuna notada e fechada aqui,
sem re-executar nada.

---

## F3.1 + F2.11 — nasce Atividade, e a F2.11 sai do bloqueio · 2026-08-21 · Sonnet

**F3.1** — model `Atividade` (`02-schema.md` §2.10), unificando `AtividadeLead` +
`AtividadeOportunidade` numa timeline única, sempre resolvendo para um `Cliente`. As duas tabelas
antigas ficam **deprecadas, não apagadas** — conferido no banco: `atividade_lead` seguiu com as 8
linhas reais, `atividade_oportunidade` intacta, a nova nasceu vazia.

`leadId`/`negociacaoId`/`propostaId`/`contatoId` são opcionais e **sem cascade** (`ON DELETE SET
NULL`): apagar um lead não deve apagar o rastro de que ele existiu. `metadata` é para dado
narrativo de eventos `SISTEMA` — não é o lugar do valor técnico anterior/novo, que segue sendo o
`AuditLog` (fronteira que a F3.3 vai formalizar).

Migration puramente aditiva, aplicada via o caminho manual de sempre (`db push` → SQL à mão →
`migrate resolve`) — `migrate dev` seguiu recusando pelo drift antigo.

**F2.11** — estava bloqueada até aqui porque seu aceite ("registra `Atividade`, atualiza última
interação") dependia de um model que não existia. Com a F3.1 pronta, destravou:

- `tipoAtividadeDe()` faz a ponte entre os dois enums que o design nunca fundiu de propósito:
  `TipoProximaAcao` (12 valores, a ação **a fazer**) e `TipoAtividade` (8 canais, o que **já
  aconteceu**). Os 7 sem equivalente direto (`FOLLOW_UP`, `COBRAR_*`, `ENVIAR_PROPOSTA`,
  `REVISAR_PROPOSTA`, `RETORNO_AO_CLIENTE`, `OUTRO`) viram `NOTA` — nada se perde, só a
  granularidade do canal, porque a descrição já carrega o título da ação.
- **"Última interação" não é escrita em lugar nenhum** — não existe coluna para isso. É derivada
  (`ultimaInteracaoDe`, o `createdAt` mais recente da timeline mesclada), e o efeito acontece
  sozinho no instante em que a `Atividade` nasce.
- **`Atividade` só é registrada quando a entidade resolve uma empresa.** `clienteId` é NOT NULL
  no schema, e `Lead.clienteId` segue nullable desde a F2.3. Concluir a ação **nunca falha** por
  causa disso — só a entrada na timeline fica de fora, sinalizado no retorno
  (`atividadeRegistrada`). Provado no dev: lead sem empresa conclui normalmente, zero `Atividade`
  criada.
- **Notifica o responsável**, só quando ele existe e é outra pessoa — cobre o assistente que
  registra em nome de quem vende. Sem auto-notificação quando quem conclui é o próprio
  responsável. Categoria nova (`comercial_interacao`) ainda sem alternância nas Preferências —
  registrado como pendência, não bug: o padrão é opt-out, então ninguém fica sem notificação só
  por a categoria ser nova.
- `mesclarTimeline()` junta o legado (`AtividadeLead`, texto em `nota`) com o novo (`Atividade`,
  em `descricao`) numa lista só, mais recente primeiro — o mínimo para a ficha do lead mostrar os
  dois períodos juntos. A consolidação de verdade, com componente reutilizável e scroll infinito,
  é a **F3.6**; este merge não tenta antecipá-la.

**UI:** card "Próxima ação" na ficha do lead com botão Concluir por pendência; "Última
interação" exibida; e o `FollowUpDialog` ganha `iniciarAberto`, reaberto automaticamente (troca
de `key`) depois de concluir — "sugere agendar a próxima sem sair da tela" sem um segundo
componente de diálogo.

**Provado contra o banco de dev, os 4 casos:** empresa + notificação ao responsável diferente ·
sem auto-notificação quando é a mesma pessoa · lead sem empresa não quebra e não registra
`Atividade` · mapeamento de tipo sem canal direto (`COBRAR_DOCUMENTACAO` → `NOTA`).

**Arquivos:** `prisma/schema.prisma`, migration `20260821000000_crm_atividade`,
`src/modules/comercial/atividade.ts` + `.test.ts` (novos), `service.ts`, `queries.ts`,
`lead-detalhe-view.tsx`, `follow-up-dialog.tsx`, a página de detalhe do lead.

**Verificação:** `eslint` limpo · `tsc` limpo (app e server) · `vitest run` **205 arquivos, 2163
testes** (9 novos) · `npm run build` ✓ (rodado depois de o dev server ser parado — a regra do
projeto é nunca buildar com `next dev` ativo, corrompe o `.next`) · `migrate status` em dia (180).

**Pendente da Fase 3:** F3.2 e F3.3 são **Opus** — `registrarAtividade()` com hooks automáticos em
toda mudança de estágio, e fechar a dívida de `entidadeId` em todas as actions do Comercial.

---

## F2.18 + F2.20 — migração dos leads reais e FECHO DA FASE 2 · 2026-08-21 · Opus

### F2.18 — o inventário mudou a natureza da tarefa

O backlog descrevia "mover os 8 leads para `Lead` v2 / `Negociacao`", supondo prospecções. O
inventário mostrou que **nenhum dos 8 é prospecção**: 6 na etapa antiga "Contratado" e 2 em
"Proposta enviada". Todos já passaram do funil de cima.

Seguir a descrição sem olhar o dado teria deixado **seis contratos fechados aparecendo como
"Identificado"** no board, e o forecast da Fase 6 nasceria errado. A fonte do estágio real era a
etapa antiga — que a F2.3 deprecou mas **manteve populada** exatamente para isto (§8.3).

**Resultado em produção:** 8 negociações criadas (6 CONTRATADO somando R$ 197.000, 2
PROPOSTA_ENVIADA somando R$ 46.500), leads sobreviveram em `OPORTUNIDADE_CRIADA`, 2 projetos
vinculados, todas com `needsReview = true`.

**Três decisões do dono, registradas no código:**
- **Vínculo de projeto só nos 2 inequívocos** (`RES. PLINIO PAIVA → 260024`, `SMERALDA → 260028`).
  Os outros 4 ficaram sem vínculo: dois têm nome divergente (`EDIF. MARMARES` vs `HOTEL MARMARES -
  TAMANDARÉ`, `EDIF. ISA BEACH` vs `ISA BEACH 2`) e dois não têm projeto. Errar aponta obra para o
  negócio errado.
- **Empresa dos órfãos derivada, não chutada:** estava em `Lead.nome` (a obra tinha ido para
  `origemDetalhada` no backfill da F1.23). O script **recusa executar por inteiro** se algum não
  resolver — provado no ensaio com um registro impossível: bloqueou tudo, não gravou nada.
- **`CP CONSTRUÇÃO` cadastrada** — nunca existiu entre os 41 clientes, nem com nome parecido
  (similaridade não achou nada acima de 40%). Nasce sem CNPJ, dentro da **mesma transação** da
  negociação: ou as duas existem, ou nenhuma. Criar fora deixaria empresa órfã se a negociação
  falhasse.

**Bug pego no ensaio, que teria parado a migração em produção:** o `lead.update` continuava usando
o `clienteId` do plano — string vazia no caso da empresa recém-criada — em vez do id real. `P2003`,
violação de FK. Apareceu porque a criação de empresa introduziu um instante em que o id **só existe
dentro da transação**, situação que não havia antes. Ensaiar contra o caso real foi o que separou
"compila" de "funciona".

### Duas verificações mortas encontradas e corrigidas

1. O smoke **pulava** `needsReview` dizendo "o campo ainda não existe" — a F2.3 já o criara. O
   smoke afirmava em produção que uma coluna existente não existia. Pior que checagem ausente:
   aparece na saída como se algo tivesse sido considerado.
2. Depois da F2.18, o smoke acusou **2 falhas** por uma criação de empresa **aprovada**. Falso
   alarme corrói a confiança tanto quanto alarme perdido. A expectativa passou a **se ajustar
   sozinha**, contando no `AuditLog` o que a F2.18 criou, em vez de eu subir a constante à mão e o
   smoke voltar a mentir na próxima vez.

Acrescentadas as checagens de aceite da própria F2.18 (uma negociação por lead, todas apontando de
volta, leads não apagados, exatamente 2 projetos vinculados).

### F2.20 — fecho

`scripts/smoke-crm-fase2.ts` (novo, `npm run smoke:crm-fase2`) — **30 checagens** cobrindo a
FIAÇÃO, que os testes puros não alcançam: transição recusada antes de tocar o banco, `leadId
@unique` barrando dupla qualificação, o índice da F2.5 recusando duplicata na mesma campanha,
reabertura limpando `dataFechamento` e motivo, próxima ação saindo e voltando à fila, e o contador
do board batendo com o banco sob filtro.

**Os quatro verdes:** `eslint` limpo · `vitest run` **2154 testes** · `npm run build` ✓ ·
`smoke:crm-fase2` **tudo verde** · `tsc` só os 2 pré-existentes · `migrate status` em dia (179).

**FASE 2 FECHADA.** 19 das 22 tarefas. Fora: **F2.11** (bloqueada pela F3.1 — seu aceite exige o
model `Atividade`, que é da Fase 3, e `ultimaInteracao`, que não existe no schema projetado;
dependência que o backlog não declara) e **F2.19** (opcional, o próprio plano recomenda adiar).

---

## Fase 2 em produção — deploy, falha e ADR-02 revisado · 2026-08-21 · Opus

**A Fase 2 está em produção.** 5 migrations aplicadas, build limpo, serviço no ar. Mas o deploy
**falhou no meio** e vale registrar o incidente inteiro, porque a causa se repete.

### O que quebrou

`prisma migrate deploy` abortou na F2.5 com **P3018 / 23505**:

```
não foi possível criar o índice único "lead_prospeccao_ativa_sem_campanha_unica"
DETAIL: Chave ("clienteId")=(cmr3kqb57006hywnu1x3z4t3j) está duplicada.
```

O serviço ficou parado com o banco a meio caminho: `crm_lead_v2_status_contatos` e
`crm_negociacao` aplicadas, `crm_lead_temperatura` **não** — e o build novo já esperava
`Lead.temperatura`. Subir o serviço ali teria trocado uma parada limpa por erro em tela.

### Erro meu, e de um tipo que eu já conhecia

**Medi o dev e inferi produção.** No dev, 8 de 8 leads tinham `clienteId` nulo, e como `criarLead`
nunca preenche esse campo, concluí que produção seria igual. Esqueci que **`converterLead`
preenche**: em produção, 6 dos 8 leads têm cliente. Verifiquei o ambiente errado e tratei a
inferência como fato.

Pior: eu **escrevi o aviso da colisão dentro da própria migration** — "Záphis tem 3 leads e Rbarros
2, o segundo UPDATE é recusado". Só que apontei o aviso para a **F2.18**, quando alguém fosse
preencher `clienteId` à mão. Não percebi que os leads **já tinham cliente**, então a colisão
explodiu antes, na criação do índice.

E a lição já estava dada na Fase 1: **F1.16 (índice único) veio depois da F1.15 (limpeza dos
dados)**, por este exato motivo. Não a apliquei aqui.

### Duas descobertas que valem mais que o incidente

**1. A colisão foi criada pela F1.15.** Os 3 leads da Záphis apontavam para 3 registros de cliente
distintos; a fusão os juntou sob `Zaphis Inc LTDA`. Nenhum dos dois passos estava errado
isoladamente — **a interação entre eles** produziu um estado que a regra proibia. É o tipo de
defeito que nenhuma revisão de tarefa isolada pega.

**2. A migration NÃO é atômica.** O primeiro índice (`..._campanha_unica`) **persistiu em
produção** mesmo com a falha do segundo, e o registro ficou com `finished_at: null` —
nem aplicada nem pendente, e o `migrate status` não a listava como falha. Eu havia suposto que o
Postgres reverteria o arquivo inteiro. Por isso a correção precisou de `IF NOT EXISTS`.

### ADR-02 revisado — o dado refutou a regra

As 3 prospecções da Záphis (EDIF. ARAPIRACA, ISA BEACH, BELA BEACH) são **obras reais e
simultâneas**. A regra "uma prospecção ativa por empresa" não corresponde à operação. O ADR-18 já
tinha chegado perto ("múltiplas obras por cliente é o padrão do escritório"), mas resolveu isso
liberando os status **terminais** — não previu várias obras **ativas ao mesmo tempo**.

**Decisão do dono: abandonar a regra sem campanha.** A regra sobrevive só dentro de uma mesma
campanha. Descartada a alternativa `(empresa, empreendimento)`, que manteria o espírito mas exige
um campo estruturado de empreendimento que hoje não existe.

### Recuperação

`migrate resolve --rolled-back` → migration corrigida (só o índice de campanha) → `migrate deploy`
aplicou as 5 → build → serviço no ar. Dev alinhado (índice extra dropado).

### Verificação morta encontrada de quebra

O `smoke-crm-prod` **pulava** a checagem de `needsReview` com o motivo "o campo ainda não existe em
`Lead`". A F2.3 criou o campo; a versão pulada continuou no script. O smoke passou a **afirmar em
produção que uma coluna existente não existia** — pior que checagem ausente, porque aparece na
saída como se algo tivesse sido considerado. Trocada por `colunaExiste()`, que decide em execução,
mais três checagens novas — incluindo uma que vigia se o índice removido reapareceu.

**Pendente:** F2.18 (migrar os 8 leads — agora sem o obstáculo do índice), F2.11 (bloqueada pela
F3.1), F2.19 (opcional) e F2.20 (fecho).

---

## F2.12 → F2.17 — temperatura, os dois boards, filtros e contato rápido · 2026-08-20 · Opus

**Seed sintético primeiro** (`npm run seed:crm-fase2`). O `seed:demo` não conhece o funil novo:
dev tinha **0 negociações**, 1 contato e 8 leads todos em `IDENTIFICADO`, então o board da F2.14
renderizaria vazio e não haveria como conferir contador, soma, frescor ou "sem próxima ação".

O usuário ofereceu uma cópia anonimizada do banco de produção; **recusada com o motivo**:
`AuditLog.detalhe` (JSON livre com o antes/depois de toda mutação), mensagens de chat e dezenas de
campos de observação são texto livre que **não se mascara de forma confiável, só se trunca** — e o
que falta ao dev é forma e volume, não conteúdo real. Além disso a restauração reverteria o schema
da Fase 2 (dev em 176 migrations, produção em 173). Ficou combinado que a cópia tem valor **só**
para ensaiar a F2.18, e como banco descartável.

O seed respeita a regra que o próprio sistema impõe: o índice da F2.5 recusaria duas prospecções
ativas na mesma empresa sem campanha, então `c01` aparece duas vezes — uma sem campanha, outra com
— que é exatamente o caso permitido e que vale ter no board.

**F2.12 — temperatura** · `null` é estado distinto de `FRIO` ("ninguém classificou"), e o card não
pinta nada — tratar null como frio faria todo lead novo nascer azul e a cor perderia sentido.
⚠️ **Bug pego antes de entrar:** o schema ia usar `optional`, e com `undefined` o Prisma entende
"não mexe" — limpar a temperatura seria **no-op silencioso**. Provado no banco: com `undefined` o
valor permanece; com `null`, limpa. Trocado para `nullish`.

**F2.13 — Kanban de Prospecção** · Movimento **otimista com rollback** (o board antigo esperava o
servidor e dava impressão de nada ter acontecido). Arrastar para `OPORTUNIDADE_CRIADA` **não é
update de status**: dispara `qualificarProspeccao`, porque o estado significa "existe uma
Negociacao" — sem isso o board mostraria oportunidade sem negociação nenhuma. O funil de prospecção
**não tem ordem obrigatória** (pular direto para QUALIFICADO é legítimo: empresa pode chegar
qualificada por indicação), diferente da jornada de negociação.

**F2.14 — Kanban de Negociações** · **Duas consultas no total**, independentemente de colunas ou
cards; o ingênuo seria 8 (uma por coluna) + 1 por card para a próxima ação = 208 idas ao banco com
200 cards. **Contagem e soma vêm do banco, não do array paginado** — do array, uma coluna com 200
registros mostraria "25" e somaria só a primeira página. Conferido: soma dos totais = `count()` da
tabela. Soltar em PERDIDO abre o diálogo de motivo **antes** de enviar (pedir depois obrigaria a
arrastar duas vezes); o campo de concorrente aparece conforme `MotivoPerda.exigeConcorrente`, regra
que mora no dado.

**F2.15 — filtros na URL** · Um componente para os dois boards, sem `useState` de filtro — a URL é
a fonte de verdade, e é isso que faz "copiar a URL e abrir noutra aba" funcionar de graça. **O
mesmo `where` alimenta o `groupBy` e o `findMany`**: se divergissem, o contador deixaria de bater
com os cards exatamente quando houvesse filtro. Valor inválido na URL vira **ausente**, nunca erro.
Provado contra o banco (temperatura, empresa, disciplina — os três batendo com `count()`).

**F2.16 — contato rápido** · Reusa `normalizarTelefone` da F1.12 em vez de repetir a regra de
E.164. Botão **só existe se houver dado utilizável** — sem telefone válido não há botão, evitando
abrir o app numa conversa inexistente. Só abre; nada é enviado nem lido (veredito do dono, sem API).

**F2.17 — responsivo** · Colunas empilham em tela pequena, lado a lado a partir de `sm`. Por **CSS
e não `useMediaQuery`**: media query em JS renderiza o layout errado no servidor e corrige após a
hidratação, fazendo o board piscar.

**Verificação:** `vitest run` **2144 testes verdes** (26 novos) · `tsc` e `eslint` limpos ·
`npm run build` ✓ · filtros e boards provados contra o banco de dev.

⚠️ **NÃO verificado em navegador:** arrastar em 390px, clique real nos botões de contato, e o
rollback visual do drag. Sem `chromium-cli` no ambiente, como registrado desde a F2.1a. A lógica
por trás de cada um está coberta por teste ou por prova contra o banco; o que falta é a conferência
visual.

**F2.11 PULADA — dependência não declarada.** Seu aceite exige "registra `Atividade`" e "atualiza
última interação", mas o model `Atividade` é da **F3.1** e `ultimaInteracao` não existe em lugar
nenhum do schema projetado (seria derivado de `Atividade`). A tarefa declara `Dep: F2.10` apenas.
Sobra dela só o encadeamento de diálogo, cosmético sem o registro.

**Pendente da Fase 2:** F2.11 (bloqueada pela F3.1), F2.18 (**produção**), F2.19 (opcional, o
próprio plano recomenda adiar) e F2.20 (fecho).

---

## F2.6 → F2.10 — jornada, qualificação, frescor e próxima ação · 2026-08-20 · Opus

Cinco tarefas seguidas, todas destravadas pelo bloco de schema anterior.

**F2.6 — `jornada.ts` + teste (puro)**
- `transicaoPermitida`, `exigeMotivoPerda`, `exigeConcorrente`, `probabilidadeDe`. Tabela de
  probabilidade **injetada**, nunca consultada dentro do módulo — é o que o mantém puro e ao mesmo
  tempo cumpre "nunca hardcode na UI" (ADR-12).
- **`CONTRATADO` só é alcançável de `PROPOSTA_ENVIADA`/`NEGOCIACAO`.** Não é purismo: essa
  transição cria um `Projeto` (F5.9), e liberar o atalho faria projeto nascer sem nenhuma proposta
  por trás — o buraco que a reforma existe para fechar.
- **Voltar entre ativos é permitido.** Cliente pedir revisão é caso real; bloquear empurraria o
  time a contornar por fora, que é o problema de origem.
- **`PERDIDO` e `CANCELADO` reabrem.** O ADR-10 fala só de "perdida", mas a diferença entre os
  dois é o motivo, não a reversibilidade — negar só a um seria arbitrário. Decisão registrada.
- **`PERDIDO`/`CANCELADO` zeram a probabilidade mesmo com override manual** — única regra que passa
  por cima do override, porque o contrário faria o forecast da Fase 6 (probabilidade × valor)
  mentir. `EM_ESPERA` mantém: pausar não é perder.
- Estágio sem linha na tabela mantém o valor atual em vez de chutar default — chutar recriaria o
  número mágico que o ADR-12 rejeita.

**F2.7 — `moverEstagio()`, ponto único de escrita**
- Conferido por grep: a **única escrita de `estagio` do repositório** está no service; o único
  `estagio:` em `actions.ts` é um `select` para a auditoria.
- `validarMovimento` é puro e lança `ActionError`, então transição inválida **nunca chega a tocar
  o banco** (padrão de guard síncrono de `custos/orcamento/service.test.ts`).
- `dataFechamento` é **limpa ao reabrir**, senão negociação reaberta seguiria contando como
  fechada nos relatórios. `motivoPerda`/`concorrente` idem — para não sobrar "perdemos para X"
  numa negociação viva.
- ⚠️ **A entrada de timeline (`Atividade`) NÃO é gravada**, e é de propósito: o model só nasce na
  F3.1, não há tabela para escrever. Ponto de inserção marcado no docblock. A auditoria já está
  coberta pelo `defineAction` com `capturarAntes` + `entidadeId`.

**F2.8 — `qualificarProspeccao()`**
- O lead **sobrevive**: vai a `OPORTUNIDADE_CRIADA` e a negociação aponta de volta. É o que
  preserva "como esta empresa chegou até nós" — canal, campanha, parceiro e timeline continuam
  consultáveis. Destruir o lead apagaria justamente o que a Fase 6 precisa para medir origem.
- Título herda `origemDetalhada`, que é onde o nome do empreendimento foi parar no backfill da
  F1.23 — o "campo próprio da `Negociacao`" que o `03-migracao.md` §3 manda usar.
- Qualificar 2× é impossível por **duas barreiras independentes**: o guard e o `leadId @unique`.
  A segunda cobre a corrida entre dois cliques simultâneos, que o guard sozinho não pega.
- Provado no banco: lead sobrevive, negociação aponta de volta, título/canal/contatos herdados,
  2ª qualificação recusada.

**F2.9 — `frescor.ts` + teste (puro, relógio injetado)**
- **Conta dias de CALENDÁRIO local, não blocos de 24h.** Interação às 23h de ontem é "1 dia" hoje
  às 8h, não "zero" — é como quem vende enxerga, e o que faz o número bater com a memória da pessoa.
- `diasSemInteracao` devolve **`null`** quando nunca houve interação, não zero: "nunca falamos" e
  "falamos hoje" são estados diferentes, e zero esconderia quem nunca foi contatado justamente na
  lista feita para achar essas pessoas.
- ⚠️ **Fuso:** o backlog pede `America/Recife`; o resto do código (`ponto/engine`, `jobs`, `backup`)
  usa `America/Sao_Paulo`. **Hoje são idênticos** — ambos UTC-3 fixo, o Brasil aboliu o DST em 2019
  e Pernambuco nunca o adotou. Só passaria a importar se o horário de verão voltasse, e aí Recife
  seria o fuso **certo** para o escritório. Ficou em Recife, com a divergência documentada no
  módulo para não parecer descuido de copiar-e-colar.
- O teste-guarda "zero `new Date()` sem argumento" **pegou um caso real na primeira execução**: o
  próprio docblock que explica a regra. Corrigido removendo comentários antes da checagem — e o
  teste agora prova que continua pegando o caso de verdade.

**F2.10 — Próxima Ação ancorada**
- O schema veio na F2.1b; esta tarefa entregou quem **escreve** e quem **lê**.
- Antes o `follow-up-dialog` gravava `titulo: "Follow-up: <nome>"` e nada mais — o lead existia ali
  como **texto**. Era por isso que "quais prospecções estão sem próximo contato marcado?" era
  impossível por query. Agora vira um `findMany`.
- Duas consultas em vez de join porque a âncora é **polimórfica e sem FK**; inventar três FKs
  nullable só para permitir o join deixaria o modelo pior que a consulta extra.
- `tipo: { not: null }` restringe a compromissos comerciais — reunião comum com o cliente não conta
  como próxima ação. É o mesmo campo que a agenda filtra (F2.1a): âncora e filtro compartilham a fonte.
- Provado no banco o ciclo inteiro: 2 leads sem ação → agendar tira um → `proximasAcoesDe` devolve
  com o tipo certo → concluir devolve o lead à fila → concluir de novo é recusado.

**Verificação (do bloco todo):** `eslint` limpo no código do projeto · `vitest run` **201 arquivos,
2112 testes verdes** (56 novos) · `tsc --noEmit` (heap 8GB) só os 2 pré-existentes de
`backup-storage.test.ts` · `npm run build` ✓.

⚠️ **Ruído de ambiente, não do código:** `npx eslint .` passou a acusar 14 erros vindos de
`.claude/worktrees/agent-*/public/*.min.mjs` — workers minificados de terceiros dentro de worktrees
de agente criados durante a sessão. Nenhum arquivo do projeto. Se os worktrees não estiverem em uso,
`git worktree remove` limpa.

⚠️ **Outra frente commitando em paralelo:** commits de `documentos` (`05718ea`, `9905d2c`) entraram
no meio deste histórico e o checkout chegou a ser trocado para `refactor/documentos-cde` por fora.
Nada se perdeu (as refs apontavam para o mesmo commit), mas a partir daí passei a commitar por
**caminho explícito**, não `git add -A` — há um `src/modules/uploads/documentos-agrupados.ts` da
outra frente na árvore que deliberadamente não foi tocado.

**Pendente da Fase 2:** F2.11 a F2.17 (UI: boards, filtros, WhatsApp/e-mail, responsivo), F2.18
(**produção**, migra os 8 leads), F2.19 (opcional, recomendado adiar) e F2.20 (fecho).

---

## F2.3 + F2.4 + F2.5 — Lead v2, Negociacao e a regra de prospecção única · 2026-08-20 · Opus

O bloco de fundação da Fase 2: os dois models que separam prospecção de negociação, mais a
constraint que impede a mesma empresa de ser trabalhada duas vezes em paralelo.

**F2.3 — `Lead` v2** (migration `20260820100000_crm_lead_v2_status_contatos`)
- `status: StatusProspeccao @default(IDENTIFICADO)` + `needsReview` + junção `LeadContato`.
- O enum fixo mata o `etapaEhPerdido()` por substring, dívida que a auditoria já tinha flagado.
- ADITIVA: `etapaId`/`FunilEtapa`, `arquivado` e `motivoPerda` ficam DEPRECADOS **e populados**
  (§8.3). Conferido no dev: 8 leads com status, `funil_etapa` com 5 linhas, todos os `etapaId`
  preservados.
- ⚠️ **Desvio deliberado do ADR-01, que pede `clienteId` obrigatório: a coluna continua NULLABLE.**
  Medido antes de decidir: **8 de 8 leads têm `clienteId` nulo**, porque `criarLead` nunca
  preencheu esse campo — ele não está sequer no `criarLeadSchema`, só é setado na conversão para
  cliente. `SET NOT NULL` abortaria o deploy com "column contains null values". A obrigatoriedade
  fica na camada de aplicação, **mesmo padrão que o P5 já havia decidido para
  `Proposta.negociacaoId`** (§8.2); a F2.18 preenche os 8 à mão e só então um CONTRACT fecha a
  coluna. Fechar agora seria trocar um deploy que funciona por um que aborta.

**F2.4 — `Negociacao` + junções + gancho no `Projeto`** (migration `20260820110000_crm_negociacao`)
- 3 tabelas novas + 1 coluna nullable em `projeto`. Aceite verificado no banco:
  `proposta.projetoId` inalterado, **inclusive o unique `proposta_projetoId_key`**; os 13 projetos
  do dev seguem todos sem negociação.
- `leadId @unique`: qualificar o mesmo lead 2× passa a ser recusado pelo **banco**, não só pela
  action da F2.8 — a garantia deixa de depender de alguém lembrar de checar.
- **Duas coisas fora da lista literal da tarefa, com motivo registrado:** (1) `responsavelId`
  ganhou `@relation` de verdade — o `Oportunidade` órfão guardava isso como string solta e a
  auditoria §10 apontou que quebra a integridade referencial; repetir o defeito no model que o
  substitui seria carregar a dívida adiante. (2) `parceiroId` entrou aqui: é a metade pendente da
  F1.23a, que pediu `Negociacao.parceiroId` mas não pôde criá-la porque o model não existia.
- `Proposta[]` e `Atividade[]` **não** entram nas relações: `Proposta.negociacaoId` é da F5.2 e o
  model `Atividade` é da F3.1. `Negociacao` entra na extensão de soft delete (ADR-11), com a
  ressalva anotada de que `Cliente.negociacoes` na Empresa 360 será leitura **aninhada** e vai
  precisar do `where` explícito, como já acontece com `lead`.

**F2.5 — prospecção ativa única** (migration `20260820120000_crm_prospeccao_ativa_unica`)
- **São DOIS índices parciais, e o motivo é a razão de a tarefa não ser trivial:** em Postgres
  `NULL <> NULL`, então um único índice em `(clienteId, campaignId)` **não pegaria** duas
  prospecções abertas da mesma empresa **sem campanha** — exatamente o caso comum (nenhum lead de
  produção tem campanha) e o que o aceite exige recusar. Um índice cobre campanha preenchida,
  outro cobre campanha nula.
- SQL cru, fora do `schema.prisma` (o Prisma não expressa predicado de índice) — mesmo padrão do
  `cliente_documento_unico` da F1.16 e dos GIN de busca.
- `prospeccao.ts` + teste guardam os 4 status que travam. **O teste lê a própria migration** e
  confere que as duas pontas listam os mesmos status: sem isso, adicionar um status no módulo e
  esquecer do banco faria a UI recusar o que o banco aceita, em silêncio.
- `comProspeccaoAtivaUnica` traduz o `P2002` em mensagem de negócio, espelhando o
  `comDocumentoUnico` da F1.16. Aqui o catch é a **única** checagem, não um complemento: uma
  consulta prévia teria janela de corrida e ainda assim precisaria do catch. Vale também no
  editar — trocar a empresa de um lead colide igual.
- **Provado contra o banco de dev, os 4 cenários do aceite:** 1ª ativa sem campanha passa · 2ª na
  mesma empresa sem campanha **recusada (P2002)** · 3ª com campanha própria passa · status
  terminal não trava.

**⚠️ Aviso deixado na migration para a F2.18:** a partir daqui, preencher `clienteId` à mão pode
esbarrar nestes índices — Záphis tem 3 leads e Rbarros 2. Se dois receberem a mesma empresa
mantendo status ativo e sem campanha, o segundo UPDATE é recusado. **É a regra funcionando**, não
um bug: cabe a quem migrar decidir o status real de cada um (vários já deveriam estar em
`OPORTUNIDADE_CRIADA` ou `DESCARTADO`) ou separá-los por campanha.

**Migrations pelo caminho manual**, as três: `migrate dev` segue recusando pelo drift antigo de
`pendencia`/`pendencia_anexo`, e a shadow DB não está configurada. `db push` → SQL à mão →
`migrate resolve --applied`. 175 migrations, `migrate status` em dia.

**Arquivos:** `prisma/schema.prisma`, 3 migrations novas, `src/lib/prisma.ts`,
`src/modules/comercial/prospeccao.ts` + `.test.ts` (novos), `src/modules/comercial/actions.ts`.

**Verificação:** `eslint .` limpo · `vitest run` **199 arquivos, 2056 testes verdes** (5 novos) ·
`tsc --noEmit` (heap 8GB) só os 2 pré-existentes de `backup-storage.test.ts`.

**Pendente:** F2.6 (máquina de transições) e F2.7 (`moverEstagio` único) são o próximo bloco.

---

## F2.1b + F2.1a — `Compromisso` v2 + filtro comercial na agenda · 2026-08-20 · Sonnet

Abre a **Fase 2 (Jornada)**. Duas tarefas do backlog, executadas **na ordem invertida** em relação
ao `04-plano-fases.md` — decisão registrada abaixo, com o motivo.

**Inversão de ordem, e por quê:** o backlog lista F2.1a (filtro) com `Dep: F1.24` antes de F2.1b
(schema) com `Dep: F2.1a`. Mas o aceite da F2.1a fala em filtrar por `tipo` — campo que só nasce na
F2.1b — e sua célula de Mig/Seed é "—" (nenhuma migration). Lendo o ADR-17 até o fim: o "bloqueante"
é em relação à **F2.10** (que começa a escrever ações comerciais em volume), não em relação à F2.1b
em si, que é aditiva e nullable — não polui nada só por existir. Construir o filtro ANTES de o campo
existir deixaria a F2.1a intestável de verdade (filtrando uma coluna vazia). Feito **F2.1b primeiro**.

**F2.1b — `Compromisso` v2** (migration `20260820090000_crm_compromisso_proxima_acao`)
- `entidadeTipo`/`entidadeId` (âncora polimórfica, SEM FK — mesmo padrão de
  `ApontamentoCoordenacao`/`Pendencia`) + `tipo` + `concluidoEm` + `concluidoPor`. **Tudo
  nullable** — 100% aditivo, todo `Compromisso` existente continua válido com os 5 em null.
- 2 enums novos: `TipoAncoraCompromisso` (LEAD/NEGOCIACAO/CLIENTE) e `TipoProximaAcao` (12
  valores, lista do P11 item 3 / `02-schema.md` §2.15).
- **Migration escrita à mão**, não pelo caminho feliz do skill: `prisma migrate dev` recusou pelo
  mesmo drift antigo de `pendencia`/`pendencia_anexo` que a F1.19c já tinha visto. O passo de
  shadow database do `/nova-migracao` também não rodou — `migrate diff --from-migrations` exige
  `SHADOW_DATABASE_URL`, que não está configurada (mesma causa-raiz do "banco descartável exige
  CREATEDB, que o papel `senahub` não tem" da F1.15). Caminho seguido: `db push` (efeito já
  aplicado) → SQL escrito à mão, no padrão das migrations anteriores → `migrate resolve --applied`.
  Conferido no catálogo do Postgres: os 5 campos existem, todos nullable, coluna nenhuma renomeada.
- ⚠️ **Achado, registrado para quem gerar a próxima migration nesta máquina:** a flag do skill
  `--to-schema-datamodel` não existe mais nesta versão do Prisma (7) — virou `--to-schema`. O
  `.claude/skills/nova-migracao/SKILL.md` ainda cita a flag antiga.

**F2.1a — filtro por `tipo` na agenda** (ADR-17 cita nominalmente `modules/agenda/queries.ts` e
`components/agenda/agenda-view.tsx` como os dois pontos a proteger antes do volume comercial entrar)
- `modules/agenda/proxima-acao.ts` + `.test.ts` (puro): `TIPO_PROXIMA_ACAO_LABEL` (12 rótulos
  pt-BR) e `ehAcaoComercial(tipo)` — `null`/`undefined` = compromisso comum.
- `resumoAgendaHoje` (widget do relógio no header): passou a filtrar `tipo: null` sempre, sem
  toggle — não há espaço de tela pra um filtro num resumo de 1 linha, e o widget é especificamente
  "reuniões de hoje".
- `/agenda` (página completa): a query **não** filtra no servidor — traz tudo, o filtro é
  client-side em `AgendaView`. Padrão: ações comerciais **escondidas**; botão "Mostrar ações
  comerciais (N)" aparece só quando `N > 0` (zero ruído enquanto nada usa o campo ainda, que é o
  estado de hoje — F2.10 é quem começa a escrever). Aplicado nas 3 vistas (mês/semana/dia), que
  compartilham a mesma lista filtrada — nenhuma vista fica dessincronizada da outra.
- Itens comerciais, quando revelados, ganham cor `warning` (livre no arquivo; as outras 4
  categorias — reunião, feriado, férias, prazo — já usam primary/success/info/destructive) e o
  rótulo do tipo (badge no card do dia, `· Rótulo` na semana, prefixo no mês).

**Verificação por falta de ferramenta, registrada com honestidade:** o aceite da F2.1a é `browser`.
Sem `chromium-cli` no ambiente e sem skill de projeto para dirigir o app, montar login autenticado
do zero (cookie de sessão do better-auth) foi julgado desproporcional para um toggle coberto por
teste unitário. Verificado em vez disso: (1) `ehAcaoComercial`/`TIPO_PROXIMA_ACAO_LABEL` com 8
testes; (2) dry-run direto no banco de dev com um `Compromisso` real (`tipo=LIGACAO`) — confirmado
que `resumoAgendaHoje` o exclui (0 itens) e que a query de `/agenda` o traz com `tipo` preenchido
para o client filtrar; dado de teste removido depois. **Não verificado**: clique real no botão em
navegador. Baixo risco (é `useState` + filtro de array, sem async), mas fica registrado como o que
não foi feito, não como feito.

**Arquivos:** `prisma/schema.prisma`, `prisma/migrations/20260820090000_.../migration.sql` (novo),
`src/modules/agenda/proxima-acao.ts` + `.test.ts` (novos), `src/modules/agenda/queries.ts`,
`src/app/(dashboard)/agenda/page.tsx`, `src/components/agenda/agenda-view.tsx`.

**Verificação:** `eslint .` limpo · `vitest run` **198 arquivos, 2051 testes verdes** (8 novos) ·
`tsc --noEmit` (heap 8GB) em `tsconfig.json` **e** `tsconfig.server.json`, só os 2 pré-existentes
de `backup-storage.test.ts` · `npm run build` ✓.

**Pendente:** nada bloqueia a Fase 2 continuar. Parede de modelo: toda tarefa restante (F2.3 em
diante) depende de F2.3, F2.6, F2.7 ou F2.9 — as 4 marcadas **O** (Opus) do backlog.

---

## F1.21 — consolidação das 6 grafias · 2026-08-19 · Sonnet

**Fecha a Fase 1.** A F1.19c resolveu 79 disciplinas por nome exato e parou nas 6 que não casavam
com o catálogo, de propósito — o destino delas era decisão de quem toca o projeto, não de script.

**As duas decisões, tomadas pelo dono em 2026-08-19:**

1. **As 3 strings compostas viram duas disciplinas, com a CFTV nascendo VAZIA.** O histórico (38
   uploads e 2 revisões) fica inteiro na `Cabeamento` — que é a antiga `Lógica`, conforme o array
   `RENOMES` do seed —, sem reclassificação arquivo a arquivo. A separação passa a valer para
   entregas novas. Descartadas: manter uma disciplina só (CFTV seguiria misturado) e reclassificar
   os 38 arquivos com os 3 responsáveis (correto no histórico, mas exigia sessão com 3 pessoas).
2. **No 260023, `Ar condicionado (ARC)` e `Exaustão (EXT)` ficam como DUAS linhas** apontando para a
   mesma entrada `Climatização (AVAC)`, em vez de fundir — são entregas separadas naquele contrato.
   O banco aceita: `Disciplina` não tem unique em `(projetoId, disciplinaId)`.

**A decisão 2 fechou, por tabela, a pergunta que a F1.19c deixou em aberto.** Aquela entrada dizia
"se a exibição deve preferir o catálogo é decisão da F1.21". A resposta é **não, e não é mais
adiamento**: com duas linhas na mesma FK, preferir o nome do catálogo renderizaria "Climatização
(AVAC)" **duas vezes** no 260023, apagando exatamente a distinção que a decisão 2 existe para
manter. O `disciplinaTextoLegado` é load-bearing na tela, não resíduo de migração. Efeito prático:
a F1.21 ficou sendo só dado — nenhuma segunda passada pelos 74 call sites.

**`scripts/consolidar-disciplinas-f121.ts`** (dry-run → `--gravar`; `npm run crm:consolidar-disciplinas`)
- Plano declarativo (`PLANO`) com as 6 grafias, o alvo no catálogo e se ganha CFTV irmã.
- **A CFTV nova é criada como o app cria**, não por INSERT cru: `ordem` = max+1, responsáveis
  copiados da composta e `semearPastasTemplate` sob a **mesma guarda** do `adicionarDisciplina`
  (`usaEstruturaCustom(tipo) && projetoUsaTemplate(...)`). Sem isso a disciplina nasceria sem árvore
  de pastas e ficaria inerte no `/arquivos` e no fluxo de upload.
- **Responsável copiado, sem notificar.** Quem respondia pelo CFTV misturado responde por ele
  separado — não é atribuição nova, é a mesma pessoa no mesmo trabalho, e um aviso disparado por
  script de migração confundiria. Decisão registrada em vez de deixada implícita.
- **Idempotência com os dois passos independentes**, de propósito: a FK só é escrita se estiver
  nula, e a CFTV só é criada se o projeto ainda não tiver disciplina apontando para CFTV. Se a
  criação dependesse de "a FK ainda está nula", uma execução interrompida entre os dois passos
  deixaria o projeto **sem CFTV para sempre**, em silêncio — a re-execução pularia a linha. Cada
  projeto ainda roda dentro de uma `$transaction`.

**O dry-run reporta um efeito colateral em vez de deixá-lo como incógnita:** `alertaRiscoProjeto`
(`lib/jobs-handlers.ts`) notifica admin+supervisor sobre projeto `em_andamento` com `prazoFinal`
vencido **que tenha alguma disciplina não-aprovada**. A CFTV nova nasce `aguardando`, então um
projeto atrasado cujas disciplinas estivessem **todas** aprovadas passaria a alertar. O script
imprime situação/prazo/não-aprovadas de cada projeto tocado, marcando quem já entrava no alerta
antes. (`saudeProjeto` não é risco: disciplina sem `prazo` nunca conta como atrasada, e entrar no
`total` só **dilui** o percentual — a saúde melhora ou fica igual, nunca piora.)

**Testado em dev incluindo o ramo que a fixture sozinha não exercita:** `fixture-disciplinas-f121.ts`
cria as 6 grafias, mas nos projetos de demo (`tipo=particular`) a guarda de template não dispara —
`pastas=0`, e o caminho do `semearPastasTemplate` **nunca rodaria**. Para fechar a lacuna, uma
composta foi inserida à mão no **260011** (`tipo=aprovacao`, um dos 2 projetos do dev com árvore
nova): a CFTV nasceu com as **4 pastas do template**, na ordem pai-antes-filho. Depois o dev foi
**limpo pelo próprio AuditLog** (as ids das CFTV criadas ficam em `detalhe.cftvCriada`), voltando ao
baseline exato de **34 disciplinas, 0 sem FK, zero linha sintética, zero entrada de auditoria**.

**Aceite:** 2ª execução consecutiva → `0 FK · 0 CFTV`, com as 6 marcadas "já consolidada".
`disciplina sem FK = 0`. 6 entradas de `AuditLog` (`acao: consolidar-disciplina`, `entidade:
Disciplina`, `entidadeId` da disciplina original, grafia de origem e id da CFTV no detalhe).

**Arquivos:** `scripts/consolidar-disciplinas-f121.ts` (novo), `package.json`, `docs/crm/06-progresso.md`.

**Verificação:** `eslint .` limpo · `vitest run` **196 arquivos, 2042 testes verdes** ·
`tsc --noEmit -p tsconfig.server.json` só os 2 pré-existentes de `backup-storage.test.ts`.

**Executado em produção — 2026-08-19.** Dry-run → conferência → `--gravar`: **6 FK resolvidas, 3
disciplinas CFTV criadas**, cada uma herdando **1 responsável** da composta (no dev era 0 — dado de
demo não tem responsável). Re-execução imediata: as 6 marcadas "já consolidada", `0 FK · 0 CFTV` —
idempotência provada contra o dado real. `smoke:crm-prod` seguiu **17 OK / 0 falhas / 1 pulado**.

**O efeito colateral do alerta não se materializou, e o dry-run provou isso antes:** os 3 projetos
(260023, 260014, 260020) **já entravam** em `alertaRiscoProjeto` — todos `em_andamento`, todos com
`prazoFinal` vencido e **nenhuma** disciplina aprovada. A CFTV nova não mudou gatilho de ninguém.
Como efeito lateral, ficou registrado que os três estão vencidos há semanas (260020 desde 21/07) e
o alerta diário não está sendo acionado por ninguém — observação de operação, fora do escopo do CRM.

**FASE 1 FECHADA — dev e produção.** 30 tarefas. A única que sobra sob outra dependência é a
**F1.23c** (relatório "negócios por parceiro"), que depende de `F6.3` e por isso vive na Fase 6.

---

## F1.19c — FK de disciplina no catálogo · 2026-08-19 · Sonnet

Fecha a lacuna que a F1.15/F1.16 encontrou e que **bloqueava a F1.21**: F1.19 pôs a FK do catálogo
em `PropostaItem`, F1.20 em `ItemTabelaPreco`, e ninguém pôs em `Disciplina` — justamente a tabela
onde as grafias livres vivem e a que carrega `valor` (pagamento ao projetista), `RevisaoDisciplina`,
uploads, responsáveis e apontamentos.

**Feito:**

**Schema + migration** (`20260819170000_crm_disciplina_catalogo_fk`)
- `Disciplina.disciplinaId` nullable + `@@index` + FK `ON DELETE SET NULL` para `DisciplinaCatalogo`
  (relação nomeada `catalogo`, não `disciplina` — `disciplina.disciplina` seria ilegível).
- `nome` → `disciplinaTextoLegado` via `@map("nome")`. **A coluna física não se move** — o `@map`
  é efeito zero em SQL, e por isso a migration tem só `ADD COLUMN` + `CREATE INDEX` + `ADD
  CONSTRAINT`. Conferido com `grep -icE 'rename|drop'` na migration: os únicos hits estão em
  comentário.
- Aplicada em dev pelo caminho sem reset (`db push` → migration à mão → `migrate resolve --applied`,
  a skill `/nova-migracao`), porque `migrate dev` pedia reset por drift acumulado. `migrate status`
  fecha em 171 migrations. A migration da F1.16, que veio no merge de `master`, também foi aplicada
  no dev nesta sessão (`migrate deploy`) — o dev estava sem ela.

**Backfill** (`scripts/backfill-disciplina-f119c.ts`, dry-run → `--gravar`)
- Fora da migration, **de propósito**, e o comentário do arquivo registra as duas razões: (1) foi o
  bug da F1.23 — `migrate deploy` roda antes do `db:seed`, e um UPDATE guardado por "se o catálogo
  existir" faz nada em silêncio e nunca re-roda; (2) `disciplina` carrega o pagamento ao projetista,
  e foi exatamente o dry-run enumerando tudo que revelou o 4º registro Záphis na F1.15.
- Casa por nome **exato**, como F1.19/F1.20. O que não casa fica com FK null — estado esperado, é o
  trabalho da F1.21. O relatório agrupa as pendentes por grafia e mostra o que cada uma carrega
  (valor / revisões / uploads / responsáveis), que é a informação que a F1.21 precisa ter à vista.
- Idempotente (só toca `disciplinaId IS NULL`), provado rodando 2×: a segunda resolve 0 e as sem
  match seguem sem match — o que permite re-rodar depois da F1.21 sem desfazer decisão humana.

**Rename: 74 arquivos, 489 erros de `tsc` até convergir**
O prompt previu ~76 leituras em 47 arquivos; o `tsc` acusou **489 erros em 74 arquivos**, porque
cada leitura quebrada derruba junto o `include` inteiro e os callbacks que dependiam da inferência.
Convergiu em 6 passadas até sobrarem **só os 2 erros pré-existentes** de `backup-storage.test.ts`.
Nenhuma substituição global — cada edição foi ancorada em `arquivo:linha` do próprio `tsc`, porque
`nome` também existe em `Projeto`, `Cliente` e `DisciplinaCatalogo`.

Três decisões que valem registro:
- **Tipos de UI continuam falando `nome`.** `OpcoesUI`, `DisciplinaEscrevivel`, `EapWorkspace`,
  `ArtsView` e o seletor de ferramentas são tipos de tela — o campo volta a se chamar `nome` na
  fronteira (`queries.ts`/action), não na UI. A F1.19c renomeou a coluna, não o rótulo exibido.
  `DisciplinaIcones` foi a exceção: só o `projetos-view` a consome, e mapear em 3 chamadas seria
  pior que ajustar a prop.
- **Nada de lógica de exibição mudou.** Resistido o impulso de trocar o texto por
  `catalogo?.nome ?? disciplinaTextoLegado`: o aceite pede "mesmo texto de antes", e hoje os dois
  são equivalentes (o backfill casa por nome exato). Se a exibição deve preferir o catálogo é
  decisão da F1.21.
- **`disciplinasDeItens` (comercial) não passou a preencher a FK**, embora agora pudesse — está
  anotado no código como avaliação para a F1.21. F1.19c é rename + FK, sem mudança de comportamento.

**Dois achados fora do escopo, corrigidos porque quebravam o gate:**
- `scripts/smoke-crm-dedupe.ts` usava CNPJ **fixo** (`11222333000199`). Com o índice único da F1.16
  agora presente no dev, a 2ª execução colide com o resto deixado pela 1ª (o cleanup do fim não roda
  quando uma asserção falha no meio). Passou a derivar o documento do `tag`, como o resto do smoke.
- `projetos/actions.ts` tinha um comentário afirmando que `Disciplina` casa com o catálogo "por
  TEXTO, sem FK" — verdade até esta tarefa. Reescrito: a FK existe, mas é nullable e ainda há
  disciplina sem ela, então o cascateamento de rename continua necessário até a F1.21.

**Item pequeno do prompt:** `smoke:crm-prod` ganhou entrada em `package.json`, que faltava.

**Arquivos:** `prisma/schema.prisma`, `prisma/migrations/20260819170000_crm_disciplina_catalogo_fk/`,
`scripts/backfill-disciplina-f119c.ts` (novo), `scripts/fixture-disciplinas-f121.ts` (novo),
`package.json`, `docs/crm/06-progresso.md` + 74 arquivos de call site.

**Verificação:** `prisma validate` ✓ · `migrate status` em dia (171) · `tsc --noEmit` em
`tsconfig.json` **e** `tsconfig.server.json` → só os 2 pré-existentes de `backup-storage.test.ts` ·
`eslint .` limpo · `vitest run` **196 arquivos, 2042 testes verdes** · `npm run build` ✓ ·
smokes `crm-fase1`, `crm-dedupe`, `crm-soft-delete`, `crm-soft-delete-lead`, `sync-pagamento` → OK.

⚠️ **`smoke:crm-prod` dá 10 OK / 7 falhas / 1 pulado no dev, e isso é o esperado:** as 7 são
contagens de **produção** (32 projetos, 46 clientes, 5 fusões no AuditLog) medidas contra o dev
(13 / 14 / 0). Todos os checks estruturais — índice único existe, zero órfãos, zero documento
duplicado, numero/token preenchidos — passam. Em produção este mesmo smoke fechou 17 OK / 0 falhas
(commit `ea3f694`).

**A armadilha #2 do prompt se confirmou, e valeu o aviso:** o `seed:demo` não tem nenhuma das 6
grafias problemáticas — o backfill resolvia 34/34 e o ramo "sem match" nunca rodava. Por isso
`scripts/fixture-disciplinas-f121.ts` foi criado e **ficou no repo**: a F1.21 vai precisar dele para
ser testada em dev, e sem ele o próximo a mexer cai na mesma armadilha. Com a fixture o dry-run
mostra 34 resolvidas + 6 pendentes agrupadas por grafia.

**Estado em que o dev ficou, de propósito:** a fixture foi criada, usada para exercitar os dois
ramos do backfill, e depois **removida** (`--limpar`). O dev tem hoje as **34 disciplinas do
`seed:demo`, todas com FK resolvida, e zero linha sintética** — se ficassem, `scripts/auditoria-crm.ts`
e qualquer contagem de grafia no dev passariam a reportar 6 grafias inventadas como se fossem reais,
e a próxima sessão mediria errado. **A F1.21 deve rodar a fixture de novo antes de testar** (é um
comando; ids fixos `fixf119c*`, então não duplica).

**Verificação da migration contra o banco, depois do `db push`:** conferido no catálogo do Postgres
que `disciplina` tem exatamente o que a migration descreve — a coluna física **`nome` continua lá,
intacta** (é a prova de que o `@map` funcionou e nada foi renomeado), mais `disciplinaId` nullable,
o índice `disciplina_disciplinaId_idx` e a FK `ON DELETE SET NULL` para `disciplina_catalogo`. Nada
além disso. Importa porque o `db push` sincroniza o schema INTEIRO: ele também refez índices de
`pendencia`/`pendencia_anexo` que faltavam no dev por drift antigo — drift de outra frente, que
**não** entra nesta migration e portanto não vai a produção, o que é o comportamento correto.

**Executado em produção — 2026-08-19 (mesma data).** `migrate deploy` → `db:seed` → backfill em
dry-run → `--gravar`. **79 disciplinas ganharam FK**; as **6 sem match exato** ficaram em `null`,
que é o estado esperado e o insumo da F1.21. `smoke:crm-prod` fechou **17 OK / 0 falhas / 1 pulado**
(o pulado é `needsReview`, que só nasce na Fase 2 com a `Negociacao`).

Os números de produção bateram exatamente com o que o §5 do `03-migracao.md` mediu: as 79 cobrem
**12 grafias distintas**, que somadas às 6 pendentes dão as **18 distintas** documentadas, contra um
catálogo de **18** entradas.

**Dois dados novos que o dry-run em produção trouxe, e que a F1.21 herda:**

- **As 3 grafias que "colapsam" estão vazias.** `Ar condicionado (ARC)` e `Exaustão (EXT)` (ambas em
  260023) e `Gases` (260014) têm `valor` NULL, **0 revisões, 0 uploads e 0 responsáveis**. Para elas
  a F1.21 é só apontar a FK — não há arquivo nem revisão cujo destino precise ser decidido. O peso
  real da F1.21 está inteiro nas 3 strings compostas (38 uploads e 2 revisões somados).
- ⚠️ **Colisão a decidir no 260023:** esse projeto tem `Ar condicionado (ARC)` **e** `Exaustão (EXT)`,
  e as duas colapsam para `Climatização (AVAC)` — o projeto terminaria com **duas** `Disciplina`
  apontando para a mesma entrada do catálogo. Não quebra nada (`Disciplina` não tem unique em
  `(projetoId, disciplinaId)`, conferido no schema), mas alguém precisa dizer se viram uma só. Como
  ambas estão vazias, fundir é indolor. **Não estava no levantamento do §5** — apareceu agora porque
  o relatório do backfill agrupa por grafia e mostra o projeto de cada uma.

**Pendente:** **F1.21** — agora destravada. As 3 strings compostas seguem exigindo decisão do
responsável de cada projeto (260014, 260020, 260023), com o levantamento pronto em
`docs/crm/03-migracao.md` §5 (os três com `valor = NULL`, então o rateio de pagamento não se aplica;
o que decide é o destino dos 38 uploads e das 2 revisões).

**Deploy:** migration aditiva, nada destrutivo. `migrate deploy` → `db:seed` → e só então
`npx tsx --tsconfig tsconfig.server.json scripts/backfill-disciplina-f119c.ts` (dry-run primeiro).

---

## Fase 1 em produção — F1.15 + F1.16 · 2026-08-19 · Opus

As duas tarefas de produção que faltavam da Fase 1. **F1.21 não foi executada** — está bloqueada
por uma lacuna do próprio backlog, registrada como **F1.19c** (ver abaixo).

**Feito:**

**F1.15 — fusão dos grupos duplicados** (`scripts/fundir-clientes-f115.ts`)
- **5 fusões, não 3.** O aceite dizia "3 entradas no AuditLog" supondo um par por grupo; Záphis
  absorve 3. `cliente` mantém **46 linhas** (a fusão arquiva, não apaga) e cai de 46 para **41
  não-fundidos**. `projeto` **32 → 32**, com **1** projeto mudando de cliente — o previsto.
- ⚠️ **O grupo Záphis tinha um 4º registro que o `03-migracao.md` §4 não conhecia.** `Zaphis Inc
  LTDA` (CNPJ `40.817.865/0001-60`) não casou na normalização de nome — "Inc" não é tratado como
  forma de "Incorporadora" — e só apareceu na conferência manual que o próprio §4 exige. É ele
  que tem os 2 projetos (`260001`, `260030`) e o CNPJ, então vence os três critérios e sobrevive.
  Que é a mesma empresa foi decisão do usuário, com a evidência do lead "EDIF. ISA BEACH" contra
  o projeto `260030 · ISA BEACH 2`. Sem isso a fusão teria deixado a empresa partida em dois.
- **A inversão do critério no grupo Nominal é deliberada** e move obra: quem tem o projeto
  `260031 · SESI ARAÇUAI - FIEMG` é o registro SEM documento, que foi absorvido. O §4 manda o
  critério (2) decidir ali, e é essa fusão que preenche o CNPJ que destrava a F1.16.
- IDs **hardcoded e revalidados** contra nome/documento antes de qualquer escrita, em vez de
  resolvidos por `LIKE` em tempo de execução: entre o dry-run e o `--gravar` alguém pode cadastrar
  um cliente parecido, e o alvo mudaria em silêncio.
- A prova do aceite é um retrato de `projeto.id → clienteId` **inteiro** antes/depois, não a
  contagem: `projeto` continuaria 32 mesmo se uma obra fosse parar na empresa errada.

**F1.16 — documento único** (`scripts/normalizar-documento-f116.ts` + migration
`20260819120000_crm_cliente_documento_unico`)
- ⚠️ **A migration teria falhado como estava escrita no backlog.** 2 clientes PF ("Bruno",
  "Roberto Barros") tinham `documento = ''`, e string vazia **não é NULL** — o predicado
  `WHERE documento IS NOT NULL` pega o `''`, os dois colidem e o `CREATE UNIQUE INDEX` aborta.
- E o índice sozinho seria meia garantia: 4 dos 28 documentos preenchidos estavam pontuados
  (`40.817.865/0001-60`) contra 24 só com dígitos. Para o índice são valores distintos, então o
  mesmo CNPJ passaria duas vezes. Os 6 foram normalizados por `normalizarDocumento` — a mesma
  função que a F1.12 usa para detectar duplicata — e `actions.ts` passa a gravar já normalizado.
- Mensagem de negócio (ADR-03) diz **em qual cliente** o documento já está, e cobre o caso
  confuso: cliente excluído ou já fundido continua ocupando o documento (o índice não sabe de
  soft delete), então a leitura usa o escape hatch `excluidoEm: { not: undefined }`. Há ainda um
  laço P2002 para a corrida entre a checagem e o `INSERT`.

**F1.21 — NÃO executada, e o motivo é uma lacuna do backlog**
- **`Disciplina` não tem `disciplinaId` nem `disciplinaTextoLegado`.** F1.19 pôs a FK em
  `PropostaItem`, F1.20 em `ItemTabelaPreco`, e **nenhuma tarefa pôs em `Disciplina`** — que é
  justamente onde vivem as grafias livres. O aceite "zero `Disciplina` sem `disciplinaId`" não
  tem como ser cumprido sem migration nova. Registrado como **F1.19c** no `04-plano-fases.md`;
  exige tocar o módulo **projetos**, fora do CRM, e por isso não foi improvisado aqui.
- Os outros dois terços do aceite **já estavam cumpridos**: `proposta_item` e `item_tabela_preco`
  têm **0** registros sem `disciplinaId`.
- Recontagem contra produção: são **18 grafias distintas** em `Disciplina.nome` (não 24 — aquele
  número somava as três tabelas), **12 exatas** (não 18) e as 6 conhecidas precisando de
  tratamento. `disciplina_catalogo` tem **18** entradas, não 20.
- **Boa notícia para quando a F1.19c sair:** as 3 strings compostas estão todas com
  `valor = NULL`, então o rateio do pagamento ao projetista — a decisão mais espinhosa que o §5
  antecipava — **não se aplica a nenhuma**. O que resta decidir com o responsável é o destino dos
  arquivos: `Dados/Voz, Automação e CFTV` (260023) carrega 2 revisões e 18 uploads,
  `Lógica e Cftv` (260014) 12 uploads, `Lógica/cftv` (260020) 8 uploads.

**Dois erros meus, pegos antes de estragarem alguma coisa:**
1. O script de normalização reportava **0** documentos vazios quando havia 2: comparava com
   `normalizado ?? ""`, e para `documento = ''` isso dá `'' !== ''` → falso. O único caso que
   quebra a migration era o único a escapar da normalização. Corrigido e reconferido.
2. O primeiro `--gravar` da fusão **abortou** procurando `user."excluidoEm"`, coluna que não
   existe (o soft delete de F1.17/F1.18 pegou `cliente`/`lead`/`contatoCliente`, não usuários).
   Falhou na busca do operador da auditoria, **antes** do laço de fusão — conferido contra o
   banco, não suposto: `fundidos=0`, `auditFusao=0`, `cliente=46`, `projeto=32`. A causa é que o
   dry-run retorna antes do bloco exclusivo do `--gravar`, então aquela query nunca era exercida;
   as duas restantes desse bloco foram testadas em separado antes de repetir.

**Ensaio, e por que não foi no banco descartável:** `restaurar-snapshot-prod.ts` exige `CREATEDB`,
que o papel `senahub` não tem, e a senha do único superusuário (`postgres`) não estava disponível.
Como Postgres tem **DDL transacional**, o ensaio (`scripts/ensaio-f115-f116.ts`) rodou contra o
dado real dentro de uma transação revertida — normalização, as 5 fusões e o próprio
`CREATE UNIQUE INDEX`, com `ROLLBACK` no fim, conferindo que nada sobrou. Passou inteiro,
inclusive a recusa de um CNPJ repetido pelo índice. **Foi o ensaio que revelou** que a fusão do
grupo Nominal move **7 linhas de `documento`** (Estúdio) que o dry-run não mostrava — ele contava
só projetos/propostas/lançamentos/contatos/leads. O dry-run passou a enumerar
`REFERENCIAS_CLIENTE` inteira: confirmar fusão sem ver tudo que se move é assinar em branco.
Limite honesto do ensaio: replica o efeito via SQL derivado de `REFERENCIAS_CLIENTE` em vez de
chamar `mesclarClientes()` (transação aninhada não volta atrás junto) — a função em si já é
coberta por `smoke:crm-dedupe`.

**Arquivos:** `scripts/fundir-clientes-f115.ts`, `scripts/normalizar-documento-f116.ts`,
`scripts/ensaio-f115-f116.ts`, `scripts/smoke-crm-prod.ts` (novos),
`prisma/migrations/20260819120000_crm_cliente_documento_unico/` (nova),
`src/modules/clientes/actions.ts` (ADR-03), `docs/crm/03-migracao.md` (§4 o 4º Záphis, §5 a
recontagem + o levantamento das 3 compostas, §7 as contagens), `docs/crm/04-plano-fases.md`
(F1.19c nova; F1.15/F1.16/F1.21 com os números conferidos).

**Verificação:** `smoke-crm-prod` → **17 OK · 0 falhas · 1 pulado** · `eslint` limpo ·
`tsc --noEmit` só os 2 pré-existentes de `backup-storage.test.ts` · `vitest run` → **196 arquivos,
2042 testes verdes** · `migrate deploy` aplicou a migration sem erro (170 migrations) ·
`pg_restore --list` validou `senahub_20260819_030016.backup` (1624 entradas, com `lead`,
`cliente`, `proposta`, `anexo_lead`, `projeto`).

**Pendente:**
- **Browser, do aceite da F1.16:** que a recusa do 2º CNPJ apareça como mensagem em pt-BR na
  tela. A recusa **no banco** está provada (o ensaio tentou o INSERT duplicado e o índice barrou);
  o que falta é a mensagem, que nenhum smoke em Prisma alcança.
- **Build não rodado:** esta sessão é no servidor de produção, com o serviço no ar servindo
  `.next`. Compilar aqui é passo de deploy, não de verificação.
- **F1.19c** (FK em `Disciplina`) e, depois dela, a F1.21 de verdade — incluindo a conversa com o
  responsável dos 3 projetos das strings compostas.

**Riscos:**
- O índice `cliente_documento_unico` **não exclui** `excluidoEm` nem `fundidoEmId` do predicado —
  é o DDL pedido pelo ADR-03. Hoje é inofensivo (nenhum cliente arquivado tem documento), mas
  recadastrar uma empresa cujo registro antigo foi excluído vai dar erro de duplicata. Está
  anotado na própria migration, com onde mexer.
- `04-plano-fases.md` e `03-migracao.md` estavam com **números de 2026-08-14** apresentados como
  fatos atuais (`projeto = 31`, `46 → 43`, "24 grafias / 18 exatas", catálogo de 20). Foram
  corrigidos com a data da medição, mas vale a lição: número em documento de plano envelhece, e
  este backlog usa número como critério de aceite.
- **O log não tem entrada nenhuma do deploy da Fase 1** (o de 2026-08-16, com o backfill da
  F1.23). Produção estava com 169 migrations aplicadas e schema em dia quando esta sessão começou,
  então o deploy aconteceu — só não foi registrado. Não inventei a entrada por não ter os fatos;
  fica para quem executou.

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

**F1.24 — Remover código do `Oportunidade` órfão** (commit `768fd4a`, Haiku)

Module (`src/modules/comercial/oportunidades/` — actions + queries), view (`oportunidades-view.tsx`), route (`/comercial/oportunidades`), nav button. Tabela fica (guardrail). Aceite: `grep src/ --include=*.tsx -i` acha zero refs de view/rota; `/comercial/oportunidades` → 404; build limpo.

`.next` limpeza necessária (Next.js caching antigo route); pós-limpeza tsc OK.

**Verificação:** tsc limpo (pós-.next), lint OK, 2042 testes ✓, smoke:crm-fase1 OK.

---

**F1.25 — Fecho da Fase 1: lint + test + build + smoke** (commit pendente, Haiku)

Verificação final de Fase 1: 26 tasks, 0 trava.
- `eslint .` ✓
- `vitest run` → 196 arquivos, 2042 testes ✓
- `npm run build` ✓
- Smoke suite (crm-fase1, soft-delete cliente/lead, dedupe, onda4) → 5/5 ✓

**Fase 1 FECHADA.**

---

**Deploy em produção + backfill F1.23 · 2026-08-16 · Sonnet**

Deploy do commit `66e30b2` (Fase 1 fechada) em produção, via menu (`gerenciar-servidor.ps1`,
opção 10): `git pull` → `npm ci` → `npm run build` → backup → `npx prisma migrate deploy`
(migration `20260816090000_crm_lead_campanha_parceiro`, só coluna nullable + tabela nova, sem
dado tocado) → `npm run db:seed` (idempotente) → restart do serviço. Sem downtime fora do
restart.

Em seguida, `npx tsx scripts/backfill-lead-f123.ts --gravar` rodado manualmente (só depois do
`db:seed`, porque depende de `canal_aquisicao` ter a linha "Outro"): preenche
`canalId`/`origemDetalhada` (via `Lead.origem` legado) e `responsavelId` (via `AuditLog`
`criar-lead` por proximidade de horário, fallback `AtividadeLead.autorId`) dos 8 leads reais.
Rodado primeiro em `--dry-run` (padrão sem flag), conferido contra a saída esperada, depois
`--gravar`. **8/8 leads, 0 sem sinal nos dois passos** — bate exatamente com o dry-run.

**Arquivos:** nenhum (execução, não código).

**Pendente:** F1.15/F1.16/F1.21 (fusão manual de 3 grupos de cliente duplicado, índice único de
CNPJ, consolidação de 24 grafias de disciplina) seguem fora deste ciclo — decisão já registrada
(linha 351-353 deste arquivo) de rodar em bloco depois.

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
