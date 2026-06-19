// Módulo PURO — sem server-only, sem prisma.

export type EventoParaAlerta = {
  id: string;
  tipo: string;
  dataISO: string;       // "YYYY-MM-DD"
  alertaDias: number[];  // override por evento; vazio = usa padraoDias
  concluido: boolean;
};

/** Dias de calendário de `hojeISO` até `dataISO` (positivo = futuro). Timezone-safe (parse YYYY-MM-DD em UTC). */
export function diasRestantes(hojeISO: string, dataISO: string): number {
  const [ay, am, ad] = hojeISO.split("-").map(Number);
  const [by, bm, bd] = dataISO.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

/** Eventos que devem disparar alerta HOJE. Para cada evento não concluído:
 *  dias = diasRestantes(hoje, data); se dias < 0 → ignora;
 *  efetivo = alertaDias.length ? alertaDias : padraoDias;
 *  se efetivo inclui `dias` → inclui { id, tipo, dias }. */
export function eventosParaNotificar(
  eventos: EventoParaAlerta[],
  hojeISO: string,
  padraoDias: number[],
): { id: string; tipo: string; dias: number }[] {
  const result: { id: string; tipo: string; dias: number }[] = [];

  for (const ev of eventos) {
    if (ev.concluido) continue;

    const dias = diasRestantes(hojeISO, ev.dataISO);
    if (dias < 0) continue;

    const efetivo = ev.alertaDias.length > 0 ? ev.alertaDias : padraoDias;
    if (efetivo.includes(dias)) {
      result.push({ id: ev.id, tipo: ev.tipo, dias });
    }
  }

  return result;
}
