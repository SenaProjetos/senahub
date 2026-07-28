# Setor × Contratação × Perfil de Acesso — separar vínculo, função e permissão

**Data:** 2026-07-27 · **Status:** P1 **implementado**; Fase 0 → F pendentes · **Branch:** `dev`

Deliberado por conselho de 4 cadeiras (Gerente de RH, Dev Sênior, Diretor, Usuária final), duas rodadas:
parecer independente + confronto cruzado. Divergências e concessões registradas em §8.

---

## 1. Problema

`Role` é hoje **um enum único** que mistura quatro eixos independentes:

| Eixo | Valores hoje presos no `role` |
|---|---|
| Contratação | `clt`, `estagiario`, `projetista_pj`, `freelancer` |
| Setor | `administrativo`, `ti` |
| Hierarquia / super-usuário | `admin`, `supervisor` |
| Tipo de acesso (interno × externo) | `cliente` |

Consequência prática: **um projetista CLT e um projetista PJ fazem a mesma função e são perfis diferentes
no sistema** — veem telas diferentes sem motivo funcional, e a documentação de cadastro exigida (que
depende só da contratação) não tem onde ser expressa.

## 2. Modelo alvo

- **Setor** (onde a pessoa atua): `diretoria`, `administrativo`, `juridico`, `engenharia`, `ti`
- **Contratação** (como é contratada): `clt`, `estagio`, `pj`, `freelancer` (+ `pro_labore`, ver §9.1)
- **Perfil de acesso** (o que pode fazer): tabela nomeada e cadastrável, com matriz padrão + override por usuário
- **Tipo de usuário** (interno × externo): eixo próprio — `cliente` do portal não tem setor nem contratação
- **Super-usuário**: flag booleana **fora da matriz** de permissão

**Setor e Contratação NÃO concedem permissão.** Toda autorização passa pelo Perfil de acesso.

### 2.1 Regra derrubada pelo conselho

A decisão inicial *"quem está no setor Diretoria enxerga tudo"* foi rejeitada por unanimidade e **não entra
no plano**. Motivo (Diretor): *"assistente de diretoria fisicamente 'está' na Diretoria — se isso vira
sinônimo de ver salário de todo mundo, é vazamento por acidente de organograma. Setor é endereço, não
crachá."* Tecnicamente também era contraditória: "setor concede acesso total" × "setor não concede
permissão" não podem ser ambas verdade.

**Substituto:** um Perfil de acesso chamado **"Diretoria"**, atribuído pessoa a pessoa. Alguém pode estar
no setor Diretoria e não ter o perfil.

### 2.2 Comercial e Financeiro

Levantados como setores ausentes (Diretor e Usuária, independentemente). **Decisão do conselho: a lista de
5 setores fica**, e a separação de quem vê dinheiro é feita 100% por Perfil de acesso — que é onde ela
pertence. Setor não decide acesso (§2.1), então criar setores só para segregar informação seria resolver o
problema na camada errada.

## 3. Blast radius medido

Medido por grep em `src/` (exclui `src/generated/`):

| Categoria | Sites | Natureza |
|---|---|---|
| `requirePermission(recurso, acao)` | **81** | **invariante** — nem recebe role |
| `can(user.role, r, a)` | **119** | codemod de assinatura |
| `requireRole` + `defineAction roles:[]` | 25 + 6 | gate por role |
| `.role ===/!==` direto | **56** | ver quebra abaixo |
| audience queries (`role: { in \| notIn }`) | **36** | 22 via helper, 14 hardcoded |
| `nav-config.ts` | 39 itens, 36 com `roles[]` | UI |
| Role persistido **como dado** | 4 campos | `Aviso.alvoRoles`, `SolicitacaoCadastro.role`, `DocumentoModelo.perfis`, `EscalaRole.role` |

**Quebra dos 56 `.role ===` — o dado que mais informa o plano:**
`"admin"` **24** · `"cliente"` **20** · combos GLOBAL/HR **11** · **contratação: 3**.

> **79% das comparações diretas são sobre os dois eixos que o modelo inicial não tinha** (super-usuário e
> interno×externo). Apenas 3 sites em 56 são sobre contratação. E **"setor" não existe hoje**:
> `User.departamento` é texto livre que nenhuma tela lê — para os vínculos operacionais (CLT, estágio, PJ,
> freelancer) **não há dado de origem** e a atribuição de setor exige revisão humana pessoa a pessoa.

