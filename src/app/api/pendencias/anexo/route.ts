import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { logAudit, getClientIp } from "@/lib/audit";
import { salvarArquivo, nomeArquivoLimpo } from "@/lib/storage";
import { MOMENTOS_EVIDENCIA } from "@/modules/projetos/pendencias/helpers";

const MAX = 25 * 1024 * 1024; // 25 MB — mesmo teto dos documentos de RH

/**
 * Tipos aceitos (item 12): print/foto, áudio e PDF. Lista fechada de propósito — um anexo vira
 * `<img>`/`<audio>` na tela, e aceitar qualquer coisa transformaria a caixa de evidência num
 * repositório genérico de arquivos, que já é o papel do módulo de uploads.
 * **Sem transcrição de áudio** (R5): o arquivo entra bruto.
 */
const MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "application/pdf",
]);

/**
 * Anexa um ARQUIVO ao apontamento (item 12). Multipart porque `bodySizeLimit` de Server Action
 * não comporta foto/áudio; link, que é só texto, vai pela action `anexarLinkPendencia`.
 *
 * Gate: participante do apontamento — autor dele, responsável da disciplina ou perfil global.
 * É mais largo que o gate de quem aponta porque o projetista precisa poder juntar evidência
 * (foto do ajuste feito), que é o caso de uso do item.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  const form = await req.formData();
  const pendenciaId = String(form.get("pendenciaId") ?? "");
  // Momento da evidência (item 7). Ausente/desconhecido → null = anexo comum do item 12; o
  // campo é opcional de propósito, o mesmo endpoint serve aos dois casos.
  const bruto = String(form.get("momento") ?? "");
  const momento = (MOMENTOS_EVIDENCIA as readonly string[]).includes(bruto) ? bruto : null;
  const file = form.get("file");
  if (!pendenciaId || !(file instanceof File)) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo muito grande (máx 25 MB)." }, { status: 400 });
  if (!MIMES.has(file.type)) {
    return NextResponse.json({ error: "Tipo não aceito. Envie imagem, áudio ou PDF." }, { status: 400 });
  }

  const p = await prisma.pendencia.findUnique({
    where: { id: pendenciaId },
    select: { id: true, projetoId: true, uploadId: true, autorId: true, disciplinaId: true, excluidoEm: true },
  });
  if (!p || p.excluidoEm) return NextResponse.json({ error: "Apontamento não encontrado." }, { status: 404 });

  if (!acessoGlobal(user) && p.autorId !== user.id) {
    const resp = await prisma.disciplinaResponsavel.findFirst({
      where: { disciplinaId: p.disciplinaId, userId: user.id },
      select: { id: true },
    });
    if (!resp) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const nome = nomeArquivoLimpo(file.name || "anexo");
  const conteudo = Buffer.from(await file.arrayBuffer());
  const salvo = await salvarArquivo(`apontamentos/anexos/${p.projetoId}/${p.id}/${Date.now()}-${nome}`, conteudo);

  const anexo = await prisma.pendenciaAnexo.create({
    data: {
      pendenciaId: p.id,
      tipo: "arquivo",
      nome,
      nomeArquivo: nome,
      caminho: salvo.caminho,
      mime: file.type,
      tamanho: salvo.tamanho,
      hashSha256: salvo.hashSha256,
      momento,
      autorId: user.id,
    },
  });

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "anexar-arquivo-pendencia",
    resultado: "sucesso",
    entidade: "PendenciaAnexo",
    entidadeId: p.projetoId,
    detalhe: { pendenciaId: p.id, nome, mime: file.type, tamanho: salvo.tamanho, momento },
    ip: await getClientIp(),
  });

  return NextResponse.json({
    id: anexo.id,
    tipo: "arquivo",
    nome: anexo.nome,
    mime: anexo.mime,
    tamanho: anexo.tamanho,
    momento: anexo.momento,
  });
}
