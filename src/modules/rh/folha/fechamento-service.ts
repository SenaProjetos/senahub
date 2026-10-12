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
 *
 * R4 do rateio (decisões 21 e 22): além do líquido CLT, o fechamento lança a bolsa dos estagiários, o
 * INSS e o IRRF descontados, o FGTS (guias no dia 20 do mês seguinte, antecipado ao dia útil anterior)
 * e os benefícios do mês. Cada parte fica ligada à folha por `FolhaLancamento`: fechar de novo atualiza
 * a mesma conta enquanto ela está em aberto; a parte que saiu do plano é cancelada, nunca apagada.
 * Reabrir pede motivo e guarda a versão assinada de cada holerite.
 */
import { acharCategoriaDoSistema, acharSubcategoriaDoSistema, mensagemCategoriaAusente } from "@/modules/financeiro/categorias-sistema";
import { Prisma } from "@/generated/prisma/client";
import type { ParteFolha } from "@/generated/prisma/enums";
import { exigirPeriodoAberto } from "@/modules/financeiro/fechamento/trava-service";
import { exigirOperacao, MOTIVO_MUDOU } from "@/modules/financeiro/lancamentos/situacao-service";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { diaDeSaoPaulo } from "@/lib/data";
import { diaUtilAnterior } from "@/lib/calendario-trabalho";
import { formatarCentavos, paraCentavos, paraReais } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { avancarCompetencia, calendarioDeSalario, enesimoDiaUtil, vencimentoDoCompromisso } from "@/modules/financeiro/recorrencia/calculo";
import { anosDoHorizonte, calendarioFinanceiro } from "@/modules/financeiro/recorrencia/queries";
import { rotuloFolha } from "@/modules/rh/folha/tipo-folha";
import { ehItemDaTaxaDoAgente, ehItemDeBeneficio, planoDaFolha, type LancamentoPlanejado } from "@/modules/rh/folha/lancamentos-da-folha";
import { custosDoMes } from "@/modules/rh/rateio/custo-hora/dados";
import {
  avisoDoFechamento,
  competenciaDaFolha,
  decidirContaDaFolha,
  folhaUsaContaDaCompetencia,
  motivoParaNaoReabrir,
  type ContaDaFolha,
  type DecisaoDaFolha,
} from "@/modules/rh/folha/quitacao";

/** O que o fechamento fez com a conta a pagar do líquido CLT. `sem_clt` = folha só de estagiários. */
export type AcaoNaConta = "atualizou" | "criou" | "ja_paga" | "sem_clt";

export type ResultadoFechamento = {
  liquido: number;
  acao: AcaoNaConta;
  /** Conta do líquido CLT; `null` quando a folha não tem CLT. */
  lancamentoId: string | null;
  /** Vencimento da conta do líquido (`YYYY-MM-DD`). */
  vencimento: string;
  /** Quantas contas a folha tem lançadas no Financeiro (líquido + partes). */
  contas: number;
  /** Frase para a tela: diferença entre previsto e real, o que ficou em aberto e o que não foi lançado. */
  aviso: string | null;
};

/** Dia do mês seguinte até onde uma conta de folha SEM vínculo é considerada da competência. */
const ULTIMO_DIA_DA_JANELA = 15;

/** Regra do dono quando não há compromisso recorrente da folha: 5º dia útil do mês seguinte. */
const DIA_UTIL_PADRAO = 5;

/** Guias (INSS, IRRF, FGTS): dia 20 do mês seguinte, antecipado ao dia útil anterior. */
const DIA_DAS_GUIAS = 20;

/** Mínimo de caracteres do motivo da reabertura. */
export const MOTIVO_MINIMO = 10;
export const MSG_MOTIVO_CURTO = `Descreva o motivo da reabertura (${MOTIVO_MINIMO} caracteres ou mais).`;

