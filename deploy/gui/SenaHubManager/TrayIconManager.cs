using SenaHubManager.Services;

namespace SenaHubManager;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly ServicoStatus _servicoStatus;
    private Forms.MainForm? _mainForm;

    // Icones sao criados uma unica vez e reaproveitados a cada tick do timer (Task 10):
    // CriarIcone() usa Bitmap.GetHicon(), que aloca um handle GDI nativo que Icon.FromHandle
    // NAO assume a posse. Recriar o icone a cada 5s sem destruir o handle antigo esgota a
    // quota de handles GDI do processo (10.000 por padrao no Windows) em poucas semanas de
    // uptime continuo, ja que este app roda 24/7 na bandeja.
    private readonly Icon _iconeVerde = CriarIcone(Color.Green);
    private readonly Icon _iconeAmarelo = CriarIcone(Color.Gold);
    private readonly Icon _iconeVermelho = CriarIcone(Color.Red);
    private readonly Icon _iconeCinza = CriarIcone(Color.Gray);

    private static readonly string EnvPath = Path.Combine(ResolverRaizProjeto(), ".env");

    public TrayApplicationContext()
    {
        _servicoStatus = new ServicoStatus(EnvPath);

        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir", null, (_, _) => AbrirJanelaPrincipal());
        menu.Items.Add("Reiniciar SenaHub", null, async (_, _) => await ReiniciarSenaHubAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Sair", null, (_, _) => Sair());

        _trayIcon = new NotifyIcon
        {
            Icon = _iconeCinza,
            Text = "SenaHub Manager - verificando...",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _trayIcon.DoubleClick += (_, _) => AbrirJanelaPrincipal();

        _timer = new System.Windows.Forms.Timer { Interval = 5000 };
        _timer.Tick += (_, _) => AtualizarStatus();
        _timer.Start();

        AtualizarStatus();
    }

    public Form? JanelaPrincipal => _mainForm;

    private void AbrirJanelaPrincipal()
    {
        if (_mainForm is null || _mainForm.IsDisposed)
        {
            _mainForm = new Forms.MainForm(EnvPath);
        }

        if (!_mainForm.Visible) _mainForm.Show();
        _mainForm.WindowState = FormWindowState.Normal;
        _mainForm.Activate();
    }

    private void AtualizarStatus()
    {
        try
        {
            var snapshot = _servicoStatus.Verificar();
            var criticos = new[] { "SenaHub", "Banco de dados" };
            var falhaCritica = snapshot.Itens.Any(i => !i.Ok && criticos.Contains(i.Nome));

            if (snapshot.TudoOk)
            {
                _trayIcon.Icon = _iconeVerde;
                _trayIcon.Text = "SenaHub Manager - tudo OK";
            }
            else if (falhaCritica)
            {
                _trayIcon.Icon = _iconeVermelho;
                var problema = snapshot.Itens.First(i => !i.Ok && criticos.Contains(i.Nome));
                _trayIcon.Text = $"SenaHub Manager - CRITICO: {problema.Nome}";
            }
            else
            {
                _trayIcon.Icon = _iconeAmarelo;
                var problema = snapshot.Itens.First(i => !i.Ok);
                _trayIcon.Text = $"SenaHub Manager - atencao: {problema.Nome}";
            }
        }
        catch (Exception ex)
        {
            _trayIcon.Icon = _iconeCinza;
            _trayIcon.Text = $"SenaHub Manager - erro ao verificar: {ex.Message}";
        }
    }

    private async Task ReiniciarSenaHubAsync()
    {
        var runner = new PowerShellActionRunner(PowerShellActionRunner.ResolverCaminhoScript());
        await runner.ExecutarAsync("ReiniciarApp");
        AtualizarStatus();
    }

    private static Icon CriarIcone(Color cor)
    {
        using var bitmap = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.Clear(Color.Transparent);
            using var pincel = new SolidBrush(cor);
            g.FillEllipse(pincel, 2, 2, 28, 28);
        }
        return Icon.FromHandle(bitmap.GetHicon());
    }

    /// <summary>Raiz do projeto = pasta-avo de deploy/gerenciar-servidor.ps1. Reaproveita
    /// PowerShellActionRunner.ResolverCaminhoScript() em vez de subir diretorios de novo aqui.</summary>
    private static string ResolverRaizProjeto()
    {
        var caminhoScript = PowerShellActionRunner.ResolverCaminhoScript(); // .../deploy/gerenciar-servidor.ps1
        var pastaDeploy = Path.GetDirectoryName(caminhoScript)!;
        return Path.GetDirectoryName(pastaDeploy)!;
    }

    private void Sair()
    {
        _timer.Stop();
        _trayIcon.Visible = false;
        _iconeVerde.Dispose();
        _iconeAmarelo.Dispose();
        _iconeVermelho.Dispose();
        _iconeCinza.Dispose();
        Application.Exit();
    }
}
