import { motivoNaoFatura, ordenarParcelas, valoresDasParcelas } from "./parcelas-entrega";

/**
 * Lista "Parcelas a faturar" do financeiro (L2): as parcelas de contrato por entrega que ainda são só
 * previsão (ou não têm linha nenhuma) — o que o financeiro tem a cobrar quando a entrega acontece.
 * PURA: recebe os contratos já lidos e devolve a lista, na ordem em que a tela mostra.
 *
 * O marco concluído aparece em destaque (é o sinal de D9), mas a lista traz todas: o financeiro decide
 * quando faturar — o marco nunca fatura sozinho.
 */

export type ParcelaAFaturarSituacao = "marco_concluido" | "na_assinatura" | "sem_marco" | "aguardando_marco";

export type ContratoParaLista = {
  id: string;
  titulo: string;
  valor: number | null;
  cliente: string | null;
  projeto: { id: string; codigo: string; nome: string } | null;
  parcelas: {
    id: string;
    descricao: string;
    percentual: number;
    ordem: number;
    naAssinatura: boolean;
    marco: { nome: string; status: string } | null;
    lancamento: { status: string; vencimento: string | null; excluidoEm: string | null } | null;
  }[];
};

export type ParcelaAFaturar = {
  parcelaId: string;
  contratoId: string;
  contrato: string;
  cliente: string | null;
  projeto: { id: string; codigo: string; nome: string } | null;
  descricao: string;
  numero: number;
  total: number;
  percentual: number;
  /** Nulo quando o plano não fecha 100% ou o contrato não tem valor — `motivoSemValor` diz por quê. */
  valor: number | null;
  motivoSemValor: string | null;
  marco: string | null;
  situacao: ParcelaAFaturarSituacao;
  /** `YYYY-MM-DD` da previsão no caixa (data do marco ou da assinatura); nulo sem previsão. */
  previsao: string | null;
};

const PESO: Record<ParcelaAFaturarSituacao, number> = {
  marco_concluido: 0,
  na_assinatura: 1,
  sem_marco: 2,
  aguardando_marco: 3,
};

export function listarParcelasAFaturar(contratos: readonly ContratoParaLista[]): ParcelaAFaturar[] {
  const lista: ParcelaAFaturar[] = [];
  for (const c of contratos) {
    const ordenadas = ordenarParcelas(c.parcelas);
    const v = valoresDasParcelas(c.valor, ordenadas.map((p) => ({ descricao: p.descricao, percentual: p.percentual })));
    ordenadas.forEach((p, i) => {
      // Linha excluída no financeiro conta como inexistente — a previsão volta a nascer (mesma regra da sincronização).
      const lancamento = p.lancamento && !p.lancamento.excluidoEm ? p.lancamento : null;
      if (motivoNaoFatura({ lancamento })) return;
      const situacao: ParcelaAFaturarSituacao = p.naAssinatura
        ? "na_assinatura"
        : !p.marco
          ? "sem_marco"
          : p.marco.status === "con"
            ? "marco_concluido"
            : "aguardando_marco";
      lista.push({
        parcelaId: p.id,
        contratoId: c.id,
        contrato: c.titulo,
        cliente: c.cliente,
        projeto: c.projeto,
        descricao: p.descricao,
        numero: i + 1,
        total: ordenadas.length,
        percentual: p.percentual,
        valor: v.ok ? v.valores[i] : null,
        motivoSemValor: v.ok ? null : v.motivo,
        marco: p.marco?.nome ?? null,
        situacao,
        previsao: lancamento?.status === "previsao" ? lancamento.vencimento : null,
      });
    });
  }
  return lista.sort(
    (a, b) =>
      PESO[a.situacao] - PESO[b.situacao] ||
      (a.previsao ?? "9999-12-31").localeCompare(b.previsao ?? "9999-12-31") ||
      (a.cliente ?? "").localeCompare(b.cliente ?? "", "pt-BR") ||
      a.contrato.localeCompare(b.contrato, "pt-BR") ||
      a.numero - b.numero,
  );
}
