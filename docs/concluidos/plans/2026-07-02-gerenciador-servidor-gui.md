# Gerenciador do Servidor (GUI C#/WinForms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir `deploy/gerenciar-servidor.bat` por um aplicativo desktop Windows (C#/.NET 8, WinForms) com dashboard de status, logs ao vivo, processos e painel Git/deploy, residente na bandeja com indicador de saúde.

**Architecture:** Leituras/telas nativas em C# (serviços, processos, logs, git) atualizadas por timer/watcher; qualquer ação que muda estado (start/stop, deploy, backup, migration, reset de senha, reboot) chama `powershell.exe -File deploy\gerenciar-servidor.ps1 -Acao X` — o `.ps1` continua sendo a única fonte de verdade para lógica arriscada, nada é reimplementado em C#.

**Tech Stack:** .NET 8 SDK, WinForms (`net8.0-windows`), xUnit para testes de funções puras de parsing. Projeto novo e isolado em `deploy/gui/`, sem relação com o build Next.js/TypeScript do app principal.

## Global Constraints

- Namespace raiz: `SenaHubManager`. Idioma do código/comentários: identificadores em inglês quando genéricos, mas nomes de domínio e strings de UI em português (mesma convenção do resto do repo — ver `CLAUDE.md`).
- Nenhuma ação que muda estado (start/stop serviço, deploy, backup, migration, reset de senha, reboot, matar processo do SenaHub/cloudflared) é reimplementada em C# — sempre chama `gerenciar-servidor.ps1` via `PowerShellActionRunner`, EXCETO "encerrar processo travado" na aba Processos, que é uma ação nova (não existe equivalente no `.ps1` para processos arbitrários) e usa `Process.Kill()` diretamente, com confirmação.
- Caminho do script PS1 é sempre resolvido relativo à raiz do projeto (`deploy/gui/SenaHubManager/bin/.../..`  não serve — resolver via `AppContext.BaseDirectory` subindo até achar `gerenciar-servidor.ps1`, ver Task 8).
- `.env` fica em `F:\Senahub\app\.env` (mesma raiz do projeto Next.js) — todas as leituras de configuração (APP_URL, DATABASE_URL, PG_DUMP_PATH) passam por `EnvFileReader` (Task 2), nunca hardcoded.
- Build framework-dependent (`dotnet publish -r win-x64 --self-contained false`) — decisão confirmada na spec; requer .NET 8 Desktop Runtime instalado no servidor (Task 1 instala o SDK completo, que já inclui o runtime).
- Toda função com lógica de parsing (git, logs, netstat, DATABASE_URL) deve ser uma função **pura e testável**, separada do código que faz I/O (shell-out, leitura de arquivo) — mesmo padrão de separação já usado no resto do repo (`lib/*.ts` puro vs `queries.ts`/`actions.ts` com I/O).

---

## Task 1: Instalar .NET SDK e criar o projeto (scaffold)

**Files:**
- Create: `deploy/gui/SenaHubManager/` (via `dotnet new winforms`)
- Create: `deploy/gui/SenaHubManager.Tests/` (via `dotnet new xunit`)
- Modify: `.gitignore`

**Interfaces:**
- Produces: projeto WinForms compilável (`SenaHubManager.csproj`) e projeto de testes (`SenaHubManager.Tests.csproj`) com `ProjectReference` para o primeiro.

- [ ] **Step 1: Instalar o .NET 8 SDK (se ainda não estiver instalado)**

Verificado nesta sessão que `dotnet` não existe na máquina. Rodar (como Administrador, ou onde `winget` já funcione):

```powershell
winget install Microsoft.DotNet.SDK.8 --accept-source-agreements --accept-package-agreements
```

Fechar e reabrir o terminal depois (PATH é atualizado só em sessões novas), depois confirmar:

```powershell
dotnet --version
```

Expected: imprime uma versão `8.x.x`.

- [ ] **Step 2: Criar a pasta e o projeto WinForms**

```powershell
mkdir F:\Senahub\app\deploy\gui -Force
cd F:\Senahub\app\deploy\gui
dotnet new winforms -n SenaHubManager -o SenaHubManager
```

Expected: cria `SenaHubManager/SenaHubManager.csproj`, `Program.cs`, `Form1.cs` (+ `.Designer.cs`, `.resx`).

- [ ] **Step 3: Adicionar o pacote ServiceController (necessário pra checar serviços Windows na Task 5)**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet add package System.ServiceProcess.ServiceController
```

Expected: `SenaHubManager.csproj` ganha uma linha `<PackageReference Include="System.ServiceProcess.ServiceController" ... />`.

- [ ] **Step 4: Build inicial**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 5: Criar o projeto de testes (xUnit) e referenciar o projeto principal**

```powershell
cd F:\Senahub\app\deploy\gui
dotnet new xunit -n SenaHubManager.Tests -o SenaHubManager.Tests
cd SenaHubManager.Tests
dotnet add reference ..\SenaHubManager\SenaHubManager.csproj
```

- [ ] **Step 6: Editar o TFM do projeto de testes pra combinar com o projeto principal (WinForms é Windows-only)**

Abrir `deploy/gui/SenaHubManager.Tests/SenaHubManager.Tests.csproj` e trocar `<TargetFramework>net8.0</TargetFramework>` por:

```xml
<TargetFramework>net8.0-windows</TargetFramework>
```

- [ ] **Step 7: Rodar os testes de exemplo do template**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 1` (teste de exemplo do template `dotnet new xunit`).

- [ ] **Step 8: Apagar o teste de exemplo e o Form1 padrão, substituindo `Program.cs` por um placeholder mínimo que compila**

O `Program.cs` gerado pelo template chama `new Form1()` — apagar o Form1 sem ajustar `Program.cs` quebraria o build de todas as próximas tasks (que só mexem nas classes de `Services/`, não na UI ainda). Por isso, junto de apagar o Form1, o `Program.cs` vira um placeholder mínimo que só compila e sai — será reescrito de verdade na Task 9.

```powershell
rm F:\Senahub\app\deploy\gui\SenaHubManager.Tests\UnitTest1.cs
rm F:\Senahub\app\deploy\gui\SenaHubManager\Form1.cs
rm F:\Senahub\app\deploy\gui\SenaHubManager\Form1.Designer.cs
rm F:\Senahub\app\deploy\gui\SenaHubManager\Form1.resx
```

Substituir o conteúdo de `deploy/gui/SenaHubManager/Program.cs` por:

```csharp
namespace SenaHubManager;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Console.WriteLine("SenaHubManager - scaffold OK. UI sera adicionada nas proximas tasks.");
    }
}
```

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)` (confirma que apagar o Form1 não quebrou nada).

- [ ] **Step 9: Ignorar artefatos de build do .NET no git**

Adicionar ao final de `F:\Senahub\app\.gitignore`:

```
# .NET (deploy/gui/SenaHubManager — gerenciador com GUI)
deploy/gui/**/bin/
deploy/gui/**/obj/
```

- [ ] **Step 10: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/SenaHubManager.csproj deploy/gui/SenaHubManager.Tests/SenaHubManager.Tests.csproj .gitignore
git commit -m "feat(gui): scaffold do projeto SenaHubManager (WinForms) e testes (xUnit)"
```

---

## Task 2: EnvFileReader (utilitário puro + testes)

**Files:**
- Create: `deploy/gui/SenaHubManager/Services/EnvFileReader.cs`
- Test: `deploy/gui/SenaHubManager.Tests/EnvFileReaderTests.cs`

**Interfaces:**
- Produces: `SenaHubManager.Services.EnvFileReader.Read(string caminho) : Dictionary<string,string>`, `EnvFileReader.Get(string caminho, string chave) : string?` — usado pela Task 5 (`ServicoStatus`) para ler `APP_URL`, `DATABASE_URL`, `PG_DUMP_PATH` do `.env`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `deploy/gui/SenaHubManager.Tests/EnvFileReaderTests.cs`:

```csharp
using SenaHubManager.Services;
using Xunit;

namespace SenaHubManager.Tests;

public class EnvFileReaderTests
{
    [Fact]
    public void Le_pares_chave_valor_ignorando_comentarios_e_linhas_vazias()
    {
        var caminho = Path.GetTempFileName();
        File.WriteAllText(caminho, "# comentario\nDATABASE_URL=\"postgresql://user:pass@localhost:5432/db\"\n\nAPP_URL=\"https://hub.senaprojetos.com.br\"\n");

        var valores = EnvFileReader.Read(caminho);

        Assert.Equal("postgresql://user:pass@localhost:5432/db", valores["DATABASE_URL"]);
        Assert.Equal("https://hub.senaprojetos.com.br", valores["APP_URL"]);
        File.Delete(caminho);
    }

    [Fact]
    public void Get_retorna_null_para_chave_inexistente()
    {
        var caminho = Path.GetTempFileName();
        File.WriteAllText(caminho, "FOO=\"bar\"\n");

        var valor = EnvFileReader.Get(caminho, "NAO_EXISTE");

        Assert.Null(valor);
        File.Delete(caminho);
    }

    [Fact]
    public void Get_retorna_null_se_arquivo_nao_existe()
    {
        var valor = EnvFileReader.Get(@"C:\caminho\que\nao\existe.env", "QUALQUER");
        Assert.Null(valor);
    }

    [Fact]
    public void Desfaz_escape_de_barra_invertida_dupla()
    {
        var caminho = Path.GetTempFileName();
        File.WriteAllText(caminho, "STORAGE_BASE_PATH=\"F:\\\\SenaHub\\\\storage\"\n");

        var valor = EnvFileReader.Get(caminho, "STORAGE_BASE_PATH");

        Assert.Equal(@"F:\SenaHub\storage", valor);
        File.Delete(caminho);
    }
}
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (namespace/classe não existe ainda)**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: erro de compilação `The type or namespace name 'EnvFileReader' could not be found`.

- [ ] **Step 3: Implementar `EnvFileReader`**

Criar `deploy/gui/SenaHubManager/Services/EnvFileReader.cs`:

```csharp
namespace SenaHubManager.Services;

/// <summary>Lê pares chave=valor de um arquivo .env, mesmo formato usado por Get-EnvValue em gerenciar-servidor.ps1.</summary>
public static class EnvFileReader
{
    public static Dictionary<string, string> Read(string caminho)
    {
        var resultado = new Dictionary<string, string>();
        if (!File.Exists(caminho)) return resultado;

        foreach (var linhaBruta in File.ReadAllLines(caminho, System.Text.Encoding.UTF8))
        {
            var linha = linhaBruta.Trim();
            if (linha.Length == 0 || linha.StartsWith('#')) continue;

            var indiceIgual = linha.IndexOf('=');
            if (indiceIgual <= 0) continue;

            var chave = linha[..indiceIgual].Trim();
            var valor = linha[(indiceIgual + 1)..].Trim().Trim('"');
            valor = valor.Replace("\\\\", "\\");

            resultado[chave] = valor;
        }

        return resultado;
    }

