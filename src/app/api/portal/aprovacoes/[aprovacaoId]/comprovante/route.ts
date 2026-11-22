import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { lerInicioArquivo, limitarStream, nomeArquivoLimpo, removerArquivo, salvarStream, slug } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { ActionError } from "@/lib/with-action";
import {
  MOTIVO_CONTEUDO_COMPROVANTE,
  MOTIVO_NAO_ENCONTRADO,
  TAMANHO_MAX_COMPROVANTE as TAMANHO_MAX,
  TAMANHO_MAX_COMPROVANTE_LABEL as TAMANHO_MAX_LABEL,
  conteudoDoComprovanteConfere,
  extensaoDoComprovante,
  motivoDoComprovante,
} from "@/modules/portal/aprovacao-entrega/regras";
import { exigirComprovanteAceito, gravarComprovante } from "@/modules/portal/aprovacao-entrega/service";

/**
 * Comprovante da resposta recebida por fora (e-mail, WhatsApp, papel) de um pedido de aprovação de entrega — enviado
 * ANTES de registrar a resposta (`registrarRespostaPorFora` exige um comprovante deste pacote, desta pessoa, não usado).
 * Só a equipe da audiência da conversa com a coordenação, só pacote aguardando. Um arquivo por requisição: PDF, imagem
 * ou e-mail (EML/MSG), até 20 MB, com o começo do arquivo conferido. Esqueleto de `/api/portal/mensagens/.../anexos`:
 * teto antes de ler o corpo, gravação em pedaços, arquivo apagado se o registro falhar. Sem acesso = 404 (não diz se o
 * pedido existe); regra de negócio = 400 com o motivo.
 */
const FOLGA_MULTIPART = 1024 * 1024;

function respostaDaRecusa(erro: unknown): NextResponse {
  if (!(erro instanceof ActionError)) throw erro;
  return NextResponse.json({ error: erro.message }, { status: erro.message === MOTIVO_NAO_ENCONTRADO ? 404 : 400 });
}

export async function POST(req: Request, ctx: { params: Promise<{ aprovacaoId: string }> }) {
  const { aprovacaoId } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.tipo !== "interno") return NextResponse.json({ error: MOTIVO_NAO_ENCONTRADO }, { status: 404 });

  let destino: { projetoId: string };
  try {
    destino = await exigirComprovanteAceito({ aprovacaoId, userId: user.id });
  } catch (erro) {
    return respostaDaRecusa(erro);
  }

  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > TAMANHO_MAX + FOLGA_MULTIPART) {
    return NextResponse.json({ error: `O comprovante passa de ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
  }
  let form: FormData;
  try {
    if (!req.body) throw new Error("sem corpo");
    const corpo = limitarStream(req.body, TAMANHO_MAX + FOLGA_MULTIPART);
    form = await new Request(req.url, { method: "POST", headers: req.headers, body: corpo, duplex: "half" } as RequestInit).formData();
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: `O comprovante passa de ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
    }
    return NextResponse.json({ error: "Falha ao receber o arquivo." }, { status: 413 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });
  const nome = nomeArquivoLimpo(file.name || "comprovante");
  const motivo = motivoDoComprovante({ nome, tamanho: file.size });
  if (motivo) return NextResponse.json({ error: motivo }, { status: file.size > TAMANHO_MAX ? 413 : 400 });

  const rel = `portal/aprovacoes/${aprovacaoId}/${randomBytes(12).toString("hex")}-${slug(nome)}`;
  let salvo: Awaited<ReturnType<typeof salvarStream>>;
  try {
    salvo = await salvarStream(rel, file.stream(), { limite: TAMANHO_MAX });
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: `O comprovante passa de ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
    }
    throw erro;
  }

  // A extensão vem do nome que o navegador mandou: confere o começo do arquivo antes de registrar.
  const inicio = await lerInicioArquivo(salvo.caminho, 512).catch(() => Buffer.alloc(0));
  if (!conteudoDoComprovanteConfere(extensaoDoComprovante(nome), new Uint8Array(inicio))) {
    await removerArquivo(salvo.caminho);
    return NextResponse.json({ error: MOTIVO_CONTEUDO_COMPROVANTE }, { status: 400 });
  }

  let comprovante: { comprovanteId: string };
  try {
    comprovante = await gravarComprovante({
      aprovacaoId,
      quem: { userId: user.id, nome: user.name },
      caminho: salvo.caminho,
      nome,
      tamanho: salvo.tamanho,
      tipo: file.type || "application/octet-stream",
    });
  } catch (erro) {
    await removerArquivo(salvo.caminho);
    return respostaDaRecusa(erro);
  }

  await logAudit({
    userId: user.id,
    modulo: "portal",
    acao: "aprovacao-entrega-comprovante",
    resultado: "sucesso",
    entidade: "ComprovanteAprovacaoEntrega",
    entidadeId: comprovante.comprovanteId,
    detalhe: { aprovacaoId, projetoId: destino.projetoId, extensao: extensaoDoComprovante(nome), tamanho: salvo.tamanho },
    ip: await getClientIp(),
  });
  return NextResponse.json({ ok: true, comprovanteId: comprovante.comprovanteId, nome, tamanho: salvo.tamanho });
}
