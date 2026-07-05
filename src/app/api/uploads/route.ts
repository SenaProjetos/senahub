import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/audit";
import { GLOBAL_ROLES } from "@/lib/roles";
import { salvarArquivo, slug, nomeArquivoLimpo } from "@/lib/storage";
import { destinoArquivo, extensao, limiteDoPacote, limiteLabelDoPacote, type PacoteAlvo } from "@/modules/uploads/service";

type Resultado = {
  nome: string;
  ok: boolean;
  pacote?: string;
  motivo?: string;
  realocado?: boolean;
};

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

  const arquivos = form.getAll("files").filter((f): f is File => f instanceof File);
  if (arquivos.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  // Renomear no ato do upload: nome desejado por arquivo (mesma ordem de "files"). Vazio = usa file.name.
  const nomesDesejados = form.getAll("nomes").map((n) => (typeof n === "string" ? n : ""));

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

  const resultados: Resultado[] = [];

  // Processa arquivo a arquivo — uma falha não derruba o lote.
  for (let idx = 0; idx < arquivos.length; idx++) {
    const file = arquivos[idx];
    const nome = nomeArquivoLimpo((nomesDesejados[idx] ?? "").trim() || file.name);
    try {
      if (file.size > limiteDoPacote(alvo)) {
        resultados.push({ nome, ok: false, motivo: `Arquivo excede ${limiteLabelDoPacote(alvo)}.` });
        continue;
      }
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

      const buffer = Buffer.from(await file.arrayBuffer());
      const salvo = await salvarArquivo(relativo, buffer);

      await prisma.upload.create({
        data: {
          disciplinaId,
          pacote: destino,
          nomeArquivo: nome,
          caminho: salvo.caminho,
          hashSha256: salvo.hashSha256,
          tamanho: salvo.tamanho,
          mimeType: file.type || null,
          versao,
          autorId: user.id,
        },
      });

      resultados.push({ nome, ok: true, pacote: destino, realocado });
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
