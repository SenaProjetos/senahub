import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { planoDoProjeto } from "./agenda";
import { custosDoProjeto } from "./custo-service";
import { gravarApuracaoValorAgregado } from "./valor-agregado-service";
import {
  MOTIVO_BASE_EM_REVISAO,
  MOTIVO_BASE_MUDOU,
  MOTIVO_BASE_SEM_APROVACAO,
  MOTIVO_BASE_SEM_MUDANCA,
  atividadeNaoIniciada,
  planejarEquipeNaBase,
  type LinhaDaBase,
  type PlanoDaBase,
} from "./orcamento-base";

/**
 * Leitura e escrita do "Completar a equipe na linha de base" (regra em `orcamento-base.ts`). A prévia da tela e a
 * gravação passam pela MESMA conta (`calcular`); a gravação refaz a conta e confere, dentro da transação, que a linha
 * de base ainda é a que foi lida.
 */

type Calculo = {
  baselineId: string;
  baselineNumero: number;
  plano: PlanoDaBase;
  /** Foto (status, %, início real, quem e quantas horas) de cada atividade que muda: a gravação confere de novo. */
  assinaturas: Map<string, string>;
};

/** O que decide "não iniciada" e as horas da atividade. Mudou entre a prévia e a gravação = recusa. */
function assinatura(
  t: { status: string; progresso: number; inicioReal: Date | null },
  atribuicoes: readonly { userId: string | null; horasPrevistas: unknown }[],
): string {
  const quem = atribuicoes
    .map((a) => `${a.userId ?? "-"}:${Number(a.horasPrevistas)}`)
    .sort()
    .join(",");
  return `${t.status}|${t.progresso}|${t.inicioReal?.toISOString() ?? ""}|${quem}`;
}

async function calcular(projetoId: string): Promise<Calculo> {
  const cronograma = await prisma.cronogramaProjeto.findUnique({
    where: { projetoId },
    select: { aprovado: true, emRevisao: true },
  });
  if (!cronograma?.aprovado) throw new ActionError(MOTIVO_BASE_SEM_APROVACAO);
  if (cronograma.emRevisao) throw new ActionError(MOTIVO_BASE_EM_REVISAO);

  // A linha de base EM VIGOR (a mais recente): é a que o Valor Agregado lê. Leitura plana, uma tabela por vez.
  const baseline = await prisma.eapBaseline.findFirst({
    where: { projetoId },
    orderBy: { numero: "desc" },
    select: { id: true, numero: true },
  });
  if (!baseline) throw new ActionError(MOTIVO_BASE_SEM_APROVACAO);
  const linhasBase = await prisma.eapBaselineLinha.findMany({
    where: { baselineId: baseline.id },
    select: { id: true, tarefaId: true, nome: true, resumo: true, trabalhoHoras: true, custoPrevisto: true },
  });

  const plano = await planoDoProjeto(projetoId);
  if (!plano) throw new ActionError("Projeto sem EAP: não há o que completar.");
  const tarefas = await prisma.eapTarefa.findMany({
    where: { projetoId },
    select: {
      id: true,
      parentId: true,
      nome: true,
      status: true,
      progresso: true,
      inicioReal: true,
      atribuicoes: { select: { userId: true, horasPrevistas: true } },
    },
  });
  // O mesmo custo da tela e do congelamento: horas do motor × custo/hora de quem está escalado hoje.
  const { porLinha: custos } = await custosDoProjeto(plano, tarefas);

  const r = planejarEquipeNaBase(
    linhasBase.map(paraLinhaDaBase),
    tarefas.map((t) => {
      const a = plano.resultado.linhas.get(t.id);
      return {
        id: t.id,
        parentId: t.parentId,
        nome: t.nome,
        ehResumo: a?.ehResumo ?? false,
        naoIniciada: atividadeNaoIniciada(t),
        trabalhoHoras: a ? a.trabalhoHoras : null,
        custo: custos.get(t.id)?.custo ?? null,
      };
    }),
  );
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const assinaturas = new Map<string, string>();
  for (const m of r.mudancas) {
    const t = porId.get(m.tarefaId);
    if (!m.resumo && t) assinaturas.set(m.tarefaId, assinatura(t, t.atribuicoes));
  }
  return { baselineId: baseline.id, baselineNumero: baseline.numero, plano: r, assinaturas };
}

function paraLinhaDaBase(l: {
  id: string;
  tarefaId: string | null;
  nome: string;
  resumo: boolean;
  trabalhoHoras: unknown;
  custoPrevisto: unknown;
}): LinhaDaBase {
  return {
    id: l.id,
    tarefaId: l.tarefaId,
    nome: l.nome,
    resumo: l.resumo,
    trabalhoHoras: l.trabalhoHoras == null ? null : Number(l.trabalhoHoras),
    custoPrevisto: l.custoPrevisto == null ? null : Number(l.custoPrevisto),
  };
}

export type PreviaEquipeNaBase = {
  baselineNumero: number;
  atividadesAtualizadas: number;
  iniciadasDiferentes: number;
  /** Atividades que mudam (sem os agrupamentos), com horas antes/depois. Custo só para quem vê o financeiro. */
  linhas: { tarefaId: string; nome: string; horasAntes: number | null; horasDepois: number | null; custoAntes: number | null; custoDepois: number | null }[];
  /** Soma das horas das atividades que mudam, antes e depois (`null` se alguma for desconhecida). */
  horasAntes: number | null;
  horasDepois: number | null;
  custoAntes: number | null;
  custoDepois: number | null;
};

const soma = (vs: (number | null)[]) =>
  vs.some((v) => v == null) ? null : Math.round(vs.reduce<number>((s, v) => s + Math.round((v ?? 0) * 100), 0)) / 100;

