import "server-only";
import type { MaquinaDetalhe } from "@/modules/patrimonio/queries";
import { brl, formatarData } from "@/lib/utils";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** HTML do relatório de uma máquina (specs + peças + histórico) para impressão/PDF. */
export function renderMaquinaHtml(m: MaquinaDetalhe): string {
  const specs: [string, string][] = [
    ["CPU", m.cpu ?? "—"],
    ["Memória", m.ram ?? "—"],
    ["Armazenamento", m.armazenamento ?? "—"],
    ["Sistema operacional", m.so ?? "—"],
    ["Responsável", m.responsavel?.name ?? "—"],
    ["Ativo vinculado", m.patrimonio?.nome ?? "—"],
  ];
  const specsRows = specs
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("");

  const compRows = m.componentes.length
    ? m.componentes
        .map((c) => `<tr><td>${esc(c.tipo)}</td><td>${esc(c.descricao)}</td><td style="text-align:right">${c.quantidade}</td></tr>`)
        .join("")
    : `<tr><td colspan="3" class="vazio">Nenhuma peça registrada.</td></tr>`;

  const manutRows = m.manutencoes.length
    ? m.manutencoes
        .map((x) => `<tr><td>${formatarData(x.data)}</td><td>${esc(x.descricao)}</td><td style="text-align:right">${x.custo != null ? brl(Number(x.custo)) : "—"}</td></tr>`)
        .join("")
    : `<tr><td colspan="3" class="vazio">Nenhuma manutenção registrada.</td></tr>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1c2d58; margin: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 24px 0 6px; border-bottom: 2px solid #1c2d58; padding-bottom: 3px; }
  .meta { color: #576980; font-size: 11px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #cacac8; text-align: left; vertical-align: top; }
  table.specs th { width: 180px; color: #576980; font-weight: 600; }
  thead th { background: #1c2d58; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .vazio { color: #6e838b; font-style: italic; }
  .obs { margin-top: 8px; color: #576980; }
  footer { margin-top: 32px; color: #6e838b; font-size: 10px; border-top: 1px solid #cacac8; padding-top: 6px; }
</style></head><body>
  <h1>Relatório da máquina — ${esc(m.nome)}</h1>
  <p class="meta">Sena Projetos · Patrimônio / TI · emitido em ${formatarData(new Date())}</p>

  <h2>Especificações</h2>
  <table class="specs"><tbody>${specsRows}</tbody></table>
  ${m.observacao ? `<p class="obs">${esc(m.observacao)}</p>` : ""}

  <h2>Peças / componentes (${m.componentes.length})</h2>
  <table><thead><tr><th>Tipo</th><th>Descrição</th><th style="text-align:right">Qtd</th></tr></thead><tbody>${compRows}</tbody></table>

  <h2>Histórico de manutenção (${m.manutencoes.length})</h2>
  <table><thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right">Custo</th></tr></thead><tbody>${manutRows}</tbody></table>

  <footer>Documento gerado pelo SenaHub.</footer>
</body></html>`;
}
