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
