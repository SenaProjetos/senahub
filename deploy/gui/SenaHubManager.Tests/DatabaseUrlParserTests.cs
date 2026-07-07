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
