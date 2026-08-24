import "server-only";
import { prisma } from "@/lib/prisma";
import { arquivosDaRevisaoAtual, revisaoAtualDosUploads } from "@/modules/uploads/documentos-agrupados-utils";

/**
 * Listagem de documentos AGRUPADA POR DOCUMENTO (Fase 2 — F2-PR6a).
 *
 * A listagem da Fase 1 devolvia uma linha por ARQUIVO. Depois do merge por nome-base, PDF e
 * DWG da mesma prancha são o mesmo documento — mostrá-los em duas linhas desmente o que o
 * banco já sabe. Aqui a unidade da tabela passa a ser o documento, e as extensões viram
 * badges dentro da linha.
 *
 * Por que SQL cru para escolher a página: três das cinco colunas ordenáveis viraram
 * agregados do documento — revisão é `max(numero)`, "atualizado" é `max(createdAt)` e
 * tamanho é `sum(tamanho)`. O Prisma não ordena por agregado de relação, e ordenar em
 * memória traria o acervo inteiro para o servidor, desfazendo a paginação conquistada em
 * F1-PR10. Então o SQL responde só "quais ids, nesta ordem" e o Prisma hidrata o resto com
 * tipagem de verdade.
 *
 * Nomes de coluna que NÃO são óbvios pelo schema e já custaram erro em runtime:
 *   - `Disciplina.disciplinaTextoLegado` é `@map("nome")` — no SQL a coluna é `disc.nome`.
 *   - a FK de `Disciplina` para o catálogo é `disciplinaId`, não `catalogoId`.
 */

export const CAMPOS_ORDENACAO_DOC = ["nome", "disciplina", "revisao", "data", "tamanho"] as const;
export type CampoOrdenacaoDoc = (typeof CAMPOS_ORDENACAO_DOC)[number];

/** Aceita só o que está na whitelist — o valor vem da URL. */
export function campoOrdenacaoDocValido(v: string | null | undefined): CampoOrdenacaoDoc | null {
  return (CAMPOS_ORDENACAO_DOC as readonly string[]).includes(v ?? "") ? (v as CampoOrdenacaoDoc) : null;
}

/**
 * Expressão SQL de cada campo ordenável. É a ÚNICA parte interpolada na consulta; todo valor
 * vindo do usuário viaja como parâmetro numerado.
 */
const COLUNA_ORDENACAO: Record<CampoOrdenacaoDoc, string> = {
  nome: `lower(coalesce(d.titulo, d."nomeArquivo"))`,
  // `min(...)`: o GROUP BY é por `d.id`, e o Postgres só dispensa agregação para colunas da
  // própria `d` (dependência funcional da PK). Coluna de tabela juntada precisa ser agregada —
  // e como o join é para-um, `min` devolve exatamente o valor da linha.
  disciplina: `min(lower(coalesce(cat.nome, disc.nome, '')))`,
  revisao: `max(r.numero)`,
  data: `max(u."createdAt")`,
  tamanho: `sum(u.tamanho)`,
};

const DIAS_VALIDOS = new Set(["7", "30", "90"]);

export type FiltrosDoc = {
  disciplinaId?: string | null;
  q?: string;
  ext?: string;
  autor?: string;
  periodo?: string;
  validado?: string;
  fase?: string;
  status?: string;
};

export type ArquivoDaLinha = {
  id: string;
  nome: string;
  ext: string;
  downloadUrl: string;
  /** `null` para arquivo em PastaProjeto, que não passa por validação. */
  validado: boolean | null;
};

export type LinhaDoc = {
  id: string;
  nome: string;
  titulo: string | null;
  descricao: string | null;
  disciplinaId: string;
  disciplinaNome: string;
  revisaoAtual: number | null;
  statusId: string | null;
  statusNome: string | null;
  statusFinal: boolean;
  faseId: string | null;
  faseSigla: string | null;
  faseNome: string | null;
  atualizadoEm: string;
  tamanhoTotal: number;
  autor: string;
  podeGerir: boolean;
  podeEditarMetadados: boolean;
  podeAlterarStatus: boolean;
  /** Arquivos da revisão ATUAL — é o que vira badge clicável na linha. */
  arquivos: ArquivoDaLinha[];
  totalRevisoes: number;
};

