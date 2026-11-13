import { type NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { createRequire } from "node:module";

import { ActionError } from "@/lib/action-error";
import { can } from "@/lib/permissions";
import { requireInterno } from "@/lib/session";
import { empresaParaTimbrado } from "@/modules/configuracoes/empresa/queries";
import { nomeDoArquivo, paraMemoriaDoc } from "@/modules/estudos/cargas-demanda/relatorio/formato";
import { renderRelatorioDocx } from "@/modules/estudos/cargas-demanda/relatorio/render-docx";
import { abrirFaixaDoCabecalho, cabecalhoPdfDoTimbrado } from "@/modules/estudos/cargas-demanda/relatorio/timbrado";
import { preencherWorkbookRelatorio } from "@/modules/estudos/cargas-demanda/relatorio/render-xlsx";
import { memoriaDoEstudo } from "@/modules/estudos/memoria";
import { slugCalculo } from "@/modules/ferramentas/export-util";
import { renderMemoriaDocx } from "@/modules/ferramentas/memoria/render-docx";
import { renderMemoriaHtml } from "@/modules/ferramentas/memoria/render-html";
import { htmlParaPdf } from "@/modules/ferramentas/memoria/render-pdf";
import { preencherWorkbookMemoria } from "@/modules/ferramentas/memoria/render-xlsx";

const require = createRequire(import.meta.url);
// exceljs é CommonJS — evita problema de default export no Turbopack.
const ExcelJS = require("exceljs") as typeof import("exceljs");

const FORMATOS = ["pdf", "docx", "xlsx"] as const;
type Formato = (typeof FORMATOS)[number];

/**
 * Memória do estudo em PDF, Word ou Excel (`?formato=`). A rota fica fora do middleware: ela mesma
 * confere a sessão, a permissão das ferramentas e o acesso ao projeto (`memoriaDoEstudo`).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formato = req.nextUrl.searchParams.get("formato") as Formato | null;
  if (!formato || !FORMATOS.includes(formato)) return new Response("Formato inválido.", { status: 400 });

  let user;
  try {
    user = await requireInterno();
    if (!(await can(user, "ferramentas", "usar"))) return new Response("Não autorizado.", { status: 401 });
  } catch {
    return new Response("Não autorizado.", { status: 401 });
  }

  let arquivo: string;
  let html: () => string;
  let cabecalhoPdf: string | undefined;
  let docx: () => Promise<Buffer>;
  let xlsx: (wb: import("exceljs").Workbook) => void;
  try {
    const res = await memoriaDoEstudo(user, id);
    if (!res) return new Response("Estudo não encontrado ou sem cargas para exportar.", { status: 404 });
    if (res.tipo === "cargas_demanda") {
      // Relatório do estudo de cargas e demanda: o PDF usa o renderizador comum; o Word e o Excel, os próprios (formato compacto).
      const rel = res.relatorio;
      // Timbrado da empresa (Configurações → Empresa) em todos os formatos; sem ele preenchido, o relatório sai sem cabeçalho.
      const empresa = await empresaParaTimbrado();
      const memoria = paraMemoriaDoc(rel);
      html = () => abrirFaixaDoCabecalho(renderMemoriaHtml(memoria), empresa);
      cabecalhoPdf = cabecalhoPdfDoTimbrado(empresa) ?? undefined;
      arquivo = nomeDoArquivo(rel);
      docx = () => Packer.toBuffer(renderRelatorioDocx(rel, empresa));
      xlsx = (wb) => preencherWorkbookRelatorio(wb, rel, empresa);
    } else {
      html = () => renderMemoriaHtml(res.doc);
      arquivo = slugCalculo(res.nome);
      docx = () => Packer.toBuffer(renderMemoriaDocx(res.doc));
      xlsx = (wb) => preencherWorkbookMemoria(wb, res.doc);
    }
  } catch (e) {
    // Mesma resposta da página (404) para projeto fora do escopo e motor em validação: não diz se o id existe.
    if (e instanceof ActionError) return new Response("Estudo não encontrado.", { status: 404 });
    console.error("[estudos/memoria] falha ao montar a memória:", e);
    return new Response("Não foi possível montar a memória do estudo.", { status: 500 });
  }

  try {
    return await gerarArquivo(formato, html, cabecalhoPdf, arquivo, docx, xlsx);
  } catch (e) {
    console.error("[estudos/memoria] falha ao gerar o arquivo:", e);
    return new Response("Não foi possível gerar o arquivo.", { status: 500 });
  }
}

async function gerarArquivo(formato: Formato, html: () => string, cabecalhoPdf: string | undefined, arquivo: string, docx: () => Promise<Buffer>, xlsx: (wb: import("exceljs").Workbook) => void): Promise<Response> {
  if (formato === "pdf") {
    const pdf = await htmlParaPdf(html(), { headerTemplate: cabecalhoPdf });
    if (!pdf) return new Response("Não foi possível gerar o PDF neste servidor. Avise a equipe de TI.", { status: 503 });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${arquivo}.pdf"` },
    });
  }
  if (formato === "docx") {
    const buffer = await docx();
    return new NextResponse(buffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${arquivo}.docx"`,
      },
    });
  }
  const wb = new ExcelJS.Workbook();
  xlsx(wb);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}.xlsx"`,
    },
  });
}
