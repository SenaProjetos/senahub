/**
 * Avisos do Financeiro (M9). Puro, sem I/O — roda no servidor (jobs) e nos testes.
 *
 * Dois públicos, duas regras:
 *  - **cobrança ao cliente** (e-mail): antes do vencimento, no dia e depois dele;
 *  - **contas a pagar vencendo** (sino): D-3 e D-1, para quem lançou a conta.
 *
 * Duas garantias:
 *  - **sem duplicar**: cada aviso é (lançamento, tipo, destino, vencimento) e só sai uma vez — o serviço
 *    reserva essa chave no banco ANTES de enviar, então um job repetido ou duas instâncias não mandam duas vezes.
 *    Mudar o vencimento muda a chave: o aviso vale de novo para a data nova.
 *  - **só o que é cobrança**: transferência entre contas, previsão do cronograma e compra de cartão não geram aviso
 *    ao cliente (a compra de cartão vence na fatura, que tem o seu próprio aviso no planejador).
 */
import { z } from "zod";

export const CHAVE_CONFIG_AVISOS = "financeiro.avisos";

export type ConfigAvisos = {
  /** E-mail ao cliente alguns dias ANTES do vencimento. Desligado até o dono ligar: é e-mail novo para fora. */
  cobrancaAntes: boolean;
  /** Quantos dias antes (1–15). */
  diasAntes: number;
  /** E-mail ao cliente NO dia do vencimento. */
  cobrancaNoDia: boolean;
  /** E-mail ao cliente no dia SEGUINTE ao vencimento — o que o sistema já fazia (D+1). */
  cobrancaApos: boolean;
  /** Sino para quem lançou a conta a pagar: D-3 e D-1. */
  contasAPagar: boolean;
};

export const CONFIG_AVISOS_PADRAO: ConfigAvisos = {
  cobrancaAntes: false,
  diasAntes: 3,
  cobrancaNoDia: false,
  cobrancaApos: true,
  contasAPagar: true,
};

export const configAvisosSchema = z.object({
  cobrancaAntes: z.boolean(),
  diasAntes: z.number().int().min(1).max(15),
  cobrancaNoDia: z.boolean(),
  cobrancaApos: z.boolean(),
  contasAPagar: z.boolean(),
});

/** Lê o JSON guardado campo a campo; o que faltar ou vier inválido volta ao padrão. */
export function normalizarConfigAvisos(valor: unknown): ConfigAvisos {
  if (typeof valor !== "object" || valor === null) return { ...CONFIG_AVISOS_PADRAO };
  const v = valor as Record<string, unknown>;
  const campo = <K extends keyof ConfigAvisos>(k: K): ConfigAvisos[K] => {
    const r = configAvisosSchema.shape[k].safeParse(v[k]);
    return (r.success ? r.data : CONFIG_AVISOS_PADRAO[k]) as ConfigAvisos[K];
  };
  return {
    cobrancaAntes: campo("cobrancaAntes"),
    diasAntes: campo("diasAntes"),
    cobrancaNoDia: campo("cobrancaNoDia"),
    cobrancaApos: campo("cobrancaApos"),
    contasAPagar: campo("contasAPagar"),
  };
}

export type TipoDeAviso = "cobranca_antes" | "cobranca_no_dia" | "cobranca_apos" | "pagar_d3" | "pagar_d1" | "inadimplencia_interna";

/** Quem recebe: o cliente (e-mail) ou o id de um usuário (sino). */
export const DESTINO_CLIENTE = "cliente";
export const DESTINO_GESTORES = "gestores";

const MS_DIA = 86_400_000;
const dias = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_DIA);

/** Dias de `hoje` até `vencimento` (positivo = ainda falta; negativo = já venceu). Ambos `YYYY-MM-DD`. */
export function diasAteVencer(hoje: string, vencimento: string): number {
  return dias(vencimento) - dias(hoje);
}

