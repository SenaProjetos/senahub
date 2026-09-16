import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { auditarBloqueioRateLimit, limitarRequisicao, respostaLimiteRequisicoes } from "@/lib/rate-limit";
import { logAudit, getClientIp } from "@/lib/audit";
import { podeAtuarEmDisciplinaAlheia } from "@/lib/permissions";
import { whereAudiencia } from "@/lib/audiencias";
import { podeEnviarArquivo } from "@/modules/arquivos/acesso";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { salvarArquivo, removerArquivo, nomeArquivoLimpo, type ArquivoSalvo } from "@/lib/storage";
import { montarChunksEm, limparChunks } from "@/lib/upload-chunks";
import { destinoArquivo, extensao, limiteDoPacote, limiteLabelDoPacote, type PacoteAlvo } from "@/modules/uploads/service";
import { baseDirDisciplina, nomeFisico } from "@/modules/uploads/caminho";
import { chaveDocumento, localDaChave } from "@/modules/uploads/documento";
import { confiavel, interpretarNomeArquivo } from "@/modules/uploads/nomenclatura/interpretar";
import {
  carregarCatalogosNomenclatura,
  carregarExtensoesNomenclatura,
} from "@/modules/uploads/nomenclatura/queries";
import { montarVocabulario } from "@/modules/uploads/nomenclatura/vocabulario";
import { resolverMetadado } from "@/modules/uploads/nomenclatura/precedencia";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { registrarEventoDocumento } from "@/modules/uploads/historico/service";
import { LIMITE_FINALIZACOES_UPLOAD } from "@/modules/uploads/limites";
import { enfileirarConversao } from "@/modules/coordenacao/service";
import { enfileirarConversaoDwg } from "@/modules/dwg/service";
import { enfileirarLeituraTamanhoPapel } from "@/modules/uploads/tamanho-papel-pdf";

