import "server-only";
import { prisma } from "@/lib/prisma";

export type QuantitativoListItem = {
  id: string;
  descricao: string;
  grandeza: string;
  unidade: string;
  quantidade: number;
  origem: string;
  confianca: number | null;
  uploadId: string | null;
  memoria: string | null;
  itemId: string | null;
  itemDescricao: string | null;
  criadoPorNome: string;
  createdAt: Date;
  substituidoPorId: string | null;
};

/** Levantamentos do orçamento. Por padrão só mostra a versão CORRENTE de cada linhagem
 *  (exclui as que já foram recontadas) — histórico completo é `historicoQuantitativo`. */
export async function listarQuantitativos(
  orcamentoId: string,
  opts?: { itemId?: string | null; incluirSubstituidos?: boolean },
): Promise<QuantitativoListItem[]> {
  const rows = await prisma.custoQuantitativo.findMany({
    where: {
      orcamentoId,
      ...(opts?.itemId !== undefined ? { itemId: opts.itemId } : {}),
      ...(opts?.incluirSubstituidos ? {} : { substituidoPorId: null }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      descricao: true,
      grandeza: true,
      unidade: true,
      quantidade: true,
      origem: true,
      confianca: true,
      uploadId: true,
      memoria: true,
      itemId: true,
      createdAt: true,
      substituidoPorId: true,
      item: { select: { descricao: true } },
      criadoPor: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    grandeza: r.grandeza,
    unidade: r.unidade,
    quantidade: Number(r.quantidade),
    origem: r.origem,
    confianca: r.confianca === null ? null : Number(r.confianca),
    uploadId: r.uploadId,
    memoria: r.memoria,
    itemId: r.itemId,
    itemDescricao: r.item?.descricao ?? null,
    criadoPorNome: r.criadoPor.name,
    createdAt: r.createdAt,
    substituidoPorId: r.substituidoPorId,
  }));
}

/** Linhagem completa de recontagens de um levantamento (mais antigo → mais recente). Pode ser
 *  chamado com o id de QUALQUER elo da cadeia — sempre sobe até a raiz antes de listar. */
export async function historicoQuantitativo(quantitativoId: string): Promise<QuantitativoListItem[]> {
  // Sobe até a raiz da linhagem.
  let raizId = quantitativoId;
  for (;;) {
    const anterior = await prisma.custoQuantitativo.findFirst({
      where: { substituidoPorId: raizId },
      select: { id: true },
    });
    if (!anterior) break;
    raizId = anterior.id;
  }

  // Desce da raiz até a ponta, montando a cadeia em ordem cronológica.
  const cadeia: string[] = [raizId];
  let proximoId: string | null = raizId;
  for (;;) {
    const atual: { substituidoPorId: string | null } | null = await prisma.custoQuantitativo.findUnique({
      where: { id: proximoId! },
      select: { substituidoPorId: true },
    });
    if (!atual?.substituidoPorId) break;
    cadeia.push(atual.substituidoPorId);
    proximoId = atual.substituidoPorId;
  }

  const rows = await prisma.custoQuantitativo.findMany({
    where: { id: { in: cadeia } },
    select: {
      id: true,
      descricao: true,
      grandeza: true,
      unidade: true,
      quantidade: true,
      origem: true,
      confianca: true,
      uploadId: true,
      memoria: true,
      itemId: true,
      createdAt: true,
      substituidoPorId: true,
      item: { select: { descricao: true } },
      criadoPor: { select: { name: true } },
    },
  });
  const porId = new Map(rows.map((r) => [r.id, r]));
  return cadeia
    .map((id) => porId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      id: r.id,
      descricao: r.descricao,
      grandeza: r.grandeza,
      unidade: r.unidade,
      quantidade: Number(r.quantidade),
      origem: r.origem,
      confianca: r.confianca === null ? null : Number(r.confianca),
      uploadId: r.uploadId,
      memoria: r.memoria,
      itemId: r.itemId,
      itemDescricao: r.item?.descricao ?? null,
      criadoPorNome: r.criadoPor.name,
      createdAt: r.createdAt,
      substituidoPorId: r.substituidoPorId,
    }));
}