Esforço: **~60% mecânico, ~30% semântico**, e ~200 sites que o refactor nem enxerga.

## 4. Achado fora do escopo: passivo trabalhista ativo

Levantado pela Gerente de RH, validado pelo Dev Sênior e conferido de novo na thread principal. **Os quatro
são bugs vivos hoje, independentes desta reforma.**

| # | Bug | Evidência | Efeito |
|---|---|---|---|
| **a** | Estagiário recebe desconto de INSS/IRRF | `rh/folha/actions.ts:63` — `role: { in: CLT_ROLES }` e `CLT_ROLES = ["clt","estagiario"]` (`lib/roles.ts:46`). `calcularEncargos` (`lib/encargos.ts:54`) é pura e não recebe role — não tem como distinguir | Estagiário **não é segurado obrigatório do RGPS** (Lei 11.788, arts. 12 e 15). Desconto indevido + reforço da tese de vínculo. Mesmo filtro em `folha/queries.ts:51` e `banco/actions.ts:27` |
| **b** | Estágio com jornada de 8h/dia | `scripts/migrar-escalas.ts:19-36` semeia `EscalaRole` para `clt` **e** `estagiario` com `horasDia: 8` hardcoded — e **não está no `package.json`**. Se rodou, 8h explícita no banco; se não rodou, `completarSemana` cai em `diaPadrao()` (`rh/escalas/queries.ts:17`) = 8h. **Os dois caminhos dão 8h** | Limite legal do estágio é 6h/30h. `EspelhoAceite` guarda **hash SHA-256 do espelho aceito** → o sistema produz mensalmente prova assinada de jornada ilegal |
| **c** | Ponto e férias sem gate server-side | `ponto/actions.ts:21` e `rh/actions.ts:12`: `const base = { modulo: "rh" } as const` — **sem `roles` e sem `recurso`**. Em `with-action.ts:69-81` os dois gates são condicionais → pulados. `controlaJornada` (`ponto/queries.ts:706`) é 100% apresentação (todos os 20 usos são `colunas`/`grid-cols`) | PJ, freelancer e sócio batem ponto com geolocalização, tolerância de atraso (art. 58 §1º), banco de horas e pedem férias. Server Action é endpoint: **`cliente` também alcança `registrarBatida`**. Conjunto probatório de pejotização em banco estruturado e exportável |
| **d** | Não existe rescisão | grep por `dataDemissao\|demissao\|desligamento\|rescisao\|dataSaida` em `src/` + `prisma/` = **zero**. Existe `dataAdmissao`, não existe o par | Impossível calcular verbas. E como folha/banco filtram `ativo: true`, **desligar no dia 20 remove a pessoa da folha do mês inteiro** |

Diretor e Usuária, sem se consultar, colocaram a correção destes acima da reforma e acima do roadmap de
cliente. Estimativa de exposição da RH para (a)+(b): **R$60-120k por estagiário** com vínculo reconhecido.

## 5. Schema proposto

```prisma
enum Setor        { diretoria administrativo juridico engenharia ti }
/// Sem valor `socio` (§9.1): `model Socio` já é o eixo societário.
/// `freelancer` deixa de existir como valor: vira `pj` ou `autonomo_rpa` conforme o caso (§9.2).
enum Contratacao  { clt estagio pj autonomo_rpa pro_labore }
enum TipoUsuario  { interno externo }

/// Fonte de verdade do vínculo. Uma pessoa, N vínculos ao longo do tempo, no máximo um ativo.
model Vinculo {
  id           String      @id @default(cuid())
  userId       String
  user         User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  contratacao  Contratacao
  setor        Setor
  cargo        String?
  cargaSemanal Decimal?    @db.Decimal(4,1)
  remuneracao  Decimal?    @db.Decimal(12,2)
  pjId         String?
  dataInicio   DateTime    @db.Date
  dataFim      DateTime?   @db.Date   // resolve o bug (d)
  motivoFim    String?
  ativo        Boolean     @default(true)
  @@index([userId, dataInicio])
  @@map("vinculo")
}

model PerfilAcesso {
  id         String  @id @default(cuid())
  chave      String  @unique          // slug ESTÁVEL — nunca renomear (mesma regra de ferramentas/registry.ts)
  nome       String                   // rótulo pt-BR, editável
  descricao  String?
  sistema    Boolean @default(false)  // perfis semente: não excluíveis
  ativo      Boolean @default(true)
  permissoes PermissaoPerfil[]
  usuarios   User[]
  @@map("perfil_acesso")
}

model PermissaoPerfil {
  id        String       @id @default(cuid())
  perfilId  String
  perfil    PerfilAcesso @relation(fields: [perfilId], references: [id], onDelete: Cascade)
  recurso   String
  acao      String
  permitido Boolean      @default(true)
  @@unique([perfilId, recurso, acao])
  @@map("permissao_perfil")
}

/// Override individual — 3 estados: ausente / concede / revoga.
model PermissaoUsuario {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  recurso        String
  acao           String
  permitido      Boolean
  motivo         String                  // OBRIGATÓRIO — sem isso vira lixo em 12 meses
  expiraEm       DateTime?
  concedidoPorId String?
  criadoEm       DateTime @default(now())
  @@unique([userId, recurso, acao])
  @@index([userId])
  @@map("permissao_usuario")
}

model User {
  vinculoAtivoId String?      @unique       // ponteiro para o Vinculo corrente
  tipo           TipoUsuario  @default(externo)
  setor          Setor?                     // CACHE derivado do vínculo ativo
  contratacao    Contratacao?               // CACHE derivado do vínculo ativo
  perfilId       String?
  perfil         PerfilAcesso? @relation(fields: [perfilId], references: [id])
  superUsuario   Boolean      @default(false)  // ex-admin: bypass, fora da matriz por design
  overrides      PermissaoUsuario[]
  role           Role         @default(cliente) // LEGADO derivado — dropar na última onda
  @@index([tipo, setor])
  @@index([perfilId])
}
```

