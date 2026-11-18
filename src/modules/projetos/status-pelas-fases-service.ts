import "server-only";

import type { Prisma, StatusDisciplina } from "@/generated/prisma/client";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { prisma } from "@/lib/prisma";
import { formatarCodigo } from "./numbering";
import { disciplinaUsaPastas } from "./estrutura-tipo";
import { etapaQueDefineOPrazo } from "./etapas";
import { entregueEmAposRecalculo, statusDaDisciplinaPelasFases, statusVemDasFases } from "./status-pelas-fases";

/**
 * O ÚNICO ponto que grava `Disciplina.status` a partir das fases (spec 2026-11-13, seção 5). Todo caminho
 * que muda o status de uma fase, ou o conjunto de fases, chama `recalcularStatusDisciplina` — a guarda
 * `status-pelas-fases-guarda.test.ts` cobra isso.
 *
 * Trava a linha da disciplina ANTES de ler as fases. Condicionar a escrita ao status lido estaria errado:
 * duas fases mudando juntas leriam cada uma a sua versão das fases e a segunda escrita não pegaria nada,
 * deixando o status calculado sem a mudança da outra. Com a trava os recálculos da mesma disciplina
 * andam em fila, e cada um lê as fases já confirmadas (READ COMMITTED) depois de pegar a trava.
 *
 * ORDEM DAS TRAVAS: toda transação que escreve fase chama `travarDisciplina` ANTES de tocar na fase. Assim
 * todos travam disciplina → fases, na mesma ordem, e dois caminhos cruzados (envio de fase × reaprovação da
 * disciplina) esperam um pelo outro em vez de dar deadlock.
 */
type Tx = Prisma.TransactionClient;

