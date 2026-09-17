import "server-only";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";
import { disciplinaUsaPastas } from "@/modules/projetos/estrutura-tipo";
import { arvoreNavegacaoDocumentos } from "@/modules/uploads/documentos-agrupados";
import { AREAS_PROJETO, type AreaProjeto } from "@/modules/uploads/areas-projeto";
import {
  montarArvoreGlobal,
  type ContagemAreaProjeto,
  type NoAnoGlobal,
  type PastaParaArvoreGlobal,
} from "./arvore-global";
import type { SessionUser } from "@/lib/session";

/**
 * Leitura da árvore do diretório geral (`/arquivos`).
 *
 * Regra de ouro deste arquivo: **nada por projeto**. Cada informação sai de UMA consulta sobre o
 * escopo inteiro, agregada no banco. A tela do projeto podia carregar listas completas e contar
 * com `.length`; aqui isso seria cinco consultas por projeto, e o escritório tem dezenas.
 *
 * A LISTA de cada área continua vindo das consultas por projeto de sempre (`recebidosDoProjeto`
 * e companhia), quando a pessoa abre uma área — aqui só a contagem que a árvore mostra.
 *
 * Quem decide o que a pessoa vê: `escopoProjeto(user)` no nível do projeto (a mesma regra da
 * tela antiga) e a muralha por disciplina dentro dele. Área sem permissão nem é consultada.
 */

/** Permissões que decidem quais áreas entram na árvore (as listas têm seus próprios gates). */
export type AreasVisiveis = {
  /** `arquivos_gerais:ver` — a pasta "Geral". */
  geral: boolean;
  /** Admin — a lixeira do projeto. */
  lixeira: boolean;
  /** Pode gerir Recebidos: vê a área mesmo vazia, para subir o primeiro arquivo. */
  gerirRecebidos: boolean;
};

/** Soma as contagens de `groupBy` numa chave projeto→total, ignorando linha sem projeto. */
function porProjeto(linhas: { projetoId: string | null; _count: { _all: number } }[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (!l.projetoId) continue;
    mapa.set(l.projetoId, (mapa.get(l.projetoId) ?? 0) + l._count._all);
  }
  return mapa;
}

/**
 * Contagem das áreas de todos os projetos do escopo, uma consulta por área.
 *
 * Reproduz a MESMA definição das consultas por projeto — não uma aproximação:
 *  - recebidos: material externo ancorado no projeto OU na proposta dele, mais os docs do Geral
 *    marcados `exibirEmRecebidos` (é a aba interna; o portal do cliente nunca vê essa segunda
 *    parte). A âncora por proposta é resolvida numa consulta só, não por projeto.
 *  - base / geral: `Documento` por `origem`.
 *  - arts: `Art` do projeto.
 *  - lixeira: uploads com `excluidoEm` preenchido — leitura top-level, então o filtro de soft
 *    delete precisa do escape hatch (`{ not: null }` já é explícito e vence o automático).
 */
