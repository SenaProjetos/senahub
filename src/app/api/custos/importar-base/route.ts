import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { salvarArquivo, nomeArquivoLimpo, removerArquivo } from "@/lib/storage";
import { IMPORT_TAMANHO_MAX } from "@/lib/import/planilha";
import {
  lerMesReferencia,
  mesReferenciaParaDataBase,
  SHEET_ANALITICO,
  SHEET_POR_REGIME,
} from "@/modules/custos/composicoes/importador-sinapi";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");
const CAMINHO_IMPORTACAO = /^custos\/importacoes\/[a-f0-9]{24}\.xlsx$/;

async function podeAdministrarBancos() {
  const session = await getSession();
  if (!session) return { ok: false as const, status: 401, error: "Não autenticado." };
  const { can } = await import("@/lib/permissions");
  if (!(await can(session.user, "custos", "bancos"))) {
    return { ok: false as const, status: 403, error: "Sem permissão." };
  }
  return { ok: true as const };
}

async function detectarReferencia(buffer: Buffer): Promise<{ mesReferencia: string | null; dataBase: string | null }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const nomes = [...new Set([...Object.values(SHEET_POR_REGIME), SHEET_ANALITICO])];
  for (const nome of nomes) {
    const sheet = wb.getWorksheet(nome);
    if (!sheet) continue;
    const mesReferencia = lerMesReferencia(sheet);
    const dataBase = mesReferenciaParaDataBase(mesReferencia);
    if (dataBase) return { mesReferencia, dataBase };
  }
  return { mesReferencia: null, dataBase: null };
}

/**
 * Recebe o workbook "Referência" do SINAPI (.xlsx) e devolve o caminho salvo — a action
 * `iniciarImportacaoBase` enfileira o job a partir dele. Gate: `custos:bancos` (base
 * corrompida contamina todo orçamento, por isso separado de `custos:gerir`).
 */
export async function POST(req: Request) {
  const acesso = await podeAdministrarBancos();
  if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: "Envie o arquivo .xlsx (workbook Referência do SINAPI)." }, { status: 400 });
  }
  if (file.size > IMPORT_TAMANHO_MAX) {
    return NextResponse.json({ error: "Arquivo grande demais (máx. 20 MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let referencia: { mesReferencia: string | null; dataBase: string | null };
  try {
    referencia = await detectarReferencia(buffer);
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o workbook .xlsx enviado." }, { status: 400 });
  }

  const somenteMetadados = new URL(req.url).searchParams.get("somenteMetadados") === "1";
  if (somenteMetadados) return NextResponse.json(referencia);

  const nome = nomeArquivoLimpo(file.name);
  const rel = `custos/importacoes/${randomBytes(12).toString("hex")}.xlsx`;
  const salvo = await salvarArquivo(rel, buffer);
  return NextResponse.json({
    caminho: salvo.caminho,
    nomeArquivo: nome,
    tamanho: salvo.tamanho,
    ...referencia,
  });
}

/**
 * Remove somente um upload temporário ainda não enfileirado. O caminho é
 * rigidamente limitado ao namespace aleatório desta rota, sem aceitar caminhos
 * calculados pelo cliente fora de `custos/importacoes`.
 */
export async function DELETE(req: Request) {
  const acesso = await podeAdministrarBancos();
  if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });

  const body = await req.json().catch(() => null) as { caminho?: unknown } | null;
  const caminho = typeof body?.caminho === "string" ? body.caminho : "";
  if (!CAMINHO_IMPORTACAO.test(caminho)) {
    return NextResponse.json({ error: "Caminho temporário inválido." }, { status: 400 });
  }

  const importacao = await prisma.custoImportacao.findFirst({
    where: { caminhoArquivo: caminho },
    select: { id: true },
  });
  if (importacao) {
    return NextResponse.json(
      { error: "O arquivo já pertence a uma importação e não pode ser removido." },
      { status: 409 },
    );
  }

  await removerArquivo(caminho);
  return NextResponse.json({ ok: true });
}
