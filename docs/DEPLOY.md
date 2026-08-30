# Deploy — SenaHub em produção (Windows + Cloudflare Tunnel)

Runbook para a **primeira subida** no servidor. App roda nativo no Windows (Next + Socket.io +
pg-boss no mesmo processo, via `server.ts`), exposto pela internet por um **Cloudflare Tunnel**
(sem abrir portas no firewall). O banco **vem vazio** — os dados não acompanham o código.

> Convenções: `F:\SenaHub\app` = pasta do projeto. `hub.seudominio.com.br` = domínio público.
> Troque pelos seus valores.

---

## 0. Pré-requisitos (instalar no servidor)

Já instalado: **Google Chrome**. Falta instalar:

| Software | Como |
|---|---|
| **Node.js LTS (20+)** | `winget install OpenJS.NodeJS.LTS` (ou instalador do nodejs.org) |
| **PostgreSQL 17** | instalador do postgresql.org. Anote a senha do `postgres` e a porta (**5432**). |
| **NSSM** | https://nssm.cc → coloque `nssm.exe` no PATH (ou passe `-NssmPath` no script) |
| **cloudflared** | `winget install --id Cloudflare.cloudflared` (ou download da Cloudflare) |
| **.NET 8 SDK** | `winget install Microsoft.DotNet.SDK.8` (necessario pra compilar o SenaHub Manager, seção 11) |

Conta Cloudflare com o domínio (`seudominio.com.br`) já adicionado como zona.

---

## 1. Copiar o código

```powershell
git clone <URL_DO_REPO> F:\SenaHub\app
cd F:\SenaHub\app
git checkout master
```
> Não copie `.env`, `node_modules` nem `.next` da máquina de dev — serão recriados aqui.

> ⚠️ **O checkout do servidor fica em `master` e não sai de lá.** `master` é a produção; `dev`
> acumula o trabalho e só chega aqui via *Promover dev → produção* no PC de dev. O deploy usa
> `git pull` sem argumento, que segue o branch do checkout — então um `git checkout` digitado no
> servidor troca a fonte da produção silenciosamente. Foi o que houve entre 27/07 e 11/08/2026:
> o checkout foi para `dev`, os deploys seguintes publicaram `dev`, e `master` ficou quatro
> releases atrás (1.6.0) enquanto a produção rodava 1.10.0. Hoje o menu confere isso antes de
> puxar e aborta o deploy automático se o checkout tiver saído de `master`.

---

## 2. Banco de dados (vazio → schema → seed)

Crie um usuário dedicado + banco vazio (via `psql` ou pgAdmin):

```sql
CREATE USER senahub WITH PASSWORD 'SENHA_FORTE';
CREATE DATABASE senahub OWNER senahub;
```

O **schema** (tabelas) e os **dados iniciais** são criados nos passos 4–5, não agora.

---

## 3. Configurar o `.env` de produção

```powershell
Copy-Item .env.production.example .env
notepad .env
```
Preencha (ver [.env.production.example](../.env.production.example)):
- `DATABASE_URL` = `postgresql://senahub:SENHA_FORTE@localhost:5432/senahub`
- `APP_URL` **e** `BETTER_AUTH_URL` = `https://hub.seudominio.com.br` (exatamente a origem pública)
- `BETTER_AUTH_SECRET` = segredo **novo**: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `STORAGE_BASE_PATH` = pasta existente (ex.: `F:\SenaHub\storage`)
- `ACESSOS_ENCRYPTION_KEY` = chave do cofre de credenciais (**Acessos**), 32 bytes em base64:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  **Guarde uma cópia fora do servidor**: sem ela nenhuma senha do módulo Acessos pode ser
  descriptografada — o dump do banco sozinho não recupera nada. Trocar a chave torna todas as
  credenciais já gravadas ilegíveis (não há rotação automática nesta versão). Nunca reaproveitar
  `BETTER_AUTH_SECRET` aqui: comprometer uma não pode comprometer a outra.
- `CHROME_PATH` = `C:\Program Files\Google\Chrome\Application\chrome.exe`
- `ODA_CONVERTER_PATH` = executável do **ODA File Converter** (ver seção 4.1) — sem ele, todo upload de
  DWG falha na conversão com *"Conversor de DWG não está configurado neste servidor"*
