/**
 * Liderança, 1:1 e objetivos (Gestão de Pessoas F3) — regras puras, client-safe.
 * Decisões do dono (2026-10-05): visibilidade por registro (padrão líder + RH, o líder marca o que
 * a pessoa vê); a pessoa vê os objetivos sempre e do 1:1 só o compartilhado; cadência mensal por
 * padrão, o líder pode mudar; qualquer interno pode ser líder; feedbacks antigos como histórico.
 */
type Dia = string;

/** Como quem olha se relaciona com a pessoa. `null` = sem acesso ao desenvolvimento dela. */
export type Papel = "rh" | "lider" | "self";

export function papelSobre(viewer: { id: string; ehRh: boolean }, alvoUserId: string, liderAtivoId: string | null): Papel | null {
  if (viewer.ehRh) return "rh";
  if (liderAtivoId && liderAtivoId === viewer.id) return "lider";
  if (viewer.id === alvoUserId) return "self";
  return null;
}

/** Quem escreve (objetivos, 1:1, cadência): RH ou o líder ATIVO. A pessoa só lê. */
export const podeEscrever = (p: Papel | null) => p === "rh" || p === "lider";

/** A pessoa só vê o 1:1 compartilhado; líder ativo e RH veem todos. */
export function encontroVisivel(e: { visibilidade: "lider_rh" | "compartilhado" }, papel: Papel | null): boolean {
  if (papel === "rh" || papel === "lider") return true;
  return papel === "self" && e.visibilidade === "compartilhado";
}

export const MOTIVO_LIDERAR_A_SI = "Ninguém lidera a si mesmo.";
export const MOTIVO_JA_E_LIDER = "Esta pessoa já é a liderança atual.";
export const MOTIVO_SEM_ACESSO = "Você não lidera esta pessoa.";
export const CADENCIA_MIN = 7;
export const CADENCIA_MAX = 180;

function somarDias(dia: Dia, n: number): Dia {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Quando é o próximo 1:1: o "próximo encontro" marcado no último registro; sem ele, último + cadência;
 * sem nenhum encontro, início da liderança + cadência. Vencido = essa data antes de hoje.
 */
export function proximoUmAUm(
  ultimo: { data: Dia; proximoEm: Dia | null } | null,
  inicioLideranca: Dia,
  cadenciaDias: number,
  hoje: Dia,
): { em: Dia; vencido: boolean; diasAtraso: number } {
  const em = ultimo ? (ultimo.proximoEm ?? somarDias(ultimo.data, cadenciaDias)) : somarDias(inicioLideranca, cadenciaDias);
  const atraso = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${em}T00:00:00Z`)) / 86_400_000);
  return { em, vencido: em < hoje, diasAtraso: Math.max(0, atraso) };
}

/** O lembrete de 1:1 vencido repete no máximo a cada 7 dias. */
export function deveLembrar(lembradoEm: Dia | null, hoje: Dia): boolean {
  return !lembradoEm || somarDias(lembradoEm, 7) <= hoje;
}

export const STATUS_OBJETIVO_LABEL = { aberto: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" } as const;
export const VISIBILIDADE_LABEL = {
  lider_rh: "Só líder e RH",
  compartilhado: "Compartilhado com a pessoa",
} as const;
