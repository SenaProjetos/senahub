import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { auditarBloqueioRateLimit, ipDaRequisicao, limitarRequisicao, respostaLimiteRequisicoes } from "@/lib/rate-limit";
import { linkAceiteEstaAtivo } from "@/modules/uploads/aceite";

const CAPABILITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

const postSchema = z.object({
  situacao: z.enum(["aceito", "revisao"]),
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  observacao: z.string().trim().max(2_000).optional(),
});

async function aceiteDoToken(token: string) {
  return prisma.aceiteCliente.findUnique({
    where: { token },
    select: {
      id: true,
      situacao: true,
      expiraEm: true,
      revogadoEm: true,
      upload: {
        select: {
          nomeArquivo: true,
          pacote: true,
          disciplina: { select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true, nome: true } } } },
        },
      },
    },
  });
}

function indisponivel(): NextResponse {
  return NextResponse.json({ error: "Este link não está mais disponível." }, { status: 410 });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const limite = limitarRequisicao(req, {
    escopo: "aceite-publico-leitura",
    identificador: "publico",
    maximo: 60,
    janelaMs: 5 * 60_000,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, { modulo: "uploads", acao: "consultar-aceite-publico", entidade: "AceiteCliente" });
    return respostaLimiteRequisicoes(limite);
  }
  const aceite = await aceiteDoToken(token);
  if (!aceite) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (!linkAceiteEstaAtivo(aceite)) return indisponivel();

  const { upload } = aceite;
  return NextResponse.json(
    {
      situacao: aceite.situacao,
      arquivo: upload.nomeArquivo,
      pacote: upload.pacote,
      disciplina: upload.disciplina.disciplinaTextoLegado,
      projeto: { codigo: upload.disciplina.projeto.codigo, nome: upload.disciplina.projeto.nome },
    },
    { headers: CAPABILITY_HEADERS },
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const limite = limitarRequisicao(req, {
    escopo: "aceite-publico-resposta",
    identificador: "publico",
    maximo: 6,
    janelaMs: 60 * 60_000,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, { modulo: "uploads", acao: "responder-aceite-cliente", entidade: "AceiteCliente" });
    return respostaLimiteRequisicoes(limite);
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const aceite = await prisma.aceiteCliente.findUnique({
    where: { token },
    select: { id: true, situacao: true, expiraEm: true, revogadoEm: true },
  });
  if (!aceite) return NextResponse.json({ error: "Link inválido." }, { status: 404 });

  const agora = new Date();
  const ip = ipDaRequisicao(req);
  const atualizado = await prisma.aceiteCliente.updateMany({
    // A condição entra no UPDATE, não apenas numa leitura anterior: duas respostas concorrentes
    // não podem sobrescrever a primeira, nem consumir um link expirado ou revogado.
    where: {
      id: aceite.id,
      situacao: "pendente",
      revogadoEm: null,
      expiraEm: { gt: agora },
    },
    data: {
      situacao: parsed.data.situacao,
      respondidoEm: agora,
      respondidoPor: parsed.data.nome,
      respondidoIp: ip,
      respondidoUserAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      observacao: parsed.data.observacao || null,
    },
  });
  if (atualizado.count === 0) {
    if (!linkAceiteEstaAtivo(aceite, agora)) return indisponivel();
    return NextResponse.json({ error: "Este aceite já foi respondido." }, { status: 409 });
  }

  await logAudit({
    modulo: "uploads",
    acao: "responder-aceite-cliente",
    entidade: "AceiteCliente",
    entidadeId: aceite.id,
    ip,
    detalhe: { situacao: parsed.data.situacao, respondidoPor: parsed.data.nome, temObservacao: Boolean(parsed.data.observacao) },
  });
  return NextResponse.json({ ok: true, situacao: parsed.data.situacao });
}
