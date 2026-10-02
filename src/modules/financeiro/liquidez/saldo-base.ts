/**
 * Caixa atual (S0) — a mesma conta que `fluxoCaixa()` sempre fez, extraída para ser testada e
 * usada pelo planejador (spec §3). Puro.
 *
 *   S0 = Σ saldoInicial das contas ATIVAS
 *      + Σ ±valor dos realizados de conta ativa
 *      + Σ ±valor dos realizados sem conta OU de conta inativa ("semConta")
 *
 * sem filtro de data de realização. As distorções conhecidas (A1–A3) não são corrigidas aqui: viram
 * aviso em `anomaliasDoSaldo`.
 */
import type { Centavos, DataIso, TipoMovimento } from "@/modules/financeiro/liquidez/tipos";

/** `saldoInicialEm`: dia em que o saldo inicial vale (M8). Nulo = todo o realizado da conta entra. */
export type ContaAtiva = { id: string; saldoInicial: Centavos; saldoInicialEm?: DataIso | null };

/**
 * Lançamento realizado (`status = confirmado`, não excluído); `valor` = `valorEfetivo ?? valor`.
 * `dataConfirmacao` só é necessária para a conta que tem data de saldo inicial.
 */
export type Realizado = { contaId: string | null; tipo: TipoMovimento; valor: Centavos; dataConfirmacao?: DataIso | null };

/**
 * O realizado entra no saldo da conta? O saldo inicial vale no COMEÇO de `saldoInicialEm`: o que foi pago
 * antes disso já está dentro dele (contar de novo seria somar duas vezes). Sem data, entra tudo — como sempre foi.
 */
export function entraNoSaldoDaConta(saldoInicialEm: DataIso | null | undefined, dataConfirmacao: DataIso | null | undefined): boolean {
  if (!saldoInicialEm) return true;
  // Realizado sem data de realização não tem como estar "antes": fica dentro (o dado é que está incompleto).
  if (!dataConfirmacao) return true;
  return dataConfirmacao >= saldoInicialEm;
}

export type SaldoBase = { porConta: Record<string, Centavos>; semConta: Centavos; total: Centavos };

export function saldoBase(contasAtivas: readonly ContaAtiva[], realizados: readonly Realizado[]): SaldoBase {
  const porConta: Record<string, Centavos> = {};
  const desde = new Map<string, DataIso | null | undefined>();
  for (const c of contasAtivas) {
    porConta[c.id] = c.saldoInicial;
    desde.set(c.id, c.saldoInicialEm);
  }
  let semConta = 0;
  for (const l of realizados) {
    const delta = l.tipo === "receita" ? l.valor : -l.valor;
    if (l.contaId != null && Object.prototype.hasOwnProperty.call(porConta, l.contaId)) {
      if (entraNoSaldoDaConta(desde.get(l.contaId), l.dataConfirmacao)) porConta[l.contaId] += delta;
    } else {
      semConta += delta;
    }
  }
  let total = semConta;
  for (const id of Object.keys(porConta)) total += porConta[id];
  return { porConta, semConta, total };
}

export type RealizadoDatado = Realizado & { dataConfirmacao: DataIso | null };

export type Anomalia = { quantidade: number; valor: Centavos };

export type AnomaliasDoSaldo = {
  /** A1 — realizado com data de realização depois de hoje (já está no caixa atual). */
  dataFutura: Anomalia;
  /** A2 — realizado de conta inativa (entra sem o saldo inicial da conta). */
  contaInativa: Anomalia;
  /** A3 — realizado sem conta. */
  semConta: Anomalia;
};

/** Valor absoluto somado por anomalia: é o tamanho da dúvida, não um ajuste. */
export function anomaliasDoSaldo(
  hoje: DataIso,
  idsContasAtivas: ReadonlySet<string>,
  realizados: readonly RealizadoDatado[],
): AnomaliasDoSaldo {
  const zero = (): Anomalia => ({ quantidade: 0, valor: 0 });
  const r: AnomaliasDoSaldo = { dataFutura: zero(), contaInativa: zero(), semConta: zero() };
  for (const l of realizados) {
    if (l.dataConfirmacao != null && l.dataConfirmacao > hoje) {
      r.dataFutura.quantidade += 1;
      r.dataFutura.valor += l.valor;
    }
    if (l.contaId == null) {
      r.semConta.quantidade += 1;
      r.semConta.valor += l.valor;
    } else if (!idsContasAtivas.has(l.contaId)) {
      r.contaInativa.quantidade += 1;
      r.contaInativa.valor += l.valor;
    }
  }
  return r;
}
