namespace SenaHubManager.Services;

public record AuditEntry(DateTime Timestamp, string Usuario, string Acao, string Detalhe);

/// <summary>Interpreta linhas de logs/menu-audit.log, escritas por Write-Audit em gerenciar-servidor.ps1.</summary>
public static class AuditLogParser
{
    public static AuditEntry? ParseLinha(string linha)
    {
        var partes = linha.Split(" | ", 4, StringSplitOptions.None);
        if (partes.Length != 4) return null;
        if (!DateTime.TryParse(partes[0], out var timestamp)) return null;
        return new AuditEntry(timestamp, partes[1], partes[2], partes[3]);
    }
}

/// <summary>Interpreta a saida ISO-8601 de `(Get-ScheduledTaskInfo -TaskName "X").NextRunTime.ToString('o')`.
/// Nao usa schtasks.exe/parsing de texto localizado de proposito (o nome dos campos muda por idioma do Windows).</summary>
public static class ScheduledTaskInfoParser
{
    public static DateTime? ParseProximaExecucao(string saidaIso8601)
    {
        var texto = saidaIso8601.Trim();
        if (texto.Length == 0) return null;
        return DateTime.TryParse(texto, null, System.Globalization.DateTimeStyles.RoundtripKind, out var data)
            ? data
            : null;
    }
}
