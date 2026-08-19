# Runbook — ativar Vínculos e Perfis de acesso em produção

**Data:** 2026-08-08 · **Executor:** operador do servidor (Administrador) · **Duração estimada:** 30-45 min
**Objetivo:** pôr em vigor em produção o que já está implementado no código — Fase 0 (Setor ×
Contratação × Vínculo) e Onda B (Perfis de acesso) da reforma de acesso.
**Plano:** [docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md](superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md)

---

## Correção de escopo — leia antes

Isto **não** é "3 comandos de 5 minutos", como foi dito antes de eu medir. Produção estava **81
commits e 15 migrations atrás** de `dev`, e o `prisma/seed.ts` do código atual não roda contra o
schema antigo. A operação real é:

1. promover `dev` → `master`;
2. rodar o **Deploy completo** já existente (ele sozinho faz `migrate deploy` **e** `db:seed`);
3. rodar **dois backfills** à mão, com o serviço já no ar.

Só o passo 3 é comando novo. Os passos 1 e 2 são o procedimento de deploy normal do escritório.

> **Este deploy também sobe trabalho não relacionado.** Os 81 commits incluem a evolução dos
> apontamentos do visualizador de PDF e o lançamento de férias por terceiro no RH. Se você preferir
> separar as duas coisas, dá — mas aí é outro planejamento (cherry-pick da reforma de acesso para uma
> branch própria). **Decisão sua**; este runbook assume o deploy inteiro.

**Nada aqui muda quem pode o quê.** Autorização continua 100% em `role` até a Onda D. Os backfills só
preenchem dado novo (`tipo`, `setor`, `contratacao`, `Vinculo`, `perfilId`, `superUsuario`) que hoje
está nulo. É aditivo e idempotente — pode rodar duas vezes sem estragar nada.

---

## Estado medido de produção (snapshot de 2026-08-06)

| Item | Produção | Esperado após o runbook |
|---|---|---|
| Usuários | 27 (26 ativos) | igual |
| `user.tipo` preenchido | **0** | **27** |
| `perfil_acesso` (perfis semente) | **0** | **8** |
| `user.perfilId` preenchido | **0** | **~23** |
| `user.superUsuario` | **0** | **3** (os admins) |
| Grade de 6h do estagiário | ✅ já semeada | igual |
| `escala_usuario` | 7 linhas, 1 usuário | ver passo 6 (opcional) |

Os números da coluna da direita não são estimativa: saíram do ensaio
(`scripts/ensaiar-gate-onda-d.ts`) rodado contra um clone deste mesmo dataset, que fechou com
**26 usuários × 1430 células, 0 ganhos e 0 perdas** de permissão. Use-os como critério de aprovação.

---

---

## ⚠ DEPLOY 2 — a virada da autorização (Onda D)

> ## ✅ CONCLUÍDO em 2026-08-19 — os dois gates verdes. Leia o post-mortem abaixo antes de reusar.
>
> O **código** da virada foi para produção junto com o deploy de 2026-08-09 (commit `6eb6762` entrou
> em `master` naquele dia e todo deploy posterior o carregou). Mas o **passo 2 desta seção — rodar
> `backfill-perfis-acesso.ts` depois do `db:seed` — nunca foi executado**, e passou 10 dias assim.
>
> **Consequência, silenciosa:** o sócio ficou sem `escopo:global` e enxergou só os projetos dele —
> sem erro em tela, sem log, só menos coisa aparecendo. O gate de equivalência acusava 9 perdas em
> vez das 7 previstas; as 2 sobrando eram `escopo:global` pelos dois caminhos de avaliação.
>
> **Por que o Deploy 1 não bastou, e é o ponto a lembrar:** `escopo:global` só passou a existir no
> catálogo NA Onda D (commit `414ed95`) — antes disso o escopo de dados vivia hardcoded em
> `GLOBAL_ROLES`/`ehSocio`. O backfill só materializa pares que existem no catálogo
> (`conhecidoNoCatalogo`), então quando ele rodou no Deploy 1 esse item ainda não existia para ser
> migrado. **É exatamente por isso que este passo 2 manda rodar o mesmo backfill de novo, depois do
> seed** — e é por isso que ele é idempotente. Rodar o backfill uma vez só, no deploy anterior, não
> substitui rodá-lo aqui.
>
> **Corrigido em 2026-08-19:** backfill rodado, 1 override criado (`escopo:global`; os outros 5 do
> piso de sócio já existiam desde o Deploy 1). Gate de permissões voltou às **7 perdas previstas**,
> com os 5 ganhos cobertos pela allowlist. Gate de jornada: **idêntico para os 26 usuários**.
>
> **Ao ler o dry-run deste backfill, não se assuste com o número:** ele conta os "faltantes" contra a
> matriz do PERFIL do usuário, não contra os overrides já existentes — então reporta os mesmos 6 para
> o sócio existindo override ou não. Quem desduplica é o `upsert` com `update: {}`. Para saber o que
> realmente falta, o instrumento é o `checar-equivalencia-permissoes.ts`, não a contagem do dry-run.

