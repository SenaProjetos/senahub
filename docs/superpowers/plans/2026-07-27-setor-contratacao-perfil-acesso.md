# Setor × Contratação × Perfil de Acesso — separar vínculo, função e permissão

**Data:** 2026-07-27 · **Status:** P1, Fase 0, Onda A, Onda B e **Onda C implementados** (código);
resta o ciclo em sombra (calendário) + Ondas D/E/F · **Branch:** `dev`

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

---

## 11. Fase 0 — implementada em 2026-07-28

Migration puramente aditiva (`prisma/migrations/20260728023431_add_vinculo_setor_contratacao`) aplicada
no dev sem reset, seguindo o caminho de drift da skill `nova-migracao` (`db push` + `migrate diff --script`
+ `migrate resolve --applied`). Lint limpo, **134 arquivos / 1245 testes** (1231 + 14 novos), build OK.

**Schema** (`prisma/schema.prisma`): enums `Setor`, `Contratacao` (sem `socio` — §9.1), `TipoUsuario`;
model `Vinculo`; em `User`: `tipo`/`setor`/`contratacao` (cache denormalizado, todos nullable) e
`vinculoAtivoId` (`@unique`, ponteiro para o vínculo corrente). `tipo` ficou **sem default** de propósito:
um default `externo` marcaria o escritório inteiro como externo se um deploy aplicasse a migration e
esquecesse o backfill — `NULL` é a leitura honesta de "ainda não migrado".

**Domínio** (`src/modules/usuarios/vinculo/`):
- `mapa.ts` — `derivarEixos(role)`, puro e total sobre `Role` (mesma família de `lib/encargos.ts`,
  `projetos/health.ts`), com o mapa de §6.1 já com o default Engenharia e o destino do Coordenador.
  `aplicarSocio(eixos, socioAtivo)` implementa §9.1: sócio ativo com vínculo vira `pro_labore`; sócio sem
  vínculo (ex.: admin) não inventa contratação. 14 testes (`mapa.test.ts`) — exaustividade sobre `ROLES`,
  interno×externo, quem cria vínculo tem os dois eixos preenchidos ou nenhum, nenhuma contratação derivada
  cai em `pro_labore` a não ser via sócio.
- `service.ts` — `aplicarVinculo()` é o ÚNICO ponto que escreve `setor`/`contratacao`/`vinculoAtivoId` em
  `User`; encerra o vínculo anterior (nunca apaga) e abre o novo. `inconsistenciasDeCache()` — diff entre
  o vínculo ativo e o cache, para o teste de equivalência (§6.2) e reconciliação futura.
- `labels.ts` — rótulos pt-BR, **client-safe** (sem `server-only`/Prisma-client), mesmo padrão de
  `documentos/fontes-meta.ts`. `queries.ts` — `meuAcesso(userId)`, leitura pura para a tela "Meu acesso".

**Backfill** (`scripts/backfill-vinculos.ts`): idempotente (2ª execução: 0 criados), roda em transação por
usuário, checa `inconsistenciasDeCache` ao final, gera CSV em `logs/` com `revisar` por linha. Rodado no
dev: 7 vínculos criados, 3 tipos ajustados (clientes), 0 inconsistências. Confirmou a interação com §9.1
na prática — a usuária de demo que era `supervisor` **e** sócia ativa migrou para `pro_labore`, não `clt`.
`dataInicio` vem de `dataAdmissao` quando existe, senão `createdAt` — nunca "hoje", para não apagar tempo
de casa de quem já está no sistema.

**UI:**
- `components/usuarios/meu-acesso.tsx` + `MinhaFichaPage` — tela "Meu acesso" pedida pela usuária final:
  Setor, Contratação, Cargo, Perfil, e a lista de permissões em português (reaproveita os rótulos de
  `permissions-catalog.ts`), nunca `recurso:acao`. Não edita nada — RH continua sendo quem altera.
- `Pessoa360View` (aba Acesso) e `fichaPessoa` (query do RH) ganharam Setor/Contratação como campos
  read-only, ao lado do Perfil — cache do vínculo ativo, `—` quando ainda não migrado.

**O que a Fase 0 deliberadamente NÃO faz:** não toca em `role`, `Permissao`, `nav-config`, ponto ou folha.
Autorização continua 100% em `role`. `Vinculo.cargaSemanal`/`remuneracao` nascem preenchidos só onde já
havia dado (`salarioBase`); PJ e pró-labore ficam nulos até alguém informar.

