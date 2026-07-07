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