**Por que os escalares ficam como cache** (e não são lidos do `Vinculo` a cada consulta): as 36 audience
queries filtram em SQL (`where: { contratacao: { in: [...] } }`). Resolvê-las pelo `Vinculo` exigiria
subquery com predicado de data em toda notificação, folha e digest. Cache + índice mantém isso barato.
Escrito num **único ponto** (`aplicarVinculo()`), nunca à mão, com teste de consistência no CI e
reconciliação noturna.

**Snapshot de `vinculoId`** em `Holerite`, `Ferias`, `BancoHorasMensal`, `RateioHora`, `NotaFiscalPJ`,
`EspelhoAceite` — **coluna nullable, sem backfill histórico**. Linhas anteriores ficam `null` =
"pré-modelo". Adicionar FK nullable é aditivo e risco zero; reprocessar histórico é caro e perigoso
(+1 dia vs. +4-6 dias).

### 5.1 Resolução de permissão

```
permissaoEfetiva(user, recurso, acao):
  1. if (!user.ativo)                                → false
  2. if (user.superUsuario)                          → true       // não revogável
  3. override não expirado                           → override.permitido   // explícito vence, inclusive negando
  4. base = PermissaoPerfil[user.perfilId, r, a] ?? false
  5. → base                                                       // default NEGADO, como hoje
```

Não há passo de setor. `acessoGlobal()` (33 usos) vira **permissão de catálogo** (`escopo:global`),
resolvida uma vez no `getSession()` e exposta como `user.escopoGlobal: boolean` — assim
`escopoProjeto(viewer)` continua **síncrona** e os 33 sites não mudam de assinatura.

**O piso implícito do sócio some.** Hoje `ehSocio` concede leitura elevada por código
(`roles.ts:69`, `session.ts:61`, `permissions.ts:43`) — invisível, não auditável, não revogável: a mesma
doença do "Diretoria vê tudo". Vira dado: o backfill atribui um perfil `socio` (com `escopo:global` de
leitura + `financeiro:ver`) a todo `Socio.ativo`. Comportamento idêntico no dia 1, agora auditável e
revogável. `ehSocio` fica só para o financeiro de verdade (retiradas, pró-labore).

### 5.2 Cache

- **Perfis:** mesma LRU de hoje, chaveada por `perfilId`, `max: 64`. `invalidatePerfil(perfilId)` no lugar
  de `invalidatePermissions(role)`. Continua válido porque o deploy é single-instance.
- **Overrides: NÃO cacheados.** É onde mora todo bug de invalidação em sistema de permissão. `getSession()`
  já faz um round-trip por request (o `findUnique` de `Socio`) e já é memoizado por `React.cache()` —
  troca-se por um único `findUnique` com `include: { perfil, overrides, socio }`. Mesma quantidade de
  queries que hoje, snapshot consistente por request, superfície de invalidação zero.

## 6. Migração

### 6.1 Mapa determinístico

