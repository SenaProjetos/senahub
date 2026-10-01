import "server-only";
import { prisma } from "@/lib/prisma";
import { inicioDoDiaUtc } from "@/lib/data";
import { situacaoDaCaixinha, usado, type RegraNecessidade, type SaidaPendente, type SaidaRealizada, type SituacaoCaixinha } from "@/modules/financeiro/caixinhas/calculo";
import { isoDeDataDoBanco, somarDias } from "@/modules/financeiro/liquidez/datas";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { STATUS_PENDENTES } from "@/modules/financeiro/liquidez/eventos";
import type { Centavos, DataIso } from "@/modules/financeiro/liquidez/tipos";

export type CaixinhaDto = {
  id: string;
  chave: string | null;
  nome: string;
  descricao: string | null;
  regra: RegraNecessidade;
  /** Centavos; `null` = sem meta. */
  meta: Centavos | null;
  horizonteDias: number;
  ordem: number;
  ativo: boolean;
  criadaEm: DataIso;
  situacao: SituacaoCaixinha;
  /** Saídas em aberto ligadas (qualquer data). */
  abertas: number;
  /** Saídas em aberto ligadas que vencem nos próximos 30 dias (vencidas inclusas), centavos. */
  comprometido30: Centavos;
};

/**
 * Caixinhas com a situação de hoje (spec §4). Tudo é CALCULADO aqui da leitura — alocado pela soma
 * dos movimentos, uso pelas despesas realizadas ligadas, necessidade pelas pendentes ligadas —, sem
 * nenhum gancho nos caminhos de baixa (confirmar, lote, conciliação). Todo `where` escreve
 * `excluidoEm: null`: a extensão de soft delete não cobre `groupBy` aninhado nem busca por id.
 */
export async function carregarCaixinhas(o: { hoje: DataIso; inativas?: boolean }): Promise<CaixinhaDto[]> {
  const caixinhas = await prisma.caixinha.findMany({
    where: o.inativas ? {} : { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  if (caixinhas.length === 0) return [];
  const ids = caixinhas.map((c) => c.id);

  const somas = await prisma.movimentoCaixinha.groupBy({ by: ["caixinhaId"], where: { caixinhaId: { in: ids } }, _sum: { valor: true } });
  const alocadoPor = new Map(somas.map((s) => [s.caixinhaId, paraCentavos(s._sum.valor ?? 0)]));

  const realizadas = await prisma.lancamento.findMany({
    where: { caixinhaId: { in: ids }, tipo: "despesa", status: "confirmado", excluidoEm: null },
    select: { caixinhaId: true, valor: true, valorEfetivo: true, dataConfirmacao: true },
  });
  const usoPor = new Map<string, SaidaRealizada[]>();
  for (const l of realizadas) {
    const lista = usoPor.get(l.caixinhaId!) ?? [];
    lista.push({ valor: paraCentavos(l.valorEfetivo ?? l.valor), dataConfirmacao: l.dataConfirmacao ? isoDeDataDoBanco(l.dataConfirmacao) : null });
    usoPor.set(l.caixinhaId!, lista);
  }

  const abertas = await prisma.lancamento.findMany({
    where: { caixinhaId: { in: ids }, tipo: "despesa", status: { in: [...STATUS_PENDENTES] }, excluidoEm: null },
    select: { id: true, caixinhaId: true, descricao: true, valor: true, data: true, vencimento: true },
  });
  const abertasPor = new Map<string, SaidaPendente[]>();
  for (const l of abertas) {
    const lista = abertasPor.get(l.caixinhaId!) ?? [];
    lista.push({ id: l.id, descricao: l.descricao, valor: paraCentavos(l.valor), data: isoDeDataDoBanco(l.vencimento ?? l.data) });
    abertasPor.set(l.caixinhaId!, lista);
  }

  return caixinhas.map((c) => {
    const criadaEm = isoDeDataDoBanco(inicioDoDiaUtc(c.createdAt));
    const a = alocadoPor.get(c.id) ?? 0;
    const u = usado(usoPor.get(c.id) ?? [], criadaEm, o.hoje);
    const dele = abertasPor.get(c.id) ?? [];
    const fim30 = somarDias(o.hoje, 29);
    return {
      id: c.id,
      chave: c.chave,
      nome: c.nome,
      descricao: c.descricao,
      regra: c.regra,
      meta: c.meta != null ? paraCentavos(c.meta) : null,
      horizonteDias: c.horizonteDias,
      ordem: c.ordem,
      ativo: c.ativo,
      criadaEm,
      situacao: situacaoDaCaixinha({
        regra: c.regra,
        meta: c.meta != null ? paraCentavos(c.meta) : null,
        horizonteDias: c.horizonteDias,
        hoje: o.hoje,
        alocado: a,
        usado: u,
        pendentes: dele,
      }),
      abertas: dele.length,
      comprometido30: dele.filter((x) => x.data <= fim30).reduce((s, x) => s + x.valor, 0),
    };
  });
}

/** Reservado de hoje por caixinha ATIVA: o que o motor do planejador recebe (`EntradaMotor.caixinhas`). */
export async function reservadosParaOMotor(hoje: DataIso): Promise<{ id: string; nome: string; reservado: Centavos }[]> {
  return (await carregarCaixinhas({ hoje })).map((c) => ({ id: c.id, nome: c.nome, reservado: c.situacao.reservado }));
}

export type MovimentoDto = {
  id: string;
  caixinhaId: string;
  caixinhaNome: string;
  tipo: "alocacao" | "liberacao" | "transferencia" | "ajuste";
  /** Centavos, com sinal. */
  valor: Centavos;
  data: DataIso;
  descricao: string | null;
  transferenciaId: string | null;
  autor: string;
  criadoEm: string;
};

/** Extrato (mais recente primeiro). Até 300 movimentos: o suficiente para a tela, sem paginar. */
export async function carregarMovimentos(o: { caixinhaId?: string } = {}): Promise<MovimentoDto[]> {
  const rows = await prisma.movimentoCaixinha.findMany({
    where: o.caixinhaId ? { caixinhaId: o.caixinhaId } : {},
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      caixinhaId: true,
      tipo: true,
      valor: true,
      data: true,
      descricao: true,
      transferenciaId: true,
      createdAt: true,
      caixinha: { select: { nome: true } },
      autor: { select: { name: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    caixinhaId: m.caixinhaId,
    caixinhaNome: m.caixinha.nome,
    tipo: m.tipo,
    valor: paraCentavos(m.valor),
    data: isoDeDataDoBanco(m.data),
    descricao: m.descricao,
    transferenciaId: m.transferenciaId,
    autor: m.autor.name,
    criadoEm: m.createdAt.toISOString(),
  }));
}
