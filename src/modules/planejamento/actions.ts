"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays } from "date-fns";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { paraDia, reagendarProjeto } from "@/modules/planejamento/agenda";
import { statusAoDesbloquear } from "@/modules/planejamento/execucao";
import { registrarExecucaoNaLinha } from "@/modules/planejamento/execucao-service";
import { inicioDoDiaUtc } from "@/lib/data";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia, wherePermissao } from "@/lib/audiencias";
import {
  aprovarCronograma,
  avaliarQualidade,
  gravarSaude,
  replanejar,
} from "@/modules/planejamento/service";
import { faixaTemPeriodoValido, haConflitoDeFaixa } from "@/modules/planejamento/alocacao-faixas";
import { sincronizarPrazoDisciplina } from "@/modules/projetos/etapas-service";
import { planejarAplicacao } from "@/modules/planejamento/aplicacao";
import { herdarResponsaveisNoProjeto, sincronizarCards } from "@/modules/planejamento/recursos-service";
import { sincronizarPrevisoesDepois } from "@/modules/juridico/contrato/previsao-service";
import { gravarApuracaoValorAgregado } from "@/modules/planejamento/valor-agregado-service";
import { reservarIdsParaLinhas } from "@/modules/planejamento/id-corporativo";

const plan = { modulo: "planejamento", recurso: "planejamento", permissao: "gerir" } as const;
const rec = { modulo: "recursos", recurso: "recursos", permissao: "gerir" } as const;

const revProjeto = (projetoId: string) => {
  revalidatePath(`/planejamento/${projetoId}`);
  revalidatePath("/planejamento");
};
const revRecursos = () => revalidatePath("/recursos");

/**
 * Depois de qualquer mudança na EAP que mexa em data ou em gente: com o cronograma
 * APROVADO, o card do projetista acompanha (D32). Em rascunho não faz nada (D14).
 * Chamado fora da transação da mudança — o motor precisa ler o estado já gravado.
 */
async function aposMudarEap(projetoId: string, autorId: string) {
  const r = await sincronizarCards(prisma, projetoId, autorId);
  if (r.criados > 0 || r.atualizados > 0) revalidatePath("/tarefas");
  // F7.2: marco que andou leva junto a previsão de recebimento do contrato por entrega.
  const p = await sincronizarPrevisoesDepois({ projetoId }, autorId);
  if (p && p.criadas + p.atualizadas + p.removidas > 0) {
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/lancamentos");
  }
}

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));
const dia = z.string().min(1, "Informe a data.");

/**
 * Fase da linha (F7.0): um id do catálogo de FASES (global ou deste projeto) — o mesmo que a
 * etapa da disciplina usa (F4). É o que liga um marco da EAP à fase que ele entrega (D31) e o que
 * `aplicarAoProjeto` usa para levar a data à etapa certa. Exige disciplina: fase solta, sem
 * disciplina, não aponta etapa nenhuma. Devolve o id a gravar (ou nulo).
 */
async function faseDaLinha(projetoId: string, disciplinaId: string | null, etapaId: string | null | undefined) {
  if (!etapaId) return null;
  if (!disciplinaId) throw new ActionError("Escolha a disciplina antes da fase.");
  const fase = await prisma.pranchaCatalogo.findFirst({
    where: { id: etapaId, categoria: "fase", OR: [{ projetoId: null }, { projetoId }] },
    select: { id: true },
  });
  if (!fase) throw new ActionError("Fase não encontrada no catálogo.");
  return fase.id;
}

/**
 * Duração provisória da F0, em DIAS DE CALENDÁRIO inclusivos — exatamente a conta que o
 * CPM antigo fazia. Não é o calendário de trabalho: a F1 traz `lib/calendario-trabalho.ts`
 * (dias úteis + feriados, reusando `feriadosParaCalculo`) e RECALCULA toda duração.
 *
 * Existe só para a coluna nascer preenchida com a intenção que já estava nas datas. Não
 * chamar de fora deste arquivo, e remover quando a F1 entrar.
 */
function diasUteisEntre(inicioIso: string, fimIso: string): number {
  const MS_DIA = 86_400_000;
  const ini = new Date(`${inicioIso}T00:00:00`).getTime();
  const fim = new Date(`${fimIso}T00:00:00`).getTime();
  const dias = Math.round((fim - ini) / MS_DIA) + 1;
  return dias > 0 ? dias : 1;
}

// ── Roll-up: propaga datas e progresso do filho ao pai ───────
// Tarefas-resumo (com filhas) derivam inicioPrevisto, fimPrevisto e progresso dos filhos.
async function rollupPai(tarefaId: string) {
  const t = await prisma.eapTarefa.findUnique({ where: { id: tarefaId }, select: { parentId: true } });
  if (!t?.parentId) return;
  const irmaos = await prisma.eapTarefa.findMany({
    where: { parentId: t.parentId },
    select: { inicioPrevisto: true, fimPrevisto: true, progresso: true },
  });
  if (irmaos.length === 0) return;
  const minInicio = irmaos.reduce((m, s) => (s.inicioPrevisto < m ? s.inicioPrevisto : m), irmaos[0].inicioPrevisto);
  const maxFim = irmaos.reduce((m, s) => (s.fimPrevisto > m ? s.fimPrevisto : m), irmaos[0].fimPrevisto);
  const avgProgresso = Math.round(irmaos.reduce((sum, s) => sum + s.progresso, 0) / irmaos.length);
  await prisma.eapTarefa.update({
    where: { id: t.parentId },
    data: { inicioPrevisto: minInicio, fimPrevisto: maxFim, progresso: avgProgresso },
  });
  await rollupPai(t.parentId); // propaga hierarquia acima
}

