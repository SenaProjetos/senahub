import "server-only";
import { prisma } from "@/lib/prisma";
import { diasRestantesLixeira, DIAS_LIXEIRA } from "./lixeira";

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
      disciplina: { select: { nome: true } },
    },
  });

  const autorIds = [...new Set(uploads.map((u) => u.excluidoPorId).filter((v): v is string => !!v))];
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nomePor = new Map(autores.map((u) => [u.id, u.name]));

  return uploads.map((u) => ({
    id: u.id,
    nome: u.nomeArquivo,
    pacote: u.pacote,
    versao: u.versao,
    tamanho: u.tamanho,
    disciplinaId: u.disciplinaId,
    disciplina: u.disciplina.nome,
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
            select: { nome: true, projetoId: true, projeto: { select: { codigo: true, nome: true } } },
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
    disciplina: p.upload.disciplina.nome,
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
      return [{ disciplina: { nome: dir } }, { nomeArquivo: "asc" }];
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
            { disciplina: { nome: { contains: termo, mode: "insensitive" as const } } },
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
        // `responsaveis` alimenta o `podeGerir` da linha (renomear é de global/responsável).
        disciplina: { select: { id: true, nome: true, responsaveis: { select: { userId: true } } } },
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
    disciplinaNome: u.disciplina.nome,
    versao: u.versao,
    validado: u.pastaId ? null : u.validado,
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
