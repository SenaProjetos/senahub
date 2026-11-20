import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { limitarStream } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { acessoDoUsuarioAoProjetoDoPortal } from "@/modules/portal/acesso";
import { MOTIVO_IMAGEM_GRANDE, TAMANHO_MAX_IMAGEM_VISTA } from "@/modules/portal/pedido-revisao/modelo-regras";
import { gravarImagemDaMarcacao } from "@/modules/portal/pedido-revisao/service";

/**
 * Imagem da vista de uma marcação do pedido no modelo 3D (spec 2026-11-20, "Imagem da vista"): o navegador captura o
 * canvas na hora da marcação e envia DEPOIS de criado o pedido, uma marcação por requisição (multipart: o limite de
 * corpo da Server Action estouraria com o PNG). PNG pela assinatura, até 2 MB, só o autor, só enquanto aguarda, só
 * marcação do próprio pedido — as regras e a gravação ficam em `gravarImagemDaMarcacao` (o smoke as testa sem HTTP).
 * Aqui: sessão do portal, acesso ao projeto do pedido e o teto antes de ler o corpo.
 */
const FOLGA_MULTIPART = 64 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string; marcacaoId: string }> }) {
  const { id, marcacaoId } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.tipo !== "externo") return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  // A pessoa ainda entra no projeto do pedido (cliente ativo, termo e senha em dia): senão, como pedido alheio.
  const pedido = await prisma.pedidoRevisaoCliente.findUnique({ where: { id }, select: { projetoId: true } });
  const acesso = pedido ? await acessoDoUsuarioAoProjetoDoPortal(user, pedido.projetoId) : null;
  if (!acesso?.ok) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAX_IMAGEM_VISTA + FOLGA_MULTIPART) return NextResponse.json({ error: MOTIVO_IMAGEM_GRANDE }, { status: 413 });
  let form: FormData;
  try {
    if (!req.body) throw new Error("sem corpo");
    const corpo = limitarStream(req.body, TAMANHO_MAX_IMAGEM_VISTA + FOLGA_MULTIPART);
    form = await new Request(req.url, { method: "POST", headers: req.headers, body: corpo, duplex: "half" } as RequestInit).formData();
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: MOTIVO_IMAGEM_GRANDE }, { status: 413 });
    }
    return NextResponse.json({ error: "Falha ao receber a imagem." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Imagem ausente." }, { status: 400 });
  if (file.size > TAMANHO_MAX_IMAGEM_VISTA) return NextResponse.json({ error: MOTIVO_IMAGEM_GRANDE }, { status: 413 });

  let gravada: { caminho: string };
  try {
    gravada = await gravarImagemDaMarcacao({
      pedidoId: id,
      marcacaoId,
      userId: user.id,
      conteudo: Buffer.from(await file.arrayBuffer()),
    });
  } catch (erro) {
    if (erro instanceof ActionError) return NextResponse.json({ error: erro.message }, { status: 400 });
    throw erro;
  }

  await logAudit({
    userId: user.id,
    modulo: "portal",
    acao: "pedido-revisao-imagem-vista",
    resultado: "sucesso",
    entidade: "MarcacaoModeloCliente",
    entidadeId: marcacaoId,
    detalhe: { pedidoId: id, caminho: gravada.caminho },
    ip: await getClientIp(),
  });
  return NextResponse.json({ ok: true });
}
