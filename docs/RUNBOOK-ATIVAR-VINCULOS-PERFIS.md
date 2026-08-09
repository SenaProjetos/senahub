# Runbook — ativar Vínculos e Perfis de acesso em produção

**Data:** 2026-08-08 · **Executor:** operador do servidor (Administrador) · **Duração estimada:** 30-45 min
**Objetivo:** pôr em vigor em produção o que já está implementado no código — Fase 0 (Setor ×
Contratação × Vínculo) e Onda B (Perfis de acesso) da reforma de acesso.
**Plano:** [docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md](superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md)

---

## Correção de escopo — leia antes

Isto **não** é "3 comandos de 5 minutos", como foi dito antes de eu medir. Produção roda `master`,
que está **81 commits e 15 migrations atrás** de `dev`. O `prisma/seed.ts` do código atual não roda
contra o schema antigo de produção. A operação real é:

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

---

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

**Critérios (números do ensaio contra este dataset):**
- `26 usuário(s) processado(s).`
- `✔ 23 perfil(is) atribuído(s) · 3 superUsuario marcado(s)`
- `✔ 0 override(s) de piso de sócio materializado(s)` — correto aqui, porque os 3 sócios ativos são
  os 3 admins, e admin já faz bypass total.

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
`26 usuário(s) × 1430 célula(s)`. Se aparecer `0 célula(s)`, o script agora falha duro em vez de
mentir; significa que o passo 3 não pegou.

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
