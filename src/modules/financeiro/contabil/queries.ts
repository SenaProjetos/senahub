import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { mesesFechados } from "@/modules/financeiro/fechamento/trava-service";
import { rotuloDoMes } from "@/modules/financeiro/fechamento/trava";
import { partidasDoMes } from "@/modules/financeiro/contabil/service";
import type { AlvoPendencia } from "@/modules/financeiro/contabil/partidas";
import type { LinhaExportada } from "@/modules/financeiro/contabil/arquivo";
import { IMPOSTOS_RETIDOS, ROTULO_IMPOSTO, type ImpostoRetido } from "@/modules/financeiro/lancamentos/retencoes";

export type ContaDoPlanoDto = { reduzido: number; classificacao: string; nome: string };

export type CategoriaContabilDto = {
  id: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
  natureza: "resultado" | "fora_do_resultado" | "transferencia";
  /** Conta escolhida para ESTA categoria (linha própria). */
  propria: number | null;
  naoExportar: boolean;
  /** Conta que vale: a própria ou a herdada da mãe mais próxima. */
  efetiva: number | null;
  /** Nome da mãe de quem herdou (quando não tem própria). */
  herdadaDe: string | null;
  /** Tem filhas: sem conta própria, cada filha usa a sua — só falta se algum lançamento do mês usa o grupo. */
  grupo: boolean;
  /** Algum lançamento do mês ficou sem conta por causa desta categoria. */
  pendente: boolean;
};

export type ContaBancariaContabilDto = { id: string; nome: string; investimento: boolean; conta: number | null };

export type PendenciaDto = { alvo: AlvoPendencia; rotulo: string; lancamentos: number };

/** C4: um imposto retido no de-para — `imposto` é o alvoId (`iss`, `irrf`…). */
export type ImpostoContabilDto = { alvo: "imposto_recolher" | "imposto_compensar"; imposto: ImpostoRetido; rotulo: string; conta: number | null };

export type TelaContabil = {
  mes: string;
  rotuloMes: string;
  mesFechado: boolean;
  /** Meses fechados (mais recente primeiro) + o mês em foco se não estiver entre eles. */
  meses: { mes: string; rotulo: string; fechado: boolean }[];
  plano: ContaDoPlanoDto[];
  /** Todo o plano (inclusive sintéticas e inativas) para mostrar o nome de qualquer reduzido. */
  nomes: Record<number, string>;
  planoImportado: boolean;
  categorias: CategoriaContabilDto[];
  contasBancarias: ContaBancariaContabilDto[];
  impostos: ImpostoContabilDto[];
  linhas: LinhaExportada[];
  totalCentavos: number;
  pendencias: PendenciaDto[];
  fora: { naoExportar: number; aguardandoAprovacao: number };
};

