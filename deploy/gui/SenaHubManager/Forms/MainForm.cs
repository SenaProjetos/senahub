using SenaHubManager.Services;

namespace SenaHubManager.Forms;

public class MainForm : Form
{
    private readonly ServicoStatus _servicoStatus;
    private readonly ProcessoMonitor _processoMonitor;
    private readonly string _envPath;
    private readonly string _logsDir;

    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly ListView _listaStatus = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
    private readonly ListView _listaProcessos = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
    private readonly Button _botaoEncerrarProcesso = new() { Text = "Encerrar processo selecionado", Dock = DockStyle.Bottom, Height = 32 };
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 4000 };

    private readonly ComboBox _seletorLog = new() { Dock = DockStyle.Top, DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly RichTextBox _textoLog = new() { Dock = DockStyle.Fill, ReadOnly = true, Font = new Font(FontFamily.GenericMonospace, 9) };
    private readonly Dictionary<string, LogTailer> _tailers = new();

    private readonly Label _labelGit = new() { Dock = DockStyle.Top, Height = 60, Font = new Font(FontFamily.GenericSansSerif, 10) };
    private readonly ListView _listaHistoricoDeploy = new() { View = View.Details, Dock = DockStyle.Fill, FullRowSelect = true };
    private readonly Button _botaoAtualizarAgora = new() { Text = "Atualizar agora (git pull + build + restart)", Dock = DockStyle.Bottom, Height = 36 };
    private readonly RichTextBox _saidaDeploy = new() { Dock = DockStyle.Bottom, Height = 150, ReadOnly = true, Font = new Font(FontFamily.GenericMonospace, 9) };

    private static readonly string[] NomesProcessos = { "node", "cloudflared", "postgres" };
    private static readonly int[] Portas = { 3000, 5432 };

    public MainForm(string envPath)
    {
        _envPath = envPath;
        _logsDir = Path.Combine(Path.GetDirectoryName(envPath)!, "logs");
        _servicoStatus = new ServicoStatus(envPath);
        _processoMonitor = new ProcessoMonitor();

        Text = "SenaHub Manager";
        Width = 900;
        Height = 600;
        StartPosition = FormStartPosition.CenterScreen;

        Controls.Add(_tabs);
        _tabs.TabPages.Add(CriarAbaStatus());
        _tabs.TabPages.Add(CriarAbaProcessos());
        _tabs.TabPages.Add(CriarAbaLogs());
        _tabs.TabPages.Add(CriarAbaGitDeploy());
        _tabs.TabPages.Add(CriarAbaAcoes());

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

    private static readonly (string Rotulo, string Arquivo)[] ArquivosDeLog =
    {
        ("SenaHub (saida)", "senahub.out.log"),
        ("SenaHub (erro)", "senahub.err.log"),
        ("Cloudflared (saida)", "cloudflared-nssm.out.log"),
        ("Cloudflared (erro)", "cloudflared-nssm.err.log"),
        ("Deploy automatico", "deploy-automatico.log"),
        ("Auditoria do menu", "menu-audit.log"),
    };

    private TabPage CriarAbaLogs()
    {
        foreach (var (rotulo, _) in ArquivosDeLog) _seletorLog.Items.Add(rotulo);
        _seletorLog.SelectedIndexChanged += (_, _) => TrocarArquivoDeLogSelecionado();

        var painel = new Panel { Dock = DockStyle.Fill };
        painel.Controls.Add(_textoLog);
        painel.Controls.Add(_seletorLog);

        var aba = new TabPage("Logs");
        aba.Controls.Add(painel);

        _seletorLog.SelectedIndex = 0;
        return aba;
    }

    private void TrocarArquivoDeLogSelecionado()
    {
        var (_, arquivo) = ArquivosDeLog[_seletorLog.SelectedIndex];
        var caminho = Path.Combine(_logsDir, arquivo);

        _textoLog.Clear();
        if (File.Exists(caminho))
        {
            var linhas = File.ReadAllLines(caminho, System.Text.Encoding.UTF8);
            _textoLog.Text = string.Join(Environment.NewLine, linhas.TakeLast(200));
        }
        else
        {
            _textoLog.Text = "(arquivo ainda nao existe)";
        }

        if (!_tailers.ContainsKey(arquivo))
        {
            var tailer = new LogTailer(caminho);
            tailer.NovaLinha += texto => AnexarTextoDeLog(arquivo, texto);
            _tailers[arquivo] = tailer;
        }
    }

    private void AnexarTextoDeLog(string arquivo, string texto)
    {
        var (_, arquivoSelecionado) = ArquivosDeLog[_seletorLog.SelectedIndex];
        if (arquivo != arquivoSelecionado) return; // so atualiza a tela se for o log que esta sendo exibido agora

        if (InvokeRequired)
        {
            BeginInvoke(() => AnexarTextoNaTela(texto));
        }
        else
        {
            AnexarTextoNaTela(texto);
        }
    }

    private void AnexarTextoNaTela(string texto)
    {
        _textoLog.AppendText(texto);
        _textoLog.SelectionStart = _textoLog.TextLength;
        _textoLog.ScrollToCaret();
    }

    private TabPage CriarAbaGitDeploy()
    {
        _listaHistoricoDeploy.Columns.Add("Data/hora", 150);
        _listaHistoricoDeploy.Columns.Add("Mensagem", 500);

        _botaoAtualizarAgora.Click += async (_, _) => await AtualizarAgoraAsync();

        var painel = new Panel { Dock = DockStyle.Fill };
        painel.Controls.Add(_listaHistoricoDeploy);
        painel.Controls.Add(_saidaDeploy);
        painel.Controls.Add(_botaoAtualizarAgora);
        painel.Controls.Add(_labelGit);

        var aba = new TabPage("Git / Deploy");
        aba.Controls.Add(painel);
        return aba;
    }

    private TabPage CriarAbaAcoes()
    {
        var painel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true };

        painel.Controls.Add(CriarBotaoAcao("Iniciar todos os servicos", "IniciarTodos", precisaConfirmar: false));
        painel.Controls.Add(CriarBotaoAcao("Parar todos os servicos", "PararTodos", precisaConfirmar: true,
            mensagemConfirmacao: "Isso vai TIRAR O SITE DO AR.", palavraConfirmacao: "PARAR"));
        painel.Controls.Add(CriarBotaoAcao("Reiniciar SenaHub (aplicacao)", "ReiniciarApp", precisaConfirmar: true,
            mensagemConfirmacao: "Isso vai desconectar os usuarios conectados por alguns segundos.", palavraConfirmacao: "REINICIAR"));
        painel.Controls.Add(CriarBotaoAcao("Reiniciar tunel Cloudflare", "ReiniciarTunel", precisaConfirmar: false));
        painel.Controls.Add(CriarBotaoAcao("Backup manual do banco agora", "Backup", precisaConfirmar: false));
        painel.Controls.Add(CriarBotaoAcao("Rodar testes de fumaca", "SmokeTests", precisaConfirmar: true,
            mensagemConfirmacao: "Isso roda testes contra o banco REAL (idempotentes, mas geram e limpam dados de teste).", palavraConfirmacao: "CONFIRMAR"));
        painel.Controls.Add(CriarBotaoAcao("Aplicar so as migrations", "Migrations", precisaConfirmar: false));
        painel.Controls.Add(CriarBotaoAcao("Resetar senha do admin (emergencia)", "ResetAdminSenha", precisaConfirmar: true,
            mensagemConfirmacao: "Isso reseta a senha do admin para a senha padrao do sistema.", palavraConfirmacao: "CONFIRMAR"));
        painel.Controls.Add(CriarBotaoAcao("Corrigir build corrompido (.next)", "CorrigirNext", precisaConfirmar: true,
            mensagemConfirmacao: "Isso para o SenaHub, apaga a pasta .next e reconstroi o build. O site fica fora do ar durante o processo.", palavraConfirmacao: "CONFIRMAR"));
        painel.Controls.Add(CriarBotaoAcao("Forcar encerramento - SenaHub travado", "ForcarEncerramento", precisaConfirmar: true,
            mensagemConfirmacao: "Isso forca o encerramento do processo do servico SenaHub (uso quando ele trava em STOP_PENDING).", palavraConfirmacao: "CONFIRMAR", sub: "SenaHub"));
        painel.Controls.Add(CriarBotaoAcao("Forcar encerramento - cloudflared travado", "ForcarEncerramento", precisaConfirmar: true,
            mensagemConfirmacao: "Isso forca o encerramento do processo do servico cloudflared (uso quando ele trava em STOP_PENDING).", palavraConfirmacao: "CONFIRMAR", sub: "cloudflared"));
        painel.Controls.Add(CriarBotaoAcao("Reiniciar o servidor Windows (reboot)", "Reboot", precisaConfirmar: true,
            mensagemConfirmacao: "Isso vai REINICIAR O WINDOWS deste servidor em 60 segundos.", palavraConfirmacao: "REINICIAR"));

        var aba = new TabPage("Acoes");
        aba.Controls.Add(painel);
        return aba;
    }

    private Button CriarBotaoAcao(string rotulo, string acao, bool precisaConfirmar, string mensagemConfirmacao = "", string palavraConfirmacao = "", string? sub = null)
    {
        var botao = new Button { Text = rotulo, Width = 350, Height = 32, Margin = new Padding(8) };
        botao.Click += async (_, _) =>
        {
            if (precisaConfirmar && !ConfirmDialog.Confirmar(mensagemConfirmacao, palavraConfirmacao)) return;

            botao.Enabled = false;
            var runner = new PowerShellActionRunner(PowerShellActionRunner.ResolverCaminhoScript());
            var codigo = await runner.ExecutarAsync(acao, sub);
            botao.Enabled = true;

            MessageBox.Show(codigo == 0 ? $"'{rotulo}' concluido." : $"'{rotulo}' terminou com codigo {codigo} - veja os logs.",
                "SenaHub Manager", MessageBoxButtons.OK, codigo == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);

            AtualizarTudo();
        };
        return botao;
    }

    private static readonly string[] AcoesDeDeploy = { "DeployAutomatico", "DeployCompleto" };

    private void AtualizarAbaGitDeploy()
    {
        var git = new GitInfo(Path.GetDirectoryName(_envPath)!).Obter();
        var proximaExecucao = ObterProximaExecucaoAgendada();

        _labelGit.Text =
            $"Branch: {git.Branch}    Commit: {git.CommitHash} - {git.CommitMessage}\n" +
            $"Ahead: {git.Ahead}    Behind: {git.Behind}    {(git.Sujo ? "Ha mudancas locais nao commitadas" : "Sem mudancas locais")}\n" +
            $"Proxima execucao agendada: {(proximaExecucao is null ? "tarefa nao instalada (rode deploy\\instalar-tarefa-atualizacao.ps1)" : proximaExecucao.Value.ToString("dd/MM/yyyy HH:mm:ss"))}";

        // Historico: uma linha-resumo por execucao (Write-Audit grava exatamente isso), filtrado
        // as acoes de deploy - deploy-automatico.log (saida bruta e verbosa) fica so na aba Logs.
        var caminhoAuditoria = Path.Combine(_logsDir, "menu-audit.log");
        _listaHistoricoDeploy.Items.Clear();
        if (File.Exists(caminhoAuditoria))
        {
            var entradas = File.ReadAllLines(caminhoAuditoria, System.Text.Encoding.UTF8)
                .Select(AuditLogParser.ParseLinha)
                .Where(e => e is not null && AcoesDeDeploy.Contains(e.Acao))
                .Select(e => e!)
                .TakeLast(50)
                .Reverse();
            foreach (var entrada in entradas)
            {
                _listaHistoricoDeploy.Items.Add(new ListViewItem(new[] { entrada.Timestamp.ToString("dd/MM HH:mm:ss"), entrada.Detalhe }));
            }
        }
    }

    private static DateTime? ObterProximaExecucaoAgendada()
    {
        var psi = new System.Diagnostics.ProcessStartInfo("powershell.exe",
            "-NoProfile -Command \"(Get-ScheduledTaskInfo -TaskName 'SenaHub - Deploy Automatico' -ErrorAction SilentlyContinue).NextRunTime.ToString('o')\"")
        {
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var processo = System.Diagnostics.Process.Start(psi)!;
        var saida = processo.StandardOutput.ReadToEnd();
        processo.WaitForExit();
        return ScheduledTaskInfoParser.ParseProximaExecucao(saida);
    }

    private async Task AtualizarAgoraAsync()
    {
        _botaoAtualizarAgora.Enabled = false;
        _saidaDeploy.Clear();

        var runner = new PowerShellActionRunner(PowerShellActionRunner.ResolverCaminhoScript());
        runner.LinhaRecebida += linha =>
        {
            if (InvokeRequired) BeginInvoke(() => { _saidaDeploy.AppendText(linha + Environment.NewLine); });
            else _saidaDeploy.AppendText(linha + Environment.NewLine);
        };

        await runner.ExecutarAsync("DeployCompleto");

        _botaoAtualizarAgora.Enabled = true;
        AtualizarAbaGitDeploy();
    }

    private void AtualizarTudo()
    {
        try
        {
            AtualizarAbaStatus();
            AtualizarAbaProcessos();
            AtualizarAbaGitDeploy();
        }
        catch
        {
            // Falha ao atualizar uma aba nao deve derrubar o app inteiro - a bandeja
            // (TrayIconManager) ja tem seu proprio try/catch e mostra icone cinza/vermelho
            // em caso de falha, entao o usuario ainda tem visibilidade de saude mesmo se
            // este tick da janela principal falhar silenciosamente.
        }
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
