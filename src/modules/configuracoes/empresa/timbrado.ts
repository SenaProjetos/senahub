/**
 * Timbrado dos PDFs gerados pelo sistema (holerite CLT, recibo de produção). Puro — sem I/O:
 * `logoDataUri` já chega pronto, quem lê o logo do storage é `empresaParaTimbrado()` em
 * `queries.ts`, chamada pela rota do PDF (o puppeteer carrega o HTML via `setContent`, sem sessão
 * pra baixar o logo de uma rota autenticada).
 */

export type EmpresaTimbrado = {
  razaoSocial: string;
  cnpj: string | null;
  endereco: string | null;
  logoDataUri: string | null;
};

function escapar(txt: string): string {
  return txt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Vai dentro do `<style>` do documento. */
export const TIMBRADO_CSS = `
  .timbrado { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #c9d2c5; }
  .timbrado .logo { max-height: 48px; max-width: 120px; object-fit: contain; }
  .razao-social { margin: 0; font-size: 13px; font-weight: 700; }
  .timbrado-linha { margin: 2px 0 0; font-size: 10px; color: #52645a; }
`;

/** `null` = ninguém preencheu Configurações → Empresa ainda; o PDF sai sem cabeçalho. */
export function timbradoHtml(e: EmpresaTimbrado | null): string {
  if (!e) return "";
  const logo = e.logoDataUri ? `<img src="${e.logoDataUri}" alt="" class="logo">` : "";
  const linhas = [e.cnpj ? `CNPJ ${escapar(e.cnpj)}` : null, e.endereco ? escapar(e.endereco) : null]
    .filter(Boolean)
    .join(" · ");
  return `<div class="timbrado">
    ${logo}
    <div>
      <p class="razao-social">${escapar(e.razaoSocial)}</p>
      ${linhas ? `<p class="timbrado-linha">${linhas}</p>` : ""}
    </div>
  </div>`;
}
