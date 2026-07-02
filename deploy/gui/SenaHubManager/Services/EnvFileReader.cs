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