/** Guids vinculados a um item, agrupados por modelo (uploadId) — alimenta "Ver no modelo". */
export async function guidsPorItem(itemId: string): Promise<{ uploadId: string; guids: string[] }[]> {
  const vinculos = await prisma.custoVinculoBim.findMany({
    where: { itemId },
    select: { uploadId: true, ifcGuid: true },
  });
  const porModelo = new Map<string, string[]>();
  for (const v of vinculos) {
    const lista = porModelo.get(v.uploadId) ?? [];
    lista.push(v.ifcGuid);
    porModelo.set(v.uploadId, lista);
  }
  return [...porModelo.entries()].map(([uploadId, guids]) => ({ uploadId, guids }));
}

// ── Caderno de quantitativos (XLSX + PDF consomem ESTE mesmo resultado) ──

export type LinhaCaderno = {
  quantitativoId: string;
  descricao: string;
  grandeza: string;
  unidade: string;
  quantidade: number;
  origem: string;
  confianca: number | null;
  rastro: string;
  memoria: string | null;
  criadoPorNome: string;
  createdAt: Date;
};

export type GrupoCaderno = {
  itemId: string | null;
  itemCodigo: string | null;
  itemDescricao: string;
  itemQuantidade: number | null;
  itemUnidade: string | null;
  somaQuantitativos: number;
  /** null quando o grupo é de levantamentos "soltos" (sem item) — não há o que conferir. */
  divergencia: number | null;
  linhas: LinhaCaderno[];
};

export type DadosCaderno = {
  cabecalho: { titulo: string; obra: string; contratante: string; dataBase: Date };
  grupos: GrupoCaderno[];
};

function rastroDe(origem: string, pagina: number | null, guids: unknown): string {
  switch (origem) {
    case "ifc":
      return `IFC — ${Array.isArray(guids) ? guids.length : 0} elemento(s)`;
    case "dwg":
      return "DXF";
    case "pdf":
      return pagina ? `PDF — página ${pagina}` : "PDF";
    case "ia":
      return "IA";
    default:
      return "Manual";
  }
}

/** Dados prontos para o export (XLSX e PDF consomem ESTE mesmo resultado). Por item, todos os
 *  levantamentos CORRENTES (não recontados) com origem/rastro/memória/autor/data, e o total
 *  conferido contra a quantidade do item — aponta divergência (design §3.6). */