    public static string? Get(string caminho, string chave)
    {
        var valores = Read(caminho);
        return valores.TryGetValue(chave, out var valor) ? valor : null;
    }
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 4`.

- [ ] **Step 5: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Services/EnvFileReader.cs deploy/gui/SenaHubManager.Tests/EnvFileReaderTests.cs
git commit -m "feat(gui): EnvFileReader para ler .env (equivalente ao Get-EnvValue do ps1)"
```

---

## Task 3: GitInfo (status do repositório)

**Files:**
- Create: `deploy/gui/SenaHubManager/Services/GitInfo.cs`
- Test: `deploy/gui/SenaHubManager.Tests/GitStatusParserTests.cs`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `SenaHubManager.Services.GitStatusParser.EstaSujo(string) : bool`, `GitStatusParser.ParseAheadBehind(string) : (int Ahead, int Behind)`, `SenaHubManager.Services.GitStatusSnapshot` (record: `Branch, CommitHash, CommitMessage, Ahead, Behind, Sujo`), `SenaHubManager.Services.GitInfo(string repoPath).Obter() : GitStatusSnapshot` — usado pela Task 12 (aba Git/Deploy).

- [ ] **Step 1: Escrever os testes que falham**

Criar `deploy/gui/SenaHubManager.Tests/GitStatusParserTests.cs`:

```csharp
using SenaHubManager.Services;
using Xunit;

namespace SenaHubManager.Tests;

public class GitStatusParserTests
{
    [Fact]
    public void EstaSujo_retorna_false_para_saida_vazia()
    {
        Assert.False(GitStatusParser.EstaSujo(""));
        Assert.False(GitStatusParser.EstaSujo("   \n  "));
    }

    [Fact]
    public void EstaSujo_retorna_true_quando_ha_linhas()
    {
        Assert.True(GitStatusParser.EstaSujo(" M src/lib/utils.ts\n?? logs/\n"));
    }

    [Fact]
    public void ParseAheadBehind_le_saida_do_rev_list_left_right_count()
    {
        var (ahead, behind) = GitStatusParser.ParseAheadBehind("2\t0\n");
        Assert.Equal(2, ahead);
        Assert.Equal(0, behind);
    }

    [Fact]
    public void ParseAheadBehind_retorna_zero_zero_para_saida_invalida()
    {
        var (ahead, behind) = GitStatusParser.ParseAheadBehind("");
        Assert.Equal(0, ahead);
        Assert.Equal(0, behind);
    }
}
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: erro de compilação, `GitStatusParser` não existe.

- [ ] **Step 3: Implementar `GitStatusParser` e `GitInfo`**

Criar `deploy/gui/SenaHubManager/Services/GitInfo.cs`:

```csharp
namespace SenaHubManager.Services;

public static class GitStatusParser
{
    public static bool EstaSujo(string saidaPorcelain) =>
        !string.IsNullOrWhiteSpace(saidaPorcelain);

    /// <summary>Interpreta a saida de `git rev-list --left-right --count HEAD...origin/master` (ex.: "2\t0").</summary>
    public static (int Ahead, int Behind) ParseAheadBehind(string saida)
    {
        var partes = saida.Trim().Split('\t', StringSplitOptions.RemoveEmptyEntries);
        if (partes.Length != 2) return (0, 0);
        if (!int.TryParse(partes[0], out var ahead)) return (0, 0);
        if (!int.TryParse(partes[1], out var behind)) return (0, 0);
        return (ahead, behind);
    }
}

public record GitStatusSnapshot(string Branch, string CommitHash, string CommitMessage, int Ahead, int Behind, bool Sujo);

public class GitInfo
{
    private readonly string _repoPath;

    public GitInfo(string repoPath) => _repoPath = repoPath;

    private string RunGit(string argumentos)
    {
        var psi = new System.Diagnostics.ProcessStartInfo("git", argumentos)
        {
            WorkingDirectory = _repoPath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var processo = System.Diagnostics.Process.Start(psi)!;
        var saida = processo.StandardOutput.ReadToEnd();
        processo.WaitForExit();
        return saida.Trim();
    }

    public GitStatusSnapshot Obter()
    {
        var branch = RunGit("rev-parse --abbrev-ref HEAD");
        var hash = RunGit("rev-parse --short HEAD");
        var mensagem = RunGit("log -1 --pretty=%s");
        var sujo = GitStatusParser.EstaSujo(RunGit("status --porcelain"));
        var (ahead, behind) = GitStatusParser.ParseAheadBehind(RunGit("rev-list --left-right --count HEAD...origin/master"));
        return new GitStatusSnapshot(branch, hash, mensagem, ahead, behind, sujo);
    }
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 4` (mais os 4 da Task 2 = 8 no total).

- [ ] **Step 5: Verificação manual do `GitInfo.Obter()` contra o repositório real**

Criar um `Program.cs` temporário de teste manual não é necessário — a verificação de ponta a ponta acontece na Task 12, quando a aba Git/Deploy estiver acoplada. Por ora, confirmar apenas que os testes puros (Step 4) cobrem o parsing.

- [ ] **Step 6: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Services/GitInfo.cs deploy/gui/SenaHubManager.Tests/GitStatusParserTests.cs
git commit -m "feat(gui): GitInfo - status do repo (branch/commit/ahead-behind/sujo)"
```

---

## Task 4: Parsers de auditoria e de tarefa agendada

**Files:**
- Create: `deploy/gui/SenaHubManager/Services/LogParsers.cs`
- Test: `deploy/gui/SenaHubManager.Tests/LogParsersTests.cs`

**Interfaces:**
- Produces: `SenaHubManager.Services.AuditEntry` (record: `Timestamp, Usuario, Acao, Detalhe`), `AuditLogParser.ParseLinha(string) : AuditEntry?`, `ScheduledTaskInfoParser.ParseProximaExecucao(string) : DateTime?` — usados pela Task 12 (aba Git/Deploy: histórico de execuções via `AuditLogParser` filtrando `Acao`, e "próxima execução agendada" via `ScheduledTaskInfoParser`).
- Nota de design: só `menu-audit.log` é parseado — cada execução do deploy automático grava lá exatamente **uma linha-resumo** (`Write-Audit`, ex.: `"OK (abc1234, 2.3 min)"`/`"FALHOU: npm ci (...)"`/`"SEM MUDANCAS (...)"`), ideal pra uma lista de histórico. Já `deploy-automatico.log` tem dezenas de linhas por execução (saída completa de `git pull`/`npm ci`/build) — bom pra investigar um problema, mas não pra uma lista resumida; por isso ele é exibido como texto puro na aba Logs (Task 12, sem parser nenhum) e não precisa de uma classe de parsing dedicada.

- [ ] **Step 1: Escrever os testes que falham**

Formato real confirmado em `deploy/gerenciar-servidor.ps1` (`Write-Audit`: `"{0} | {1} | {2} | {3}"` com timestamp/usuário/ação/detalhe). O formato de `ScheduledTaskInfoParser` é a saída **ISO-8601** de `(Get-ScheduledTaskInfo ...).NextRunTime.ToString('o')` — deliberadamente não faz parsing da saída textual (localizada) de `schtasks.exe`, pra não depender do idioma do Windows.

Criar `deploy/gui/SenaHubManager.Tests/LogParsersTests.cs`:

```csharp
using SenaHubManager.Services;
using Xunit;

namespace SenaHubManager.Tests;

public class LogParsersTests
{
    [Fact]
    public void AuditLogParser_le_linha_valida()
    {
        var entrada = AuditLogParser.ParseLinha("2026-07-02 03:30:12 | SYSTEM | DeployAutomatico | OK (abc1234, 2.3 min)");

        Assert.NotNull(entrada);
        Assert.Equal(new DateTime(2026, 7, 2, 3, 30, 12), entrada!.Timestamp);
        Assert.Equal("SYSTEM", entrada.Usuario);
        Assert.Equal("DeployAutomatico", entrada.Acao);
        Assert.Equal("OK (abc1234, 2.3 min)", entrada.Detalhe);
    }

    [Fact]
    public void AuditLogParser_retorna_null_para_linha_mal_formada()
    {
        Assert.Null(AuditLogParser.ParseLinha("linha sem separador"));
        Assert.Null(AuditLogParser.ParseLinha(""));
    }

    [Fact]
    public void ScheduledTaskInfoParser_interpreta_data_iso8601()
    {
        var data = ScheduledTaskInfoParser.ParseProximaExecucao("2026-07-03T03:30:00.0000000-03:00");

        Assert.NotNull(data);
        Assert.Equal(3, data!.Value.Day);
        Assert.Equal(7, data.Value.Month);
    }

    [Fact]
    public void ScheduledTaskInfoParser_retorna_null_para_saida_vazia_ou_invalida()
    {
        Assert.Null(ScheduledTaskInfoParser.ParseProximaExecucao(""));
        Assert.Null(ScheduledTaskInfoParser.ParseProximaExecucao("   \n"));
        Assert.Null(ScheduledTaskInfoParser.ParseProximaExecucao("texto invalido"));
    }
}
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: erro de compilação, `AuditLogParser`/`ScheduledTaskInfoParser` não existem.

- [ ] **Step 3: Implementar os parsers**

Criar `deploy/gui/SenaHubManager/Services/LogParsers.cs`:

```csharp
namespace SenaHubManager.Services;

public record AuditEntry(DateTime Timestamp, string Usuario, string Acao, string Detalhe);

/// <summary>Interpreta linhas de logs/menu-audit.log, escritas por Write-Audit em gerenciar-servidor.ps1.</summary>
public static class AuditLogParser
{
    public static AuditEntry? ParseLinha(string linha)
    {
        var partes = linha.Split(" | ", 4, StringSplitOptions.None);
        if (partes.Length != 4) return null;
        if (!DateTime.TryParse(partes[0], out var timestamp)) return null;
        return new AuditEntry(timestamp, partes[1], partes[2], partes[3]);
    }
}

/// <summary>Interpreta a saida ISO-8601 de `(Get-ScheduledTaskInfo -TaskName "X").NextRunTime.ToString('o')`.
/// Nao usa schtasks.exe/parsing de texto localizado de proposito (o nome dos campos muda por idioma do Windows).</summary>
public static class ScheduledTaskInfoParser
{
    public static DateTime? ParseProximaExecucao(string saidaIso8601)
    {
        var texto = saidaIso8601.Trim();
        if (texto.Length == 0) return null;
        return DateTime.TryParse(texto, null, System.Globalization.DateTimeStyles.RoundtripKind, out var data)
            ? data
            : null;
    }
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 12` (4 novos + 8 anteriores).

- [ ] **Step 5: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Services/LogParsers.cs deploy/gui/SenaHubManager.Tests/LogParsersTests.cs
git commit -m "feat(gui): parser de menu-audit.log e de proxima execucao agendada"
```

---

## Task 5: ServicoStatus (checagem de saúde)

**Files:**
- Create: `deploy/gui/SenaHubManager/Services/ServicoStatus.cs`
- Test: `deploy/gui/SenaHubManager.Tests/DatabaseUrlParserTests.cs`

**Interfaces:**
- Consumes: `EnvFileReader.Get` (Task 2).
- Produces: `SenaHubManager.Services.DbConexao` (record: `Usuario, Senha, Host, Porta, Banco`), `DatabaseUrlParser.Parse(string) : DbConexao?`, `SenaHubManager.Services.VerificacaoItem` (record: `Nome, Ok, Detalhe`), `SenaHubManager.Services.StatusSnapshot` (record: `Itens` + propriedade `TudoOk`), `SenaHubManager.Services.ServicoStatus(string envPath).Verificar() : StatusSnapshot` — usado pelas Tasks 10 (bandeja) e 11 (aba Status).

- [ ] **Step 1: Escrever o teste que falha (só a parte pura — parsing da DATABASE_URL)**

Criar `deploy/gui/SenaHubManager.Tests/DatabaseUrlParserTests.cs`:

```csharp
using SenaHubManager.Services;
using Xunit;

namespace SenaHubManager.Tests;

public class DatabaseUrlParserTests
{
    [Fact]
    public void Parse_extrai_usuario_senha_host_porta_banco()
    {
        var conexao = DatabaseUrlParser.Parse("postgresql://senahub:SenhaForte123@127.0.0.1:5432/senahub");

        Assert.NotNull(conexao);
        Assert.Equal("senahub", conexao!.Usuario);
        Assert.Equal("SenhaForte123", conexao.Senha);
        Assert.Equal("127.0.0.1", conexao.Host);
        Assert.Equal("5432", conexao.Porta);
        Assert.Equal("senahub", conexao.Banco);
    }

    [Fact]
    public void Parse_retorna_null_para_string_invalida()
    {
        Assert.Null(DatabaseUrlParser.Parse("nao e uma connection string"));
    }
}
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: erro de compilação, `DatabaseUrlParser` não existe.

- [ ] **Step 3: Implementar `DatabaseUrlParser` e `ServicoStatus`**

Criar `deploy/gui/SenaHubManager/Services/ServicoStatus.cs`:

```csharp
using System.ServiceProcess;

namespace SenaHubManager.Services;

public record DbConexao(string Usuario, string Senha, string Host, string Porta, string Banco);

public static class DatabaseUrlParser
{
    public static DbConexao? Parse(string databaseUrl)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            databaseUrl, @"postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([\w-]+)");
        if (!match.Success) return null;
        return new DbConexao(match.Groups[1].Value, match.Groups[2].Value, match.Groups[3].Value, match.Groups[4].Value, match.Groups[5].Value);
    }
}

public record VerificacaoItem(string Nome, bool Ok, string Detalhe);

public record StatusSnapshot(IReadOnlyList<VerificacaoItem> Itens)
{
    public bool TudoOk => Itens.All(i => i.Ok);
}

public class ServicoStatus
{
    private static readonly string[] Servicos = { "SenaHub", "cloudflared", "postgresql-x64-17" };
    private readonly string _envPath;