- Backup (recomendado): `ENABLE_BACKUP=1`, `BACKUP_PATH`, `PG_DUMP_PATH` (`...\PostgreSQL\17\bin\pg_dump.exe`),
  `STORAGE_BACKUP_PATH` (opcional — destino do espelho dos arquivos; padrão `BACKUP_PATH\storage`),
  `PG_BIN_PATH` (opcional — pasta bin do Postgres, usada pela restauração para achar o `pg_restore.exe`)

> **Web push (opcional):** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` é lida em **build-time** — defina **antes** do `npm run build`.

---

## 4. Instalar deps + build + banco

```powershell
npm ci                       # instala (e roda prisma generate no postinstall)
npm run build                # build de produção (Turbopack)
npx prisma migrate deploy    # cria TODAS as tabelas a partir das migrations commitadas
npm run db:seed              # admin + permissões + catálogos (idempotente)
```

- ⚠️ Em produção use **`migrate deploy`**, nunca `migrate dev`.
- ⚠️ **Nunca** rode `npm run seed:demo` em produção (apaga dados de negócio).
- Admin inicial criado pelo seed: **tadrio@senaprojetos.com.br / SenaHub@2026** (troca obrigatória no 1º login).

---

## 4.1 ODA File Converter (conversão de DWG)

O visualizador de DWG converte cada `.dwg` enviado para `.dxf` chamando o **ODA File Converter** — um
executável externo, **não** um pacote npm. Ele não vem com o projeto e precisa ser instalado no servidor:

1. Baixe em [opendesign.com](https://www.opendesign.com/guestfiles/oda_file_converter) (gratuito, exige
   cadastro) a versão **Windows x64** e instale.
2. Pegue o caminho **da versão que você instalou** — o número da versão entra no nome da pasta e muda a
   cada release, então não copie o exemplo abaixo às cegas:
   ```powershell
   (Get-ChildItem "C:\Program Files\ODA" -Recurse -Filter ODAFileConverter.exe).FullName
   ```
3. Ponha no `.env` **sem aspas**, mesmo com espaços no caminho:
   ```
   ODA_CONVERTER_PATH=C:\Program Files\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe
   ```
4. `Restart-Service SenaHub` e reenvie (ou clique em "tentar de novo") num DWG que falhou.

> ⚠️ **Aspa sem par quebra tudo silenciosamente.** O `dotenv` só remove aspas **balanceadas** — se faltar a
> de fechamento, o `"` vira parte do caminho e o spawn morre com `ENOENT`. No log aparece
> `Falha ao iniciar o ODA File Converter: spawn "C:\Program Files\... ENOENT` — repare na aspa antes do `C:`.

> ⚠️ **NÃO defina `QT_QPA_PLATFORM=offscreen`.** O ODA é um app Qt, mas o pacote dele traz **só**
> `qwindows.dll` em `platforms/` — `qoffscreen.dll` não existe ali. Forçar `offscreen` faz o Qt travar em
> erro fatal em vez de sair, e a conversão morre no timeout de 9 min sem gerar nada. O `qwindows` funciona
> normalmente com o serviço em `LocalSystem`/Session 0 (verificado neste servidor em 11/08/2026 via
> `PsExec -s`: exit 0 e `.dxf` gerado). O `AppEnvironmentExtra` correto é só:
> ```powershell
> nssm set SenaHub AppEnvironmentExtra "NODE_ENV=production" "PORT=3000"
> Restart-Service SenaHub
> ```
> Se algum dia o ODA passar a exigir sessão gráfica de fato, a saída é rodar o serviço com uma conta de
> usuário comum — nunca a variável.

> A conversão roda como **job pg-boss** dentro do `server.ts`. Se o serviço estiver parado, o DWG fica
> parado em "na fila" — sem worker, sem erro.

---

## 5. Subir como serviço do Windows (NSSM)

Em um PowerShell **como Administrador**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\SenaHub\app\scripts\instalar-servico.ps1" -Port 3000
Start-Service SenaHub
```
> Use `-NssmPath "C:\nssm\nssm.exe"` se o nssm não estiver no PATH. O `-ExecutionPolicy Bypass`
> não é opcional: a política padrão do Windows recusa rodar `.ps1` de arquivo, e ela vale **por
> processo** — nada na máquina é alterado. Vale para todos os `.ps1` deste runbook.
Teste local: abra `http://localhost:3000` no servidor. Logs em `F:\SenaHub\app\logs`.

---

