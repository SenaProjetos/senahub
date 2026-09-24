/** Rótulos e regras puras do abono / aviso antecipado de ausência (client-safe). */

export const MOTIVOS_AUSENCIA = [
  { valor: "atestado", rotulo: "Atestado" },
  { valor: "consulta", rotulo: "Consulta médica" },
  { valor: "exame", rotulo: "Exame" },
  { valor: "compromisso", rotulo: "Compromisso" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export type MotivoAusenciaValor = (typeof MOTIVOS_AUSENCIA)[number]["valor"];

export function rotuloMotivo(valor: string): string {
  return MOTIVOS_AUSENCIA.find((m) => m.valor === valor)?.rotulo ?? valor;
}

/** "14:00–16:00" ou `null` quando a ausência é de dia inteiro. */
export function rotuloJanela(horaInicio: string | null, horaFim: string | null): string | null {
  return horaInicio && horaFim ? `${horaInicio}–${horaFim}` : null;
}

/** Aviso antecipado = pedido criado ANTES do primeiro dia da ausência (datas ISO, dia local). */
export function ehAvisoAntecipado(criadoEm: Date | string, dataInicio: Date | string): boolean {
  const criado = new Date(criadoEm).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const inicio = typeof dataInicio === "string" ? dataInicio.slice(0, 10) : dataInicio.toISOString().slice(0, 10);
  return criado < inicio;
}

/** Rótulo do tratamento de uma ausência APROVADA; `null` enquanto pendente/rejeitada. */
export function rotuloTratamento(status: string, tratamento: string): string | null {
  if (status !== "aprovado") return null;
  return tratamento === "banco_horas" ? "pelo banco de horas" : "abonada";
}
