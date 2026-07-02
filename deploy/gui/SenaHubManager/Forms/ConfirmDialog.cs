namespace SenaHubManager.Forms;

/// <summary>Equivalente ao Confirm-Typed do gerenciar-servidor.ps1: exige digitar uma palavra exata pra confirmar.</summary>
public static class ConfirmDialog
{
    public static bool Confirmar(string mensagem, string palavraEsperada)
    {
        using var dialogo = new Form
        {
            Text = "Confirmar acao",
            Width = 420,
            Height = 180,
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
        };

        var label = new Label { Text = $"{mensagem}\n\nDigite \"{palavraEsperada}\" para confirmar:", Dock = DockStyle.Top, Height = 70 };
        var caixaTexto = new TextBox { Dock = DockStyle.Top };
        var botaoOk = new Button { Text = "Confirmar", Dock = DockStyle.Bottom, DialogResult = DialogResult.OK };
        var botaoCancelar = new Button { Text = "Cancelar", Dock = DockStyle.Bottom, DialogResult = DialogResult.Cancel };

        dialogo.Controls.Add(caixaTexto);
        dialogo.Controls.Add(label);
        dialogo.Controls.Add(botaoOk);
        dialogo.Controls.Add(botaoCancelar);
        dialogo.AcceptButton = botaoOk;
        dialogo.CancelButton = botaoCancelar;

        var resultado = dialogo.ShowDialog();
        return resultado == DialogResult.OK && caixaTexto.Text.Trim() == palavraEsperada;
    }
}
