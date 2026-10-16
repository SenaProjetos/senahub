import "server-only";

/**
 * I/O da integração contábil (M5). Quem decide é puro: `plano.ts` (o que a importação muda) e
 * `partidas.ts` (as linhas do arquivo). Aqui: carregar o mês e o de-para, gravar o plano e o de-para,
 * e registrar a exportação. Separado das actions para o script de importação e o smoke usarem sem sessão.
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { utcFimDoDia, utcInicioDoDia } from "@/lib/data";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { idsContasDeInvestimento } from "@/modules/financeiro/investimentos/service";
import { mesesFechados } from "@/modules/financeiro/fechamento/trava-service";
import { planejarImportacao, type ContaDoPlano, type PlanoDaImportacao } from "@/modules/financeiro/contabil/plano";
import { linhasSemConta, MOTIVO_ALTERDATA_SEM_CONTA, type FormatoContabil, type LinhaExportada } from "@/modules/financeiro/contabil/arquivo";
import { gerarPartidas, type DeParaDoMotor, type LancamentoContabil, type ResumoContabil, type StatusContabil } from "@/modules/financeiro/contabil/partidas";

type Db = Prisma.TransactionClient | typeof prisma;

export const MOTIVO_MES_ABERTO = "Só meses fechados exportam, para o arquivo bater com o que o contador já recebeu. Feche o mês em Fechamento mensal.";
export const MOTIVO_CONTA_FORA_DO_PLANO = "Essa conta não está no plano do contador.";
export const MOTIVO_CONTA_SINTETICA = "Escolha uma conta analítica: conta sintética (grupo) não recebe lançamento.";
export const MOTIVO_CONTA_INATIVA = "Essa conta saiu do plano do contador. Escolha outra.";

/** Aplica o plano lido (`lerPlanoCsv`) numa transação: cria, altera, desativa. Nunca apaga conta. */
export async function importarPlanoNoBanco(contas: readonly ContaDoPlano[]): Promise<Omit<PlanoDaImportacao, "criar" | "alterar"> & { criadas: number; alteradas: number }> {
  return prisma.$transaction(async (tx) => {
    const existentes = await tx.contaContabil.findMany({
      select: { reduzido: true, classificacao: true, nome: true, analitica: true, natureza: true, aceitaCentroCusto: true, ativa: true },
    });
    const plano = planejarImportacao(
      existentes.map((e) => ({ ...e, natureza: e.natureza as ContaDoPlano["natureza"] })),
      contas,
    );
    for (const c of plano.criar) await tx.contaContabil.create({ data: { ...c, ativa: true } });
    for (const c of plano.alterar) await tx.contaContabil.update({ where: { reduzido: c.reduzido }, data: { ...c, ativa: true } });
    if (plano.desativar.length) await tx.contaContabil.updateMany({ where: { reduzido: { in: plano.desativar } }, data: { ativa: false } });
    return { criadas: plano.criar.length, alteradas: plano.alterar.length, desativar: plano.desativar, iguais: plano.iguais };
  });
}

/** Recusa conta que não pode receber lançamento. */
export async function exigirContaLancavel(db: Db, reduzido: number): Promise<void> {
  const c = await db.contaContabil.findUnique({ where: { reduzido }, select: { analitica: true, ativa: true } });
  if (!c) throw new ActionError(MOTIVO_CONTA_FORA_DO_PLANO);
  if (!c.analitica) throw new ActionError(MOTIVO_CONTA_SINTETICA);
  if (!c.ativa) throw new ActionError(MOTIVO_CONTA_INATIVA);
}

export type AlvoEditavel = "categoria" | "conta_bancaria";

/** Liga um alvo a uma conta do plano. Na categoria, escolher conta tira o "não exportar". */
export async function definirContaNoBanco(alvo: AlvoEditavel, alvoId: string, reduzido: number): Promise<void> {
  await exigirContaLancavel(prisma, reduzido);
  await prisma.deParaContabil.upsert({
    where: { alvo_alvoId: { alvo, alvoId } },
    create: { alvo, alvoId, contaReduzido: reduzido, naoExportar: false },
    update: { contaReduzido: reduzido, naoExportar: false },
  });
}

/** "Limpar conta": tira a linha — a categoria volta a herdar da mãe (ou fica sem conta). */
export async function limparContaNoBanco(alvo: AlvoEditavel, alvoId: string): Promise<void> {
  await prisma.deParaContabil.deleteMany({ where: { alvo, alvoId } });
}

