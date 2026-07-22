/**
 * Moldura visual dos e-mails do sistema (client-safe, sem `server-only`, testável).
 * Envolve o corpo HTML (já convertido do Markdown) num layout branded com as cores
 * do SenaHub. Usa tabelas + estilos inline — regra de ouro para compatibilidade com
 * clientes de e-mail (Outlook/Gmail ignoram <style>/CSS externo/variáveis).
 *
 * Sempre em paleta clara: clientes de e-mail não têm o toggle de tema do app.
 */

// Cores derivadas de globals.css (:root) — literais porque e-mail não resolve CSS vars.
const COR_PRIMARIA = "#1c2d58"; // --primary (navy)
const COR_TEXTO = "#1c2d58"; // --foreground
const COR_FUNDO = "#eff1f3"; // --background
const COR_CARTAO = "#ffffff";
const COR_SUAVE = "#5b6472"; // texto secundário/rodapé
const COR_BORDA = "#dfe3e8";

/** Escapa texto para uso seguro em atributo/preheader HTML. */
function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Envolve o HTML interno na moldura branded do SenaHub.
 * @param innerHtml corpo já em HTML (saída do Markdown).
 * @param opts.preheader texto de pré-visualização (oculto no corpo, aparece na lista do inbox).
 */
export function wrapEmail(innerHtml: string, opts?: { preheader?: string }): string {
  const appUrl = process.env.APP_URL || "";
  const ano = new Date().getFullYear();
  const preheader = opts?.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">${escaparHtml(opts.preheader)}</div>`
    : "";
  const rodapeLink = appUrl
    ? `<a href="${escaparHtml(appUrl)}" style="color:${COR_PRIMARIA};text-decoration:none">${escaparHtml(appUrl.replace(/^https?:\/\//, ""))}</a>`
    : "SenaHub";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${COR_FUNDO};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COR_TEXTO}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_FUNDO};padding:24px 12px">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COR_CARTAO};border:1px solid ${COR_BORDA};border-radius:8px;overflow:hidden">
        <tr>
          <td style="background:${COR_PRIMARIA};padding:20px 28px">
            <span style="font-size:20px;font-weight:800;letter-spacing:0.5px;color:#ffffff">SenaHub</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;font-size:15px;line-height:1.6;color:${COR_TEXTO}">
${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid ${COR_BORDA};font-size:12px;line-height:1.5;color:${COR_SUAVE}">
            Enviado automaticamente pelo ${rodapeLink} — sistema de gestão da Sena Projetos.<br>
            &copy; ${ano} Sena Projetos. Não responda a este e-mail.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
