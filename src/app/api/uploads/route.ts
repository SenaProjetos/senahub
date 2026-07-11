import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/audit";
import { GLOBAL_ROLES } from "@/lib/roles";
import { salvarArquivo, removerArquivo, slug, nomeArquivoLimpo, type ArquivoSalvo } from "@/lib/storage";
import { montarChunksEm, limparChunks } from "@/lib/upload-chunks";
import { destinoArquivo, extensao, limiteDoPacote, limiteLabelDoPacote, type PacoteAlvo } from "@/modules/uploads/service";
import { enfileirarConversao } from "@/modules/coordenacao/service";

type Resultado = {
  nome: string;
  ok: boolean;
  pacote?: string;
  motivo?: string;
  realocado?: boolean;
};

/** Arquivo remontado maior que o teto do pacote — mensagem segura p/ o cliente. */
class LimiteExcedidoError extends Error {}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const user = session.user;
  if (user.mustChangePassword || !user.ativo) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  // Corpo multipart pode falhar (payload gigante / conexão abortada) — responde JSON, nunca corpo vazio.
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error("[upload] falha ao ler multipart:", err);
    return NextResponse.json(
      { error: "Falha ao receber o arquivo — payload muito grande ou conexão interrompida." },
      { status: 413 },
    );
  }
  const disciplinaId = String(form.get("disciplinaId") ?? "");
  const alvo = String(form.get("pacote") ?? "") as PacoteAlvo;
  if (!disciplinaId || (alvo !== "A" && alvo !== "B" && alvo !== "RECEBIDOS")) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const disciplina = await prisma.disciplina.findUnique({
    where: { id: disciplinaId },
    include: {
      responsaveis: true,
      projeto: { include: { cliente: { select: { nome: true } } } },
    },
  });
  if (!disciplina) return NextResponse.json({ error: "Disciplina não encontrada." }, { status: 404 });

  // Regra: só o responsável da disciplina (ou perfil global) envia arquivos.
  const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role);
  const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
  if (!ehGlobal && !ehResp) {
    return NextResponse.json(
      { error: "Apenas responsáveis pela disciplina podem enviar arquivos." },
      { status: 403 },
    );
  }

  const { projeto } = disciplina;
  // Item 15: nomenclatura usa a sigla do catálogo (ex.: ELE) quando existir; senão, o nome.
  const cat = await prisma.disciplinaCatalogo.findFirst({
    where: { nome: disciplina.nome },
    select: { codigo: true },
  });
  const codDisc = cat?.codigo ?? null;
  const baseDir = [
    String(projeto.ano),
    slug(projeto.cliente.nome),
    `${projeto.codigo}_${slug(projeto.nome)}`,
    codDisc ? slug(codDisc) : slug(disciplina.nome),
  ].join("/");

  /**
   * Persiste UM arquivo já validado por tamanho: resolve destino (roteamento/versão),
   * chama `gravar(relativo)` (buffer direto OU montagem de chunks) e cria o registro.
   */
  async function persistir(nome: string, gravar: (relativo: string) => Promise<ArquivoSalvo>, mime: string | null): Promise<Resultado> {
    const destino = destinoArquivo(nome, alvo);
    const realocado = destino === "OUTROS" && alvo === "A";

    // Versionamento: mesma disciplina + pacote + nome → incrementa versão.
    const anterior = await prisma.upload.findFirst({
      where: { disciplinaId, pacote: destino, nomeArquivo: nome },
      orderBy: { versao: "desc" },
    });
    const versao = anterior ? anterior.versao + 1 : 1;

    const ext = extensao(nome);
    const baseNome = ext ? nome.slice(0, -(ext.length + 1)) : nome;
    // Prefixa o arquivo com a sigla da disciplina (ex.: ELE-planta.dwg) quando houver código.
    const nomeBase = codDisc ? `${codDisc}-${slug(baseNome)}` : slug(baseNome);
    const nomeVersionado = versao > 1 ? `${nomeBase}__v${versao}${ext ? "." + ext : ""}` : `${nomeBase}${ext ? "." + ext : ""}`;
    const relativo = `${baseDir}/${destino}/${nomeVersionado}`;

    const salvo = await gravar(relativo);

    const criado = await prisma.upload.create({
      data: {
        disciplinaId,
        pacote: destino,
        nomeArquivo: nome,
        caminho: salvo.caminho,
        hashSha256: salvo.hashSha256,
        tamanho: salvo.tamanho,
        mimeType: mime,
        versao,
        autorId: user.id,
      },
    });

    // Coordenação BIM: cada IFC enviado (inclusive nova versão) entra na fila de
    // conversão p/ Fragments. Fire-and-forget — não bloqueia nem derruba o upload.
    if (extensao(nome) === "ifc") {
      void enfileirarConversao(criado.id).catch((err) =>
        console.error("[upload] falha ao enfileirar conversão IFC:", err),
      );
    }
    return { nome, ok: true, pacote: destino, realocado };
  }

  const resultados: Resultado[] = [];

  // ── Modo chunked (arquivos grandes p/ contornar o limite de 100 MB do Cloudflare) ──
  const sessaoId = String(form.get("sessaoId") ?? "");
  if (sessaoId) {
    const nome = nomeArquivoLimpo(String(form.get("nome") ?? "").trim() || "arquivo");
    const total = Number(form.get("total"));
    const tamanhoDeclarado = Number(form.get("tamanho"));
    const mime = String(form.get("mime") ?? "") || null;
    try {
      if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > limiteDoPacote(alvo)) {
        await limparChunks(user.id, sessaoId);
        resultados.push({ nome, ok: false, motivo: `Arquivo excede ${limiteLabelDoPacote(alvo)}.` });
      } else {
        const r = await persistir(
          nome,
          async (relativo) => {
            const salvo = await montarChunksEm(relativo, { userId: user.id, sessaoId, total });
            // O "tamanho" declarado vem do cliente — o limite de verdade é checado
            // aqui, contra o tamanho REAL remontado, antes de criar o registro.
            if (salvo.tamanho > limiteDoPacote(alvo)) {
              await removerArquivo(salvo.caminho);
              throw new LimiteExcedidoError(`Arquivo excede ${limiteLabelDoPacote(alvo)}.`);
            }
            return salvo;
          },
          mime,
        );
        resultados.push(r);
      }
    } catch (err) {
      console.error("[upload] falha ao montar chunks:", err);
      await limparChunks(user.id, sessaoId);
      resultados.push({
        nome,
        ok: false,
        motivo: err instanceof LimiteExcedidoError ? err.message : "Falha ao montar o arquivo enviado.",
      });
    }
    await logAudit({
      userId: user.id,
      modulo: "uploads",
      acao: "enviar-arquivos",
      resultado: resultados.some((r) => r.ok) ? "sucesso" : "falha",
      entidade: "Upload",
      entidadeId: disciplinaId,
      detalhe: { pacote: alvo, total: 1, ok: resultados.filter((r) => r.ok).length, chunked: true },
      ip: await getClientIp(),
    });
    return NextResponse.json({ resultados });
  }

  // ── Modo direto (multipart) ──
  const arquivos = form.getAll("files").filter((f): f is File => f instanceof File);
  if (arquivos.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  // Renomear no ato do upload: nome desejado por arquivo (mesma ordem de "files"). Vazio = usa file.name.
  const nomesDesejados = form.getAll("nomes").map((n) => (typeof n === "string" ? n : ""));

  // Processa arquivo a arquivo — uma falha não derruba o lote.
  for (let idx = 0; idx < arquivos.length; idx++) {
    const file = arquivos[idx];
    const nome = nomeArquivoLimpo((nomesDesejados[idx] ?? "").trim() || file.name);
    try {
      if (file.size > limiteDoPacote(alvo)) {
        resultados.push({ nome, ok: false, motivo: `Arquivo excede ${limiteLabelDoPacote(alvo)}.` });
        continue;
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const r = await persistir(nome, (relativo) => salvarArquivo(relativo, buffer), file.type || null);
      resultados.push(r);
    } catch (err) {
      console.error("[upload] falha:", err);
      resultados.push({ nome, ok: false, motivo: "Falha ao salvar." });
    }
  }

  await logAudit({
    userId: user.id,
    modulo: "uploads",
    acao: "enviar-arquivos",
    resultado: resultados.some((r) => r.ok) ? "sucesso" : "falha",
    entidade: "Upload",
    entidadeId: disciplinaId,
    detalhe: { pacote: alvo, total: arquivos.length, ok: resultados.filter((r) => r.ok).length },
    ip: await getClientIp(),
  });

  return NextResponse.json({ resultados });
}