async function contagensDeArea(projetoIds: string[], visiveis: AreasVisiveis): Promise<ContagemAreaProjeto[]> {
  if (projetoIds.length === 0) return [];

  const propostas = await prisma.proposta.findMany({
    where: { projetoId: { in: projetoIds } },
    select: { id: true, projetoId: true },
  });
  const projetoDaProposta = new Map(propostas.map((p) => [p.id, p.projetoId]));

  const [externos, doGeralEmRecebidos, base, geral, arts, lixeira] = await Promise.all([
    prisma.documento.groupBy({
      by: ["projetoId", "propostaId"],
      where: {
        origem: { notIn: ["interno", "base_arquitetonica"] },
        OR: [{ projetoId: { in: projetoIds } }, { propostaId: { in: propostas.map((p) => p.id) } }],
      },
      _count: { _all: true },
    }),
    prisma.documento.groupBy({
      by: ["projetoId"],
      where: { origem: "interno", exibirEmRecebidos: true, projetoId: { in: projetoIds } },
      _count: { _all: true },
    }),
    prisma.documento.groupBy({
      by: ["projetoId"],
      where: { origem: "base_arquitetonica", projetoId: { in: projetoIds } },
      _count: { _all: true },
    }),
    visiveis.geral
      ? prisma.documento.groupBy({
          by: ["projetoId"],
          where: { origem: "interno", projetoId: { in: projetoIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.art.groupBy({ by: ["projetoId"], where: { projetoId: { in: projetoIds } }, _count: { _all: true } }),
    visiveis.lixeira
      ? prisma.upload.groupBy({
          by: ["disciplinaId"],
          where: { disciplina: { projetoId: { in: projetoIds } }, excluidoEm: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  // Recebidos: as duas metades caem no mesmo projeto, e a âncora por proposta é traduzida aqui.
  const recebidos = new Map<string, number>();
  const somar = (projetoId: string | null | undefined, n: number) => {
    if (!projetoId) return;
    recebidos.set(projetoId, (recebidos.get(projetoId) ?? 0) + n);
  };
  for (const linha of externos) {
    somar(linha.projetoId ?? (linha.propostaId ? projetoDaProposta.get(linha.propostaId) : null), linha._count._all);
  }
  for (const linha of doGeralEmRecebidos) somar(linha.projetoId, linha._count._all);

  // Lixeira vem agrupada por disciplina (Upload não tem projetoId) — traduz numa consulta só.
  const lixeiraPorProjeto = new Map<string, number>();
  if (lixeira.length > 0) {
    const disciplinas = await prisma.disciplina.findMany({
      where: { id: { in: lixeira.map((l) => l.disciplinaId) } },
      select: { id: true, projetoId: true },
    });
    const projetoDaDisciplina = new Map(disciplinas.map((d) => [d.id, d.projetoId]));
    for (const l of lixeira) {
      const projetoId = projetoDaDisciplina.get(l.disciplinaId);
      if (!projetoId) continue;
      lixeiraPorProjeto.set(projetoId, (lixeiraPorProjeto.get(projetoId) ?? 0) + l._count._all);
    }
  }

  const totais: Record<AreaProjeto, Map<string, number>> = {
    recebidos,
    base: porProjeto(base),
    geral: porProjeto(geral),
    arts: porProjeto(arts),
    lixeira: lixeiraPorProjeto,
  };

  const saida: ContagemAreaProjeto[] = [];
  for (const projetoId of projetoIds) {
    for (const area of AREAS_PROJETO) {
      // Área sem permissão não entra na árvore — item invisível é melhor que item morto, mesma
      // regra do painel de áreas da aba do projeto.
      if (area === "geral" && !visiveis.geral) continue;
      if (area === "lixeira" && !visiveis.lixeira) continue;
      const total = totais[area].get(projetoId) ?? 0;
      // Zero só aparece em Recebidos para quem pode gerir: é onde se sobe o primeiro arquivo.
      // As outras áreas vazias ficariam ocupando cinco linhas por projeto, sem nada atrás.
      if (total === 0 && !(area === "recebidos" && visiveis.gerirRecebidos)) continue;
      saida.push({ projetoId, area, total });
    }
  }
  return saida;
}

/**
 * Pastas (`PastaProjeto`) das disciplinas de aprovação/laudo do escopo, com quantos documentos
 * vivos há em cada uma — duas consultas, independentes do número de projetos.
 */
async function pastasDoEscopo(disciplinaIds: string[]): Promise<PastaParaArvoreGlobal[]> {
  if (disciplinaIds.length === 0) return [];
  const pastas = await prisma.pastaProjeto.findMany({
    where: { disciplinaId: { in: disciplinaIds } },
    select: { id: true, disciplinaId: true, parentId: true, nome: true, ordem: true },
  });
  if (pastas.length === 0) return [];

  // Conta DOCUMENTOS, não uploads: PDF e DWG na mesma pasta são um documento só. Um documento
  // com arquivos em pastas diferentes conta em cada uma — é o que o clique na pasta entrega.
  const documentos = await prisma.documentoDisciplina.findMany({
    where: {
      substituidoPorId: null,
      disciplinaId: { in: disciplinaIds },
      uploads: { some: { excluidoEm: null, pastaId: { in: pastas.map((p) => p.id) } } },
    },
    select: { id: true, uploads: { where: { excluidoEm: null }, select: { pastaId: true } } },
  });
  const porPasta = new Map<string, Set<string>>();
  for (const doc of documentos) {
    for (const u of doc.uploads) {
      if (!u.pastaId) continue;
      const docs = porPasta.get(u.pastaId) ?? new Set<string>();
      docs.add(doc.id);
      porPasta.set(u.pastaId, docs);
    }
  }

  return pastas.map((p) => ({
    id: p.id,
    disciplinaId: p.disciplinaId,
    parentId: p.parentId,
    nome: p.nome,
    ordem: p.ordem,
    total: porPasta.get(p.id)?.size ?? 0,
  }));
}

/** A árvore inteira do diretório geral, pronta para a tela. */
export async function arvoreGlobalArquivos(
  user: SessionUser,
  veTodas: boolean,
  visiveis: AreasVisiveis,
): Promise<NoAnoGlobal[]> {
  const projetos = await prisma.projeto.findMany({
    where: escopoProjeto(user),
    select: { id: true, ano: true, codigo: true, nome: true },
  });
  const projetoIds = projetos.map((p) => p.id);
  if (projetoIds.length === 0) return [];

  const [disciplinas, documentos, areas] = await Promise.all([
    prisma.disciplina.findMany({
      where: {
        projetoId: { in: projetoIds },
        ...(veTodas ? {} : { responsaveis: { some: { userId: user.id } } }),
      },
      orderBy: { ordem: "asc" },
      select: {
        id: true,
        projetoId: true,
        disciplinaTextoLegado: true,
        catalogo: { select: { nome: true } },
        pastas: { select: { origem: true } },
      },
    }),
    arvoreNavegacaoDocumentos({ projetoIds, userId: user.id, veTodas }),
    contagensDeArea(projetoIds, visiveis),
  ]);

  const paraArvore = disciplinas.map((d) => ({
    id: d.id,
    projetoId: d.projetoId,
    nome: d.catalogo?.nome ?? d.disciplinaTextoLegado,
    usaPastas: disciplinaUsaPastas(d.pastas),
  }));
  const pastas = await pastasDoEscopo(paraArvore.filter((d) => d.usaPastas).map((d) => d.id));

  return montarArvoreGlobal({ projetos, disciplinas: paraArvore, documentos, pastas, areas });
}
