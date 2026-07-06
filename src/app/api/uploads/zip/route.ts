import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acessoGlobal } from "@/lib/roles";
import { resolverCaminho, slug } from "@/lib/storage";
import { logAudit, getClientIp } from "@/lib/audit";

// Teto de segurança para evitar zips absurdos por requisição.
const MAX_ARQUIVOS = 500;

/**
 * Zip sob demanda de um conjunto de uploads (por id). Serve tanto o download de
 * subpasta (todos os ids daquela pasta) quanto o download personalizado por
 * seleção múltipla. Streaming direto ao browser (sem bufferizar o zip inteiro).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;

  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const nomeParam = url.searchParams.get("nome") ?? "";

  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo selecionado." }, { status: 400 });
  }
  if (ids.length > MAX_ARQUIVOS) {
    return NextResponse.json(
      { error: `Selecione no máximo ${MAX_ARQUIVOS} arquivos por vez.` },
      { status: 400 },
    );
  }

  const uploads = await prisma.upload.findMany({
    where: { id: { in: ids } },
    include: {
      disciplina: {
        select: {
          nome: true,
          responsaveis: { select: { userId: true } },
          projeto: { select: { membros: { select: { userId: true } } } },
        },
      },
    },
  });
  if (uploads.length === 0) {
    return NextResponse.json({ error: "Arquivos não encontrados." }, { status: 404 });
  }

  // Mesma regra dos demais endpoints de arquivo: global, responsável ou membro do projeto.
  const ehGlobal = acessoGlobal(user);
  const acessiveis = uploads.filter(
    (u) =>
      ehGlobal ||
      u.disciplina.responsaveis.some((r) => r.userId === user.id) ||
      u.disciplina.projeto.membros.some((m) => m.userId === user.id),
  );
  if (acessiveis.length === 0) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  // Prefixa a disciplina no caminho só quando a seleção mistura disciplinas.
  const multiDisc = new Set(acessiveis.map((u) => u.disciplina.nome)).size > 1;

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "download-zip-selecao",
    resultado: "sucesso",
    entidade: "Upload",
    detalhe: { total: acessiveis.length },
    ip: await getClientIp(),
  });

  // Resolve nomes ANTES do stream (dedup de caminhos idênticos no zip).
  const usados = new Set<string>();
  const entradas = acessiveis.map((u) => {
    let nome = `${multiDisc ? `${slug(u.disciplina.nome)}/` : ""}${u.pacote}/${u.nomeArquivo}`;
    if (usados.has(nome)) {
      const i = nome.lastIndexOf(".");
      const raiz = i > 0 ? nome.slice(0, i) : nome;
      const ext = i > 0 ? nome.slice(i) : "";
      let n = 2;
      while (usados.has(`${raiz} (${n})${ext}`)) n++;
      nome = `${raiz} (${n})${ext}`;
    }
    usados.add(nome);
    return { caminho: u.caminho, nome };
  });

  // ReadableStream Web nativo alimentado pelos eventos do archiver — o App Router
  // aceita esse tipo diretamente (evita conversões Node→Web frágeis).
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

  const base = slug(nomeParam.replace(/\.zip$/i, "")) || "arquivos";
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(base)}.zip"`,
    },
  });
}