| role atual | tipo | setor | contratação | perfil semente | superUsuario | revisão humana |
|---|---|---|---|---|---|---|
| `admin` | interno | — | — | — | **true** | confirmar quem é |
| `supervisor` | interno | **engenharia**³ | **clt**³ | `coordenador`³ | false | confirmar escopo global |
| `administrativo` | interno | administrativo | clt | `administrativo` | false | sim (§9.5) |
| `ti` | interno | ti | clt | `ti` | false | sim (§9.5) |
| `clt` | interno | **engenharia**² | clt | `projetista` | false | pós-virada |
| `estagiario` | interno | **engenharia**² | estagio | `estagiario` | false | pós-virada (+ carga horária) |
| `projetista_pj` | interno | **engenharia**² | pj | `projetista` | false | pós-virada |
| `freelancer` | interno | **engenharia**² | pj¹ | `colaborador_eventual` | false | **sim — pj × autonomo_rpa** |
| `cliente` | **externo** | — | — | `portal_cliente` | false | não |

¹ ver §9.2 — e **atenção ao mapa contábil**, §6.3.
³ **Decisão do dono (2026-07-27): `supervisor` passa a se chamar "Coordenador"**, é de **Engenharia** e
tem contratação **CLT** (a princípio). O rótulo já foi trocado em `ROLE_LABELS` (`lib/roles.ts`) — só o
rótulo; o valor do enum segue `supervisor` no banco, nas permissões e nas migrations, e vira a `chave`
`coordenador` do Perfil de acesso na Onda A.

**Matriz do coordenador: fechada em 20 permissões** (`PERMISSOES_BASE`, `prisma/seed.ts`), conferida
contra a tela Configurações → Permissões. O seed estava fora de sincronia: concedia **42** — incluindo
`usuarios:gerir`, `configuracoes:gerir`, `financeiro:ver/gerir`, `rh:cadastro`, `rh:folha`,
`patrimonio:ti`, `juridico:gerir` e a administração inteira do ponto — porque as revogações foram feitas
na tela e nunca voltaram ao código. Um banco novo nascia com um coordenador muito mais poderoso que o
real. Faltava também `projetos:historico`, que a tela concede. Sem impacto no banco atual: a tela grava
`permitido: false` mantendo a linha (`modules/permissoes/actions.ts`) e o seed usa `update: {}`.

O recorte é de **coordenação técnica pura**: projetos, arquivos, planejamento, coordenação BIM, recursos,
ferramentas, biblioteca e o `ponto:rateio`. Sem financeiro, comercial, jurídico, licitações, clientes,
RH-pessoas, patrimônio, usuários/configurações nem Estúdio de Documentos. Estas 20 linhas são a matriz
semente do perfil `coordenador` na Onda B (princípio de espelho, §6.2).

**Escopo global: mantido (decisão do dono, 2026-07-27).** `supervisor` segue em `GLOBAL_ROLES` — o
Coordenador continua vendo todos os projetos por ora. Note que **a matriz de permissões não controla
isso**: escopo de dados vem de `GLOBAL_ROLES` em `lib/roles.ts`, que é código, não a tela. Restringir o
Coordenador às próprias frentes seria mudança de regra deliberada, posterior à virada e fora do teste de
equivalência (que só acusa *ganho* de acesso).

² **Decisão do dono (2026-07-27): "a princípio, considerar todos os CLT, estágio, PJ e freelancer como
Engenharia."** Destrava o backfill — deixa de haver campo sem dado de origem. É um **default**, não um
levantamento: quem estiver em outro setor é corrigido depois da virada, na tela de cadastro. Como Setor não
concede permissão nenhuma (§2.1), um setor errado **não** causa ganho nem perda de acesso — só polui
relatório de headcount e carga. É por isso que o default é seguro aqui e não seria num modelo em que setor
autorizasse algo.

**Automatizável:** `tipo`, `setor`, `contratacao`, `perfilId`, `superUsuario` — 100% determinístico com o
default acima. **Ainda exige humano:** o destino de `supervisor` (§9.7), a validação de
`administrativo`/`ti` (perfil, não setor), e a separação `pj` × `autonomo_rpa` dentro de `freelancer`
(§9.2). O backfill continua gerando o **CSV de revisão** — agora como conferência pós-virada, não como
pré-requisito bloqueante.

### 6.2 Teste de equivalência (assimétrico por design)

