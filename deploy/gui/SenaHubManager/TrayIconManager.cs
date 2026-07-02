using SenaHubManager.Services;

namespace SenaHubManager;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _trayIcon;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly ServicoStatus _servicoStatus;
    private Form? _mainForm;

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
            Icon = CriarIcone(Color.Gray),
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

    public event Action? AbrirSolicitado;

    private void AbrirJanelaPrincipal() => AbrirSolicitado?.Invoke();

    /// <summary>Permite que quem criou a janela principal (Task 13) a registre aqui, pra reaproveitar
    /// a mesma instancia em vez de abrir varias ao clicar repetidamente na bandeja.</summary>
    public void RegistrarJanelaPrincipal(Form form) => _mainForm = form;

    public Form? JanelaPrincipal => _mainForm;

    private void AtualizarStatus()
    {
        try
        {
            var snapshot = _servicoStatus.Verificar();
            var criticos = new[] { "SenaHub", "Banco de dados" };
            var falhaCritica = snapshot.Itens.Any(i => !i.Ok && criticos.Contains(i.Nome));

            if (snapshot.TudoOk)
            {
                _trayIcon.Icon = CriarIcone(Color.Green);
                _trayIcon.Text = "SenaHub Manager - tudo OK";
            }
            else if (falhaCritica)
            {
                _trayIcon.Icon = CriarIcone(Color.Red);
                var problema = snapshot.Itens.First(i => !i.Ok && criticos.Contains(i.Nome));
                _trayIcon.Text = $"SenaHub Manager - CRITICO: {problema.Nome}";
            }
            else
            {
                _trayIcon.Icon = CriarIcone(Color.Gold);
                var problema = snapshot.Itens.First(i => !i.Ok);
                _trayIcon.Text = $"SenaHub Manager - atencao: {problema.Nome}";
            }
        }
        catch (Exception ex)
        {
            _trayIcon.Icon = CriarIcone(Color.Gray);
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
        Application.Exit();
    }
}
