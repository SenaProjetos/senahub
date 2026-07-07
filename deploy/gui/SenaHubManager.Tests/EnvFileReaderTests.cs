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
