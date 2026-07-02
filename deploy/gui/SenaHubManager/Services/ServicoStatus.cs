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
