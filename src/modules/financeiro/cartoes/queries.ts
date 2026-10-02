import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import {
  cicloDaCompetencia,
  cicloDaCompra,
  situacaoDaFatura,
  type Competencia,
  type Dia,
  type SituacaoFatura,
} from "@/modules/financeiro/cartoes/ciclo";

const dia = (d: Date | null) => (d ? (d.toISOString().slice(0, 10) as Dia) : null);

export type CartaoDto = {
  id: string;
  nome: string;
  ultimosDigitos: string | null;
  tipo: "empresa" | "pessoal";
  socioNome: string | null;
  limiteCentavos: number | null;
  diaFechamento: number;
  diaVencimento: number;
  contaPadraoId: string | null;
  ativo: boolean;
  /** Fatura em curso pela data de hoje (pode nem existir no banco ainda). */
  competenciaAberta: Competencia;
  abertaCentavos: number;
  /** Tudo o que já fechou e ainda não foi pago. */
  fechadaCentavos: number;
  /** Soma das compras já pagas no ano corrente — "Reembolsado em 2026" no cartão pessoal. */
  pagoNoAnoCentavos: number;
};

export type FaturaDto = {
  id: string;
  competencia: Competencia;
  inicioCiclo: Dia;
  fimCiclo: Dia;
  vencimento: Dia;
  situacao: SituacaoFatura;
  totalCentavos: number;
  emAbertoCentavos: number;
  compras: number;
  comprasEmAberto: number;
  ultimoPagamento: Dia | null;
};

export type CompraDto = {
  id: string;
  data: Dia;
  descricao: string;
  valorCentavos: number;
  categoria: string;
  projeto: string | null;
  centro: string | null;
  paga: boolean;
  dataPagamento: Dia | null;
  /** Parcela "2/3" quando a compra foi parcelada. */
  parcela: string | null;
  /** Para o item "Criar regra a partir desta compra". */
  temCategoria: boolean;
};

const SELECT_COMPRA = {
  id: true,
  data: true,
  descricao: true,
  valor: true,
  status: true,
  dataConfirmacao: true,
  categoriaId: true,
  categoria: { select: { codigo: true, nome: true } },
  projeto: { select: { codigo: true, nome: true } },
  centro: { select: { nome: true } },
} as const;

const PARCELA = /\((\d+)\/(\d+)\)\s*$/;

function paraCompra(l: {
  id: string;
  data: Date;
  descricao: string;
  valor: unknown;
  status: string;
  dataConfirmacao: Date | null;
  categoriaId: string;
  categoria: { codigo: string; nome: string } | null;
  projeto: { codigo: string; nome: string } | null;
  centro: { nome: string } | null;
}): CompraDto {
  const m = PARCELA.exec(l.descricao);
  return {
    id: l.id,
    data: dia(l.data)!,
    descricao: l.descricao,
    valorCentavos: paraCentavos(l.valor as number),
    categoria: l.categoria ? `${l.categoria.codigo} ${l.categoria.nome}` : "Sem categoria",
    projeto: l.projeto ? `${l.projeto.codigo} · ${l.projeto.nome}` : null,
    centro: l.centro?.nome ?? null,
    paga: l.status === "confirmado",
    dataPagamento: dia(l.dataConfirmacao),
    parcela: m ? `${m[1]}/${m[2]}` : null,
    temCategoria: !!l.categoriaId,
  };
}

/** Cartões com os números dos cards (fatura aberta, fechada a pagar e pago no ano). */
export async function carregarCartoes(): Promise<CartaoDto[]> {
  const hoje = diaDeSaoPaulo();
  const cartoes = await prisma.cartaoCredito.findMany({
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }],
    select: {
      id: true, nome: true, ultimosDigitos: true, tipo: true, limite: true, ativo: true,
      diaFechamento: true, diaVencimento: true, contaPadraoId: true,
      socio: { select: { user: { select: { name: true } } } },
      faturas: {
        select: {
          id: true, competencia: true, fimCiclo: true,
          // natureza-ok: compra de cartão é despesa real; a fatura é a soma dela, sem filtro de natureza.
          lancamentos: { where: { excluidoEm: null }, select: { valor: true, status: true, dataConfirmacao: true } },
        },
      },
    },
  });
  const ano = hoje.slice(0, 4);
  return cartoes.map((c) => {
    const abertaComp = cicloDaCompra(c, hoje).competencia;
    let aberta = 0;
    let fechada = 0;
    let pagoNoAno = 0;
    for (const f of c.faturas) {
      for (const l of f.lancamentos) {
        const v = paraCentavos(l.valor);
        if (l.status === "confirmado") {
          if (dia(l.dataConfirmacao)?.startsWith(ano)) pagoNoAno += v;
          continue;
        }
        if (l.status !== "previsto") continue;
        if (f.competencia === abertaComp) aberta += v;
        else if (dia(f.fimCiclo)! < hoje) fechada += v;
      }
    }
    return {
      id: c.id,
      nome: c.nome,
      ultimosDigitos: c.ultimosDigitos,
      tipo: c.tipo,
      socioNome: c.socio?.user.name ?? null,
      limiteCentavos: c.limite == null ? null : paraCentavos(c.limite),
      diaFechamento: c.diaFechamento,
      diaVencimento: c.diaVencimento,
      contaPadraoId: c.contaPadraoId,
      ativo: c.ativo,
      competenciaAberta: abertaComp,
      abertaCentavos: aberta,
      fechadaCentavos: fechada,
      pagoNoAnoCentavos: pagoNoAno,
    };
  });
}

