/**
 * Motor de cálculo da jornada de ponto (batidas).
 *
 * Helper PURO (sem I/O, sem React/Prisma, client-safe — sem `server-only`) —
 * testável isoladamente. É a fonte de verdade do "quanto trabalhou no dia" a
 * partir da sequência de batidas (entrada → N descansos → saída).
 *
 * Regras de negócio:
 * - Jornada = máquina de estados fora → trabalhando ⇄ descansando → fora.
 * - Múltiplos descansos permitidos (loop inicio_descanso/fim_descanso).
 * - Turno quebrado permitido (saída reabre com nova entrada no mesmo dia).
 * - A jornada pertence ao DIA LOCAL da entrada (America/Sao_Paulo), nunca ao
 *   dia UTC — daí `diaLocal`, que substitui o antigo `toISOString().slice(0,10)`.
 * - Dia corrente com ponta aberta → cronômetro ao vivo (conta até `agora`).
 * - Dia passado com ponta aberta → jornada incompleta: conta SÓ os pares
 *   fechados, nunca extrapola (corrige-se depois por ajuste).
 * - Batida em transição inválida é ignorada e contada em `inconsistencias`.
 */

export type TipoBatida = "entrada" | "inicio_descanso" | "fim_descanso" | "saida";

export type EstadoJornada = "fora" | "trabalhando" | "descansando";

/** Entrada mínima que o motor precisa de cada batida (projeto é informativo). */
export type BatidaCalc = {
  tipo: TipoBatida;
  horario: Date;
};

export type ResultadoDia = {
  /** Minutos efetivamente trabalhados no dia. */
  trabalhadoMin: number;
  /** Minutos em descanso/almoço no dia. */
  descansoMin: number;
  /** Estado ao final do processamento das batidas. */
  estado: EstadoJornada;
  /** Primeira batida `entrada` do dia (referência p/ atraso). */
  entrada: Date | null;
  /** Última batida `saida` do dia (null se jornada terminou aberta). */
  saida: Date | null;
  /** Jornada terminou aberta (trabalhando/descansando). */
  aberta: boolean;
  /** Dia passado terminou aberto — não foi encerrado (só pares fechados contam). */
  incompleto: boolean;
  /** Batidas ignoradas por transição inválida (duplicata/ordem quebrada). */
  inconsistencias: number;
};

const MS_MIN = 60_000;

const msParaMin = (ms: number) => Math.max(0, Math.round(ms / MS_MIN));

/**
 * Calcula a jornada de um dia a partir das batidas.
 *
 * @param batidas     batidas do dia (ordem qualquer — reordenadas internamente)
 * @param agora       instante atual (cronômetro ao vivo do dia corrente)
 * @param diaCorrente true se o dia calculado é hoje (ponta aberta conta ao vivo)
 */
export function calcularDia(
  batidas: BatidaCalc[],
  agora: Date,
  diaCorrente: boolean,
): ResultadoDia {
  const ordenadas = [...batidas].sort(
    (a, b) => a.horario.getTime() - b.horario.getTime(),
  );

  let estado: EstadoJornada = "fora";
  let marco: Date | null = null;
  let trabalhadoMs = 0;
  let descansoMs = 0;
  let inconsistencias = 0;
  let entrada: Date | null = null;
  let saida: Date | null = null;

  for (const b of ordenadas) {
    if (estado === "fora" && b.tipo === "entrada") {
      estado = "trabalhando";
      marco = b.horario;
      if (!entrada) entrada = b.horario;
      saida = null; // reabriu turno após saída anterior
    } else if (estado === "trabalhando" && b.tipo === "inicio_descanso") {
      trabalhadoMs += b.horario.getTime() - marco!.getTime();
      estado = "descansando";
      marco = b.horario;
    } else if (estado === "descansando" && b.tipo === "fim_descanso") {
      descansoMs += b.horario.getTime() - marco!.getTime();
      estado = "trabalhando";
      marco = b.horario;
    } else if (estado === "trabalhando" && b.tipo === "saida") {
      trabalhadoMs += b.horario.getTime() - marco!.getTime();
      estado = "fora";
      marco = null;
      saida = b.horario;
    } else {
      inconsistencias++;
    }
  }

  // Ponta aberta ao final: cronômetro ao vivo (hoje) ou incompleto (passado).
  let incompleto = false;
  if (marco && estado === "trabalhando") {
    if (diaCorrente) trabalhadoMs += Math.max(0, agora.getTime() - marco.getTime());
    else incompleto = true;
  } else if (marco && estado === "descansando") {
    if (diaCorrente) descansoMs += Math.max(0, agora.getTime() - marco.getTime());
    else incompleto = true;
  }

  return {
    trabalhadoMin: msParaMin(trabalhadoMs),
    descansoMin: msParaMin(descansoMs),
    estado,
    entrada,
    saida,
    aberta: estado !== "fora",
    incompleto,
    inconsistencias,
  };
}