// ── EAP ──────────────────────────────────────────────────────

const tarefaSchema = z
  .object({
    projetoId: z.string().min(1),
    parentId: opt(z.string()),
    disciplinaId: opt(z.string()),
    /** F7.0: fase da linha (catálogo de fases). Vazio = sem fase. */
    etapaId: opt(z.string()),
    nome: z.string().min(1, "Informe o nome."),
    inicioPrevisto: dia,
    fimPrevisto: dia,
    progresso: z.number().int().min(0).max(100).default(0),
    marco: z.boolean().default(false),
  })
  .refine((v) => new Date(v.fimPrevisto) >= new Date(v.inicioPrevisto), {
    message: "Fim não pode ser antes do início.",
    path: ["fimPrevisto"],
  });
const editarSchema = z
  .object({
    id: z.string().min(1),
    nome: z.string().min(1, "Informe o nome."),
    disciplinaId: opt(z.string()),
    /** F7.0: fase da linha. Ausente = não mexe; vazio = tira a fase. */
    etapaId: opt(z.string()),
    inicioPrevisto: dia,
    fimPrevisto: dia,
    progresso: z.number().int().min(0).max(100),
    marco: z.boolean().default(false),
  })
  .refine((v) => new Date(v.fimPrevisto) >= new Date(v.inicioPrevisto), {
    message: "Fim não pode ser antes do início.",
    path: ["fimPrevisto"],
  });
const idSchema = z.object({ id: z.string().min(1) });
const projetoIdSchema = z.object({ projetoId: z.string().min(1) });
const depSchema = z.object({ tarefaId: z.string().min(1), predecessoraId: z.string().min(1) });
const tipoVinculoSchema = z.enum(["fs", "ss", "ff", "sf"]);
const vincularSchema = depSchema.extend({
  tipo: tipoVinculoSchema.default("fs"),
  lagDias: z.number().finite().default(0),
});
const editarVinculoSchema = depSchema.extend({
  tipo: tipoVinculoSchema,
  lagDias: z.number().finite(),
});
const bloqueioSchema = z.object({
  id: z.string().min(1),
  motivo: z.string().min(3, "Descreva o motivo do bloqueio."),
  previsaoDesbloqueio: opt(z.string()),
  origemId: opt(z.string()),
});
const restricaoSchema = z.object({
  id: z.string().min(1),
  tipo: z
    .enum([
      "iniciar_em",
      "iniciar_nao_antes_de",
      "iniciar_nao_depois_de",
      "terminar_em",
      "terminar_nao_antes_de",
      "terminar_nao_depois_de",
    ])
    .nullable(),
  data: opt(z.string()),
});
const gerarTarefaSchema = z.object({ eapTarefaId: z.string().min(1) });

/**
 * Ponte EAP → card do projetista, sob demanda. Desde a F5 o card nasce SOZINHO quando o
 * cronograma é aprovado (e acompanha cada reprogramação — `sincronizarCards`); este botão só
 * força a sincronização para a linha e devolve o card dela.
 *
 * Recusa em rascunho (D14): card de cronograma não aprovado mostraria ao projetista um
 * prazo que ninguém combinou. E recusa linha que não gera card (D24), dizendo por quê —
 * antes o botão criava card para qualquer linha, sem responsável, até para marco.
 */
export const gerarTarefaDeEap = defineAction(
  { ...plan, acao: "gerar-tarefa-eap", entidade: "Tarefa", schema: gerarTarefaSchema },
  async (i, { user }) => {
    const existente = await prisma.tarefa.findUnique({
      where: { eapTarefaId: i.eapTarefaId },
      select: { id: true },
    });
    if (existente) return { id: existente.id, jaExistia: true };

    const eap = await prisma.eapTarefa.findUnique({
      where: { id: i.eapTarefaId },
      select: { projetoId: true, projeto: { select: { cronograma: { select: { aprovado: true } } } } },
    });
    if (!eap) throw new ActionError("Etapa da EAP não encontrada.");
    if (!eap.projeto.cronograma?.aprovado) {
      throw new ActionError("O card nasce quando o cronograma é aprovado — rascunho não gera card.");
    }

    await sincronizarCards(prisma, eap.projetoId, user.id);
    const card = await prisma.tarefa.findUnique({ where: { eapTarefaId: i.eapTarefaId }, select: { id: true } });
    if (!card) {
      throw new ActionError(
        "Esta linha não gera card: precisa ser uma atividade da equipe (não marco nem etapa de terceiro), com alguém escalado, e ainda não concluída.",
      );
    }
    revalidatePath("/tarefas");
    return { id: card.id, jaExistia: false };
  },
);

