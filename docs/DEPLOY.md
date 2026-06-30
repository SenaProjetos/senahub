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

---

## 10. Troubleshooting

| Sintoma | Causa provável |
|---|---|
| 502 pelo domínio | Serviço `SenaHub` parado, ou `config.yml` apontando para porta errada (deve ser `http://localhost:3000`). |
| Login falha / CSRF | `BETTER_AUTH_URL` ≠ origem pública exata. Ajuste no `.env` e `Restart-Service SenaHub`. |
| Chat não conecta | Serviço parado (o WS vem do mesmo `server.ts`). Cloudflare Tunnel já passa WS. |
| PDF não gera | `CHROME_PATH` errado/ausente. |
| Upload falha | `STORAGE_BASE_PATH` não existe ou sem permissão de escrita. |
| `.next` corrompido | Nunca rode `npm run dev` no servidor de produção; se ocorrer, apague `.next` e refaça `npm run build`. |
