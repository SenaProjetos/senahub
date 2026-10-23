import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { ehEtapaDeTerceiro } from "../recursos";
import { estruturaDoProjeto } from "./estrutura-do-projeto";
import { salvarModeloDeEap } from "./service";

/**
 * "Salvar como modelo" (I/O sobre `estrutura-do-projeto.ts`): lê a EAP de UM projeto e grava o modelo pelo mesmo
 * `salvarModeloDeEap` da importação — o modelo salvo aqui se aplica, se edita e se lista como qualquer outro. Devolve os
 * avisos do que ficou de fora (disciplina sem par no catálogo, fase só do projeto, pessoas/horas/%/datas).
 */
export async function salvarEapDoProjetoComoModelo(p: {
  projetoId: string;
  nome: string;
  descricao: string | null;
  tipoEmpreendimentoId: string | null;
  autorId: string;
}): Promise<{ id: string; totalLinhas: number; totalMarcos: number; avisos: string[] }> {
  const projeto = await prisma.projeto.findUnique({ where: { id: p.projetoId }, select: { codigo: true } });
  if (!projeto) throw new ActionError("Projeto não encontrado.");

  const linhas = await prisma.eapTarefa.findMany({
    where: { projetoId: p.projetoId },
    select: {
      id: true,
      parentId: true,
      ordem: true,
      nome: true,
      tipoEap: true,
      duracaoDias: true,
      disciplinaId: true,
      etapaId: true,
      predecessoras: { select: { predecessoraId: true, tipo: true, lagDias: true } },
      atribuicoes: { select: { papel: true } },
    },
  });
  if (linhas.length === 0) throw new ActionError("Este projeto ainda não tem EAP para salvar.");

  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId: p.projetoId },
    select: { id: true, disciplinaId: true, disciplinaTextoLegado: true, catalogo: { select: { nome: true } } },
  });
  const etapaIds = [...new Set(linhas.flatMap((l) => (l.etapaId ? [l.etapaId] : [])))];
  const fases = etapaIds.length
    ? await prisma.pranchaCatalogo.findMany({ where: { id: { in: etapaIds }, categoria: "fase", projetoId: null }, select: { id: true } })
    : [];

  let r: ReturnType<typeof estruturaDoProjeto>;
  try {
    r = estruturaDoProjeto({
      linhas: linhas.map((l) => ({
        id: l.id,
        parentId: l.parentId,
        ordem: l.ordem,
        nome: l.nome,
        tipoEap: l.tipoEap,
        duracaoDias: Number(l.duracaoDias),
        disciplinaId: l.disciplinaId,
        etapaId: l.etapaId,
        deTerceiro: ehEtapaDeTerceiro(l.atribuicoes),
        predecessoras: l.predecessoras.map((v) => ({ predecessoraId: v.predecessoraId, tipo: v.tipo, lagDias: Number(v.lagDias) })),
      })),
      catalogoDaDisciplina: new Map(disciplinas.flatMap((d) => (d.disciplinaId ? [[d.id, d.disciplinaId] as const] : []))),
      nomesDasDisciplinas: new Map(disciplinas.map((d) => [d.id, d.catalogo?.nome ?? d.disciplinaTextoLegado] as const)),
      fasesGlobais: new Set(fases.map((f) => f.id)),
    });
  } catch (e) {
    throw new ActionError(e instanceof Error ? e.message : "Não foi possível converter a EAP em modelo.");
  }

  const salvo = await salvarModeloDeEap({
    nome: p.nome,
    descricao: p.descricao?.trim() || `Salvo do projeto ${projeto.codigo}`,
    tipoEmpreendimentoId: p.tipoEmpreendimentoId,
    arquivoNome: null,
    estrutura: r.estrutura,
    autorId: p.autorId,
  });
  return { ...salvo, avisos: r.avisos };
}
