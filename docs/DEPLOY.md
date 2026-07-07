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
git checkout main   # ou a branch publicada
```
> Não copie `.env`, `node_modules` nem `.next` da máquina de dev — serão recriados aqui.

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
- `CHROME_PATH` = `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Backup (recomendado): `ENABLE_BACKUP=1`, `BACKUP_PATH`, `PG_DUMP_PATH` (`...\PostgreSQL\17\bin\pg_dump.exe`)

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

## 5. Subir como serviço do Windows (NSSM)

Em um PowerShell **como Administrador**:

```powershell
cd F:\SenaHub\app
.\scripts\instalar-servico.ps1 -Port 3000        # use -NssmPath "C:\nssm\nssm.exe" se não estiver no PATH
Start-Service SenaHub
```
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
3. Confirme: cria projeto, abre **Chat** (WebSocket), gera um **PDF** (relatório de máquina em TI → "Baixar PDF" — valida `CHROME_PATH`), faz upload (valida `STORAGE_BASE_PATH`).
4. Se o login falhar / der erro de origem: confira que `BETTER_AUTH_URL` é **idêntico** à origem pública (`https://...`, sem barra no fim) e reinicie: `Restart-Service SenaHub`.

---

## 8. Backups

Com `ENABLE_BACKUP=1` + `BACKUP_PATH` + `PG_DUMP_PATH`, o pg-boss roda o backup agendado
(`lib/jobs-handlers.ts`) gravando dumps em `BACKUP_PATH`. Verifique que o `pg_dump.exe` da
versão 17 está no `PG_DUMP_PATH` e que a pasta existe.

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

**Instalar (uma vez, como Administrador):**
```powershell
cd F:\SenaHub\app
.\deploy\instalar-tarefa-atualizacao.ps1        # agenda para 03:30; use -Hora "04:00" p/ outro horário
```

**Testar antes de confiar (não espere o horário agendado):**
```powershell
Start-ScheduledTask -TaskName "SenaHub - Deploy Automatico"
Get-ScheduledTaskInfo -TaskName "SenaHub - Deploy Automatico"   # LastTaskResult deve ser 0
```
Depois, confira `logs\deploy-automatico.log` (saída completa de cada passo) e
`logs\menu-audit.log` (uma linha-resumo por execução).

**Aviso por e-mail:** se `SMTP_HOST` estiver preenchido no `.env`, cada execução manda um e-mail
(sucesso ou falha) para `DEPLOY_NOTIFY_EMAIL` (ou o admin padrão, se vazio) via
`scripts/notificar-deploy.ts`. Sem SMTP configurado, ele só loga e segue em frente — nunca trava
o deploy.

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
cd F:\SenaHub\app
.\deploy\instalar-monitor-bandeja.ps1
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