export async function dadosCaderno(orcamentoId: string): Promise<DadosCaderno | null> {
  const orc = await prisma.custoOrcamento.findUnique({
    where: { id: orcamentoId },
    include: { projeto: { select: { codigo: true, nome: true } }, contratante: { select: { nome: true } } },
  });
  if (!orc) return null;

  const rows = await prisma.custoQuantitativo.findMany({
    where: { orcamentoId, substituidoPorId: null },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      descricao: true,
      grandeza: true,
      unidade: true,
      quantidade: true,
      origem: true,
      confianca: true,
      pagina: true,
      guids: true,
      memoria: true,
      itemId: true,
      createdAt: true,
      item: { select: { codigo: true, descricao: true, quantidade: true, unidade: true } },
      criadoPor: { select: { name: true } },
    },
  });

  const porItem = new Map<string, typeof rows>();
  for (const r of rows) {
    const chave = r.itemId ?? "__solto__";
    const lista = porItem.get(chave) ?? [];
    lista.push(r);
    porItem.set(chave, lista);
  }

  const grupos: GrupoCaderno[] = [...porItem.entries()].map(([chave, linhasBrutas]) => {
    const item = linhasBrutas[0].item;
    const somaQuantitativos = linhasBrutas.reduce((acc, r) => acc + Number(r.quantidade), 0);
    return {
      itemId: chave === "__solto__" ? null : chave,
      itemCodigo: item?.codigo ?? null,
      itemDescricao: item?.descricao ?? "(levantamento solto — ainda não aplicado a um item)",
      itemQuantidade: item ? Number(item.quantidade) : null,
      itemUnidade: item?.unidade ?? null,
      somaQuantitativos,
      divergencia: item ? Number(item.quantidade) - somaQuantitativos : null,
      linhas: linhasBrutas.map((r) => ({
        quantitativoId: r.id,
        descricao: r.descricao,
        grandeza: r.grandeza,
        unidade: r.unidade,
        quantidade: Number(r.quantidade),
        origem: r.origem,
        confianca: r.confianca === null ? null : Number(r.confianca),
        rastro: rastroDe(r.origem, r.pagina, r.guids),
        memoria: r.memoria,
        criadoPorNome: r.criadoPor.name,
        createdAt: r.createdAt,
      })),
    };
  });

  // Itens que TIVERAM levantamento mas ficaram sem nenhum corrente — acontece quando o levantamento
  // que os originou foi recontado depois (recontagem nunca reaplica sozinha, §3.5). Item nunca
  // levantado (quantidade digitada à mão, sem IFC/DXF/PDF por trás) NÃO entra aqui — não é órfão,
  // é apenas manual, e listá-lo como divergência seria ruído no caderno inteiro.
  const itensComGrupo = new Set(grupos.map((g) => g.itemId).filter((id): id is string => id !== null));
  const itensComHistorico = await prisma.custoQuantitativo.findMany({
    where: { orcamentoId, itemId: { not: null } },
    distinct: ["itemId"],
    select: { itemId: true },
  });
  const idsOrfaos = itensComHistorico
    .map((r) => r.itemId!)
    .filter((id) => !itensComGrupo.has(id));
  const itensServico = idsOrfaos.length
    ? await prisma.custoOrcamentoItem.findMany({
        where: { id: { in: idsOrfaos }, orcamentoId, tipo: "servico" },
        select: { id: true, codigo: true, descricao: true, quantidade: true, unidade: true },
      })
    : [];
  for (const item of itensServico) {
    const quantidade = Number(item.quantidade);
    if (quantidade === 0) continue;
    grupos.push({
      itemId: item.id,
      itemCodigo: item.codigo,
      itemDescricao: item.descricao,
      itemQuantidade: quantidade,
      itemUnidade: item.unidade,
      somaQuantitativos: 0,
      divergencia: quantidade,
      linhas: [],
    });
  }

  grupos.sort((a, b) => (a.itemCodigo ?? "￿").localeCompare(b.itemCodigo ?? "￿"));

  return {
    cabecalho: {
      titulo: orc.titulo,
      obra: orc.projeto ? `${orc.projeto.codigo} — ${orc.projeto.nome}` : (orc.nomeAvulso ?? "—"),
      contratante: orc.contratante?.nome ?? orc.contratanteNome ?? "—",
      dataBase: orc.dataBase,
    },
    grupos,
  };
}

export type PdfProjeto = { uploadId: string; nomeArquivo: string; disciplinaNome: string };

/** PDFs (pranchas) do projeto, pra escolher qual medir com régua — só disciplina (não recebidos
 *  do cliente na v1; o repositório Documento pode entrar depois se surgir necessidade real). */
export async function pdfsDoProjeto(projetoId: string): Promise<PdfProjeto[]> {
  const uploads = await prisma.upload.findMany({
    where: { disciplina: { projetoId }, nomeArquivo: { endsWith: ".pdf", mode: "insensitive" } },
    orderBy: [{ versao: "desc" }, { createdAt: "desc" }],
    select: { id: true, nomeArquivo: true, disciplina: { select: { disciplinaTextoLegado: true } } },
  });
  const vistos = new Set<string>();
  const pdfs: PdfProjeto[] = [];
  for (const u of uploads) {
    const chave = `${u.disciplina.disciplinaTextoLegado}::${u.nomeArquivo.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pdfs.push({ uploadId: u.id, nomeArquivo: u.nomeArquivo, disciplinaNome: u.disciplina.disciplinaTextoLegado });
  }
  return pdfs.sort((a, b) => a.disciplinaNome.localeCompare(b.disciplinaNome, "pt-BR") || a.nomeArquivo.localeCompare(b.nomeArquivo, "pt-BR"));
}

/** Contagem de elementos vinculados por item — para o badge na aba Itens (C2). */
export async function contarVinculosPorItem(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const grupos = await prisma.custoVinculoBim.groupBy({
    by: ["itemId"],
    where: { itemId: { in: itemIds } },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.itemId, g._count._all]));
}
