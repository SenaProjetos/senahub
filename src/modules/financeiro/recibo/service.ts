/**
 * Recibo de pagamento de produção (G5/D36) — regras puras: o TEXTO que o projetista assina e
 * o HTML que vira PDF. Sem Prisma e sem Next, como `folha/service.ts`.
 *
 * O texto é o documento. É ele que vai para o banco (`ReciboProjetista.texto`) junto com o
 * SHA-256 dele — mesma prova do aceite de Termos de Uso (`modules/legal`). Guardar só o hash
 * não permitiria reexibir depois o que foi assinado; guardar só o texto não detectaria
 * adulteração. Por isso os dois.
 *
 * Determinístico de propósito: mesmo recibo, mesmo texto, mesmo hash. Nada de `new Date()`
 * aqui dentro — quem chama passa a data.
 */

import { brl, formatarData } from "@/lib/utils";
import { MESES_CURTOS } from "@/lib/data";
import { TIMBRADO_CSS, timbradoHtml, type EmpresaTimbrado } from "@/modules/configuracoes/empresa/timbrado";

export type TipoRecibo = "individual" | "mensal";

export type ItemRecibo = {
  projetoCodigo: string;
  projetoNome: string;
  disciplina: string;
  liberadoEm: Date | string;
  pagoEm: Date | string | null;
  valor: number;
};

export type DadosRecibo = {
  tipo: TipoRecibo;
  projetistaNome: string;
  /** Competência do consolidado mensal; ignorada no individual. */
  ano?: number | null;
  mes?: number | null;
  itens: ItemRecibo[];
  emitidoEm: Date;
};

/** Soma dos itens — o valor do recibo nunca é digitado, sempre derivado. */
export function totalRecibo(itens: ItemRecibo[]): number {
  return itens.reduce((s, i) => s + i.valor, 0);
}

export function competenciaRecibo(ano?: number | null, mes?: number | null): string | null {
  if (!ano || !mes || mes < 1 || mes > 12) return null;
  return `${MESES_CURTOS[mes - 1]}/${ano}`;
}

function linhaItem(i: ItemRecibo): string {
  const pago = i.pagoEm ? `pago em ${formatarData(i.pagoEm)}` : "pagamento sem data";
  return `- ${i.projetoCodigo} · ${i.projetoNome} — ${i.disciplina} (liberado em ${formatarData(i.liberadoEm)}, ${pago}): ${brl(i.valor)}`;
}

/**
 * Texto assinável. Formato estável: mudar este texto muda o hash, então recibo antigo
 * continua guardando (e reexibindo) a redação que a pessoa realmente leu.
 */
export function textoRecibo(d: DadosRecibo): string {
  const competencia = competenciaRecibo(d.ano, d.mes);
  const cabecalho = [
    "RECIBO DE PAGAMENTO DE PRODUÇÃO",
    `Emitido em ${formatarData(d.emitidoEm)}`,
    `Projetista: ${d.projetistaNome}`,
    d.tipo === "mensal" && competencia ? `Competência: ${competencia}` : null,
    `Entregas: ${d.itens.length}`,
    `Valor total: ${brl(totalRecibo(d.itens))}`,
  ].filter(Boolean) as string[];

  return [
    cabecalho.join("\n"),
    "",
    "ENTREGAS",
    ...d.itens.map(linhaItem),
    "",
    "DECLARAÇÃO",
    "Declaro que recebi os valores discriminados acima, referentes às entregas listadas, e",
    "dou plena quitação quanto a elas.",
    "",
    "Este recibo é assinado eletronicamente dentro do sistema: ficam registrados o nome de",
    "quem assinou, a data e a hora, e o código de verificação (SHA-256) deste texto.",
  ].join("\n");
}

function escapar(txt: string): string {
  return txt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ReciboParaPdf = {
  numero: string;
  texto: string;
  textoHash: string;
  assinadoEm: Date | null;
  assinanteNome: string | null;
  /**
   * Cabeçalho visual, FORA do texto assinado: `textoRecibo()` e o hash não mudam — senão todo
   * recibo antigo deixaria de bater com o próprio código de verificação.
   */
  empresa: EmpresaTimbrado | null;
};

/**
 * HTML do PDF (puppeteer `setContent`, mesmo caminho da memória de cálculo). Renderiza o
 * TEXTO GRAVADO, não um texto remontado agora: o PDF tem de mostrar o que foi assinado,
 * mesmo que a redação do gerador mude depois.
 */
export function renderReciboHtml(r: ReciboParaPdf): string {
  const assinatura = r.assinadoEm
    ? `<p><strong>Assinado eletronicamente por ${escapar(r.assinanteNome ?? "—")}</strong><br>em ${formatarData(r.assinadoEm)}</p>`
    : `<p class="pendente">Recibo ainda não assinado pelo projetista.</p>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${escapar(r.numero)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 12px/1.5 -apple-system, "Segoe UI", Arial, sans-serif; color: #16211b; }
  ${TIMBRADO_CSS}
  pre { font: 12px/1.6 "Courier New", monospace; white-space: pre-wrap; margin: 0 0 18px; }
  .rodape { border-top: 1px solid #c9d2c5; padding-top: 10px; margin-top: 18px; font-size: 10px; color: #52645a; }
  .pendente { color: #a9660a; font-weight: 600; }
  code { word-break: break-all; }
</style></head>
<body>
  ${timbradoHtml(r.empresa)}
  <pre>${escapar(r.texto)}</pre>
  ${assinatura}
  <div class="rodape">
    <p>Recibo nº <strong>${escapar(r.numero)}</strong></p>
    <p>Código de verificação (SHA-256 do texto acima):<br><code>${escapar(r.textoHash)}</code></p>
  </div>
</body></html>`;
}
