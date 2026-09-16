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
      disciplinaTextoLegado: true,
      pranchas: {
        orderBy: [{ ordem: "asc" }, { numeracao: "asc" }],
        select: { id: true, folha: true, tipo: true, fase: true, numeracao: true, revisao: true, conteudo: true },
      },
    },
  });

  // Sigla e número-base da disciplina vêm do catálogo (por nome) — usados na nomenclatura.
  const nomes = [...new Set(discs.map((d) => d.disciplinaTextoLegado))];
  const cats = nomes.length
    ? await prisma.disciplinaCatalogo.findMany({
        where: { nome: { in: nomes } },
        select: { nome: true, codigo: true, numeracao: true },
      })
    : [];
  const siglaDe = new Map(cats.map((c) => [c.nome, c.codigo]));
  const baseDe = new Map(cats.map((c) => [c.nome, c.numeracao]));

  return discs.map((d) => {
    const sigla = siglaDe.get(d.disciplinaTextoLegado) ?? null;
    return {
      id: d.id,
      nome: d.disciplinaTextoLegado,
      sigla,
      numeracaoBase: baseDe.get(d.disciplinaTextoLegado) ?? null,
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
    select: { id: true, categoria: true, sigla: true, nome: true, projetoId: true, sinonimos: true },
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
    select: { id: true, categoria: true, sigla: true, nome: true, ativo: true, ordem: true, projetoId: true, sinonimos: true },
  });
}

export type PranchaCatalogoRow = Awaited<ReturnType<typeof catalogosPranchaConfig>>[number];

/**
 * Sigla → sigla canônica do catálogo (mesma sigla, ou a de um sinônimo dela). Sigla sem
 * catálogo correspondente volta em maiúsculo, sem quebrar — só não normaliza.
 */
export function mapaCanonico(rows: { sigla: string; sinonimos: string[] }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const sigla = r.sigla.toUpperCase();
    m.set(sigla, sigla);
    for (const sinonimo of r.sinonimos) m.set(sinonimo.toUpperCase(), sigla);
  }
  return m;
}

export function canonizar(sigla: string, mapa: Map<string, string>): string {
  return mapa.get(sigla.toUpperCase()) ?? sigla.toUpperCase();
}

/**
 * Proposta de import: lê os PDFs do pacote A da disciplina e propõe as folhas ainda
 * inexistentes (dedup por numeração-tipo-fase). Tipo, número e papel vêm do que o motor de
 * nomenclatura já gravou no documento (F3/F4) quando houver; sem isso, cai na leitura embutida
 * do nome (`parsePranchaFilename`) — nunca pior que antes da F4 (spec §4, F4).
 *
 * Tipo e fase (dos dois lados — Prancha já cadastrada E leitura nova) passam por
 * `canonizar()`: uma Prancha antiga pode ter sido gravada com a sigla CRUA do nome
 * (`DTC`, `MED`) antes do catálogo ter sinônimo, e o documento gravado pelo motor já usa a
 * sigla canônica (`DET`, `MEM`). Sem normalizar os dois lados da chave de dedup, o import
 * proporia de novo uma folha que já existe, só com grafia diferente.
 */
export async function proporPranchasImport(disciplinaId: string) {
  const disc = await prisma.disciplina.findUnique({
    where: { id: disciplinaId },
    select: {
      projetoId: true,
      pranchas: { select: { numeracao: true, tipo: true, fase: true } },
      uploads: {
        // Lixeira: leitura aninhada não passa pelo filtro global (lib/prisma.ts) → explícito.
        where: { pacote: "A", excluidoEm: null },
        select: {
          nomeArquivo: true,
          versao: true,
          documento: {
            select: {
              numeroPrancha: true,
              tipo: { select: { sigla: true } },
              fase: { select: { sigla: true } },
              tamanhoPapel: { select: { sigla: true } },
            },
          },
        },
        orderBy: { versao: "asc" },
      },
    },
  });
  if (!disc) return null;

  const { tipo: catalogoTipo, fase: catalogoFase } = await catalogosPrancha(disc.projetoId);
  const tipoCanonico = mapaCanonico(catalogoTipo);
  const faseCanonica = mapaCanonico(catalogoFase);

  const pdfs = disc.uploads.filter((u) => u.nomeArquivo.toLowerCase().endsWith(".pdf"));
  const vistos = new Set(
    disc.pranchas.map((p) => `${p.numeracao}-${canonizar(p.tipo, tipoCanonico)}-${canonizar(p.fase, faseCanonica)}`),
  );

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
    if (!parsed && !up.documento) {
      semPadrao.push(up.nomeArquivo);
      continue;
    }
    const numeracao = up.documento?.numeroPrancha ?? parsed?.numeracao;
    const tipoLido = up.documento?.tipo?.sigla ?? parsed?.tipo;
    const faseLida = up.documento?.fase?.sigla ?? parsed?.fase;
    if (numeracao === undefined || !tipoLido || !faseLida) {
      semPadrao.push(up.nomeArquivo);
      continue;
    }
    const tipo = canonizar(tipoLido, tipoCanonico);
    const fase = canonizar(faseLida, faseCanonica);
    const key = `${numeracao}-${tipo}-${fase}`;
    if (vistos.has(key)) {
      jaExistentes.push(up.nomeArquivo);
      continue;
    }
    vistos.add(key);
    propostos.push({
      folha: up.documento?.tamanhoPapel?.sigla ?? "A1",
      tipo,
      fase,
      numeracao,
      revisao: parsed?.revisao ?? Math.max(0, up.versao - 1),
      conteudo: "",
      nomeArquivo: up.nomeArquivo,
    });
  }
  propostos.sort((a, b) => a.numeracao - b.numeracao);

  return { propostos, jaExistentes, semPadrao, totalPdfs: pdfs.length };
}

export type PropostaImport = NonNullable<Awaited<ReturnType<typeof proporPranchasImport>>>;
