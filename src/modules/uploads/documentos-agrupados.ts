import "server-only";
import { prisma } from "@/lib/prisma";
import { arquivosDaRevisaoAtual, chavePrancha, revisaoAtualDosUploads } from "@/modules/uploads/documentos-agrupados-utils";
import { parsePranchaFilename } from "@/modules/projetos/pranchas/codigo";
import { carregarExtensoesNomenclatura } from "@/modules/uploads/nomenclatura/queries";
import {
  EXT_OUTROS,
  FASE_SEM,
  montarArvoreNavegacao,
  type ArvoreDaDisciplina,
  type DocumentoParaArvore,
} from "@/modules/uploads/arvore-navegacao";
import type { Pacote } from "@/modules/uploads/estrutura";
import { catalogosPrancha, mapaCanonico, canonizar } from "@/modules/projetos/pranchas/queries";

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
  /** Extensão (`pdf`), ou `EXT_OUTROS` para o que está fora do catálogo de extensões. */
  ext?: string;
  autor?: string;
  periodo?: string;
  validado?: string;
  /** `PranchaCatalogo.id` (categoria `fase`), ou `FASE_SEM` para documento sem fase. */
  fase?: string;
  status?: string;
  listaId?: string | null;
  /** `PranchaCatalogo.id` (categoria `tipo`). */
  tipo?: string;
  /** `PranchaCatalogo.id` (categoria `folha`). */
  papel?: string;
  /** `ExtensaoArquivo.categoria`. */
  catExt?: string;
  /**
   * `"A"` | `"OUTROS"` | `"RECEBIDOS"` (pacote literal) OU `"backup"` — o selo/filtro "Backup"
   * é semântico, não o pacote B cru: cobre pacote B E qualquer extensão com `ehBackup` (o
   * .qibzip/.zip/.rar de backup do AltoQi que caiu em OUTROS também tem de aparecer aqui,
   * senão a queixa original ("backup não aparece em lugar nenhum") volta pela metade).
   */
  pacote?: string;
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
  /** Título manual do documento (o que o painel de detalhe edita). */
  titulo: string | null;
  /** "Conteúdo" da prancha correspondente na Lista Mestre — fallback de exibição do título. */
  tituloPrancha: string | null;
  /**
   * Número da prancha: preferindo o campo gravado pelo motor (F3/backfill), caindo para a
   * leitura embutida do nome (`parsePranchaFilename`) quando o documento ainda não passou por
   * nenhum dos dois — nunca pior que a versão anterior desta coluna.
   */
  numeroPrancha: number | null;
  /** Mesma precedência de `numeroPrancha`: gravado > lido do nome > ausente. */
  tipoSigla: string | null;
  tipoNome: string | null;
  /** Só o campo gravado — não há como inferir tamanho de papel do NOME do arquivo. */
  papelSigla: string | null;
  papelNome: string | null;
  /** Pacote do documento (A/B/OUTROS/RECEBIDOS), ou `null` quando vive numa PastaProjeto. */
  pacote: Pacote | "RECEBIDOS" | null;
  /** Pacote B OU alguma extensão do documento marcada `ehBackup` no catálogo (item 1 da F4). */
  ehBackup: boolean;
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
  // "backup" é semântico (pacote B OU extensão com `ehBackup`), não um valor de pacote —
  // os dois nunca se combinam, então um param basta para cada caminho.
  const pacoteLiteral = filtros.pacote && filtros.pacote !== "backup" ? filtros.pacote : null;
  const querBackup = filtros.pacote === "backup" ? true : null;

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
      -- Extensão: a pasta "Outros" da árvore é "tem algum arquivo cuja extensão não está no
      -- catálogo" (inclui arquivo sem extensão) — o mesmo critério que a árvore usa para montar
      -- o nó, senão clicar na pasta traria uma lista diferente da que a contagem prometeu.
      and ($6::text is null
           or ($6 = '__outros__' and exists (
                 select 1 from upload ux
                 where ux."documentoId" = d.id and ux."excluidoEm" is null
                   and not exists (
                     select 1 from extensao_arquivo eax
                     where eax.extensao = lower(substring(ux."nomeArquivo" from '\\.([^.]+)$')))))
           or ($6 <> '__outros__' and lower(u."nomeArquivo") like '%.' || lower($6)))
      and ($7::text is null or au.name = $7)
      and ($8::timestamptz is null or u."createdAt" >= $8)
      and ($9::text is null or d."statusId" = $9)
      and ($10::text is null
           or ($10 = '__sem__' and d."faseId" is null)
           or ($10 <> '__sem__' and d."faseId" = $10))
      and ($11::boolean is null or (u.validado = true and u."pastaId" is null))
      and ($12::boolean is null or (u.validado = false and u."pastaId" is null))
      and ($13::text is null or exists (
            select 1
            from lista_documento_item ldi
            join lista_documentos ld on ld.id = ldi."listaId"
            where ldi."documentoId" = d.id
              and ldi."listaId" = $13
              and ld."projetoId" = $1))
      and ($14::text is null or d."tipoId" = $14)
      and ($15::text is null or d."tamanhoPapelId" = $15)
      and ($16::text is null or exists (
            select 1 from extensao_arquivo ea
            join upload u2 on u2."documentoId" = d.id and u2."excluidoEm" is null
            where ea.extensao = lower(substring(u2."nomeArquivo" from '\\.([^.]+)$'))
              and ea.categoria = $16))
      -- "Backup" ($18) é pacote B OU extensão marcada ehBackup, cobrindo o .qibzip/.zip/.rar
      -- do AltoQi que caiu em OUTROS -- o pacote literal ($17) é um valor cru (A/OUTROS/RECEBIDOS).
      and (
            ($17::text is null and $18::boolean is not true)
            or ($17::text is not null and exists (
                  select 1 from upload u3
                  where u3."documentoId" = d.id and u3."excluidoEm" is null and u3.pacote::text = $17))
            or ($18::boolean is true and exists (
                  select 1 from upload u4
                  left join extensao_arquivo ea2 on ea2.extensao = lower(substring(u4."nomeArquivo" from '\\.([^.]+)$'))
                  where u4."documentoId" = d.id and u4."excluidoEm" is null
                    and (u4.pacote::text = 'B' or coalesce(ea2."ehBackup", false))))
          )
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
    filtros.listaId ?? null,
    filtros.tipo ?? null,
    filtros.papel ?? null,
    filtros.catExt ?? null,
    pacoteLiteral,
    querBackup,
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
      tipo: { select: { id: true, sigla: true, nome: true } },
      numeroPrancha: true,
      tamanhoPapel: { select: { id: true, sigla: true, nome: true } },
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
          pacote: true,
          revisaoId: true,
          revisao: { select: { numero: true } },
          createdAt: true,
          autor: { select: { name: true } },
        },
      },
    },
  });
  // `ehBackup` por extensão (catálogo do motor de nomenclatura) — carregado uma vez para a
  // página inteira, não por documento; é um mapa pequeno (~40 linhas) reaproveitável em toda a
  // listagem.
  const extensoesBackup = new Set(
    (await carregarExtensoesNomenclatura()).filter((e) => e.ehBackup).map((e) => e.extensao),
  );

  // Título de fallback vem da Lista Mestre: uma consulta só para as disciplinas da página,
  // casada em memória pela trinca numeração+tipo+fase do nome.
  const pranchas = await prisma.prancha.findMany({
    where: { disciplinaId: { in: [...new Set(docs.map((d) => d.disciplina.id))] }, conteudo: { not: null } },
    select: { disciplinaId: true, numeracao: true, tipo: true, fase: true, conteudo: true },
  });
  // A `Prancha.tipo`/`.fase` pode ter sido gravada pelo import ANTIGO (sigla crua do nome, ex.:
  // `DTC`) ou pelo NOVO (`proporPranchasImport`, que grava a sigla canônica do catálogo, ex.:
  // `DET`) — e o documento pode ter sido classificado pelo motor com a canônica também. Os DOIS
  // lados da chave (a gravada aqui E a lida abaixo) passam por `canonizar()`, senão um
  // documento perde o título dependendo só de quando a Prancha foi cadastrada (mesmo bug que
  // `proporPranchasImport` corrigiu do lado da escrita — ver comentário lá).
  const { tipo: catalogoTipo, fase: catalogoFase } = await catalogosPrancha(projetoId);
  const tipoCanonico = mapaCanonico(catalogoTipo);
  const faseCanonica = mapaCanonico(catalogoFase);
  const conteudoPorChave = new Map(
    pranchas
      .filter((p) => p.conteudo?.trim())
      .map((p) => [
        chavePrancha(p.disciplinaId, { numeracao: p.numeracao, tipo: canonizar(p.tipo, tipoCanonico), fase: canonizar(p.fase, faseCanonica) }),
        p.conteudo!.trim(),
      ]),
  );

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
    const parseado = parsePranchaFilename(d.nomeArquivo);
    // "Backup" cobre pacote B e qualquer extensão marcada `ehBackup` no catálogo — o
    // .qibzip/.zip/.rar do AltoQi que caiu em OUTROS também tem de ganhar o selo.
    const pacoteDoc = (d.uploads.find((u) => u.pacote)?.pacote as Pacote | "RECEBIDOS" | undefined) ?? null;
    const ehBackup =
      pacoteDoc === "B" || d.uploads.some((u) => extensaoDe(u.nomeArquivo) && extensoesBackup.has(extensaoDe(u.nomeArquivo)));
    // Numeração/tipo/fase para achar o título na Lista Mestre: prefere o que o motor já
    // gravou no documento; cai para a leitura do nome, canonizada pelo MESMO catálogo que
    // `proporPranchasImport` usou para gravar a Prancha (senão a comparação diverge de novo).
    const numeracaoTitulo = d.numeroPrancha ?? parseado?.numeracao ?? null;
    const tipoTitulo = d.tipo?.sigla ?? (parseado ? canonizar(parseado.tipo, tipoCanonico) : null);
    const faseTitulo = d.fase?.sigla ?? (parseado ? canonizar(parseado.fase, faseCanonica) : null);
    const tituloPrancha =
      numeracaoTitulo !== null && tipoTitulo && faseTitulo
        ? conteudoPorChave.get(chavePrancha(d.disciplina.id, { numeracao: numeracaoTitulo, tipo: tipoTitulo, fase: faseTitulo })) ?? null
        : null;
    linhas.push({
      id: d.id,
      nome: d.nomeArquivo,
      titulo: d.titulo,
      tituloPrancha,
      numeroPrancha: d.numeroPrancha ?? parseado?.numeracao ?? null,
      tipoSigla: d.tipo?.sigla ?? parseado?.tipo ?? null,
      tipoNome: d.tipo?.nome ?? null,
      papelSigla: d.tamanhoPapel?.sigla ?? null,
      papelNome: d.tamanhoPapel?.nome ?? null,
      pacote: pacoteDoc,
      ehBackup,
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

/**
 * Documentos por fase, para o seletor apagar a fase vazia. Recorte = escopo da tela (projeto,
 * muralha por disciplina, disciplina aberta), com os mesmos critérios de "documento vivo" da
 * listagem; os demais filtros (busca, extensão...) ficam de fora de propósito — a contagem diz
 * se a fase tem acervo, não se sobrevive à busca digitada.
 */
export async function contagemDocumentosPorFase(opts: {
  projetoId: string;
  userId: string;
  veTodas: boolean;
  disciplinaId?: string | null;
}): Promise<Record<string, number>> {
  const rows = await prisma.$queryRawUnsafe<{ faseId: string; n: bigint }[]>(
    `select d."faseId" as "faseId", count(distinct d.id)::bigint as n
     from documento_disciplina d
     join disciplina disc on disc.id = d."disciplinaId"
     where d."substituidoPorId" is null
       and d."faseId" is not null
       and disc."projetoId" = $1
       and ($2::text is null or disc.id = $2)
       and ($3::boolean is true or exists (
             select 1 from disciplina_responsavel dr
             where dr."disciplinaId" = disc.id and dr."userId" = $4))
       and exists (
             select 1 from upload u
             where u."documentoId" = d.id and u."excluidoEm" is null)
     group by d."faseId"`,
    opts.projetoId,
    opts.disciplinaId ?? null,
    opts.veTodas,
    opts.userId,
  );
  return Object.fromEntries(rows.map((r) => [r.faseId, Number(r.n)]));
}

/** Catálogos usados pela edição e pelos filtros da superfície V2. */
export async function opcoesMetadadosDocumento(projetoId: string) {
  const [fases, tipos, papeis, status] = await Promise.all([
    prisma.pranchaCatalogo.findMany({
      where: {
        categoria: "fase",
        ativo: true,
        OR: [{ projetoId: null }, { projetoId }],
      },
      orderBy: [{ ordem: "asc" }, { sigla: "asc" }],
      select: { id: true, sigla: true, nome: true },
    }),
    // Tipo e papel do FILTRO incluem inativo (ao contrário do que o motor usa para classificar
    // um envio novo): um documento antigo pode apontar para um item que foi desativado depois,
    // e sem ele aqui o filtro simplesmente não acharia esse documento (mesmo raciocínio do
    // `documentoStatus` logo abaixo).
    prisma.pranchaCatalogo.findMany({
      where: { categoria: "tipo", OR: [{ projetoId: null }, { projetoId }] },
      orderBy: [{ ordem: "asc" }, { sigla: "asc" }],
      select: { id: true, sigla: true, nome: true, ativo: true },
    }),
    prisma.pranchaCatalogo.findMany({
      where: { categoria: "folha", OR: [{ projetoId: null }, { projetoId }] },
      orderBy: [{ ordem: "asc" }, { sigla: "asc" }],
      select: { id: true, sigla: true, nome: true, ativo: true },
    }),
    // Inclui itens inativos para que documentos históricos continuem identificáveis e
    // filtráveis; a ação de escrita aceita apenas status ativos.
    prisma.documentoStatus.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, final: true, ativo: true },
    }),
  ]);

  return { fases, tipos, papeis, status };
}