function inicioDoMes(comp: string): Date {
  return new Date(`${comp}-01T00:00:00.000Z`);
}

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Contas a pagar de folha CLT que podem ser desta competência: as VINCULADAS a ela pela recorrência e,
 * sem vínculo, as que vencem nos primeiros dias do mês seguinte (a folha de M é paga até o 5º dia útil
 * de M+1). Inclui as já pagas — a folha paga antes do fechamento não pode ganhar uma segunda conta.
 * Procura na categoria-mãe (contas antigas) E em Salários (R4); `ignorar` tira as partes da própria folha.
 * `excluidoEm: null` explícito: a extensão de exclusão lógica não cobre toda consulta.
 */
export async function contasDaCompetencia(categoriaIds: string[], competencia: string, ignorar: string[] = []): Promise<ContaDaFolha[]> {
  const proximo = avancarCompetencia(competencia, 1);
  const de = inicioDoMes(proximo);
  const ate = new Date(`${proximo}-${String(ULTIMO_DIA_DA_JANELA).padStart(2, "0")}T00:00:00.000Z`);
  const rows = await prisma.lancamento.findMany({
    where: {
      excluidoEm: null,
      tipo: "despesa",
      categoriaId: { in: categoriaIds },
      ...(ignorar.length > 0 ? { id: { notIn: ignorar } } : {}),
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

/** Categoria-mãe da folha CLT pela CHAVE — `codigo` é editável em Cadastros. */
async function categoriaDaFolha() {
  const id = await acharCategoriaDoSistema(prisma, "2.03");
  if (!id) throw new ActionError(mensagemCategoriaAusente("2.03"));
  return { id };
}

/** Categoria de uma parte: a subcategoria pela chave, com a mãe (2.03, ou 2.04 para a bolsa) de reserva. */
async function categoriaDaParte(chave: string): Promise<string> {
  const mae = chave.startsWith("despesa_estagio") ? "2.04" : "2.03";
  const id = await acharSubcategoriaDoSistema(prisma, chave, mae);
  if (!id) throw new ActionError(mensagemCategoriaAusente(mae));
  return id;
}

/**
 * O compromisso recorrente DA FOLHA nesta competência (não o adiantamento), quando há exatamente um e o
 * mês ainda está livre. É o que o fechamento usa para o vencimento e para gravar o vínculo.
 */
async function compromissoDaFolha(categoriaIds: string[], competencia: string) {
  const candidatos = await prisma.compromissoRecorrente.findMany({
    where: { categoriaId: { in: categoriaIds }, ativo: true, adiantamento: false, competenciaInicio: { lte: competencia } },
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

function liquidoEmCentavos(itens: readonly { tipo: string; valor: Prisma.Decimal }[]): number {
  let c = 0;
  for (const it of itens) c += (it.tipo === "provento" ? 1 : -1) * paraCentavos(it.valor);
  return c;
}

const centavosOuNulo = (v: Prisma.Decimal | null) => (v == null ? null : paraCentavos(v));

/**
 * Líquido separado por contratação (vínculo vigente no mês, `custosDoMes`), benefícios dos CLT
 * agrupados pelo nome e a taxa do agente de integração dos estagiários do IEL (a mesma do custo da
 * hora). A folha de 13º é toda CLT e não tem benefício nem taxa.
 */
async function composicaoDaFolha(folha: {
  ano: number;
  mes: number;
  tipo: "mensal" | "decimo_terceiro";
  holerites: { userId: string; itens: { tipo: string; valor: Prisma.Decimal }[] }[];
}) {
  if (folha.tipo !== "mensal") {
    return { liquidoCltCent: folha.holerites.reduce((s, h) => s + liquidoEmCentavos(h.itens), 0), liquidoEstagioCent: 0, beneficios: [], taxaAgenteCent: 0 };
  }
  const custos = await custosDoMes(folha.ano, folha.mes, folha.holerites.map((h) => h.userId));
  let liquidoCltCent = 0;
  let liquidoEstagioCent = 0;
  const beneficios = new Map<string, number>();
  let taxaAgenteCent = 0;
  for (const h of folha.holerites) {
    const c = custos.get(h.userId);
    const liquido = liquidoEmCentavos(h.itens);
    for (const it of c?.custo?.itens ?? []) if (ehItemDaTaxaDoAgente(it.chave)) taxaAgenteCent += it.cent;
    if (c?.contratacao === "estagio") {
      liquidoEstagioCent += liquido;
      continue;
    }
    liquidoCltCent += liquido;
    for (const it of c?.custo?.itens ?? []) {
      if (!ehItemDeBeneficio(it.chave)) continue;
      // Com dois vínculos no mês o rótulo ganha "(CLT)": o benefício é o mesmo, a conta também.
      const nome = it.chave.includes(":") ? it.rotulo.replace(/\s*\([^)]*\)$/, "") : it.rotulo;
      beneficios.set(nome, (beneficios.get(nome) ?? 0) + it.cent);
    }
  }
  return {
    liquidoCltCent,
    liquidoEstagioCent,
    taxaAgenteCent,
    beneficios: [...beneficios.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([nome, valorCent]) => ({ nome, valorCent })),
  };
}

type ParteGravada = { parte: ParteFolha; rotulo: string; lancamentoId: string };

/** O que fazer com cada parte, decidido antes da transação (as escritas são condicionadas mesmo assim). */
type AcaoDaParte =
  | { tipo: "atualizar"; plano: LancamentoPlanejado; lancamentoId: string }
  | { tipo: "criar"; plano: LancamentoPlanejado; linhaExistente: boolean }
  | { tipo: "ja_paga"; plano: LancamentoPlanejado; valorPagoCent: number; situacao: "paga" | "em_aprovacao" }
  | { tipo: "cancelar"; lancamentoId: string; descricao: string };

export async function fecharFolhaNoBanco(folhaId: string, autorId: string): Promise<ResultadoFechamento> {
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id: folhaId },
    include: { holerites: { include: { itens: true } } },
  });
  if (!folha) throw new ActionError("Folha não encontrada.");
  if (folha.status === "fechada") throw new ActionError("Folha já fechada.");
  if (folha.holerites.length === 0) throw new ActionError("Adicione holerites antes de fechar.");

  const comp = await composicaoDaFolha(folha);
  const liquidoCent = comp.liquidoCltCent + comp.liquidoEstagioCent;
  if (liquidoCent <= 0) throw new ActionError("Total líquido deve ser positivo.");

  const rotulo = rotuloFolha(folha);
  const plano = planoDaFolha({
    tipo: folha.tipo,
    rotuloFolha: rotulo,
    liquidoCltCent: comp.liquidoCltCent,
    liquidoEstagioCent: comp.liquidoEstagioCent,
    inssRetidoCent: centavosOuNulo(folha.totalInssRetido),
    irrfRetidoCent: centavosOuNulo(folha.totalIrrfRetido),
    fgtsCent: centavosOuNulo(folha.totalFgts),
    beneficios: comp.beneficios,
    taxaAgenteCent: comp.taxaAgenteCent,
  });
  const planoLiquido = plano.lancamentos.find((l) => l.parte === "liquido_clt") ?? null;
  const planoPartes = plano.lancamentos.filter((l) => l.parte !== "liquido_clt");

  const mae = await categoriaDaFolha();
  const salarios = await acharSubcategoriaDoSistema(prisma, "despesa_folha_salarios", "2.03");
  const categoriasDaFolha = [...new Set([mae.id, salarios ?? mae.id])];
  const competencia = competenciaDaFolha(folha);
  const hoje = diaDeSaoPaulo();
  const mensal = folhaUsaContaDaCompetencia(folha.tipo);
  const proximo = avancarCompetencia(competencia, 1);

  // Partes já lançadas por um fechamento anterior desta folha (a ligação sobrevive à reabertura).
  const linhas = await prisma.folhaLancamento.findMany({ where: { folhaId }, select: { parte: true, rotulo: true, lancamentoId: true } });
  const lancsDasPartes = await prisma.lancamento.findMany({
    where: { id: { in: linhas.map((l) => l.lancamentoId) }, excluidoEm: { not: undefined } },
    select: { id: true, status: true, excluidoEm: true, valor: true, valorEfetivo: true },
  });
  const lancPorId = new Map(lancsDasPartes.map((l) => [l.id, l]));
  const chaveParte = (p: { parte: string; rotulo: string }) => `${p.parte}|${p.rotulo}`;

  // Conta do líquido de um fechamento anterior desta folha (reabrir não desliga): em aberto, é ela que
  // recebe o valor novo — também no 13º, que não procura conta da competência e criaria outra.
  const anterior = folha.lancamentoId
    ? await prisma.lancamento.findUnique({
        where: { id: folha.lancamentoId },
        select: { id: true, status: true, excluidoEm: true, valor: true, vencimento: true, data: true, recorrenciaCompetencia: true },
      })
    : null;
  const anteriorAberto = anterior && !anterior.excluidoEm && anterior.status === "previsto" ? anterior : null;

  // 13º: outra despesa, com folha própria no mesmo mês — não procura a conta da competência.
  const decisao: DecisaoDaFolha =
    planoLiquido && anteriorAberto
      ? {
          escolhida: {
            id: anteriorAberto.id,
            valor: paraCentavos(anteriorAberto.valor),
            status: "previsto",
            vencimento: isoDeDataDoBanco(anteriorAberto.vencimento ?? anteriorAberto.data),
            recorrenciaCompetencia: anteriorAberto.recorrenciaCompetencia,
            adiantamento: false,
          },
          jaPaga: null,
          outras: [],
        }
      : mensal && planoLiquido
        ? decidirContaDaFolha(await contasDaCompetencia(categoriasDaFolha, competencia, linhas.map((l) => l.lancamentoId)), competencia)
        : { escolhida: null, jaPaga: null, outras: [] };
  const compromisso = mensal && planoLiquido ? await compromissoDaFolha(categoriasDaFolha, competencia) : null;

  const cal = await calendarioFinanceiro(anosDoHorizonte(hoje, `${proximo}-28`));
  let vencimento = hoje;
  if (mensal) {
    vencimento = compromisso
      ? vencimentoDoCompromisso({ ...compromisso, salario: true }, competencia, cal)
      : // Prazo do salário: o sábado conta como dia útil (CLT art. 459 §1º).
        enesimoDiaUtil(proximo, DIA_UTIL_PADRAO, calendarioDeSalario(cal));
  }
  const vencimentoDasGuias = diaUtilAnterior(`${proximo}-${DIA_DAS_GUIAS}`, cal);
  const vencimentoDasGuiasDoMes = diaUtilAnterior(`${competencia}-${DIA_DAS_GUIAS}`, cal);
  const vencimentoDe = (p: LancamentoPlanejado) =>
    p.vence === "dia20" ? vencimentoDasGuias : p.vence === "dia20_mesmo_mes" ? vencimentoDasGuiasDoMes : vencimento;

  const acoes: AcaoDaParte[] = [];
  const noPlano = new Set(planoPartes.map(chaveParte));
  for (const p of planoPartes) {
    const linha = linhas.find((l) => chaveParte(l) === chaveParte(p));
    const lanc = linha ? lancPorId.get(linha.lancamentoId) : undefined;
    if (!linha || !lanc || lanc.excluidoEm || lanc.status === "cancelado") {
      acoes.push({ tipo: "criar", plano: p, linhaExistente: !!linha });
    } else if (lanc.status === "previsto") {
      acoes.push({ tipo: "atualizar", plano: p, lancamentoId: lanc.id });
    } else {
      // Paga, ou aguardando aprovação no Financeiro (alguém mudou o valor lá): a folha não mexe.
      acoes.push({
        tipo: "ja_paga",
        plano: p,
        valorPagoCent: paraCentavos(lanc.status === "confirmado" ? (lanc.valorEfetivo ?? lanc.valor) : lanc.valor),
        situacao: lanc.status === "confirmado" ? "paga" : "em_aprovacao",
      });
    }
  }
  for (const l of linhas) {
    const lanc = lancPorId.get(l.lancamentoId);
    if (!noPlano.has(chaveParte(l)) && lanc && !lanc.excluidoEm && lanc.status === "previsto") {
      acoes.push({ tipo: "cancelar", lancamentoId: lanc.id, descricao: l.rotulo || l.parte });
    }
  }

  // Vínculo com a recorrência só quando o mês do compromisso está livre: o par (origem, competência) é
  // único no banco, e é ele que impede o gerador diário de criar a folha de novo.
  const vinculo = compromisso?.livre ? { recorrenciaOrigemId: compromisso.id, recorrenciaCompetencia: competencia } : {};
  const agora = new Date();

  // N5: com o mês fechado no Financeiro, a folha não grava valor na competência dele.
  const gravaLiquido = !!planoLiquido && !decisao.jaPaga;
  if (gravaLiquido || acoes.some((a) => a.tipo !== "ja_paga")) await exigirPeriodoAberto(prisma, [inicioDoMes(competencia)]);

  const categoriaPorChave = new Map<string, string>();
  for (const chave of new Set(plano.lancamentos.map((l) => l.chaveCategoria))) categoriaPorChave.set(chave, await categoriaDaParte(chave));

  const gravado = await prisma.$transaction(async (tx) => {
    // Trava da folha: o primeiro a passar daqui fecha; um segundo "Fechar" simultâneo espera o
    // primeiro terminar, não acha mais a folha aberta e desiste — sem isso nasceriam duas contas.
    const trava = await tx.folhaPagamento.updateMany({ where: { id: folha.id, status: "aberta" }, data: { status: "fechada", fechadaEm: agora } });
    if (trava.count !== 1) throw new ActionError("Folha já fechada.");
    // ---- Líquido CLT: a lógica do N0, agora em Salários (13º na subcategoria dele).
    let liquido: { acao: AcaoNaConta; lancamentoId: string | null; vencimento: string; reaproveitado: boolean; valorPrevisto: number | null };
    const avisosDoLiquido: string[] = [];
    if (!planoLiquido) {
      // A folha deixou de ter CLT depois de um fechamento: a conta do líquido daquele fechamento sai
      // (cancelada pela máquina de situações) — senão o caixa contaria um salário que não existe mais.
      if (anteriorAberto) {
        const { estado } = await exigirOperacao(tx, anteriorAberto.id, "cancelar");
        const r = await tx.lancamento.updateMany({ where: { id: anteriorAberto.id, status: estado.status, excluidoEm: null }, data: { status: "cancelado" } });
        if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
        await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: anteriorAberto.id, de: estado.status, para: "cancelado", autorId } });
        avisosDoLiquido.push("A folha não tem mais CLT: a conta do líquido do fechamento anterior foi cancelada.");
      }
      liquido = { acao: "sem_clt", lancamentoId: null, vencimento, reaproveitado: false, valorPrevisto: null };
    } else if (decisao.jaPaga) {
      liquido = { acao: "ja_paga", lancamentoId: decisao.jaPaga.id, vencimento: decisao.jaPaga.vencimento, reaproveitado: true, valorPrevisto: paraReais(decisao.jaPaga.valor) };
    } else if (decisao.escolhida) {
      // Condicionado à situação lida: se alguém pagou ou cancelou a conta no meio, nada é sobrescrito.
      const r = await tx.lancamento.updateMany({
        where: { id: decisao.escolhida.id, status: "previsto", excluidoEm: null },
        data: {
          descricao: planoLiquido.descricao,
          valor: paraReais(planoLiquido.valorCent),
          dataCompetencia: inicioDoMes(competencia),
          // A conta pode ter nascido na mãe (recorrência antiga, lançamento à mão): o líquido é Salários.
          categoriaId: categoriaPorChave.get(planoLiquido.chaveCategoria)!,
          ...(decisao.escolhida.recorrenciaCompetencia ? {} : vinculo),
        },
      });
      if (r.count !== 1) throw new ActionError("A conta a pagar da folha mudou enquanto a folha era fechada: tente de novo.");
      liquido = { acao: "atualizou", lancamentoId: decisao.escolhida.id, vencimento: decisao.escolhida.vencimento, reaproveitado: true, valorPrevisto: paraReais(decisao.escolhida.valor) };
    } else {
      const lanc = await tx.lancamento.create({
        data: {
          tipo: "despesa",
          descricao: planoLiquido.descricao,
          valor: paraReais(planoLiquido.valorCent),
          status: "previsto",
          data: dia(hoje),
          vencimento: dia(vencimento),
          dataCompetencia: inicioDoMes(competencia),
          categoriaId: categoriaPorChave.get(planoLiquido.chaveCategoria)!,
          autorId,
          ...vinculo,
        },
        select: { id: true },
      });
      liquido = { acao: "criou", lancamentoId: lanc.id, vencimento, reaproveitado: false, valorPrevisto: null };
    }

    // ---- Demais partes (bolsa, guias, benefícios), ligadas à folha por FolhaLancamento.
    const avisos: string[] = [...avisosDoLiquido];
    const partes: ParteGravada[] = [];
    for (const a of acoes) {
      if (a.tipo === "cancelar") {
        // Saiu do plano (ex.: o FGTS foi apagado da folha): cancela pela máquina de situações, nunca apaga.
        const { estado } = await exigirOperacao(tx, a.lancamentoId, "cancelar");
        const r = await tx.lancamento.updateMany({ where: { id: a.lancamentoId, status: estado.status, excluidoEm: null }, data: { status: "cancelado" } });
        if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
        await tx.lancamentoStatusHistorico.create({ data: { lancamentoId: a.lancamentoId, de: estado.status, para: "cancelado", autorId } });
        continue;
      }
      const p = a.plano;
      const dados = {
        descricao: p.descricao,
        valor: paraReais(p.valorCent),
        vencimento: dia(vencimentoDe(p)),
        dataCompetencia: inicioDoMes(competencia),
        categoriaId: categoriaPorChave.get(p.chaveCategoria)!,
      };
      if (a.tipo === "atualizar") {
        const r = await tx.lancamento.updateMany({ where: { id: a.lancamentoId, status: "previsto", excluidoEm: null }, data: dados });
        if (r.count !== 1) throw new ActionError("Uma conta a pagar da folha mudou enquanto a folha era fechada: tente de novo.");
        partes.push({ parte: p.parte as ParteFolha, rotulo: p.rotulo, lancamentoId: a.lancamentoId });
      } else if (a.tipo === "ja_paga") {
        if (a.situacao === "em_aprovacao") {
          avisos.push(`${p.descricao}: está aguardando aprovação no Financeiro (${formatarCentavos(a.valorPagoCent)}); o valor da folha (${formatarCentavos(p.valorCent)}) não foi aplicado.`);
        } else if (a.valorPagoCent !== p.valorCent) {
          avisos.push(`${p.descricao}: já estava paga (${formatarCentavos(a.valorPagoCent)}); o valor novo (${formatarCentavos(p.valorCent)}) não foi aplicado.`);
        }
      } else {
        const lanc = await tx.lancamento.create({
          data: { tipo: "despesa", status: "previsto", data: dia(hoje), autorId, ...dados },
          select: { id: true },
        });
        const chave = { folhaId_parte_rotulo: { folhaId, parte: p.parte as ParteFolha, rotulo: p.rotulo } };
        if (a.linhaExistente) await tx.folhaLancamento.update({ where: chave, data: { lancamentoId: lanc.id } });
        else await tx.folhaLancamento.create({ data: { folhaId, parte: p.parte as ParteFolha, rotulo: p.rotulo, lancamentoId: lanc.id } });
        partes.push({ parte: p.parte as ParteFolha, rotulo: p.rotulo, lancamentoId: lanc.id });
      }
    }

    await tx.folhaPagamento.update({
      where: { id: folha.id },
      data: {
        status: "fechada",
        fechadaEm: agora,
        lancamentoId: liquido.lancamentoId,
        lancamentoReaproveitado: liquido.reaproveitado,
        lancamentoValorPrevisto: liquido.valorPrevisto,
      },
    });
    const contas = (liquido.lancamentoId ? 1 : 0) + partes.length + acoes.filter((x) => x.tipo === "ja_paga").length;
    return { acao: liquido.acao, lancamentoId: liquido.lancamentoId, vencimento: liquido.vencimento, contas, avisos };
  });

  const avisoLiquido = planoLiquido ? avisoDoFechamento(decisao, planoLiquido.valorCent) : null;
  const aviso = [avisoLiquido, ...plano.avisos, ...gravado.avisos].filter(Boolean).join(" ") || null;
  return {
    liquido: paraReais(liquidoCent),
    acao: gravado.acao,
    lancamentoId: gravado.lancamentoId,
    vencimento: gravado.vencimento,
    contas: gravado.contas,
    aviso,
  };
}