Os passos abaixo (0 a 6) são do **Deploy 1**, já executado em 2026-08-09. O Deploy 2 é o que
**religa a autorização** no motor de Perfil de acesso. A partir dele, `role` deixa de decidir
acesso.

**Pré-requisitos, todos já cumpridos no Deploy 1:** `perfilId` em 23 pessoas, `superUsuario` nos
3 admins, gate de equivalência verde. **Sem eles, este deploy tranca todo mundo para fora,
inclusive o admin** — o bypass deixa de ser `role === "admin"` e passa a ser `superUsuario`.

**Sequência:**

1. `deploy\gerenciar-servidor.bat` → **Deploy completo**. Não há migration nova; o `db:seed` do
   próprio deploy cria as permissões novas (`escopo:global`, `chat:usar`, `auditoria:ver`) e
   atualiza os perfis **antes** de o serviço subir — a ordem do script já garante isso.
2. **Imediatamente depois de o serviço subir**, rode:
   ```
   npx tsx --tsconfig tsconfig.server.json scripts/backfill-perfis-acesso.ts
   ```
   É ele que materializa o `escopo:global` do sócio. Entre o serviço subir e este comando rodar,
   essa pessoa enxerga só os projetos dela — janela de minutos, mas rode logo.
3. **Materializar a jornada de quem ainda não tem grade própria** (passo 2 de §6.4, nunca rodado
   em produção — era o "passo 6 opcional"). Precisa vir ANTES do gate de jornada:
   ```
   npx tsx --tsconfig tsconfig.server.json scripts/materializar-escala-usuario.ts
   ```
   Grava o valor que já estava sendo calculado — ninguém muda de jornada.

4. Conferir os gates:
   ```
   npx tsx --tsconfig tsconfig.server.json scripts/checar-equivalencia-permissoes.ts
   npx tsx --tsconfig tsconfig.server.json scripts/checar-equivalencia-jornada.ts
   ```
   O de jornada compara a grade de cada pessoa pelo caminho antigo (`EscalaRole[role]`) e pelo
   novo (`EscalaContratacao[contratacao]`). **Qualquer diferença é bloqueante** — jornada errada
   vira banco de horas e falta errados retroativamente, e o espelho é assinado com hash.
   Esperado: **exit 0**, com `5 ganho(s) COBERTO(S) por allowlist versionada` e as 7 perdas de
   escrita do sócio (intencionais). Qualquer ganho **fora** dessas 5 é bloqueante.

**O que muda para as pessoas, no dia 1:**
- o sócio `projetista_pj` perde 7 ações de escrita (entre elas "validar entregas"). Verificado no
  `AuditLog` que ele nunca usou nenhuma;
- quem for `supervisor` perde o escopo global e 17 itens de menu que já não conseguia abrir. Hoje
  não há `supervisor` ativo em produção — **reconfira na véspera**;
- PJ, freelancer e sócio deixam de bater ponto (usam "Iniciar apontamento");
- gestão passa a ver "Meu trabalho", inclusive o de outras pessoas.

