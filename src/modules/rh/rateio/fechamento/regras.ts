/**
 * Regras do fechamento do rateio (R3; decisões 8, 14, 17 e 18 do spec 2026-09-15). PURO: a mesma frase
 * é o erro da ação e o motivo do item desabilitado no menu (ADR-0002).
 */
export const MSG_MES_EM_CURSO = "Este mês ainda não terminou. O rateio só fecha depois do último dia do mês.";
export const MSG_JA_FECHADO = "Este mês já está fechado. Para mudar, reabra com um motivo.";
export const MSG_NAO_FECHADO = "Este mês não está fechado.";
export const MSG_MOTIVO_CURTO = "Explique o motivo (pelo menos 10 caracteres).";
export const MSG_SO_LEGADO = "Só um mês fechado no cálculo antigo pode ser recalculado.";

const motivoOk = (m: string) => m.trim().length >= 10;

export function motivoParaNaoFechar(p: { mesTerminou: boolean; fechado: boolean }): string | null {
  if (!p.mesTerminou) return MSG_MES_EM_CURSO;
  if (p.fechado) return MSG_JA_FECHADO;
  return null;
}

export function motivoParaNaoReabrir(p: { fechado: boolean; motivo: string }): string | null {
  if (!p.fechado) return MSG_NAO_FECHADO;
  if (!motivoOk(p.motivo)) return MSG_MOTIVO_CURTO;
  return null;
}

export function motivoParaNaoRecalcular(p: { fechado: boolean; calculo: string | null; motivo: string }): string | null {
  if (!p.fechado) return MSG_NAO_FECHADO;
  if (p.calculo !== "legado") return MSG_SO_LEGADO;
  if (!motivoOk(p.motivo)) return MSG_MOTIVO_CURTO;
  return null;
}

/** Diferença entre o custo congelado no fechamento e o que o ponto de hoje dá para o mesmo mês. */
export function divergencia(congeladoCent: number, aoVivoCent: number): { diferencaCent: number; alterado: boolean } {
  const diferencaCent = aoVivoCent - congeladoCent;
  return { diferencaCent, alterado: diferencaCent !== 0 };
}

const proximoMes = (m: string) => {
  const [a, mm] = m.split("-").map(Number);
  return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
};

/** Meses (`AAAA-MM`) do corte até `ate` (inclusive) que ainda não foram fechados. */
export function mesesAbertos(p: { corte: string; ate: string; fechados: string[] }): string[] {
  const fechados = new Set(p.fechados);
  const out: string[] = [];
  for (let m = p.corte; m <= p.ate; m = proximoMes(m)) if (!fechados.has(m)) out.push(m);
  return out;
}
