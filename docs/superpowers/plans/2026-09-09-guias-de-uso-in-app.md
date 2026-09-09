# Plano — Guias de uso in-app, um por setor

- **Data:** 2026-09-09
- **Origem:** dono pediu replicar o padrão de `/comercial/guia` para os setores mais usados.
- **Estado:** aprovado, aguardando execução da F0.
- **Supersede:** [`2026-07-20-guias-iniciante-setores.md`](2026-07-20-guias-iniciante-setores.md).
- **ADR:** [`docs/adr/0001-guias-de-uso-in-app.md`](../../adr/0001-guias-de-uso-in-app.md).

---

## 1. Por que este plano existe (e o que ele corrige)

O plano de 2026-07-20 travou **D1: fonte da verdade = markdown em `docs/manual/<secao>/guia-iniciante.md`;
o artifact é uma saída gerada dele, nunca editado sozinho.** Isso não sobreviveu ao contato com a
realidade:

| Superfície | Tamanho | Estado |
| --- | --- | --- |
| `src/components/comercial/guia-comercial-view.tsx` | 531 linhas | escrito à mão, é o que as pessoas usam |
| `docs/manual/clientes-comercial/guia-iniciante.md` | 72 linhas | conteúdo divergente, ninguém abre |
| artifact publicado fora do repo | — | congelado desde 2026-07-20 |

Três cópias do mesmo guia, já em drift, e o `.md` **não** gerou o React — o React foi escrito
depois, direto. Além disso a Onda 1 (Projetos) nunca foi executada: só existe **um**
`guia-iniciante.md` no repo inteiro.

Replicar esse arranjo × 9 setores produziria 27 documentos divergindo em paralelo. Este plano
resolve escolhendo **uma** superfície canônica e reduzindo a outra a um ponteiro.

---

## 2. Decisões travadas (dono, 2026-09-09)

| # | Decisão | Consequência |
| --- | --- | --- |
| **N1** | **Taxonomia = 9 setores** do `SECAO_LABEL` (`lib/manual.ts:45`), não os 34 módulos. | Setor ≠ rota: "Gestão" cobre 6 rotas, "Projetos" cobre 7. Um guia por setor, não por tela. |
| **N2** | **A página React é a fonte da verdade.** Revoga D1. | O guia é código versionado, revisável em PR, com componentes e links de verdade. Ver ADR-0001. |
| **N3** | **O `.md` vira stub** de ~5 linhas em `docs/manual/<secao>/guia-iniciante.md` apontando para a rota, com entrada no `search-index.json`. | Preserva o único canal de busca por palavra (`/ajuda`) sem manter uma segunda cópia do conteúdo. |
| **N4** | **Rota `/guias` (índice) + `/guias/[setor]`.** `/comercial/guia` fica como redirect permanente. | Setor≠rota inviabiliza `/[modulo]/guia`. Índice único resolve a descoberta, que hoje é zero. |
| **N5** | **Gate: colaborador interno**, independente da permissão do módulo. `cliente` fora. | Ler sobre Financeiro sem ter `financeiro:ver` é o caso de uso central de um guia de formação. |
| **N6** | Novo helper **`requireInterno()`** em `lib/session.ts`, pelo eixo `tipo`. **Não** usar `INTERNAL_ROLES`. | A Onda D aposentou `role` como gate; abrir 5 usos novos de `INTERNAL_ROLES` reabriria o eixo morto. |
| **N7** | **Primitivas extraídas para `src/components/guias/` antes do 2º guia**, migrando o Comercial junto. | Sem isso, 9 guias = milhares de linhas de JSX quase idêntico. |
| **N8** | **Template = estrutura do Comercial + `#vocabulario` e `#armadilhas` obrigatórias.** | Financeiro e RH travam a pessoa no *termo*, não no clique. Sem glossário o guia falha no público-alvo. |
| **N9** | **Fronteira editorial mantida** (§4): guia = significado, porquê, encadeamento. Manual = permissões, regras, campo a campo, erros. O guia **linka**. | Última defesa contra o guia virar segunda cópia do manual. |
| **N10** | **Escopo: 5 guias** — Projetos, Financeiro, RH/Ponto, Gestão + Comercial migrado. Os outros 4 ficam em backlog aberto. | Cobre os setores de jargão denso; Início/Portal, Comunicação e Sistema têm pouco vocabulário próprio, Engenharia tem público especialista. |
| **N11** | **Índice lista os 9 setores**, os 4 sem guia marcados "em breve" (desabilitados). Rótulo **"Guias de uso"**. | Comunica que a cobertura é parcial de propósito; serve de roadmap visível. |
| **N12** | **Botão "Guia" só nas 5 páginas-âncora.** | 25 headers com o mesmo link é poluição; sidebar + índice carregam a descoberta geral. |