function mesAnterior(hoje: string): string {
  const [a, m] = hoje.slice(0, 7).split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** Tudo da tela "Integração contábil" para um mês (padrão: o último fechado, senão o mês anterior). */
export async function telaContabil(mesPedido?: string): Promise<TelaContabil> {
  const fechados = [...(await mesesFechados())].sort().reverse();
  const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : (fechados[0] ?? mesAnterior(diaDeSaoPaulo()));

  const contas = await prisma.contaContabil.findMany({ orderBy: [{ classificacao: "asc" }, { reduzido: "asc" }] });
  const deParas = await prisma.deParaContabil.findMany({ where: { alvo: { in: ["categoria", "conta_bancaria", "imposto_recolher", "imposto_compensar"] } } });
  const categorias = await prisma.categoriaFinanceira.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, nome: true, tipo: true, natureza: true, paiId: true },
    orderBy: [{ codigo: "asc" }],
  });
  const bancos = await prisma.contaBancaria.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, investimento: { select: { id: true } } },
    orderBy: [{ padrao: "desc" }, { ordem: "asc" }, { nome: "asc" }],
  });
  const cartoes = await prisma.cartaoCredito.findMany({ select: { id: true, nome: true } });
  const resumo = await partidasDoMes(mes);

  const daCategoria = new Map(deParas.filter((d) => d.alvo === "categoria").map((d) => [d.alvoId, d]));
  const doBanco = new Map(deParas.filter((d) => d.alvo === "conta_bancaria").map((d) => [d.alvoId, d.contaReduzido]));
  const porId = new Map(categorias.map((c) => [c.id, c]));
  // Mãe inativa também conta na herança: busca a cadeia inteira.
  const todasCategorias = new Map((await prisma.categoriaFinanceira.findMany({ select: { id: true, nome: true, codigo: true, paiId: true } })).map((c) => [c.id, c]));

  const comFilhas = new Set([...todasCategorias.values()].map((c) => c.paiId).filter((x): x is string => x != null));
  const pendentes = new Set(resumo.pendencias.filter((p) => p.alvo === "categoria").map((p) => p.alvoId));
  const categoriasDto: CategoriaContabilDto[] = categorias.map((c) => {
    const propria = daCategoria.get(c.id);
    let efetiva = propria?.contaReduzido ?? null;
    let herdadaDe: string | null = null;
    let naoExportar = propria?.naoExportar ?? false;
    if (efetiva == null && !naoExportar) {
      const vistos = new Set([c.id]);
      for (let pai = todasCategorias.get(c.id)?.paiId ?? null; pai && !vistos.has(pai); pai = todasCategorias.get(pai)?.paiId ?? null) {
        vistos.add(pai);
        const d = daCategoria.get(pai);
        if (d?.naoExportar) {
          naoExportar = true;
          herdadaDe = `${todasCategorias.get(pai)?.codigo ?? ""} ${todasCategorias.get(pai)?.nome ?? ""}`.trim();
          break;
        }
        if (d?.contaReduzido != null) {
          efetiva = d.contaReduzido;
          herdadaDe = `${todasCategorias.get(pai)?.codigo ?? ""} ${todasCategorias.get(pai)?.nome ?? ""}`.trim();
          break;
        }
      }
    }
    return {
      id: c.id,
      codigo: c.codigo,
      nome: c.nome,
      tipo: c.tipo,
      natureza: c.natureza,
      propria: propria?.contaReduzido ?? null,
      naoExportar,
      efetiva,
      herdadaDe,
      grupo: comFilhas.has(c.id),
      pendente: pendentes.has(c.id),
    };
  });

  const nomes = Object.fromEntries(contas.map((c) => [c.reduzido, `${c.classificacao} ${c.nome}`]));
  const rotuloPendencia = (alvo: AlvoPendencia, alvoId: string): string => {
    switch (alvo) {
      case "categoria": {
        const c = porId.get(alvoId) ?? todasCategorias.get(alvoId);
        return c ? `Categoria ${c.codigo} ${c.nome} sem conta contábil` : "Categoria sem conta contábil";
      }
      case "contrapartida":
        return "Categoria sem contrapartida";
      case "conta_bancaria":
        return `Conta bancária ${bancos.find((b) => b.id === alvoId)?.nome ?? "inativa"} sem conta contábil`;
      case "cartao":
        return `Cartão ${cartoes.find((x) => x.id === alvoId)?.nome ?? ""} sem conta contábil (falta no plano do contador)`;
      case "padrao":
        return alvoId === "clientes" ? "Falta a conta de Clientes Diversos" : "Falta a conta de Fornecedores Diversos";
      case "sem_conta":
        return "Pago sem conta bancária no lançamento";
      case "transferencia":
        return "Transferência sem a perna de entrada";
      case "imposto_recolher":
        return `${ROTULO_IMPOSTO[alvoId as ImpostoRetido] ?? alvoId} retido a recolher sem conta contábil`;
      case "imposto_compensar":
        return `${ROTULO_IMPOSTO[alvoId as ImpostoRetido] ?? alvoId} retido pelo cliente (a compensar) sem conta contábil`;
    }
  };

  // C4: a recolher, todos os impostos; a compensar, o que o cliente costuma reter de quem é do Simples (ISS e INSS)
  // e qualquer outro que já tenha conta ou apareça no mês.
  const doImposto = (alvo: ImpostoContabilDto["alvo"], imposto: string) =>
    deParas.find((d) => d.alvo === alvo && d.alvoId === imposto)?.contaReduzido ?? null;
  const usadosACompensar = new Set(resumo.pendencias.filter((p) => p.alvo === "imposto_compensar").map((p) => p.alvoId));
  const impostos: ImpostoContabilDto[] = [
    ...IMPOSTOS_RETIDOS.map((i) => ({ alvo: "imposto_recolher" as const, imposto: i, rotulo: `${ROTULO_IMPOSTO[i]} retido`, conta: doImposto("imposto_recolher", i) })),
    ...IMPOSTOS_RETIDOS.filter((i) => i === "iss" || i === "inss" || usadosACompensar.has(i) || doImposto("imposto_compensar", i) != null).map((i) => ({
      alvo: "imposto_compensar" as const,
      imposto: i,
      rotulo: `${ROTULO_IMPOSTO[i]} retido pelo cliente`,
      conta: doImposto("imposto_compensar", i),
    })),
  ];
  // Pendências do mesmo tipo sem nome próprio (pago sem conta) somam numa linha só.
  const agrupadas = new Map<string, PendenciaDto>();
  for (const p of resumo.pendencias) {
    const rotulo = rotuloPendencia(p.alvo, p.alvoId);
    const atual = agrupadas.get(rotulo);
    if (atual) atual.lancamentos += p.lancamentos;
    else agrupadas.set(rotulo, { alvo: p.alvo, rotulo, lancamentos: p.lancamentos });
  }

  const meses = fechados.map((m) => ({ mes: m, rotulo: rotuloDoMes(m), fechado: true }));
  if (!fechados.includes(mes)) meses.unshift({ mes, rotulo: rotuloDoMes(mes), fechado: false });

  return {
    mes,
    rotuloMes: rotuloDoMes(mes),
    mesFechado: fechados.includes(mes),
    meses,
    plano: contas.filter((c) => c.analitica && c.ativa).map((c) => ({ reduzido: c.reduzido, classificacao: c.classificacao, nome: c.nome })),
    nomes,
    planoImportado: contas.length > 0,
    categorias: categoriasDto,
    contasBancarias: bancos.map((b) => ({ id: b.id, nome: b.nome, investimento: b.investimento != null, conta: doBanco.get(b.id) ?? null })),
    impostos,
    linhas: resumo.linhas,
    totalCentavos: resumo.totalCentavos,
    pendencias: [...agrupadas.values()],
    fora: { naoExportar: resumo.fora.naoExportar, aguardandoAprovacao: resumo.fora.aguardandoAprovacao },
  };
}
