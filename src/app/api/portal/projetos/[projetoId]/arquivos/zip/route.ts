import { NextResponse } from "next/server";
import { contentDisposition } from "@/modules/projetos/arquivos/link-publico-regras";
import { uploadsDoAlcanceParaZip } from "@/modules/projetos/arquivos/link-publico";
import { acessoAoProjetoDoPortal } from "@/modules/portal/acesso";
import { uploadsComBloqueioDeDownload } from "@/modules/uploads/ciclo/service";
import { prisma } from "@/lib/prisma";
import { resolverCaminho, separarPorExistencia } from "@/lib/storage";
import { zipEmStream } from "@/lib/zip-stream";
import { logAudit, getClientIp } from "@/lib/audit";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";

/**
 * Download (.zip) das entregas de um projeto pelo portal do cliente. Espelha
 * `/api/p/arquivos/[token]/zip`, com login no lugar do token: quem decide se a pessoa entra é
 * `acessoAoProjetoDoPortal` (cliente do projeto, termo aceito, senha em dia) e o conteúdo é o MESMO núcleo
 * do link (`uploadsDoAlcanceParaZip` com o alcance do portal). Os parâmetros só recortam uma pasta.
 */
export async function GET(req: Request, ctx: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await ctx.params;
  const acesso = await acessoAoProjetoDoPortal(projetoId);
  if (!acesso.ok) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const sp = new URL(req.url).searchParams;
  const disciplinaId = sp.get("disciplinaId") ?? undefined;
  const fase = sp.get("fase") ?? undefined;
  const ext = sp.get("ext") ?? undefined;
  const situacao = sp.get("situacao") ?? undefined;

  const pacote = await uploadsDoAlcanceParaZip(acesso.alcance, { disciplinaId, fase, ext, situacao });
  if (!pacote) return NextResponse.json({ error: "Arquivos indisponíveis." }, { status: 404 });
  // Ciclo documental: revisão com bloqueio de download fica fora do pacote (I7).
  const bloqueados = await uploadsComBloqueioDeDownload(prisma, pacote.entradas.map((e) => e.uploadId));
  const liberadas = pacote.entradas.filter((e) => !bloqueados.has(e.uploadId));
  if (liberadas.length === 0) return NextResponse.json({ error: "Arquivos indisponíveis." }, { status: 404 });
  // Só entra (e só é registrado como baixado) o que está no disco; o que sumiu fica de fora e no log.
  const { presentes: entradas, ausentes } = await separarPorExistencia(liberadas);
  const foraDoPacote = ausentes.map((e) => e.uploadId);
  if (foraDoPacote.length > 0) {
    console.warn(`[zip] ${foraDoPacote.length} arquivo(s) fora do pacote (ausentes no disco):`, foraDoPacote);
  }
  if (entradas.length === 0) return NextResponse.json({ error: "Arquivos indisponíveis no disco." }, { status: 410 });

  await logAudit({
    modulo: "uploads",
    acao: "download-portal-zip",
    resultado: "sucesso",
    userId: acesso.userId,
    entidade: "Projeto",
    entidadeId: projetoId,
    detalhe: { projetoId, disciplinaId, fase, ext, situacao, ...(foraDoPacote.length > 0 ? { foraDoPacote } : {}) },
    ip: await getClientIp(),
  });
  // Sem await: um pacote grande não pode atrasar o início do download. O serviço nunca rejeita
  // (engole e loga), e o servidor é um processo longo — a gravação termina em segundo plano.
  void registrarAcessoUploads({
    uploadIds: entradas.map((e) => e.uploadId),
    tipo: "download",
    origem: "portal",
    userId: acesso.userId,
    linkId: null,
    via: "zip",
  });

  // `entradas` já passou por `separarPorExistencia` (e por `resolverCaminho`).
  const stream = zipEmStream(entradas.map((e) => ({ caminho: resolverCaminho(e.caminho), nome: e.nome })));

  // O nome do arquivo acompanha a pasta pedida, senão três downloads diferentes chegam na
  // pasta de Downloads do cliente com o mesmo nome.
  const sufixo = [
    situacao === "compartilhado" ? "compartilhado" : situacao === "liberado_obra" ? "obra" : null,
    disciplinaId ? "disciplina" : null,
    fase ? "fase" : null,
    ext ? ext.replace("__outros__", "outros") : null,
  ]
    .filter(Boolean)
    .join("-");
  const nome = `${pacote.codigo}_arquivos${sufixo ? `_${sufixo}` : ""}.zip`;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition("attachment", nome),
    },
  });
}
