# Ampliação do escopo de permissões configuráveis

**Data:** 2026-09-02 · **Status:** F0-F5 executadas (todas as ondas) · **Pedido:** "deixar o mais
personalizável possível — ex.: freelancer no chat só nos grupos de projeto, sem #geral e sem DM"

Levantamento de onde o acesso ainda é decidido por regra fixa em código e o que dá para mover
para o catálogo (`src/lib/permissions-catalog.ts`), que é o lever único: as duas telas de matriz
(`/configuracoes/permissoes` e `/configuracoes/perfis/[id]`) se desenham a partir dele, então
todo par novo vira configurável na UI de graça.

---

## 0. O enquadramento antes de tudo: o motor que você quer já existe

Três camadas, todas em produção:

| Camada | Tabela | Tela | Alcance |
|---|---|---|---|
| Perfil de acesso | `PerfilAcesso` + `PermissaoPerfil` | `/configuracoes/perfis` | **É o que `can()` lê hoje** |
| Override individual | `PermissaoUsuario` (com `expiraEm` + `motivo`) | ficha do usuário | vence o perfil, inclusive para negar |
| Matriz por papel (legado) | `Permissao` | `/configuracoes/permissoes` | só `canRole` (piso de sócio) + espelho do seed |

Consequências que valem antes de qualquer decisão:

1. **`can()` não lê mais a tabela `Permissao`.** `src/lib/permissions.ts:78` delega para
   `permissaoEfetiva` (perfil + override). `setPermissao` (`src/modules/permissoes/actions.ts:29`)
   grava só em `Permissao` e invalida só o cache legado. A frase "Alterações valem imediatamente"
   na tela `/configuracoes/permissoes` **é falsa** — e não é questão de atraso:
   - quem está num **perfil customizado** (`sistema: false`): a edição **nunca chega**, com ou sem
     seed;
   - quem está num dos **8 perfis semente**: a edição chega só no próximo `db:seed`, e chega por
     um caminho destrutivo — `prisma/seed-perfis-acesso.ts:66` faz `deleteMany({perfilId})` e
     reconstrói o perfil inteiro a partir de `Permissao`, **apagando junto qualquer ajuste feito
     em `/configuracoes/perfis` para aquele mesmo perfil**.
2. **Daí a única forma durável de personalizar hoje: criar perfil novo.** Editar "Projetista PJ"
   se perde no deploy; criar "Freelancer de projeto" (`sistema: false`) persiste. A tela não diz
   isso — a personalização evapora sem aviso.
3. Já dá para criar perfis sob medida e conceder exceções nominais com validade. **O gargalo não
   é o motor — é (a) cobertura do catálogo e (b) gates que não passam por `can()`.**

> Decisão pendente #1: o que fazer com `/configuracoes/permissoes`. Atenção: "gravar também em
> `PermissaoPerfil` do perfil espelho" **não resolve sozinho** — conserta os 8 perfis semente,
> deixa os customizados de fora e continua colidindo com o `deleteMany` do seed. As saídas reais
> são: (a) tela vira somente-leitura ("matriz semente", só alimenta o seed), (b) tela é aposentada
> em favor de `/configuracoes/perfis` e o seed passa a semear só perfil ausente (`create`, nunca
> `delete`+recreate). Não dá para deixar como está.

---

## 1. Bugs achados no levantamento (consertar antes de ampliar)

Varredura cruzando os 68 pares do catálogo com todo gate real (`can`, `canRole`,
`requirePermission`, `defineAction`).

### 1.1 Pares no catálogo que nenhum gate lê

| Par | Quem realmente decide | Efeito de conceder hoje |
|---|---|---|
| `chat:usar` | `CHAT_ROLES` em 5 lugares: `chat/page.tsx:13`, `(dashboard)/layout.tsx:33`, `api/chat/{bootstrap,busca,estado}` | item aparece no menu → **403 ao clicar** |
| `auditoria:ver` | `requireRole("admin")` em `auditoria/page.tsx`, `auditoria/uso/*`, `api/auditoria/export` | idem |
| `uploads:validar` | `GLOBAL_ROLES.includes(user.role)` em `aprovacoes/page.tsx:18` | item aparece no menu → **redirect para `/sem-permissao`** |