/** Mês `YYYY-MM` → limites UTC dos dias (colunas `@db.Date`). */
function limitesDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return { de: utcInicioDoDia(ano, m - 1), ate: utcFimDoDia(ano, m, 0) };
}

/** Carrega o de-para inteiro no formato do motor. */
export async function deParaDoMotor(db: Db = prisma): Promise<DeParaDoMotor> {
  // Um de cada vez: `db` pode ser uma transação (uma conexão só).
  const linhas = await db.deParaContabil.findMany();
  const categorias = await db.categoriaFinanceira.findMany({ select: { id: true, paiId: true } });
  const invest = await idsContasDeInvestimento(db);
  const porAlvo: Record<"categoria" | "contaBancaria" | "cartao" | "cliente" | "fornecedor" | "contrapartidaDaCategoria", Record<string, number>> = {
    categoria: {},
    contaBancaria: {},
    cartao: {},
    cliente: {},
    fornecedor: {},
    contrapartidaDaCategoria: {},
  };
  // O código do de-para (quando o contador definir) vale; sem ele, sai o nome do centro e o código do projeto no SenaHub.
  const centros: Record<"centro" | "projeto", Record<string, string>> = { centro: {}, projeto: {} };
  for (const c of await db.centroCusto.findMany({ select: { id: true, nome: true } })) centros.centro[c.id] = c.nome;
  for (const p of await db.projeto.findMany({ select: { id: true, codigo: true } })) centros.projeto[p.id] = p.codigo;
  const naoExportar = new Set<string>();
  let padraoClientes: number | null = null;
  let padraoFornecedores: number | null = null;
  for (const l of linhas) {
    if (l.alvo === "categoria" && l.naoExportar) naoExportar.add(l.alvoId);
    if (l.alvo === "centro" || l.alvo === "projeto") {
      if (l.codigoCentro) centros[l.alvo][l.alvoId] = l.codigoCentro;
      continue;
    }
    if (l.contaReduzido == null) continue;
    if (l.alvo === "categoria") porAlvo.categoria[l.alvoId] = l.contaReduzido;
    else if (l.alvo === "conta_bancaria") porAlvo.contaBancaria[l.alvoId] = l.contaReduzido;
    else if (l.alvo === "cartao" || l.alvo === "cliente" || l.alvo === "fornecedor") porAlvo[l.alvo][l.alvoId] = l.contaReduzido;
    else if (l.alvo === "categoria_contrapartida") porAlvo.contrapartidaDaCategoria[l.alvoId] = l.contaReduzido;
    else if (l.alvo === "padrao" && l.alvoId === "clientes") padraoClientes = l.contaReduzido;
    else if (l.alvo === "padrao" && l.alvoId === "fornecedores") padraoFornecedores = l.contaReduzido;
    // imposto_recolher / imposto_compensar: entram com as retenções (fase C4).
  }
  return {
    paiDaCategoria: Object.fromEntries(categorias.map((c) => [c.id, c.paiId])),
    ...porAlvo,
    ...centros,
    naoExportar,
    padraoClientes,
    padraoFornecedores,
    contasDeInvestimento: new Set(invest),
  };
}

/**
 * Lançamentos que podem gerar partida no mês: competência no mês (para o reconhecimento) OU pagos no mês
 * (para a baixa). Os dois pares de uma transferência vêm juntos (as duas pernas são pagas no mesmo dia).
 */
