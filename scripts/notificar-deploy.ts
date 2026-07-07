/**
 * Envia um e-mail de status (sucesso/falha) do deploy automático noturno.
 * Chamado por deploy/gerenciar-servidor.ps1 (Invoke-DeployAutomatico); nunca deve
 * bloquear o resultado do deploy — falha de e-mail é só logada pelo chamador.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/notificar-deploy.ts --status ok|falhou --detalhe "texto"
 */
import "dotenv/config";
import { enviarEmail, smtpConfigurado } from "../src/lib/mail";

function pegarArg(nome: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "";
}

async function main() {
  const status = pegarArg("status");
  const detalhe = pegarArg("detalhe");
  const destino = process.env.DEPLOY_NOTIFY_EMAIL || "tadrio@senaprojetos.com.br";

  if (!smtpConfigurado()) {
    console.log("[notificar-deploy] SMTP não configurado — pulando e-mail.");
    return;
  }

  const ok = status === "ok";
  const assunto = ok ? "[SenaHub] Deploy automático concluído" : "[SenaHub] Deploy automático FALHOU";
  const html = `
    <p><strong>${ok ? "Deploy automático noturno concluído com sucesso." : "O deploy automático noturno falhou."}</strong></p>
    <p>${detalhe || "(sem detalhes)"}</p>
    ${
      ok
        ? ""
        : "<p>O serviço SenaHub pode estar parado (site fora do ar). Veja <code>logs\\deploy-automatico.log</code> e <code>logs\\menu-audit.log</code> no servidor.</p>"
    }
  `.trim();

  const enviado = await enviarEmail({ to: destino, subject: assunto, html });
  console.log(enviado ? "[notificar-deploy] e-mail enviado." : "[notificar-deploy] falha ao enviar e-mail.");
}

main().catch((e) => {
  console.error("[notificar-deploy] erro:", e);
  process.exit(1);
});