export const criarEapTarefa = defineAction(
  { ...plan, acao: "criar-eap", entidade: "EapTarefa", schema: tarefaSchema },
  async (i, { user }) => {
    const max = await prisma.eapTarefa.aggregate({
      where: { projetoId: i.projetoId },
      _max: { ordem: true },
    });
    const etapaId = await faseDaLinha(i.projetoId, i.disciplinaId || null, i.etapaId);
    const tipoEap = i.marco ? "mrc" : "atv";
    const [idCorporativo] = await reservarIdsParaLinhas(prisma, [tipoEap]);
    const t = await prisma.eapTarefa.create({
      data: {
        idCorporativo,
        projetoId: i.projetoId,
        parentId: i.parentId || null,
        disciplinaId: i.disciplinaId || null,
        etapaId,
        nome: i.nome,
        inicioPrevisto: new Date(i.inicioPrevisto),
        fimPrevisto: i.marco ? new Date(i.inicioPrevisto) : new Date(i.fimPrevisto),
        progresso: i.progresso,
        // F0: a natureza da linha é o TEAP; `marco` continua no contrato da UI mas não
        // existe mais como coluna. Marco tem duração 0 por definição (Doc 03 §11).
        tipoEap,
        duracaoDias: i.marco ? 0 : diasUteisEntre(i.inicioPrevisto, i.fimPrevisto),
        ordem: (max._max.ordem ?? -1) + 1,
      },
    });
    // D22: o responsável da disciplina desce para a linha nova.
    await herdarResponsaveisNoProjeto(prisma, i.projetoId, [t.id]);
    await rollupPai(t.id);
    await aposMudarEap(i.projetoId, user.id);
    revProjeto(i.projetoId);
    return { id: t.id };
  },
);

export const editarEapTarefa = defineAction(
  { ...plan, acao: "editar-eap", entidade: "EapTarefa", schema: editarSchema },
  async (i, { user }) => {
    const antes = await prisma.eapTarefa.findUnique({ where: { id: i.id }, select: { disciplinaId: true, projetoId: true } });
    if (!antes) throw new ActionError("Tarefa não encontrada.");
    // Fase: ausente não mexe (quem não manda o campo não apaga a fase de ninguém); trocar de
    // disciplina sem mandar a fase a limpa — a fase de outra disciplina não aponta etapa desta.
    const mudouDisciplina = (antes.disciplinaId ?? null) !== (i.disciplinaId || null);
    const etapaId =
      i.etapaId !== undefined
        ? await faseDaLinha(antes.projetoId, i.disciplinaId || null, i.etapaId)
        : mudouDisciplina
          ? null
          : undefined;
    if (i.marco) {
      // Marco não tem dia para espalhar hora: as horas ficariam gravadas e fora de toda
      // conta — carga, custo e rollup — sem ninguém ver.
      const comHoras = await prisma.eapAtribuicao.count({ where: { tarefaId: i.id, horasPrevistas: { gt: 0 } } });
      if (comHoras > 0) {
        throw new ActionError("Esta linha tem horas previstas. Zere as horas das pessoas antes de transformá-la em marco.");
      }
    }
    const t = await prisma.eapTarefa.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        disciplinaId: i.disciplinaId || null,
        ...(etapaId !== undefined ? { etapaId } : {}),
        inicioPrevisto: new Date(i.inicioPrevisto),
        fimPrevisto: i.marco ? new Date(i.inicioPrevisto) : new Date(i.fimPrevisto),
        progresso: i.progresso,
        tipoEap: i.marco ? "mrc" : "atv",
        duracaoDias: i.marco ? 0 : diasUteisEntre(i.inicioPrevisto, i.fimPrevisto),
      },
      select: { projetoId: true },
    });
    // Linha que MUDOU de disciplina e está sem ninguém recebe o responsável da nova (D22).
    // Só na mudança: herdar a cada edição devolveria as pessoas a uma linha que o
    // coordenador esvaziou de propósito — bastaria renomeá-la.
    if ((antes?.disciplinaId ?? null) !== (i.disciplinaId || null)) {
      await herdarResponsaveisNoProjeto(prisma, t.projetoId, [i.id]);
    }
    await rollupPai(i.id);
    await aposMudarEap(t.projetoId, user.id);
    revProjeto(t.projetoId);
    return { id: i.id };
  },
);

export const excluirEapTarefa = defineAction(
  { ...plan, acao: "excluir-eap", entidade: "EapTarefa", schema: idSchema },
  async (i, { user }) => {
    // Capture parentId before deletion so we can roll up afterward.
    const pre = await prisma.eapTarefa.findUnique({ where: { id: i.id }, select: { parentId: true, projetoId: true } });
    await prisma.eapTarefa.delete({ where: { id: i.id } });
    // Roll up from a sibling to update parent summary (pass parentId itself as anchor).
    if (pre?.parentId) {
      const sibling = await prisma.eapTarefa.findFirst({ where: { parentId: pre.parentId }, select: { id: true } });
      if (sibling) await rollupPai(sibling.id);
    }
    // Sucessoras podem ter andado: o prazo dos cards delas acompanha. (O card da linha
    // excluída fica — nunca se apaga card.)
    if (pre) await aposMudarEap(pre.projetoId, user.id);
    revProjeto(pre!.projetoId);
    return { id: i.id };
  },
);

