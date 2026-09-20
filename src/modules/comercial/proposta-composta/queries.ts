import "server-only";
import { prisma } from "@/lib/prisma";
import { lerPagamentoDoModelo, lerSecoesDoModelo, resolverSecoesDoModelo } from "./modelos";

/**
 * Leituras da biblioteca de cláusulas e dos modelos de proposta (ADR-0006, G3).
 *
 * Gate de quem chama: `comercial:modelos` (só gestão) para manter; a composição da proposta (G4)
 * lê a biblioteca com `comercial:gerir`, porque escolher cláusula não é editar a biblioteca.
 */

export type ClausulaDaLista = {
  id: string;
  slug: string;
  secao: string;
  titulo: string;
  texto: string;
  disciplinaId: string | null;
  disciplinaNome: string | null;
  uf: string | null;
  ordem: number;
  ativo: boolean;
  /** Em quantos modelos esta cláusula é a padrão — desativar uma cláusula usada tem consequência. */
  usadaEmModelos: number;
  /** Em quantas propostas o texto dela já foi copiado (rastreio, não vínculo vivo). */
  usadaEmPropostas: number;
};

export async function listarClausulas(): Promise<ClausulaDaLista[]> {
  const [clausulas, modelos] = await Promise.all([
    prisma.clausulaProposta.findMany({
      orderBy: [{ secao: "asc" }, { ordem: "asc" }, { titulo: "asc" }],
      include: {
        disciplina: { select: { nome: true } },
        _count: { select: { secoesDePropostas: true } },
      },
    }),
    prisma.modeloProposta.findMany({ select: { secoesJson: true } }),
  ]);

  // Quantas vezes cada slug aparece como padrão nos modelos — o JSON não tem FK, então a
  // contagem é feita aqui em vez de por `_count`.
  const usoPorSlug = new Map<string, number>();
  for (const m of modelos) {
    for (const s of lerSecoesDoModelo(m.secoesJson).secoes) {
      if (s.clausulaSlug) usoPorSlug.set(s.clausulaSlug, (usoPorSlug.get(s.clausulaSlug) ?? 0) + 1);
    }
  }

  return clausulas.map((c) => ({
    id: c.id,
    slug: c.slug,
    secao: c.secao,
    titulo: c.titulo,
    texto: c.texto,
    disciplinaId: c.disciplinaId,
    disciplinaNome: c.disciplina?.nome ?? null,
    uf: c.uf,
    ordem: c.ordem,
    ativo: c.ativo,
    usadaEmModelos: usoPorSlug.get(c.slug) ?? 0,
    usadaEmPropostas: c._count.secoesDePropostas,
  }));
}

export type ModeloDaLista = {
  id: string;
  slug: string;
  nome: string;
  familia: string | null;
  descricao: string | null;
  validadeDias: number;
  ativo: boolean;
  /** Seções na ordem, com o texto já resolvido pela biblioteca. */
  secoes: { secao: string; titulo: string; ordem: number; clausulaSlug?: string; temTexto: boolean }[];
  pagamento: { descricao: string; percentual: number; prazo?: string }[];
  /**
   * Slugs citados que não resolvem. A tela MOSTRA — slug quebrado faz a seção nascer vazia, e
   * uma cláusula de proteção sumindo em silêncio é o defeito que este campo existe para evitar.
   */
  problemas: { secao: string; clausulaSlug: string; motivo: "inexistente" | "inativa" }[];
  usadoEmPropostas: number;
};

export async function listarModelosProposta(): Promise<ModeloDaLista[]> {
  const [modelos, clausulas] = await Promise.all([
    prisma.modeloProposta.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: { _count: { select: { propostas: true } } },
    }),
    prisma.clausulaProposta.findMany({ select: { slug: true, texto: true, titulo: true, ativo: true } }),
  ]);

  return modelos.map((m) => {
    const r = resolverSecoesDoModelo(m.secoesJson, clausulas);
    return {
      id: m.id,
      slug: m.slug,
      nome: m.nome,
      familia: m.familia,
      descricao: m.descricao,
      validadeDias: m.validadeDias,
      ativo: m.ativo,
      secoes: r.secoes.map((s) => ({
        secao: s.secao,
        titulo: s.titulo,
        ordem: s.ordem,
        clausulaSlug: s.clausulaSlug,
        temTexto: s.texto.length > 0,
      })),
      pagamento: lerPagamentoDoModelo(m.pagamentoJson),
      problemas: r.problemas,
      usadoEmPropostas: m._count.propostas,
    };
  });
}

/** Modelos ativos, para quem monta escolher. */
export async function modelosAtivos(): Promise<{ id: string; nome: string; familia: string | null; descricao: string | null; validadeDias: number }[]> {
  return prisma.modeloProposta.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, familia: true, descricao: true, validadeDias: true },
  });
}

export type PropostaCompostaEditor = {
  id: string;
  numero: string;
  titulo: string;
  status: string;
  clienteNome: string;
  negociacaoId: string | null;
  modeloNome: string | null;
  obraEndereco: string;
  obraCidade: string;
  obraUF: string;
  areaM2: number | null;
  validade: string;
  observacoes: string;
  itens: { disciplina: string; valor: number }[];
  secoes: { secao: string; titulo: string; texto: string; disciplinaId: string | null; clausulaId: string | null }[];
  parcelas: { descricao: string; percentual: number; prazo: string }[];
  desconto: number | null;
  versao: number | null;
};

/** Estado atual da composta para o editor. `null` quando não existe ou não é composta. */
export async function propostaCompostaParaEditor(id: string): Promise<PropostaCompostaEditor | null> {
  const p = await prisma.proposta.findUnique({
    where: { id },
    include: {
      cliente: { select: { nome: true } },
      modelo: { select: { nome: true } },
      itens: { orderBy: { ordem: "asc" }, include: { disciplina: { select: { nome: true } } } },
      secoes: { orderBy: { ordem: "asc" } },
      parcelas: { orderBy: { ordem: "asc" } },
      versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true, desconto: true } },
    },
  });
  if (!p || p.formato !== "composta") return null;
  return {
    id: p.id,
    numero: p.numero,
    titulo: p.titulo,
    status: p.status,
    clienteNome: p.cliente.nome,
    negociacaoId: p.negociacaoId,
    modeloNome: p.modelo?.nome ?? null,
    obraEndereco: p.obraEndereco ?? "",
    obraCidade: p.obraCidade ?? "",
    obraUF: p.obraUF ?? "",
    areaM2: p.areaM2 != null ? Number(p.areaM2) : null,
    // `toISOString().slice(0,10)` e não data local: a coluna é `@db.Date` e volta meia-noite UTC
    // (lib/data.ts) — converter para o fuso local mudaria o dia.
    validade: p.validade ? p.validade.toISOString().slice(0, 10) : "",
    observacoes: p.observacoes ?? "",
    itens: p.itens.map((i) => ({
      disciplina: i.disciplina?.nome ?? i.disciplinaTextoLegado,
      valor: Number(i.valor),
    })),
    secoes: p.secoes.map((s) => ({
      secao: s.secao,
      titulo: s.titulo ?? "",
      texto: s.texto,
      disciplinaId: s.disciplinaId,
      clausulaId: s.clausulaId,
    })),
    parcelas: p.parcelas.map((x) => ({
      descricao: x.descricao,
      percentual: Number(x.percentual),
      prazo: x.prazo ?? "",
    })),
    desconto: p.versoes[0]?.desconto != null ? Number(p.versoes[0].desconto) : null,
    versao: p.versoes[0]?.numero ?? null,
  };
}