## 6. Cloudflare Tunnel

```powershell
cloudflared tunnel login                         # abre o navegador; autorize a zona
cloudflared tunnel create senahub                # cria o túnel + credenciais (anote o UUID)
cloudflared tunnel route dns senahub hub.seudominio.com.br   # cria o CNAME no DNS da Cloudflare
```

Crie o `config.yml` (modelo: [deploy/cloudflared-config.example.yml](../deploy/cloudflared-config.example.yml))
no diretório `.cloudflared` do **perfil do sistema** (porque rodará como serviço):

```
C:\Windows\System32\config\systemprofile\.cloudflared\config.yml
```
Preencha `tunnel` (UUID), `credentials-file` (caminho do `UUID.json`) e `hostname`. Depois:

```powershell
cloudflared service install      # instala o cloudflared como serviço lendo o config.yml
Start-Service cloudflared
```

> O `UUID.json` gerado no `tunnel create` fica em `%USERPROFILE%\.cloudflared\` — copie-o para o
> `.cloudflared` do systemprofile (mesma pasta do `config.yml`) para o serviço enxergar.
> WebSocket (chat) passa automaticamente — sem config extra.

---

## 7. Verificação (cutover)

1. Acesse `https://hub.seudominio.com.br` → tela de login.
2. Entre como admin → **troque a senha**.
3. Confirme: cria projeto, abre **Chat** (WebSocket), gera um **PDF** (relatório de máquina em TI → "Baixar PDF" — valida `CHROME_PATH`), faz upload (valida `STORAGE_BASE_PATH`), envia um **`.dwg`** num projeto e espera a conversão terminar (valida `ODA_CONVERTER_PATH` + jobs pg-boss).
4. Se o login falhar / der erro de origem: confira que `BETTER_AUTH_URL` é **idêntico** à origem pública (`https://...`, sem barra no fim) e reinicie: `Restart-Service SenaHub`.

---

## 8. Backups e restauração

São **dois** backups, e você precisa dos dois: o dump do Postgres **não contém arquivo
nenhum**. Restaurar só o banco deixa todo `Upload` apontando para caminho inexistente.

| O quê | Como | Onde cai | Agendado |
|---|---|---|---|
| Banco | `pg_dump -Fc` (`lib/backup.ts`) | `BACKUP_PATH\senahub_<data>.backup` | 03:00 |
| Arquivos | espelho robocopy (`lib/backup-storage.ts`) | `STORAGE_BACKUP_PATH` ou `BACKUP_PATH\storage` | 03:30 |

Ambos exigem `ENABLE_BACKUP=1`. O do banco exige `BACKUP_PATH` + `PG_DUMP_PATH`
(`pg_dump.exe` da v17); o dos arquivos exige `STORAGE_BASE_PATH`. Retenção do banco: 30
dias (`.backup` e `.dump` legado). O espelho de arquivos é **aditivo** — copia o que mudou e
nunca apaga no destino, então um arquivo excluído por engano continua recuperável.

O dump do banco primeiro é salvo como `*.backup.partial`, validado com `pg_restore --list`
e calculado em SHA-256; somente então é renomeado para `*.backup`. O job registra o hash
completo no log. Um dump parcial ou inválido não é publicado e é removido ao falhar.

> **Ponha o backup em outro disco.** `BACKUP_PATH` no mesmo volume do `STORAGE_BASE_PATH`
> não protege contra perda de disco. O menu avisa quando detecta isso.

**No dia a dia:** menu de gerenciamento (seção 13) → opção **9. Backup e restauração** —
backup manual do banco, dos arquivos, ou dos dois; listar/verificar; e as duas restaurações.

### 8.1 Restaurar o banco

`scripts/restaurar-backup.ts` (chamado pela opção 9 → 5 do menu) segue uma ordem fixa:
**valida** o dump com `pg_restore --list` → **para** o SenaHub → grava uma **cópia de
segurança do estado atual** (aborta se ela falhar) → `DROP`/`CREATE` → `pg_restore` →
`migrate deploy` → sobe o serviço. Se a restauração falhar, o serviço fica parado de
propósito e o caminho da cópia de segurança é impresso — é o caminho de volta.

Dois detalhes deliberados: o schema `pgboss` é **excluído** (senão a fila de jobs volta
congelada na hora do backup e dispara ao subir; `boss.start()` recria limpa — use
`--com-pgboss` para manter), e a restauração **recusa** `-Confirmar`: não pode ser
disparada pela GUI nem por automação, só com a palavra digitada no console do servidor.