**Rollback:** restaurar o backup do passo 0 e voltar o código para a tag anterior. Os backfills
são aditivos e não precisam ser desfeitos.

---

## Passo 0 — provar que o backup funciona (NÃO PULE)

O deploy faz backup antes da migration, mas `Invoke-Backup` **falha macio**: se `PG_DUMP_PATH` ou
`BACKUP_PATH` não estiverem no `.env`, ele só pergunta se você quer continuar — e um operador com
pressa digita CONTINUAR e migra 15 migrations sem rede. Esse é o único modo de falha irreversível
deste runbook.

```
deploy\gerenciar-servidor.bat   → Backup
deploy\gerenciar-servidor.bat   → Listar backups
```

**Critério:** apareceu um arquivo novo, com data de hoje e **tamanho > 0 MB**.
**Se falhar:** pare aqui. Corrija `PG_DUMP_PATH` (caminho do `pg_dump.exe`) e `BACKUP_PATH` no `.env`
e repita. Não siga sem um backup verificado.

> **Dois buracos de recuperação constatados no servidor em 2026-08-09** — nenhum bloqueia estes
> backfills (que só tocam colunas), mas os dois são do tipo que só aparece na hora errada:
> 1. **`PG_BIN_PATH` não está no `.env`.** É o que o script de restauração usa para achar o
>    `pg_restore.exe`. Existe backup, mas o **caminho de volta não está configurado** — um backup
>    que ninguém testou restaurar ainda não é um backup. Configure e faça uma restauração de teste
>    num banco descartável.
> 2. **O espelho do storage está parado desde 28/07** (`STORAGE_BACKUP_PATH` também ausente do
>    `.env`). O dump do banco **não contém arquivo nenhum** — hoje existe rede para o banco e
>    nenhuma para os uploads.

---

> ### ⚠ O servidor tem `dev` em check-out, não `master` (constatado em 2026-08-09)
>
> `origin/dev` e `origin/master` apontam para o mesmo commit hoje (`89d0463`, 1.6.0), então o
> código em produção está correto. Mas o **working tree do servidor está na branch `dev`**, e
> `Invoke-DeployCompleto` roda `git pull` na branch que estiver em check-out. Na prática,
> **`dev` é a branch de produção**, não `master`.
>
> Consequência que importa mais do que a divergência de procedimento: **mergear qualquer coisa em
> `dev` fica a um `git pull` de distância de produção.** O commit que religa `can()` no
> `permissaoEfetiva` (Onda D) derruba o acesso de todo mundo numa base sem os backfills — então
> ele **não pode ser mergeado em `dev`** antes dos passos 3, 4 e 5 estarem verdes em produção.
>
> Decidir depois: ou o servidor passa a seguir `master` (alinha com o procedimento e com
> [[workflow-branch-dev]]), ou o procedimento passa a assumir `dev` e o `master` vira redundante.
> Enquanto não decidir, trate `dev` como se fosse produção.

## Passo 1 — promover `dev` → `master`

Na **máquina de desenvolvimento** (não no servidor):

```
dev.bat   → Promover dev → produção
```

Antes disso, o menu roda "Verificar tudo" (lint + testes + build). **Critério:** os três passam.
Estado de referência de hoje: lint limpo, 1805 testes, build OK.

> O build passou a exigir mais heap e foi corrigido em `scripts/build.mjs` — se o servidor vinha
> falhando o build com "Ineffective mark-compacts near heap limit", este deploy resolve.

---

## Passo 2 — Deploy completo (no servidor, como Administrador)

```
deploy\gerenciar-servidor.bat   → Deploy completo
```

Ele executa, nesta ordem: checa que não há mudança local não commitada → `git pull` → **para o
serviço** → `npm ci` → `npm run build` → **backup** → `npx prisma migrate deploy` → `npm run db:seed`
→ inicia o serviço → status final.

**O site fica fora do ar** entre "para o serviço" e "inicia o serviço". Faça em janela combinada, e
**nunca na semana de fechamento de folha ou de pagamento de PJ** (§8.1 do plano).