### 11.1 Pendências operacionais da Fase 0

1. **Rodar `npx tsx --tsconfig tsconfig.server.json scripts/backfill-vinculos.ts` em produção** — sem
   isso `tipo`/`setor`/`contratacao` ficam `NULL` e a tela "Meu acesso" mostra "Não definido".
2. **Conferir o CSV gerado** (`logs/backfill-vinculos-*.csv`) — toda linha com `setor_sem_origem` é o
   default Engenharia, não um levantamento; toda linha com `pj_ou_autonomo_rpa` é freelancer aguardando
   reclassificação (§9.2).
3. **`admin` ficou sem vínculo de propósito** (`sem_vinculo_definir_a_mao`) — quem tem esse perfil não
   ganhou setor/contratação automaticamente; é decisão manual, porque o papel diz o que a pessoa pode no
   sistema, não como ela é contratada.

---

## 12. Onda A — implementada em 2026-07-28

Schema (3 modelos novos) + motor de permissão + `escopo:global` no `getSession` + arnês de equivalência.
Lint limpo, **139 arquivos / 1289 testes** (1245 + 44 novos — 20 são meus, o resto é do módulo de Custos
que evoluiu em paralelo), build limpo (após `rm -rf .next` — cache stale do build anterior, não bug).
**Zero mudança de comportamento**: `role` + `Permissao` continuam sendo a autorização real; nada em
`with-action.ts`/`can()` foi tocado.

### 12.1 Colisão com trabalho concorrente (Engenharia de Custos) — resolvida sem perda

No meio da Onda A, `prisma migrate diff` passou a propor **`DROP TABLE custo_orcamento`** — a outra sessão
havia aplicado a própria migration (`20260728120000_custos_fundacao`) ao **mesmo banco de dev** enquanto eu
trabalhava. Eu tinha isolado meu schema com `git stash` momentos antes (para gerar um diff limpo, só meu),
e o `stash pop` não voltava por divergência de texto. Resolvido por reconstrução dirigida: extraí do stash
só o bloco de conteúdo novo de Custos (4 enums + 3 models + os campos inversos que eles adicionaram em
`User`, `Cliente`, `Projeto`, `Licitacao` — achados varrendo o diff completo, não só a cauda do arquivo) e
reincorporei por cima da minha versão. Verificação de que nada se perdeu: **não** comparação textual
(ruidosa por realinhamento de `prisma format`), e sim `prisma migrate diff --exit-code` entre o schema em
disco e o banco vivo → **"No difference detected", exit 0** — prova estrutural de que schema e banco
(Custos deles + meu Onda A) batem exatamente. Migration da Onda A gerada e aplicada depois disso, contendo
**só** as minhas 3 tabelas (conferido: nenhum `DROP`/`ALTER` em tabela de Custos no diff final).
Consequência prática: **não toquei** `prisma/seed.ts` nem `src/lib/permissions-catalog.ts` nesta onda — os
dois têm trabalho de Custos misturado, não commitado por mim.

### 12.2 Schema

`PerfilAcesso` (`chave` única e estável, `nome` pt-BR editável, `sistema`/`ativo`), `PermissaoPerfil`
(`@@unique([perfilId, recurso, acao])`, espelha `Permissao` mas por perfil), `PermissaoUsuario` (override
com `motivo` **obrigatório**, `expiraEm` opcional — §8.3 item 5 do conselho). Em `User`: `perfilId`
(nullable), `superUsuario` (default `false`, bypass **fora** da matriz — não vira linha de
`PermissaoPerfil`, mesmo raciocínio de `admin` em `can()`). `model Permissao` ganhou comentário de
depreciação (congelada como leitura legada, dropada só na Onda F) — não foi migrada in-place.

### 12.3 Motor (`src/lib/permissao-efetiva.ts`)

Isolado de propósito de `lib/permissions.ts` — `can()` não foi tocado. Resolução: `!ativo` → nega;
`superUsuario` → concede; override não expirado → vale (inclusive para negar); perfil → default negado.
Cache por `perfilId` (LRU, max 64, mesmo TTL de 10 min do cache existente); **override nunca cacheado**
(§5.2 — é onde mora bug de invalidação). 13 testes (mock do Prisma, mesmo padrão de `permissions.test.ts`
já existente no projeto), cobrindo os casos que mais importam: override revogando o que o perfil concede,
override expirado caindo de volta no perfil, isolamento de cache entre perfis distintos.

