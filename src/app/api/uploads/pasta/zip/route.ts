import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { resolverCaminho, slug } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";
import { podeBaixarArquivo, podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { arquivosDaRevisaoAtual } from "@/modules/uploads/documentos-agrupados-utils";
import { carregarExtensoesNomenclatura } from "@/modules/uploads/nomenclatura/queries";
import { EXT_OUTROS, FASE_SEM } from "@/modules/uploads/arvore-navegacao";
import { entradasZipDaPasta } from "@/modules/uploads/pastas-da-lista";
import { registrarAcessoUploads } from "@/modules/uploads/historico/service";

/**
 * .zip de uma pasta da aba Arquivos: disciplina, fase (`fase`) ou formato (`fase` + `ext`).
 *
 * Leva o que a lista mostra a partir daquela pasta — a revisão vigente de cada documento, e na
 * pasta de formato SÓ aquele formato (a pasta PDF não leva DWG). Os caminhos dentro do .zip
 * espelham as pastas (`entradasZipDaPasta`).
 *
 * Mesma autorização do download de um arquivo (`/api/uploads/[id]/download`): a muralha por
 * disciplina (responsável dela, ou `ver_todas_disciplinas` + participar do projeto) e a
 * capability de baixar.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  const sp = new URL(req.url).searchParams;
  const disciplinaId = sp.get("disciplinaId");
  const fase = sp.get("fase") || null;
  const ext = sp.get("ext")?.toLowerCase() || null;
  if (!disciplinaId) return NextResponse.json({ error: "Pasta não informada." }, { status: 400 });
  // Formato sem fase não é pasta da árvore — o formato mora dentro de uma fase.
  if (ext && !fase) return NextResponse.json({ error: "Pasta não informada." }, { status: 400 });

  const disciplina = await prisma.disciplina.findUnique({
    where: { id: disciplinaId },
    select: {
      id: true,
      projetoId: true,
      disciplinaTextoLegado: true,
      catalogo: { select: { nome: true } },
      responsaveis: { select: { userId: true } },
      projeto: { select: { codigo: true, membros: { select: { userId: true } } } },
    },
  });
  if (!disciplina) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });

  const ehGlobal = acessoGlobal(user);
  const ehRespDesta = disciplina.responsaveis.some((r) => r.userId === user.id);
  const ehMembro = disciplina.projeto.membros.some((m) => m.userId === user.id);
  let ehRespProjeto = false;
  if (!ehGlobal && !ehMembro) {
    ehRespProjeto =
      (await prisma.disciplina.count({
        where: { projetoId: disciplina.projetoId, responsaveis: { some: { userId: user.id } } },
      })) > 0;
  }
  const veTodas = await podeVerTodasDisciplinas(user);
  if (!(ehGlobal || ehRespDesta || (veTodas && (ehMembro || ehRespProjeto)))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (!ehGlobal && !(await podeBaixarArquivo(user))) {
    return NextResponse.json({ error: "Sem permissão para baixar arquivos." }, { status: 403 });
  }

  const [documentos, extensoes] = await Promise.all([
    prisma.documentoDisciplina.findMany({
      where: {
        disciplinaId,
        substituidoPorId: null,
        ...(fase ? { faseId: fase === FASE_SEM ? null : fase } : {}),
      },
      orderBy: { nomeArquivo: "asc" },
      select: {
        fase: { select: { id: true, sigla: true, nome: true } },
        uploads: {
          // Lixeira: `Upload` não passa pelo filtro global de soft delete.
          where: { excluidoEm: null },
          orderBy: { nomeArquivo: "asc" },
          select: { id: true, nomeArquivo: true, caminho: true, revisaoId: true, revisao: { select: { numero: true } } },
        },
      },
    }),
    carregarExtensoesNomenclatura(),
  ]);

  const arquivos = documentos.flatMap((d) =>
    arquivosDaRevisaoAtual(d.uploads).map((u) => ({
      uploadId: u.id,
      caminho: u.caminho,
      nome: u.nomeArquivo,
      faseId: d.fase?.id ?? null,
      faseRotulo: d.fase?.sigla ?? d.fase?.nome ?? null,
    })),
  );
  const entradas = entradasZipDaPasta(
    arquivos,
    extensoes.map((e) => e.extensao),
    { fase, ext },
  );
  if (entradas.length === 0) return NextResponse.json({ error: "Pasta vazia." }, { status: 404 });

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "download-zip-pasta",
    resultado: "sucesso",
    entidade: "Disciplina",
    entidadeId: disciplinaId,
    detalhe: { fase, ext, total: entradas.length },
    ip: await getClientIp(),
  });
  // Sem await: um pacote grande não pode atrasar o início do download. O serviço nunca rejeita
  // (engole e loga), e o servidor é um processo longo — a gravação termina em segundo plano.
  void registrarAcessoUploads({
    uploadIds: entradas.map((e) => e.uploadId),
    tipo: "download",
    origem: "interno",
    userId: user.id,
    via: "zip",
  });

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err) => console.warn("[zip] warning:", err));
      archive.on("error", (err) => {
        console.error("[zip] erro no archiver:", err);
        controller.error(err);
      });
      for (const e of entradas) {
        try {
          archive.file(resolverCaminho(e.caminho), { name: e.nome });
        } catch {
          // arquivo ausente/caminho inválido — ignora
        }
      }
      void archive.finalize();
    },
  });

  // O nome acompanha a pasta: três downloads de pastas diferentes não podem chegar iguais.
  const faseRotulo = fase ? (fase === FASE_SEM ? "sem-fase" : documentos.find((d) => d.fase?.id === fase)?.fase?.sigla) : null;
  const partes = [
    disciplina.projeto.codigo,
    disciplina.catalogo?.nome ?? disciplina.disciplinaTextoLegado,
    faseRotulo,
    ext ? (ext === EXT_OUTROS ? "outros" : ext.toUpperCase()) : null,
  ].filter((p): p is string => !!p);
  const nome = `${partes.map((p) => slug(p)).join("_")}.zip`;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"`,
    },
  });
}