**Critérios:**
- `migrate deploy` aplica **15 migrations** sem erro (de `20260806120000_documento_disciplina` até
  `20260808070000_leitura_documento`). O ensaio já aplicou exatamente essas 15 sobre este dataset real.
- `db:seed` imprime, entre outras linhas: **`✔ 8 perfil(is) de acesso semeado(s): coordenador,
  administrativo, clt, estagiario, projetista_pj, freelancer, portal_cliente, ti.`**
  Essa linha é a que interessa aqui — é a Onda B entrando em produção.
- Checagem final: porta 3000 respondendo, URL pública HTTP 200, banco OK.

**Se `migrate deploy` falhar:** o serviço fica PARADO de propósito. Avalie restaurar o backup do
passo 0. Não tente "consertar" o banco à mão.
**Se o `db:seed` falhar** (o deploy avisa mas sobe o serviço assim mesmo): rode
`deploy\gerenciar-servidor.bat → Reaplicar seed` e confira a linha dos 8 perfis antes de seguir.

---

## Passo 3 — backfill da Fase 0 (Vínculo / Setor / Contratação)

Serviço já no ar. Na pasta do projeto **no servidor**:

```
npx tsx --tsconfig tsconfig.server.json scripts/backfill-vinculos.ts --dry-run
npx tsx --tsconfig tsconfig.server.json scripts/backfill-vinculos.ts
```

Rode o `--dry-run` primeiro e leia o resumo. É idempotente: quem já tem vínculo ativo é pulado.

**Critérios:**
- termina com `✔ cache e vínculo consistentes.`
- gera `logs/backfill-vinculos-<timestamp>.csv`

**Verificação no banco:**

```sql
select count(*) filter (where tipo is not null) as com_tipo, count(*) as total from "user";
-- esperado: 27 | 27
```

---

## Passo 4 — backfill da Onda B (Perfil de acesso)

**A ordem importa: este passo depende do passo 3.** Se rodar antes, ele atribui perfil sobre uma base
com `tipo` nulo, e o gate de equivalência passa a "aprovar" comparando zero células — foi exatamente
o falso-verde que apareceu no ensaio.

```
npx tsx --tsconfig tsconfig.server.json scripts/backfill-perfis-acesso.ts --dry-run
npx tsx --tsconfig tsconfig.server.json scripts/backfill-perfis-acesso.ts
```

**Critérios — EXECUTADO EM PRODUÇÃO em 2026-08-09, saída real:**
- `26 usuário(s) processado(s).`
- `✔ 23 perfil(is) atribuído(s) · 3 superUsuario marcado(s)`
- `✔ 12 override(s) de piso de sócio materializado(s)`

> **O critério "0 overrides" que estava aqui era ERRADO** — vinha da afirmação "os 3 sócios ativos
> são os 3 admins", tirada de um snapshot de 2026-08-06. São **4 sócios ativos**: os 3 admins mais
> um `projetista_pj`, marcado depois do snapshot. Admin cai num `continue` antes do bloco de
> override, o sócio não-admin não — por isso 12, todos de um único usuário. Ver §15.9 do plano.
>
> Dos 12, **7 são de ESCRITA** (`projetos:gerir`, `uploads:validar`, `planejamento:gerir`,
> `recursos:gerir`, `ferramentas:gerir`, `coordenacao:gerir`, `custos:gerir`) e estão **gravados em
> produção hoje**, por decisão consciente do dono ("rodar agora e corrigir depois"). São inertes —
> nada lê `permissaoEfetiva` para autorizar ainda. **A poda do fix de §15.7 os remove no próximo
> backfill, e isso tem que acontecer ANTES do flip do `can()`.**

> **Se você já rodou este passo antes de 2026-08-09:** rode de novo depois do próximo deploy. O
> script mudou — o piso de sócio passou a ser **só de leitura** (§15.7 do plano) e ele agora
> **poda** overrides de piso de escrita que a versão anterior tenha criado. É idempotente, então
> rodar duas vezes não faz mal. Em produção o efeito é nulo (0 overrides, porque os sócios são
> admins), mas rode assim mesmo para a base não ficar com resíduo.