/**
 * Reabre a folha para corrigir holerites, com motivo (R4). As contas a pagar NÃO são apagadas nem
 * revertidas: continuam sendo as da competência, com o último valor, e o próximo fechamento as
 * atualiza. Se o líquido ou QUALQUER parte já foi paga, reabrir é recusado — editar a folha depois do
 * dinheiro sair descasaria os dois.
 *
 * Reabrir revoga as assinaturas (os itens podem mudar), mas antes guarda em `HoleriteVersao` o que cada
 * pessoa assinou — a assinatura é prova e não pode sumir.
 */
export async function reabrirFolhaNoBanco(folhaId: string, motivo: string, autorId: string | null): Promise<{ assinaturasRevogadas: number }> {
  const texto = motivo.trim();
  if (texto.length < MOTIVO_MINIMO) throw new ActionError(MSG_MOTIVO_CURTO);
  const assinaturasRevogadas = await prisma.$transaction(async (tx) => {
    // Trava primeiro (o mesmo par de "Reabrir" ao mesmo tempo grava uma reabertura só), depois a
    // conferência de pagamento já dentro da transação.
    const folha = await tx.folhaPagamento.findUnique({ where: { id: folhaId }, include: { partes: { select: { lancamentoId: true } } } });
    if (!folha) throw new ActionError("Folha não encontrada.");
    const trava = await tx.folhaPagamento.updateMany({
      where: { id: folhaId, status: "fechada" },
      // `lancamentoId` FICA: o próximo fechamento atualiza essa mesma conta (ou a cancela, se a folha
      // perder os CLT) em vez de procurar de novo e criar outra.
      data: { status: "aberta", fechadaEm: null },
    });
    if (trava.count !== 1) throw new ActionError("Folha não está fechada.");
    const ids = [...(folha.lancamentoId ? [folha.lancamentoId] : []), ...folha.partes.map((p) => p.lancamentoId)];
    const paga = await tx.lancamento.findFirst({ where: { id: { in: ids }, excluidoEm: null, status: "confirmado" }, select: { status: true } });
    const recusa = motivoParaNaoReabrir(paga);
    if (recusa) throw new ActionError(recusa);

    const assinados = await tx.holerite.findMany({
      where: { folhaId, assinadoEm: { not: null } },
      select: { id: true, assinadoEm: true, assinanteId: true, itens: { select: { descricao: true, tipo: true, valor: true } } },
    });
    for (const h of assinados) {
      await tx.holeriteVersao.create({
        data: {
          holeriteId: h.id,
          itens: h.itens.map((i) => ({ descricao: i.descricao, tipo: i.tipo, valor: Number(i.valor) })),
          assinadoEm: h.assinadoEm!,
          assinanteId: h.assinanteId,
          motivo: texto,
        },
      });
    }
    await tx.folhaReabertura.create({ data: { folhaId, motivo: texto, autorId } });
    const r = await tx.holerite.updateMany({
      where: { folhaId, assinadoEm: { not: null } },
      data: { assinadoEm: null, assinanteId: null },
    });
    return r.count;
  });
  return { assinaturasRevogadas };
}
