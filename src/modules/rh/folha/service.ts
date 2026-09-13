/**
 * Holerite CLT — regra pura do PDF (plano 2026-09-13-folha-clt-import-assinatura.md, P3). Sem
 * Prisma e sem Next, mesmo corte de `financeiro/recibo/service.ts`.
 *
 * Diferença deliberada do recibo de produção: o recibo grava um TEXTO fixo (+ hash) porque é
 * gerado uma vez e nunca mexido depois. O holerite não tem texto — o documento É os itens
 * (`HoleriteItem`), que o RH pode editar enquanto a folha está `aberta`. A garantia de "o que a
 * pessoa assinou é o que está gravado" não vem de um hash aqui: vem de `assinarHolerite` só
 * aceitar com a folha `fechada` (itens travados por `salvarHolerite`/`removerHolerite`, que
 * recusam editar folha fechada) e de `reabrirFolha` **limpar a assinatura** de quem reabre a
 * folha pra editar de novo (ver `actions.ts`) — sem isso, reabrir e editar deixaria uma
 * assinatura antiga descrevendo itens que não são mais os que estão gravados.
 */

import { brl, formatarData } from "@/lib/utils";
import { MESES_CURTOS } from "@/lib/data";

export type ItemHoleritePdf = {
  descricao: string;
  tipo: "provento" | "desconto";
  valor: number;
};

export type HoleritePdf = {
  id: string;
  nomeFuncionario: string;
  ano: number;
  mes: number;
  itens: ItemHoleritePdf[];
  assinadoEm: Date | null;
  assinanteNome: string | null;
};

function escapar(txt: string): string {
  return txt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linhaItem(i: ItemHoleritePdf): string {
  const sinal = i.tipo === "desconto" ? "-" : "";
  return `<tr><td>${escapar(i.descricao)}</td><td class="valor ${i.tipo}">${sinal}${brl(i.valor)}</td></tr>`;
}

/** HTML do PDF (puppeteer `setContent`, mesmo caminho do recibo de produção e da memória de cálculo). */
export function renderHoleriteHtml(h: HoleritePdf): string {
  const proventos = h.itens.filter((i) => i.tipo === "provento").reduce((s, i) => s + i.valor, 0);
  const descontos = h.itens.filter((i) => i.tipo === "desconto").reduce((s, i) => s + i.valor, 0);
  const liquido = proventos - descontos;
  const competencia = `${MESES_CURTOS[h.mes - 1]}/${h.ano}`;

  const assinatura = h.assinadoEm
    ? `<p><strong>Assinado eletronicamente por ${escapar(h.assinanteNome ?? "—")}</strong><br>em ${formatarData(h.assinadoEm)}</p>`
    : `<p class="pendente">Holerite ainda não assinado pelo funcionário.</p>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Holerite ${escapar(competencia)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 12px/1.5 -apple-system, "Segoe UI", Arial, sans-serif; color: #16211b; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .sub { color: #52645a; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  td { padding: 6px 0; border-bottom: 1px solid #e4e9e1; }
  .valor { text-align: right; font-variant-numeric: tabular-nums; }
  .desconto { color: #a12b2b; }
  .total td { border-top: 2px solid #16211b; border-bottom: none; font-weight: 700; padding-top: 10px; }
  .rodape { border-top: 1px solid #c9d2c5; padding-top: 10px; margin-top: 18px; font-size: 10px; color: #52645a; }
  .pendente { color: #a9660a; font-weight: 600; }
</style></head>
<body>
  <h1>HOLERITE — ${escapar(h.nomeFuncionario)}</h1>
  <p class="sub">Competência: ${escapar(competencia)}</p>
  <table>
    ${h.itens.map(linhaItem).join("\n")}
    <tr class="total"><td>Líquido</td><td class="valor">${brl(liquido)}</td></tr>
  </table>
  ${assinatura}
  <div class="rodape">
    <p>Holerite nº <strong>${escapar(h.id)}</strong></p>
  </div>
</body></html>`;
}