/** Qual cobrança ao cliente cabe hoje para um recebível com este vencimento; `null` = nenhuma. */
export function cobrancaDeHoje(hoje: string, vencimento: string, c: Pick<ConfigAvisos, "cobrancaAntes" | "diasAntes" | "cobrancaNoDia" | "cobrancaApos">): TipoDeAviso | null {
  const d = diasAteVencer(hoje, vencimento);
  if (c.cobrancaAntes && d === c.diasAntes) return "cobranca_antes";
  if (c.cobrancaNoDia && d === 0) return "cobranca_no_dia";
  if (c.cobrancaApos && d === -1) return "cobranca_apos";
  return null;
}

/** Aviso de conta a pagar que cabe hoje: D-3 ou D-1; `null` = nenhum. */
export function pagarDeHoje(hoje: string, vencimento: string): TipoDeAviso | null {
  const d = diasAteVencer(hoje, vencimento);
  if (d === 3) return "pagar_d3";
  if (d === 1) return "pagar_d1";
  return null;
}

export type ContaVencendo = {
  id: string;
  /** Quem lançou: a pessoa responsável pelo aviso. */
  autorId: string;
  /** Centavos. */
  valor: number;
  descricao: string;
  tipo: TipoDeAviso;
};

export type AvisoAgrupado = {
  destinatarioId: string;
  d1: { quantidade: number; valor: number };
  d3: { quantidade: number; valor: number };
  ids: string[];
};

/**
 * Uma notificação por pessoa e por dia, nunca uma por conta: agrupa D-1 e D-3 do mesmo responsável.
 * `quemRecebe(autorId)` devolve o destinatário (o próprio autor, ou um gestor se o autor não vê o financeiro);
 * `null` = ninguém recebe aquela conta.
 */
export function agruparAvisosDePagar(contas: readonly ContaVencendo[], quemRecebe: (autorId: string) => string[] | null): AvisoAgrupado[] {
  const por = new Map<string, AvisoAgrupado>();
  for (const c of contas) {
    const destinos = quemRecebe(c.autorId);
    if (!destinos) continue;
    for (const d of destinos) {
      const a = por.get(d) ?? { destinatarioId: d, d1: { quantidade: 0, valor: 0 }, d3: { quantidade: 0, valor: 0 }, ids: [] };
      const alvo = c.tipo === "pagar_d1" ? a.d1 : a.d3;
      alvo.quantidade += 1;
      alvo.valor += c.valor;
      a.ids.push(c.id);
      por.set(d, a);
    }
  }
  return [...por.values()];
}

// O Intl põe um espaço sem quebra entre "R$" e o número; no sino e no e-mail um espaço comum lê melhor.
const brl = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** Texto do sino: "2 vencem amanhã (R$ 1.200,00) e 3 em 3 dias (R$ 800,00)". */
export function corpoDoAvisoDePagar(a: Pick<AvisoAgrupado, "d1" | "d3">): string {
  const partes: string[] = [];
  if (a.d1.quantidade > 0) partes.push(`${a.d1.quantidade} ${a.d1.quantidade === 1 ? "vence" : "vencem"} amanhã (${brl(a.d1.valor)})`);
  if (a.d3.quantidade > 0) partes.push(`${a.d3.quantidade} ${a.d3.quantidade === 1 ? "vence" : "vencem"} em 3 dias (${brl(a.d3.valor)})`);
  return partes.join(" e ");
}

/** "vence em 3 dias" / "vence hoje" / "venceu ontem": a frase que o e-mail ao cliente usa. */
export function frasesDoVencimento(tipo: TipoDeAviso, diasAntes: number): string {
  switch (tipo) {
    case "cobranca_antes":
      return diasAntes === 1 ? "vence amanhã" : `vence em ${diasAntes} dias`;
    case "cobranca_no_dia":
      return "vence hoje";
    default:
      return "venceu ontem";
  }
}