### 12.4 `escopo:global` no `getSession` (`src/lib/session.ts`)

`SessionUser` ganhou `perfilId` e `escopoGlobalPerfil` — **inertes nesta onda** (todo `perfilId` é `null`,
então `escopoGlobalPerfil` resolve `false` para todo mundo). `acessoGlobal()` (33 usos) **não foi tocado** —
continua 100% sobre `role`/`ehSocio`. O lookup de `socio` existente virou um `prisma.user.findUnique` único
que também traz `perfilId`/`superUsuario` (mesma contagem de round-trip de antes, não piorou o hot path);
o cálculo de `escopoGlobalPerfil` via `permissaoEfetiva` soma uma consulta indexada por sessão — aceito
pelo mesmo padrão de custo que o lookup de `ehSocio` já tinha.

### 12.5 Arnês de equivalência

`src/lib/equivalencia-permissoes.ts` — comparador puro, assimétrico (`compararPermissoes`), 7 testes
incluindo o caso que garante fail-closed (detecta um ganho sintético). `scripts/snapshot-permissoes.ts`
calcula a matriz "antes" (`can(role,...)` + piso de sócio, réplica exata da fórmula de `requirePermission`).
`scripts/checar-equivalencia-permissoes.ts` orquestra antes×depois e é, sem alteração nenhuma, o gate que a
Onda B vai rodar para liberar o corte.

**Decisão consciente: nenhum fixture foi congelado no repo.** O catálogo de recurso:ação está mudando
ativamente (Custos acabou de somar `custos:ver/gerir/bancos/cotacao`) — uma foto tirada hoje ficaria
obsoleta antes da Onda B sequer começar. As duas ferramentas escrevem em `logs/` (gitignored, mesmo padrão
do CSV do backfill) e rodam sob demanda. Executado de ponta a ponta contra o banco de dev real: **8
usuários internos ativos × 52 pares = 416 células, 183 perdas (esperado — ninguém tem perfil ainda), zero
ganhos, exit 0.** Esse resultado trivial-mas-correto é o comportamento certo desta onda: é a Onda B que faz
o número de perdas cair a zero, perfil por perfil, até fechar em zero perdas e zero ganhos.

### 12.6 O que a Onda A deliberadamente NÃO faz

Não semeia nenhum `PerfilAcesso` real (Onda B: "perfis semente = as 126 linhas do seed atual"). Não muda
nenhum call-site de `can()`/`requirePermission` (Onda D). Não constrói UI de CRUD de perfis nem overrides
(Onda C). Não resolve a pergunta em aberto de §9.7 sobre o Coordenador manter escopo global — essa decisão
só faz efeito quando algo passar a LER `escopoGlobalPerfil` em vez de `acessoGlobal()`.

---

## 13. Onda B (parcial) — implementada em 2026-07-28

Escopo entregue: **perfis semente + backfill + piso de sócio via override**. **NÃO** entregue nesta
passada: separação ponto×apontamento (bug (c) "resolvido de verdade"), mapa contábil §6.3, ciclo em
sombra — ver §13.5. Checkpoint deliberado: a separação ponto×apontamento é mudança de comportamento real
num módulo de dinheiro/jornada, e merece sua própria passada de atenção, não ser encaixada de carona aqui.

Lint limpo, **140 arquivos / 1292 testes**, build limpo (após `rm -rf .next`).

### 13.1 Perfis semente lêem `Permissao` ao vivo, não `PERMISSOES_BASE`

