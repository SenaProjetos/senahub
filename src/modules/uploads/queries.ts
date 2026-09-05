import "server-only";
import { prisma } from "@/lib/prisma";
import { diasRestantesLixeira, DIAS_LIXEIRA } from "./lixeira";
import { agruparPorDocumento } from "./exclusao-escopo";

export async function listarUploadsDisciplina(disciplinaId: string) {
  const uploads = await prisma.upload.findMany({
    where: { disciplinaId },
    orderBy: [{ pacote: "asc" }, { createdAt: "desc" }],
    include: { autor: { select: { name: true } }, validadoPor: { select: { name: true } } },
  });
  return uploads;
}

/** Indica se cada pacote obrigatório (A e B) tem ao menos um arquivo. */
export async function pacotesCompletos(disciplinaId: string) {
  const grupos = await prisma.upload.groupBy({
    by: ["pacote"],
    where: { disciplinaId },
    _count: { _all: true },
  });
  const mapa = new Map(grupos.map((g) => [g.pacote, g._count._all]));
  return {
    a: (mapa.get("A") ?? 0) > 0,
    b: (mapa.get("B") ?? 0) > 0,
    outros: mapa.get("OUTROS") ?? 0,
  };
}

export type UploadItem = Awaited<ReturnType<typeof listarUploadsDisciplina>>[number];

/**
 * Lixeira do projeto: arquivos (Upload) na lixeira, mais recentes primeiro. Passa
 * `excluidoEm: { not: null }` explícito para ESCAPAR do filtro global (lib/prisma.ts).
 * Só admin usa isto (a page gateia). Resolve nome de quem excluiu e dias até a purga.
 */
export async function lixeiraDoProjeto(projetoId: string) {
  const uploads = await prisma.upload.findMany({
    where: { disciplina: { projetoId }, excluidoEm: { not: null } },
    orderBy: { excluidoEm: "desc" },
    select: {
      id: true,
      nomeArquivo: true,
      pacote: true,
      versao: true,
      tamanho: true,
      excluidoEm: true,
      excluidoPorId: true,
      disciplinaId: true,
      disciplina: { select: { disciplinaTextoLegado: true } },
      // Documento (+ canônico do merge): a restauração agrupa por documento para não
      // remontar linhagem capenga — 1 revisão de 3 restaurada vira "corrente" no link.
      documentoId: true,
      documento: { select: { substituidoPorId: true } },
      // Envio original (quem/quando mandou), distinto de quem excluiu.
      createdAt: true,
      autorId: true,
    },
  });

  // Um mapa só para os dois papéis (quem excluiu e quem enviou): são o mesmo `User`.
  const pessoaIds = [
    ...new Set([
      ...uploads.map((u) => u.excluidoPorId).filter((v): v is string => !!v),
      ...uploads.map((u) => u.autorId),
    ]),
  ];
  const autores = pessoaIds.length
    ? await prisma.user.findMany({ where: { id: { in: pessoaIds } }, select: { id: true, name: true } })
    : [];
  const nomePor = new Map(autores.map((u) => [u.id, u.name]));

  return uploads.map((u) => ({
    id: u.id,
    nome: u.nomeArquivo,
    pacote: u.pacote,
    versao: u.versao,
    tamanho: u.tamanho,
    disciplinaId: u.disciplinaId,
    disciplina: u.disciplina.disciplinaTextoLegado,
    documentoId: u.documentoId,
    documentoCanonicoId: u.documento?.substituidoPorId ?? null,
    enviadoEm: u.createdAt.toISOString(),
    enviadoPor: nomePor.get(u.autorId) ?? null,
    excluidoEm: u.excluidoEm!.toISOString(),
    excluidoPor: u.excluidoPorId ? nomePor.get(u.excluidoPorId) ?? null : null,
    diasRestantes: diasRestantesLixeira(u.excluidoEm!),
  }));
}

export type LixeiraItem = Awaited<ReturnType<typeof lixeiraDoProjeto>>[number];
export { DIAS_LIXEIRA };

/**
 * Ids dos arquivos deste projeto com pedido de exclusão PENDENTE — sinal na árvore do
 * explorer (badge "exclusão solicitada" + botão de pedir desarmado). `solicitanteId`
 * restringe à visão de quem só enxerga o próprio pedido; sem ele, vêm todos (admin).
 */