/** Extensão em minúsculas, sem ponto. */
function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export async function listarDocumentosAgrupados(opts: {
  projetoId: string;
  userId: string;
  veTodas: boolean;
  ehGlobal: boolean;
  podeEnviarCap: boolean;
  podeEditarMetadados: boolean;
  podeAlterarStatus: boolean;
  filtros: FiltrosDoc;
  skip: number;
  take: number;
  sort: CampoOrdenacaoDoc | null;
  dir: "asc" | "desc";
}) {
  const { projetoId, userId, veTodas, filtros, skip, take, sort, dir } = opts;
  const termo = filtros.q?.trim() || null;
  const dias = DIAS_VALIDOS.has(filtros.periodo ?? "") ? Number(filtros.periodo) : null;
  const desde = dias ? new Date(Date.now() - dias * 86_400_000) : null;
  const ordem = COLUNA_ORDENACAO[sort ?? "data"];
  const direcao = dir === "asc" ? "asc" : "desc";
  const validadoSim = filtros.validado === "sim" ? true : null;
  const validadoNao = filtros.validado === "nao" ? true : null;

  // `join upload` com `excluidoEm is null` faz o documento cujos arquivos foram todos para a
  // lixeira sumir da lista — mesmo efeito do filtro global de soft delete na versão anterior.
  const base = `
    from documento_disciplina d
    join disciplina disc on disc.id = d."disciplinaId"
    left join disciplina_catalogo cat on cat.id = disc."disciplinaId"
    join upload u on u."documentoId" = d.id and u."excluidoEm" is null
    left join documento_revisao r on r.id = u."revisaoId"
    left join "user" au on au.id = u."autorId"
    where d."substituidoPorId" is null
      and disc."projetoId" = $1
      and ($2::text is null or disc.id = $2)
      and ($3::boolean is true or exists (
            select 1 from disciplina_responsavel dr
            where dr."disciplinaId" = disc.id and dr."userId" = $4))
      and ($5::text is null or (
            d."nomeArquivo" ilike '%' || $5 || '%'
            or coalesce(d.titulo, '') ilike '%' || $5 || '%'
            or coalesce(cat.nome, disc.nome, '') ilike '%' || $5 || '%'
            or coalesce(au.name, '') ilike '%' || $5 || '%'))
      and ($6::text is null or lower(u."nomeArquivo") like '%.' || lower($6))
      and ($7::text is null or au.name = $7)
      and ($8::timestamptz is null or u."createdAt" >= $8)
      and ($9::text is null or d."statusId" = $9)
      and ($10::text is null or d."faseId" = $10)
      and ($11::boolean is null or (u.validado = true and u."pastaId" is null))
      and ($12::boolean is null or (u.validado = false and u."pastaId" is null))
    group by d.id
  `;
  const params = [
    projetoId,
    filtros.disciplinaId ?? null,
    veTodas,
    userId,
    termo,
    filtros.ext ?? null,
    filtros.autor ?? null,
    desde,
    filtros.status ?? null,
    filtros.fase ?? null,
    validadoSim,
    validadoNao,
  ];

  const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from (select d.id ${base}) x`,
    ...params,
  );
  const total = Number(totalRows[0]?.n ?? 0);

  const ultimaPagina = Math.max(1, Math.ceil(total / Math.max(1, take)));
  const paginaPedida = Math.floor(skip / Math.max(1, take)) + 1;
  const pagina = Math.min(paginaPedida, ultimaPagina);
  const skipEfetivo = (pagina - 1) * take;

  // `d.id asc` como desempate: sem ele, dois documentos com o mesmo valor de ordenação podem
  // trocar de posição entre páginas — e aí um aparece duas vezes e outro nenhuma.
  const idsRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `select d.id, ${ordem} as ord ${base} order by ord ${direcao} nulls last, d.id asc limit ${Number(take)} offset ${Number(skipEfetivo)}`,
    ...params,
  );
  const ids = idsRows.map((r) => r.id);
  if (ids.length === 0) return { total, pagina, linhas: [] as LinhaDoc[] };

  const docs = await prisma.documentoDisciplina.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      nomeArquivo: true,
      titulo: true,
      descricao: true,
      status: { select: { id: true, nome: true, final: true } },
      fase: { select: { id: true, sigla: true, nome: true } },
      disciplina: {
        select: {
          id: true,
          disciplinaTextoLegado: true,
          catalogo: { select: { nome: true } },
          responsaveis: { select: { userId: true } },
        },
      },
      revisoes: { select: { id: true, numero: true } },
      uploads: {
        where: { excluidoEm: null },
        select: {
          id: true,
          nomeArquivo: true,
          tamanho: true,
          validado: true,
          pastaId: true,
          revisaoId: true,
          revisao: { select: { numero: true } },
          createdAt: true,
          autor: { select: { name: true } },
        },
      },
    },
  });

  // Reordena pelo que o SQL decidiu — `findMany` com `in` não preserva a ordem dos ids.
  const porId = new Map(docs.map((d) => [d.id, d]));
  const linhas: LinhaDoc[] = [];
  for (const id of ids) {
    const d = porId.get(id);
    if (!d) continue;
    // A revisão vigente é a maior que ainda tem ao menos um upload FORA da lixeira. Usar
    // `d.revisoes` aqui escolheria uma R02 inteiramente excluída e deixaria a linha da R01
    // ativa sem badges acionáveis (A-04 da auditoria de 2026-08-23).
    const revisaoAtual = revisaoAtualDosUploads(d.uploads);
    // Upload legado sem revisão continua visível: escondê-lo só porque outro arquivo do
    // documento já foi migrado seria uma perda de acesso na tela.
    const daAtual = arquivosDaRevisaoAtual(d.uploads);
    const maisRecente = [...d.uploads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    linhas.push({
      id: d.id,
      nome: d.nomeArquivo,
      titulo: d.titulo,
      descricao: d.descricao,
      disciplinaId: d.disciplina.id,
      disciplinaNome: d.disciplina.catalogo?.nome ?? d.disciplina.disciplinaTextoLegado ?? "—",
      revisaoAtual,
      statusId: d.status?.id ?? null,
      statusNome: d.status?.nome ?? null,
      statusFinal: d.status?.final ?? false,
      faseId: d.fase?.id ?? null,
      faseSigla: d.fase?.sigla ?? null,
      faseNome: d.fase?.nome ?? null,
      atualizadoEm: (maisRecente?.createdAt ?? new Date()).toISOString(),
      tamanhoTotal: d.uploads.reduce((s, u) => s + u.tamanho, 0),
      autor: maisRecente?.autor?.name ?? "—",
      podeGerir:
        opts.podeEnviarCap &&
        (opts.ehGlobal || d.disciplina.responsaveis.some((r) => r.userId === userId)),
      podeEditarMetadados:
        opts.podeEditarMetadados &&
        (veTodas || d.disciplina.responsaveis.some((r) => r.userId === userId)),
      podeAlterarStatus:
        opts.podeAlterarStatus &&
        (veTodas || d.disciplina.responsaveis.some((r) => r.userId === userId)),
      arquivos: daAtual.map((u) => ({
        id: u.id,
        nome: u.nomeArquivo,
        ext: extensaoDe(u.nomeArquivo),
        downloadUrl: `/api/uploads/${u.id}/download`,
        validado: u.pastaId ? null : u.validado,
      })),
      totalRevisoes: d.revisoes.length,
    });
  }
  return { total, pagina, linhas };
}

/** Catálogos usados pela edição e pelos filtros da superfície V2. */
export async function opcoesMetadadosDocumento(projetoId: string) {
  const [fases, status] = await Promise.all([
    prisma.pranchaCatalogo.findMany({
      where: {
        categoria: "fase",
        ativo: true,
        OR: [{ projetoId: null }, { projetoId }],
      },
      orderBy: [{ ordem: "asc" }, { sigla: "asc" }],
      select: { id: true, sigla: true, nome: true },
    }),
    // Inclui itens inativos para que documentos históricos continuem identificáveis e
    // filtráveis; a ação de escrita aceita apenas status ativos.
    prisma.documentoStatus.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, final: true, ativo: true },
    }),
  ]);

  return { fases, status };
}
