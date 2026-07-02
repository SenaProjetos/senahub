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
