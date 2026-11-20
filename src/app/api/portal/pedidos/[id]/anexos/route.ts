import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { extensaoSegura, limitarStream, nomeArquivoLimpo, removerArquivo, salvarStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { ActionError } from "@/lib/with-action";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";
import { acessoDoUsuarioAoProjetoDoPortal } from "@/modules/portal/acesso";
import { prisma } from "@/lib/prisma";
import { gravarAnexoNoBanco, motivoParaAnexar } from "@/modules/portal/pedido-revisao/service";

/**
 * Anexo do pedido de revisão do cliente (um arquivo por requisição, DEPOIS de o pedido existir — spec 2026-11-19,
 * decisão 5). Só o autor do pedido, só enquanto aguarda, até 5 anexos (PDF, imagem, DWG, DXF). Mesmo esqueleto de
 * `/api/portal/documentos`: teto antes de ler o corpo, gravação em pedaços, arquivo apagado se o registro falhar.
 */
const FOLGA_MULTIPART = 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.tipo !== "externo") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  // A pessoa ainda entra no projeto do pedido (cliente ativo, termo e senha em dia): senão, como pedido alheio.
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({ where: { id }, select: { projetoId: true } });
  const acesso = pedido ? await acessoDoUsuarioAoProjetoDoPortal(user, pedido.projetoId) : null;
  if (!acesso?.ok) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAX + FOLGA_MULTIPART) {
    return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }
  let form: FormData;
  try {
    if (!req.body) throw new Error("sem corpo");
    const corpo = limitarStream(req.body, TAMANHO_MAX + FOLGA_MULTIPART);
    form = await new Request(req.url, { method: "POST", headers: req.headers, body: corpo, duplex: "half" } as RequestInit).formData();
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
    }
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  if (file.size > TAMANHO_MAX) return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });

  const nome = nomeArquivoLimpo(file.name || "arquivo");
  const recusa = await motivoParaAnexar({ pedidoId: id, userId: user.id, nome });
  if (recusa) return NextResponse.json({ error: recusa }, { status: 400 });

  const rel = `portal/pedidos/${id}/${randomBytes(12).toString("hex")}${extensaoSegura(nome)}`;
  let salvo: Awaited<ReturnType<typeof salvarStream>>;
  try {
    salvo = await salvarStream(rel, file.stream(), { limite: TAMANHO_MAX });
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
    }
    throw erro;
  }

  let anexo: { id: string };
  try {
    anexo = await gravarAnexoNoBanco({
      pedidoId: id,
      userId: user.id,
      nome,
      caminho: salvo.caminho,
      tamanho: salvo.tamanho,
      mime: file.type || "application/octet-stream",
    });
  } catch (erro) {
    await removerArquivo(salvo.caminho);
    if (erro instanceof ActionError) return NextResponse.json({ error: erro.message }, { status: 400 });
    throw erro;
  }

  await logAudit({
    userId: user.id,
    modulo: "portal",
    acao: "pedido-revisao-anexo",
    resultado: "sucesso",
    entidade: "AnexoPedidoCliente",
    entidadeId: anexo.id,
    detalhe: { pedidoId: id, nome },
    ip: await getClientIp(),
  });
  return NextResponse.json({ ok: true, id: anexo.id });
}
