# Migração — App no SSD, dados no HDD

Runbook **one-time** para tirar o SenaHub de um HDD lento e rodar o app a partir do SSD,
**mantendo uploads e backups no HDD** (que tem mais espaço). Feito para ser executado por
Claude Code **na própria máquina de produção** — daqui (dev) não dá pra tocar no disco do servidor.

> ⚠️ É **produção**. Move o app e para o serviço → **downtime**. Rode em horário calmo e
> **confirme antes** de parar o serviço, apagar ou sobrescrever qualquer coisa.

---

## Por que

`next build` ficou preso minutos na fase `Linting and checking validity of types` (o `tsc`).
Diagnóstico no Gerenciador de Tarefas: **CPU ~10%** (não travado, I/O-bound) e o build gritou
`⚠ Slow filesystem detected`. Os discos: **Disco 0 (F:) = HDD a 44%**, **Disco 1 (C:/G:) = SSD a 0%**.
O projeto está no HDD; o typecheck lê milhares de arquivos pequenos → seek aleatório de HDD é o
gargalo. SSD resolve ~90%.

## Princípio do layout

| Vai pro **SSD** (quente, pequeno, ~3-5 GB) | Fica no **HDD** (frio, grande, dezenas de GB) |
|---|---|
| código do projeto | uploads (`STORAGE_BASE_PATH`) |
| `node_modules` | backups (`BACKUP_PATH`, dumps `pg_dump`) |
| `.next` (build/typecheck) | *(opcional)* data dir do PostgreSQL só se o SSD tiver folga |

O código **já** separa isso: uploads passam por `src/lib/storage.ts` (`resolverCaminho()`,
guarda anti-traversal) ancorado em `STORAGE_BASE_PATH`; backups em `BACKUP_PATH`. Nenhum caminho
é hardcoded — é só variável de ambiente.

---

## Gotchas que causam perda de dados / erro

1. **`STORAGE_BASE_PATH` é obrigatório e a pasta precisa existir** — `storage.ts` joga
   `throw new Error("STORAGE_BASE_PATH não configurado.")` se faltar (captura no load do módulo).
2. **`BACKUP_PATH` tem default `./backups` (= cwd)** — `backup.ts:27`. Se mover o app pro SSD e
   **esquecer** de setar `BACKUP_PATH`, os dumps caem no SSD e **enchem** ele. Sempre aponte
   explícito pro HDD.
3. **Uploads existentes:** aponte `STORAGE_BASE_PATH` para a **mesma** pasta de storage atual no
   HDD. Os arquivos guardam caminho **relativo** sob `BASE` → resolvem sozinhos. **Não mova** os
   arquivos, só mantenha o path.
4. **Nunca** `npm run dev` no servidor de produção (corrompe `.next`). Se ocorrer: apagar `.next` +
   `npm run build`.

---

## Pré-checagem

```powershell
# Espaço livre nos discos (garanta ~5 GB livres no SSD alvo)
Get-Volume | Select-Object DriveLetter, FileSystemLabel,
  @{n='LivreGB';e={[math]::Round($_.SizeRemaining/1GB,1)}},
  @{n='TotalGB';e={[math]::Round($_.Size/1GB,1)}}

# Confirme a letra do SSD (no diagnóstico: Disco 1 = C:/G:). Escolha o destino, ex. C:\SenaHub\app.
```

---

## Passos

Assumindo origem `F:\SenaHub\app` (HDD) → destino `C:\SenaHub\app` (SSD). Ajuste as letras.

### 1. Atualizar o checkout atual
O build mostrou `senahub@0.1.0` — o checkout do servidor pode estar **desatualizado**. Antes de
migrar, alinhe com `master`:
```powershell
cd F:\SenaHub\app
git status          # tem que estar limpo
git pull            # traz o master publicado
```

### 2. Parar o serviço  — **CONFIRMAR antes**
```powershell
Stop-Service SenaHub
Stop-Service cloudflared   # opcional; pode deixar de pé (retorna 502 até o app voltar)
```

