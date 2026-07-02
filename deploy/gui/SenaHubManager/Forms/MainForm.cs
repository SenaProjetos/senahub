using SenaHubManager.Services;

namespace SenaHubManager.Forms;

public class MainForm : Form
{
    private readonly ServicoStatus _servicoStatus;
    private readonly ProcessoMonitor _processoMonitor;
    private readonly string _envPath;

    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly ListView _listaStatus = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
    private readonly ListView _listaProcessos = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
    private readonly Button _botaoEncerrarProcesso = new() { Text = "Encerrar processo selecionado", Dock = DockStyle.Bottom, Height = 32 };
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 4000 };

    private static readonly string[] NomesProcessos = { "node", "cloudflared", "postgres" };
    private static readonly int[] Portas = { 3000, 5432 };

    public MainForm(string envPath)
    {
        _envPath = envPath;
        _servicoStatus = new ServicoStatus(envPath);
        _processoMonitor = new ProcessoMonitor();

        Text = "SenaHub Manager";
        Width = 900;
        Height = 600;
        StartPosition = FormStartPosition.CenterScreen;

        Controls.Add(_tabs);
        _tabs.TabPages.Add(CriarAbaStatus());
        _tabs.TabPages.Add(CriarAbaProcessos());

        _timer.Tick += (_, _) => AtualizarTudo();
        _timer.Start();

        // Ao fechar a janela (X), so esconde - o app continua rodando na bandeja.
        FormClosing += (_, e) =>
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };

        AtualizarTudo();
    }

    private TabPage CriarAbaStatus()
    {
        _listaStatus.Columns.Add("Item", 200);
        _listaStatus.Columns.Add("Status", 150);
        _listaStatus.Columns.Add("Detalhe", 400);

        var aba = new TabPage("Status");
        aba.Controls.Add(_listaStatus);
        return aba;
    }

    private TabPage CriarAbaProcessos()
    {
        _listaProcessos.Columns.Add("PID", 70);
        _listaProcessos.Columns.Add("Nome", 120);
        _listaProcessos.Columns.Add("Inicio", 150);
        _listaProcessos.Columns.Add("CPU %", 70);
        _listaProcessos.Columns.Add("Memoria (MB)", 100);
        _listaProcessos.Columns.Add("Portas", 100);

        _botaoEncerrarProcesso.Click += (_, _) => EncerrarProcessoSelecionado();

        var painel = new Panel { Dock = DockStyle.Fill };
        painel.Controls.Add(_listaProcessos);
        painel.Controls.Add(_botaoEncerrarProcesso);

        var aba = new TabPage("Processos");
        aba.Controls.Add(painel);
        return aba;
    }

    private void AtualizarTudo()
    {
        AtualizarAbaStatus();
        AtualizarAbaProcessos();
    }

    private void AtualizarAbaStatus()
    {
        var snapshot = _servicoStatus.Verificar();
        _listaStatus.Items.Clear();
        foreach (var item in snapshot.Itens)
        {
            var linha = new ListViewItem(new[] { item.Nome, item.Ok ? "OK" : "FALHA", item.Detalhe });
            linha.ForeColor = item.Ok ? Color.DarkGreen : Color.DarkRed;
            _listaStatus.Items.Add(linha);
        }
    }

    private void AtualizarAbaProcessos()
    {
        var processos = _processoMonitor.Listar(NomesProcessos);
        var portas = _processoMonitor.ListarPortas(Portas);

        _listaProcessos.Items.Clear();
        foreach (var p in processos)
        {
            var portasDoProcesso = string.Join(", ", portas.Where(x => x.Pid == p.Pid).Select(x => x.Porta));
            var linha = new ListViewItem(new[]
            {
                p.Pid.ToString(),
                p.Nome,
                p.Inicio.ToString("dd/MM HH:mm:ss"),
                p.CpuPercent.ToString("0.0"),
                (p.MemoriaBytes / 1024 / 1024).ToString(),
                portasDoProcesso,
            });
            linha.Tag = p.Pid;
            _listaProcessos.Items.Add(linha);
        }
    }

    private void EncerrarProcessoSelecionado()
    {
        if (_listaProcessos.SelectedItems.Count == 0) return;
        var pid = (int)_listaProcessos.SelectedItems[0].Tag!;
        var nome = _listaProcessos.SelectedItems[0].SubItems[1].Text;

        var confirmar = MessageBox.Show(
            $"Encerrar o processo {nome} (PID {pid})? Isso pode derrubar o SenaHub se for um processo critico.",
            "Confirmar encerramento", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (confirmar != DialogResult.Yes) return;

        try
        {
            _processoMonitor.Encerrar(pid);
            AtualizarAbaProcessos();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Falha ao encerrar: {ex.Message}", "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
