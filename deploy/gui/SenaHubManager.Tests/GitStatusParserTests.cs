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