export async function lancamentosDoMes(mes: string, db: Db = prisma): Promise<LancamentoContabil[]> {
  const { de, ate } = limitesDoMes(mes);
  const ls = await db.lancamento.findMany({
    where: {
      status: { in: ["previsto", "aguardando_aprovacao", "confirmado"] },
      OR: [
        { dataCompetencia: { gte: de, lte: ate } },
        { dataCompetencia: null, data: { gte: de, lte: ate } },
        { status: "confirmado", dataConfirmacao: { gte: de, lte: ate } },
      ],
    },
    // natureza-ok: a contabilidade recebe tudo — transferência vira partida entre bancos, fora do resultado também.
    select: {
      id: true,
      tipo: true,
      status: true,
      descricao: true,
      valor: true,
      valorEfetivo: true,
      data: true,
      dataCompetencia: true,
      dataConfirmacao: true,
      categoriaId: true,
      contaId: true,
      clienteId: true,
      fornecedorId: true,
      cliente: { select: { nome: true } },
      fornecedor: { select: { nome: true } },
      cartaoId: true,
      faturaId: true,
      cartao: { select: { nome: true } },
      fatura: { select: { competencia: true } },
      transferenciaId: true,
      acessorioDeId: true,
      restanteDeId: true,
      numeroDocumento: true,
      chaveNfe: true,
      centroId: true,
      projetoId: true,
      rateios: { select: { centroId: true, projetoId: true, percentualBp: true }, orderBy: { id: "asc" } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return ls.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    status: l.status as StatusContabil,
    descricao: l.descricao,
    valorCentavos: paraCentavos(l.valor),
    pagoCentavos: paraCentavos(l.valorEfetivo ?? l.valor),
    competencia: isoDeDataDoBanco(l.dataCompetencia ?? l.data),
    pagamento: l.dataConfirmacao ? isoDeDataDoBanco(l.dataConfirmacao) : null,
    categoriaId: l.categoriaId,
    contaId: l.contaId,
    clienteId: l.clienteId,
    fornecedorId: l.fornecedorId,
    contatoNome: l.cliente?.nome ?? l.fornecedor?.nome ?? null,
    cartaoId: l.cartaoId,
    faturaId: l.faturaId,
    faturaRotulo: l.cartao && l.fatura ? `Fatura ${l.cartao.nome} ${l.fatura.competencia}` : null,
    transferenciaId: l.transferenciaId,
    acessorioDeId: l.acessorioDeId,
    restanteDeId: l.restanteDeId,
    numeroDocumento: l.numeroDocumento,
    chaveNfe: l.chaveNfe,
    centroId: l.centroId,
    projetoId: l.projetoId,
    rateio: l.rateios,
  }));
}

/** Resumo do mês como vai ao arquivo: as linhas com a classificação de cada conta. */
export type ResumoExportavel = Omit<ResumoContabil, "linhas"> & { linhas: LinhaExportada[] };

/**
 * As partidas do mês, como o arquivo sairia agora. Só lê. A conta no arquivo é a CLASSIFICAÇÃO do plano do contador; o motor
 * trabalha em código reduzido (chave única) e aqui cada reduzido ganha a sua classificação.
 */
export async function partidasDoMes(mes: string, db: Db = prisma): Promise<ResumoExportavel> {
  const ls = await lancamentosDoMes(mes, db);
  const dp = await deParaDoMotor(db);
  const r = gerarPartidas(mes, ls, dp);
  const plano = await db.contaContabil.findMany({ select: { reduzido: true, classificacao: true } });
  const classificacaoDe = new Map(plano.map((c) => [c.reduzido, c.classificacao]));
  const linhas: LinhaExportada[] = r.linhas.map((l) => ({
    ...l,
    debitoClassificacao: l.debito != null ? (classificacaoDe.get(l.debito) ?? null) : null,
    creditoClassificacao: l.credito != null ? (classificacaoDe.get(l.credito) ?? null) : null,
  }));
  return { ...r, linhas };
}

export const hashDasLinhas = (linhas: unknown) => createHash("sha256").update(JSON.stringify(linhas)).digest("hex");


/** Registra a exportação de um mês FECHADO, exatamente como sai no arquivo. Devolve o id para baixar. */
export async function registrarExportacaoNoBanco(mes: string, formato: FormatoContabil, autorId: string): Promise<{ id: string; linhas: number; pendencias: number }> {
  if (!(await mesesFechados()).has(mes)) throw new ActionError(MOTIVO_MES_ABERTO);
  const r = await partidasDoMes(mes);
  // O layout do contador não aceita conta em branco: a tela já desabilita o botão, mas quem barra é o servidor.
  if (formato === "alterdata") {
    const faltam = linhasSemConta(r.linhas);
    if (faltam > 0) throw new ActionError(MOTIVO_ALTERDATA_SEM_CONTA(faltam));
  }
  const e = await prisma.exportacaoContabil.create({
    data: {
      competencia: mes,
      formato,
      linhas: r.linhas,
      hash: hashDasLinhas(r.linhas),
      totalCentavos: BigInt(r.totalCentavos),
      pendencias: r.pendencias.length,
      geradoPorId: autorId,
    },
    select: { id: true },
  });
  return { id: e.id, linhas: r.linhas.length, pendencias: r.pendencias.length };
}