/** Define/redefine a linha de base: copia datas previstas atuais → baseline de TODAS as tarefas. */
// `definirLinhaBase` (P-era) foi REMOVIDA na F3: ela sobrescrevia inicioBaseline/fimBaseline
// direto, em silêncio, sem passar por `EapBaseline` — exatamente o que a D6/Doc 03 §20
// proíbem ("baseline nunca sobrescrita"). `aprovarCronogramaAction`/`replanejarCronograma`
// (F2, abaixo) fazem o mesmo papel, mas versionado. Deixá-la no ar seria um botão que
// alguém rewire um dia e quebra o invariante sem avisar ninguém.

/** Aplica o plano à execução: tarefas com disciplina vinculada gravam o prazo da disciplina. */
export const aplicarAoProjeto = defineAction(
  { ...plan, acao: "aplicar-plano", entidade: "Disciplina", schema: projetoIdSchema },
  async (i) => {
    const [tarefas, todasDiscs] = await Promise.all([
      prisma.eapTarefa.findMany({
        where: { projetoId: i.projetoId, disciplinaId: { not: null } },
        select: { disciplinaId: true, etapaId: true, fimPrevisto: true },
      }),
      prisma.disciplina.findMany({
        where: { projetoId: i.projetoId },
        select: {
          id: true,
          disciplinaTextoLegado: true,
          etapas: { select: { id: true, etapaId: true } },
        },
      }),
    ]);
    if (tarefas.length === 0) {
      throw new ActionError("Nenhuma tarefa vinculada a disciplina. Vincule disciplinas para aplicar.");
    }
    const comEap = new Set(tarefas.map((t) => t.disciplinaId));
    const semEap = todasDiscs.filter((d) => !comEap.has(d.id)).map((d) => d.disciplinaTextoLegado);

    // A regra (máximo por alvo, casamento de fase, linhas puladas) mora em `aplicacao.ts`,
    // pura e testada. Aqui só grava o plano.
    const plano = planejarAplicacao(
      tarefas.map((t) => ({ disciplinaId: t.disciplinaId!, etapaId: t.etapaId, fimPrevisto: t.fimPrevisto })),
      todasDiscs.map((d) => ({ id: d.id, nome: d.disciplinaTextoLegado, etapas: d.etapas })),
    );

    await prisma.$transaction(async (tx) => {
      for (const [id, prazo] of plano.porDisciplina) {
        await tx.disciplina.update({ where: { id }, data: { prazo } });
      }
      for (const [id, prazo] of plano.porEtapa) {
        await tx.disciplinaEtapa.update({ where: { id }, data: { prazo } });
      }
      for (const id of plano.aReconsolidar) await sincronizarPrazoDisciplina(tx, id);
    });

    revProjeto(i.projetoId);
    revalidatePath(`/projetos/${i.projetoId}`);
    return {
      aplicadas: plano.porDisciplina.size + plano.aReconsolidar.size,
      semEap,
      ignoradas: plano.ignoradas,
    };
  },
);

/**
 * P-36: cria uma tarefa de EAP por disciplina que ainda não tem uma (vínculo
 * disciplinaId). Datas: fim = prazo da disciplina (ou prazo final do projeto, ou
 * hoje+14); início = hoje. Bootstrap rápido para sair do "Sem tarefas de EAP".
 */
export const gerarEapDasDisciplinas = defineAction(
  { ...plan, acao: "gerar-eap-disciplinas", entidade: "EapTarefa", schema: projetoIdSchema },
  async (i, { user }) => {
    const [disciplinas, existentes, projeto, maxOrdem] = await Promise.all([
      prisma.disciplina.findMany({
        where: { projetoId: i.projetoId },
        orderBy: { ordem: "asc" },
        select: { id: true, disciplinaTextoLegado: true, prazo: true },
      }),
      prisma.eapTarefa.findMany({
        where: { projetoId: i.projetoId, disciplinaId: { not: null } },
        select: { disciplinaId: true },
      }),
      prisma.projeto.findUnique({ where: { id: i.projetoId }, select: { prazoPlanejado: true } }),
      prisma.eapTarefa.aggregate({ where: { projetoId: i.projetoId }, _max: { ordem: true } }),
    ]);
    const jaComEap = new Set(existentes.map((e) => e.disciplinaId));
    const novas = disciplinas.filter((d) => !jaComEap.has(d.id));
    if (novas.length === 0) throw new ActionError("Todas as disciplinas já têm tarefa na EAP.");

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let ordem = (maxOrdem._max.ordem ?? -1) + 1;
    const idsCorporativos = await reservarIdsParaLinhas(prisma, novas.map(() => "atv" as const));
    const criadas = await prisma.$transaction(
      novas.map((d, k) => {
        const fim =
          d.prazo && d.prazo > hoje
            ? d.prazo
            : projeto?.prazoPlanejado && projeto.prazoPlanejado > hoje
              ? projeto.prazoPlanejado
              : addDays(hoje, 14);
        return prisma.eapTarefa.create({
          data: {
            idCorporativo: idsCorporativos[k],
            projetoId: i.projetoId,
            disciplinaId: d.id,
            nome: d.disciplinaTextoLegado,
            inicioPrevisto: hoje,
            fimPrevisto: fim,
            ordem: ordem++,
          },
          select: { id: true },
        });
      }),
    );
    await herdarResponsaveisNoProjeto(prisma, i.projetoId, criadas.map((c) => c.id));
    await aposMudarEap(i.projetoId, user.id);
    revProjeto(i.projetoId);
    return { criadas: novas.length };
  },
);