Três pares que a tela mostra como configuráveis e que **não configuram nada** — a permissão
manda no menu, e o gate da página ignora a permissão. `chat:usar` é o caso do pedido: hoje
conceder ao freelancer não funciona.

⚠️ O comentário do próprio catálogo sobre `chat` diz *"o chat tem gate real no `service.ts`, e o
item de menu só passou a consultar o mesmo eixo"* — **é falso**: `modules/chat/service.ts` não
tem uma chamada a `can()` sequer. Corrigir o comentário junto, senão ele desmente este achado
para a próxima pessoa.

### 1.2 Pares usados em gate mas ausentes do catálogo (ingrantáveis)

| Par | Onde | Efeito |
|---|---|---|
| `financeiro:aprovar` | `financeiro/aprovacoes/page.tsx:10` + `financeiro/aprovacao/actions.ts:64` | fluxo de aprovação financeira só alcançável por `superUsuario` — não existe linha para conceder |
| `tarefas:ver` | `modules/busca/actions.ts:42` | tarefas nunca aparecem na busca global, exceto para `superUsuario` |

**✔ Feito (F0, 2026-09-02).** Ambos entraram em `PERMISSOES_CATALOGO`. Na semente, só
`tarefas:ver` — e por paridade, não por concessão nova: `/tarefas` é
`requireRole(...INTERNAL_ROLES)`, então quem já abria a página e via as mesmas tarefas
simplesmente não as achava no Ctrl+K; a busca já recorta por `escopoTarefa(user)`.

`financeiro:aprovar` ficou **grantável mas não semeado**, de propósito — vira decisão do dono
(§6.6): a alçada padrão (`getNiveisAprovacao`) nomeia admin+supervisor como aprovadores, mas o
recorte do Coordenador (dono, 2026-07-27) tirou financeiro do perfil `supervisor` de propósito.
As duas coisas estão no repo e se contradizem; semear seria escolher por ele em silêncio.
Lembrar que `financeiro:aprovar` é só o gate de ENTRADA — quem aprova qual valor continua vindo
da alçada por faixa (`papeisAprovadores`), já configurável na tela.

---

## 2. O exemplo do chat, destrinchado

"Freelancer só nos grupos de projeto, sem #geral e sem DM" **não é uma permissão** — são quatro
eixos diferentes, e modelar como um par só quebra:

| Pedaço | Onde vive hoje | Eixo correto |
|---|---|---|
| entrar no chat | `CHAT_ROLES` (5 sites) | `chat:usar` — **já existe**, só não é lido (§1.1) |
| sem `#geral` | `AUDIENCIAS.chat_participante` (`lib/audiencias.ts:87`) semeia quem entra no canal geral | novo par `chat:geral` + audiência derivada da permissão |
| sem DM | `DM_ROLES_EXCLUIDAS` + `chat/actions.ts:857` + `AUDIENCIAS.chat_dm` | novo par `chat:dm` |
| só canais dos projetos dele | linhas de `CanalMembro`, por registro | **continua por registro** — não vira permissão |

Proposta: quebrar `chat:usar` por `TipoCanal`.

```
chat:usar     entrar no chat (gate de tela e de API)   [já existe]
chat:geral    participar do canal #geral               [novo]
chat:dm       iniciar/receber conversa direta          [novo]
chat:grupo    criar/participar de grupos avulsos       [novo]
```

`projeto`/`disciplina` **não** viram par: quem está no projeto está no canal, e isso é
`CanalMembro`. Com isso, "freelancer só nos grupos de projeto" = `chat:usar` SIM, `chat:geral` NÃO,
`chat:dm` NÃO, `chat:grupo` NÃO — configurável na tela, sem código novo por caso.

⚠️ Trabalho real escondido aqui: `lib/audiencias.ts` resolve audiência por `role` e **não passa
por `can()`** — é o risco R2 documentado no próprio arquivo. Mover `chat_participante`/`chat_dm`
para permissão exige um `whereAudiencia` que consulte `PermissaoPerfil`, não `role`. É a parte
cara desta ampliação, e vale fazer uma vez: destrava as outras 11 audiências.

---

## 3. Inventário: onde mais dá para ampliar

