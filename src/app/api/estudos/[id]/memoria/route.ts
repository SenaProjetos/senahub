import { type NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { createRequire } from "node:module";

import { ActionError } from "@/lib/action-error";
import { can } from "@/lib/permissions";
import { requireInterno } from "@/lib/session";
import { memoriaDoEstudo } from "@/modules/estudos/memoria";
import { slugCalculo } from "@/modules/ferramentas/export-util";
import { renderMemoriaDocx } from "@/modules/ferramentas/memoria/render-docx";
import { renderMemoriaHtml } from "@/modules/ferramentas/memoria/render-html";
import { htmlParaPdf } from "@/modules/ferramentas/memoria/render-pdf";
import { preencherWorkbookMemoria } from "@/modules/ferramentas/memoria/render-xlsx";
import type { MemoriaDoc } from "@/modules/ferramentas/memoria/types";

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

  let doc: MemoriaDoc;
  let nome: string;
  try {
    const res = await memoriaDoEstudo(user, id);
    if (!res) return new Response("Estudo não encontrado ou sem cargas para exportar.", { status: 404 });
    ({ doc, nome } = res);
  } catch (e) {
    if (e instanceof ActionError) return new Response(e.message, { status: 403 });
    console.error("[estudos/memoria] falha ao montar a memória:", e);
    return new Response("Não foi possível montar a memória do estudo.", { status: 500 });
  }

  try {
    return await gerarArquivo(formato, doc, slugCalculo(nome));
  } catch (e) {
    console.error("[estudos/memoria] falha ao gerar o arquivo:", e);
    return new Response("Não foi possível gerar o arquivo.", { status: 500 });
  }
}

async function gerarArquivo(formato: Formato, doc: MemoriaDoc, arquivo: string): Promise<Response> {
  if (formato === "pdf") {
    const pdf = await htmlParaPdf(renderMemoriaHtml(doc));
    if (!pdf) return new Response("Não foi possível gerar o PDF neste servidor. Avise a equipe de TI.", { status: 503 });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${arquivo}.pdf"` },
    });
  }
  if (formato === "docx") {
    const buffer = await Packer.toBuffer(renderMemoriaDocx(doc));
    return new NextResponse(buffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${arquivo}.docx"`,
      },
    });
  }
  const wb = new ExcelJS.Workbook();
  preencherWorkbookMemoria(wb, doc);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}.xlsx"`,
    },
  });
}