/** Faturas de um cartão, da mais recente para a mais antiga. */
export async function faturasDoCartao(cartaoId: string): Promise<FaturaDto[]> {
  const hoje = diaDeSaoPaulo();
  const fs = await prisma.faturaCartao.findMany({
    where: { cartaoId },
    orderBy: { competencia: "desc" },
    select: {
      id: true, competencia: true, inicioCiclo: true, fimCiclo: true, vencimento: true,
      // natureza-ok: a fatura soma as compras do cartão, não um recorte do resultado.
      lancamentos: { where: { excluidoEm: null }, select: { valor: true, status: true, dataConfirmacao: true } },
    },
  });
  return fs.map((f) => {
    const vivas = f.lancamentos.filter((l) => l.status !== "cancelado");
    const abertas = vivas.filter((l) => l.status === "previsto");
    const pagas = vivas.filter((l) => l.status === "confirmado");
    const pagamentos = pagas.map((l) => dia(l.dataConfirmacao)).filter((d): d is Dia => !!d).sort();
    return {
      id: f.id,
      competencia: f.competencia,
      inicioCiclo: dia(f.inicioCiclo)!,
      fimCiclo: dia(f.fimCiclo)!,
      vencimento: dia(f.vencimento)!,
      situacao: situacaoDaFatura({ fimCiclo: dia(f.fimCiclo)! }, { emAberto: abertas.length, pagas: pagas.length }, hoje),
      totalCentavos: vivas.reduce((s, l) => s + paraCentavos(l.valor), 0),
      emAbertoCentavos: abertas.reduce((s, l) => s + paraCentavos(l.valor), 0),
      compras: vivas.length,
      comprasEmAberto: abertas.length,
      ultimoPagamento: pagamentos.at(-1) ?? null,
    };
  });
}

export type FaturaAberta = { fatura: FaturaDto; compras: CompraDto[] };

/**
 * Uma fatura e as compras dela. A competência pedida pode ainda não existir no banco (ninguém comprou
 * nela): devolve a fatura "vazia" calculada do ciclo, sem gravar nada.
 */
export async function faturaComCompras(cartaoId: string, competencia: Competencia): Promise<FaturaAberta | null> {
  const hoje = diaDeSaoPaulo();
  const cartao = await prisma.cartaoCredito.findUnique({
    where: { id: cartaoId },
    select: { diaFechamento: true, diaVencimento: true },
  });
  if (!cartao) return null;
  const f = await prisma.faturaCartao.findUnique({
    where: { cartaoId_competencia: { cartaoId, competencia } },
    select: {
      id: true, competencia: true, inicioCiclo: true, fimCiclo: true, vencimento: true,
      // natureza-ok: as compras da fatura, como elas são.
      lancamentos: { where: { excluidoEm: null, status: { not: "cancelado" } }, orderBy: { data: "asc" }, select: SELECT_COMPRA },
    },
  });
  if (!f) {
    const c = cicloDaCompetencia(cartao, competencia);
    return {
      fatura: {
        id: "",
        competencia,
        inicioCiclo: c.inicioCiclo,
        fimCiclo: c.fimCiclo,
        vencimento: c.vencimento,
        situacao: "vazia",
        totalCentavos: 0,
        emAbertoCentavos: 0,
        compras: 0,
        comprasEmAberto: 0,
        ultimoPagamento: null,
      },
      compras: [],
    };
  }
  const compras = f.lancamentos.map(paraCompra);
  const abertas = compras.filter((c) => !c.paga);
  const pagamentos = compras.map((c) => c.dataPagamento).filter((d): d is Dia => !!d).sort();
  return {
    fatura: {
      id: f.id,
      competencia: f.competencia,
      inicioCiclo: dia(f.inicioCiclo)!,
      fimCiclo: dia(f.fimCiclo)!,
      vencimento: dia(f.vencimento)!,
      situacao: situacaoDaFatura(
        { fimCiclo: dia(f.fimCiclo)! },
        { emAberto: abertas.length, pagas: compras.length - abertas.length },
        hoje,
      ),
      totalCentavos: compras.reduce((s, c) => s + c.valorCentavos, 0),
      emAbertoCentavos: abertas.reduce((s, c) => s + c.valorCentavos, 0),
      compras: compras.length,
      comprasEmAberto: abertas.length,
      ultimoPagamento: pagamentos.at(-1) ?? null,
    },
    compras,
  };
}

/** Selo do item "Cartões" no menu: faturas fechadas com compra em aberto. */
export async function totalFaturasAPagar(): Promise<number> {
  const hoje = new Date(`${diaDeSaoPaulo()}T00:00:00.000Z`);
  return prisma.faturaCartao.count({
    where: { fimCiclo: { lt: hoje }, lancamentos: { some: { status: "previsto", excluidoEm: null } } },
  });
}