Ordenado por (valor ÷ custo).

### Onda 1 — pares que já existem, gates que os ignoram (sem schema, sem seed)

| Gate hoje | Onde | Trocar por |
|---|---|---|
| `requireRole(...CHAT_ROLES)` | 5 sites do chat | `chat:usar` |
| `requireRole("admin")` | `auditoria/*`, `api/auditoria/export` | `auditoria:ver` |
| `GLOBAL_ROLES.includes(role)` | `aprovacoes/page.tsx:18` | `uploads:validar` (o par que o menu já usa) |
| `requireRole("admin","supervisor","administrativo")` | `configuracoes/{page,inputs,lista-mestre,usuarios}` | ⚠️ **NÃO é troca neutra** — ver abaixo |
| `user.role === "admin"` | `aprovacoes/page.tsx:21` (seção "Pedidos de exclusão"; o comentário diz "mesmo gate da lixeira") | `arquivos:excluir` (já no catálogo) |
| `user.role === "admin"` | `projetos/[id]/arquivos/page.tsx:128`, `coordenacao/page.tsx:108` | verificar caso a caso o que o flag gateia antes de escolher o par |

**⚠️ Achado ao executar a F2 (2026-09-02): as linhas de `configuracoes/*` saíram do escopo.** Ao
conferir a semente antes de mexer, `configuracoes:gerir` e `usuarios:gerir` estão semeados **só
para `administrativo`**, e `permissoes:gerir` para ninguém. Trocar o `requireRole` triplo por
esses pares **tiraria** o acesso do Coordenador a Configurações — mudança real de acesso, não
refatoração. Vira decisão nova (§6.7), não F2.

Os três pares que a F2 de fato religou foram conferidos um a um contra `PERMISSOES_BASE` e dão o
mesmo conjunto de pessoas: `chat:usar` é semeado exatamente como `CHAT_ROLES`; `uploads:validar`
só no coordenador (admin entra pelo bypass); `auditoria:ver` para ninguém (idem). Junto foi
religado `arquivos:excluir` na fila de exclusão de `/aprovacoes` — também semeado para ninguém,
mesmo conjunto que o `role === "admin"` de antes.

### Onda 2 — pares novos, recorte fino do que hoje é grosso demais

**Financeiro** — 20 sub-áreas atrás de **dois** pares (`ver`/`gerir`). Quem lança boleto ganha
conciliação bancária, fechamento de mês e importação de OFX no mesmo clique.

| Par novo | Cobre |
|---|---|
| `financeiro:aprovar` | `/financeiro/aprovacoes` — **hoje ingrantável** (§1.2) |
| `financeiro:conciliar` | `/financeiro/conciliacao`, `/importar` (OFX) |
| `financeiro:fechar` | `/financeiro/fechamento` — ato contábil, não lançamento |
| `financeiro:resultados` | `/rentabilidade`, `/balanco`, `/dfc`, `/relatorios` — margem e DRE ≠ contas a pagar |
| `financeiro:folha_pj` | `/folha-projetistas` — libera pagamento de terceiro |

**Configurações** — hoje `requireRole` misturando recortes distintos:
`configuracoes:disciplinas` (catálogo de disciplinas, hoje `requireRole("admin","supervisor")`) e
`configuracoes:licitacoes` (hoje `requireRole("admin")`). Para **encargos + feriados**
(`HR_ADMIN_ROLES`) checar antes se cabem em `rh:catalogos`, que já existe e já gateia
`/rh/catalogos` — a pergunta é se "catálogos de RH" comporta tabela de INSS/IRRF e calendário de
feriados ou se são coisas de peso diferente. Se não couberem, aí sim um par novo.

**Projetos** — abas renderizadas sem gate nenhum em `projetos/[id]/layout.tsx:135-150`:
`/disciplinas`, `/inputs`, `/lista-mestre`, `/servicos`, `/arts`, `/extras`, `/diario`
(`INTERNAL_ROLES`). Candidatos: `projetos:servicos`, `projetos:arts`, `projetos:diario`,
`inputs:ver`. Já existe `abasConfig` por projeto — decidir se o eixo é permissão, config de
projeto, ou os dois (permissão define o teto, `abasConfig` recorta dentro dele).

