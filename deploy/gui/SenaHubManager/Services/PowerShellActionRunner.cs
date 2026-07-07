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