---

## 3. Ordem de execução

Herdada do plano anterior (D3 e §8), que segue válida: **Projetos → Financeiro → RH/Ponto → Gestão**.
Justificativa original mantida — Projetos tem a maior audiência (todos os perfis), Financeiro a maior
densidade de jargão, RH/Ponto o jargão juridicamente sensível, Gestão o processo contratual.

O ranking **não** foi medido por dado de uso. Existe instrumentação para isso — `AcessoPagina`
(beacon de page-view por seção) alimentando `/auditoria/uso` — mas só produção tem dados reais
(o banco de dev é recriado por `seed:demo`). Se em algum momento o dono quiser reordenar as fases,
essa é a fonte; a ressalva a registrar é que `AcessoPagina` mede page-view, então setores de leitura
pesada aparecem inflados e ações em massa subrepresentadas.

---

## 4. Fronteira editorial (a regra que impede duplicação)

Herdada de 2026-07-20 §3, mantida sem alteração:

| Entra no **guia de uso** | Fica no **manual de referência** (`/ajuda`) |
| --- | --- |
| O que cada termo **significa** (lead, aging, EAP, período aquisitivo) | Definição campo a campo da tela |
| **Por que** o processo existe e a ordem natural dele | Regras de negócio exatas |
| Como as telas **se encadeiam** | O que cada botão faz, isolado |
| Confusões conceituais do setor | Tabela de erros × causa × solução |
| Papéis: quem faz o quê | Matriz de permissões (`recurso:ação`) |

**Regra de ouro:** o guia **liga** para a página de referência, nunca repete.

---

## 5. Template de um guia

Derivado da estrutura real de `guia-comercial-view.tsx`, com as duas seções que N8 acrescenta.
Âncoras fixas, para que o índice lateral e os deep-links sejam previsíveis entre setores:

| Ordem | Âncora | Conteúdo | Obrigatória |
| --- | --- | --- | --- |
| 1 | *(header)* | Título em linguagem de resultado ("Da entrada do cliente ao projeto contratado") + 2–3 botões de ação real + card "regra mais importante" | sim |
| 2 | *(nav de marcos)* | Timeline horizontal de 4–6 marcos, ancorada nas etapas | sim |
| 3 | `#vocabulario` | **NOVO (N8).** Glossário do setor em linguagem de leigo, com exemplo concreto por termo | **sim** |
| 4 | `#antes` | O que precisa estar configurado; atalhos para as telas de cadastro | quando aplicável |
| 5 | `#<etapa-1..n>` | Uma `<Etapa>` por marco, numerada, com `<Acao>` (Na tela / Clique em / O que acontece) e `<Dica>` | sim |
| 6 | `#rotina` | O que a pessoa faz todo dia neste setor | quando aplicável |
| 7 | `#armadilhas` | **NOVO (N8).** Onde a pessoa se perde. No Comercial: dois pipelines paralelos | **sim** |
| 8 | `#duvidas` | Perguntas **conceituais**, não mensagens de erro (essas ficam no manual) | sim |

O Comercial ganha `#vocabulario` e `#armadilhas` na migração da F0 — o glossário sai do `.md`
("O que cada nome significa") e vira seção da página antes de o `.md` ser reduzido a stub.

---

## 6. Arquitetura

### 6.1 Componentes compartilhados (`src/components/guias/`)

Extraídos de `guia-comercial-view.tsx` sem mudança visual:

| Componente | Hoje (linha) | Papel |
| --- | --- | --- |
| `NomeBotao` | 37 | Rótulo de botão da UI, com ícone de cursor |
| `Acao` | 46 | Grid 3 colunas: Na tela / Clique em / O que acontece |
| `Dica` | 65 | Callout com lâmpada |
| `Etapa` | 74 | Seção numerada com ícone, título, resumo e trilha vertical |
| `Atalho` | 122 | Link-pílula para uma tela relacionada |
| `MarcosNav` | 29 + 179 | Timeline horizontal a partir de uma lista de marcos |
| `IndiceGuia` | 199 | `<aside>` sticky "Nesta página" |
| `GuiaShell` | — | Novo: envelope `max-w-6xl` + grid `[14rem_1fr]`, para os 5 guias não repetirem o layout |

São primitivas de **apresentação**, sem lógica de negócio nem estado — extrair com um exemplo é
seguro. A alternativa (copiar o arquivo e refatorar depois) nunca volta para ser refatorada.

### 6.2 Rotas

```
src/app/(dashboard)/guias/page.tsx           → índice, 9 setores (4 "em breve")
src/app/(dashboard)/guias/[setor]/page.tsx   → despacha para o view do setor
src/app/(dashboard)/comercial/guia/page.tsx  → redirect("/guias/clientes-comercial")
```

`[setor]` valida contra um mapa estático `SETORES_GUIA` (chave = a mesma do `SECAO_LABEL`), e
`notFound()` para chave desconhecida ou setor sem guia. `generateStaticParams` opcional — as
páginas são estáticas, sem leitura de banco.

O mapa também alimenta o índice e o botão das páginas-âncora, para que os três nunca desalinhem:

| Setor | Rota do guia | Página-âncora do botão |
| --- | --- | --- |
| `projetos` | `/guias/projetos` | `/projetos` |
| `financeiro` | `/guias/financeiro` | `/financeiro` |
| `rh-ponto` | `/guias/rh-ponto` | `/rh` |
| `gestao` | `/guias/gestao` | `/licitacoes` |
| `clientes-comercial` | `/guias/clientes-comercial` | `/comercial` |

**Ponto fraco conhecido:** Gestão não tem página-âncora natural (são 6 rotas independentes —
`/licitacoes`, `/juridico`, `/qualidade`, `/patrimonio`, `/certidoes`, `/acessos`). `/licitacoes`
é escolha arbitrária; a F4 revisita se ficar esquisito na prática. Sidebar + índice cobrem o caso.

### 6.3 Gate de acesso

`SessionUser` **não** carrega `tipo` hoje; o `(dashboard)/layout.tsx:44` faz um
`prisma.user.findUnique` próprio só para obtê-lo. Mas `getSession` (`lib/session.ts:54`) **já faz**
um `findUnique` no mesmo `User`, e é `cache()`d por request.

Portanto: acrescentar `tipo: true` àquele `select` e expor `tipo` em `SessionUser` — **zero
round-trip extra**.

#### ⚠️ `User.tipo` é nullable, e isso muda o gate

`prisma/schema.prisma:89` declara `tipo TipoUsuario?` — **opcional, sem `@default`**, escrito só por
`aplicarVinculo()` (`modules/usuarios/vinculo/service.ts:77,89`). Quem nunca teve vínculo aplicado
tem `tipo: null`. O caso mais provável é o **admin semeado** por `db:seed`, que cria "admin +
permissions + catalogs" e nenhum `Vinculo`.

Um gate ingênuo (`tipo !== "interno" → notFound()`) trancaria essa pessoa **em silêncio**: o item de
nav também é filtrado pelo mesmo eixo, então não sobra nem erro nem porta de entrada. Quem
encomendou os guias tomaria 404 neles.

Existe precedente que o plano velho não citava: `/versoes` gateia a **rota** em `INTERNAL_ROLES`
(`versoes/page.tsx:23`) e usa `nav.tipo === "interno"` só para **exibir** o link no rodapé. O eixo
`role` foi mantido no gate provavelmente por causa desta nullability.

**F0 começa medindo**, com o Postgres de dev de pé:

```sql
SELECT tipo, role, COUNT(*) FROM "User" WHERE ativo = true GROUP BY 1, 2 ORDER BY 1, 2;
```