**Estrutura de pastas** — `projetos/pastas/actions.ts` tem 4× `roles: ["admin"]`.
Par novo `projetos:pastas` (quem redesenha a árvore de pastas do projeto).

**Licitações** — `configuracoes/licitacoes` é `requireRole("admin")`; existe
`licitacoes:{ver,gerir}` mas nada para "administrar modalidades/critérios".

### Onda 3 — o eixo que ninguém vê: audiências

`lib/audiencias.ts` tem 11 audiências decidindo **quem é notificado** e **quem aparece em
seletor de pessoas** — tudo por `role`, fora de `can()`, fora da tela. É onde mora "por que
fulano não recebeu o aviso". Tornar audiência configurável (ou derivá-la de permissão) é a
ampliação de maior alcance e a de maior risco: falha em audiência é silenciosa — não dá erro,
não dá log, só some.

---

## 4. O que **não** deve virar permissão

O repositório já discutiu isto; repetir aqui para não reabrir:

- **Interno × externo** (`INTERNAL_ROLES`: agenda, tarefas, `/versoes`, `/minha-ficha`). Da
  docstring de `nav-config.ts`: *"não existe `recurso:acao` que signifique 'é gente de dentro', e
  inventar 14 pares falsos seria pior"* — eles seriam semeados em todo perfil e medidos pelo gate
  como se fossem acesso a algo.
- **Vínculo trabalhista** (`CLT_ROLES`, `PJ_ROLES`, `CADASTRO_ROLES`): holerite, banco de horas,
  NF. É natureza do contrato, não acesso. `ponto/registros-projeto.ts:27` (PJ aponta, CLT bate
  jornada) é regra de negócio.
- **Pisos `roles: ["admin"]` com defesa explícita**: `perfis/actions.ts` (quem edita a matriz não
  pode se autopromover), `usuarios/actions.ts:192`. Piso de segurança, deliberado.
- **Escopo por registro**: `CanalMembro`, `CredencialCompartilhamento`, membro de projeto. Já é
  configurável — por registro, que é o granular certo.

---

## 5. Sequência sugerida

| Fase | Conteúdo | Risco |
|---|---|---|
| ~~F0~~ ✔ | §1.2 no catálogo (+ semente só de `tarefas:ver`) e comentário do chat corrigido — **feito em 2026-09-02** | baixo — só destravou o que já era para funcionar |
| ~~F1~~ ✔ | `/configuracoes/permissoes` virou matriz semente **somente-leitura**; `setPermissao` e o par `permissoes:gerir` removidos — **feito 2026-09-02** | baixo |
| ~~F1-A~~ ✔ | Seed create-only + migration `20260902120000_perfis_tarefas_ver` — **feito 2026-09-02**, provado no banco de dev | médio |
| ~~F2~~ ✔ | `chat:usar` (5 sites), `auditoria:ver` (4) e `uploads:validar` (1) religados — **feito 2026-09-02**, sem mudança de acesso | médio |
| ~~F3~~ ✔ | `chat:geral`/`dm`/`grupo` + `wherePermissao()` + `#geral` reconciliando os dois sentidos — **feito 2026-09-02** | médio-alto |
| ~~F4~~ ✔ | 5 pares do financeiro, `configuracoes:disciplinas`/`licitacoes`, 5 abas de projeto (opção C), `projetos:pastas` — **feito 2026-09-02** | médio |
| ~~F5~~ ✔ | `notificacoes:{gestao,rh,operacional}` — as 3 audiências de escalonamento saíram de papel — **feito 2026-09-02** | alto |

Cada par novo precisa de: entrada no catálogo (com `abre`/`dados`/`leitura` corretos), semente em
`prisma/seed.ts` (`PERMISSOES_BASE`) reproduzindo o acesso atual, e passagem pelo arnês de
equivalência. **Nenhum par novo pode alterar quem tem acesso hoje** — ampliar configurabilidade
não é redistribuir acesso; a redistribuição vem depois, pela tela, decidida pelo dono.

---

## 5-A. Decisão #1-A — o seed deixa de regravar matriz de perfil