1. **Antes:** `scripts/snapshot-permissoes.ts` percorre todos os usuários ativos × os 49 pares
   `recurso:acao` do catálogo e grava `can(user.role, r, a)` incluindo o piso de sócio, exatamente como
   `requirePermission` calcula hoje. Sai como fixture JSON no repo, com `userId` hasheado (roda em CI sem banco).
2. **Depois:** recalcula tudo com `permissaoEfetiva()` e compara célula a célula.
3. **Critério:**
   - `false → true` (**ganhou acesso**) = **falha dura**. Exceção só via allowlist versionada e aprovada.
   - `true → false` (perdeu acesso) = **warning** em relatório. Conserta-se com override.
4. O mesmo diff roda em **dois lugares que não passam por `can()`**: (i) o conjunto de itens de menu
   visíveis por usuário (`nav-config`); (ii) as **36 audience queries** — snapshot `{query → [userIds]}`
   antes/depois. Sem (ii), a falha silenciosa da §7-R2 passa batido.

O artefato do passo 3 (diff `true→false` por usuário) **vira o corpo do aviso "o que mudou no seu acesso"** —
só quem tem diff recebe.

### 6.3 Ponto onde a migração NÃO é espelho puro

`CATEGORIA_POR_TIPO` (`financeiro/custo/lancamento-custo.ts:14-19`) manda **`freelancer` para a conta
contábil 2.02 e `projetista_pj` para a 2.01**. Se `freelancer` virar `contratacao = pj` sem mapa explícito,
**a DRE do mês muda** — e o teste de equivalência não pega, porque é dado financeiro, não permissão.
O mapa tem que ser reescrito explicitamente na Onda B.

### 6.4 Jornada — a ordem importa

Dois problemas distintos: **conteúdo** (a grade do estagiário está errada hoje) e **colisão de migração**
(`administrativo`, `clt` e `ti` colapsam em `contratacao = clt` e batem no `@@unique([contratacao, diaSemana])`).

1. **Semear `EscalaRole[estagiario]` com 6h** e **salvar explicitamente** as grades de `administrativo`,
   `clt` e `ti` pela tela existente. Hoje elas "coincidem" só porque a tabela está vazia — materializa o
   implícito antes de mexer.
2. **Materializar `EscalaUsuario` para 100% dos internos ativos** a partir da resolução vigente. Script
   idempotente: grava o valor que já estava sendo calculado, ninguém muda de jornada.
3. **Só então** criar `EscalaContratacao` — sem colisão, porque as três grades já viraram dado por usuário.
4. Dropar `EscalaRole` por último, após o ciclo em sombra.

> **O passo 1 tem que vir antes do 2.** Invertido, o passo 2 congela a jornada de 8h do estagiário dentro
> de `EscalaUsuario` e converte um bug de default em dado explícito e assinado — piora o passivo em vez de
> corrigi-lo.

## 7. Riscos

| # | Risco | Dano | Mitigação |
|---|---|---|---|
| **R1** | **Fail-open na migração** — alguém ganha `financeiro:ver` ou `rh:folha` | Salário de todos exposto internamente. **Irreversível** — a pessoa já viu | Perfis semente byte-a-byte iguais à matriz atual + teste §6.2 com tolerância **zero** para ganho |
| **R2** | **Fail-silent nas 36 audience queries** | Não é ganho de acesso: é *perda de destinatário*. Aprovação que não notifica, alerta de certidão que some, digest vazio. Não gera erro nem log — ninguém percebe por semanas | Diff-test de audiência + assert em runtime que loga WARN quando uma audiência resolve para conjunto vazio |
| **R3** | Drift do `role` legado durante a coexistência | Metade do sistema vê uma coisa, metade outra | Derivação em **um único ponto** (`derivarRoleLegado`), teste de totalidade, job noturno de reconciliação |
| **R4** | Colisão/perda de jornada | Banco de horas e faltas errados **retroativamente** — passivo trabalhista | Sequência §6.4, materialização antes do drop |
| **R5** | Overrides viram lixo | Em 12 meses ninguém sabe por que fulano tem `financeiro:gerir` — o pântano volta, distribuído por usuário | `motivo` obrigatório, `expiraEm`, tela de overrides ativos, aviso antes de expirar |
| **R6** | Os 4 campos que persistem Role **como dado** | Avisos históricos e modelos de documento perdem o alvo **em silêncio** | Migração explícita de dado na última onda |
| **R7** | LGPD — dado sensível sem compartimento | ASO, atestado, geo de batida e humor estão hoje atrás de `HR_ADMIN_ROLES`, ou seja, do setor administrativo inteiro | Recurso separado no catálogo (ver §9.6) |
| **R8** | Branch quente / prazo | `nav-config.ts` e `roles.ts` em conflito permanente numa branch de 6 semanas | Ondas curtas, merge em `dev` ao fim de cada uma. **Nunca** uma branch longa |

