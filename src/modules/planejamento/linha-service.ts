import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Dia } from "@/lib/calendario-trabalho";
import { paraDataUtc, paraDia } from "./agenda";
import { regrasDeEdicao } from "./edicao-linha";
import { mudaCampoDoPlano } from "./trava-plano";
import { exigirPlanoEditavel, exigirPlanoEditavelDaLinha } from "./trava-plano-service";
import { registrarProgresso } from "./progresso-historico-service";
import { herdarResponsaveisNoProjeto } from "./recursos-service";
import { trocarPredecessoras } from "./dependencias-service";
import { definirInicioDaLinha, definirTerminoDaLinha } from "./datas-linha-service";
import { aposMudarEap } from "./pos-eap";
import { fotoDoPlano, voltarAFoto } from "./desfazer/service";
import type { Vinculo } from "./gantt-linhas";

/**
 * Gravação de UMA linha da EAP (I/O). `editarLinhaNoBanco` é o editar de sempre (nome, tipo, disciplina, fase, duração,
 * %); `salvarLinhaNoBanco` é o "Salvar" do painel da linha: tudo o que mudou na linha numa chamada só — um reagendamento,
 * um passo de desfazer (quem chama embrulha) e TUDO OU NADA: se uma etapa falha depois de outra já gravada, o plano volta
 * à foto tirada no começo.
 */

/**
 * Fase da linha (F7.0): um id do catálogo de FASES (global ou deste projeto) — o mesmo que a
 * etapa da disciplina usa (F4). É o que liga um marco da EAP à fase que ele entrega (D31) e o que
 * `aplicarAoProjeto` usa para levar a data à etapa certa. Exige disciplina: fase solta, sem
 * disciplina, não aponta etapa nenhuma. Devolve o id a gravar (ou nulo).
 */
export async function faseDaLinha(projetoId: string, disciplinaId: string | null, etapaId: string | null | undefined) {
  if (!etapaId) return null;
  if (!disciplinaId) throw new ActionError("Escolha a disciplina antes da fase.");
  const fase = await prisma.pranchaCatalogo.findFirst({
    where: { id: etapaId, categoria: "fase", OR: [{ projetoId: null }, { projetoId }] },
    select: { id: true },
  });
  if (!fase) throw new ActionError("Fase não encontrada no catálogo.");
  return fase.id;
}

export type EdicaoLinha = {
  id: string;
  nome: string;
  /** Vazio = sem disciplina. */
  disciplinaId?: string;
  /** Ausente = não mexe; vazio = tira a fase. */
  etapaId?: string;
  /** Dias ÚTEIS. Ausente = mantém. */
  duracaoDias?: number;
  progresso: number;
  marco: boolean;
};

/** O editar da linha, SEM reagendar (quem chama reagenda uma vez no fim). */
export async function editarLinhaNoBanco(i: EdicaoLinha, autorId: string): Promise<{ projetoId: string }> {
  const antes = await prisma.eapTarefa.findUnique({
    where: { id: i.id },
    select: {
      disciplinaId: true,
      etapaId: true,
      projetoId: true,
      tipoEap: true,
      duracaoDias: true,
      progresso: true,
      _count: { select: { filhas: true } },
    },
  });
  if (!antes) throw new ActionError("Tarefa não encontrada.");
  // B2 (`edicao-linha.ts`): só alterna atividade ↔ marco; agrupamento não grava duração; marco é 0.
  const regra = regrasDeEdicao(
    { tipoEap: antes.tipoEap, duracaoDias: Number(antes.duracaoDias), ehResumo: antes._count.filhas > 0 },
    { marco: i.marco, duracaoDias: i.duracaoDias },
  );
  if (!regra.ok) throw new ActionError(regra.motivo);
  const { tipoEap, duracaoDias } = regra;
  // Plano aprovado (`trava-plano.ts`): nome e % seguem livres; duração, marco, disciplina e fase, não.
  const mudaPlano = mudaCampoDoPlano(
    { tipoEap: antes.tipoEap, duracaoDias: Number(antes.duracaoDias), disciplinaId: antes.disciplinaId, etapaId: antes.etapaId },
    { tipoEap, duracaoDias, disciplinaId: i.disciplinaId || null, etapaId: i.etapaId === undefined ? undefined : i.etapaId || null },
  );
  if (mudaPlano) await exigirPlanoEditavel(antes.projetoId);
  if (regra.virouMarco) {
    // Marco não tem dia para espalhar hora: as horas ficariam gravadas e fora de toda
    // conta — carga, custo e rollup — sem ninguém ver.
    const comHoras = await prisma.eapAtribuicao.count({ where: { tarefaId: i.id, horasPrevistas: { gt: 0 } } });
    if (comHoras > 0) {
      throw new ActionError("Esta linha tem horas previstas. Zere as horas das pessoas antes de transformá-la em marco.");
    }
  }
  // Fase: ausente não mexe (quem não manda o campo não apaga a fase de ninguém); trocar de
  // disciplina sem mandar a fase a limpa — a fase de outra disciplina não aponta etapa desta.
  const mudouDisciplina = (antes.disciplinaId ?? null) !== (i.disciplinaId || null);
  const etapaId =
    i.etapaId !== undefined
      ? await faseDaLinha(antes.projetoId, i.disciplinaId || null, i.etapaId)
      : mudouDisciplina
        ? null
        : undefined;
  // Decisão #17: a mudança do % vai para o histórico NA MESMA TRANSAÇÃO — é o histórico que responde
  // pelo número que o Valor Agregado publica numa data passada.
  const t = await prisma.$transaction(async (tx) => {
    const linha = await tx.eapTarefa.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        disciplinaId: i.disciplinaId || null,
        ...(etapaId !== undefined ? { etapaId } : {}),
        progresso: i.progresso,
        tipoEap,
        ...(duracaoDias !== undefined ? { duracaoDias } : {}),
      },
      select: { projetoId: true },
    });
    await registrarProgresso(tx, {
      tarefaId: i.id,
      projetoId: linha.projetoId,
      anterior: antes.progresso,
      progresso: i.progresso,
      autorId,
      origem: "informado",
      ehResumo: antes._count.filhas > 0,
    });
    return linha;
  });
  // Linha que MUDOU de disciplina e está sem ninguém recebe o responsável da nova (D22).
  // Só na mudança: herdar a cada edição devolveria as pessoas a uma linha que o
  // coordenador esvaziou de propósito — bastaria renomeá-la.
  if (mudouDisciplina) {
    await herdarResponsaveisNoProjeto(prisma, t.projetoId, [i.id]);
  }
  return t;
}