`prisma/seed-perfis-acesso.ts` espelha a tabela `Permissao` (legado, já semeada) em
`PerfilAcesso`/`PermissaoPerfil` — não importa a constante `PERMISSOES_BASE` de `prisma/seed.ts`. Motivo:
o espelho fica automaticamente correto mesmo que outro módulo adicione linhas depois (aconteceu de fato:
Custos somou `custos:ver/gerir/bancos/cotacao` entre uma leitura e outra desta sessão). Mapa de chaves em
`src/modules/usuarios/vinculo/perfil-semente.ts` (client-safe, testado): **um perfil por ROLE ATUAL, não
por função** — `clt` e `projetista_pj` fazem hoje a mesma função mas têm matrizes DIFERENTES (só `clt` tem
`arquivos:ver_todas_disciplinas`), então consolidar os dois num perfil "Projetista" agora quebraria o
espelho fiel. Essa consolidação é o objetivo de fundo da reforma inteira, mas é decisão CONSCIENTE de
reconciliar as diferenças — deferida, não automatizada aqui. `admin` não vira perfil (idem Onda A).
`GLOBAL_ROLES` (`supervisor`) ganha a permissão sintética `escopo:global` no perfil — inerte até a Onda D.

### 13.2 Achado real durante a implementação: 23 permissões órfãs do Coordenador

Ao rodar o seed pela primeira vez, o perfil `coordenador` saiu com **46 linhas** em vez das 23 esperadas
(22 do seed atual + `escopo:global`). Investigado: a correção anterior desta reforma (commit `a55e9e9`,
"alinha a matriz semente do coordenador com a matriz real") só editou o **array fonte** — `upsert` nunca
revoga, então as 23 linhas antigas (`financeiro:ver/gerir`, `usuarios:gerir`, `rh:cadastro/folha`,
`patrimonio:ti`, `juridico:gerir`, administração de ponto etc.) continuavam no banco com `permitido: true`.
**Na prática, `can("supervisor", "financeiro", "ver")` e companhia estavam retornando `true` no banco de
dev desde aquele commit**, apesar do commit dizer "matriz fechada". Corrigido em `prisma/seed.ts`: a etapa
de permissões base agora poda (`deleteMany`) qualquer linha de `Permissao` cujo (role,recurso,acao) não
esteja mais em `PERMISSOES_BASE`, para os roles presentes na lista — idempotente, sem afetar roles sem
entrada nenhuma. Rodado: 23 órfãs removidas na primeira execução, 0 na segunda. **Nota de processo:** esse
bug NÃO teria travado o gate de equivalência (§6.2) — ele se manifesta como `perda` (`true→false` ao
comparar contra a matriz nova, correta), que é warning, não falha. Só foi achado por estranhar a contagem
de linhas do perfil, não pelo script automatizado. Fica registrado como lição: número de linhas inesperado
merece investigação mesmo com gate verde.

### 13.3 Piso de sócio: override granular, não um perfil `socio`

Decisão que diverge do texto original do plano (§5.1 dizia "perfil `socio`... substituindo o piso"): hoje
`ehSocio` faz `requireRole`/`requirePermission` tratar QUALQUER usuário como coordenador em QUALQUER
checagem — não é um perfil à parte, é um "OU" aplicado toda vez. Reproduzir isso como perfil fixo exigiria
combinar coordenador com o role base de cada sócio (explosão combinatória) ou substituir o perfil do
usuário (perdendo "sou administrativo E sócio" na ficha). Em vez disso, `scripts/backfill-perfis-acesso.ts`
mantém o `perfilId` do sócio no seu PRÓPRIO role, e materializa a DIFERENÇA entre a matriz do coordenador e
a matriz própria como `PermissaoUsuario` (uma linha por permissão faltante, `motivo` explicando a origem,
sem `expiraEm` — indefinido até alguém revogar pela tela). Testado no dev real: os dois únicos sócios do
dataset (`admin`, que já tem bypass total via `superUsuario`, e a `supervisor`/coordenadora, cuja própria
matriz já é a do coordenador) corretamente geraram **zero** overrides — delta vazio nos dois casos, não bug.

### 13.4 Verificação: espelho perfeito

Rodado contra o dev real, nesta ordem: `db:seed` (perfis + poda) → `backfill-perfis-acesso.ts` (perfilId +
superUsuario + overrides) → `checar-equivalencia-permissoes.ts`. Resultado: **8 usuários × 52 pares = 416
células, 0 ganhos, 0 PERDAS** — diferente do resultado trivial da Onda A (0 ganhos, 183 perdas esperadas
porque ninguém tinha perfil). Agora é espelho byte-a-byte: `permissaoEfetiva()` concorda com `can()` em
100% das células, para todo usuário ativo. Reexecutar `backfill-perfis-acesso.ts` confirma idempotência
(0 mudanças na 2ª vez). `can()`/`with-action.ts` continuam intocados — zero mudança de comportamento real,
isto é só o dado pronto para a Onda D.