/**
 * Reagenda o projeto inteiro pelo motor: duração + calendário + dependências geram as
 * datas (F1). Substituiu o forward-pass antigo, que deduzia duração das datas digitadas
 * e contava dias corridos, sem feriado.
 *
 * Não-destrutivo: só grava a linha que mudou de data ou de posição na EAP.
 */
export const reagendarPlano = defineAction(
  { ...plan, acao: "reagendar-plano", entidade: "EapTarefa", schema: projetoIdSchema },
  async (i, ctx) => {
    const total = await prisma.eapTarefa.count({ where: { projetoId: i.projetoId } });
    if (total === 0) throw new ActionError("Sem tarefas para reagendar.");

    const r = await reagendarProjeto(i.projetoId, ctx.user.id);
    await aposMudarEap(i.projetoId, ctx.user.id);
    if (r.reagendadas > 0 || r.codigosAtualizados > 0) revProjeto(i.projetoId);
    return r;
  },
);

/**
 * Define a âncora do cronograma — a "Data de Início do Projeto" do MS Project.
 * Linha sem predecessora e sem restrição passa a nascer aqui.
 */
export const definirInicioProjeto = defineAction(
  {
    ...plan,
    acao: "definir-inicio-projeto",
    entidade: "CronogramaProjeto",
    schema: z.object({ projetoId: z.string().min(1), inicio: dia }),
  },
  async (i, { user }) => {
    await prisma.cronogramaProjeto.upsert({
      where: { projetoId: i.projetoId },
      create: { projetoId: i.projetoId, inicioProjeto: new Date(`${i.inicio}T00:00:00.000Z`) },
      update: { inicioProjeto: new Date(`${i.inicio}T00:00:00.000Z`) },
    });
    const r = await reagendarProjeto(i.projetoId, user.id);
    await aposMudarEap(i.projetoId, user.id);
    revProjeto(i.projetoId);
    return r;
  },
);

/**
 * Data de corte da análise (Doc 03 §21). É o que separa "atrasado" de "não apurado" —
 * sem ela, linha que ninguém atualizou há três semanas aparece como atrasada, e as duas
 * coisas pedem ações opostas.
 */
export const definirDataStatus = defineAction(
  {
    ...plan,
    recurso: "cronograma",
    permissao: "executado",
    acao: "definir-data-status",
    entidade: "CronogramaProjeto",
    schema: z.object({ projetoId: z.string().min(1), dataStatus: dia }),
  },
  async (i) => {
    const data = new Date(`${i.dataStatus}T00:00:00.000Z`);
    await prisma.cronogramaProjeto.upsert({
      where: { projetoId: i.projetoId },
      create: { projetoId: i.projetoId, dataStatus: data },
      update: { dataStatus: data },
    });
    // A foto do dia reflete a apuração que acabou de entrar.
    await gravarSaude(i.projetoId, i.dataStatus);
    // F8: e o Valor Agregado desta apuração — o % não guarda passado; sem a foto, a curva se perde.
    // Refazer a apuração na mesma data ATUALIZA (é o coordenador reapurando). Isolado: a Data de
    // Status já foi gravada, e uma falha aqui não pode fazer a ação parecer que falhou.
    try {
      await gravarApuracaoValorAgregado(i.projetoId, { modo: "atualizar" });
    } catch (e) {
      console.error("[valor-agregado] falha ao gravar a apuração", i.projetoId, e);
    }
    revProjeto(i.projetoId);
    return { dataStatus: i.dataStatus };
  },
);

/**
 * Aprova o cronograma: congela BL-00 e libera. Recusa com erro de qualidade aberto —
 * aprovar transforma estas datas no combinado com o cliente.
 */
export const aprovarCronogramaAction = defineAction(
  {
    ...plan,
    recurso: "cronograma",
    permissao: "aprovar",
    acao: "aprovar-cronograma",
    entidade: "CronogramaProjeto",
    schema: projetoIdSchema,
  },
  async (i, ctx) => {
    try {
      const r = await aprovarCronograma(i.projetoId, ctx.user.id);
      revProjeto(i.projetoId);
      revalidatePath(`/projetos/${i.projetoId}`);
      return r;
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "Não foi possível aprovar o cronograma.");
    }
  },
);

/**
 * Replanejamento autorizado: nova versão de baseline, com motivo OBRIGATÓRIO.
 * Sem motivo, a série de baselines vira uma lista de datas sem história.
 */
