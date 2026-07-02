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