export type TipoRestricao =
  | "iniciar_em"
  | "iniciar_nao_antes_de"
  | "iniciar_nao_depois_de"
  | "terminar_em"
  | "terminar_nao_antes_de"
  | "terminar_nao_depois_de";

export type SalvarLinha = EdicaoLinha & {
  /** Início digitado: vira a restrição "não iniciar antes de" (o alfinete). Ignorado quando `restricao` vem. */
  inicio?: Dia;
  /** Término digitado: vira a duração (dias úteis do início do motor até ele) — vence `duracaoDias`. */
  termino?: Dia;
  /** Restrição escolhida à mão (`tipo: null` tira). */
  restricao?: { tipo: TipoRestricao | null; data?: Dia };
  /** O conjunto INTEIRO de predecessoras (só quando mudou). */
  predecessoras?: Vinculo[];
};

export async function salvarLinhaNoBanco(i: SalvarLinha, autorId: string): Promise<{ projetoId: string; inicio: Dia; fim: Dia }> {
  const linha = await prisma.eapTarefa.findUnique({
    where: { id: i.id },
    select: { projetoId: true, progresso: true, _count: { select: { filhas: true } } },
  });
  if (!linha) throw new ActionError("Tarefa não encontrada.");
  const { projetoId } = linha;
  // A foto do desfazer é só do PLANO (o % é acompanhamento e fica de fora dela): o % vai por último, quando todo o resto
  // já passou — assim uma recusa no meio nunca deixa um % gravado.
  const foto = await fotoDoPlano(projetoId);
  try {
    await editarLinhaNoBanco({ ...i, progresso: linha.progresso }, autorId);
    if (i.predecessoras) {
      await exigirPlanoEditavelDaLinha(i.id);
      await trocarPredecessoras({ tarefaId: i.id, vinculos: i.predecessoras });
    }
    if (i.restricao) {
      if (i.restricao.tipo && !i.restricao.data) throw new ActionError("Informe a data da restrição.");
      await exigirPlanoEditavelDaLinha(i.id);
      await prisma.eapTarefa.update({
        where: { id: i.id },
        data: { restricaoTipo: i.restricao.tipo, restricaoData: i.restricao.tipo && i.restricao.data ? paraDataUtc(i.restricao.data) : null },
      });
    } else if (i.inicio) {
      await exigirPlanoEditavelDaLinha(i.id);
      await definirInicioDaLinha({ id: i.id, data: i.inicio });
    }
    // Por último: o término conta os dias úteis a partir do início que o motor dá DEPOIS das mudanças de cima.
    if (i.termino) {
      await exigirPlanoEditavelDaLinha(i.id);
      await definirTerminoDaLinha({ id: i.id, data: i.termino });
    }
    if (i.progresso !== linha.progresso) {
      await prisma.$transaction(async (tx) => {
        await tx.eapTarefa.update({ where: { id: i.id }, data: { progresso: i.progresso } });
        await registrarProgresso(tx, {
          tarefaId: i.id,
          projetoId,
          anterior: linha.progresso,
          progresso: i.progresso,
          autorId,
          origem: "informado",
          ehResumo: linha._count.filhas > 0,
        });
      });
    }
  } catch (e) {
    try {
      await voltarAFoto(projetoId, foto);
    } catch (falha) {
      console.error("[salvar linha] falha ao voltar o plano depois de um erro:", falha);
    }
    throw e;
  }
  await aposMudarEap(projetoId, autorId);
  const t = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: i.id }, select: { inicioPrevisto: true, fimPrevisto: true } });
  return { projetoId, inicio: paraDia(t.inicioPrevisto), fim: paraDia(t.fimPrevisto) };
}