export const replanejarCronograma = defineAction(
  {
    ...plan,
    recurso: "cronograma",
    permissao: "aprovar",
    acao: "replanejar-cronograma",
    entidade: "EapBaseline",
    schema: z.object({
      projetoId: z.string().min(1),
      motivo: z.string().min(5, "Explique o motivo do replanejamento."),
      observacao: opt(z.string()),
    }),
  },
  async (i, ctx) => {
    try {
      const r = await replanejar(i.projetoId, ctx.user.id, i.motivo, i.observacao || null);
      revProjeto(i.projetoId);
      return r;
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "Não foi possível replanejar.");
    }
  },
);

/** Roda o verificador sob demanda, para a tela mostrar os achados sem esperar o job. */
export const conferirQualidade = defineAction(
  {
    ...plan,
    recurso: "cronograma",
    permissao: "ver",
    acao: "conferir-qualidade",
    entidade: "CronogramaProjeto",
    schema: projetoIdSchema,
  },
  async (i) => {
    const r = await avaliarQualidade(i.projetoId);
    if (!r) throw new ActionError("Projeto sem EAP: não há o que conferir.");
    return {
      achados: r.achados,
      nota: r.saude?.nota ?? null,
      faixa: r.saude?.faixa ?? null,
      provisoria: r.saude?.provisoria ?? true,
      dataStatus: r.dataStatus,
    };
  },
);

/** Caminho de predecessoras leva a alvo? (detecção de ciclo). */
async function alcanca(deId: string, alvoId: string): Promise<boolean> {
  const visitados = new Set<string>();
  let fronteira = [deId];
  while (fronteira.length > 0) {
    if (fronteira.includes(alvoId)) return true;
    const deps = await prisma.eapDependencia.findMany({
      where: { tarefaId: { in: fronteira } },
      select: { predecessoraId: true },
    });
    fronteira = deps.map((d) => d.predecessoraId).filter((id) => !visitados.has(id));
    fronteira.forEach((id) => visitados.add(id));
  }
  return false;
}

export const vincularDependencia = defineAction(
  { ...plan, acao: "vincular-dep", entidade: "EapDependencia", schema: vincularSchema },
  async (i, { user }) => {
    if (i.tarefaId === i.predecessoraId) throw new ActionError("Tarefa não pode depender dela mesma.");
    const [tarefa, pred] = await Promise.all([
      prisma.eapTarefa.findUnique({ where: { id: i.tarefaId }, select: { projetoId: true } }),
      prisma.eapTarefa.findUnique({ where: { id: i.predecessoraId }, select: { projetoId: true } }),
    ]);
    if (!tarefa || !pred) throw new ActionError("Tarefa não encontrada.");
    if (tarefa.projetoId !== pred.projetoId) throw new ActionError("Dependência deve ser no mesmo projeto.");
    // Vincular tarefa→pred criaria ciclo se pred já alcança tarefa por predecessoras.
    if (await alcanca(i.predecessoraId, i.tarefaId)) {
      throw new ActionError("Dependência criaria um ciclo.");
    }
    await prisma.eapDependencia.create({
      data: { tarefaId: i.tarefaId, predecessoraId: i.predecessoraId, tipo: i.tipo, lagDias: i.lagDias },
    });
    await aposMudarEap(tarefa.projetoId, user.id);
    revProjeto(tarefa.projetoId);
    return { ok: true };
  },
);

/** Muda o TIPO (FS/SS/FF/SF) ou o LAG de um vínculo já existente, sem recriá-lo. */
export const editarVinculo = defineAction(
  { ...plan, acao: "editar-vinculo", entidade: "EapDependencia", schema: editarVinculoSchema },
  async (i, { user }) => {
    const t = await prisma.eapTarefa.findUnique({ where: { id: i.tarefaId }, select: { projetoId: true } });
    if (!t) throw new ActionError("Tarefa não encontrada.");
    await prisma.eapDependencia.updateMany({
      where: { tarefaId: i.tarefaId, predecessoraId: i.predecessoraId },
      data: { tipo: i.tipo, lagDias: i.lagDias },
    });
    await aposMudarEap(t.projetoId, user.id);
    revProjeto(t.projetoId);
    return { ok: true };
  },
);

/**
 * Bloqueia a linha (D40): marca, registra o motivo e notifica — NÃO para o relógio.
 * O atraso continua sendo contado; só a ORIGEM muda (Doc 03 §26/§27).
 */
export const definirBloqueio = defineAction(
  { ...plan, acao: "bloquear-eap", entidade: "EapTarefa", schema: bloqueioSchema },
  async (i) => {
    const atual = await prisma.eapTarefa.findUnique({ where: { id: i.id }, select: { status: true } });
    // Bloquear uma concluída apagaria a conclusão (o status é um só) sem ninguém pedir.
    if (atual?.status === "con") throw new ActionError("Linha concluída não se bloqueia — reabra a execução antes.");
    const t = await prisma.eapTarefa.update({
      where: { id: i.id },
      data: {
        status: "blq",
        motivoBloqueio: i.motivo,
        previsaoDesbloqueio: i.previsaoDesbloqueio ? new Date(i.previsaoDesbloqueio) : null,
        origemId: i.origemId || undefined,
      },
      select: { projetoId: true },
    });
    revProjeto(t.projetoId);
    return { ok: true };
  },
);

