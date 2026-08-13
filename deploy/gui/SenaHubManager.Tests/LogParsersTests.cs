using SenaHubManager.Services;
using Xunit;

namespace SenaHubManager.Tests;

public class LogParsersTests
{
    [Fact]
    public void AuditLogParser_le_linha_valida()
    {
        var entrada = AuditLogParser.ParseLinha("2026-07-02 03:30:12 | SYSTEM | DeployAutomatico | OK (abc1234, 2.3 min)");

        Assert.NotNull(entrada);
        Assert.Equal(new DateTime(2026, 7, 2, 3, 30, 12), entrada!.Timestamp);
        Assert.Equal("SYSTEM", entrada.Usuario);
        Assert.Equal("DeployAutomatico", entrada.Acao);
        Assert.Equal("OK (abc1234, 2.3 min)", entrada.Detalhe);
    }

    /// <summary>
    /// O aborto por arvore suja passou a levar a saida do `git status --porcelain` junto
    /// (antes so dizia "sujo", e a causa se perdia ate a manha seguinte). Esse resumo tem
    /// ";" e parenteses, e Format-ResumoSujeira troca " | " por " / " justamente para nao
    /// deslocar os campos aqui - este teste segura esse contrato.
    /// </summary>
    [Fact]
    public void AuditLogParser_mantem_detalhe_inteiro_com_resumo_de_git_status()
    {
        var entrada = AuditLogParser.ParseLinha(
            "2026-08-13 04:00:38 | SENA-SERVER$ | DeployAutomatico | ABORTADO: git status sujo - 2 entrada(s): ?? dev-out.log; M package.json");

        Assert.NotNull(entrada);
        Assert.Equal("SENA-SERVER$", entrada!.Usuario);
        Assert.Equal("DeployAutomatico", entrada.Acao);
        Assert.Equal("ABORTADO: git status sujo - 2 entrada(s): ?? dev-out.log; M package.json", entrada.Detalhe);
    }

    [Fact]
    public void AuditLogParser_retorna_null_para_linha_mal_formada()
    {
        Assert.Null(AuditLogParser.ParseLinha("linha sem separador"));
        Assert.Null(AuditLogParser.ParseLinha(""));
    }

    [Fact]
    public void ScheduledTaskInfoParser_interpreta_data_iso8601()
    {
        var data = ScheduledTaskInfoParser.ParseProximaExecucao("2026-07-03T03:30:00.0000000-03:00");

        Assert.NotNull(data);
        Assert.Equal(3, data!.Value.Day);
        Assert.Equal(7, data.Value.Month);
    }

    [Fact]
    public void ScheduledTaskInfoParser_retorna_null_para_saida_vazia_ou_invalida()
    {
        Assert.Null(ScheduledTaskInfoParser.ParseProximaExecucao(""));
        Assert.Null(ScheduledTaskInfoParser.ParseProximaExecucao("   \n"));
        Assert.Null(ScheduledTaskInfoParser.ParseProximaExecucao("texto invalido"));
    }
}