Se `tipo` estiver preenchido em todo mundo, `requireInterno()` pode ser puro. Enquanto não estiver,
o gate carrega o fallback abaixo — que **falha fechado** para `cliente`, o único perfil fora de
`INTERNAL_ROLES` ("todos exceto cliente", `roles.ts:35`):

```ts
/**
 * Exige colaborador interno. Eixo primário é `tipo` (o vigente desde a Onda D); `role` entra só
 * como rede para quem ainda não tem `Vinculo` aplicado — `User.tipo` é nullable e só
 * `aplicarVinculo()` o escreve, então `null` NÃO significa "externo".
 */
export async function requireInterno(): Promise<SessionUser> {
  const u = await requireUser();
  const interno = u.tipo === "interno" || (u.tipo == null && INTERNAL_ROLES.includes(u.role));
  if (!interno) notFound();
  return u;
}
```

`notFound()` e não `redirect("/")`: para quem é externo a página simplesmente não existe, e não
vaza que existe uma área interna com esse nome.

O item de nav precisa da **mesma** regra, senão volta a assimetria "vê o link e toma 404" (ou o
inverso). `NavItem.tipo` compara com `ContextoNav.tipo` de forma estrita hoje — conferir o
comportamento com `tipo: null` antes de fechar a fase.

#### ⚠️ A armadilha do `Omit<>` compila limpa

`getSession` monta `base` como
`session.user as unknown as Omit<SessionUser, "ehSocio" | "perfilId" | … | "setor">`. Se `tipo`
entrar em `SessionUser` **sem** entrar nessa lista de `Omit`, o TypeScript passa a acreditar que
`base.tipo` já existe, o objeto de retorno type-checka, e em runtime `tipo` é `undefined` → o gate
tranca todo mundo. `lint` e `build` passam. É a mesma forma do bug de export não-função em
`"use server"`: quebra em runtime, não em `tsc`.

**Acrescentar `"tipo"` ao `Omit<>` é parte da mudança, não um detalhe.**

**Fora de escopo (mas anotado):** com `tipo` em `SessionUser`, a query duplicada do
`(dashboard)/layout.tsx` pode ser encolhida. Não fazer nesta entrega — mexer no contexto do menu
tem alcance grande demais para caber aqui.

Item de nav correspondente: `{ title: "Guias de uso", href: "/guias", icon: BookOpenText, tipo: "interno" }`,
no primeiro grupo, logo **acima** de "Ajuda" — o par formação/referência fica junto.

**Fora de escopo (mas anotado):** com `tipo` em `SessionUser`, a query duplicada do
`(dashboard)/layout.tsx` pode ser encolhida. Não fazer nesta entrega — mexer no contexto do menu
tem alcance grande demais para caber aqui.

---

## 7. Fases

Cada fase é verificada antes da próxima. **O modelo de IA é parte da fase: se a fase pede um
modelo diferente do ativo, PARAR e esperar a troca via `/model` — não apenas avisar.**

| Fase | Escopo | Modelo |
| --- | --- | --- |
| **F0** | Infra, nesta ordem: **medir `tipo` no banco (§6.3)** → `tipo` em `SessionUser` (+ no `Omit<>`!) + `requireInterno()` → `components/guias/` extraído + `GuiaShell` → `/guias` índice (9 setores, 4 "em breve") + `/guias/[setor]` → item de nav → redirect de `/comercial/guia` → Comercial migrado **com `#vocabulario` e `#armadilhas`** → stub `.md` + `search-index.json` do Comercial | **Opus** |
| **F1** | Guia de **Projetos** | **Opus** |
| **F2** | Guia de **Financeiro** | **Opus** |
| **F3** | Guia de **RH e Ponto** | **Opus** |
| **F4** | Guia de **Gestão** | **Sonnet** |

F0 em Opus por tocar autorização: um `requireInterno()` errado abre página interna para `cliente`.
F1–F3 em Opus pela densidade de jargão e sensibilidade (financeira em F2, trabalhista em F3).
F4 em Sonnet — Gestão é o menos denso dos quatro e chega com o template já batido três vezes.

---

## 8. Definition of Done (por fase de guia)

Um guia só está pronto quando **todos** os cinco itens estão feitos:

1. **Rota no ar** — `/guias/<secao>` renderiza, entrada no índice deixa de ser "em breve", botão na
   página-âncora, template da §5 com `#vocabulario` e `#armadilhas` presentes.
2. **Fase C de conferência, com a lista de divergências entregue como saída.** Cada afirmação do
   guia conferida contra `modules/<dominio>/{queries,actions,schemas}.ts` e os `*-view.tsx` — **contra
   o código, não contra o manual** (ADR-001). As divergências entre o que a UI promete e o que ela
   faz são um entregável, não um subproduto.
3. **Stub `.md`** em `docs/manual/<secao>/guia-iniciante.md` (~5 linhas, frontmatter completo,
   aponta para a rota) **+ entrada em `docs/manual/search-index.json`**. ⚠️ Sem a entrada no
   manifesto a página não aparece no `/ajuda` — `listarSecoes()` lê só o manifesto, não varre o
   disco (`lib/manual.ts:132`).
4. **`npm run lint` e `npm run build` limpos.** Nunca rodar `build` com `next dev` ativo no mesmo
   `.next`.
5. **Deliberação** registrada em `docs/manual/deliberacoes/`, no formato do Conselho.

O item 2 é o que faz o trabalho valer além da documentação. No piloto do Comercial ele revelou que
`Proposta.leadId` nunca era preenchido — o card "Propostas" na ficha do lead e o badge "N proposta(s)"
no funil ficavam **sempre vazios**. Virou correção de código (`criarPropostaDeLead`).
**Documentar para leigo é auditoria de produto disfarçada.**

---

## 9. Insumos por fase

### F1 — Projetos

**Rotas:** `/projetos` · `/projetos/[id]` (disciplinas, coordenação, custos, arquivos, diário,
histórico, inputs, lista-mestre, serviços, extras, ARTs) · `/projetos/meu-trabalho` · `/tarefas` ·
`/agenda` · `/planejamento` (+ `/cronograma`) · `/recursos` · `/pendencias` · `/arquivos` · `/aprovacoes`

**Manual a linkar (não repetir):** `projetos/{projetos,meu-trabalho,tarefas,agenda,planejamento,recursos}.md`

**Glossário (`#vocabulario`):** disciplina · pendência · EAP/WBS · caminho crítico (CPM) ·
baseline e desvio · saúde do projeto (`modules/projetos/health.ts`) · alocação/carga ·
coordenação BIM e apontamento · lista mestre.

**Fluxo:** proposta aceita → projeto com disciplinas → planejamento (EAP, prazos, caminho crítico) →
alocação → execução (tarefas, meu trabalho) → coordenação e pendências → entrega.

**Encaixe:** o projeto nasce do aceite da proposta (`aceitarProposta`, que cria disciplinas e canais
de chat). O guia de Projetos **começa exatamente onde o do Comercial termina** — os dois se encaixam,
e cada um deve linkar o outro nesse ponto.

**Armadilha a investigar:** projeto tem **dois prazos** (contrato × planejado) e prazo é
dia-calendário, não instante — fonte clássica de confusão.

### F2 — Financeiro

**Rotas:** `/financeiro` + ~20 subrotas (lançamentos, contas a pagar/receber, contas, conciliação,
fluxo de caixa, DFC, balanço, orçamento, rentabilidade, fechamento, folha-projetistas, aprovações,
relatórios, planejamento, cadastros, importar, documentos) · `/documentos` (Estúdio)

**Manual a linkar:** `financeiro/{visao-geral,lancamentos,contas-e-aging,conciliacao-ofx,aprovacoes,relatorios,estudio-documentos}.md`

**Glossário:** aging (faixas `a_vencer…d120_mais`, `lib/aging.ts`) · caixa × competência ·
conciliação OFX · DFC · rentabilidade · fechamento · limite de aprovação
(`devePassarPorAprovacao`) · soft delete de `Lancamento`.

**Armadilha:** `Lancamento` é soft-deleted e filtrado por extensão do Prisma — "desapareceu" nem
sempre é "foi apagado".

### F3 — RH e Ponto

**Rotas:** `/rh` (+ admin, catálogos, escalas, folha, funcionários, pessoas, pessoas-juridicas,
produtividade) · `/ponto` (+ espelho) · `/minha-ficha` · `/minha-escala`