/**
 * Árvore do painel esquerdo: por disciplina, as fases que têm documento e, dentro delas, as
 * extensões. Mesmo recorte de "documento vivo" da listagem (documento não mesclado, com ao menos
 * um arquivo fora da lixeira) e a MESMA muralha por disciplina — quem não vê tudo só enxerga as
 * disciplinas de que é responsável, como na lista.
 *
 * Lê o documento com seus arquivos e monta a árvore em memória (`montarArvoreNavegacao`, pura e
 * testada): um projeto tem dezenas a poucos milhares de documentos, e a alternativa (um GROUP BY
 * por nível) duplicaria em SQL a regra de "Outros" que já existe em código.
 */
export async function arvoreNavegacaoDocumentos(opts: {
  projetoId: string;
  userId: string;
  veTodas: boolean;
}): Promise<ArvoreDaDisciplina[]> {
  const { projetoId, userId, veTodas } = opts;
  const [documentos, extensoes] = await Promise.all([
    prisma.documentoDisciplina.findMany({
      where: {
        substituidoPorId: null,
        disciplina: {
          projetoId,
          ...(veTodas ? {} : { responsaveis: { some: { userId } } }),
        },
        uploads: { some: { excluidoEm: null } },
      },
      select: {
        id: true,
        disciplinaId: true,
        fase: { select: { id: true, sigla: true, nome: true } },
        uploads: { where: { excluidoEm: null }, select: { nomeArquivo: true } },
      },
    }),
    carregarExtensoesNomenclatura(),
  ]);

  const paraArvore: DocumentoParaArvore[] = documentos.map((d) => ({
    id: d.id,
    disciplinaId: d.disciplinaId,
    faseId: d.fase?.id ?? null,
    faseSigla: d.fase?.sigla ?? null,
    faseNome: d.fase?.nome ?? null,
    extensoes: d.uploads.map((u) => extensaoDe(u.nomeArquivo)).filter(Boolean),
  }));
  return montarArvoreNavegacao(paraArvore, extensoes.map((e) => e.extensao));
}

export { EXT_OUTROS, FASE_SEM };