    public ServicoStatus(string envPath) => _envPath = envPath;

    public StatusSnapshot Verificar()
    {
        var itens = new List<VerificacaoItem>();

        foreach (var nome in Servicos)
        {
            itens.Add(VerificarServico(nome));
        }

        var portaOk = VerificarPorta("127.0.0.1", 3000, TimeSpan.FromSeconds(2));
        itens.Add(new VerificacaoItem("Porta 3000", portaOk, portaOk ? "respondendo" : "sem resposta"));

        var appUrl = EnvFileReader.Get(_envPath, "APP_URL") ?? "https://hub.senaprojetos.com.br";
        var urlOk = VerificarUrl($"{appUrl}/login");
        itens.Add(new VerificacaoItem("URL publica", urlOk, appUrl));

        var dbOk = VerificarBanco();
        itens.Add(new VerificacaoItem("Banco de dados", dbOk, dbOk ? "autenticado" : "falha na autenticacao"));

        return new StatusSnapshot(itens);
    }

    private static VerificacaoItem VerificarServico(string nome)
    {
        try
        {
            using var sc = new ServiceController(nome);
            var ok = sc.Status == ServiceControllerStatus.Running;
            return new VerificacaoItem(nome, ok, sc.Status.ToString());
        }
        catch (InvalidOperationException)
        {
            return new VerificacaoItem(nome, false, "nao instalado");
        }
    }

    private static bool VerificarPorta(string host, int porta, TimeSpan timeout)
    {
        using var cliente = new System.Net.Sockets.TcpClient();
        try
        {
            var tarefa = cliente.ConnectAsync(host, porta);
            return tarefa.Wait(timeout) && cliente.Connected;
        }
        catch
        {
            return false;
        }
    }