Direto pela linha de comando, se preferir:

```powershell
Stop-Service SenaHub
npx tsx --tsconfig tsconfig.server.json scripts/restaurar-backup.ts "F:\backups\senahub_20260808_030000.backup"
npx prisma migrate deploy
Start-Service SenaHub
```

### 8.2 Restaurar os arquivos

Opção 9 → 6 do menu: robocopy do espelho de volta para `STORAGE_BASE_PATH`, com o SenaHub
parado. Sobrescreve arquivos de mesmo nome e mantém os que só existem no destino.

### 8.3 Ensaiar antes (recomendado)

Para conferir dado real ou ensaiar uma migration destrutiva **sem tocar em produção**, use
`scripts/restaurar-snapshot-prod.ts`, que restaura num banco descartável e se recusa a
escrever no banco em uso (Central do Desenvolvedor → Banco de dados → 9 → 4). Um dump de
produção tem dado pessoal real (CPF, salário, hash de senha) — apague banco e arquivo ao
terminar.

---

## 9. Atualizações futuras (nova versão)

```powershell
cd F:\SenaHub\app
Stop-Service SenaHub
git pull
npm ci
npm run build
npx prisma migrate deploy     # aplica só migrations novas (não destrutivo)
Start-Service SenaHub
```
Nunca `migrate dev`/`seed:demo` em produção. `migrate deploy` só aplica o que já foi commitado.

> No dia a dia, prefira o menu de gerenciamento (seção 13) — a opção 10 faz exatamente esse
> fluxo (com backup automático antes da migration), ou automatize com a seção 10.

---

## 10. Deploy automático noturno (opcional)

Depois que o backup diário (seção 8, agendado internamente para as 03:00) estiver confiável, dá
pra automatizar a atualização: `deploy/gerenciar-servidor.ps1 -Acao DeployAutomatico` roda a
mesma sequência da opção 10 do menu (git pull → build → backup → migrate → restart), mas sem
nenhuma pergunta interativa — pensado pra rodar sozinho via Windows Task Scheduler. Só mexe no
serviço se houver commit novo em `master`; em noites sem mudança, sai sem downtime nenhum.