### 13.5 Separação ponto × apontamento — implementada em 2026-07-28

Fechada na mesma sessão. `aplicarBatida()` continua sendo o único ponto de escrita de `SessaoTrabalho`
para quem controla jornada — **intocado**. Para `PJ_ROLES` (`projetista_pj`, `freelancer`), um caminho
novo e paralelo:

- **`src/modules/ponto/apontamento.ts`** — `abrirApontamento`/`trocarApontamento`/`fecharApontamento`/
  `apontamentoAtual`, direto em `SessaoTrabalho`. Sem `Batida`, sem geolocalização, sem máquina de estados,
  sem vocabulário entrada/descanso/saída — só "comecei no projeto X" / "parei". `rateio/queries.ts` já soma
  `SessaoTrabalho` de forma genérica (confirmado: zero referência a `Batida` no arquivo inteiro), e
  `espelhoMes` (`ponto/queries.ts`) já cai para somar `SessaoTrabalho` direto nos dias sem `Batida` —
  **nenhuma das duas queries precisou mudar** para o apontamento aparecer certo no rateio e no histórico.
- **`src/modules/ponto/apontamento-actions.ts`** — 3 Server Actions, `roles: PJ_ROLES`.
- **`src/components/ponto/apontamento-view.tsx`** — UI deliberadamente mais simples que `RegistroPonto`:
  sem cronômetro de jornada, sem fila offline, sem geo. Seletor de projeto + Iniciar/Trocar/Encerrar.
- **`components/ponto/ponto-view.tsx` + `app/(dashboard)/ponto/page.tsx`** — branch por
  `PJ_ROLES.includes(user.role)`: PJ vê `ApontamentoHoras`, todo o resto vê `RegistroPonto` inalterado.

Verificado ponta a ponta contra o dev real (abrir → trocar de projeto → fechar → `espelhoMes` capturando
as sessões do dia) — sem teste unitário, seguindo a convenção do módulo (`service.ts`/`queries.ts` não têm
teste direto no projeto; só `engine.ts`/`format.ts`, puros, têm). 141 arquivos / 1300 testes, lint e build
limpos.

**Corte de comportamento deliberadamente NÃO feito:** `registrarBatida` continua aberto a `INTERNAL_ROLES`
— PJ/freelancer ainda PODEM chamá-lo diretamente (só não veem mais o botão, porque a tela mostra
`ApontamentoHoras` agora). Restringir `registrarBatida` para excluir PJ de vez é o corte real, condicionado
ao ciclo em sombra abaixo — só a UI mudou, o servidor ainda aceita os dois caminhos.

**Mapa contábil §6.3 — verificado, sem ação necessária agora.** `CATEGORIA_POR_TIPO`
(`financeiro/custo/lancamento-custo.ts`) é indexado por `tipoProfissional`, que `uploads/pagamento.ts`
ainda preenche direto de `r.user.role` — sem nenhuma camada de `Contratacao` no meio. O risco do plano
(freelancer perder a conta 2.02 e cair em 2.01) só existe quando algo passar a derivar a categorização de
`Contratacao` em vez de `role` — o que nenhuma onda fez até aqui. Fica como aviso para quando essa
migração acontecer de fato (Onda D em diante), não como pendência de código hoje.

### 13.6 Ciclo em sombra — a parte de código, feita; a parte de confiança, não dá pra simular

Pergunta do dono: dá pra simular o fechamento em vez de esperar? Resposta: **parte sim, parte não**, e as
duas foram tratadas separadamente.

**O que É simulável e está feito** (`scripts/simular-fechamento-sombra.ts`): prova, com volume e casos de
borda — não teste de fumaça —, que `calcularRateioDetalhado()` (a função que gera `RateioHora` no
fechamento real) trata sessões vindas de `aplicarBatida` (ponto, CLT) e escritas diretas em
`SessaoTrabalho` (o que `apontamento.ts` faz) de forma IDÊNTICA. Cria 2 usuários efêmeros, gera um mês
inteiro sintético (isolado em 2031-03, longe de qualquer dado real) pelos dois caminhos com troca de
projeto no meio do dia, calcula à mão o minuto esperado de cada combinação usuário×projeto, roda o motor
de rateio de verdade e compara byte a byte — mais uma prova separada com `abrirApontamento`/
`fecharApontamento` reais (hoje de verdade, porque "sessão aberta" só faz sentido contra o relógio real,
não dá pra simular num mês futuro). Deleta todo o dado sintético ao final — nada fica no banco.