/**
 * Intervalos de TRABALHO (não descanso) reconstruídos das batidas — cada
 * intervalo vira exatamente uma `SessaoTrabalho` no acoplamento transacional
 * (ver service.aplicarBatida). É a base da reconciliação (F5) e a prova da
 * invariante do rateio: Σ minutos dos intervalos == `trabalhadoMin`.
 *
 * Ponta aberta no dia corrente vira um intervalo com `fim: null` (sessão viva).
 * Dia passado aberto não fecha o último intervalo (jornada incompleta).
 */
export function intervalosTrabalho(
  batidas: BatidaCalc[],
  diaCorrente: boolean,
): { inicio: Date; fim: Date | null }[] {
  const ordenadas = [...batidas].sort(
    (a, b) => a.horario.getTime() - b.horario.getTime(),
  );
  const intervalos: { inicio: Date; fim: Date | null }[] = [];
  let estado: EstadoJornada = "fora";
  let marco: Date | null = null;

  for (const b of ordenadas) {
    if (estado === "fora" && b.tipo === "entrada") {
      estado = "trabalhando";
      marco = b.horario;
    } else if (estado === "trabalhando" && b.tipo === "inicio_descanso") {
      intervalos.push({ inicio: marco!, fim: b.horario });
      estado = "descansando";
      marco = b.horario;
    } else if (estado === "descansando" && b.tipo === "fim_descanso") {
      estado = "trabalhando";
      marco = b.horario;
    } else if (estado === "trabalhando" && b.tipo === "saida") {
      intervalos.push({ inicio: marco!, fim: b.horario });
      estado = "fora";
      marco = null;
    }
  }

  if (marco && estado === "trabalhando" && diaCorrente) {
    intervalos.push({ inicio: marco, fim: null });
  }
  return intervalos;
}

/**
 * Como `intervalosTrabalho`, mas carrega o `projetoId` da batida que ABRE cada
 * intervalo (entrada / fim_descanso) — usado pela reconciliação de sessões
 * (F5), que recria uma SessaoTrabalho por intervalo preservando o projeto.
 */
export function intervalosComProjeto(
  batidas: (BatidaCalc & { projetoId?: string | null })[],
  diaCorrente: boolean,
): { inicio: Date; fim: Date | null; projetoId: string | null }[] {
  const ordenadas = [...batidas].sort((a, b) => a.horario.getTime() - b.horario.getTime());
  const intervalos: { inicio: Date; fim: Date | null; projetoId: string | null }[] = [];
  let estado: EstadoJornada = "fora";
  let marco: Date | null = null;
  let marcoProj: string | null = null;

  for (const b of ordenadas) {
    if (estado === "fora" && b.tipo === "entrada") {
      estado = "trabalhando";
      marco = b.horario;
      marcoProj = b.projetoId ?? null;
    } else if (estado === "trabalhando" && b.tipo === "inicio_descanso") {
      intervalos.push({ inicio: marco!, fim: b.horario, projetoId: marcoProj });
      estado = "descansando";
      marco = b.horario;
    } else if (estado === "descansando" && b.tipo === "fim_descanso") {
      estado = "trabalhando";
      marco = b.horario;
      marcoProj = b.projetoId ?? null;
    } else if (estado === "trabalhando" && b.tipo === "saida") {
      intervalos.push({ inicio: marco!, fim: b.horario, projetoId: marcoProj });
      estado = "fora";
      marco = null;
    }
  }

  if (marco && estado === "trabalhando" && diaCorrente) {
    intervalos.push({ inicio: marco, fim: null, projetoId: marcoProj });
  }
  return intervalos;
}

