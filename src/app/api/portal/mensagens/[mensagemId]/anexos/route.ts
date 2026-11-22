import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { lerInicioArquivo, limitarStream, nomeArquivoLimpo, removerArquivo, salvarStream, slug } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { ActionError } from "@/lib/with-action";
import {
  MOTIVO_CONTEUDO_DO_ANEXO,
  TAMANHO_MAX_ANEXO as TAMANHO_MAX,
  TAMANHO_MAX_ANEXO_LABEL as TAMANHO_MAX_LABEL,
  assinaturaConfere,
  extensaoDoAnexo,
} from "@/modules/portal/pedido-revisao/regras";
import { MOTIVO_NAO_ENCONTRADA } from "@/modules/portal/mensagens/regras";
import { exigirMensagemAnexavel, gravarAnexo } from "@/modules/portal/mensagens/service";
import { emitirAtualizacaoDaConversa } from "@/modules/portal/mensagens/avisos";

/**
 * Anexo de uma mensagem da conversa do portal com a coordenação (um arquivo por requisição, DEPOIS de a mensagem
 * existir com `comAnexos`). Aberto às duas pontas — conta do cliente e equipe —, mas só o autor da mensagem, dentro da
 * janela de 15 minutos e até 5 anexos (`exigirMensagemAnexavel` antes de ler o corpo; `gravarAnexo` de novo sob a trava
 * da mensagem). Mesmos tipos, teto (100 MB, borda do Cloudflare Tunnel) e conferência de conteúdo do pedido de revisão.
 * Esqueleto de `/api/portal/pedidos/[id]/anexos`: teto antes de ler o corpo, gravação em pedaços, arquivo apagado se o
 * registro falhar. Sem acesso é sempre o mesmo 404 (não diz se a mensagem existe); regra de negócio é 400 com o motivo.
 */
const FOLGA_MULTIPART = 1024 * 1024;

/** `ActionError` vira resposta (não encontrada = 404, o resto 400); outro erro sobe. */
function respostaDaRecusa(erro: unknown): NextResponse {
  if (!(erro instanceof ActionError)) throw erro;
  return NextResponse.json({ error: erro.message }, { status: erro.message === MOTIVO_NAO_ENCONTRADA ? 404 : 400 });
}

export async function POST(req: Request, ctx: { params: Promise<{ mensagemId: string }> }) {
  // A janela de 15 minutos vale para o COMEÇO do envio: um arquivo grande que começou no prazo não é recusado por
  // terminar de chegar depois. Todas as conferências abaixo (e a sob a trava, em `gravarAnexo`) usam este instante.
  const agora = new Date();
  const { mensagemId } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  // Porta e regras antes de ler o corpo (o nome do arquivo só chega nele: o tipo é conferido depois).
  try {
    await exigirMensagemAnexavel({ mensagemId, userId: user.id, agora });
  } catch (erro) {
    return respostaDaRecusa(erro);
  }

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
  let destino: { projetoId: string; conversaId: string };
  try {
    destino = await exigirMensagemAnexavel({ mensagemId, userId: user.id, nome, agora });
  } catch (erro) {
    return respostaDaRecusa(erro);
  }

  // `slug` deixa no disco só letras, dígitos, ponto, hífen e sublinhado; o nome original fica no registro.
  const rel = `portal/mensagens/${destino.conversaId}/${mensagemId}/${randomBytes(12).toString("hex")}-${slug(nome)}`;
  let salvo: Awaited<ReturnType<typeof salvarStream>>;
  try {
    salvo = await salvarStream(rel, file.stream(), { limite: TAMANHO_MAX });
  } catch (erro) {
    if (erro instanceof Error && erro.message === "Arquivo acima do limite.") {
      return NextResponse.json({ error: `Arquivo excede ${TAMANHO_MAX_LABEL}.` }, { status: 413 });
    }
    throw erro;
  }

  // A extensão vem do nome que o navegador mandou: confere o começo do arquivo antes de registrar.
  const inicio = await lerInicioArquivo(salvo.caminho, 32).catch(() => Buffer.alloc(0));
  if (!assinaturaConfere(extensaoDoAnexo(nome), new Uint8Array(inicio))) {
    await removerArquivo(salvo.caminho);
    return NextResponse.json({ error: MOTIVO_CONTEUDO_DO_ANEXO }, { status: 400 });
  }

  let anexo: { anexoId: string };
  try {
    anexo = await gravarAnexo({
      mensagemId,
      userId: user.id,
      caminho: salvo.caminho,
      nome,
      tamanho: salvo.tamanho,
      tipo: file.type || "application/octet-stream",
      agora,
    });
  } catch (erro) {
    await removerArquivo(salvo.caminho);
    return respostaDaRecusa(erro);
  }

  await logAudit({
    userId: user.id,
    modulo: "portal",
    acao: "conversa-anexo",
    resultado: "sucesso",
    entidade: "AnexoMensagemPortal",
    entidadeId: anexo.anexoId,
    // Sem o nome do arquivo: ele pode revelar o conteúdo da conversa (a auditoria não é porta para lê-la).
    detalhe: { mensagemId, projetoId: destino.projetoId, extensao: extensaoDoAnexo(nome), tamanho: salvo.tamanho },
    ip: await getClientIp(),
  });
  // As telas abertas dos dois lados recarregam (sem sino nem e-mail: a mensagem já avisou). Falha não desfaz o anexo.
  try {
    await emitirAtualizacaoDaConversa(destino.projetoId);
  } catch (e) {
    console.error("[portal-mensagens] emissão do anexo falhou:", e);
  }
  return NextResponse.json({ ok: true, id: anexo.anexoId });
}
