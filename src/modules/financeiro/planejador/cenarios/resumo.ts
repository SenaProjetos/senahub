/**
 * Resumo de um cenário salvo para a lista e a comparação (mock "Cenários salvos"). Puro: roda o
 * mesmo motor da tela sobre a base de HOJE + os ajustes do cenário (spec §11: o cenário guarda só a
 * intenção; os números são sempre recalculados).
 */
import type { AjusteSimulado, Premissas } from "@/modules/financeiro/liquidez/ajustes";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import { aplicarSimulacao } from "@/modules/financeiro/liquidez/simulacao";
import type { Centavos, DataIso, EventoCaixa } from "@/modules/financeiro/liquidez/tipos";

export type BaseParaResumo = {
  hoje: DataIso;
  caixaAtual: Centavos;
  reservaMinima: Centavos;
  eventos: readonly EventoCaixa[];
  caixinhas: readonly { id: string; reservado: Centavos }[];
};

export type SituacaoProjetada = "ok" | "reserva" | "deficit";

export type ResumoCenario = {
  fim: DataIso;
  menorSaldo: Centavos;
  diaMenor: DataIso;
  saldoFinal: Centavos;
  situacao: SituacaoProjetada;
  /** Saldo de fechamento de cada dia do horizonte (para os gráficos da comparação). */
  serie: Centavos[];
};

export function resumoDoCenario(base: BaseParaResumo, premissas: Premissas, ajustes: readonly AjusteSimulado[]): ResumoCenario {
  const p = projetar({
    hoje: base.hoje,
    horizonteDias: premissas.horizonteDias,
    caixaAtual: base.caixaAtual,
    reservaMinima: base.reservaMinima,
    eventos: aplicarSimulacao(base.eventos, ajustes, base.hoje),
    caixinhas: base.caixinhas,
    eixos: premissas.eixos,
  });
  const menor = p.menorSaldo.valor;
  return {
    fim: p.fim,
    menorSaldo: menor,
    diaMenor: p.menorSaldo.dia,
    saldoFinal: p.fimDoHorizonte.caixa,
    situacao: menor < 0 ? "deficit" : base.reservaMinima > 0 && menor < base.reservaMinima ? "reserva" : "ok",
    serie: p.serie.map((d) => d.saldo),
  };
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Nome sugerido ao salvar (mock): "Outubro, 2 ajustes". A pessoa troca no diálogo. */
export function nomePadraoDoCenario(hoje: DataIso, nAjustes: number): string {
  const mes = MESES[Number(hoje.slice(5, 7)) - 1] ?? "Cenário";
  return `${mes}, ${nAjustes} ${nAjustes === 1 ? "ajuste" : "ajustes"}`;
}