/**
 * Desbloqueia e limpa o motivo — a linha some da lista de bloqueadas. Volta ao status que as
 * datas reais dizem (`statusAoDesbloquear`): em andamento se já começou, senão não iniciada.
 */
export const desbloquear = defineAction(
  { ...plan, acao: "desbloquear-eap", entidade: "EapTarefa", schema: idSchema },
  async (i) => {
    const atual = await prisma.eapTarefa.findUnique({
      where: { id: i.id },
      select: { inicioReal: true, fimReal: true },
    });
    if (!atual) throw new ActionError("Tarefa não encontrada.");
    const t = await prisma.eapTarefa.update({
      where: { id: i.id },
      data: {
        status: statusAoDesbloquear({
          inicioReal: atual.inicioReal ? paraDia(atual.inicioReal) : null,
          fimReal: atual.fimReal ? paraDia(atual.fimReal) : null,
        }),
        motivoBloqueio: null,
        previsaoDesbloqueio: null,
      },
      select: { projetoId: true },
    });
    revProjeto(t.projetoId);
    return { ok: true };
  },
);

/**
 * Restrição de data (Doc 03 §18) — o "alfinete" da tela. `tipo: null` remove a restrição
 * e devolve a linha ao cálculo livre do motor.
 */
export const definirRestricao = defineAction(
  { ...plan, acao: "definir-restricao", entidade: "EapTarefa", schema: restricaoSchema },
  async (i, { user }) => {
    if (i.tipo && !i.data) throw new ActionError("Informe a data da restrição.");
    const t = await prisma.eapTarefa.update({
      where: { id: i.id },
      data: {
        restricaoTipo: i.tipo,
        restricaoData: i.tipo && i.data ? new Date(i.data) : null,
      },
      select: { projetoId: true },
    });
    await aposMudarEap(t.projetoId, user.id);
    revProjeto(t.projetoId);
    return { ok: true };
  },
);

export const removerDependencia = defineAction(
  { ...plan, acao: "remover-dep", entidade: "EapDependencia", schema: depSchema },
  async (i, { user }) => {
    const t = await prisma.eapTarefa.findUnique({
      where: { id: i.tarefaId },
      select: { projetoId: true },
    });
    await prisma.eapDependencia.deleteMany({
      where: { tarefaId: i.tarefaId, predecessoraId: i.predecessoraId },
    });
    if (t) {
      await aposMudarEap(t.projetoId, user.id);
      revProjeto(t.projetoId);
    }
    return { ok: true };
  },
);

// ── Recursos & Alocações ─────────────────────────────────────

const recursoSchema = z.object({
  userId: z.string().min(1),
  capacidade: z.number().positive("Capacidade deve ser maior que zero.").max(9.99),
  custoHora: z.number().nonnegative().optional(),
  cor: opt(z.string()),
  ativo: z.boolean().default(true),
});
const alocacaoSchema = z.object({
  id: z.string().min(1).optional(),
  recursoId: z.string().min(1),
  projetoId: z.string().min(1),
  percentual: z.number().int().min(1, "Mínimo 1%.").max(100, "Máximo 100% por projeto."),
  inicio: opt(z.string()),
  fim: opt(z.string()),
  observacao: opt(z.string()),
});

/** Cria/atualiza o recurso de uma pessoa (capacidade, custo/hora, cor). */
export const salvarRecurso = defineAction(
  { ...rec, acao: "salvar-recurso", entidade: "Recurso", schema: recursoSchema },
  async (i) => {
    const r = await prisma.recurso.upsert({
      where: { userId: i.userId },
      create: {
        userId: i.userId,
        capacidade: i.capacidade,
        custoHora: i.custoHora,
        cor: i.cor || undefined,
        ativo: i.ativo,
      },
      update: {
        capacidade: i.capacidade,
        custoHora: i.custoHora ?? null,
        cor: i.cor || undefined,
        ativo: i.ativo,
      },
    });
    revRecursos();
    return { id: r.id };
  },
);