## 8. Plano de execução

Big-bang **reprovado**. Coexistência faseada, com `role` como coluna derivada até a última onda.

| # | Onda | Escopo | Dias | Depende de |
|---|---|---|---|---|
| **P1** | **Correção legal** (PR isolado, paralelo) | (a) ramificar encargos por vínculo; (b) `EscalaRole[estagiario]` 6h + mover `migrar-escalas` para dentro do `db:seed`; gate mínimo `INTERNAL_ROLES` em `registrarBatida`/`solicitarFerias` (tira `cliente`); bloquear `aceitarEspelho` para quem não controla jornada; preencher `Recurso.custoHora` de PJ/sócio | **2-3** | RH assina os valores de (a). **Não depende de nada.** Fora da semana de fechamento |
| **0** | **Fase 0** (mínimo do Diretor, emendada) | Enums + **`model Vinculo`** + cache em `User` + `vinculoAtivoId` + backfill + CSV de revisão + exibição read-only + **tela "Meu acesso"**. **Nada de permissão/nav/ponto/folha** | **4-6** | Revisão humana de setor (§9.5) |
| **A** | Motor de permissão | `PerfilAcesso`/`PermissaoPerfil`/`PermissaoUsuario`, `permissaoEfetiva`, `escopo:global` no `getSession`, arnês de equivalência | **4-5** | Fase 0 mergeada |
| **B** | Espelho + separar ponto de apontamento | Perfis semente = as 126 linhas do seed atual; perfil `socio` substituindo o piso implícito; **bug (c) resolvido de verdade** (apontamento de horas do PJ ≠ ponto CLT), preservando o rateio; mapa contábil §6.3; **ciclo em sombra** | **6-8** | Teste §6.2 com **0 ganhos** |
| **C** | UI | CRUD de Perfis (só admin), overrides com `motivo`, wizard por contratação, avisos antes/depois, botão de Suporte | **6-9** | Onda B |
| **D** | `roles.ts` + audiências + nav | Codemod dos 119 `can()`, 36 audience queries uma a uma, nav → `permissao` | **5-8** | Diff-test de audiência |
| **E** | Jornada | `EscalaContratacao` + materialização (§6.4) | **2-3** | Onda D |
| **F** | Poda | Dropar `Permissao`, `User.role`, `enum Role`; migrar os 4 campos Role-como-dado | **2-3** | 1-2 meses de produção estável |

**Total: 31-45 dias de dev.** **P1 + Fase 0 = 6-9 dias e são independentes do roadmap de cliente.**

### 8.1 Decisões de execução

- `can()` **quebra de propósito**: assinatura passa a receber o subject, não o role. O compilador vira a
  ferramenta de migração e mostra os 119 sites. Assinatura retrocompatível deixaria qualquer site esquecido
  resolver silenciosamente pela matriz legada — **fail-open com cara de sucesso**.
- **Setor e Contratação como enums**, não tabelas: 5+5 valores fechados, o código ramifica neles, e enum dá
  exaustividade no TypeScript — que é a ferramenta de fail-closed.
- `PerfilAcesso.chave` é **estável**: nunca renomear depois de publicada.
- **`admin` não vira perfil.** `can()` faz bypass total nele; bypass como linha editável de tabela é uma
  tela de CRUD capaz de conceder acesso irrestrito.
- **Ondas D e E em branches separadas.** Uma mexe em autorização, a outra em jornada; se der problema em
  produção, é preciso saber qual foi.
- **Nunca na semana de fechamento** de folha ou pagamento de PJ. Onda B exige um ciclo de fechamento
  rodando **em sombra** (dois modelos lado a lado).

### 8.2 Concessões registradas