**Manual a linkar:** `rh-ponto/{funcionarios,folha-clt,pessoas-juridicas,ponto,produtividade,rh-admin,rh-autoatendimento}.md`

**Glossário:** período aquisitivo × concessivo (`lib/aquisitivo.ts`) · encargos INSS/IRRF
(`lib/encargos.ts`) · banco de horas · espelho de ponto · escala · CLT × projetista PJ (Folha=CLT,
Produção=PJ) · batida offline.

**Armadilha:** a fronteira Folha (CLT) × Produção (PJ) é a confusão estrutural do setor — duas
esteiras de pagamento com vocabulário parecido.

### F4 — Gestão

**Rotas:** `/licitacoes` (+ `[id]`, processo, sanções) · `/juridico` · `/qualidade` ·
`/patrimonio` (+ `/ti`) · `/certidoes` · `/acessos` (+ categorias, auditoria)

**Manual a linkar:** `gestao/{licitacoes,juridico,qualidade,patrimonio,certidoes,acessos,ti}.md`

**Glossário:** edital · habilitação · certidão e vigência · sanção · aditivo · modelo de contrato ·
patrimônio × TI · cofre de acessos (dois gates, escopo não herda `acessoGlobal`).

**Armadilha:** `juridico` (contratos, certidões) ≠ `legal` (Termos de Uso) — nomes próximos,
concerns distintos. E o cofre de Acessos tem dois gates independentes.

---

## 10. Backlog aberto (não cancelado)

Início e Portal · Comunicação · Sistema · Engenharia. Aparecem no índice como "em breve".
Engenharia fica por último de propósito: quem usa as ferramentas de cálculo é engenheiro — não é
leigo no domínio, é leigo no *sistema*, e disso o manual de referência já dá conta.

---

## 11. Riscos

| Risco | Mitigação |
| --- | --- |
| **Guia envelhecer com a feature.** Agora é código, então quebra silenciosa é menos provável — mas texto desatualizado não quebra build. | Mesma regra do `docs/manual/`: mudou a feature, atualiza o guia no mesmo PR. A `<Etapa>` referencia rotas reais via `<Link>`, então rota removida vira erro de tipo. |
| **Guia virar segunda cópia do manual.** | Fronteira editorial da §4, aplicada na revisão de cada fase. |
| **`search-index.json` esquecido** → stub invisível no `/ajuda`. | Item 3 do DoD. |
| **Extração de componentes mudar o visual do Comercial sem ninguém notar.** | F0 é refactor sem mudança de comportamento: conferir a página lado a lado antes/depois, e o `#duvidas`/`#vocabulario` novos entram em commit separado da extração. |
| **`requireInterno()` errado abrir área interna para `cliente`.** | F0 em Opus; conferir com um usuário `cliente` e um `externo` de verdade antes de fechar a fase. |
| **`requireInterno()` trancar colaborador interno em silêncio** (`User.tipo` nullable). | Medição em SQL como primeiro passo da F0 + fallback por `INTERNAL_ROLES` para `tipo == null`. Ver §6.3. |
| **`tipo` esquecido no `Omit<>` de `getSession`** → gate tranca todos, com `lint` e `build` limpos. | §6.3 explicita; testar logado antes de seguir para a F1. |
| **Escopo inflar para 9 guias.** | N10 trava em 5; o resto é backlog explícito, visível no índice. |
| **Stub `.md` virar conteúdo aos poucos** (alguém "só acrescenta um parágrafo"). | O stub diz no próprio corpo que o conteúdo mora na rota e que ele não deve crescer. |

---

## 12. Relacionados

- [ADR-0001 — Guias de uso in-app](../../adr/0001-guias-de-uso-in-app.md) — revoga D1
- [Plano anterior, superseded](2026-07-20-guias-iniciante-setores.md)
- [ADR-001 — Estrutura da documentação](../../manual/decisions/ADR-001-estrutura-documentacao.md)
- [Deliberação do piloto do Comercial](../../manual/deliberacoes/2026-07-21-comercial-guia-iniciante.md)
- [`CONTEXT.md`](../../../CONTEXT.md) — glossário: guia de uso, setor, manual de referência, fronteira editorial