### 3. Copiar o app pro SSD (sem os artefatos regeneráveis)
Clone limpo é o mais seguro (evita arrastar `.next`/`node_modules` do HDD):
```powershell
git clone <URL_DO_REPO> C:\SenaHub\app
cd C:\SenaHub\app
git checkout master
```
*(Alternativa sem rede: `robocopy F:\SenaHub\app C:\SenaHub\app /E /XD node_modules .next .git\` +
`git` — mas o clone é mais limpo.)*

### 4. Garantir as pastas de dados no HDD (têm que existir)
```powershell
New-Item -ItemType Directory -Force F:\SenaHub\storage   # se ainda não existir
New-Item -ItemType Directory -Force F:\SenaHub\backups
```
Se já existe storage com uploads (ex. `F:\SenaHub\app\storage` antigo), **use essa pasta** no
`STORAGE_BASE_PATH` — não recrie nem mova.

### 5. `.env` no destino (SSD)
Copie o `.env` de produção do path antigo e ajuste só os caminhos de dados:
```powershell
Copy-Item F:\SenaHub\app\.env C:\SenaHub\app\.env
notepad C:\SenaHub\app\.env
```
```ini
# HDD — grande/frio
STORAGE_BASE_PATH=F:\SenaHub\storage      # a pasta de uploads existente
BACKUP_PATH=F:\SenaHub\backups            # OBRIGATÓRIO setar (default cairia no SSD e encheria)

# inalterados
DATABASE_URL=postgresql://...@localhost:5432/senahub
PG_DUMP_PATH=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
BETTER_AUTH_URL=https://hub.seudominio.com.br
APP_URL=https://hub.seudominio.com.br
BETTER_AUTH_SECRET=...                    # o MESMO de antes (não gerar novo — invalidaria sessões)
```
> ⚠️ Não gere `BETTER_AUTH_SECRET` novo — derruba todas as sessões. Reaproveite o de produção.

### 6. Build no SSD
```powershell
cd C:\SenaHub\app
npm ci                       # instala + prisma generate (postinstall)
npm run build                # agora rápido — I/O no SSD
```
*(Sem migration aqui: é o mesmo banco. Só rode `npx prisma migrate deploy` se o `git pull` do
passo 1 trouxe migrations novas.)*

### 7. Reapontar o serviço do Windows pro novo path
O serviço NSSM aponta pro diretório antigo (`F:`). Recrie a partir do SSD:
```powershell
# como Administrador
Stop-Service SenaHub -ErrorAction SilentlyContinue
nssm remove SenaHub confirm          # ou: sc.exe delete SenaHub
cd C:\SenaHub\app
.\scripts\instalar-servico.ps1 -Port 3000    # registra Application/AppDirectory no novo path
Start-Service SenaHub
Start-Service cloudflared             # se foi parado no passo 2
```
> `cloudflared`/`config.yml` **não mudam** — apontam pra `http://localhost:3000`, independente do
> disco do app.

### 8. Validação (cutover)
1. `http://localhost:3000` no servidor → login OK.
2. `GET /api/health` → confere `STORAGE_BASE_PATH` reportado (deve ser o path do HDD).
3. Login pelo domínio público; abre **Chat** (WebSocket); gera um **PDF** (valida `CHROME_PATH`);
   faz **upload** de teste (valida `STORAGE_BASE_PATH` → tem que gravar no HDD).
4. Confere que um **upload antigo** ainda abre (prova que o path do storage resolveu).
5. Dispara um **backup manual** (menu `deploy\gerenciar-servidor.bat`) → dump aparece em
   `F:\SenaHub\backups` (não no SSD).

### 9. Só depois de validar: aposentar o path antigo
Mantenha `F:\SenaHub\app` alguns dias como rollback. Quando estável, apague **só** o app antigo —
**nunca** `F:\SenaHub\storage` / `F:\SenaHub\backups` (são os dados vivos).

---

## Rollback

Se algo falhar no cutover:
```powershell
Stop-Service SenaHub
nssm remove SenaHub confirm
cd F:\SenaHub\app                    # volta pro path antigo (HDD)
.\scripts\instalar-servico.ps1 -Port 3000
Start-Service SenaHub
```
Dados intactos: o banco e o storage nunca foram movidos.

---

## Opcional — mover o data dir do PostgreSQL pro SSD

Ganho grande **depois** do app, se o SSD tiver folga. Mais invasivo (mexe no cluster):
1. `Stop-Service postgresql-x64-17`
2. `robocopy "C:\Program Files\PostgreSQL\17\data" "G:\pgdata" /E /COPYALL` (destino no SSD)
3. Editar `data_directory` no `postgresql.conf` **ou** o `-D` no registro do serviço para `G:\pgdata`
4. `Start-Service postgresql-x64-17` e validar (`psql`, depois um login no app)
5. Só então apagar o data dir antigo.

Se o SSD estiver apertado, **deixe o banco no HDD** — funciona, só query mais lenta. O maior ganho
já vem de `node_modules`/`.next`/código no SSD.

---

## Checklist rápido

- [ ] `git pull` no checkout antigo (estava em `0.1.0`)
- [ ] Serviço parado (confirmado)
- [ ] App clonado no SSD, sem `node_modules`/`.next`
- [ ] `F:\SenaHub\storage` e `F:\SenaHub\backups` existem
- [ ] `.env`: `STORAGE_BASE_PATH` (HDD), `BACKUP_PATH` (HDD, **setado**), `BETTER_AUTH_SECRET` reaproveitado
- [ ] `npm ci` + `npm run build` no SSD
- [ ] Serviço recriado apontando pro SSD
- [ ] Health / login / chat / PDF / upload novo / upload antigo / backup manual validados
- [ ] Path antigo do app mantido alguns dias, dados do HDD intocados
