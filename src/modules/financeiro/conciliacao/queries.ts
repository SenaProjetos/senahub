import "server-only";
import { prisma } from "@/lib/prisma";
import { candidatosDeConciliacao } from "@/modules/financeiro/conciliacao/service";
import { sugestoesDaTransacao } from "@/modules/financeiro/conciliacao/casamento";
import { paraCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { isoDeDataDoBanco } from "@/modules/financeiro/liquidez/datas";
import { carregarRegrasAtivas } from "@/modules/financeiro/regras/service";
import { primeiraQueCasa } from "@/modules/financeiro/regras/motor";

/** Quantidade de transações bancárias ainda não conciliadas (badge do dashboard). */
export async function totalTransacoesPendentes(): Promise<number> {
  return prisma.transacaoBancaria.count({ where: { conciliado: false } });
}

/** Transações ainda não conciliadas, com sugestões de lançamento previsto. */
export async function transacoesPendentes(contaId?: string) {
  const transacoes = await prisma.transacaoBancaria.findMany({
    where: { conciliado: false, ...(contaId ? { contaId } : {}) },
    orderBy: { data: "desc" },
    include: { conta: { select: { nome: true } } },
  });

  // G1c/D31: inclui os CONFIRMADOS ainda sem transação, não só os previstos — é o que permite
  // reconciliar um pagamento já pago depois de desfazer uma conciliação errada. N4: mesma conta (ou sem
  // conta), centavos e janela de data, mais perto primeiro (`sugestoesDaTransacao`).
  const candidatos = await candidatosDeConciliacao(prisma);

  // M2: a primeira regra ativa da lista que casa (descrição, tipo, valor, conta) sugere a categoria.
  const regras = await carregarRegrasAtivas(prisma);
  const idsCategoria = [...new Set(regras.map((r) => r.preenche.categoriaId).filter((x): x is string => !!x))];
  const categorias = idsCategoria.length
    ? await prisma.categoriaFinanceira.findMany({ where: { id: { in: idsCategoria } }, select: { id: true, codigo: true, nome: true } })
    : [];
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));

  return transacoes.map((t) => {
    const ehReceita = Number(t.valor) > 0;
    const sugestoes = sugestoesDaTransacao(
      { valorCentavos: paraCentavos(t.valor), contaId: t.contaId, dia: isoDeDataDoBanco(t.data) },
      candidatos,
    ).map((l) => ({ id: l.id, descricao: l.descricao, valor: l.valor, status: l.status as string }));
    const regra = primeiraQueCasa(regras, {
      descricao: t.descricao,
      tipo: ehReceita ? "receita" : "despesa",
      valor: Math.abs(Number(t.valor)),
      contaId: t.contaId,
    });
    return {
      id: t.id,
      data: t.data,
      valor: Number(t.valor),
      descricao: t.descricao,
      conta: t.conta.nome,
      ehReceita,
      sugestoes,
      categoriaSugerida: (regra?.preenche.categoriaId && categoriaPorId.get(regra.preenche.categoriaId)) || null,
    };
  });
}

export type TransacaoPendente = Awaited<ReturnType<typeof transacoesPendentes>>[number];
