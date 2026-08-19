import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { logAudit, getClientIp } from "@/lib/audit";
import { formatarCodigo } from "@/modules/projetos/numbering";
// Rótulos de status vêm do catálogo central (item 22) — ter uma cópia aqui fez a planilha
// ficar sem os estados novos e chamar "descartada" de "Descartada" e não "Não procede".
import { SEVERIDADE_LABEL, STATUS_LABEL, TIPO_PENDENCIA_LABEL, type Severidade, type StatusPendencia, type TipoPendencia } from "@/modules/projetos/pendencias/helpers";
import { MARCACAO_LABEL, lerMarcacao } from "@/modules/projetos/pendencias/marcacao";
import { formatarMedida } from "@/modules/projetos/pendencias/medicao";

// exceljs é CommonJS — evita problema de default export no Turbopack (mesmo padrão das outras rotas).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require("exceljs") as typeof import("exceljs");

/**
 * Relatório de apontamentos em planilha (item 20, parte "relatório") — a metade barata do
 * item: `exceljs` já existia no projeto e nada aqui depende do PDF carimbado.
 *
 * Escopo por `upload` (a prancha aberta) ou por `projeto` (a carteira inteira). Gate igual ao
 * das rotas irmãs de apontamento (`/api/pendencias/bcf`).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  const url = new URL(req.url);
  const uploadId = url.searchParams.get("upload");
  const projetoParam = url.searchParams.get("projeto");
  if (!uploadId && !projetoParam) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  let projetoId = projetoParam ?? "";
  let escopo: Record<string, unknown>;
  let titulo = "Apontamentos";

  if (uploadId) {
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      select: { id: true, nomeArquivo: true, documentoId: true, disciplina: { select: { projetoId: true } } },
    });
    if (!upload) return NextResponse.json({ error: "Prancha não encontrada." }, { status: 404 });
    projetoId = upload.disciplina.projetoId;
    // Escopo do DOCUMENTO, como o resto do módulo: o pino aberto na R01 e herdado pela R02
    // pertence ao relatório da prancha que está sendo vista.
    escopo = upload.documentoId ? { documentoId: upload.documentoId } : { uploadId: upload.id };
    titulo = upload.nomeArquivo;
  } else {
    escopo = { projetoId };
  }

  if (!acessoGlobal(user)) {
    const [membro, resp] = await Promise.all([
      prisma.projetoMembro.findFirst({ where: { projetoId, userId: user.id }, select: { id: true } }),
      prisma.disciplinaResponsavel.findFirst({ where: { userId: user.id, disciplina: { projetoId } }, select: { id: true } }),
    ]);
    if (!membro && !resp) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const pendencias = await prisma.pendencia.findMany({
    // Rascunho (item 31) fora do relatório: só entra o que já foi entregue.
    where: { ...escopo, excluidoEm: null, publicadoEm: { not: null } },
    orderBy: [{ projetoId: "asc" }, { numero: "asc" }],
    include: {
      // Aninhado de propósito: a versão de origem pode estar na lixeira sem deixar de ser
      // história válida (mesmo motivo documentado em `pendenciasDoUpload`).
      upload: { select: { nomeArquivo: true, versao: true } },
      respostas: { select: { id: true } },
    },
  });

  const disciplinaIds = [...new Set(pendencias.map((p) => p.disciplinaId))];
  const projetoIds = [...new Set(pendencias.map((p) => p.projetoId))];
  const autorIds = [...new Set(pendencias.map((p) => p.autorId))];
  // `Pendencia` não tem relação Prisma para `User` (só a coluna `autorId`) — resolve o nome
  // à parte, igual `pendenciasDoUpload` já faz.
  const [disciplinas, projetos, autores] = await Promise.all([
    prisma.disciplina.findMany({ where: { id: { in: disciplinaIds } }, select: { id: true, disciplinaTextoLegado: true } }),
    prisma.projeto.findMany({ where: { id: { in: projetoIds } }, select: { id: true, codigo: true, nome: true } }),
    autorIds.length ? prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } }) : [],
  ]);
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.disciplinaTextoLegado]));
  const dadosProjeto = new Map(projetos.map((p) => [p.id, p]));
  const nomeAutor = new Map(autores.map((u) => [u.id, u.name]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Apontamentos");
  ws.columns = [
    { header: "Projeto", key: "projeto", width: 34 },
    { header: "Disciplina", key: "disciplina", width: 20 },
    { header: "Prancha", key: "prancha", width: 34 },
    { header: "Nº", key: "numero", width: 6 },
    { header: "Pág.", key: "pagina", width: 6 },
    { header: "Status", key: "status", width: 13 },
    { header: "Severidade", key: "severidade", width: 13 },
    { header: "Tipo", key: "tipo", width: 20 },
    { header: "Marcação", key: "marcacao", width: 16 },
    { header: "Medida", key: "medida", width: 12 },
    { header: "Descrição", key: "texto", width: 60 },
    { header: "Autor", key: "autor", width: 22 },
    { header: "Aberto em", key: "criado", width: 18 },
    { header: "Aberto na revisão", key: "revisao", width: 16 },
    { header: "Respostas", key: "respostas", width: 10 },
    { header: "Resolvido em", key: "resolvido", width: 18 },
    { header: "Fechado em", key: "fechado", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "Q1" };

  const dataHora = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");

  for (const p of pendencias) {
    const proj = dadosProjeto.get(p.projetoId);
    const marcacao = lerMarcacao(p.marcacaoTipo, p.marcacaoGeo);
    ws.addRow({
      projeto: proj ? `${formatarCodigo(proj.codigo)} — ${proj.nome}` : "—",
      disciplina: nomeDisciplina.get(p.disciplinaId) ?? "—",
      prancha: p.upload?.nomeArquivo ?? "—",
      numero: p.numero,
      pagina: p.pagina,
      status: STATUS_LABEL[p.status as StatusPendencia] ?? p.status,
      severidade: p.severidade ? (SEVERIDADE_LABEL[p.severidade as Severidade] ?? p.severidade) : "—",
      tipo: p.tipo ? (TIPO_PENDENCIA_LABEL[p.tipo as TipoPendencia] ?? p.tipo) : "—",
      // "Pino" quando não há forma: a coluna descreve o que foi marcado na prancha, e vazio
      // aqui leria como "faltou dado" em vez de "é um pino simples".
      marcacao: marcacao ? MARCACAO_LABEL[marcacao.tipo] : MARCACAO_LABEL.ponto,
      // Só apontamento de medição tem valor; nos outros a coluna fica vazia (o "—" de
      // `formatarMedida` seria ruído numa planilha que vai ser filtrada).
      medida: p.medidaMm != null ? formatarMedida(p.medidaMm) : "",
      texto: p.texto,
      autor: nomeAutor.get(p.autorId) ?? "—",
      criado: dataHora(p.createdAt),
      revisao: p.upload ? `R${String(p.upload.versao - 1).padStart(2, "0")}` : "—",
      respostas: p.respostas.length,
      resolvido: dataHora(p.resolvidoEm),
      fechado: dataHora(p.fechadoEm),
    });
  }

  await logAudit({
    userId: user.id,
    modulo: "projetos",
    acao: "exportar-relatorio-pendencias",
    resultado: "sucesso",
    entidade: "Pendencia",
    entidadeId: projetoId,
    detalhe: { total: pendencias.length, escopo: uploadId ? "prancha" : "projeto" },
    ip: await getClientIp(),
  });

  const buffer = await wb.xlsx.writeBuffer();
  const nome = `apontamentos-${titulo.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_")}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