    private static bool VerificarUrl(string url)
    {
        try
        {
            using var cliente = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var resposta = cliente.GetAsync(url).GetAwaiter().GetResult();
            return resposta.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private bool VerificarBanco()
    {
        var dbUrl = EnvFileReader.Get(_envPath, "DATABASE_URL");
        var pgDumpPath = EnvFileReader.Get(_envPath, "PG_DUMP_PATH");
        if (dbUrl is null || pgDumpPath is null) return false;

        var conexao = DatabaseUrlParser.Parse(dbUrl);
        if (conexao is null) return false;

        var psqlPath = Path.Combine(Path.GetDirectoryName(pgDumpPath)!, "psql.exe");
        if (!File.Exists(psqlPath)) return false;

        var psi = new System.Diagnostics.ProcessStartInfo(psqlPath,
            $"-h {conexao.Host} -p {conexao.Porta} -U {conexao.Usuario} -d {conexao.Banco} -t -c \"select 1\"")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.EnvironmentVariables["PGPASSWORD"] = conexao.Senha;

        using var processo = System.Diagnostics.Process.Start(psi)!;
        processo.WaitForExit(5000);
        return processo.ExitCode == 0;
    }
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 14` (2 novos + 12 anteriores).

- [ ] **Step 5: Verificação manual — comparar com `Invoke-Status` do `.ps1`**

Essa verificação de ponta a ponta (rodar `ServicoStatus.Verificar()` de verdade contra os serviços reais e comparar com `powershell deploy\gerenciar-servidor.ps1 -Acao Status`) acontece quando a aba Status estiver pronta (Task 11) — por ora, os testes puros do Step 4 cobrem a parte que dá pra testar sem depender do estado real do servidor.

- [ ] **Step 6: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Services/ServicoStatus.cs deploy/gui/SenaHubManager.Tests/DatabaseUrlParserTests.cs
git commit -m "feat(gui): ServicoStatus - checagem de servicos/porta/URL/banco (equivalente ao Invoke-Status)"
```

---

## Task 6: ProcessoMonitor (processos, portas, encerrar)

**Files:**
- Create: `deploy/gui/SenaHubManager/Services/ProcessoMonitor.cs`
- Test: `deploy/gui/SenaHubManager.Tests/NetstatParserTests.cs`

**Interfaces:**
- Produces: `SenaHubManager.Services.PortaEmUso` (record: `Porta, Pid`), `NetstatParser.ParseListening(string) : IReadOnlyList<PortaEmUso>`, `SenaHubManager.Services.ProcessoSnapshot` (record: `Pid, Nome, Inicio, CpuPercent, MemoriaBytes`), `SenaHubManager.Services.ProcessoMonitor.Listar(string[] nomes) : IReadOnlyList<ProcessoSnapshot>`, `ProcessoMonitor.ListarPortas(int[] portas) : IReadOnlyList<PortaEmUso>`, `ProcessoMonitor.Encerrar(int pid) : void` — usados pela Task 11 (aba Processos).

- [ ] **Step 1: Escrever o teste que falha (parsing do `netstat -ano`)**

Criar `deploy/gui/SenaHubManager.Tests/NetstatParserTests.cs`:

```csharp
using SenaHubManager.Services;
using Xunit;

namespace SenaHubManager.Tests;

public class NetstatParserTests
{
    private const string AmostraNetstat =
        "\r\n" +
        "Ativo Conexoes\r\n\r\n" +
        "  Proto  Endereco Local          Endereco Externo        Estado\r\n" +
        "  TCP    0.0.0.0:3000           0.0.0.0:0               LISTENING       12345\r\n" +
        "  TCP    0.0.0.0:5432           0.0.0.0:0               LISTENING       6789\r\n" +
        "  TCP    127.0.0.1:54321        127.0.0.1:3000          ESTABLISHED     999\r\n";

    [Fact]
    public void ParseListening_extrai_apenas_conexoes_em_escuta()
    {
        var resultado = NetstatParser.ParseListening(AmostraNetstat);

        Assert.Equal(2, resultado.Count);
        Assert.Contains(resultado, p => p.Porta == 3000 && p.Pid == 12345);
        Assert.Contains(resultado, p => p.Porta == 5432 && p.Pid == 6789);
    }

    [Fact]
    public void ParseListening_ignora_linhas_que_nao_sao_tcp_ou_nao_listening()
    {
        var resultado = NetstatParser.ParseListening("linha qualquer\r\nTCP  0.0.0.0:80  0.0.0.0:0  ESTABLISHED  1\r\n");
        Assert.Empty(resultado);
    }
}
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: erro de compilação, `NetstatParser` não existe.

- [ ] **Step 3: Implementar `NetstatParser` e `ProcessoMonitor`**

Criar `deploy/gui/SenaHubManager/Services/ProcessoMonitor.cs`:

```csharp
namespace SenaHubManager.Services;

public record PortaEmUso(int Porta, int Pid);

/// <summary>Interpreta a saida de `netstat -ano`, extraindo so as linhas TCP em LISTENING.</summary>
public static class NetstatParser
{
    public static IReadOnlyList<PortaEmUso> ParseListening(string saidaNetstat)
    {
        var resultado = new List<PortaEmUso>();

        foreach (var linhaBruta in saidaNetstat.Split('\n'))
        {
            var linha = linhaBruta.Trim();
            if (!linha.StartsWith("TCP", StringComparison.OrdinalIgnoreCase)) continue;

            var campos = linha.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (campos.Length < 5) continue;
            if (!campos[3].Equals("LISTENING", StringComparison.OrdinalIgnoreCase)) continue;

            var enderecoLocal = campos[1];
            var ultimoDoisPontos = enderecoLocal.LastIndexOf(':');
            if (ultimoDoisPontos < 0) continue;
            if (!int.TryParse(enderecoLocal[(ultimoDoisPontos + 1)..], out var porta)) continue;
            if (!int.TryParse(campos[4], out var pid)) continue;

            resultado.Add(new PortaEmUso(porta, pid));
        }

        return resultado;
    }
}

public record ProcessoSnapshot(int Pid, string Nome, DateTime Inicio, double CpuPercent, long MemoriaBytes);

public class ProcessoMonitor
{
    private readonly Dictionary<int, TimeSpan> _cpuAnterior = new();
    private DateTime _ultimaAmostra = DateTime.UtcNow;

    public IReadOnlyList<ProcessoSnapshot> Listar(string[] nomes)
    {
        var agora = DateTime.UtcNow;
        var decorridoSegundos = (agora - _ultimaAmostra).TotalSeconds;
        var resultado = new List<ProcessoSnapshot>();

        foreach (var nome in nomes)
        {
            foreach (var processo in System.Diagnostics.Process.GetProcessesByName(nome))
            {
                try
                {
                    var cpuAtual = processo.TotalProcessorTime;
                    double cpuPercent = 0;
                    if (decorridoSegundos > 0.01 && _cpuAnterior.TryGetValue(processo.Id, out var cpuAnt))
                    {
                        cpuPercent = (cpuAtual - cpuAnt).TotalSeconds / decorridoSegundos / Environment.ProcessorCount * 100;
                    }
                    _cpuAnterior[processo.Id] = cpuAtual;

                    resultado.Add(new ProcessoSnapshot(processo.Id, processo.ProcessName, processo.StartTime, Math.Round(cpuPercent, 1), processo.WorkingSet64));
                }
                catch (System.ComponentModel.Win32Exception)
                {
                    // sem permissao pra ler esse processo - ignora
                }
                catch (InvalidOperationException)
                {
                    // processo encerrou entre GetProcessesByName e a leitura - ignora
                }
            }
        }

        _ultimaAmostra = agora;
        return resultado;
    }

    public IReadOnlyList<PortaEmUso> ListarPortas(int[] portas)
    {
        var psi = new System.Diagnostics.ProcessStartInfo("netstat", "-ano")
        {
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var processo = System.Diagnostics.Process.Start(psi)!;
        var saida = processo.StandardOutput.ReadToEnd();
        processo.WaitForExit();

        return NetstatParser.ParseListening(saida).Where(p => portas.Contains(p.Porta)).ToList();
    }

    public void Encerrar(int pid)
    {
        System.Diagnostics.Process.GetProcessById(pid).Kill();
    }
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 16` (2 novos + 14 anteriores).

- [ ] **Step 5: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Services/ProcessoMonitor.cs deploy/gui/SenaHubManager.Tests/NetstatParserTests.cs
git commit -m "feat(gui): ProcessoMonitor - lista processos/portas com CPU/memoria e encerra por PID"
```

---

## Task 7: LogTailer (tail ao vivo)

**Files:**
- Create: `deploy/gui/SenaHubManager/Services/LogTailer.cs`
- Test: `deploy/gui/SenaHubManager.Tests/LogTailUtilTests.cs`

**Interfaces:**
- Produces: `SenaHubManager.Services.LogTailUtil.ObterConteudoNovo(byte[] conteudoCompleto, long offsetAnterior) : string`, `SenaHubManager.Services.LogTailer(string caminho)` (implementa `IDisposable`, evento `event Action<string>? NovaLinha`, método `LerNovo()`) — usado pela Task 12 (aba Logs).

- [ ] **Step 1: Escrever o teste que falha (função pura de diff de conteúdo)**

Criar `deploy/gui/SenaHubManager.Tests/LogTailUtilTests.cs`:

```csharp
using System.Text;
using SenaHubManager.Services;
using Xunit;

namespace SenaHubManager.Tests;

public class LogTailUtilTests
{
    [Fact]
    public void ObterConteudoNovo_retorna_so_o_que_foi_adicionado()
    {
        var conteudoCompleto = Encoding.UTF8.GetBytes("linha 1\nlinha 2\nlinha 3\n");
        var offsetAnterior = Encoding.UTF8.GetBytes("linha 1\n").Length;

        var novo = LogTailUtil.ObterConteudoNovo(conteudoCompleto, offsetAnterior);

        Assert.Equal("linha 2\nlinha 3\n", novo);
    }

    [Fact]
    public void ObterConteudoNovo_retorna_vazio_se_nada_mudou()
    {
        var conteudo = Encoding.UTF8.GetBytes("linha 1\n");
        var novo = LogTailUtil.ObterConteudoNovo(conteudo, conteudo.Length);
        Assert.Equal("", novo);
    }

    [Fact]
    public void ObterConteudoNovo_retorna_vazio_se_offset_maior_que_arquivo_atual()
    {
        // caso do arquivo ter sido rotacionado/truncado - LogTailer reseta o offset antes de chamar isto,
        // mas a funcao pura deve ser segura mesmo assim.
        var conteudo = Encoding.UTF8.GetBytes("abc");
        var novo = LogTailUtil.ObterConteudoNovo(conteudo, 100);
        Assert.Equal("", novo);
    }
}
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: erro de compilação, `LogTailUtil` não existe.

- [ ] **Step 3: Implementar `LogTailUtil` e `LogTailer`**

Criar `deploy/gui/SenaHubManager/Services/LogTailer.cs`:

```csharp
namespace SenaHubManager.Services;

public static class LogTailUtil
{
    public static string ObterConteudoNovo(byte[] conteudoCompleto, long offsetAnterior)
    {
        if (offsetAnterior >= conteudoCompleto.Length) return "";
        var novo = conteudoCompleto[(int)offsetAnterior..];
        return System.Text.Encoding.UTF8.GetString(novo);
    }
}

/// <summary>Acompanha um arquivo de log, disparando NovaLinha so com o texto adicionado desde a ultima leitura.</summary>
public class LogTailer : IDisposable
{
    private readonly string _caminho;
    private long _offset;
    private readonly FileSystemWatcher? _watcher;

    public event Action<string>? NovaLinha;

    public LogTailer(string caminho)
    {
        _caminho = caminho;
        _offset = File.Exists(caminho) ? new FileInfo(caminho).Length : 0;

        var diretorio = Path.GetDirectoryName(caminho);
        if (diretorio is not null && Directory.Exists(diretorio))
        {
            _watcher = new FileSystemWatcher(diretorio, Path.GetFileName(caminho));
            _watcher.Changed += (_, _) => LerNovo();
            _watcher.EnableRaisingEvents = true;
        }
    }

    public void LerNovo()
    {
        if (!File.Exists(_caminho)) return;

        byte[] bytes;
        using (var fs = new FileStream(_caminho, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
            if (fs.Length < _offset) _offset = 0; // arquivo rotacionado/truncado - reseta e le tudo de novo
            bytes = new byte[fs.Length];
            var lido = 0;
            while (lido < bytes.Length)
            {
                var n = fs.Read(bytes, lido, bytes.Length - lido);
                if (n == 0) break;
                lido += n;
            }
        }

        var novoTexto = LogTailUtil.ObterConteudoNovo(bytes, _offset);
        _offset = bytes.Length;
        if (novoTexto.Length > 0) NovaLinha?.Invoke(novoTexto);
    }

    public void Dispose() => _watcher?.Dispose();
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager.Tests
dotnet test
```

Expected: `Passed! - Failed: 0, Passed: 19` (3 novos + 16 anteriores).

- [ ] **Step 5: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Services/LogTailer.cs deploy/gui/SenaHubManager.Tests/LogTailUtilTests.cs
git commit -m "feat(gui): LogTailer - leitura incremental de logs ao vivo (FileSystemWatcher)"
```

---

## Task 8: PowerShellActionRunner (shell-out com streaming)

**Files:**
- Modify: `deploy/gerenciar-servidor.ps1` (adiciona um switch `-Confirmar` pra permitir chamada não-interativa)
- Create: `deploy/gui/SenaHubManager/Services/PowerShellActionRunner.cs`

**Interfaces:**
- Produces: `SenaHubManager.Services.PowerShellActionRunner(string scriptPath)`, evento `event Action<string>? LinhaRecebida`, método `Task<int> ExecutarAsync(string acao, string? sub = null)` — usado pela Task 12 (botão "Atualizar agora") e Task 13 (aba Ações).
- Sem testes automatizados nesta task — é I/O puro (spawna processo real); a verificação é manual (Step 5).

- [ ] **Step 1: Corrigir uma incompatibilidade real do `.ps1` com chamada não-interativa**

Achado no autorrevisão do plano: `gerenciar-servidor.ps1` já tem `Confirm-Typed` (`Read-Host`) dentro de `Invoke-ForcarEncerramento`, `Invoke-CorrigirNext`, `Invoke-Reboot`, `Invoke-ResetAdminSenha`, e (condicionalmente, se o backup falhar) `Invoke-DeployCompleto`. Chamado pelo `.bat` isso é normal (tem um humano no teclado); chamado pelo `PowerShellActionRunner` (stdio redirecionado, sem console interativo de verdade) o `Read-Host` trava ou lança exceção. Como a GUI já confirma essas ações antes de chamar o script (`ConfirmDialog`, Task 13), é seguro pular o prompt interno quando a chamada vem de um processo automatizado — adiciona-se um switch pra isso.

Editar `deploy/gerenciar-servidor.ps1` — no bloco `param(...)` do topo (linhas 10-14 hoje):

```powershell
param(
    [Parameter(Mandatory = $true)]
    [string]$Acao,
    [string]$Sub = "",
    [switch]$Confirmar
)
```

E em `Confirm-Typed` (linhas 58-64 hoje):

```powershell
function Confirm-Typed {
    param([string]$Palavra = "CONFIRMAR")
    if ($Confirmar) { return $true }
    Write-Host ""
    Write-Host "Digite '$Palavra' para confirmar (qualquer outra coisa cancela):" -ForegroundColor Yellow
    $resp = Read-Host ">"
    return ($resp -eq $Palavra)
}
```

(`$Confirmar` é parâmetro de script, visível dentro de `Confirm-Typed` sem precisar de `$script:` — mesmo jeito que `$AppRoot`/`$LogsDir` já são usados dentro de outras funções deste arquivo.)

- [ ] **Step 2: Validar a sintaxe do `.ps1` editado**

```powershell
$erros = $null
[System.Management.Automation.Language.Parser]::ParseFile("F:\Senahub\app\deploy\gerenciar-servidor.ps1", [ref]$null, [ref]$erros) | Out-Null
if ($erros.Count -eq 0) { "OK: sem erros de sintaxe" } else { $erros }
```

Expected: `OK: sem erros de sintaxe`.

- [ ] **Step 3: Implementar `PowerShellActionRunner`, sempre passando `-Confirmar`**

Criar `deploy/gui/SenaHubManager/Services/PowerShellActionRunner.cs`:

```csharp
namespace SenaHubManager.Services;

/// <summary>Chama gerenciar-servidor.ps1 -Acao X, transmitindo a saida linha a linha via evento.
/// Nenhuma acao arriscada (deploy/backup/restart/etc) e reimplementada aqui - so encapsula a chamada.
/// Sempre passa -Confirmar: a confirmacao ja acontece do lado da GUI (ConfirmDialog, Task 13) antes
/// de chegar aqui, entao o prompt interativo interno do .ps1 (Confirm-Typed) e pulado de proposito.</summary>
public class PowerShellActionRunner
{
    private readonly string _scriptPath;

    public PowerShellActionRunner(string scriptPath) => _scriptPath = scriptPath;

    public event Action<string>? LinhaRecebida;

    public async Task<int> ExecutarAsync(string acao, string? sub = null)
    {
        var argumentos = $"-NoProfile -ExecutionPolicy Bypass -File \"{_scriptPath}\" -Acao {acao} -Confirmar";
        if (!string.IsNullOrEmpty(sub)) argumentos += $" -Sub \"{sub}\"";

        var psi = new System.Diagnostics.ProcessStartInfo("powershell.exe", argumentos)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var processo = new System.Diagnostics.Process { StartInfo = psi, EnableRaisingEvents = true };
        processo.OutputDataReceived += (_, e) => { if (e.Data is not null) LinhaRecebida?.Invoke(e.Data); };
        processo.ErrorDataReceived += (_, e) => { if (e.Data is not null) LinhaRecebida?.Invoke(e.Data); };

        processo.Start();
        processo.BeginOutputReadLine();
        processo.BeginErrorReadLine();
        await processo.WaitForExitAsync();

        return processo.ExitCode;
    }

    /// <summary>Resolve o caminho de gerenciar-servidor.ps1 subindo a partir da pasta do executavel
    /// (deploy/gui/SenaHubManager/bin/Release/net8.0-windows/ -> ... -> deploy/gerenciar-servidor.ps1).</summary>
    public static string ResolverCaminhoScript()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidato = Path.Combine(dir.FullName, "deploy", "gerenciar-servidor.ps1");
            if (File.Exists(candidato)) return candidato;
            dir = dir.Parent;
        }
        throw new FileNotFoundException("Nao encontrei deploy/gerenciar-servidor.ps1 subindo a partir de " + AppContext.BaseDirectory);
    }
}
```

- [ ] **Step 4: Build**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 5: Verificação manual — chamar a ação `Status` (só leitura, sem risco) e comparar com rodar o `.ps1` direto**

Substituir temporariamente o corpo de `Main()` em `Program.cs` (o placeholder da Task 1) só pra este teste manual — será reescrito do zero na Task 9:

```csharp
namespace SenaHubManager;

internal static class Program
{
    [STAThread]
    private static async Task Main()
    {
        var runner = new Services.PowerShellActionRunner(Services.PowerShellActionRunner.ResolverCaminhoScript());
        runner.LinhaRecebida += Console.WriteLine;
        var codigo = await runner.ExecutarAsync("Status");
        Console.WriteLine($"Codigo de saida: {codigo}");
    }
}
```

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet run
```

Expected: imprime a mesma saída de `powershell deploy\gerenciar-servidor.ps1 -Acao Status` (status dos 3 serviços, porta, URL, banco), terminando com `Codigo de saida: 0` — confirma que adicionar `-Confirmar` na chamada não quebrou uma ação que nunca usa `Confirm-Typed`. A verificação de que o `-Confirmar` de fato *pula* o prompt interno numa ação que o usa (`ForcarEncerramento`/`CorrigirNext`/`Reboot`/`ResetAdminSenha`) acontece naturalmente na Task 13, quando os botões dessas ações forem testados manualmente pela GUI. Depois de confirmar este passo, reverter `Program.cs` para o placeholder da Task 1 (`Console.WriteLine("SenaHubManager - scaffold OK...")`, `Main()` voltando a ser `void` sem `async`) — será reescrito de vez na Task 9.

- [ ] **Step 6: Commit**

```bash
cd F:\Senahub\app
git add deploy/gerenciar-servidor.ps1 deploy/gui/SenaHubManager/Services/PowerShellActionRunner.cs
git commit -m "feat(gui): PowerShellActionRunner + switch -Confirmar no .ps1 (chamada nao-interativa)"
```

---

## Task 9: Manifesto de administrador + Program.cs (instância única)

**Files:**
- Create: `deploy/gui/SenaHubManager/app.manifest`
- Modify: `deploy/gui/SenaHubManager/SenaHubManager.csproj`
- Modify: `deploy/gui/SenaHubManager/Program.cs`

**Interfaces:**
- Produces: `Program.Main()` — ponto de entrada elevado, garante instância única via `Mutex`. Ainda sem UI real (será acoplada nas Tasks 10-13).

- [ ] **Step 1: Criar o manifesto pedindo elevação**

Criar `deploy/gui/SenaHubManager/app.manifest`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <assemblyIdentity version="1.0.0.0" name="SenaHubManager.app"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">
    <security>
      <requestedPrivileges xmlns="urn:schemas-microsoft-com:asm.v3">
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware>
    </windowsSettings>
  </application>
</assembly>
```

- [ ] **Step 2: Referenciar o manifesto no `.csproj`**

Abrir `deploy/gui/SenaHubManager/SenaHubManager.csproj` e garantir que `<PropertyGroup>` contenha:

```xml
<ApplicationManifest>app.manifest</ApplicationManifest>
```

- [ ] **Step 3: Reescrever `Program.cs` com instância única (Mutex) e entrada mínima**

Substituir o conteúdo de `deploy/gui/SenaHubManager/Program.cs`:

```csharp
namespace SenaHubManager;

internal static class Program
{
    private const string NomeMutex = "SenaHubManager-InstanciaUnica";

    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, NomeMutex, out var criadoAgora);
        if (!criadoAgora)
        {
            MessageBox.Show("O SenaHub Manager ja esta rodando (veja o icone na bandeja).", "SenaHub Manager",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }
}
```

Nota: `TrayApplicationContext` é criado na Task 10 — este `Program.cs` só compila depois dessa task existir; por ora, criar uma classe mínima placeholder pra manter o build passando:

```csharp
// arquivo temporario - sera substituido pelo real na Task 10
internal class TrayApplicationContext : ApplicationContext { }
```

(Adicionar essa classe mínima ao final do próprio `Program.cs` por enquanto.)

- [ ] **Step 4: Build**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 5: Verificação manual — confirmar UAC único e instância única**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet run
```

Expected: Windows pede UAC uma vez; depois disso o processo fica rodando (sem janela visível ainda, é só o `ApplicationContext` vazio). Abrir um segundo `dotnet run` em outro terminal enquanto o primeiro roda — Expected: aparece a MessageBox "ja esta rodando" e o segundo processo termina sozinho. Fechar o primeiro processo (Ctrl+C ou Gerenciador de Tarefas) antes de continuar.

- [ ] **Step 6: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/app.manifest deploy/gui/SenaHubManager/SenaHubManager.csproj deploy/gui/SenaHubManager/Program.cs
git commit -m "feat(gui): manifesto requireAdministrator + Program.cs com instancia unica (Mutex)"
```

---

## Task 10: TrayIconManager (bandeja com cor de saúde)

**Files:**
- Create: `deploy/gui/SenaHubManager/TrayIconManager.cs`
- Modify: `deploy/gui/SenaHubManager/Program.cs`

**Interfaces:**
- Consumes: `ServicoStatus` (Task 5).
- Produces: `SenaHubManager.TrayApplicationContext` (substitui o placeholder da Task 9) — expõe evento `event Action? AbrirSolicitado` consumido pela Task 13 pra abrir a `MainForm`.

- [ ] **Step 1: Implementar `TrayApplicationContext`**

Criar `deploy/gui/SenaHubManager/TrayIconManager.cs`:

```csharp
using SenaHubManager.Services;

namespace SenaHubManager;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly ServicoStatus _servicoStatus;
    private Form? _mainForm;

    private static readonly string EnvPath = Path.Combine(ResolverRaizProjeto(), ".env");

    public TrayApplicationContext()
    {
        _servicoStatus = new ServicoStatus(EnvPath);

        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir", null, (_, _) => AbrirJanelaPrincipal());
        menu.Items.Add("Reiniciar SenaHub", null, async (_, _) => await ReiniciarSenaHubAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Sair", null, (_, _) => Sair());

        _trayIcon = new NotifyIcon
        {
            Icon = CriarIcone(Color.Gray),
            Text = "SenaHub Manager - verificando...",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _trayIcon.DoubleClick += (_, _) => AbrirJanelaPrincipal();

        _timer = new System.Windows.Forms.Timer { Interval = 5000 };
        _timer.Tick += (_, _) => AtualizarStatus();
        _timer.Start();

        AtualizarStatus();
    }

    public event Action? AbrirSolicitado;

    private void AbrirJanelaPrincipal() => AbrirSolicitado?.Invoke();

    /// <summary>Permite que quem criou a janela principal (Task 13) a registre aqui, pra reaproveitar
    /// a mesma instancia em vez de abrir varias ao clicar repetidamente na bandeja.</summary>
    public void RegistrarJanelaPrincipal(Form form) => _mainForm = form;

    public Form? JanelaPrincipal => _mainForm;

    private void AtualizarStatus()
    {
        try
        {
            var snapshot = _servicoStatus.Verificar();
            var criticos = new[] { "SenaHub", "Banco de dados" };
            var falhaCritica = snapshot.Itens.Any(i => !i.Ok && criticos.Contains(i.Nome));

            if (snapshot.TudoOk)
            {
                _trayIcon.Icon = CriarIcone(Color.Green);
                _trayIcon.Text = "SenaHub Manager - tudo OK";
            }
            else if (falhaCritica)
            {
                _trayIcon.Icon = CriarIcone(Color.Red);
                var problema = snapshot.Itens.First(i => !i.Ok && criticos.Contains(i.Nome));
                _trayIcon.Text = $"SenaHub Manager - CRITICO: {problema.Nome}";
            }
            else
            {
                _trayIcon.Icon = CriarIcone(Color.Gold);
                var problema = snapshot.Itens.First(i => !i.Ok);
                _trayIcon.Text = $"SenaHub Manager - atencao: {problema.Nome}";
            }
        }
        catch (Exception ex)
        {
            _trayIcon.Icon = CriarIcone(Color.Gray);
            _trayIcon.Text = $"SenaHub Manager - erro ao verificar: {ex.Message}";
        }
    }

    private async Task ReiniciarSenaHubAsync()
    {
        var runner = new PowerShellActionRunner(PowerShellActionRunner.ResolverCaminhoScript());
        await runner.ExecutarAsync("ReiniciarApp");
        AtualizarStatus();
    }

    private static Icon CriarIcone(Color cor)
    {
        using var bitmap = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.Clear(Color.Transparent);
            using var pincel = new SolidBrush(cor);
            g.FillEllipse(pincel, 2, 2, 28, 28);
        }
        return Icon.FromHandle(bitmap.GetHicon());
    }

    /// <summary>Raiz do projeto = pasta-avo de deploy/gerenciar-servidor.ps1. Reaproveita
    /// PowerShellActionRunner.ResolverCaminhoScript() em vez de subir diretorios de novo aqui.</summary>
    private static string ResolverRaizProjeto()
    {
        var caminhoScript = PowerShellActionRunner.ResolverCaminhoScript(); // .../deploy/gerenciar-servidor.ps1
        var pastaDeploy = Path.GetDirectoryName(caminhoScript)!;
        return Path.GetDirectoryName(pastaDeploy)!;
    }

    private void Sair()
    {
        _timer.Stop();
        _trayIcon.Visible = false;
        Application.Exit();
    }
}
```

Nota: isso substitui por completo a classe placeholder `TrayApplicationContext` criada na Task 9 — apagar aquele bloco temporário do fim de `Program.cs`.

- [ ] **Step 2: Simplificar `Program.cs` (remover o placeholder da Task 9)**

Editar `deploy/gui/SenaHubManager/Program.cs`, removendo a classe `TrayApplicationContext` mínima do final do arquivo (agora ela vive em `TrayIconManager.cs`). O `Program.cs` final:

```csharp
namespace SenaHubManager;

internal static class Program
{
    private const string NomeMutex = "SenaHubManager-InstanciaUnica";

    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, NomeMutex, out var criadoAgora);
        if (!criadoAgora)
        {
            MessageBox.Show("O SenaHub Manager ja esta rodando (veja o icone na bandeja).", "SenaHub Manager",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }
}
```

- [ ] **Step 3: Build**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 4: Verificação manual — ícone aparece e muda de cor**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet run
```

Expected: (1) UAC único; (2) ícone colorido aparece na bandeja em poucos segundos, verde se os 3 serviços/porta/URL/banco estiverem OK; (3) passar o mouse mostra o tooltip; (4) rodar `net stop SenaHub` (outro terminal, admin) e confirmar que o ícone fica vermelho em até 5s; (5) `net start SenaHub` de volta e confirmar que volta a verde; (6) botão direito → Sair encerra o processo.

- [ ] **Step 5: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/TrayIconManager.cs deploy/gui/SenaHubManager/Program.cs
git commit -m "feat(gui): TrayIconManager - icone na bandeja com cor de saude (verde/amarelo/vermelho)"
```

---

## Task 11: MainForm — Aba Status + Aba Processos

**Files:**
- Create: `deploy/gui/SenaHubManager/Forms/MainForm.cs`
- Modify: `deploy/gui/SenaHubManager/TrayIconManager.cs`

**Interfaces:**
- Consumes: `ServicoStatus` (Task 5), `ProcessoMonitor` (Task 6).
- Produces: `SenaHubManager.Forms.MainForm` (WinForms `Form`, construída 100% em código — sem `.Designer.cs`) — abas adicionais chegam nas Tasks 12-13.

- [ ] **Step 1: Implementar `MainForm` com as abas Status e Processos**

Criar `deploy/gui/SenaHubManager/Forms/MainForm.cs`:

```csharp
using SenaHubManager.Services;

namespace SenaHubManager.Forms;

public class MainForm : Form
{
    private readonly ServicoStatus _servicoStatus;
    private readonly ProcessoMonitor _processoMonitor;
    private readonly string _envPath;

    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly ListView _listaStatus = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
    private readonly ListView _listaProcessos = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
    private readonly Button _botaoEncerrarProcesso = new() { Text = "Encerrar processo selecionado", Dock = DockStyle.Bottom, Height = 32 };
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 4000 };

    private static readonly string[] NomesProcessos = { "node", "cloudflared", "postgres" };
    private static readonly int[] Portas = { 3000, 5432 };

    public MainForm(string envPath)
    {
        _envPath = envPath;
        _servicoStatus = new ServicoStatus(envPath);
        _processoMonitor = new ProcessoMonitor();

        Text = "SenaHub Manager";
        Width = 900;
        Height = 600;
        StartPosition = FormStartPosition.CenterScreen;

        Controls.Add(_tabs);
        _tabs.TabPages.Add(CriarAbaStatus());
        _tabs.TabPages.Add(CriarAbaProcessos());

        _timer.Tick += (_, _) => AtualizarTudo();
        _timer.Start();

        // Ao fechar a janela (X), so esconde - o app continua rodando na bandeja.
        FormClosing += (_, e) =>
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };

        AtualizarTudo();
    }

    private TabPage CriarAbaStatus()
    {
        _listaStatus.Columns.Add("Item", 200);
        _listaStatus.Columns.Add("Status", 150);
        _listaStatus.Columns.Add("Detalhe", 400);

        var aba = new TabPage("Status");
        aba.Controls.Add(_listaStatus);
        return aba;
    }

    private TabPage CriarAbaProcessos()
    {
        _listaProcessos.Columns.Add("PID", 70);
        _listaProcessos.Columns.Add("Nome", 120);
        _listaProcessos.Columns.Add("Inicio", 150);
        _listaProcessos.Columns.Add("CPU %", 70);
        _listaProcessos.Columns.Add("Memoria (MB)", 100);
        _listaProcessos.Columns.Add("Portas", 100);

        _botaoEncerrarProcesso.Click += (_, _) => EncerrarProcessoSelecionado();

        var painel = new Panel { Dock = DockStyle.Fill };
        painel.Controls.Add(_listaProcessos);
        painel.Controls.Add(_botaoEncerrarProcesso);

        var aba = new TabPage("Processos");
        aba.Controls.Add(painel);
        return aba;
    }

    private void AtualizarTudo()
    {
        AtualizarAbaStatus();
        AtualizarAbaProcessos();
    }

    private void AtualizarAbaStatus()
    {
        var snapshot = _servicoStatus.Verificar();
        _listaStatus.Items.Clear();
        foreach (var item in snapshot.Itens)
        {
            var linha = new ListViewItem(new[] { item.Nome, item.Ok ? "OK" : "FALHA", item.Detalhe });
            linha.ForeColor = item.Ok ? Color.DarkGreen : Color.DarkRed;
            _listaStatus.Items.Add(linha);
        }
    }

    private void AtualizarAbaProcessos()
    {
        var processos = _processoMonitor.Listar(NomesProcessos);
        var portas = _processoMonitor.ListarPortas(Portas);

        _listaProcessos.Items.Clear();
        foreach (var p in processos)
        {
            var portasDoProcesso = string.Join(", ", portas.Where(x => x.Pid == p.Pid).Select(x => x.Porta));
            var linha = new ListViewItem(new[]
            {
                p.Pid.ToString(),
                p.Nome,
                p.Inicio.ToString("dd/MM HH:mm:ss"),
                p.CpuPercent.ToString("0.0"),
                (p.MemoriaBytes / 1024 / 1024).ToString(),
                portasDoProcesso,
            });
            linha.Tag = p.Pid;
            _listaProcessos.Items.Add(linha);
        }
    }

    private void EncerrarProcessoSelecionado()
    {
        if (_listaProcessos.SelectedItems.Count == 0) return;
        var pid = (int)_listaProcessos.SelectedItems[0].Tag!;
        var nome = _listaProcessos.SelectedItems[0].SubItems[1].Text;

        var confirmar = MessageBox.Show(
            $"Encerrar o processo {nome} (PID {pid})? Isso pode derrubar o SenaHub se for um processo critico.",
            "Confirmar encerramento", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (confirmar != DialogResult.Yes) return;

        try
        {
            _processoMonitor.Encerrar(pid);
            AtualizarAbaProcessos();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Falha ao encerrar: {ex.Message}", "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
```

- [ ] **Step 2: Acoplar `MainForm` na bandeja (`TrayIconManager.cs`)**

Editar `deploy/gui/SenaHubManager/TrayIconManager.cs`: no método `AbrirJanelaPrincipal`, trocar `AbrirSolicitado?.Invoke();` por uma implementação que de fato abre a `MainForm`, reaproveitando a instância se já existir:

```csharp
private void AbrirJanelaPrincipal()
{
    if (_mainForm is null || _mainForm.IsDisposed)
    {
        _mainForm = new Forms.MainForm(EnvPath);
    }

    if (!_mainForm.Visible) _mainForm.Show();
    _mainForm.WindowState = FormWindowState.Normal;
    _mainForm.Activate();
}
```

Remover o evento `AbrirSolicitado` e o método `RegistrarJanelaPrincipal` (não são mais necessários — a bandeja cria e guarda a própria referência da `MainForm`).

- [ ] **Step 3: Build**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 4: Verificação manual**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet run
```

Expected: (1) duplo clique no ícone da bandeja abre a janela; (2) aba Status mostra os 3 serviços + porta + URL + banco, cores batendo com `powershell deploy\gerenciar-servidor.ps1 -Acao Status`; (3) aba Processos lista processos node/cloudflared/postgres com CPU/memória preenchidos (não zerados após a segunda atualização, já que a primeira amostra de CPU é sempre 0); (4) selecionar um processo **não crítico** de teste (abrir um `notepad.exe` só pra esse teste, ele não aparece na lista por não ser node/cloudflared/postgres — em vez disso, validar o botão testando com cautela em um processo node de teste isolado, não o da produção) e confirmar que o botão Encerrar funciona; (5) fechar a janela (X) e confirmar que o app continua rodando na bandeja (não encerra o processo).

- [ ] **Step 5: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Forms/MainForm.cs deploy/gui/SenaHubManager/TrayIconManager.cs
git commit -m "feat(gui): MainForm - aba Status e aba Processos"
```

---

## Task 12: MainForm — Aba Logs + Aba Git/Deploy

**Files:**
- Modify: `deploy/gui/SenaHubManager/Forms/MainForm.cs`

**Interfaces:**
- Consumes: `LogTailer` (Task 7), `GitInfo` (Task 3), `AuditLogParser`/`ScheduledTaskInfoParser` (Task 4), `PowerShellActionRunner` (Task 8).

- [ ] **Step 1: Adicionar a aba Logs**

Editar `deploy/gui/SenaHubManager/Forms/MainForm.cs` — adicionar campos, no construtor registrar a nova aba, e os métodos de suporte:

```csharp
// Adicionar estes campos junto aos outros campos privados da classe:
private readonly ComboBox _seletorLog = new() { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
private readonly RichTextBox _textoLog = new() { Dock = DockStyle.Fill, ReadOnly = true, Font = new Font(FontFamily.GenericMonospace, 9) };
private readonly Dictionary<string, LogTailer> _tailers = new();
private readonly string _logsDir;

// No construtor, apos "_tabs.TabPages.Add(CriarAbaProcessos());", adicionar:
// _logsDir = Path.Combine(Path.GetDirectoryName(envPath)!, "logs");
// _tabs.TabPages.Add(CriarAbaLogs());
```

Substituir a assinatura e o corpo inicial do construtor por (mantendo o restante já existente das Tasks anteriores):

```csharp
public MainForm(string envPath)
{
    _envPath = envPath;
    _logsDir = Path.Combine(Path.GetDirectoryName(envPath)!, "logs");
    _servicoStatus = new ServicoStatus(envPath);
    _processoMonitor = new ProcessoMonitor();

    Text = "SenaHub Manager";
    Width = 900;
    Height = 600;
    StartPosition = FormStartPosition.CenterScreen;

    Controls.Add(_tabs);
    _tabs.TabPages.Add(CriarAbaStatus());
    _tabs.TabPages.Add(CriarAbaProcessos());
    _tabs.TabPages.Add(CriarAbaLogs());
    _tabs.TabPages.Add(CriarAbaGitDeploy());

    _timer.Tick += (_, _) => AtualizarTudo();
    _timer.Start();

    FormClosing += (_, e) =>
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
        }
    };

    AtualizarTudo();
}
```

Adicionar o método que monta a aba Logs:

```csharp
private static readonly (string Rotulo, string Arquivo)[] ArquivosDeLog =
{
    ("SenaHub (saida)", "senahub.out.log"),
    ("SenaHub (erro)", "senahub.err.log"),
    ("Cloudflared (saida)", "cloudflared-nssm.out.log"),
    ("Cloudflared (erro)", "cloudflared-nssm.err.log"),
    ("Deploy automatico", "deploy-automatico.log"),
    ("Auditoria do menu", "menu-audit.log"),
};

private TabPage CriarAbaLogs()
{
    foreach (var (rotulo, _) in ArquivosDeLog) _seletorLog.Items.Add(rotulo);
    _seletorLog.SelectedIndexChanged += (_, _) => TrocarArquivoDeLogSelecionado();

    var painel = new Panel { Dock = DockStyle.Fill };
    painel.Controls.Add(_textoLog);
    painel.Controls.Add(_seletorLog);

    var aba = new TabPage("Logs");
    aba.Controls.Add(painel);

    _seletorLog.SelectedIndex = 0;
    return aba;
}

private void TrocarArquivoDeLogSelecionado()
{
    var (_, arquivo) = ArquivosDeLog[_seletorLog.SelectedIndex];
    var caminho = Path.Combine(_logsDir, arquivo);

    _textoLog.Clear();
    if (File.Exists(caminho))
    {
        var linhas = File.ReadAllLines(caminho, System.Text.Encoding.UTF8);
        _textoLog.Text = string.Join(Environment.NewLine, linhas.TakeLast(200));
    }
    else
    {
        _textoLog.Text = "(arquivo ainda nao existe)";
    }

    if (!_tailers.ContainsKey(arquivo))
    {
        var tailer = new LogTailer(caminho);
        tailer.NovaLinha += texto => AnexarTextoDeLog(arquivo, texto);
        _tailers[arquivo] = tailer;
    }
}

private void AnexarTextoDeLog(string arquivo, string texto)
{
    var (_, arquivoSelecionado) = ArquivosDeLog[_seletorLog.SelectedIndex];
    if (arquivo != arquivoSelecionado) return; // so atualiza a tela se for o log que esta sendo exibido agora

    if (InvokeRequired)
    {
        BeginInvoke(() => AnexarTextoNaTela(texto));
    }
    else
    {
        AnexarTextoNaTela(texto);
    }
}

private void AnexarTextoNaTela(string texto)
{
    _textoLog.AppendText(texto);
    _textoLog.SelectionStart = _textoLog.TextLength;
    _textoLog.ScrollToCaret();
}
```

- [ ] **Step 2: Adicionar a aba Git/Deploy**

Adicionar mais campos e o método que monta essa aba:

```csharp
// Campos adicionais:
private readonly Label _labelGit = new() { Dock = DockStyle.Top, Height = 60, Font = new Font(FontFamily.GenericSansSerif, 10) };
private readonly ListView _listaHistoricoDeploy = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
private readonly Button _botaoAtualizarAgora = new() { Text = "Atualizar agora (git pull + build + restart)", Dock = DockStyle.Bottom, Height = 36 };
private readonly RichTextBox _saidaDeploy = new() { Dock = DockStyle.Bottom, Height = 150, ReadOnly = true, Font = new Font(FontFamily.GenericMonospace, 9) };

private TabPage CriarAbaGitDeploy()
{
    _listaHistoricoDeploy.Columns.Add("Data/hora", 150);
    _listaHistoricoDeploy.Columns.Add("Mensagem", 500);

    _botaoAtualizarAgora.Click += async (_, _) => await AtualizarAgoraAsync();

    var painel = new Panel { Dock = DockStyle.Fill };
    painel.Controls.Add(_listaHistoricoDeploy);
    painel.Controls.Add(_saidaDeploy);
    painel.Controls.Add(_botaoAtualizarAgora);
    painel.Controls.Add(_labelGit);

    var aba = new TabPage("Git / Deploy");
    aba.Controls.Add(painel);
    return aba;
}

private static readonly string[] AcoesDeDeploy = { "DeployAutomatico", "DeployCompleto" };

private void AtualizarAbaGitDeploy()
{
    var git = new GitInfo(Path.GetDirectoryName(_envPath)!).Obter();
    var proximaExecucao = ObterProximaExecucaoAgendada();

    _labelGit.Text =
        $"Branch: {git.Branch}    Commit: {git.CommitHash} - {git.CommitMessage}\n" +
        $"Ahead: {git.Ahead}    Behind: {git.Behind}    {(git.Sujo ? "Ha mudancas locais nao commitadas" : "Sem mudancas locais")}\n" +
        $"Proxima execucao agendada: {(proximaExecucao is null ? "tarefa nao instalada (rode deploy\\instalar-tarefa-atualizacao.ps1)" : proximaExecucao.Value.ToString("dd/MM/yyyy HH:mm:ss"))}";

    // Historico: uma linha-resumo por execucao (Write-Audit grava exatamente isso), filtrado
    // as acoes de deploy - deploy-automatico.log (saida bruta e verbosa) fica so na aba Logs.
    var caminhoAuditoria = Path.Combine(_logsDir, "menu-audit.log");
    _listaHistoricoDeploy.Items.Clear();
    if (File.Exists(caminhoAuditoria))
    {
        var entradas = File.ReadAllLines(caminhoAuditoria, System.Text.Encoding.UTF8)
            .Select(AuditLogParser.ParseLinha)
            .Where(e => e is not null && AcoesDeDeploy.Contains(e.Acao))
            .Select(e => e!)
            .TakeLast(50)
            .Reverse();
        foreach (var entrada in entradas)
        {
            _listaHistoricoDeploy.Items.Add(new ListViewItem(new[] { entrada.Timestamp.ToString("dd/MM HH:mm:ss"), entrada.Detalhe }));
        }
    }
}

private static DateTime? ObterProximaExecucaoAgendada()
{
    var psi = new System.Diagnostics.ProcessStartInfo("powershell.exe",
        "-NoProfile -Command \"(Get-ScheduledTaskInfo -TaskName 'SenaHub - Deploy Automatico' -ErrorAction SilentlyContinue).NextRunTime.ToString('o')\"")
    {
        RedirectStandardOutput = true,
        UseShellExecute = false,
        CreateNoWindow = true,
    };
    using var processo = System.Diagnostics.Process.Start(psi)!;
    var saida = processo.StandardOutput.ReadToEnd();
    processo.WaitForExit();
    return ScheduledTaskInfoParser.ParseProximaExecucao(saida);
}

private async Task AtualizarAgoraAsync()
{
    _botaoAtualizarAgora.Enabled = false;
    _saidaDeploy.Clear();

    var runner = new PowerShellActionRunner(PowerShellActionRunner.ResolverCaminhoScript());
    runner.LinhaRecebida += linha =>
    {
        if (InvokeRequired) BeginInvoke(() => { _saidaDeploy.AppendText(linha + Environment.NewLine); });
        else _saidaDeploy.AppendText(linha + Environment.NewLine);
    };

    await runner.ExecutarAsync("DeployCompleto");

    _botaoAtualizarAgora.Enabled = true;
    AtualizarAbaGitDeploy();
}
```

- [ ] **Step 3: Incluir a nova aba no ciclo de atualização (`AtualizarTudo`)**

Editar o método `AtualizarTudo()` já existente:

```csharp
private void AtualizarTudo()
{
    AtualizarAbaStatus();
    AtualizarAbaProcessos();
    AtualizarAbaGitDeploy();
}
```

- [ ] **Step 4: Build**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 5: Verificação manual**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet run
```

Expected: (1) aba Logs mostra as últimas 200 linhas de cada arquivo ao trocar no seletor, e uma nova linha escrita manualmente no arquivo (`Add-Content logs\menu-audit.log -Value "teste"` em outro terminal) aparece na tela sem precisar reabrir; (2) aba Git/Deploy mostra branch/commit/ahead-behind batendo com `git status`/`git log -1`; (3) histórico do deploy mostra as entradas de `deploy-automatico.log` já geradas nas sessões anteriores; (4) **não** clicar em "Atualizar agora" neste teste manual (dispara um deploy real) — só confirmar visualmente que o botão existe e está habilitado; o teste de ponta a ponta do botão fica pra Task 15 (verificação final), quando houver um commit trivial de sobra pra validar sem risco.

- [ ] **Step 6: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Forms/MainForm.cs
git commit -m "feat(gui): MainForm - aba Logs (tail ao vivo) e aba Git/Deploy"
```

---

## Task 13: MainForm — Aba Ações + ConfirmDialog

**Files:**
- Create: `deploy/gui/SenaHubManager/Forms/ConfirmDialog.cs`
- Modify: `deploy/gui/SenaHubManager/Forms/MainForm.cs`

**Interfaces:**
- Consumes: `PowerShellActionRunner` (Task 8).
- Produces: `SenaHubManager.Forms.ConfirmDialog.Confirmar(string mensagem, string palavraEsperada) : bool` (método estático, mostra o diálogo modal e retorna se a palavra digitada bateu — equivalente ao `Confirm-Typed` do `.ps1`).

- [ ] **Step 1: Implementar `ConfirmDialog`**

Criar `deploy/gui/SenaHubManager/Forms/ConfirmDialog.cs`:

```csharp
namespace SenaHubManager.Forms;

/// <summary>Equivalente ao Confirm-Typed do gerenciar-servidor.ps1: exige digitar uma palavra exata pra confirmar.</summary>
public static class ConfirmDialog
{
    public static bool Confirmar(string mensagem, string palavraEsperada)
    {
        using var dialogo = new Form
        {
            Text = "Confirmar acao",
            Width = 420,
            Height = 180,
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
        };

        var label = new Label { Text = $"{mensagem}\n\nDigite \"{palavraEsperada}\" para confirmar:", Dock = DockStyle.Top, Height = 70 };
        var caixaTexto = new TextBox { Dock = DockStyle.Top };
        var botaoOk = new Button { Text = "Confirmar", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
        var botaoCancelar = new Button { Text = "Cancelar", Dock = DockStyle.Bottom, DialogResult = DialogResult.Cancel };

        dialogo.Controls.Add(caixaTexto);
        dialogo.Controls.Add(label);
        dialogo.Controls.Add(botaoOk);
        dialogo.Controls.Add(botaoCancelar);
        dialogo.AcceptButton = botaoOk;
        dialogo.CancelButton = botaoCancelar;

        var resultado = dialogo.ShowDialog();
        return resultado == DialogResult.OK && caixaTexto.Text.Trim() == palavraEsperada;
    }
}
```

- [ ] **Step 2: Adicionar a aba Ações em `MainForm.cs`**

Adicionar o método que monta a aba (registrar no construtor junto às outras: `_tabs.TabPages.Add(CriarAbaAcoes());` logo após a de Git/Deploy):

```csharp
private TabPage CriarAbaAcoes()
{
    var painel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };

    painel.Controls.Add(CriarBotaoAcao("Iniciar todos os servicos", "IniciarTodos", precisaConfirmar: false));
    painel.Controls.Add(CriarBotaoAcao("Parar todos os servicos", "PararTodos", precisaConfirmar: true,
        mensagemConfirmacao: "Isso vai TIRAR O SITE DO AR.", palavraConfirmacao: "PARAR"));
    painel.Controls.Add(CriarBotaoAcao("Reiniciar SenaHub (aplicacao)", "ReiniciarApp", precisaConfirmar: true,
        mensagemConfirmacao: "Isso vai desconectar os usuarios conectados por alguns segundos.", palavraConfirmacao: "REINICIAR"));
    painel.Controls.Add(CriarBotaoAcao("Reiniciar tunel Cloudflare", "ReiniciarTunel", precisaConfirmar: false));
    painel.Controls.Add(CriarBotaoAcao("Backup manual do banco agora", "Backup", precisaConfirmar: false));
    painel.Controls.Add(CriarBotaoAcao("Rodar testes de fumaca", "SmokeTests", precisaConfirmar: true,
        mensagemConfirmacao: "Isso roda testes contra o banco REAL (idempotentes, mas geram e limpam dados de teste).", palavraConfirmacao: "CONFIRMAR"));
    painel.Controls.Add(CriarBotaoAcao("Aplicar so as migrations", "Migrations", precisaConfirmar: false));
    painel.Controls.Add(CriarBotaoAcao("Resetar senha do admin (emergencia)", "ResetAdminSenha", precisaConfirmar: true,
        mensagemConfirmacao: "Isso reseta a senha do admin para a senha padrao do sistema.", palavraConfirmacao: "CONFIRMAR"));
    painel.Controls.Add(CriarBotaoAcao("Corrigir build corrompido (.next)", "CorrigirNext", precisaConfirmar: true,
        mensagemConfirmacao: "Isso para o SenaHub, apaga a pasta .next e reconstroi o build. O site fica fora do ar durante o processo.", palavraConfirmacao: "CONFIRMAR"));
    painel.Controls.Add(CriarBotaoAcao("Forcar encerramento - SenaHub travado", "ForcarEncerramento", precisaConfirmar: true,
        mensagemConfirmacao: "Isso mata a força o processo do servico SenaHub (uso quando ele trava em STOP_PENDING).", palavraConfirmacao: "CONFIRMAR", sub: "SenaHub"));
    painel.Controls.Add(CriarBotaoAcao("Forcar encerramento - cloudflared travado", "ForcarEncerramento", precisaConfirmar: true,
        mensagemConfirmacao: "Isso mata a força o processo do servico cloudflared (uso quando ele trava em STOP_PENDING).", palavraConfirmacao: "CONFIRMAR", sub: "cloudflared"));
    painel.Controls.Add(CriarBotaoAcao("Reiniciar o servidor Windows (reboot)", "Reboot", precisaConfirmar: true,
        mensagemConfirmacao: "Isso vai REINICIAR O WINDOWS deste servidor em 60 segundos.", palavraConfirmacao: "REINICIAR"));

    var aba = new TabPage("Acoes");
    aba.Controls.Add(painel);
    return aba;
}

private Button CriarBotaoAcao(string rotulo, string acao, bool precisaConfirmar, string mensagemConfirmacao = "", string palavraConfirmacao = "", string? sub = null)
{
    var botao = new Button { Text = rotulo, Width = 350, Height = 32, Margin = new Padding(8) };
    botao.Click += async (_, _) =>
    {
        if (precisaConfirmar && !ConfirmDialog.Confirmar(mensagemConfirmacao, palavraConfirmacao)) return;

        botao.Enabled = false;
        var runner = new PowerShellActionRunner(PowerShellActionRunner.ResolverCaminhoScript());
        var codigo = await runner.ExecutarAsync(acao, sub);
        botao.Enabled = true;

        MessageBox.Show(codigo == 0 ? $"'{rotulo}' concluido." : $"'{rotulo}' terminou com codigo {codigo} - veja os logs.",
            "SenaHub Manager", MessageBoxButtons.OK, codigo == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);

        AtualizarTudo();
    };
    return botao;
}
```

- [ ] **Step 3: Registrar a aba no construtor**

Confirmar que o construtor de `MainForm` (editado nas Tasks 11-12) inclui, na sequência de `_tabs.TabPages.Add(...)`:

```csharp
_tabs.TabPages.Add(CriarAbaStatus());
_tabs.TabPages.Add(CriarAbaProcessos());
_tabs.TabPages.Add(CriarAbaLogs());
_tabs.TabPages.Add(CriarAbaGitDeploy());
_tabs.TabPages.Add(CriarAbaAcoes());
```

- [ ] **Step 4: Build**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 5: Verificação manual (ações não-destrutivas apenas)**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet run
```

Expected: (1) aba Ações lista todos os botões; (2) clicar em "Backup manual do banco agora" (não-destrutivo) e confirmar que gera um arquivo novo em `BACKUP_PATH` (mesma verificação de `Invoke-Backup`); (3) clicar em "Parar todos os servicos" **só até o diálogo de confirmação aparecer**, depois clicar Cancelar — confirmar que nada é executado; (4) **não** testar `Reboot`/`PararTodos`/`ReiniciarApp` de verdade neste passo manual (fica pra Task 15, coordenado com o usuário, já que são disruptivos).

- [ ] **Step 6: Commit**

```bash
cd F:\Senahub\app
git add deploy/gui/SenaHubManager/Forms/ConfirmDialog.cs deploy/gui/SenaHubManager/Forms/MainForm.cs
git commit -m "feat(gui): MainForm - aba Acoes (paridade com o menu do .bat) + ConfirmDialog"
```

---

## Task 14: Instalador do autostart (`instalar-monitor-bandeja.ps1`)

**Files:**
- Create: `deploy/instalar-monitor-bandeja.ps1`

**Interfaces:**
- Nenhuma nova classe C# — script PowerShell autônomo, mesmo padrão de `deploy/instalar-tarefa-atualizacao.ps1`.

- [ ] **Step 1: Publicar o executável (framework-dependent)**

```powershell
cd F:\Senahub\app\deploy\gui\SenaHubManager
dotnet publish -c Release -r win-x64 --self-contained false -o F:\Senahub\app\deploy\gui\SenaHubManager\publish
```

Expected: gera `F:\Senahub\app\deploy\gui\SenaHubManager\publish\SenaHubManager.exe` (pequeno, poucos MB — framework-dependent).

- [ ] **Step 2: Criar o script de instalação da tarefa agendada**

Criar `deploy/instalar-monitor-bandeja.ps1` (mesmo padrão de `deploy/instalar-tarefa-atualizacao.ps1`: sem acentos no texto de console, idempotente):

```powershell
#requires -RunAsAdministrator
<#
.SYNOPSIS
  Registra a tarefa agendada que inicia o SenaHub Manager (bandeja) ao fazer logon.
.DESCRIPTION
  Roda uma vez, como Administrador. Depois disso o SenaHub Manager sobe sozinho a cada
  logon do usuario administrador, ja elevado (sem UAC de novo), via Task Scheduler com
  "executar com privilegios mais altos" - mesmo padrao de instalar-tarefa-atualizacao.ps1.
.EXAMPLE
  .\deploy\instalar-monitor-bandeja.ps1
#>
param(
  [string]$TaskName = "SenaHub - Monitor Bandeja",
  [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
if (-not $ExePath) {
  $ExePath = Join-Path $AppRoot "deploy\gui\SenaHubManager\publish\SenaHubManager.exe"
}
if (-not (Test-Path $ExePath)) {
  throw "Nao encontrei o executavel em $ExePath. Rode 'dotnet publish' antes (ver docs\DEPLOY.md)."
}

Write-Host "Executavel: $ExePath"

$existente = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existente) {
  Write-Host "Tarefa '$TaskName' ja existe - recriando..."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory (Split-Path -Parent $ExePath)
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -RestartCount 0

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description "Inicia o SenaHub Manager (bandeja, monitor de saude) ao fazer logon, ja elevado." `
  | Out-Null

Write-Host ""
Write-Host "[OK] Tarefa '$TaskName' registrada - inicia ao fazer logon deste usuario." -ForegroundColor Green
Write-Host ""
Write-Host "Para testar AGORA sem fazer logoff/logon:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "  (confira se o icone aparece na bandeja em alguns segundos)"
```

- [ ] **Step 3: Validar sintaxe do script**

```powershell
$erros = $null
[System.Management.Automation.Language.Parser]::ParseFile("F:\Senahub\app\deploy\instalar-monitor-bandeja.ps1", [ref]$null, [ref]$erros) | Out-Null
if ($erros.Count -eq 0) { "OK: sem erros de sintaxe" } else { $erros }
```

Expected: `OK: sem erros de sintaxe`.

- [ ] **Step 4: Commit** (a pasta `publish/` fica de fora, é artefato de build)

```bash
cd F:\Senahub\app
git add deploy/instalar-monitor-bandeja.ps1
git commit -m "feat(gui): instalar-monitor-bandeja.ps1 - autostart do SenaHub Manager ao logon"
```

---

## Task 15: Documentação e verificação final de ponta a ponta

**Files:**
- Modify: `docs/DEPLOY.md`

**Interfaces:** nenhuma — task de documentação e checklist final.

- [ ] **Step 1: Adicionar o .NET 8 Desktop Runtime/SDK à tabela de pré-requisitos**

Editar `docs/DEPLOY.md`, seção "0. Pré-requisitos", adicionando uma linha à tabela:

```markdown
| **.NET 8 SDK** | `winget install Microsoft.DotNet.SDK.8` (necessario pra compilar o SenaHub Manager, seção 11) |
```

- [ ] **Step 2: Adicionar uma nova seção documentando o SenaHub Manager**

Adicionar, logo após a seção 10 ("Deploy automático noturno") já existente e antes da seção 11 ("Troubleshooting" — renumerar para 12, e a seguinte "Menu de gerenciamento" pra 13, seguindo o mesmo ajuste de numeração já feito nesta mesma sessão para a seção 10):

```markdown
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
```

- [ ] **Step 2b: Corrigir as duas referências cruzadas que apontavam pra "seção 12" (agora 13)**

A renumeração do Step 2 desloca "Menu de gerenciamento do dia a dia" de 12 para 13. Duas linhas do próprio `docs/DEPLOY.md` referenciam essa seção pelo número antigo e precisam ser atualizadas:

Linha 154 (dentro da seção 9, "Atualizações futuras"), trocar:
```markdown
> No dia a dia, prefira o menu de gerenciamento (seção 12) — a opção 10 faz exatamente esse
```
por:
```markdown
> No dia a dia, prefira o menu de gerenciamento (seção 13) — a opção 10 faz exatamente esse
```

Linha 211 (tabela de troubleshooting, linha do `STOP_PENDING`), trocar:
```markdown
| Serviço preso em `STOP_PENDING` | ... O menu (seção 12, Ferramentas avançadas) automatiza isso. |
```
por:
```markdown
| Serviço preso em `STOP_PENDING` | ... O menu (seção 13, Ferramentas avançadas) automatiza isso. |
```

- [ ] **Step 3: Verificação final de ponta a ponta (com o usuário, ações reais)**

Checklist a rodar uma vez, coordenado com o usuário (algumas ações são disruptivas):

1. `dotnet test` no projeto `SenaHubManager.Tests` — todos os testes passando.
2. Abrir o `.exe` publicado (não `dotnet run`) e repetir a verificação manual das Tasks 9-13 (UAC único, ícone de bandeja, todas as abas).
3. Clicar em "Atualizar agora" (aba Git/Deploy) OU no botão de deploy da aba Ações, de ponta a ponta, com um commit trivial de sobra (ex.: acompanhar este mesmo commit da Task 15 sendo enviado por `git push` de outra sessão) — confirmar que reflete o mesmo comportamento já validado manualmente com `Invoke-DeployCompleto` nesta sessão anterior.
4. Rodar `.\deploy\instalar-monitor-bandeja.ps1`, depois `Start-ScheduledTask -TaskName "SenaHub - Monitor Bandeja"` — confirmar que o ícone aparece na bandeja sem pedir UAC.
5. Fazer logoff/logon (ou reiniciar o servidor, coordenado com o usuário) — confirmar que o SenaHub Manager sobe sozinho.

- [ ] **Step 4: Commit**

```bash
cd F:\Senahub\app
git add docs/DEPLOY.md
git commit -m "docs(deploy): documenta o SenaHub Manager (GUI) e o pre-requisito .NET 8 SDK"
git push origin master
```