**Pré-requisito — libere o repositório para o SYSTEM:**
```powershell
git config --system --add safe.directory F:/Senahub/app
```
A tarefa roda como **SYSTEM**, e o git recusa repositório de outro dono (*"detected dubious
ownership"*). Sem isso o deploy automático morre no primeiro comando git, toda noite. Tem que ser
`--system` (vale para todos os usuários) — `--global` só valeria para quem digitou o comando, que é
justamente quem não tem o problema.

**Instalar (uma vez, como Administrador):**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\SenaHub\app\deploy\instalar-tarefa-atualizacao.ps1"
```
Agenda para **04:00**; acrescente `-Hora "04:30"` no fim para outro horário. A tarefa registrada já
chama o PowerShell com `-ExecutionPolicy Bypass`, então ela roda sem depender da política da máquina.

> ⚠️ **Não marque para 03:30.** O deploy **para** o serviço SenaHub, e o pg-boss vive dentro dele
> com dois jobs agendados justamente para 03:30 ([lib/jobs.ts](../src/lib/jobs.ts)): o **espelho de
> arquivos** (robocopy) e o alerta de jornadas abertas. Um deploy nesse horário mataria o espelho no
> meio — e ele é o **único** backup dos uploads, já que o dump do Postgres não contém arquivo nenhum
> (seção 8). Às 04:00 o espelho já teve 30 minutos para terminar. O backup do **banco** das 03:00 não
> entra nessa conta: o próprio deploy faz um antes de migrar.

**Testar antes de confiar (não espere o horário agendado):**
```powershell
Start-ScheduledTask -TaskName "SenaHub - Deploy Automatico"
Get-ScheduledTaskInfo -TaskName "SenaHub - Deploy Automatico"   # LastTaskResult deve ser 0
```
Depois, confira `logs\deploy-automatico.log` (saída completa de cada passo) e
`logs\menu-audit.log` (uma linha-resumo por execução).

> ⚠️ **Esse `Start-ScheduledTask` não é um ensaio.** Se houver commit novo, ele para o serviço,
> reconstrói e reinicia de verdade — site fora do ar por alguns minutos. Dispare num horário que
> você aceite isso. Sem commit novo, ele sai em segundos sem tocar no serviço.

**Aviso por e-mail:** se `SMTP_HOST` estiver preenchido no `.env`, cada execução manda um e-mail
(sucesso ou falha) para `DEPLOY_NOTIFY_EMAIL` (ou o admin padrão, se vazio) via
`scripts/notificar-deploy.ts`. Sem SMTP configurado, ele só loga e segue em frente — nunca trava
o deploy.

> ⚠️ **Falha noturna deixa o site parado.** Se `npm ci`, build, backup ou migration falharem, o
> deploy aborta e **não** reverte: o serviço fica parado de propósito, para não subir algo meio
> construído. Às 03:30 isso significa fora do ar até alguém ver. Confirme que o SMTP acima funciona
> **antes** de confiar na automação — sem ele, a falha é silenciosa.

**Fluxo de PR (opcional, recomendado se for automatizar sem supervisão):** o GitHub não deixa o
autor de um PR aprovar o próprio PR, e este repositório é mantido por uma única pessoa — então o
gate de "aprovação" pede uma segunda conta do GitHub (ex.: uma conta separada "servidor"/"deploy")
com acesso de escrita, usada só pra revisar e mesclar PRs abertos pela conta de desenvolvimento.
Configuração (direto no GitHub, manual — não automatizável daqui):
1. Crie a segunda conta e adicione como colaboradora do repositório (permissão *Write*).
2. GitHub → *Settings → Branches → Branch protection rules* → regra para `master`: marque
   *Require a pull request before merging* (+ *Require approvals: 1* se quiser aprovação formal
   e não só revisão a olho antes de mesclar).
3. Daí em diante: todo trabalho vai para uma branch, abre PR pela conta de dev, revisão e merge
   pela conta "servidor". O deploy automático não muda nada — ele continua só puxando `master`,
   que passa a só receber código que já passou por esse fluxo.

---

## 11. SenaHub Manager (GUI de gerenciamento)

Alternativa em janela/bandeja ao `gerenciar-servidor.bat` — mesmas ações (status, logs,
processos, git/deploy, iniciar/parar/reiniciar, backup, reset de senha, reboot), com
indicador de saúde ao vivo na bandeja do Windows. Não substitui `gerenciar-servidor.ps1`:
toda ação que muda estado continua chamando esse script — o app é só a interface.

**Compilar (uma vez, ou sempre que o código do SenaHub Manager mudar):**
```powershell
cd F:\SenaHub\app\deploy\gui\SenaHubManager
dotnet publish -c Release -r win-x64 --self-contained false -o publish
```

**Instalar o início automático (uma vez, como Administrador):**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\SenaHub\app\deploy\instalar-monitor-bandeja.ps1"
```

Depois disso, o SenaHub Manager sobe sozinho (elevado, sem UAC) toda vez que o
administrador fizer logon no servidor. Ícone verde = tudo OK; amarelo = atenção;
vermelho = SenaHub ou banco fora do ar. O `.bat` continua funcionando como alternativa
(ex.: problema de sessão gráfica via RDP).

---

## 12. Troubleshooting

| Sintoma | Causa provável |
|---|---|
| 502 pelo domínio | Serviço `SenaHub` parado, ou `config.yml` apontando para porta errada (deve ser `http://localhost:3000`). |
| Login falha / CSRF | `BETTER_AUTH_URL` ≠ origem pública exata. Ajuste no `.env` e `Restart-Service SenaHub`. |
| Chat não conecta | Serviço parado (o WS vem do mesmo `server.ts`). Cloudflare Tunnel já passa WS. |
| PDF não gera | `CHROME_PATH` errado/ausente. |
| Acessos: erro ao salvar/revelar credencial | `ACESSOS_ENCRYPTION_KEY` ausente ou fora de 32 bytes base64 — o módulo falha fechado de propósito, nunca grava em texto plano. |
| Acessos: "Descriptografia falhou" em credenciais que funcionavam | A chave foi trocada. Restaure a anterior; não há rotação automática nesta versão. |
| "Conversor de DWG não está configurado" | `ODA_CONVERTER_PATH` ausente/errado no `.env` — ver seção 4.1. Se o log mostra `spawn "C:\... ENOENT` (aspa antes do `C:`), é aspa sem par no `.env`. Se mostra um caminho de versão que não existe mais, o ODA foi atualizado e a pasta mudou de nome. |
| DWG fica em "na fila" pra sempre | Serviço parado: o worker pg-boss vive dentro do `server.ts`. |
| DWG estoura o timeout de 9 min sem gerar `.dxf` | `QT_QPA_PLATFORM` definido no `AppEnvironmentExtra` do serviço apontando para um plugin Qt que o ODA não distribui — ver o aviso da seção 4.1. |
| DWG converte mas "não gerou o arquivo de saída" | DWG corrompido ou com conteúdo não suportado; teste o mesmo arquivo direto no ODA pela linha de comando. |
| Upload falha | `STORAGE_BASE_PATH` não existe ou sem permissão de escrita. |
| `.next` corrompido | Nunca rode `npm run dev` no servidor de produção; se ocorrer, apague `.next` e refaça `npm run build`. |
| Serviço preso em `STOP_PENDING` | `Get-CimInstance Win32_Service -Filter "Name='SenaHub'"` para achar o PID, depois `Stop-Process -Id <pid> -Force`. O menu (seção 13, Ferramentas avançadas) automatiza isso. |
| Túnel cloudflared sobe mas o site retorna erro Cloudflare 1033/530 | DNS do hostname aponta para outro tunnel. Confira com `cloudflared tunnel list` (conexões ativas) e reaponte com `cloudflared tunnel route dns --overwrite-dns <tunnel> <hostname>`. |
| `cloudflared service install` nativo crasha silenciosamente (exit 1067, log vazio) | Reinstale o serviço via NSSM chamando `cloudflared.exe tunnel --config <config.yml> run` explicitamente (veja `deploy/gerenciar-servidor.ps1` como referência) em vez do modo nativo sem argumentos. |
| Esqueceu a senha do `postgres` (superusuário) | Procedimento manual de "quebrar o vidro": editar `pg_hba.conf` (trocar `scram-sha-256` para `trust` nas linhas `local`/`host ... 127.0.0.1`/`host ... ::1`), reiniciar o serviço `postgresql-x64-17`, resetar a senha via `ALTER USER`, reverter o `pg_hba.conf` e reiniciar de novo. **Não automatize isso** — desliga a autenticação por senha do cluster inteiro enquanto ativo. |

---

## 13. Menu de gerenciamento do dia a dia

Para operar o servidor no dia a dia (ligar/desligar/reiniciar, ver status, ver logs, diagnosticar
problemas comuns, backup manual, atualizar/deploy, testes de fumaça, recuperação de serviço
travado, reset de senha do admin, reboot), use:

```powershell
deploy\gerenciar-servidor.bat
```

É um menu interativo — as opções de leitura (status, logs, ajuda) funcionam sem admin; ações que
mexem em serviços do Windows pedem para rodar como Administrador. A opção **13** do menu tem uma
tela de ajuda explicando cada item. A lógica mais pesada fica em `deploy/gerenciar-servidor.ps1`
(chamado pelo `.bat`) — todas as ações que alteram estado ficam registradas em
`logs\menu-audit.log`.

Diferente do `deploy-servidor.bat` (que é só para a primeira subida do servidor), este menu é
para ser usado repetidamente. Ele **não** expõe `npm run seed:demo` (apaga dados de negócio) nem
automatiza a recuperação de senha do Postgres — esses dois ficam de fora de propósito.

---

## 14. Mover o app para SSD (dados no HDD)

Se o servidor tiver o app num **HDD** e o `next build` ficar lento (preso na fase
`checking validity of types`, com `⚠ Slow filesystem detected`), a solução é rodar o app a partir
do **SSD** mantendo uploads/backups no HDD (mais espaço). Runbook one-time dedicado, pensado para
ser executado por Claude Code **no próprio servidor**:

**[docs/migracao-ssd-storage.md](migracao-ssd-storage.md)**

Resumo: código + `node_modules` + `.next` → SSD; `STORAGE_BASE_PATH` + `BACKUP_PATH` → HDD (mesma
pasta de storage atual, para os uploads existentes resolverem). Recria o serviço NSSM no novo path;
`cloudflared` não muda. ⚠️ `BACKUP_PATH` tem que ser setado explícito (default cai no cwd/SSD) e o
`BETTER_AUTH_SECRET` deve ser reaproveitado (não gerar novo).