**Dev cedeu:** `Vinculo` versionado como fonte de verdade (propunha tabela satélite); `vinculoId` em
`RateioHora` (dizia para não encostar); bugs de RH viram P1 antes de tudo; piso implícito do sócio vira perfil.
**RH cedeu:** `RateioHora` e motor de folha fora do escopo; `custoHora` vira preenchimento de dado, não código;
gate de `registrarBatida` só depois de desacoplar `Batida`×`SessaoTrabalho`; reforma adiada; checklist
bloqueante, snapshot de `vinculoId` e monitor de pejotização em fase posterior.
**Diretor cedeu:** prioridade — o passivo trabalhista passa na frente do roadmap de cliente; e desistiu de
reabrir a lista de setores.
**Usuária cedeu:** aceita que a proteção do dia da virada seja **garantia técnica**, não aviso —
*"um aviso que pode falhar justo na hora que mais importa não é proteção, é sorte."*

### 8.3 Inegociáveis do conselho

1. **Zero perda de acesso no dia 1**, tecnicamente garantido e testado (§6.2) — não é aviso.
2. **Grade de estagiário 6h semeada ANTES de materializar `EscalaUsuario`** (§6.4).
3. **Estagiário fora de `gerarHoleritesAutomatico`** — é erro de folha rodando hoje.
4. **`EspelhoAceite` bloqueado para quem não controla jornada**, enquanto o gate de ponto não sai.
5. **Contratação nasce com `dataInicio` + `ativo`, nunca campo sobrescrevível** — mesmo na Fase 0.
6. **`Contratacao` não tem valor `socio`** (§9.1).
7. **`freelancer` não migra para a conta contábil 2.01** sem mapa explícito (§6.3).
8. **Tela "Meu acesso" na Fase 0** — é leitura de dado que já existe, não mexe em permissão.
9. **Sócio que projeta continua aparecendo na matriz de Recursos** sem depender de bater ponto.

## 9. Decisões do dono (2026-07-27)

**9.1 — Sócio: DECIDIDO — `Socio` é eixo próprio.** `Contratacao` **não tem valor `socio`**.
`Socio.ativo` diz **se** é sócio; a contratação diz **como trabalha, se trabalhar**:

| Caso | Modelagem |
|---|---|
| Capitalista puro (só aporta) | `Socio` ativo, **zero `Vinculo`**, sem login de colaborador. Só `RetiradaSocio` |
| Administrador com pró-labore | `Socio` + `Vinculo` `contratacao = pro_labore` (sem jornada, sem folha CLT, sem férias, **entra no rateio**) |
| Sócio que projeta o dia todo | idem, mas **Setor = Engenharia** — não some da matriz de Recursos, porque o que o faz sócio é o `Socio`, não o setor |
| Sócio que fatura pela própria PJ | `Socio` + `Vinculo` `contratacao = pj` + `pjId`. Duas remunerações de natureza distinta, **um** usuário |

Uma fonte de verdade, sem cadastro duplicado, Pessoa 360 preservado.

**9.2 — Freelancer: DECIDIDO — os dois casos existem.** O enum precisa de **`pj`** e **`autonomo_rpa`**,
e o backfill exige **revisão pessoa a pessoa** de quem é qual (some do CSV de revisão junto com o setor).
`autonomo_rpa` traz cálculo novo que hoje não existe em lugar nenhum: retenção de INSS 11% + IRRF + ISS e
patronal de 20% — **entra na Onda B, não na Fase 0**. Até lá o backfill mantém `freelancer` na conta
contábil **2.02** (§6.3), sem exceção.

**9.3 — Diretoria: DECIDIDO** — cai como regra de setor; vira Perfil de acesso atribuído pessoa a pessoa (§2.1).

**9.4 — Setores: DECIDIDO** — a lista de 5 fica; Comercial e Financeiro dentro de Administrativo, com a
segregação de informação feita por Perfil de acesso (§2.2).

**9.5 — Dado sensível de RH: DECIDIDO — cadeado separado por tipo.** Recurso `rh_sensivel` próprio no
catálogo, **nunca** embutido em `rh:ver`, com a escala proposta pela Usuária — na qual o **coordenador
direto tem *menos* acesso, não mais**:

| Dado | Quem vê |
|---|---|
| Salário | a própria pessoa, RH, quem assina a folha |
| Atestado / ASO | RH vê o laudo; coordenador vê só "ausente até tal data" |
| Geolocalização da batida | só RH |
| Registro de humor | **só agregado/anônimo** — *"no dia que virar dado nominal pro meu chefe, paro de preencher sincero e o campo vira lixo"* |

**9.6 — P1: AUTORIZADO e implementado** (ver §10).

### 9.7 — Ainda em aberto

- **Setor dos vínculos operacionais: RESOLVIDO** — default `engenharia` para CLT, estágio, PJ e freelancer
  (§6.1, nota 2). **Não bloqueia mais a Fase 0.**
