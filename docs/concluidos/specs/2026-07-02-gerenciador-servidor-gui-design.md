# Gerenciador do Servidor (GUI) — Design

> **Data:** 2026-07-02
> **Origem:** pedido do usuário, no fim de uma sessão que corrigiu o bug de fuso em `formatarData`
> (`src/lib/utils.ts`), consertou o próprio deploy (`Invoke-DeployCompleto` não parava o serviço
> antes do `npm ci`, travando em `EPERM` no binário do SWC) e construiu o deploy automático noturno
> (`Invoke-DeployAutomatico` + `deploy/instalar-tarefa-atualizacao.ps1` + `scripts/notificar-deploy.ts`).
> Depois de mexer bastante no `deploy/gerenciar-servidor.bat`, o usuário perguntou pela viabilidade
> de um `.exe` de gerenciamento com log/processos/git embutidos em vez do menu de texto.

## 1. O que é

Uma aplicação **desktop Windows (C#/.NET, WinForms)** que substitui o `deploy/gerenciar-servidor.bat`
como ferramenta do dia a dia para administrar o servidor SenaHub: dashboard visual de status,
visualização de logs ao vivo, lista de processos com ação de encerrar, e painel de Git/deploy —
tudo com indicação de saúde em tempo real, inclusive um ícone na bandeja do Windows que muda de
cor se algo cair, sem precisar abrir a janela.

**Não substitui** a engine — `deploy/gerenciar-servidor.ps1` continua sendo a única fonte de
verdade para qualquer ação que muda estado (start/stop de serviço, deploy, backup, migration,
reset de senha, reboot). O `.exe` é uma cara nova por cima, não uma reescrita da lógica arriscada.
O `.bat` continua existindo, sem ser mais o principal, como fallback (ex.: problema de sessão
gráfica no RDP).

## 2. Decisões confirmadas com o usuário (2026-07-02)

- **Linguagem/stack:** C#/.NET (WinForms), não PowerShell+WinForms nem Node/Electron — decisão
  explícita do usuário, mesmo com o trade-off de introduzir um segundo toolchain (`.NET SDK`)
  separado do resto do repositório (Next.js/TypeScript).
- **Escopo:** substituir o `.bat` por completo — todas as ações do menu atual (13 opções, incl.
  as que mexem em serviço: iniciar/parar/reiniciar, deploy, backup, reboot), não só um painel
  read-only.
- **Painel Git/Deploy:** (1) status do repo (branch, commit atual, ahead/behind de `origin`,
  sujo/limpo), (2) histórico do deploy automático noturno (últimas execuções, sucesso/falha,
  próxima agendada), (3) botão "Atualizar agora" que dispara o mesmo fluxo de deploy.
- **Elevação:** o `.exe` inteiro roda como Administrador (manifesto `requireAdministrator`) — um
  UAC só ao abrir, sem pedir de novo a cada ação (diferente do `.bat`, que pede por ação).
- **Logs no painel:** os quatro arquivos — `senahub.out/err.log`, log do cloudflared,
  `deploy-automatico.log`, `menu-audit.log` — com seleção/abas, atualização ao vivo.
- **Painel de processos:** lista de processos node/cloudflared/postgres com PID, horário de
  início, **CPU e memória**, portas 3000/5432, e **botão de encerrar processo travado** (com
  confirmação) — mais completo que o menu atual (que só lista, sem métricas nem ação).
- **Modo de uso:** fica **residente na bandeja o tempo todo**, com ícone mudando de cor
  (verde/amarelo/vermelho) conforme a saúde — não é "abre quando precisa e fecha".
- **Início automático:** via tarefa agendada com gatilho "ao fazer logon" + "executar com
  privilégios mais altos" (mesmo padrão de `deploy/instalar-tarefa-atualizacao.ps1`), não atalho
  na pasta Inicializar — evita repetir o UAC a cada boot/login.
- **Empacotamento:** `dotnet publish` **framework-dependent** (exe leve, mas exige o **.NET
  Desktop Runtime** instalado no servidor) — escolha explícita do usuário, priorizando o exe
  mais leve sobre não precisar instalar nada extra (self-contained, ~70-100 MB, descartado).

## 3. Arquitetura

Princípio central: **leitura nativa em C#, ação via `gerenciar-servidor.ps1` existente.**

- **Leituras/telas** (status de serviço, processos, conteúdo de log, status do git) —
  implementadas nativas em C#, porque atualizam a cada poucos segundos e chamar PowerShell a
  cada tick de UI seria pesado e lento:
  - Serviços: `System.ServiceProcess.ServiceController`.
  - Processos/portas: `System.Diagnostics.Process` (+ `PerformanceCounter` ou delta de
    `TotalProcessorTime` para CPU%) e `System.Net.NetworkInformation.IPGlobalProperties` para
    portas em escuta.
  - Logs: leitura incremental (seek a partir do último offset lido) + `FileSystemWatcher` para
    detectar novas linhas, sem reler o arquivo inteiro a cada refresh.
  - Git: `git rev-parse HEAD`, `git rev-parse --abbrev-ref HEAD`, `git status --porcelain`,
    `git rev-list --left-right --count HEAD...origin/master` (ahead/behind) via
    `System.Diagnostics.Process.Start("git", ...)` — leitura simples, não precisa do `.ps1`.
  - Histórico de deploy: parse de `logs/deploy-automatico.log` e `logs/menu-audit.log`.
- **Ações que mudam algo** (start/stop/restart de serviço, deploy completo, backup manual,
  migrations, reset de senha do admin, reboot, forçar encerramento de serviço travado, corrigir
  build corrompido) — o app **chama o PowerShell existente**:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy\gerenciar-servidor.ps1 -Acao X`,
  capturando stdout/stderr para exibir na tela enquanto roda. **Nenhuma dessas ações é
  reimplementada em C#** — continuam com uma única fonte de verdade testada.
- Esta separação é o que evita duplicar a lógica arriscada mesmo optando pela reescrita em C#
  em vez de PowerShell+WinForms (Opção A, que foi cogitada e descartada nesta sessão).

## 4. UI

### Janela principal (abas)

| Aba | Conteúdo |
|---|---|
| **Status** | Serviços (SenaHub/cloudflared/postgresql-x64-17), porta 3000, URL pública, autenticação do banco — cada item com indicador verde/vermelho, atualização por timer (poll a cada poucos segundos). |
| **Logs** | Seletor dos 4 arquivos (SenaHub out/err, cloudflared, deploy automático, auditoria); painel com tail ao vivo, auto-scroll, texto de erro destacado. |
| **Processos** | Lista (PID, nome, início, CPU%, memória) dos processos node/cloudflared/postgres; portas 3000/5432 e quem as usa; botão "Encerrar" com confirmação. |
| **Git / Deploy** | Branch, commit atual (hash curto + mensagem), ahead/behind de `origin/master`, sujo/limpo; histórico das últimas execuções do deploy automático (data, resultado, commit); botão "Atualizar agora" (dispara `-Acao DeployCompleto` ou `DeployAutomatico`, mostrando saída ao vivo). |
| **Ações** | Botões para o restante do menu atual: iniciar/parar todos os serviços, reiniciar SenaHub, reiniciar túnel, backup manual, testes de fumaça, reset de senha do admin, reboot do servidor, forçar encerramento de serviço travado, corrigir build corrompido — cada um com o mesmo nível de confirmação que já existe no `.bat`/`.ps1` (`Confirm-Typed` equivalente: caixa de diálogo pedindo para digitar a palavra de confirmação nas ações mais destrutivas, como reboot). |

### Bandeja (`NotifyIcon`)

- Sempre presente enquanto a sessão do Windows estiver ativa.
- Cor: verde (tudo OK) / amarelo (degradado — ex. 1 serviço não-crítico com problema) / vermelho
  (SenaHub ou banco fora do ar).
- Tooltip com resumo de 1 linha do problema, se houver.
- Menu do botão direito: Abrir, Reiniciar SenaHub, Sair.
- Duplo clique abre a janela principal.

## 5. Elevação e início automático

- `app.manifest` com `<requestedExecutionLevel level="requireAdministrator" uiAccess="false" />`
  — Windows pede UAC uma vez, ao abrir; depois disso toda ação (inclusive `Start-Service`/
  `Stop-Service` chamadas nativamente, se alguma leitura precisar) já roda elevada.
- Autostart: novo script `deploy/instalar-monitor-bandeja.ps1` (mesmo padrão de
  `instalar-tarefa-atualizacao.ps1`) registra uma tarefa agendada com gatilho **"ao fazer logon"**
  do usuário administrador da sessão, **"executar com privilégios mais altos"** — evita o UAC
  reaparecer a cada boot/login (diferente de um atalho simples na pasta Inicializar, que pediria
  UAC de novo toda vez).

## 6. Projeto e build

- Novo diretório `deploy/gui/SenaHubManager/`, projeto WinForms `net8.0-windows`
  (`SenaHubManager.csproj`), separado do restante do repositório (Next.js/TypeScript) — mesma
  lógica de isolamento que `deploy/`/`scripts/` já têm em relação ao app principal.
- Estrutura esperada: `Program.cs` (entrada + tray), `Forms/MainForm.cs` (+ designer/resx),
  classes de suporte (`ServicoStatus.cs`, `LogTailer.cs`, `GitInfo.cs`, `DeployRunner.cs` —
  wrapper do shell-out pro PowerShell, `ProcessoInfo.cs`).
- Build: `dotnet publish -c Release -r win-x64 --self-contained false` (framework-dependent).
  **Pré-requisito novo no servidor:** .NET 8 Desktop Runtime (`winget install
  Microsoft.DotNet.DesktopRuntime.8`) — precisa entrar na tabela de pré-requisitos do
  `docs/DEPLOY.md` (seção 0), junto de Node/PostgreSQL/NSSM/cloudflared. .NET SDK só é necessário
  na máquina onde o projeto é *buildado* (aqui mesmo, já que dev e prod são a mesma máquina).
- `.gitignore`: adicionar `deploy/gui/SenaHubManager/bin/` e `deploy/gui/SenaHubManager/obj/`
  (artefatos de build do .NET, equivalente ao `/node_modules` do projeto principal).

## 7. Fora de escopo (por enquanto)

- Testes automatizados de UI (não há suíte equivalente ao Vitest para WinForms neste projeto;
  ver seção 8).
- Autenticação/proteção de acesso ao próprio `.exe` — assume-se que só quem já tem acesso físico/
  RDP com conta administradora no servidor abre a ferramenta (mesma premissa do `.bat` hoje).
- Notificação por e-mail/push a partir do `.exe` — já existe via `scripts/notificar-deploy.ts`
  no fluxo de deploy automático; o `.exe` não duplica isso, só mostra visualmente.
- Multi-servidor / gerenciar mais de uma instância do SenaHub a partir do mesmo `.exe` — este
  projeto é mono-servidor por design (ver `CLAUDE.md`).

## 8. Verificação

Sem suíte automatizada de UI. Verificação principal é manual, ponto a ponto:

1. Abrir o `.exe` → confirma UAC único, sem pedir de novo.
2. Aba Status → cores batem com `Get-Service`/`Invoke-Status` do `.ps1`.
3. Aba Logs → conteúdo bate com `Get-Content -Tail` de cada arquivo; nova linha aparece sem
   precisar reabrir.
4. Aba Processos → lista bate com `Get-Process`/`Invoke-ProcessosPortas`; botão "Encerrar" num
   processo de teste (não crítico) realmente termina o processo.
5. Aba Git/Deploy → branch/commit/ahead-behind batem com `git status`/`git log`; botão
   "Atualizar agora" dispara o mesmo fluxo já testado manualmente na sessão anterior
   (`Invoke-DeployCompleto`), com saída visível.
6. Bandeja → forçar um serviço parado (`net stop SenaHub` manual) e confirmar que o ícone fica
   vermelho em poucos segundos, sem precisar abrir a janela.
7. Reiniciar o servidor (ou logoff/logon) → confirmar que o `.exe` sobe sozinho, elevado, sem UAC.
8. Testes unitários (xUnit, opcional) só para funções puras de parsing sem I/O direto — ex.:
   interpretar uma linha de `deploy-automatico.log` em `(timestamp, mensagem)`, interpretar a
   saída de `git status --porcelain` em `(sujo: bool)`.