Proposta concreta para a decisão #1. É a mudança que transforma "personalizável" em
"personalizável **e** sobrevive ao deploy".

### O que acontece hoje, confirmado

O deploy roda `npm run db:seed` — [`deploy/deploy-servidor.bat:117`](../../../deploy/deploy-servidor.bat),
[`deploy/gerenciar-servidor.ps1:798`](../../../deploy/gerenciar-servidor.ps1) (atualização manual),
`:1055` e `:1170` (deploy automático). **Nenhuma migration insere permissão** — os 7 arquivos de
`prisma/migrations/` com `INSERT INTO` não tocam `permissao` nem `perfil_acesso`. Ou seja:
migration é estrutura, seed é a matriz. Par novo não existe no banco até o seed rodar.

O que o seed faz com o que foi editado pela tela:

| Alvo | Sobrevive ao deploy? | Mecanismo |
|---|---|---|
| Matriz dos 8 perfis semente (`sistema: true`) | **Não** | `seed-perfis-acesso.ts:66` — `deleteMany({perfilId})` + `createMany` a partir de `Permissao` |
| **Conceder** um par fora do `PERMISSOES_BASE` na matriz legada | **Não** | poda de órfãos, `seed.ts:507` |
| **Revogar** um par que está no `PERMISSOES_BASE` | Sim | `upsert` com `update: {}` (`seed.ts:490`) não mexe em linha existente |
| Perfil customizado (`sistema: false`) | Sim | o loop do seed só percorre `CHAVE_POR_ROLE` |
| Override individual (`PermissaoUsuario`) | Sim | seed não toca |

Assimetria perversa: **tirar** acesso pela tela dura, **dar** acesso pela tela morre no próximo
deploy. Que é o pior default possível — a falha é silenciosa e só aparece quando alguém perde
acesso semanas depois.

### A mudança

`seedPerfisAcesso` passa a ser **create-only**:

```
hoje:    upsert(perfil) → deleteMany({perfilId}) → createMany(linhas de Permissao)
depois:  perfil já existe?  → não faz nada com a matriz
         perfil não existe? → create(perfil) + createMany(linhas de Permissao)
```

`PERMISSOES_BASE` vira o que sempre deveria ter sido: **ponto de partida de banco novo**, não
verdade reimposta a cada deploy. A matriz de qualquer perfil (semente ou customizado) passa a ser
editável e durável, e o aviso âmbar de "perfil de sistema" some da tela.

### O custo, que é real

Par de permissão novo **deixa de se distribuir sozinho** aos perfis existentes. Hoje, adicionar
`financeiro:conciliar` ao `PERMISSOES_BASE` faz o próximo deploy concedê-lo a quem já tinha
`financeiro:gerir`. Com create-only, nada acontece — todo mundo fica sem, e alguém precisa
conceder na tela. Sem tratar isso, cada F4 vira um chamado de "sumiu meu acesso".

Duas saídas, não excludentes:

1. **Migração de dados por par novo** (padrão do repo para dado, e o mais previsível): o commit que
   adiciona o par traz uma migration `INSERT INTO permissao_perfil … SELECT` que o concede a quem
   já tem o par equivalente. Explícito, auditável, versionado, reversível.
2. **"Aplicar novidades do catálogo"** na tela de perfis: lista os pares do catálogo que o perfil
   nunca viu (nem concedido, nem negado) e deixa decidir um a um. Precisa distinguir "nunca visto"
   de "negado de propósito" — hoje `PermissaoPerfil` não guarda essa diferença (linha ausente =
   negado), então exige coluna nova ou uma tabela de "pares já apresentados por perfil".

Recomendação: **(1) agora, (2) depois se virar incômodo.** (1) não muda schema e cabe no fluxo de
deploy que já existe; (2) é feature.

### Ordem obrigatória

O create-only tem que entrar **antes** de F4, senão os pares novos do financeiro/projetos entram
no mundo antigo e o primeiro deploy seguinte apaga o que o dono configurar. Passa a ser F1-A,
logo depois da decisão #1.

⚠️ Enquanto não entrar, o aviso da tela continua correto e **não pode ser removido** — ele é a
única coisa que impede alguém de configurar um perfil semente e perder tudo no deploy.

---

## 6. Decisões pendentes do dono