export async function pedidosExclusaoPendentesDoProjeto(
  projetoId: string,
  solicitanteId?: string,
) {
  const pedidos = await prisma.solicitacaoExclusaoUpload.findMany({
    where: { projetoId, status: "pendente", ...(solicitanteId ? { solicitanteId } : {}) },
    select: { uploadId: true },
  });
  return pedidos.map((p) => p.uploadId);
}

/**
 * Fila de pedidos de exclusão pendentes (todos os projetos) — a segunda seção de
 * `/aprovacoes`, gateada a admin na page. Traz arquivo, projeto, disciplina e quem pediu.
 * Leitura ANINHADA do upload de propósito (o pedido pode apontar para um arquivo que um
 * admin já mandou pra lixeira por fora — ele precisa aparecer pra ser encerrado).
 */
export async function pedidosExclusaoPendentes() {
  const pedidos = await prisma.solicitacaoExclusaoUpload.findMany({
    where: { status: "pendente" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      justificativa: true,
      createdAt: true,
      uploadId: true,
      solicitante: { select: { name: true } },
      upload: {
        select: {
          nomeArquivo: true,
          pacote: true,
          versao: true,
          tamanho: true,
          excluidoEm: true,
          disciplina: {
            select: { disciplinaTextoLegado: true, projetoId: true, projeto: { select: { codigo: true, nome: true } } },
          },
        },
      },
    },
  });

  return pedidos.map((p) => ({
    id: p.id,
    uploadId: p.uploadId,
    nome: p.upload.nomeArquivo,
    pacote: p.upload.pacote,
    versao: p.upload.versao,
    tamanho: p.upload.tamanho,
    // Já na lixeira: o pedido virou formalidade, a UI mostra isso e só encerra.
    jaNaLixeira: p.upload.excluidoEm !== null,
    disciplina: p.upload.disciplina.disciplinaTextoLegado,
    projetoId: p.upload.disciplina.projetoId,
    projetoCodigo: p.upload.disciplina.projeto.codigo,
    projetoNome: p.upload.disciplina.projeto.nome,
    solicitante: p.solicitante.name,
    justificativa: p.justificativa,
    criadoEm: p.createdAt.toISOString(),
    href: `/projetos/${p.upload.disciplina.projetoId}/arquivos`,
    downloadUrl: `/api/uploads/${p.uploadId}/download`,
  }));
}

export type PedidoExclusaoPendente = Awaited<ReturnType<typeof pedidosExclusaoPendentes>>[number];

export type RevisaoDocumento = { uploadId: string; versao: number; excluido: boolean };

/**
 * Todas as versões (Upload) de um documento, mais recente primeiro — pro comparador de
 * revisões (itens 4/5). Leitura ANINHADA de propósito (`documentoDisciplina.findUnique` →
 * `include: { uploads }`), pra ESCAPAR do filtro de soft-delete (`lib/prisma.ts` só
 * intercepta `prisma.upload.*` top-level): uma revisão antiga jogada na lixeira continua
 * valendo pra comparação ("o que mudou desde a versão que foi descartada" é uma pergunta
 * legítima), então ela precisa aparecer no seletor — com um sinal visual de que está
 * excluída, não escondida.
 */
export type PranchaVigente = { uploadId: string; nomeArquivo: string };

/**
 * Pranchas VIGENTES (versão mais recente de cada documento) de uma disciplina, exceto a
 * informada — candidatas a destino do "replicar apontamento" (item 30). Só a versão vigente
 * faz sentido como destino, mesma regra de `criarPendencia` (apontar em versão obsoleta não
 * cabe). `prisma.upload` no topo passa pelo filtro de soft-delete (`lib/prisma.ts`) — aqui é
 * proposital: prancha excluída não deve virar destino de replicação. (Oposto de
 * `revisoesDoDocumento`, que bypassa esse filtro de propósito, pra listar histórico completo.)
 */