/** `SELECT … FOR UPDATE` na linha da disciplina. Idempotente dentro da mesma transação. */
export async function travarDisciplina(tx: Tx, disciplinaId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM disciplina WHERE id = ${disciplinaId} FOR UPDATE`;
}

export type OpcoesRecalculo = {
  /** Quem causou a mudança (fica no AuditLog). Nulo em job/script. */
  autorId: string | null;
  /** O que mudou e por qual ação — vai para o AuditLog ("fase EX enviada", "migração"…). */
  motivo: string;
  agora?: Date;
};

export type ResultadoRecalculo = {
  /** A disciplina segue a regra das fases (tem fase e não usa pastas). */
  derivado: boolean;
  antes: StatusDisciplina;
  depois: StatusDisciplina;
  mudou: boolean;
};

/**
 * Recalcula e grava o status da disciplina pelas fases, SEMPRE dentro da transação de quem mudou a fase: a
 * mudança e o recálculo confirmam juntos (e a trava só vale dentro de uma transação). Disciplina sem fase ou
 * no fluxo de pastas não muda (`derivado: false`). Não notifica: quem mudou a fase já avisou.
 */
export async function recalcularStatusDisciplina(
  tx: Tx,
  disciplinaId: string,
  op: OpcoesRecalculo,
): Promise<ResultadoRecalculo> {
  await travarDisciplina(tx, disciplinaId);
  // Leituras em sequência, sem lista aninhada: dentro da transação é UMA conexão (ver `disciplinasComStatusDivergente`).
  const d = await tx.disciplina.findUnique({ where: { id: disciplinaId }, select: { status: true, entregueEm: true } });
  if (!d) return { derivado: false, antes: "aguardando", depois: "aguardando", mudou: false };
  const etapas = await tx.disciplinaEtapa.findMany({ where: { disciplinaId }, select: { status: true } });
  const pastas = await tx.pastaProjeto.findMany({ where: { disciplinaId }, select: { origem: true } });

  const derivado = statusVemDasFases({ qtdFases: etapas.length, usaPastas: disciplinaUsaPastas(pastas) });
  if (!derivado) return { derivado, antes: d.status, depois: d.status, mudou: false };

  const depois = statusDaDisciplinaPelasFases(
    etapas.map((e) => e.status),
    d.status,
  );
  if (depois === d.status) return { derivado, antes: d.status, depois, mudou: false };

  const entregueEm = entregueEmAposRecalculo(depois, d, op.agora ?? new Date());
  await tx.disciplina.update({
    where: { id: disciplinaId },
    data: { status: depois, ...(entregueEm !== undefined ? { entregueEm } : {}) },
  });
  // Dentro da transação: se a mudança da fase desfizer, o registro desfaz junto. `logAudit` grava fora.
  await tx.auditLog.create({
    data: {
      userId: op.autorId,
      modulo: "projetos",
      acao: "status-derivado-das-fases",
      entidade: "Disciplina",
      entidadeId: disciplinaId,
      detalhe: {
        antes: { status: d.status },
        // Motivo pode trazer texto livre (o motivo da reabertura): cortado para não inflar o log.
        novo: { status: depois, motivo: op.motivo.slice(0, 300), fases: etapas.map((e) => e.status) },
      },
    },
  });
  return { derivado, antes: d.status, depois, mudou: true };
}

/**
 * Reabertura e apontamentos em disciplina aprovada (seção 4): põe em revisão a fase do documento
 * (`faseCatalogoId` = `DocumentoDisciplina.faseId`) ou, sem ela, a que define o prazo — QUALQUER que seja o
 * status dela (disciplina paga inteira antes das fases tem fase em "aguardando"). Exceção sancionada a
 * `transicaoEtapaPermitida`: só estes dois caminhos levam uma fase aprovada a revisão, e `liberadaEm`,
 * `valorPagamento` e os pagamentos não se mexem. Devolve a fase marcada, ou `null` sem fase.
 */
export async function marcarFaseEmRevisao(
  tx: Tx,
  disciplinaId: string,
  faseCatalogoId: string | null,
): Promise<{ id: string } | null> {
  const etapas = await tx.disciplinaEtapa.findMany({
    where: { disciplinaId },
    select: { id: true, etapaId: true, prazo: true, ordem: true },
  });
  if (etapas.length === 0) return null;
  const doDocumento = faseCatalogoId ? etapas.find((e) => e.etapaId === faseCatalogoId) : undefined;
  const alvo =
    doDocumento ??
    etapaQueDefineOPrazo(etapas.map((e) => ({ ...e, prazo: e.prazo ? e.prazo.toISOString().slice(0, 10) : null })))!;
  await tx.disciplinaEtapa.update({ where: { id: alvo.id }, data: { status: "em_revisao" } });
  return { id: alvo.id };
}

/**
 * Apontamentos numa disciplina NÃO aprovada (ponto 5 da seção 9): a fase `entregue` do documento apontado
 * volta a revisão — a análise devolveu ajustes. Fase que não está entregue (ainda trabalhando, ou já
 * aprovada) não muda; condicionado ao status na escrita. Devolve se marcou.
 */
export async function devolverFaseEntregueParaRevisao(
  tx: Tx,
  disciplinaId: string,
  faseCatalogoId: string | null,
): Promise<boolean> {
  if (!faseCatalogoId) return false;
  const r = await tx.disciplinaEtapa.updateMany({
    where: { disciplinaId, etapaId: faseCatalogoId, status: "entregue", liberadaEm: null },
    data: { status: "em_revisao" },
  });
  return r.count > 0;
}

/**
 * Reaprovação global (`validarEntrega` / `confirmarAprovacaoDisciplina` no ramo `jaTemPagamento`): toda fase
 * ainda não aprovada vai a aprovado SEM pagamento novo e sem mexer em `liberadaEm`. Nesse ramo, no modo por
 * fase, toda fase já foi liberada; no modo "disciplina inteira" nenhuma fase libera pagamento.
 */
export async function aprovarFasesSemPagamento(tx: Tx, disciplinaId: string, agora: Date): Promise<number> {
  const semData = await tx.disciplinaEtapa.updateMany({
    where: { disciplinaId, status: { not: "aprovado" }, entregueEm: null },
    data: { status: "aprovado", entregueEm: agora },
  });
  const comData = await tx.disciplinaEtapa.updateMany({
    where: { disciplinaId, status: { not: "aprovado" } },
    data: { status: "aprovado" },
  });
  return semData.count + comData.count;
}

export type DivergenciaStatus = {
  disciplinaId: string;
  disciplina: string;
  projetoId: string;
  projetoCodigo: string;
  de: StatusDisciplina;
  para: StatusDisciplina;
  fases: { sigla: string; status: StatusDisciplina }[];
};

/**
 * Só lê: disciplinas cujo status gravado difere do que as fases dizem (migração da seção 8 e smoke). Mesma
 * regra do recálculo — `statusVemDasFases` + `statusDaDisciplinaPelasFases` —, para a prévia não prometer
 * o que o `--gravar` não faz.
 */
export async function disciplinasComStatusDivergente(tx: Tx, p: { projetoId?: string } = {}): Promise<DivergenciaStatus[]> {
  // Três leituras em sequência, sem relação-lista aninhada: dentro de transação o Prisma dispara as
  // sub-consultas de uma lista aninhada em paralelo na MESMA conexão (aviso de depreciação do pg).
  const ds = await tx.disciplina.findMany({
    where: { etapas: { some: {} }, ...(p.projetoId ? { projetoId: p.projetoId } : {}) },
    orderBy: [{ projeto: { codigo: "asc" } }, { ordem: "asc" }, { id: "asc" }],
    select: { id: true, disciplinaTextoLegado: true, status: true, projetoId: true, projeto: { select: { codigo: true } } },
  });
  const ids = ds.map((d) => d.id);
  const etapas = await tx.disciplinaEtapa.findMany({
    where: { disciplinaId: { in: ids } },
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
    select: { disciplinaId: true, status: true, etapa: { select: { sigla: true } } },
  });
  const pastas = await tx.pastaProjeto.findMany({ where: { disciplinaId: { in: ids } }, select: { disciplinaId: true, origem: true } });

  const out: DivergenciaStatus[] = [];
  for (const d of ds) {
    const fases = etapas.filter((e) => e.disciplinaId === d.id);
    const usaPastas = disciplinaUsaPastas(pastas.filter((x) => x.disciplinaId === d.id));
    if (!statusVemDasFases({ qtdFases: fases.length, usaPastas })) continue;
    const para = statusDaDisciplinaPelasFases(fases.map((e) => e.status), d.status);
    if (para === d.status) continue;
    out.push({
      disciplinaId: d.id,
      disciplina: d.disciplinaTextoLegado,
      projetoId: d.projetoId,
      projetoCodigo: d.projeto.codigo,
      de: d.status,
      para,
      fases: fases.map((e) => ({ sigla: e.etapa.sigla, status: e.status })),
    });
  }
  return out;
}

/**
 * A troca manual para "Entregue" avisava os validadores ("Entrega aguardando validação"). Com o status vindo
 * das fases, o aviso sai quando o RECÁLCULO leva a disciplina a entregue — depois da transação confirmada, por
 * quem chamou. Mesma audiência, categoria e tag de antes; quem causou não é avisado.
 */
export async function avisarSeDisciplinaEntregue(
  r: ResultadoRecalculo,
  disciplinaId: string,
  p: { autorId: string | null; notificar?: typeof notificarMuitos },
): Promise<void> {
  if (!r.mudou || r.depois !== "entregue") return;
  const d = await prisma.disciplina.findUnique({
    where: { id: disciplinaId },
    select: { disciplinaTextoLegado: true, projetoId: true, projeto: { select: { codigo: true } } },
  });
  if (!d) return;
  const validadores = await prisma.user.findMany({ where: whereAudiencia("gestao_operacional"), select: { id: true } });
  const ids = validadores.map((v) => v.id).filter((id) => id !== p.autorId);
  if (ids.length === 0) return;
  await (p.notificar ?? notificarMuitos)(
    ids,
    {
      titulo: "Entrega aguardando validação",
      corpo: `${d.disciplinaTextoLegado} (${formatarCodigo(d.projeto.codigo)}): todas as fases entregues.`,
      href: `/projetos/${d.projetoId}`,
      tag: `entregue-${disciplinaId}`,
    },
    { categoria: "aprovacao_arquivo" },
  );
}
