import "server-only";

/**
 * Fechar e reabrir a folha CLT no banco — o mesmo código que a Server Action usa e que os smokes
 * exercitam (as actions precisam de sessão; o smoke não tem uma).
 *
 * N0 do núcleo do Financeiro (decisões do dono, 2026-10-02): **fechar não é pagar**. A folha da
 * competência M grava o líquido real na conta a pagar da competência, que continua EM ABERTO até o
 * pagamento (5º dia útil de M+1), registrado na baixa ou na conciliação. A decisão de QUAL conta é
 * pura (`quitacao.ts`); aqui ficam o I/O, o vencimento pelo calendário de feriados e o vínculo com o
 * compromisso recorrente da folha — sem ele, o gerador diário criaria o mês de novo.
 */
import { acharCategoriaDoSistema, mensagemCategoriaAusente } from "@/modules/financeiro/categorias-sistema";
import { Prisma } from "@/generated/prisma/client";
import { exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { paraCentavos, paraReais } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { avancarCompetencia, enesimoDiaUtil, vencimentoDoCompromisso } from "@/modules/financeiro/recorrencia/calculo";
import { anosDoHorizonte, calendarioFinanceiro } from "@/modules/financeiro/recorrencia/queries";
import { rotuloFolha } from "@/modules/rh/folha/tipo-folha";
import {
  avisoDoFechamento,
  competenciaDaFolha,
  decidirContaDaFolha,
  folhaUsaContaDaCompetencia,
  motivoParaNaoReabrir,
  type ContaDaFolha,
} from "@/modules/rh/folha/quitacao";

/** O que o fechamento fez com a conta a pagar da competência. */
export type AcaoNaConta = "atualizou" | "criou" | "ja_paga";

export type ResultadoFechamento = {
  liquido: number;
  acao: AcaoNaConta;
  lancamentoId: string;
  /** Vencimento da conta a pagar (`YYYY-MM-DD`). */
  vencimento: string;
  /** Frase para a tela: diferença entre previsto e real, e o que ficou em aberto. */
  aviso: string | null;
};

/** Dia do mês seguinte até onde uma conta de folha SEM vínculo é considerada da competência. */
const ULTIMO_DIA_DA_JANELA = 15;

/** Regra do dono quando não há compromisso recorrente da folha: 5º dia útil do mês seguinte. */
const DIA_UTIL_PADRAO = 5;

function inicioDoMes(comp: string): Date {
  return new Date(`${comp}-01T00:00:00.000Z`);
}

/**
 * Contas a pagar de folha CLT que podem ser desta competência: as VINCULADAS a ela pela recorrência e,
 * sem vínculo, as que vencem nos primeiros dias do mês seguinte (a folha de M é paga até o 5º dia útil
 * de M+1). Inclui as já pagas — a folha paga antes do fechamento não pode ganhar uma segunda conta.
 * `excluidoEm: null` explícito: a extensão de exclusão lógica não cobre toda consulta.
 */
export async function contasDaCompetencia(categoriaId: string, competencia: string): Promise<ContaDaFolha[]> {
  const proximo = avancarCompetencia(competencia, 1);
  const de = inicioDoMes(proximo);
  const ate = new Date(`${proximo}-${String(ULTIMO_DIA_DA_JANELA).padStart(2, "0")}T00:00:00.000Z`);
  const rows = await prisma.lancamento.findMany({
    where: {
      excluidoEm: null,
      tipo: "despesa",
      categoriaId,
      status: { in: ["previsto", "aguardando_aprovacao", "confirmado"] },
      OR: [
        { recorrenciaCompetencia: competencia },
        { recorrenciaCompetencia: null, vencimento: { gte: de, lte: ate } },
        { recorrenciaCompetencia: null, vencimento: null, data: { gte: de, lte: ate } },
      ],
    },
    select: {
      id: true,
      valor: true,
      valorEfetivo: true,
      status: true,
      vencimento: true,
      data: true,
      recorrenciaCompetencia: true,
      recorrenciaOrigem: { select: { adiantamento: true } },
    },
  });
  return rows.map((l) => ({
    id: l.id,
    // Já paga: vale o que saiu do caixa.
    valor: paraCentavos(l.status === "confirmado" ? (l.valorEfetivo ?? l.valor) : l.valor),
    status: l.status === "aguardando_aprovacao" ? "aguardando_aprovacao" : l.status === "confirmado" ? "confirmado" : "previsto",
    vencimento: isoDeDataDoBanco(l.vencimento ?? l.data),
    recorrenciaCompetencia: l.recorrenciaCompetencia,
    adiantamento: l.recorrenciaOrigem?.adiantamento ?? false,
  }));
}

/** Categoria da folha CLT pela CHAVE — `codigo` é editável em Cadastros. */
async function categoriaDaFolha() {
  const id = await acharCategoriaDoSistema(prisma, "2.03");
  if (!id) throw new ActionError(mensagemCategoriaAusente("2.03"));
  return { id };
}

/**
 * O compromisso recorrente DA FOLHA nesta competência (não o adiantamento), quando há exatamente um e o
 * mês ainda está livre. É o que o fechamento usa para o vencimento e para gravar o vínculo.
 */
async function compromissoDaFolha(categoriaId: string, competencia: string) {
  const candidatos = await prisma.compromissoRecorrente.findMany({
    where: { categoriaId, ativo: true, adiantamento: false, competenciaInicio: { lte: competencia } },
    select: { id: true, diaVencimento: true, regraVencimento: true, mesesAteVencimento: true, competenciaFim: true },
  });
  const vigentes = candidatos.filter((c) => c.competenciaFim == null || c.competenciaFim >= competencia);
  if (vigentes.length !== 1) return null;
  const c = vigentes[0];
  const usado = await prisma.lancamento.count({
    where: { recorrenciaOrigemId: c.id, recorrenciaCompetencia: competencia, excluidoEm: { not: undefined } },
  });
  return { ...c, livre: usado === 0 };
}

function somaLiquidaEmCentavos(holerites: readonly { itens: readonly { tipo: string; valor: Prisma.Decimal }[] }[]): number {
  let c = 0;
  for (const h of holerites) for (const it of h.itens) c += (it.tipo === "provento" ? 1 : -1) * paraCentavos(it.valor);
  return c;
}

export async function fecharFolhaNoBanco(folhaId: string, autorId: string): Promise<ResultadoFechamento> {
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id: folhaId },
    include: { holerites: { include: { itens: true } } },
  });
  if (!folha) throw new ActionError("Folha não encontrada.");
  if (folha.status === "fechada") throw new ActionError("Folha já fechada.");
  if (folha.holerites.length === 0) throw new ActionError("Adicione holerites antes de fechar.");

  const liquidoCent = somaLiquidaEmCentavos(folha.holerites);
  if (liquidoCent <= 0) throw new ActionError("Total líquido deve ser positivo.");
  const liquido = paraReais(liquidoCent);

  const categoria = await categoriaDaFolha();
  const competencia = competenciaDaFolha(folha);
  const hoje = diaDeSaoPaulo();
  const descricao = `Folha CLT ${rotuloFolha(folha)}`;
  const mensal = folhaUsaContaDaCompetencia(folha.tipo);

  // 13º: outra despesa, com folha própria no mesmo mês — não procura a conta da competência.
  const decisao = mensal ? decidirContaDaFolha(await contasDaCompetencia(categoria.id, competencia), competencia) : { escolhida: null, jaPaga: null, outras: [] };
  const compromisso = mensal ? await compromissoDaFolha(categoria.id, competencia) : null;

  let vencimento = hoje;
  if (mensal) {
    const cal = await calendarioFinanceiro(anosDoHorizonte(hoje, `${avancarCompetencia(competencia, 1)}-28`));
    vencimento = compromisso
      ? vencimentoDoCompromisso(compromisso, competencia, cal)
      : enesimoDiaUtil(avancarCompetencia(competencia, 1), DIA_UTIL_PADRAO, cal);
  }
  // Vínculo com a recorrência só quando o mês do compromisso está livre: o par (origem, competência) é
  // único no banco, e é ele que impede o gerador diário de criar a folha de novo.
  const vinculo = compromisso?.livre ? { recorrenciaOrigemId: compromisso.id, recorrenciaCompetencia: competencia } : {};
  const agora = new Date();

  // N5: com o mês fechado no Financeiro, a folha não grava valor na competência dele.
  if (!decisao.jaPaga) await exigirPeriodoAberto(prisma, [inicioDoMes(competencia)]);

  const gravado = await prisma.$transaction(async (tx) => {
    if (decisao.jaPaga) {
      await tx.folhaPagamento.update({
        where: { id: folha.id },
        data: { status: "fechada", fechadaEm: agora, lancamentoId: decisao.jaPaga.id, lancamentoReaproveitado: true, lancamentoValorPrevisto: paraReais(decisao.jaPaga.valor) },
      });
      return { acao: "ja_paga" as const, lancamentoId: decisao.jaPaga.id, vencimento: decisao.jaPaga.vencimento };
    }
    if (decisao.escolhida) {
      // Condicionado à situação lida: se alguém pagou ou cancelou a conta no meio, nada é sobrescrito.
      const r = await tx.lancamento.updateMany({
        where: { id: decisao.escolhida.id, status: "previsto", excluidoEm: null },
        data: {
          descricao,
          valor: liquido,
          dataCompetencia: inicioDoMes(competencia),
          ...(decisao.escolhida.recorrenciaCompetencia ? {} : vinculo),
        },
      });
      if (r.count !== 1) throw new ActionError("A conta a pagar da folha mudou enquanto a folha era fechada: tente de novo.");
      await tx.folhaPagamento.update({
        where: { id: folha.id },
        data: { status: "fechada", fechadaEm: agora, lancamentoId: decisao.escolhida.id, lancamentoReaproveitado: true, lancamentoValorPrevisto: paraReais(decisao.escolhida.valor) },
      });
      return { acao: "atualizou" as const, lancamentoId: decisao.escolhida.id, vencimento: decisao.escolhida.vencimento };
    }
    const lanc = await tx.lancamento.create({
      data: {
        tipo: "despesa",
        descricao,
        valor: liquido,
        status: "previsto",
        data: new Date(`${hoje}T00:00:00.000Z`),
        vencimento: new Date(`${vencimento}T00:00:00.000Z`),
        dataCompetencia: inicioDoMes(competencia),
        categoriaId: categoria.id,
        autorId,
        ...vinculo,
      },
      select: { id: true },
    });
    await tx.folhaPagamento.update({
      where: { id: folha.id },
      data: { status: "fechada", fechadaEm: agora, lancamentoId: lanc.id, lancamentoReaproveitado: false, lancamentoValorPrevisto: null },
    });
    return { acao: "criou" as const, lancamentoId: lanc.id, vencimento };
  });

  return { liquido, ...gravado, aviso: avisoDoFechamento(decisao, liquidoCent) };
}