export async function pranchasVigentesDisciplina(disciplinaId: string, excluirUploadId: string): Promise<PranchaVigente[]> {
  const uploads = await prisma.upload.findMany({
    where: { disciplinaId, id: { not: excluirUploadId } },
    select: { id: true, nomeArquivo: true, documentoId: true, versao: true, pacote: true },
    orderBy: { versao: "desc" },
  });
  const vistos = new Set<string>();
  const vigentes: PranchaVigente[] = [];
  for (const u of uploads) {
    // Chave de "mesmo documento": documentoId quando existe; fallback pra nome+pacote em
    // linha legada sem pai (mesmo padrão de fallback usado em `criarPendencia`).
    const chave = u.documentoId ?? `${u.pacote ?? ""}/${u.nomeArquivo}`;
    if (vistos.has(chave)) continue; // já viu a versão mais recente (ordenado desc)
    vistos.add(chave);
    vigentes.push({ uploadId: u.id, nomeArquivo: u.nomeArquivo });
  }
  return vigentes;
}

export type PranchaNavegavel = { uploadId: string; nomeArquivo: string; revisao: number };

/** PDFs vigentes da disciplina, ordenados pelo nome para navegação linear no visualizador. */
export async function pranchasPdfVigentesDisciplina(disciplinaId: string): Promise<PranchaNavegavel[]> {
  const uploads = await prisma.upload.findMany({
    where: {
      disciplinaId,
      nomeArquivo: { endsWith: ".pdf", mode: "insensitive" },
    },
    select: {
      id: true,
      nomeArquivo: true,
      documentoId: true,
      versao: true,
      pacote: true,
      revisao: { select: { numero: true } },
    },
    orderBy: { versao: "desc" },
  });
  const vistos = new Set<string>();
  const vigentes: PranchaNavegavel[] = [];
  for (const upload of uploads) {
    const chave = upload.documentoId ?? `${upload.pacote ?? ""}/${upload.nomeArquivo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    vigentes.push({
      uploadId: upload.id,
      nomeArquivo: upload.nomeArquivo,
      revisao: upload.revisao?.numero ?? upload.versao,
    });
  }
  return vigentes.sort((a, b) => a.nomeArquivo.localeCompare(b.nomeArquivo, "pt-BR"));
}

export async function revisoesDoDocumento(
  documentoId: string,
  opts: { mesmaExtensaoDe?: string } = {},
): Promise<RevisaoDocumento[]> {
  const doc = await prisma.documentoDisciplina.findUnique({
    where: { id: documentoId },
    include: {
      uploads: {
        select: { id: true, versao: true, excluidoEm: true, nomeArquivo: true },
        orderBy: { versao: "desc" },
      },
    },
  });
  if (!doc) return [];

  // Depois do merge por nome-base (M4) um documento guarda PDF e DWG juntos. Comparar
  // revisões só faz sentido dentro do MESMO formato — sem este filtro o seletor do
  // comparador ofereceria o .dwg como se fosse uma revisão do .pdf.
  const ext = opts.mesmaExtensaoDe ? extensaoDe(opts.mesmaExtensaoDe) : null;
  const uploads = ext ? doc.uploads.filter((u) => extensaoDe(u.nomeArquivo) === ext) : doc.uploads;

  return uploads.map((u) => ({ uploadId: u.id, versao: u.versao, excluido: u.excluidoEm != null }));
}

// ── Listagem paginada de documentos (tela nova, Fase 1 — F1-PR10) ─────────────
// Substitui, na tela v2, o caminho "carrega a árvore inteira e filtra em memória":
// projeto com milhares de arquivos passava todos pelo servidor e pelo DOM. Aqui filtro,
// ordenação e recorte acontecem no Postgres, e só a página pedida sai do banco.

/** Campos ordenáveis — whitelist (o valor vem da URL). */
export const CAMPOS_ORDENACAO_DOCUMENTOS = ["nome", "disciplina", "versao", "data", "tamanho"] as const;
export type CampoOrdenacaoDocumento = (typeof CAMPOS_ORDENACAO_DOCUMENTOS)[number];

export type FiltrosListagemDocumentos = {
  disciplinaId?: string | null;
  q?: string;
  ext?: string;
  autor?: string;
  /** Dias para trás; qualquer valor fora de 7/30/90 é ignorado. */
  periodo?: string;
  /** "sim" | "nao" — arquivos de PastaProjeto ficam fora dos dois (não têm validação). */
  validado?: string;
};

const DIAS_VALIDOS = new Set(["7", "30", "90"]);

function orderByDocumentos(
  sort: CampoOrdenacaoDocumento | null,
  dir: "asc" | "desc",
): NonNullable<Parameters<typeof prisma.upload.findMany>[0]>["orderBy"] {
  switch (sort) {
    case "nome":
      return [{ nomeArquivo: dir }];
    case "disciplina":
      // Desempate por nome do arquivo, igual à ordenação client anterior.
      return [{ disciplina: { disciplinaTextoLegado: dir } }, { nomeArquivo: "asc" }];
    case "versao":
      return [{ versao: dir }];
    case "tamanho":
      return [{ tamanho: dir }];
    case "data":
      return [{ createdAt: dir }];
    default:
      // Sem ordenação escolhida: mais recente primeiro — o que a pessoa acabou de enviar.
      return [{ createdAt: "desc" }];
  }
}

/**
 * Uma página de documentos do projeto, já filtrada e ordenada no banco.
 *
 * `veTodas` reproduz a muralha por disciplina do resto do módulo: quem não a tem só
 * enxerga as disciplinas onde é responsável — a mesma regra da rota de download.
 */
export async function listarDocumentosProjeto(opts: {
  projetoId: string;
  userId: string;
  veTodas: boolean;
  filtros: FiltrosListagemDocumentos;
  skip: number;
  take: number;
  sort: CampoOrdenacaoDocumento | null;
  dir: "asc" | "desc";
}) {
  const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;

  const escopoDisciplina = {
    projetoId,
    ...(veTodas ? {} : { responsaveis: { some: { userId } } }),
    ...(filtros.disciplinaId ? { id: filtros.disciplinaId } : {}),
  };

  const termo = filtros.q?.trim();
  const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;

  const where = {
    // Lixeira: `findMany` de topo já ganha `excluidoEm: null` pela extensão de lib/prisma.ts,
    // mas deixamos explícito porque a condição viaja junto no `count` e no `groupBy`.
    excluidoEm: null,
    disciplina: escopoDisciplina,
    ...(termo
      ? {
          OR: [
            { nomeArquivo: { contains: termo, mode: "insensitive" as const } },
            { disciplina: { disciplinaTextoLegado: { contains: termo, mode: "insensitive" as const } } },
            { autor: { name: { contains: termo, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(filtros.ext ? { nomeArquivo: { endsWith: `.${filtros.ext}`, mode: "insensitive" as const } } : {}),
    ...(filtros.autor ? { autor: { name: filtros.autor } } : {}),
    ...(dias ? { createdAt: { gte: new Date(Date.now() - dias * 86_400_000) } } : {}),
    // Validação só existe no fluxo de pacote; arquivo dentro de PastaProjeto fica fora.
    ...(filtros.validado === "sim" ? { validado: true, pastaId: null } : {}),
    ...(filtros.validado === "nao" ? { validado: false, pastaId: null } : {}),
  };

  // Conta ANTES de buscar para poder grampear a página: `?page=99` num projeto de 3 páginas
  // caía numa tela vazia dizendo "nenhum documento neste projeto", ao lado de "68 item(ns)".
  const total = await prisma.upload.count({ where });
  const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
  const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
  const pagina = Math.min(paginaPedida, ultimaPagina);
  const skipEfetivo = (pagina - 1) * take;

  const uploads = await prisma.upload.findMany({
      where,
      orderBy: orderByDocumentos(sort, dir),
      skip: skipEfetivo,
      take,
      select: {
        id: true,
        nomeArquivo: true,
        versao: true,
        tamanho: true,
        validado: true,
        pastaId: true,
        createdAt: true,
        // Documento (+ canônico do merge): o diálogo de escopo agrupa as revisões por ele.
        documentoId: true,
        documento: { select: { substituidoPorId: true } },
        // `responsaveis` alimenta o `podeGerir` da linha (renomear é de global/responsável).
        disciplina: { select: { id: true, disciplinaTextoLegado: true, responsaveis: { select: { userId: true } } } },
        autor: { select: { name: true } },
      },
  });

  return { total, uploads, pagina };
}

/** Extensão em minúsculas, sem ponto (`""` quando o nome não tem extensão). */
function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/**
 * Converte o resultado de `listarDocumentosProjeto` nas linhas que a tabela consome.
 *
 * `validado` vira `null` para arquivo dentro de `PastaProjeto`: lá não existe validação
 * por arquivo, e mostrar "pendente" para sempre seria mentira (mesma regra de
 * `linhasDeDocumentos`, usada pelo caminho não paginado).
 */
export function linhasDeUploads(
  uploads: Awaited<ReturnType<typeof listarDocumentosProjeto>>["uploads"],
  opts: { podeEnviarCap: boolean; ehGlobal: boolean; userId: string },
) {
  return uploads.map((u) => ({
    id: u.id,
    nome: u.nomeArquivo,
    ext: extensaoDe(u.nomeArquivo),
    disciplinaId: u.disciplina.id,
    disciplinaNome: u.disciplina.disciplinaTextoLegado,
    versao: u.versao,
    validado: u.pastaId ? null : u.validado,
    documentoId: u.documentoId,
    documentoCanonicoId: u.documento?.substituidoPorId ?? null,
    autor: u.autor?.name ?? "—",
    data: u.createdAt.toISOString(),
    tamanho: u.tamanho,
    downloadUrl: `/api/uploads/${u.id}/download`,
    podeGerir:
      opts.podeEnviarCap &&
      (opts.ehGlobal || u.disciplina.responsaveis.some((r) => r.userId === opts.userId)),
  }));
}

/**
 * Opções dos selects de filtro — extensões e responsáveis que REALMENTE existem no escopo.
 *
 * Sai do banco e não da página atual: com paginação, montar as opções a partir das 24 linhas
 * visíveis daria uma lista de filtros que muda a cada página. Ignora de propósito os demais
 * filtros ativos, para que aplicar um filtro nunca esvazie as opções dos outros.
 */
export async function opcoesFiltroDocumentos(opts: {
  projetoId: string;
  userId: string;
  veTodas: boolean;
  disciplinaId?: string | null;
}) {
  const { projetoId, userId, veTodas, disciplinaId } = opts;
  const uploads = await prisma.upload.findMany({
    where: {
      excluidoEm: null,
      disciplina: {
        projetoId,
        ...(veTodas ? {} : { responsaveis: { some: { userId } } }),
        ...(disciplinaId ? { id: disciplinaId } : {}),
      },
    },
    select: { nomeArquivo: true, autor: { select: { name: true } } },
  });

  const extensoes = [...new Set(uploads.map((u) => extensaoDe(u.nomeArquivo)).filter(Boolean))].sort();
  const autores = [...new Set(uploads.map((u) => u.autor?.name).filter((n): n is string => !!n))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  return { extensoes, autores };
}

/**
 * Resolve a cadeia de merge de documentos (M4): dado um id que pode ser um APELIDO
 * (documento absorvido por outro), devolve o id do documento vivo.
 *
 * Existe porque o merge por nome-base faz soft-retire em vez de DELETE — `AuditLog`
 * guarda `entidadeId` de documento sem FK, e links/bookmarks antigos continuam por aí.
 * Sem isto, um id antigo levaria a um documento sem nenhuma versão pendurada.
 *
 * `limite` corta cadeia patológica: um ciclo (A→B→A) causado por dado corrompido deixaria
 * o loop infinito, e travar uma página é pior do que devolver o último id conhecido.
 */
export async function resolverDocumentoCanonico(
  documentoId: string,
  limite = 10,
): Promise<string> {
  let atual = documentoId;
  for (let i = 0; i < limite; i++) {
    const doc = await prisma.documentoDisciplina.findUnique({
      where: { id: atual },
      select: { substituidoPorId: true },
    });
    if (!doc?.substituidoPorId) return atual;
    atual = doc.substituidoPorId;
  }
  return atual;
}

/**
 * Todas as linhas de `upload` do MESMO documento lógico de `uploadId`, num estado só
 * (vivas ou na lixeira) — é o conjunto que o escopo "documento inteiro" move de uma vez
 * (`modules/uploads/exclusao-escopo.ts`).
 *
 * O `OR` é obrigatório e NÃO pode virar `documentoId: canonico`: documentos fundidos por
 * nome-base (M4) deixam apelidos apontando para o canônico via `substituidoPorId`, e casar
 * só o canônico deixaria as revisões do lado do apelido para trás — que é exatamente a
 * ponta solta que o escopo por documento existe para eliminar. Mesmo `OR` de
 * `modules/projetos/arquivos/link-publico.ts`.
 *
 * `excluidoEm` vai SEMPRE explícito: `prisma.upload.findMany` é leitura top-level e recebe
 * `excluidoEm: null` injetado pela extensão de soft delete (lib/prisma.ts) — sem o valor
 * explícito, o caso "irmãos na lixeira" (usado pela restauração) voltaria vazio.
 *
 * Upload sem documento lógico é arquivo solto: devolve só ele mesmo.
 */
export async function irmaosDoDocumento(uploadId: string, naLixeira = false): Promise<string[]> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { id: true, documentoId: true },
  });
  if (!upload) return [];
  if (!upload.documentoId) return [upload.id];

  const documentoId = await resolverDocumentoCanonico(upload.documentoId);
  const irmaos = await prisma.upload.findMany({
    where: {
      excluidoEm: naLixeira ? { not: null } : null,
      OR: [{ documentoId }, { documento: { substituidoPorId: documentoId } }],
    },
    select: { id: true },
    orderBy: [{ versao: "asc" }, { nomeArquivo: "asc" }],
  });
  return irmaos.map((i) => i.id);
}

/** Uma linha de arquivo no diálogo de escopo da exclusão/restauração. */
export type LinhaEscopoExclusao = {
  id: string;
  nome: string;
  versao: number;
  /** `true` quando a linha já veio marcada pela pessoa (vs. irmã trazida junto). */
  selecionada: boolean;
};

/** Um documento afetado pela operação, com as linhas marcadas e as irmãs que existem. */
export type CasoEscopoExclusao = {
  /** `null` = arquivo solto (sem documento lógico): não há escopo a escolher. */
  documentoId: string | null;
  /** Rótulo do grupo na UI — nome do arquivo marcado mais recente. */
  rotulo: string;
  linhas: LinhaEscopoExclusao[];
};

/**
 * Monta os casos que o diálogo de escopo mostra: agrupa a seleção por documento canônico e
 * traz, de cada um, as revisões irmãs que a pessoa NÃO marcou — é a informação que falta
 * para ela decidir "só estas" ou "o documento inteiro", por caso.
 *
 * `naLixeira` inverte o estado consultado (restauração trabalha sobre o que está na lixeira).
 * Grupos sem irmã fora da seleção continuam na lista: o diálogo os mostra sem escolha, para
 * a pessoa ver tudo que a ação vai tocar.
 */
export async function casosEscopoExclusao(
  uploadIds: string[],
  naLixeira = false,
): Promise<CasoEscopoExclusao[]> {
  if (uploadIds.length === 0) return [];

  const selecionados = await prisma.upload.findMany({
    where: { id: { in: uploadIds }, excluidoEm: naLixeira ? { not: null } : null },
    select: { id: true, nomeArquivo: true, versao: true, documentoId: true },
    orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
  });
  if (selecionados.length === 0) return [];

  // Resolve o canônico UMA vez por documentoId distinto (a cadeia é I/O por salto).
  const canonicoPorDocumento = new Map<string, string>();
  for (const documentoId of new Set(selecionados.map((s) => s.documentoId).filter((d): d is string => d !== null))) {
    canonicoPorDocumento.set(documentoId, await resolverDocumentoCanonico(documentoId));
  }

  // Agrupamento pelo módulo PURO (`exclusao-escopo.ts`): a mesma função que a expansão do
  // lote usa. Duplicar a regra de chave aqui é como diálogo e ação passam a discordar.
  const marcados = new Set(selecionados.map((s) => s.id));
  const grupos = agruparPorDocumento(
    selecionados.map((s) => ({
      id: s.id,
      nome: s.nomeArquivo,
      versao: s.versao,
      documentoId: s.documentoId,
      documentoCanonicoId: s.documentoId ? canonicoPorDocumento.get(s.documentoId)! : null,
    })),
  );

  const casos = new Map<string, CasoEscopoExclusao>();
  for (const grupo of grupos) {
    casos.set(grupo.chave, {
      documentoId: grupo.documentoId,
      rotulo: grupo.linhas[0].nome,
      linhas: grupo.linhas.map((l) => ({ id: l.id, nome: l.nome, versao: l.versao, selecionada: true })),
    });
  }

  // Irmãs não marcadas, por documento — o que a pessoa ganha ao escolher "documento inteiro".
  for (const caso of casos.values()) {
    if (!caso.documentoId) continue;
    const irmaos = await prisma.upload.findMany({
      where: {
        excluidoEm: naLixeira ? { not: null } : null,
        OR: [{ documentoId: caso.documentoId }, { documento: { substituidoPorId: caso.documentoId } }],
      },
      select: { id: true, nomeArquivo: true, versao: true },
      orderBy: [{ nomeArquivo: "asc" }, { versao: "desc" }],
    });
    for (const irmao of irmaos) {
      if (marcados.has(irmao.id)) continue;
      caso.linhas.push({ id: irmao.id, nome: irmao.nomeArquivo, versao: irmao.versao, selecionada: false });
    }
  }

  return [...casos.values()];
}

export type ArquivoHistoricoRevisao = {
  id: string;
  nome: string;
  ext: string;
  excluido: boolean;
  downloadUrl: string;
};

export type HistoricoRevisao = {
  numero: number;
  /** ISO — atravessa a fronteira Server Action → cliente como string, não `Date`. */
  criadoEm: string;
  autor: string | null;
  /** `true` na revisão de maior número (a lista já vem ordenada da mais recente pra mais antiga). */
  atual: boolean;
  pendenciasCriadas: number;
  pendenciasResolvidas: number;
  arquivos: ArquivoHistoricoRevisao[];
};

/**
 * Histórico de revisões (R00, R01, R02...) de um documento — drawer do menu "..." da
 * tabela de arquivos (F2-PR8). Recebe o id do UPLOAD (é o que a linha da tabela tem à
 * mão) e resolve o documento a partir dele, em vez de exigir o documentoId do chamador.
 *
 * Chama `resolverDocumentoCanonico` antes de buscar as revisões: documentos podem ter
 * sido fundidos por nome-base (M4), e um id antigo aponta para um "apelido" sem
 * revisão nenhuma pendurada — sem isso o histórico viria vazio para documentos fundidos.
 *
 * Leitura ANINHADA (`documentoRevisao.findMany` → `include: { uploads }`) de propósito,
 * igual a `revisoesDoDocumento`: não passa pelo filtro global de soft-delete de
 * `lib/prisma.ts` (que só intercepta `prisma.upload.*` no topo), então um arquivo na
 * lixeira continua aparecendo na revisão a que pertence — só marcado `excluido: true`
 * para a UI sinalizar, nunca escondido (a pergunta "o que foi enviado nesta revisão"
 * continua válida mesmo depois de descartado).
 */
export async function historicoRevisoesDocumento(uploadId: string): Promise<HistoricoRevisao[]> {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: { documentoId: true },
  });
  // Sem documento lógico (linha legada anterior ao backfill): não há histórico de
  // revisões possível — estado vazio, não erro.
  if (!upload?.documentoId) return [];

  const documentoId = await resolverDocumentoCanonico(upload.documentoId);

  const revisoes = await prisma.documentoRevisao.findMany({
    where: { documentoId },
    orderBy: { numero: "desc" },
    select: {
      numero: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { pendenciasOrigem: true, pendenciasResolucao: true } },
      uploads: { select: { id: true, nomeArquivo: true, excluidoEm: true } },
    },
  });

  const maiorNumero = revisoes[0]?.numero;

  return revisoes.map((r) => ({
    numero: r.numero,
    criadoEm: r.createdAt.toISOString(),
    autor: r.createdBy?.name ?? null,
    atual: r.numero === maiorNumero,
    pendenciasCriadas: r._count.pendenciasOrigem,
    pendenciasResolvidas: r._count.pendenciasResolucao,
    arquivos: r.uploads.map((u) => ({
      id: u.id,
      nome: u.nomeArquivo,
      ext: extensaoDe(u.nomeArquivo),
      excluido: u.excluidoEm != null,
      downloadUrl: `/api/uploads/${u.id}/download`,
    })),
  }));
}