- **Destino do perfil `supervisor`: RESOLVIDO** — vira "Coordenador", Engenharia, CLT (§6.1, nota 3).
  Rótulo já trocado. **Resta confirmar** se o Coordenador mantém o escopo global de hoje.
- **Quais freelancers são `pj` (CNPJ, emite NF) e quais são `autonomo_rpa`** (§9.2). O backfill migra todos
  como `pj` provisoriamente, mantendo a conta contábil 2.02 (§6.3); a reclassificação é pessoa a pessoa.
- **Revisão pós-virada do setor** — quem não é de Engenharia se corrige na tela de cadastro. Como setor não
  autoriza nada, é conferência, não risco.
- **Valores adiados**, com o enum nascendo extensível: Aprendiz (cota legal obrigatória se 7+ CLTs),
  contrato de experiência (é *fase* do CLT — precisa `dataFim` + alerta), prazo determinado/obra certa,
  terceirizado, diretor estatutário não-sócio, e estágio obrigatório × não obrigatório (no não obrigatório,
  bolsa e auxílio-transporte são compulsórios).

---

## 10. P1 — implementado em 2026-07-27

Lint limpo, 1231 testes passando, build OK. **Todas as mudanças são restritivas (fail-closed).**
Nenhuma migration: só dado semeado e gates.

| Bug | Correção | Arquivos |
|---|---|---|
| **(a)** INSS de estagiário | `gerarHoleritesAutomatico` passa a filtrar `role: "clt"`. Estagiário sai da geração automática; RH lança a bolsa à mão em `salvarHolerite` até o recibo de bolsa-auxílio existir | `modules/rh/folha/actions.ts` |
| **(b)** Estágio com 8h | Semeadura de `EscalaRole` extraída para `prisma/escalas-padrao.ts` e ligada ao `db:seed` (passo 11). Estagiário 08:00–14:00, **6h/dia, sem intervalo**; linhas existentes acima de 6h são **corrigidas** (a idempotência não pula a correção). `clt`/`administrativo`/`ti` materializados a 8h **só se ausentes** — preserva grade ajustada na tela e é o passo 1 da sequência §6.4 | `prisma/escalas-padrao.ts` (novo), `prisma/seed.ts`, `scripts/migrar-escalas.ts` |
| **(c)** Ponto/férias sem gate | `base` de `ponto/actions.ts` e `rh/actions.ts` ganha `roles: INTERNAL_ROLES` — tira `cliente` dos endpoints. `aceitarEspelhoMes` e `solicitarFerias` restritos a `CLT_ROLES`. UI acompanha o servidor: botão "Assinar espelho" só com `controlaJornada`, `FeriasCard` só para quem pode solicitar (sem "Sem permissão" na cara do usuário) | `modules/ponto/actions.ts`, `modules/rh/actions.ts`, `components/ponto/espelho-view.tsx`, `components/rh/rh-view.tsx`, `app/(dashboard)/rh/page.tsx` |
| **(d)** Sem rescisão | **Não corrigido de propósito** — resolve-se nativamente com `Vinculo.dataFim` (§5). Um `dataDemissao` no `User` seria jogado fora na Fase 0 | — |

**`registrarBatida` segue liberado aos internos, deliberadamente:** `Batida` e `SessaoTrabalho` são gravadas
1:1 e o apontamento do PJ alimenta o rateio — cortar a batida hoje cegaria a margem de projeto no mês
seguinte. A separação ponto (CLT) × apontamento de horas (todos) é a Onda B.

### 10.1 Pendências operacionais do P1 (não são código)

1. **Rodar `npm run db:seed` em produção** — é o que efetivamente corrige a grade do estagiário. Sem isso,
   a mudança (b) não tem efeito.
2. **Conferir a grade de estágio semeada** (08:00–14:00, 6h, sem intervalo) na tela `/rh/escalas` — o
   horário concreto é decisão do escritório; só o teto de 6h é legal.
3. **Preencher `Recurso.custoHora` de PJs e sócios** — enquanto estiver nulo, `custoHoraPorUsuario` cai no
   fallback `salarioBase ÷ escala`, que materializa "salário" e "jornada" para quem não deveria ter nenhum
   dos dois. É preenchimento de dado, não código.
4. **Espelhos já assinados por PJ/freelancer continuam no banco** — o gate impede novos, não apaga os
   existentes. Decidir com orientação jurídica o que fazer com o histórico.