/**
 * Reabre a folha para corrigir holerites. A conta a pagar NÃO é apagada nem revertida: continua sendo a
 * da competência, com o último valor, e o próximo fechamento a atualiza. Se ela já foi paga, reabrir é
 * recusado — editar a folha depois do dinheiro sair descasaria os dois.
 *
 * Reabrir também revoga as assinaturas: reabrir libera editar os itens de novo, e um holerite assinado
 * descreveria itens que podem não ser mais os gravados (ver `service.ts`).
 */
export async function reabrirFolhaNoBanco(folhaId: string): Promise<{ assinaturasRevogadas: number }> {
  const folha = await prisma.folhaPagamento.findUnique({ where: { id: folhaId } });
  if (!folha) throw new ActionError("Folha não encontrada.");
  if (folha.status !== "fechada") throw new ActionError("Folha não está fechada.");

  const conta = folha.lancamentoId
    ? await prisma.lancamento.findFirst({ where: { id: folha.lancamentoId, excluidoEm: null }, select: { status: true } })
    : null;
  const motivo = motivoParaNaoReabrir(conta);
  if (motivo) throw new ActionError(motivo);

  const assinaturasRevogadas = await prisma.$transaction(async (tx) => {
    await tx.folhaPagamento.update({
      where: { id: folhaId },
      data: { status: "aberta", fechadaEm: null, lancamentoId: null, lancamentoReaproveitado: false, lancamentoValorPrevisto: null },
    });
    const r = await tx.holerite.updateMany({
      where: { folhaId, assinadoEm: { not: null } },
      data: { assinadoEm: null, assinanteId: null },
    });
    return r.count;
  });
  return { assinaturasRevogadas };
}