1. Destino de `/configuracoes/permissoes` (§0) e o create-only do seed (§5-A).
2. Abas de projeto: permissão, `abasConfig`, ou permissão-como-teto + `abasConfig` dentro dela?
3. Chat: `chat:geral` e `chat:dm` como pares separados confirmam o desenho do pedido?
4. Financeiro: os 5 recortes de §3 batem com quem faz o quê no escritório hoje?
5. Audiência configurável (F5) entra no escopo ou fica como está por ora?
7. **Configurações:** hoje `/configuracoes`, `/configuracoes/inputs`, `/lista-mestre` e
   `/usuarios` são `requireRole("admin","supervisor","administrativo")`. Migrar para
   `configuracoes:gerir`/`usuarios:gerir` **tira o Coordenador** (a semente desses pares só tem
   `administrativo`). Manter o Coordenador exige semear os pares para ele — o que é concessão,
   não refatoração. Coordenador continua administrando Configurações, ou não?
8. ~~**`financeiro:aprovar`**~~ ✔ resolvido (opção D): default da alçada passou a ser só `admin`.

**Decidido em 2026-09-02:** #1 → (A) seed create-only · #2/`financeiro:aprovar` → (D) só admin ·
#3 chat por `TipoCanal` → aprovado · #4 → os 5 recortes do financeiro · #5 abas → (C) permissão
como teto + `abasConfig` dentro · #6 audiências → entram no escopo.

<!-- histórico da decisão 6, mantido para contexto -->
6. **`financeiro:aprovar`:** quem aprova despesa acima da alçada além do admin? A alçada padrão
   diz admin+supervisor; o recorte do Coordenador (2026-07-27) tirou financeiro do `supervisor`.
   Hoje o par existe na tela e não está concedido a ninguém — dois cliques resolvem, mas a
   escolha é de processo, não técnica. Enquanto não decidir, **o supervisor recebe notificação
   de "aprove este lançamento" e esbarra em 403.**


---

## 7. Execução — o que foi feito em 2026-09-02

Todas as ondas entregues. Decisões do dono no mesmo dia: #1 → (A) seed create-only · alçada
financeira → (D) só admin · chat por `TipoCanal` → aprovado · os 5 recortes do financeiro ·
abas → (C) permissão como teto · audiências → entram · Coordenador **pode perder** Configurações.

### Pares novos no catálogo (68 → 86)

| Recurso | Pares novos |
|---|---|
| `tarefas` | `ver` |
| `financeiro` | `aprovar`, `conciliar`, `fechar`, `resultados`, `folha_pj` |
| `chat` | `geral`, `dm`, `grupo` |
| `configuracoes` | `disciplinas`, `licitacoes` |
| `projetos` | `servicos`, `arts`, `diario`, `extras`, `pastas` |
| `notificacoes` | `gestao`, `rh`, `operacional` |

Removido: `permissoes:gerir` (a tela que ele gateava virou somente-leitura).

### Migrations de dados (o padrão que o create-only exige)

| Migration | O que concede | Como |
|---|---|---|
| `20260902120000_perfis_tarefas_ver` | `tarefas:ver` | chaves nomeadas (7 perfis internos) |
| `20260902160000_perfis_chat_por_canal` | `chat:geral/dm/grupo` | **derivado** de quem tem `chat:usar` (perfil + override) |
| `20260902180000_perfis_recorte_fino` | financeiro, abas, disciplinas | **derivado** de `financeiro:gerir`/`ver` e `projetos:ver` |
| `20260902200000_perfis_notificacoes_gestao` | `notificacoes:*` | chaves nomeadas (eixo novo, sem par de onde derivar) |

Derivar do par equivalente, quando existe, é o padrão preferido: preserva customização que o dono
já tenha feito e reproduz o acesso real, não a semente idealizada.

### Prova de neutralidade

`scripts/snapshot-audiencia.ts` antes × depois de tudo, no banco de dev:

- **11 audiências: idênticas.** Ninguém entrou nem saiu de nenhuma lista de notificação.
- **10 usuários, menu idêntico.** Nenhum item apareceu ou sumiu.
- `db:seed` rodado entre as ondas: configuração de perfil sobreviveu (marcador plantado no
  Coordenador continuou lá).

