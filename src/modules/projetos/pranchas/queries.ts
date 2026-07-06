import "server-only";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { codigoPrancha, parsePranchaFilename } from "./codigo";

/** Lista Mestre agrupada por disciplina, com o código composto de cada folha. */
export async function pranchasDoProjeto(projetoId: string) {
  const projeto = await prisma.projeto.findUnique({ where: { id: projetoId }, select: { codigo: true } });
  const projetoCodigo = projeto ? formatarCodigo(projeto.codigo) : "";

  const discs = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      pranchas: {
        orderBy: [{ ordem: "asc" }, { numeracao: "asc" }],
        select: { id: true, folha: true, tipo: true, fase: true, numeracao: true, revisao: true, conteudo: true },
      },
    },
  });

  // Sigla da disciplina vem do catálogo (por nome) — usada no código composto.
  const nomes = [...new Set(discs.map((d) => d.nome))];
  const cats = nomes.length
    ? await prisma.disciplinaCatalogo.findMany({ where: { nome: { in: nomes } }, select: { nome: true, codigo: true } })
    : [];
  const siglaDe = new Map(cats.map((c) => [c.nome, c.codigo]));

  return discs.map((d) => {
    const sigla = siglaDe.get(d.nome) ?? null;
    return {
      id: d.id,
      nome: d.nome,
      sigla,
      pranchas: d.pranchas.map((p) => ({
        ...p,
        codigo: codigoPrancha({
          projetoCodigo,
          siglaDisciplina: sigla,
          fase: p.fase,
          numeracao: p.numeracao,
          tipo: p.tipo,
          revisao: p.revisao,
        }),
      })),
    };
  });
}

export type PranchasDisciplina = Awaited<ReturnType<typeof pranchasDoProjeto>>[number];
export type PranchaItem = PranchasDisciplina["pranchas"][number];

/** Catálogos ativos (folha/tipo/fase): globais + específicos do projeto (se informado). */
export async function catalogosPrancha(projetoId?: string) {
  const rows = await prisma.pranchaCatalogo.findMany({
    where: {
      ativo: true,
      OR: [{ projetoId: null }, ...(projetoId ? [{ projetoId }] : [])],
    },
    orderBy: [{ ordem: "asc" }, { sigla: "asc" }],
    select: { id: true, categoria: true, sigla: true, nome: true, projetoId: true },
  });
  return {
    folha: rows.filter((r) => r.categoria === "folha"),
    tipo: rows.filter((r) => r.categoria === "tipo"),
    fase: rows.filter((r) => r.categoria === "fase"),
  };
}

export type CatalogosPrancha = Awaited<ReturnType<typeof catalogosPrancha>>;

/** Todos os catálogos (inclui inativos) — para a tela de configuração. */
export async function catalogosPranchaConfig(projetoId: string | null) {
  return prisma.pranchaCatalogo.findMany({
    where: { projetoId },
    orderBy: [{ categoria: "asc" }, { ordem: "asc" }, { sigla: "asc" }],
    select: { id: true, categoria: true, sigla: true, nome: true, ativo: true, ordem: true, projetoId: true },
  });
}

export type PranchaCatalogoRow = Awaited<ReturnType<typeof catalogosPranchaConfig>>[number];

/**
 * Proposta de import: lê os PDFs do pacote A da disciplina, parseia os nomes no padrão
 * da Lista Mestre e propõe as folhas ainda inexistentes (dedup por numeração-tipo-fase).
 */
export async function proporPranchasImport(disciplinaId: string) {
  const disc = await prisma.disciplina.findUnique({
    where: { id: disciplinaId },
    select: {
      pranchas: { select: { numeracao: true, tipo: true, fase: true } },
      uploads: {
        where: { pacote: "A" },
        select: { nomeArquivo: true, versao: true },
        orderBy: { versao: "asc" },
      },
    },
  });
  if (!disc) return null;

  const pdfs = disc.uploads.filter((u) => u.nomeArquivo.toLowerCase().endsWith(".pdf"));
  const vistos = new Set(disc.pranchas.map((p) => `${p.numeracao}-${p.tipo}-${p.fase}`));

  const propostos: {
    folha: string;
    tipo: string;
    fase: string;
    numeracao: number;
    revisao: number;
    conteudo: string;
    nomeArquivo: string;
  }[] = [];
  const jaExistentes: string[] = [];
  const semPadrao: string[] = [];

  for (const up of pdfs) {
    const parsed = parsePranchaFilename(up.nomeArquivo);
    if (!parsed) {
      semPadrao.push(up.nomeArquivo);
      continue;
    }
    const key = `${parsed.numeracao}-${parsed.tipo}-${parsed.fase}`;
    if (vistos.has(key)) {
      jaExistentes.push(up.nomeArquivo);
      continue;
    }
    vistos.add(key);
    propostos.push({
      folha: "A1",
      tipo: parsed.tipo,
      fase: parsed.fase,
      numeracao: parsed.numeracao,
      revisao: parsed.revisao ?? Math.max(0, up.versao - 1),
      conteudo: "",
      nomeArquivo: up.nomeArquivo,
    });
  }
  propostos.sort((a, b) => a.numeracao - b.numeracao);

  return { propostos, jaExistentes, semPadrao, totalPdfs: pdfs.length };
}

export type PropostaImport = NonNullable<Awaited<ReturnType<typeof proporPranchasImport>>>;
