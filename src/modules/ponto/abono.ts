/**
 * Abono de falta / aviso antecipado → efeito nas horas do ponto. PURO (sem I/O).
 *
 * Uma ausência APROVADA tem dois formatos:
 * - **dia inteiro** (sem horário): o(s) dia(s) não geram hora esperada, como férias;
 * - **parcial** (`horaInicio`–`horaFim`, um único dia): só a janela informada deixa de
 *   ser cobrada (consulta às 14h–16h abate 2h do esperado do dia, nunca além dele).
 *
 * E dois tratamentos (decididos pelo RH): `abonar` aplica o efeito acima nas horas
 * esperadas; `banco_horas` só JUSTIFICA — as horas seguem devidas e saem do banco.
 *
 * Datas são `YYYY-MM-DD` (mesmo padrão de `esperado.ts`); `@db.Date` chega como meia-noite UTC.
 */

export type AbonoLinha = {
  dataInicio: Date;
  dataFim: Date;
  horaInicio: string | null;
  horaFim: string | null;
  tratamento: "abonar" | "banco_horas";
};

export type AbonoParcial = { horaInicio: string; horaFim: string; minutos: number };

export type AbonosDoMes = {
  /** Dias ISO abonados por inteiro (horas NÃO cobradas). */
  inteiros: Set<string>;
  /** Dias ISO com abono parcial (vários avisos no mesmo dia somam a janela). */
  parciais: Map<string, AbonoParcial>;
  /** Dias ISO justificados por inteiro, mas descontados do banco de horas (esperado intacto). */
  bancoInteiros: Set<string>;
  /** Janelas justificadas a descontar do banco — não alteram o esperado, só o atraso informativo. */
  bancoParciais: Map<string, AbonoParcial>;
};

/** "HH:MM" → minutos desde 00:00; `null` se inválido. */
export function minutosHHMM(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutos da janela `horaInicio`–`horaFim`; 0 se inválida ou invertida. */
export function minutosJanela(horaInicio: string | null, horaFim: string | null): number {
  if (!horaInicio || !horaFim) return 0;
  const a = minutosHHMM(horaInicio);
  const b = minutosHHMM(horaFim);
  if (a == null || b == null || b <= a) return 0;
  return b - a;
}

const DIA_MS = 86_400_000;

/** Expande os abonos recortando ao mês `[ini, fimExcl)`. */
export function expandirAbonos(linhas: AbonoLinha[], ini: Date, fimExcl: Date): AbonosDoMes {
  const inteiros = new Set<string>();
  const parciais = new Map<string, AbonoParcial>();
  const bancoInteiros = new Set<string>();
  const bancoParciais = new Map<string, AbonoParcial>();

  for (const a of linhas) {
    const janela = minutosJanela(a.horaInicio, a.horaFim);
    const parcial = janela > 0 && a.dataInicio.getTime() === a.dataFim.getTime();

    const banco = a.tratamento === "banco_horas";
    const dias = banco ? bancoInteiros : inteiros;
    const janelas = banco ? bancoParciais : parciais;

    let cur = a.dataInicio < ini ? new Date(ini) : new Date(a.dataInicio);
    while (cur < fimExcl && cur <= a.dataFim) {
      const iso = cur.toISOString().slice(0, 10);
      if (!parcial) dias.add(iso);
      else {
        const atual = janelas.get(iso);
        janelas.set(iso, {
          horaInicio: atual && atual.horaInicio < a.horaInicio! ? atual.horaInicio : a.horaInicio!,
          horaFim: atual && atual.horaFim > a.horaFim! ? atual.horaFim : a.horaFim!,
          minutos: (atual?.minutos ?? 0) + janela,
        });
      }
      cur = new Date(cur.getTime() + DIA_MS);
    }
  }
  return { inteiros, parciais, bancoInteiros, bancoParciais };
}

/** Minutos por dia ISO a abater do esperado (só parciais). */
export function abatimentoParcial(parciais: Map<string, AbonoParcial>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [iso, p] of parciais) out[iso] = p.minutos;
  return out;
}
