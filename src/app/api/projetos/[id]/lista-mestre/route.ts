import { type NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ActionError } from "@/lib/action-error";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { empresaParaTimbrado } from "@/modules/configuracoes/empresa/queries";
import { gerarPdfDoHtml } from "@/modules/juridico/contrato/gerar";
import { carregarListaMestre } from "@/modules/projetos/lista-mestre/service";
import { preencherPlanilhaListaMestre, renderListaMestreHtml } from "@/modules/projetos/lista-mestre/render";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof import("exceljs");

/**
 * Lista Mestre de uma disciplina, montada dos documentos validados em Pranchas.
 *
 * `formato=json` devolve a prévia (nome, fase/tipo e linhas) que o diálogo mostra; `pdf` e `xlsx`
 * devolvem o arquivo. Esta rota só GERA: quem grava é o navegador, enviando os dois arquivos pela
 * rota de upload de sempre — assim revisão, documento, histórico e permissão de envio são os
 * mesmos de qualquer outro arquivo, sem um segundo caminho de persistência.
 *
 * `/api` fica fora do middleware: a sessão é conferida aqui.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (session.user.mustChangePassword || !session.user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  if (!(await can(session.user, "projetos", "ver"))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const projeto = await projetoVisivel(session.user, id);
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

  const disciplinaId = req.nextUrl.searchParams.get("disciplinaId");
  const formato = req.nextUrl.searchParams.get("formato") ?? "json";
  if (!disciplinaId) return NextResponse.json({ error: "Informe a disciplina." }, { status: 400 });
  if (!["json", "pdf", "xlsx"].includes(formato)) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  }

  const lista = await carregarListaMestre(session.user, projeto, disciplinaId);
  if (!lista.ok) return NextResponse.json({ error: lista.erro }, { status: lista.status });

  if (formato === "json") {
    return NextResponse.json({
      nome: lista.nome,
      faseId: lista.faseId,
      tipoId: lista.tipoId,
      tipoNome: lista.tipoNome,
      documentoExistenteId: lista.documentoExistenteId,
      disciplinaNome: lista.disciplina.nome,
      linhas: lista.linhas,
    });
  }

  const cabecalho = {
    nomeArquivo: lista.nome,
    projetoCodigo: projeto.codigo,
    projetoNome: projeto.nome,
    disciplinaNome: lista.disciplina.nome,
    geradoEm: new Date(),
    geradoPor: session.user.name ?? null,
  };

  if (formato === "xlsx") {
    const wb = new ExcelJS.Workbook();
    preencherPlanilhaListaMestre(wb, cabecalho, lista.linhas);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${lista.nome}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const pdf = await gerarPdfDoHtml(renderListaMestreHtml(cabecalho, lista.linhas, await empresaParaTimbrado()));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${lista.nome}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // `gerarPdfDoHtml` avisa com mensagem de negócio quando falta CHROME_PATH ou a fila lota.
    const mensagem = error instanceof ActionError ? error.message : "Não foi possível gerar o PDF.";
    return NextResponse.json({ error: mensagem }, { status: 503 });
  }
}