Achado no caminho: a **primeira versão da simulação acusou 1 divergência** — não no motor de rateio, no
meu próprio cálculo manual do "esperado" (esqueci de somar a segunda sessão do dia no projeto A ao trocar
de projeto). Corrigido e re-executado: **7/7 conferências passam**, banco confirmado limpo depois, script
roda de novo sem sujeira acumulada (idempotente). Vale registrar: se eu tivesse aceitado o primeiro
resultado sem investigar QUEM estava errado (motor ou teste), teria escrito no plano uma "divergência
real" que não existia — mesma lição do achado das permissões órfãs em §13.2, checar antes de concluir.

**O que NÃO é simulável:** PJ/freelancer efetivamente usando o botão "Iniciar apontamento" certo no dia a
dia (esquecer de encerrar, sessão que fica aberta a noite toda, etc.) e a Diretoria/RH revisando um
fechamento REAL antes de confiar nele para pagar gente de verdade. Isso é adoção operacional e confiança
organizacional, não correção de cálculo — nenhum script substitui. **Continua dependendo de um mês de
operação real** antes da Onda D restringir `registrarBatida` de vez e cortar `can()` para
`permissaoEfetiva()`.

---

## 14. Onda C — implementada em 2026-07-28 (Sonnet)

Escopo entregue: CRUD de Perfis, atribuição de perfil ao usuário, overrides com motivo, wizard cria
`Vinculo` de verdade, botão de Suporte pré-preenchido. **Deliberadamente NÃO construído:** o mecanismo de
aviso "o que mudou no seu acesso" — ver §14.6. Lint limpo, 145 arquivos / 1336 testes, `tsc --noEmit`
limpo. `npm run build` **não rodou** nesta onda: porta 3000 ocupada (dev ativo) — CLAUDE.md proíbe rodar
build com dev no ar (corrompe `.next`). Verificado por smoke test direto no banco de dev em vez disso.

### 14.1 CRUD de Perfis (`/configuracoes/perfis`, admin-only)

`modules/perfis/`: schemas, queries (`listarPerfis`, `perfilComMatriz`, `perfisAtivosParaSelect`), actions
(`criarPerfil` gera `chave` por slug com desambiguação por sufixo numérico; `editarPerfil` nunca toca a
`chave`; `alternarPerfilAtivo`; `excluirPerfil` bloqueia perfis `sistema` ou com usuários atribuídos;
`setPermissaoPerfil` invalida o cache). Todas com `roles: ["admin"]` explícito — não `recurso`/`permissao`
— mesmo raciocínio de `setPermissao` recusar editar o perfil `admin`. Tela de matriz
(`/configuracoes/perfis/[id]`) espelha `matriz-permissoes.tsx`, mas por perfil em vez de por role. Aviso
(não bloqueio) acima de 10 perfis ativos — "perfil zoo" era preocupação explícita da usuária no conselho.

### 14.2 Atribuição de perfil (`/configuracoes/usuarios`)

`perfilId`/`superUsuario` adicionados a `criarUsuarioSchema`/`editarUsuarioSchema`. `superUsuario` só
admin altera — mesmo padrão de guarda que já existia para `ehSocio` (valida ANTES de gravar qualquer
coisa). Select de Perfil de acesso ao lado do select de Perfil (role) existente, com aviso de que ainda
não muda acesso real.

### 14.3 Overrides (`PermissaoUsuario`), na aba Acesso da ficha (Pessoa 360)

Achado no caminho: o campo `concedidoPorId` (Onda A) era um escalar puro, **sem relação** — não dava pra
mostrar quem concedeu. Corrigido com migration aditiva nomeando as duas relações `PermissaoUsuario`→`User`
(`PermissaoUsuarioAlvo` e `PermissaoUsuarioConcedidoPor` — Prisma exige nomear as duas quando há mais de
uma relação entre os mesmos dois models, não só a nova). `modules/perfis/overrides-actions.ts`:
`criarOverride`/`revogarOverride`, gate `HR_ADMIN_ROLES` (mesmo piso de quem já edita usuário). UI mostra
override ativo com motivo, quem concedeu, quando expira; formulário de criação com `motivo` obrigatório
validado nos dois lados (schema + UI).

