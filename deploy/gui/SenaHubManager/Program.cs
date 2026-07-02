namespace SenaHubManager;

internal static class Program
{
    private const string NomeMutex = "SenaHubManager-InstanciaUnica";

    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, NomeMutex, out var criadoAgora);
        if (!criadoAgora)
        {
            MessageBox.Show("O SenaHub Manager ja esta rodando (veja o icone na bandeja).", "SenaHub Manager",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }
}