// ── Máquina de estados (usada por service + UI p/ habilitar botões) ─────────

/** Tipos de batida válidos a partir de um estado. */
export function transicoesPermitidas(estado: EstadoJornada): TipoBatida[] {
  switch (estado) {
    case "fora":
      return ["entrada"];
    case "trabalhando":
      return ["inicio_descanso", "saida"];
    case "descansando":
      return ["fim_descanso"];
  }
}

/** A batida `tipo` é válida a partir de `estado`? */
export function podeBater(estado: EstadoJornada, tipo: TipoBatida): boolean {
  return transicoesPermitidas(estado).includes(tipo);
}

// ── Dia / hora locais (America/Sao_Paulo) ───────────────────────────────────
//
// Todo agrupamento e comparação de horário é feito no fuso de Brasília, nunca
// via getDay()/getHours()/toISOString() diretos no servidor (o SO é Windows e
// pode estar em qualquer fuso). O offset de SP é fixo -03:00 desde 2019.

const TZ = "America/Sao_Paulo";

const FMT_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FMT_HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Dia local `YYYY-MM-DD` no fuso de Brasília. */
export function diaLocal(d: Date): string {
  return FMT_DIA.format(d);
}

/**
 * Dia local como `Date` na meia-noite UTC — formato que o Prisma `@db.Date`
 * grava sem escorregar de fuso (mesmo padrão de `new Date(iso+"T00:00:00Z")`).
 */
export function diaLocalDate(d: Date): Date {
  return new Date(diaLocal(d) + "T00:00:00.000Z");
}

/** Dia da semana (0=domingo..6=sábado) do dia LOCAL de Brasília. */
export function diaSemanaLocal(d: Date): number {
  const [y, m, dia] = diaLocal(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dia)).getUTCDay();
}

/** Hora local `HH:MM` (24h) no fuso de Brasília. */
export function horaLocal(d: Date): string {
  return FMT_HORA.format(d);
}

/** Minutos desde a meia-noite a partir de um `HH:MM`. */
export function minutosDoDia(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ── Atraso (S3) ─────────────────────────────────────────────────────────────

export type ResultadoAtraso = {
  atrasado: boolean;
  /** Minutos de atraso ALÉM da tolerância (0 se dentro). */
  atrasoMin: number;
};

/**
 * Avalia atraso da entrada frente à escala + tolerância (CLT art. 58 §1º).
 * Puramente INFORMATIVO — não altera status de falta/ok. Compara sempre no
 * horário local de Brasília. Sem entrada real ou sem escala → não atrasado.
 */
export function avaliarAtraso(
  entradaReal: Date | null,
  entradaEscala: string | null,
  toleranciaMin: number,
): ResultadoAtraso {
  if (!entradaReal || !entradaEscala) return { atrasado: false, atrasoMin: 0 };
  const real = minutosDoDia(horaLocal(entradaReal));
  const prevista = minutosDoDia(entradaEscala);
  const atraso = real - prevista - Math.max(0, toleranciaMin);
  return atraso > 0
    ? { atrasado: true, atrasoMin: atraso }
    : { atrasado: false, atrasoMin: 0 };
}