### 14.4 Wizard cria `Vinculo` de verdade — corrige um buraco real

Verificado: `cadastrarFuncionario` (o wizard de RH) nunca chamava `aplicarVinculo` — ninguém contratado
pelo wizard **desde a Fase 0** ganhou `Vinculo`/`Setor`/`Contratação`; só o backfill retroativo (rodado
uma vez) cobria quem já existia antes. Corrigido: o wizard ganha um select de Setor (default "Engenharia",
igual ao backfill, mas agora RH pode escolher de verdade — diferente do backfill histórico, aqui tem quem
sabe a resposta no momento da contratação). Contratação segue derivada do role via `derivarEixos` (mesmo
mapa da Fase 0). `admin` fica sem vínculo, mesmo raciocínio do backfill. Smoke test confirmou: setor
explícito escolhido vence o default.

### 14.5 Botão de Suporte pré-preenchido

Em "Meu acesso". Categoria `acesso` já existia no schema do ticket (só não estava na lista local do
dialog) — sem trabalho de backend. Link com query string (`/suporte?nova=1&categoria=acesso&titulo=...`),
lido via `useSearchParams` num `useEffect` que abre o dialog já preenchido.

### 14.6 Mecanismo de aviso "o que mudou no seu acesso": deliberadamente NÃO construído

O único gatilho real (§6.2: "o diff `true→false` por usuário vira o corpo do aviso") só existe quando a
Onda D rodar o corte de verdade — construir a função de composição agora, sem nenhum call site, seria
abstração para uma necessidade hipotética. Decisão consciente de não fazer, não pendência esquecida — o
lugar certo é dentro do próprio script de cutover da Onda D, não um módulo separado à espera de uso.

### 14.8 Onda E, passo 2 (§6.4) — materializar `EscalaUsuario` — implementado em 2026-07-28

Adiantado enquanto a Onda D fica travada por dois gates fora do meu controle (ciclo em sombra,
calendário; e a decisão pendente do Coordenador em §9.7). Este passo é seguro fazer isolado — não
depende de nenhum dos dois, é puramente aditivo.

Verificado antes de escrever: nenhum consumidor real (`resolverEscala` em `ponto/service.ts`,
`horasDiaPadraoEmLote` em `rh/escalas/queries.ts` — o do rateio, dinheiro de verdade) confia no
fallback interno de `escalaUsuarioGrade` (que cairia em 8h fixo) — todos cruzam corretamente com
`escalaRoleGrade(role)` quando o usuário não tem override. Não havia bug vivo aqui, diferente do
achado das permissões órfãs — só faltava dar o passo de materialização em si.

`scripts/materializar-escala-usuario.ts`: para cada interno ativo sem NENHUMA linha em
`EscalaUsuario` (idempotente — pula até override parcial/inativo, nunca sobrescreve edição
manual), grava a grade vigente (`escalaRoleGrade(role)`) como override próprio. Roda com snapshot
`horasDiaPadraoEmLote` antes/depois e falha se qualquer usuário mudar de horas — mesmo espírito do
arnês de equivalência de permissões, agora para jornada.

Rodado no dev real: 8 internos ativos, 6 já tinham escala própria do dataset demo (Diego/estagiário
6h, Elis/freelancer 4h — preservadas intactas), 2 materializados (14 linhas), **zero mudança de
jornada**. Reexecução confirma idempotência (0/8 na segunda vez). Isso destrava criar
`EscalaContratacao` sem a colisão de `administrativo`/`clt`/`ti` colapsando no mesmo slot — mas a
criação do enum em si ainda é passo 3 de §6.4, não feito agora (a materialização era o
pré-requisito; o resto de Onda E segue depois de Onda D, como o plano sempre previu).

### 14.7 O que fica para a Onda D

Codemod dos 119 `can()`, as 36 audience queries, `nav-config` → permissão, religar `acessoGlobal()` em
cima de `escopoGlobalPerfil` (pendente a decisão de §9.7 sobre o Coordenador manter escopo global), e só
então restringir `registrarBatida` a `CLT_ROLES` de vez. Gate: ciclo em sombra (§13.6) + equivalência
com 0 ganhos rodada contra produção, não só dev.