export const salvarAlocacao = defineAction(
  {
    ...rec,
    acao: "salvar-alocacao",
    entidade: "Alocacao",
    schema: alocacaoSchema,
    capturarAntes: async (i) => i.id
      ? prisma.alocacao.findUnique({ where: { id: i.id } })
      : null,
  },
  async (i) => {
    // Projeto com cronograma APROVADO é calculado pelas linhas (D17): a alocação digitada
    // dele não entra em conta nenhuma. Gravar seria aceitar um número que não faz nada.
    const cronograma = await prisma.cronogramaProjeto.findUnique({
      where: { projetoId: i.projetoId },
      select: { aprovado: true },
    });
    if (cronograma?.aprovado) {
      throw new ActionError(
        "Este projeto tem cronograma aprovado: a alocação vem das horas das pessoas nas linhas da EAP, não daqui.",
      );
    }
    const faixa = { id: i.id, inicio: i.inicio || null, fim: i.fim || null };
    if (!faixaTemPeriodoValido(faixa)) {
      throw new ActionError("Fim não pode ser antes do início.");
    }
    if (i.id) {
      const atual = await prisma.alocacao.findUnique({
        where: { id: i.id },
        select: { recursoId: true, projetoId: true },
      });
      if (!atual || atual.recursoId !== i.recursoId || atual.projetoId !== i.projetoId) {
        throw new ActionError("Alocação não encontrada.");
      }
    }

    const existentes = await prisma.alocacao.findMany({
      where: {
        recursoId: i.recursoId,
        projetoId: i.projetoId,
        ...(i.id ? { id: { not: i.id } } : {}),
      },
      select: { id: true, inicio: true, fim: true },
    });
    if (haConflitoDeFaixa(faixa, existentes.map((a) => ({
      id: a.id,
      inicio: a.inicio?.toISOString().slice(0, 10) ?? null,
      fim: a.fim?.toISOString().slice(0, 10) ?? null,
    })))) {
      throw new ActionError("Já existe uma faixa para este projeto que se sobrepõe ao período informado.");
    }

    const dados = {
      percentual: i.percentual,
      inicio: i.inicio ? new Date(i.inicio) : null,
      fim: i.fim ? new Date(i.fim) : null,
      observacao: i.observacao || null,
    };
    const a = i.id
      ? await prisma.alocacao.update({ where: { id: i.id }, data: dados })
      : await prisma.alocacao.create({ data: { recursoId: i.recursoId, projetoId: i.projetoId, ...dados } });
    revRecursos();
    return { id: a.id };
  },
);

export const removerAlocacao = defineAction(
  { ...rec, acao: "remover-alocacao", entidade: "Alocacao", schema: idSchema },
  async (i) => {
    await prisma.alocacao.delete({ where: { id: i.id } });
    revRecursos();
    return { id: i.id };
  },
);

/**
 * "Atualizar tarefa" do MS Project (F7.0): início real e término real da linha — no marco, a data
 * em que ele aconteceu. Permissão `cronograma:executado` ("informar avanço, datas reais").
 *
 * Registrar a execução não mexe em dinheiro. Quando ela CONCLUI um marco ligado a uma fase da
 * disciplina (D31 — "Básico entregue → libera o pagamento do Básico"), a resposta traz a fase, e a
 * tela oferece aprovar — pela MESMA `aprovarEtapaDisciplina` do diálogo de Etapas, com a permissão
 * e a confirmação dela. Um caminho só de liberação: o marco não paga nada sozinho.
 *
 * O motor não lê datas reais (a D6 ainda não existe): nada é reagendado aqui.
 */
export const registrarExecucao = defineAction(
  {
    ...plan,
    recurso: "cronograma",
    permissao: "executado",
    acao: "registrar-execucao",
    entidade: "EapTarefa",
    schema: z.object({
      id: z.string().min(1),
      inicioReal: z.string().nullable(),
      fimReal: z.string().nullable(),
    }),
    capturarAntes: (i) =>
      prisma.eapTarefa.findUnique({
        where: { id: i.id },
        select: { status: true, progresso: true, inicioReal: true, fimReal: true },
      }),
  },
  async (i, { user }) => {
    const { projetoId, nome, status, fase, parcelasAFaturar } = await registrarExecucaoNaLinha({
      id: i.id,
      inicioReal: i.inicioReal,
      fimReal: i.fimReal,
      hoje: paraDia(inicioDoDiaUtc()),
    });
    await rollupPai(i.id);

    // Fase pronta para aprovar: avisa quem aprova (mesma audiência da "aprovação solicitada").
    // Quem registrou pode nem ter a permissão — o aviso é o que leva o marco até a aprovação.
    if (fase?.aprovavel) {
      const gestores = await prisma.user.findMany({
        where: { ...whereAudiencia("global"), id: { not: user.id } },
        select: { id: true },
      });
      await notificarMuitos(
        gestores.map((g) => g.id),
        {
          titulo: "Marco concluído — fase pronta para aprovar",
          corpo: `"${nome}" concluído: a fase ${fase.sigla} de ${fase.disciplina} pode ser aprovada (libera o pagamento dela).`,
          href: `/projetos/${projetoId}`,
          tag: `marco-fase-${fase.id}`,
        },
        { categoria: "aprovacao_disciplina" },
      );
    }

    // F7.2 (D9): parcela de contrato presa a este marco pode ser faturada — o financeiro fatura.
    if (parcelasAFaturar.length > 0) {
      const financeiro = await prisma.user.findMany({
        where: { ...wherePermissao("financeiro", "gerir"), id: { not: user.id } },
        select: { id: true },
      });
      await notificarMuitos(
        financeiro.map((f) => f.id),
        {
          titulo: "Marco concluído — parcela a faturar",
          corpo:
            parcelasAFaturar.length === 1
              ? `"${nome}" concluído: a parcela "${parcelasAFaturar[0].descricao}" do ${parcelasAFaturar[0].contrato} pode ser faturada.`
              : `"${nome}" concluído: ${parcelasAFaturar.length} parcelas de contrato podem ser faturadas.`,
          href: "/financeiro/contas?tab=receita",
          tag: `marco-parcela-${i.id}`,
        },
        { categoria: "faturamento" },
      );
    }

    revProjeto(projetoId);
    return { status, fase };
  },
);
