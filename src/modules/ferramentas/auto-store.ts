/**
 * Auto-store: gera arquivos de um cálculo salvo e os registra como Upload
 * na disciplina/projeto associados. Chamado de salvarCalculo (best-effort).
 *
 * .shcalc.json → Pacote B (backup do modelo)
 * .docx / .xlsx / .dxf → Pacote A (pranchas e arquivos)
 * .pdf → Pacote A somente se CHROME_PATH disponível
 *
 * Upload.origem = "ferramenta" → não conta em validarEntrega.
 */
import "server-only";
import { createRequire } from "node:module";
import { Packer } from "docx";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, slug } from "@/lib/storage";
import { escopoProjeto } from "@/modules/projetos/queries";
import { serializar } from "./savefile";
import { getFerramenta } from "./registry";
import { montarMemoria } from "./service";
import { renderMemoriaHtml } from "./memoria/render-html";
import { renderMemoriaDocx } from "./memoria/render-docx";
import { preencherWorkbookMemoria } from "./memoria/render-xlsx";
import { desenharDxf } from "./dxf";
import type { Role } from "@/lib/roles";

const req = createRequire(import.meta.url);
const ExcelJS = req("exceljs") as typeof import("exceljs");

export type AutoStoreParams = {
  ferramenta: string;
  titulo: string;
  entradas: Record<string, unknown>;
  projetoId: string;
  disciplinaId: string;
  autorId: string;
  autorNome: string | null | undefined;
  userRole: Role;
};

async function salvarUpload(opts: {
  disciplinaId: string;
  pacote: "A" | "B";
  nomeArquivo: string;
  buffer: Buffer;
  mimeType: string;
  autorId: string;
  baseDir: string;
}) {
  const { disciplinaId, pacote, nomeArquivo, buffer, mimeType, autorId, baseDir } = opts;

  const anterior = await prisma.upload.findFirst({
    where: { disciplinaId, pacote, nomeArquivo },
    orderBy: { versao: "desc" },
    select: { versao: true },
  });
  const versao = anterior ? anterior.versao + 1 : 1;

  const ext = nomeArquivo.includes(".") ? nomeArquivo.slice(nomeArquivo.lastIndexOf(".")) : "";
  const baseNome = ext ? nomeArquivo.slice(0, -(ext.length)) : nomeArquivo;
  const nomeVers =
    versao > 1
      ? `${slug(baseNome)}__v${versao}${ext}`
      : `${slug(baseNome)}${ext}`;
  const relativo = `${baseDir}/${pacote}/${nomeVers}`;

  const salvo = await salvarArquivo(relativo, buffer);

  await prisma.upload.create({
    data: {
      disciplinaId,
      pacote,
      nomeArquivo,
      caminho: salvo.caminho,
      hashSha256: salvo.hashSha256,
      tamanho: salvo.tamanho,
      mimeType,
      versao,
      origem: "ferramenta",
      autorId,
    },
  });
}

export async function autoStore(params: AutoStoreParams): Promise<void> {
  const { ferramenta, titulo, entradas, projetoId, disciplinaId, autorId, autorNome, userRole } = params;

  // Verifica que o usuário tem acesso ao projeto.
  const projetoAcessivel = await prisma.projeto.findFirst({
    where: { id: projetoId, AND: [escopoProjeto({ id: autorId, role: userRole })] },
    select: {
      id: true,
      ano: true,
      codigo: true,
      nome: true,
      cliente: { select: { nome: true } },
    },
  });
  if (!projetoAcessivel) return;

  const disciplina = await prisma.disciplina.findUnique({
    where: { id: disciplinaId },
    select: { nome: true },
  });
  if (!disciplina) return;

  const baseDir = [
    String(projetoAcessivel.ano),
    slug(projetoAcessivel.cliente.nome),
    `${projetoAcessivel.codigo}_${slug(projetoAcessivel.nome)}`,
    slug(disciplina.nome),
  ].join("/");

  const meta = getFerramenta(ferramenta);
  const tituloSlug = `calc-${slug(titulo)}`;

  // 1. .shcalc.json → Pacote B
  try {
    const json = serializar({
      ferramenta,
      versaoCalc: 1,
      titulo,
      norma: meta?.norma,
      entradas,
    });
    await salvarUpload({
      disciplinaId,
      pacote: "B",
      nomeArquivo: `${tituloSlug}.shcalc.json`,
      buffer: Buffer.from(json, "utf-8"),
      mimeType: "application/json",
      autorId,
      baseDir,
    });
  } catch { /* melhor esforço */ }

  // Monta MemoriaDoc uma vez para os exportadores (A: docx/xlsx/dxf/pdf).
  let doc: ReturnType<typeof montarMemoria> | null = null;
  try {
    doc = montarMemoria(ferramenta, entradas, {
      titulo,
      autor: autorNome ?? undefined,
      projeto: `${projetoAcessivel.codigo} — ${projetoAcessivel.nome}`,
      geradoEm: new Date().toISOString(),
    });
  } catch { /* sem memória, pula exportações */ }

  if (!doc) return;

  // 2. .docx → Pacote A
  try {
    const buffer = Buffer.from(await Packer.toBuffer(renderMemoriaDocx(doc)));
    await salvarUpload({
      disciplinaId,
      pacote: "A",
      nomeArquivo: `${tituloSlug}.docx`,
      buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      autorId,
      baseDir,
    });
  } catch { /* melhor esforço */ }

  // 3. .xlsx → Pacote A
  try {
    const wb = new ExcelJS.Workbook();
    preencherWorkbookMemoria(wb, doc);
    const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    await salvarUpload({
      disciplinaId,
      pacote: "A",
      nomeArquivo: `${tituloSlug}.xlsx`,
      buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      autorId,
      baseDir,
    });
  } catch { /* melhor esforço */ }

  // 4. .dxf → Pacote A (somente ferramentas com desenho)
  try {
    const dxf = desenharDxf(ferramenta, entradas);
    if (dxf) {
      await salvarUpload({
        disciplinaId,
        pacote: "A",
        nomeArquivo: `${tituloSlug}.dxf`,
        buffer: Buffer.from(dxf, "utf-8"),
        mimeType: "application/dxf",
        autorId,
        baseDir,
      });
    }
  } catch { /* melhor esforço */ }

  // 5. .pdf → Pacote A (somente se CHROME_PATH disponível)
  const chrome = process.env.CHROME_PATH;
  if (chrome) {
    try {
      const puppeteer = (await import("puppeteer-core")).default;
      const html = renderMemoriaHtml(doc);
      const browser = await puppeteer.launch({
        executablePath: chrome,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load", timeout: 30000 });
        await page.emulateMediaType("print");
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        await salvarUpload({
          disciplinaId,
          pacote: "A",
          nomeArquivo: `${tituloSlug}.pdf`,
          buffer: Buffer.from(pdf),
          mimeType: "application/pdf",
          autorId,
          baseDir,
        });
      } finally {
        await browser.close();
      }
    } catch { /* melhor esforço */ }
  }
}