type Resultado = {
  nome: string;
  ok: boolean;
  pacote?: string;
  motivo?: string;
  realocado?: boolean;
  revisaoId?: string;
  revisaoNumero?: number;
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

  const limite = limitarRequisicao(req, {
    escopo: "upload-finalizacao",
    identificador: user.id,
    // Cada arquivo conclui em sua própria requisição para preservar o progresso individual.
    ...LIMITE_FINALIZACOES_UPLOAD,
  });
  if (!limite.permitido) {
    await auditarBloqueioRateLimit(limite, { modulo: "uploads", acao: "enviar-arquivos", userId: user.id, entidade: "Upload" });
    return respostaLimiteRequisicoes(limite);
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
  const faseIdInformada = String(form.get("faseId") ?? "") || null;
  const tipoIdInformado = String(form.get("tipoId") ?? "") || null;
  const revisaoDeId = String(form.get("revisaoDeId") ?? "") || null;
  const novaRevisaoAgrupada = form.get("novaRevisaoAgrupada") === "1";
  /** "Nova versão de": revisão nova de um documento JÁ existente, mesmo com outro nome (D10). */
  const versaoDeDocumentoId = String(form.get("versaoDeDocumentoId") ?? "") || null;
  if (!disciplinaId || (!pastaId && alvo !== "A" && alvo !== "B" && alvo !== "RECEBIDOS")) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  if (revisaoDeId && novaRevisaoAgrupada) {
    return NextResponse.json({ error: "Parâmetros de revisão inválidos." }, { status: 400 });
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

  // Regra: só o responsável da disciplina (ou quem atua em disciplina alheia) envia arquivos.
  const ehResp = disciplina.responsaveis.some((r) => r.userId === user.id);
  if (!ehResp && !(await podeAtuarEmDisciplinaAlheia(user))) {
    return NextResponse.json(
      { error: "Apenas responsáveis pela disciplina podem enviar arquivos." },
      { status: 403 },
    );
  }
  // Capability de envio (recurso `arquivos`), exigida de TODOS — `superUsuario` passa pelo motor.
  // Até 2026-09-15 o papel admin/supervisor pulava este passo; a tela (`podeEnviar` em
  // `arvoreArquivosProjeto`) já exigia a capability de todo mundo, então rota e botão divergiam.
  if (!(await podeEnviarArquivo(user))) {
    return NextResponse.json(
      { error: "Sem permissão para enviar arquivos." },
      { status: 403 },
    );
  }

  // Refs não-nulas p/ uso dentro de closures (o narrowing do guard `!disciplina` não
  // atravessa funções aninhadas como `avisarValidadores`).
  const { projeto, disciplinaTextoLegado: disciplinaNome } = disciplina;
  // Fase é uma configuração efetiva: o projeto sobrescreve o global; ausência de ambos
  // preserva o padrão da migration M8 (opcional). A validação acontece aqui, antes de
  // qualquer gravação física, para que uma chamada direta à rota não contorne o formulário.
  const configsNomenclatura = await prisma.nomenclaturaConfig.findMany({
    where: { OR: [{ projetoId: projeto.id }, { projetoId: null }] },
    select: { projetoId: true, exigirFase: true },
  });
  const configProjeto = configsNomenclatura.find((config) => config.projetoId === projeto.id);
  const configGlobal = configsNomenclatura.find((config) => config.projetoId === null);
  const exigeFase = configProjeto?.exigirFase ?? configGlobal?.exigirFase ?? false;

  // Item 15: nomenclatura usa a sigla do catálogo (ex.: ELE) quando existir; senão, o nome.
  const cat = await prisma.disciplinaCatalogo.findFirst({
    where: { nome: disciplina.disciplinaTextoLegado },
    select: { id: true, codigo: true },
  });
  const codDisc = cat?.codigo ?? null;

  // ── Motor de nomenclatura (F3) ───────────────────────────────────────────────────────────
  // Catálogo efetivo do projeto (global + próprio) + extensões + padrão, carregados UMA vez por
  // requisição; o motor em si é puro e roda por arquivo dentro de `persistir`.
  const [catalogosNomenclatura, extensoesCatalogo, nomenclatura] = await Promise.all([
    carregarCatalogosNomenclatura(projeto.id),
    carregarExtensoesNomenclatura(),
    resolverNomenclatura(projeto.id),
  ]);
  const vocabulario = montarVocabulario(catalogosNomenclatura, projeto.id);
  const fasesDoProjeto = catalogosNomenclatura.fases;
  const tiposDoProjeto = catalogosNomenclatura.tipos;

  const faseSelecionada = faseIdInformada ? fasesDoProjeto.find((fase) => fase.id === faseIdInformada) ?? null : null;
  const tipoSelecionado = tipoIdInformado ? tiposDoProjeto.find((tipo) => tipo.id === tipoIdInformado) ?? null : null;
  const erroFase = exigeFase && !faseIdInformada
    ? "Selecione a fase do documento antes de enviar."
    : faseIdInformada && !faseSelecionada
      ? "A fase selecionada não está disponível para este projeto."
      : tipoIdInformado && !tipoSelecionado
        ? "O tipo selecionado não está disponível para este projeto."
        : null;

  /**
   * Lê o nome pelo motor. O contexto não leva `documentosExistentes`: sugerir "nova versão de"
   * é papel do diálogo — aqui a decisão já chegou pronta em `versaoDeDocumentoId` (ADR-0003:
   * o servidor não infere o que o usuário não confirmou).
   */
  const lerNome = (nome: string) =>
    interpretarNomeArquivo(nome, {
      projeto: { codigo: projeto.codigo, ano: projeto.ano, sequencial: projeto.sequencial },
      disciplinaCatalogoId: cat?.id ?? null,
      padrao: nomenclatura.padrao,
      vocabulario,
      extensoes: extensoesCatalogo,
    });
  const baseDir = baseDirDisciplina({
    ano: projeto.ano,
    clienteNome: projeto.cliente.nome,
    projetoCodigo: projeto.codigo,
    projetoNome: projeto.nome,
    disciplinaNome: disciplina.disciplinaTextoLegado,
    siglaDisciplina: codDisc,
  });
  // Quando uma chamada multipart já traz PDF+DWG, o próprio request mantém o id criado
  // para o primeiro arquivo. O mesmo contrato também funciona entre chamadas (chunks),
  // quando o cliente devolve esse id em `revisaoDeId`.
  const revisoesAgrupadas = new Map<string, { id: string; numero: number }>();

  /**
   * Persiste UM arquivo já validado por tamanho: resolve destino (roteamento/versão),
   * chama `gravar(relativo)` (buffer direto OU montagem de chunks) e cria o registro.
   */
  async function persistir(nome: string, gravar: (relativo: string) => Promise<ArquivoSalvo>, mime: string | null): Promise<Resultado> {
    if (erroFase) return { nome, ok: false, motivo: erroFase };
    // Pasta-mode (aprovação/laudo, pasta personalizada): sem roteamento por extensão nem
    // pacote — o destino já é a pasta escolhida no client.
    const destino = pastaAlvo ? null : destinoArquivo(nome, alvo);
    const realocado = destino === "OUTROS" && alvo === "A";
    const chave = chaveDocumento({
      pacote: pastaAlvo ? null : destino,
      pastaId: pastaAlvo?.id ?? null,
      nomeArquivo: nome,
    });

    // "Nova versão de" (D10): o documento é escolhido pela pessoa, não pelo nome — é o caminho
    // do backup do AltoQi (`[cópia 2026-09-14_05]` muda a cada gravação) e do arquivo
    // renumerado. A `chave` e o `nomeArquivo` do documento NÃO mudam (ADR-0003, regra 1);
    // o Upload guarda o nome real do arquivo.
    const documentoEscolhido = versaoDeDocumentoId
      ? await prisma.documentoDisciplina.findUnique({
          where: { id: versaoDeDocumentoId },
          select: { id: true, disciplinaId: true, chave: true, faseId: true, tipoId: true, numeroPrancha: true, tamanhoPapelId: true, substituidoPorId: true, status: { select: { final: true } } },
        })
      : null;
    if (versaoDeDocumentoId) {
      if (!documentoEscolhido || documentoEscolhido.disciplinaId !== disciplinaId || documentoEscolhido.substituidoPorId) {
        return { nome, ok: false, motivo: "O documento escolhido para receber a nova versão não pertence a esta disciplina." };
      }
      // O destino deste envio tem de ser o MESMO do documento. `pacote` XOR `pastaId` é a
      // invariante que a `chave` protege: um documento com versões dos dois lados quebraria a
      // árvore do zip (`caminhoNoZip` × `caminhoNoZipPasta`) e a validação (arquivo de pasta
      // não passa por validação, arquivo de pacote passa).
      const localAtual = localDaChave(chave);
      if (localDaChave(documentoEscolhido.chave) !== localAtual) {
        return { nome, ok: false, motivo: "O documento escolhido fica em outro destino — envie a nova versão para o mesmo lugar dele." };
      }
    }

    // Sem "nova versão de", o documento é resolvido pelo nome, como sempre.
    const documentoPorChave = documentoEscolhido
      ? null
      : await prisma.documentoDisciplina.findUnique({
          where: { disciplinaId_chave: { disciplinaId, chave } },
          select: { id: true, faseId: true, tipoId: true, numeroPrancha: true, tamanhoPapelId: true, status: { select: { final: true } } },
        });
    const documentoExistente = documentoEscolhido ?? documentoPorChave;

    // O status final pertence ao documento lógico, não ao Upload: a consulta antecede a
    // gravação física para não deixar arquivo no disco quando uma nova revisão é vedada.
    if (documentoExistente?.status?.final) {
      return { nome, ok: false, motivo: "Este documento está com status final e não aceita novas revisões." };
    }

    // Agrupamento (PDF+DWG na mesma revisão) é por documento: com "nova versão de", dois
    // arquivos de nomes diferentes caem no mesmo documento e precisam da MESMA chave de grupo.
    const chaveGrupo = documentoEscolhido ? `doc:${documentoEscolhido.id}` : chave;
    const revisaoDeIdEfetiva = revisaoDeId ?? revisoesAgrupadas.get(chaveGrupo)?.id ?? null;

    // O segundo arquivo de uma revisão agrupada recebe o id criado pelo primeiro. Antes de
    // gravar no disco, confirma que a revisão pertence ao mesmo documento e ainda não contém
    // esta extensão — PDF e DWG podem coexistir; dois PDFs não podem reescrever o histórico.
    const revisaoExistente = revisaoDeIdEfetiva
      ? await prisma.documentoRevisao.findUnique({
          where: { id: revisaoDeIdEfetiva },
          select: { id: true, documentoId: true, numero: true, uploads: { select: { nomeArquivo: true } } },
        })
      : null;
    if (revisaoDeIdEfetiva && (!documentoExistente || !revisaoExistente || revisaoExistente.documentoId !== documentoExistente.id)) {
      return { nome, ok: false, motivo: "A revisão informada não pertence a este documento." };
    }
    if (revisaoExistente?.uploads.some((upload) => extensao(upload.nomeArquivo) === extensao(nome))) {
      return { nome, ok: false, motivo: "Esta revisão já contém um arquivo dessa extensão." };
    }

    // Versionamento: mesma disciplina + (pacote OU pasta) + nome → incrementa versão. Com
    // "nova versão de" o nome muda a cada envio (o backup do AltoQi carimba `[cópia ...]`),
    // então a contagem segue o DOCUMENTO: senão cada cópia entraria como versão 1 e o
    // histórico do documento teria várias "versão 1" fora de ordem.
    const anterior = await prisma.upload.findFirst({
      where: documentoEscolhido
        ? { documentoId: documentoEscolhido.id }
        : pastaAlvo
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

    // ── Metadados lidos do nome (motor de nomenclatura) ────────────────────────────────────
    // Precedência do ADR-0003 (regra 2): escolha manual do diálogo > valor que o documento já
    // tem > leitura do nome. Só confiança ALTA preenche sozinha (D7); o resto é sugestão e
    // morre aqui — o diálogo é quem mostra.
    const interp = lerNome(nome);
    const faseDoNome = confiavel(interp.fase) ? interp.fase : undefined;
    const tipoDoNome = confiavel(interp.tipo) ? interp.tipo : undefined;
    const numeroDoNome = confiavel(interp.numero) ? interp.numero : undefined;

    const faseFinal = resolverMetadado(faseSelecionada?.id, faseDoNome?.valor, documentoExistente?.faseId);
    const tipoFinal = resolverMetadado(tipoSelecionado?.id, tipoDoNome?.valor, documentoExistente?.tipoId);
    const numeroFinal = resolverMetadado<number>(null, numeroDoNome?.valor, documentoExistente?.numeroPrancha);
    const metadados = {
      ...(faseFinal ? { faseId: faseFinal.valor } : {}),
      ...(tipoFinal ? { tipoId: tipoFinal.valor } : {}),
      ...(numeroFinal ? { numeroPrancha: numeroFinal.valor } : {}),
    };

    // Documento lógico (pai) que agrupa as versões deste arquivo. Com "nova versão de" ele já
    // veio escolhido; senão, `upsert` sobre o unique (disciplinaId, chave) resolve o existente
    // OU cria — e é o que impede dois envios simultâneos do mesmo nome de criarem dois pais
    // para a mesma cadeia.
    const documento = documentoEscolhido
      ? await prisma.documentoDisciplina.update({
          where: { id: documentoEscolhido.id },
          data: metadados,
          select: { id: true },
        })
      : await prisma.documentoDisciplina.upsert({
          where: { disciplinaId_chave: { disciplinaId, chave } },
          create: { disciplinaId, chave, nomeArquivo: nome, ...metadados },
          update: metadados,
          select: { id: true },
        });

    // Sem os campos novos, preserva a regra legada: a versão do arquivo determina a
    // revisão. Em uma operação agrupada, só o primeiro arquivo cria a próxima revisão do
    // documento; os demais recebem `revisaoDeId` e entram exatamente no mesmo ponto no tempo.
    let revisao: { id: string; numero: number };
    if (revisaoExistente) {
      revisao = revisaoExistente;
    } else if (documentoEscolhido) {
      // "Nova versão de": a revisão segue o documento, não a contagem por nome de arquivo.
      const ultima = await prisma.documentoRevisao.aggregate({
        where: { documentoId: documento.id },
        _max: { numero: true },
      });
      const numero = (ultima._max.numero ?? 0) + 1;
      revisao = await prisma.documentoRevisao.upsert({
        where: { documentoId_numero: { documentoId: documento.id, numero } },
        create: { documentoId: documento.id, numero, createdById: user.id },
        update: {},
        select: { id: true, numero: true },
      });
    } else if (novaRevisaoAgrupada) {
      const ultima = await prisma.documentoRevisao.aggregate({
        where: { documentoId: documento.id },
        _max: { numero: true },
      });
      const numero = (ultima._max.numero ?? 0) + 1;
      revisao = await prisma.documentoRevisao.upsert({
        where: { documentoId_numero: { documentoId: documento.id, numero } },
        create: { documentoId: documento.id, numero, createdById: user.id },
        update: {},
        select: { id: true, numero: true },
      });
    } else {
      revisao = await prisma.documentoRevisao.upsert({
        where: { documentoId_numero: { documentoId: documento.id, numero: versao } },
        create: { documentoId: documento.id, numero: versao, createdById: user.id },
        update: {},
        select: { id: true, numero: true },
      });
    }
    if (novaRevisaoAgrupada) revisoesAgrupadas.set(chaveGrupo, revisao);

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

    // Só o que ESTE envio gravou. `fase`/`faseOrigem` continuam no formato antigo para as
    // linhas já existentes no histórico não mudarem de leitura; `tipo` e `numeroPrancha` são
    // do mesmo feitio, cada um com a origem (manual = escolhido no diálogo, nome = lido).
    const siglaFase = faseFinal ? vocabulario.siglaDe("fase", faseFinal.valor) : null;
    const siglaTipo = tipoFinal ? vocabulario.siglaDe("tipo", tipoFinal.valor) : null;
    await registrarEventoDocumento({
      documentoId: documento.id,
      uploadId: criado.id,
      tipo: "envio",
      userId: user.id,
      detalhe: {
        arquivo: nome,
        versao,
        revisao: revisao.numero,
        ...(versaoDeDocumentoId ? { novaVersaoDe: true } : {}),
        ...(faseFinal && siglaFase ? { fase: siglaFase, faseOrigem: faseFinal.origem } : {}),
        ...(tipoFinal && siglaTipo ? { tipo: siglaTipo, tipoOrigem: tipoFinal.origem } : {}),
        ...(numeroFinal ? { numeroPrancha: numeroFinal.valor, numeroPranchaOrigem: numeroFinal.origem } : {}),
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
    // Motor de nomenclatura (F4): PDF de documento ainda sem tamanho de papel entra na fila de
    // leitura. Só quando falta — documento que já tem não ganha segunda leitura a cada versão
    // nova. Fire-and-forget, mesmo padrão do IFC/DWG acima.
    if (extensao(nome) === "pdf" && !documentoExistente?.tamanhoPapelId) {
      void enfileirarLeituraTamanhoPapel(documento.id, salvo.caminho).catch((err) =>
        console.error("[upload] falha ao enfileirar leitura de tamanho de papel:", err),
      );
    }
    return pastaAlvo
      ? { nome, ok: true, realocado: false, revisaoId: revisao.id, revisaoNumero: revisao.numero }
      : { nome, ok: true, pacote: destino!, realocado, revisaoId: revisao.id, revisaoNumero: revisao.numero };
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
      detalhe: {
        pacote: alvo,
        faseId: faseSelecionada?.id ?? null,
        tipoId: tipoSelecionado?.id ?? null,
        versaoDeDocumentoId,
        total: 1,
        ok: resultados.filter((r) => r.ok).length,
        chunked: true,
        revisaoAgrupada: novaRevisaoAgrupada || revisaoDeId !== null,
      },
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
    detalhe: {
      pacote: alvo,
      faseId: faseSelecionada?.id ?? null,
      tipoId: tipoSelecionado?.id ?? null,
      versaoDeDocumentoId,
      total: arquivos.length,
      ok: resultados.filter((r) => r.ok).length,
      revisaoAgrupada: novaRevisaoAgrupada || revisaoDeId !== null,
    },
    ip: await getClientIp(),
  });

  await avisarValidadores(resultados).catch((e) =>
    console.error("[upload] falha ao notificar validadores:", e),
  );

  return NextResponse.json({ resultados });
}