/** Prévia para a tela. Recusa com a mesma frase da gravação quando não se aplica. `verCusto` decide se o R$ sai. */
export async function previaEquipeNaBase(projetoId: string, opcoes: { verCusto: boolean }): Promise<PreviaEquipeNaBase> {
  const { baselineNumero, plano } = await calcular(projetoId);
  const folhas = plano.mudancas.filter((m) => !m.resumo);
  const custo = (v: number | null) => (opcoes.verCusto ? v : null);
  return {
    baselineNumero,
    atividadesAtualizadas: plano.atividadesAtualizadas,
    iniciadasDiferentes: plano.iniciadasDiferentes,
    linhas: folhas.map((m) => ({
      tarefaId: m.tarefaId,
      nome: m.nome,
      horasAntes: m.antes.horas,
      horasDepois: m.depois.horas,
      custoAntes: custo(m.antes.custo),
      custoDepois: custo(m.depois.custo),
    })),
    horasAntes: soma(folhas.map((m) => m.antes.horas)),
    horasDepois: soma(folhas.map((m) => m.depois.horas)),
    custoAntes: opcoes.verCusto ? soma(folhas.map((m) => m.antes.custo)) : null,
    custoDepois: opcoes.verCusto ? soma(folhas.map((m) => m.depois.custo)) : null,
  };
}

/**
 * Grava. Uma transação: trava a linha do cronograma (ainda aprovado e sem revisão aberta), confere que a linha de base
 * em vigor é a lida e que cada linha a mudar ainda tem os valores de antes, reescreve SÓ horas e custo e grava o
 * AuditLog com antes/depois de cada linha e o motivo. Datas, duração e % planejado não são tocados.
 *
 * Limite conhecido (o mesmo do congelamento): a EAP é lida fora da transação, porque o motor lê pelo cliente global.
 * Uma pessoa incluída entre a leitura e o commit fica para a próxima vez.
 */
export async function completarEquipeNaBase(
  projetoId: string,
  autorId: string,
  motivo: string,
): Promise<{ baselineNumero: number; atividades: number; linhas: number }> {
  const { baselineId, baselineNumero, plano, assinaturas } = await calcular(projetoId);
  if (plano.mudancas.length === 0) throw new ActionError(MOTIVO_BASE_SEM_MUDANCA);
  const ids = [...assinaturas.keys()];

  await prisma.$transaction(
    async (tx) => {
      const travado = await tx.$queryRaw<{ aprovado: boolean; emRevisao: boolean }[]>`
        SELECT aprovado, "emRevisao" FROM cronograma_projeto WHERE "projetoId" = ${projetoId} FOR UPDATE`;
      if (!travado[0]?.aprovado) throw new ActionError(MOTIVO_BASE_SEM_APROVACAO);
      if (travado[0].emRevisao) throw new ActionError(MOTIVO_BASE_EM_REVISAO);
      const vigente = await tx.eapBaseline.findFirst({
        where: { projetoId },
        orderBy: { numero: "desc" },
        select: { id: true },
      });
      if (vigente?.id !== baselineId) throw new ActionError(MOTIVO_BASE_MUDOU);

      // "Só não iniciadas" vale no momento de gravar: a 1ª hora de ponto (início real), o % ou uma pessoa incluída entre a
      // prévia e agora mudam a foto e a gravação recusa. Leitura plana, uma tabela por vez (transação = uma conexão).
      const agora = await tx.eapTarefa.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, progresso: true, inicioReal: true },
      });
      const atribs = await tx.eapAtribuicao.findMany({
        where: { tarefaId: { in: ids } },
        select: { tarefaId: true, userId: true, horasPrevistas: true },
      });
      for (const t of agora) {
        const dela = atribs.filter((a) => a.tarefaId === t.id);
        if (assinatura(t, dela) !== assinaturas.get(t.id)) throw new ActionError(MOTIVO_BASE_MUDOU);
      }
      if (agora.length !== ids.length) throw new ActionError(MOTIVO_BASE_MUDOU);

      for (const m of plano.mudancas) {
        // Condicionada ao valor lido: outra gravação entre a prévia e agora faz a transação inteira voltar.
        const n = await tx.eapBaselineLinha.updateMany({
          where: {
            id: m.linhaBaseId,
            baselineId,
            trabalhoHoras: m.antes.horas,
            custoPrevisto: m.antes.custo,
          },
          data: { trabalhoHoras: m.depois.horas, custoPrevisto: m.depois.custo },
        });
        if (n.count !== 1) throw new ActionError(MOTIVO_BASE_MUDOU);
      }

      await tx.auditLog.create({
        data: {
          userId: autorId,
          modulo: "planejamento",
          acao: "completar-equipe-na-base",
          entidade: "EapBaseline",
          entidadeId: baselineId,
          detalhe: {
            projetoId,
            baselineNumero,
            motivo: motivo.slice(0, 500),
            linhas: plano.mudancas.map((m) => ({
              tarefaId: m.tarefaId,
              nome: m.nome.slice(0, 120),
              resumo: m.resumo,
              antes: m.antes,
              depois: m.depois,
            })),
          },
        },
      });
    },
    { timeout: 60_000 },
  );

  // O Valor Agregado da Data de Status atual passa a ler o orçamento completo.
  // Falhar aqui não desfaz a linha de base já gravada: a apuração se refaz na próxima Data de Status ou na foto semanal.
  await gravarApuracaoValorAgregado(projetoId, { modo: "atualizar" }).catch((e) =>
    console.error("[completar-equipe-na-base] reapuração do Valor Agregado falhou:", e),
  );
  return { baselineNumero, atividades: plano.atividadesAtualizadas, linhas: plano.mudancas.length };
}