⚠️ **O que essa prova cobre, e o que não cobre.** Cinco audiências trocaram de MECANISMO (papel →
permissão). A igualdade mede que as migrations concederam exatamente os papéis que o código antigo
nomeava — nos perfis SEMENTE, que é o que existe no banco de dev. Não prova equivalência para
perfil customizado: lá `notificacoes:*` não é concedido por migration nenhuma (ver Limitações), e
quem tiver criado perfil próprio precisa marcar os pares na tela. A prova é do backfill, não da
resolução em toda configuração possível.

### Mudanças de acesso deliberadas (as únicas)

1. **Coordenador perde `/configuracoes`, `/configuracoes/inputs`, `/lista-mestre` e
   `/usuarios`** — decisão do dono. O menu já escondia esses itens dele (`nav-config` sempre
   exigiu `configuracoes:gerir`); o que muda é que a URL direta deixa de funcionar. Por isso o
   snapshot de menu não acusou diferença. Para devolver, basta marcar o par no perfil — sem deploy.
2. **Alçada financeira padrão** passou a `["admin"]`. ⚠️ Só vale onde `ConfigSistema` não tem
   linha de níveis; onde a alçada já foi configurada pela tela, a linha salva continua mandando.
3. **`aprovadores()` (financeiro) foi removida** — era código morto que resolvia por
   `whereAudiencia("global")` e dizia "admin/supervisor", contradizendo a decisão D. O caminho
   vivo é `aprovadoresPorPapeis(papeisAprovadores(valor, niveis))`, que segue a alçada.
4. **`criarGrupo` ganhou gate** (`chat:grupo`) onde não havia nenhum — semeado para quem alcança
   o chat, então ninguém que criava grupo deixou de criar.

### Limitações conhecidas

- **Perfil customizado não recebe `notificacoes:*`** pela migration: eixo novo, sem par de onde
  derivar, e não dá para adivinhar se um perfil criado à mão deveria receber escalonamento de RH.
  Quem tiver perfil próprio precisa marcar na tela.
- **`chat_global` continua por papel** (`ROLES_GLOBAIS_CHAT`). É escopo de DADOS — "enxerga todos
  os projetos" —, o mesmo eixo de `escopo:global`, e não um gate de tela. Migra quando
  `escopo:global` for religado, não antes.
- **`financeiro:aprovar`, `configuracoes:licitacoes` e `projetos:pastas` não têm ninguém
  semeado**: eram `requireRole("admin")`/`roles:["admin"]`, alcançáveis só pelo bypass. Ficam
  grantáveis pela tela; conceder é decisão, não reprodução.

### Conferência visual (build de produção, 2026-09-02)

`npm run build` verde. Servidor de produção subido e navegado com puppeteer headless, com um
usuário QA descartável (criado e removido no fim) e depois com o usuário demo do Coordenador.

| Tela | Resultado |
|---|---|
| `/configuracoes/permissoes` | 200 — matriz semente somente-leitura, banner e checkbox desabilitado |
| `/configuracoes/perfis` + detalhe de perfil `sistema` | 200 — placar 66/86, aviso informativo (não mais âmbar) |
| `/aprovacoes` | 200 — fila renderiza |
| `/financeiro` | 200 |
| Projeto → barra de abas | 200 — Serviços, ARTs, Diário e Extras presentes |

Zero erro de console ou `pageerror` em qualquer rota.

**Prova da única redução de acesso**, navegando como Coordenador (`helena@demo.senahub`):

| Rota | Resultado |
|---|---|
| `/configuracoes` | **NEGADO** → `/sem-permissao` ✔ (a redução decidida) |
| `/configuracoes/usuarios` | **NEGADO** ✔ (idem) |
| `/configuracoes/disciplinas` | OK ✔ (a migration devolveu o que o `requireRole("admin","supervisor")` dava) |
| `/aprovacoes` | OK ✔ (`uploads:validar`) |
| `/chat` | OK ✔ (`chat:usar`) |
| `/auditoria` | NEGADO ✔ (já era admin-only) |
| `/financeiro/conciliacao` | NEGADO ✔ (nunca teve financeiro) |
