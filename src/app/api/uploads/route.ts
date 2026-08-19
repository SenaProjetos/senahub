import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAudit, getClientIp } from "@/lib/audit";
import { GLOBAL_ROLES } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";
import { podeEnviarArquivo } from "@/modules/arquivos/acesso";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { salvarArquivo, removerArquivo, nomeArquivoLimpo, type ArquivoSalvo } from "@/lib/storage";
import { montarChunksEm, limparChunks } from "@/lib/upload-chunks";
import { destinoArquivo, extensao, limiteDoPacote, limiteLabelDoPacote, type PacoteAlvo } from "@/modules/uploads/service";
import { baseDirDisciplina, nomeFisico } from "@/modules/uploads/caminho";
import { chaveDocumento } from "@/modules/uploads/documento";
import { enfileirarConversao } from "@/modules/coordenacao/service";
import { enfileirarConversaoDwg } from "@/modules/dwg/service";

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
  const pastaId = String(form.get("pastaId") ?? "") || null;
  if (!disciplinaId || (!pastaId && alvo !== "A" && alvo !== "B" && alvo !== "RECEBIDOS")) {
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

  // Aprovação/laudo (e pastas personalizadas): destino é uma PastaProjeto, não um pacote.
  let pastaAlvo: { id: string; caminho: string } | null = null;
  if (pastaId) {
    const pasta = await prisma.pastaProjeto.findUnique({
      where: { id: pastaId },
      select: { id: true, disciplinaId: true, caminho: true },
    });
    if (!pasta || pasta.disciplinaId !== disciplinaId) {
      return NextResponse.json({ error: "Pasta inválida para esta disciplina." }, { status: 400 });
    }
    pastaAlvo = pasta;
  }

  // Regra: só o responsável da disciplina (ou perfil global) envia arquivos.
  const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role);
  const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
  if (!ehGlobal && !ehResp) {
    return NextResponse.json(
      { error: "Apenas responsáveis pela disciplina podem enviar arquivos." },
      { status: 403 },
    );
  }
  // Capability de envio (recurso `arquivos`). Global passa direto; os demais precisam de
  // `arquivos:enviar` (configurável na matriz de permissões).
  if (!ehGlobal && !(await podeEnviarArquivo(user))) {
    return NextResponse.json(
      { error: "Sem permissão para enviar arquivos." },
      { status: 403 },
    );
  }

  // Refs não-nulas p/ uso dentro de closures (o narrowing do guard `!disciplina` não
  // atravessa funções aninhadas como `avisarValidadores`).
  const { projeto, disciplinaTextoLegado: disciplinaNome } = disciplina;
  // Item 15: nomenclatura usa a sigla do catálogo (ex.: ELE) quando existir; senão, o nome.
  const cat = await prisma.disciplinaCatalogo.findFirst({
    where: { nome: disciplina.disciplinaTextoLegado },
    select: { codigo: true },
  });
  const codDisc = cat?.codigo ?? null;
  const baseDir = baseDirDisciplina({
    ano: projeto.ano,
    clienteNome: projeto.cliente.nome,
    projetoCodigo: projeto.codigo,
    projetoNome: projeto.nome,
    disciplinaNome: disciplina.disciplinaTextoLegado,
    siglaDisciplina: codDisc,
  });

  /**
   * Persiste UM arquivo já validado por tamanho: resolve destino (roteamento/versão),
   * chama `gravar(relativo)` (buffer direto OU montagem de chunks) e cria o registro.
   */
  async function persistir(nome: string, gravar: (relativo: string) => Promise<ArquivoSalvo>, mime: string | null): Promise<Resultado> {
    // Pasta-mode (aprovação/laudo, pasta personalizada): sem roteamento por extensão nem
    // pacote — o destino já é a pasta escolhida no client.
    const destino = pastaAlvo ? null : destinoArquivo(nome, alvo);
    const realocado = destino === "OUTROS" && alvo === "A";

    // Versionamento: mesma disciplina + (pacote OU pasta) + nome → incrementa versão.
    const anterior = await prisma.upload.findFirst({
      where: pastaAlvo
        ? { disciplinaId, pastaId: pastaAlvo.id, nomeArquivo: nome }
        : { disciplinaId, pacote: destino, nomeArquivo: nome },
      orderBy: { versao: "desc" },
    });
    const versao = anterior ? anterior.versao + 1 : 1;

    // Prefixa o arquivo com a sigla da disciplina (ex.: ELE-planta.dwg) quando houver código.
    const nomeVersionado = nomeFisico({ nomeArquivo: nome, siglaDisciplina: codDisc, versao });
    const relativo = pastaAlvo
      ? `${baseDir}/${pastaAlvo.caminho}/${nomeVersionado}`
      : `${baseDir}/${destino}/${nomeVersionado}`;

    const salvo = await gravar(relativo);

    // Documento lógico (pai) que agrupa as versões deste arquivo. `upsert` sobre o unique
    // (disciplinaId, chave) resolve o existente OU cria — e é o que impede dois envios
    // simultâneos do mesmo nome de criarem dois pais para a mesma cadeia.
    const chave = chaveDocumento({
      pacote: pastaAlvo ? null : destino,
      pastaId: pastaAlvo?.id ?? null,
      nomeArquivo: nome,
    });
    const documento = await prisma.documentoDisciplina.upsert({
      where: { disciplinaId_chave: { disciplinaId, chave } },
      create: { disciplinaId, chave, nomeArquivo: nome },
      update: {},
      select: { id: true },
    });

    // Revisão do documento (Fase 2): o ponto no tempo a que este arquivo pertence. PDF e
    // DWG enviados como a mesma versão do mesmo documento caem na MESMA revisão — é o que
    // o `upsert` sobre (documentoId, numero) garante, inclusive em envios concorrentes.
    const revisao = await prisma.documentoRevisao.upsert({
      where: { documentoId_numero: { documentoId: documento.id, numero: versao } },
      create: { documentoId: documento.id, numero: versao, createdById: user.id },
      update: {},
      select: { id: true },
    });

    const criado = await prisma.upload.create({
      data: {
        disciplinaId,
        pacote: pastaAlvo ? null : destino,
        pastaId: pastaAlvo?.id,
        documentoId: documento.id,
        revisaoId: revisao.id,
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
    // Visualizador DWG: cada DWG enviado (inclusive nova versão) entra na fila de
    // conversão p/ DXF. Fire-and-forget — não bloqueia nem derruba o upload.
    if (extensao(nome) === "dwg") {
      void enfileirarConversaoDwg(criado.id).catch((err) =>
        console.error("[upload] falha ao enfileirar conversão DWG:", err),
      );
    }
    return pastaAlvo ? { nome, ok: true, realocado: false } : { nome, ok: true, pacote: destino!, realocado };
  }

  /**
   * Avisa os validadores (admin/supervisor) quando entregáveis novos (pacote A/B)
   * entram na fila de aprovação. RECEBIDOS/OUTROS não passam por validação, logo não
   * notificam. Respeita opt-out (categoria `aprovacao_arquivo`). Nunca derruba o upload.
   */
  async function avisarValidadores(rs: Resultado[]) {
    const novos = rs.filter((r) => r.ok && (r.pacote === "A" || r.pacote === "B")).length;
    if (novos <= 0) return;
    const validadores = await prisma.user.findMany({
      where: { ...whereAudiencia("global"), id: { not: user.id } },
      select: { id: true },
    });
    if (validadores.length === 0) return;
    const codigo = formatarCodigo(projeto.codigo);
    await notificarMuitos(
      validadores.map((v) => v.id),
      {
        titulo: "Arquivo aguardando validação",
        corpo: `${disciplinaNome} (${codigo}): ${novos} arquivo(s) novo(s) para validar.`,
        href: `/projetos/${projeto.id}/arquivos`,
        tag: `aprovacao-${disciplinaId}`,
      },
      { categoria: "aprovacao_arquivo" },
    );
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
    await avisarValidadores(resultados).catch((e) =>
      console.error("[upload] falha ao notificar validadores:", e),
    );
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

  await avisarValidadores(resultados).catch((e) =>
    console.error("[upload] falha ao notificar validadores:", e),
  );

  return NextResponse.json({ resultados });
}