**Verificação no banco:**

```sql
select count(*) from perfil_acesso;                                  -- esperado: 8
select count(*) from "user" where "perfilId" is not null;            -- esperado: 23
select count(*) from "user" where "superUsuario";                    -- esperado: 3
```

---

## Passo 5 — conferir que nada mudou de acesso

```
npx tsx --tsconfig tsconfig.server.json scripts/checar-equivalencia-permissoes.ts
```

**Critério: `✔ Zero ganhos de acesso.` com um número de células DIFERENTE DE ZERO** — o esperado é
`26 usuário(s) × 2860 célula(s)` (**1430 por via**: metade mede a fórmula de `requirePermission`,
com o piso de sócio, e metade a de `defineAction`, sem o piso — os dois caminhos divergem hoje, ver
§15.7). Se aparecer `0 célula(s)`, o script falha duro em vez de mentir; significa que o passo 3
não pegou.

Qualquer ganho de acesso é **bloqueante**: pare, não siga para a Onda D, e me traga o relatório
gerado em `logs/equivalencia-permissoes-*.json`.

---

## Passo 6 — (opcional, prep da Onda E) materializar `EscalaUsuario`

Produção tem 7 linhas de `escala_usuario` para **1** usuário; no dev são 8 usuários. A materialização
de §14.8 nunca rodou lá. **Não é necessário para a Onda D** — é pré-requisito da Onda E (criar
`EscalaContratacao` sem colisão). Zero mudança de jornada: grava o valor que já estava sendo
calculado.

```
npx tsx --tsconfig tsconfig.server.json scripts/materializar-escala-usuario.ts
```

Se preferir deixar para o runbook da Onda E, pule — não bloqueia nada agora.

---

## Depois do runbook — conferência humana (não é código)

1. **CSV do passo 3** (`logs/backfill-vinculos-*.csv`): toda linha com `setor_sem_origem` é o default
   **Engenharia**, não um levantamento — corrija na tela de cadastro quem for de outro setor. Como
   setor não concede permissão nenhuma, um setor errado não causa ganho nem perda de acesso.
2. **Linhas `pj_ou_autonomo_rpa`**: freelancers migrados provisoriamente como `pj`. A reclassificação
   é pessoa a pessoa e ainda está em aberto (§9.2). Enquanto isso, todos seguem na conta contábil
   **2.02**, sem exceção.
3. **`admin` fica sem vínculo de propósito** (`sem_vinculo_definir_a_mao`) — é decisão manual.
4. **Tela "Meu acesso"** (`/minha-ficha`): confira com 2 ou 3 pessoas que Setor/Contratação/Perfil
   agora aparecem preenchidos, em vez de "Não definido".
5. **Pendências antigas que continuam abertas** (§10.1): preencher `Recurso.custoHora` de PJs e
   sócios; decidir com orientação jurídica o que fazer com os espelhos de ponto já assinados por
   PJ/freelancer antes do gate.

---

## Como voltar atrás

| Onde falhou | O que fazer |
|---|---|
| Passo 0 (backup) | Pare. Sem backup verificado não se segue. |
| Passo 2, no `npm ci`/build | O serviço está parado. Corrija e repita o Deploy completo; ou opção 4 para subir com o que já está no disco. |
| Passo 2, na migration | Serviço parado de propósito. Restaure o backup do passo 0. Não edite o banco à mão. |
| Passo 2, no `db:seed` | Serviço sobe assim mesmo. Use "Reaplicar seed". |
| Passos 3 ou 4 (backfills) | São idempotentes e aditivos: rode de novo. **Não** existe "desfazer" — mas também não há o que desfazer, porque nada de autorização depende desses campos até a Onda D. |
| Passo 5 acusa ganho de acesso | Bloqueante. O acesso real não mudou (ainda é `role`), então não há incidente — mas não siga para a Onda D até entender o ganho. |
