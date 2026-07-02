namespace SenaHubManager.Services;

public record PortaEmUso(int Porta, int Pid);

/// <summary>Interpreta a saida de `netstat -ano`, extraindo so as linhas TCP em LISTENING.</summary>
public static class NetstatParser
{
    public static IReadOnlyList<PortaEmUso> ParseListening(string saidaNetstat)
    {
        var resultado = new List<PortaEmUso>();

        foreach (var linhaBruta in saidaNetstat.Split('\n'))
        {
            var linha = linhaBruta.Trim();
            if (!linha.StartsWith("TCP", StringComparison.OrdinalIgnoreCase)) continue;

            var campos = linha.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (campos.Length < 5) continue;
            if (!campos[3].Equals("LISTENING", StringComparison.OrdinalIgnoreCase)) continue;

            var enderecoLocal = campos[1];
            var ultimoDoisPontos = enderecoLocal.LastIndexOf(':');
            if (ultimoDoisPontos < 0) continue;
            if (!int.TryParse(enderecoLocal[(ultimoDoisPontos + 1)..], out var porta)) continue;
            if (!int.TryParse(campos[4], out var pid)) continue;

            resultado.Add(new PortaEmUso(porta, pid));
        }

        return resultado;
    }
}

public record ProcessoSnapshot(int Pid, string Nome, DateTime Inicio, double CpuPercent, long MemoriaBytes);

public class ProcessoMonitor
{
    private readonly Dictionary<int, TimeSpan> _cpuAnterior = new();
    private DateTime _ultimaAmostra = DateTime.UtcNow;

    public IReadOnlyList<ProcessoSnapshot> Listar(string[] nomes)
    {
        var agora = DateTime.UtcNow;
        var decorridoSegundos = (agora - _ultimaAmostra).TotalSeconds;
        var resultado = new List<ProcessoSnapshot>();

        foreach (var nome in nomes)
        {
            foreach (var processo in System.Diagnostics.Process.GetProcessesByName(nome))
            {
                try
                {
                    var cpuAtual = processo.TotalProcessorTime;
                    double cpuPercent = 0;
                    if (decorridoSegundos > 0.01 && _cpuAnterior.TryGetValue(processo.Id, out var cpuAnt))
                    {
                        cpuPercent = (cpuAtual - cpuAnt).TotalSeconds / decorridoSegundos / Environment.ProcessorCount * 100;
                    }
                    _cpuAnterior[processo.Id] = cpuAtual;

                    resultado.Add(new ProcessoSnapshot(processo.Id, processo.ProcessName, processo.StartTime, Math.Round(cpuPercent, 1), processo.WorkingSet64));
                }
                catch (System.ComponentModel.Win32Exception)
                {
                    // sem permissao pra ler esse processo - ignora
                }
                catch (InvalidOperationException)
                {
                    // processo encerrou entre GetProcessesByName e a leitura - ignora
                }
            }
        }

        _ultimaAmostra = agora;
        return resultado;
    }

    public IReadOnlyList<PortaEmUso> ListarPortas(int[] portas)
    {
        var psi = new System.Diagnostics.ProcessStartInfo("netstat", "-ano")
        {
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var processo = System.Diagnostics.Process.Start(psi)!;
        var saida = processo.StandardOutput.ReadToEnd();
        processo.WaitForExit();

        return NetstatParser.ParseListening(saida).Where(p => portas.Contains(p.Porta)).ToList();
    }

    public void Encerrar(int pid)
    {
        System.Diagnostics.Process.GetProcessById(pid).Kill();
    }
}
