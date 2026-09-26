/**
 * O % concluído que valia numa DATA — regra pura (decisão #17), sem I/O.
 *
 * O Valor Agregado compara o previsto com o feito numa Data de Status. Até aqui ele usava o % de HOJE:
 * reapurar uma data passada dava um VA otimista (o avanço de hoje aplicado a uma semana atrás), e a
 * apuração gravada não podia ser recalculada nem conferida. Com o histórico, cada linha responde "quanto
 * eu tinha naquele dia".
 *
 * Duas regras que não são óbvias:
 *
 * 1. **Vale também o que foi digitado DEPOIS, se foi digitado enquanto aquela era a Data de Status.**
 *    É o jeito normal de trabalhar, e o mesmo do MS Project: a Data de Status é sexta, a coordenação
 *    atualiza os percentuais na segunda "referentes a sexta" e só então apura. Filtrar apenas pelo
 *    relógio jogaria fora exatamente o que a pessoa acabou de informar — e a apuração sairia PIOR que a
 *    de antes do histórico.
 * 2. **Antes do primeiro registro vale o `anterior` dele**, não o valor mais antigo registrado. O
 *    registro diz "mudou de 0 para 40 no dia 15"; perguntar pelo dia 10 tem de devolver 0. Devolver 40
 *    seria trazer o futuro para o passado — o erro que o histórico existe para evitar.
 *
 * Linha sem registro nenhum cai no % atual: é o comportamento de antes do histórico, e é o que mantém a
 * conta de pé nas linhas que ninguém mexeu desde o deploy (em vez de zerar o avanço de todo mundo).
 */

/** `YYYY-MM-DD`. */
export type Dia = string;

export type RegistroProgresso = {
  tarefaId: string;
  progresso: number;
  /** O % que a linha tinha antes desta mudança. */
  anterior: number;
  /** Dia (local) em que foi informado. */
  emDia: Dia;
  /** Para ordenar duas mudanças do mesmo dia: milissegundos do relógio. */
  emOrdem: number;
  /** A Data de Status do projeto naquele momento; `null` = não havia. */
  dataStatus: Dia | null;
};

const dentroDoLimite = (r: RegistroProgresso, dataStatus: Dia) => r.emDia <= dataStatus || r.dataStatus === dataStatus;

/**
 * % de cada linha na `dataStatus`. `atuais` é o % gravado hoje, usado só onde não há registro.
 *
 * `registros` pode vir em qualquer ordem — a função ordena.
 */
export function progressoNaData(
  registros: readonly RegistroProgresso[],
  dataStatus: Dia,
  atuais: ReadonlyMap<string, number>,
): Map<string, number> {
  const porTarefa = new Map<string, RegistroProgresso[]>();
  for (const r of registros) {
    const lista = porTarefa.get(r.tarefaId) ?? [];
    lista.push(r);
    porTarefa.set(r.tarefaId, lista);
  }

  const saida = new Map<string, number>();
  for (const [tarefaId, atual] of atuais) saida.set(tarefaId, atual);

  for (const [tarefaId, lista] of porTarefa) {
    const ordenada = [...lista].sort((a, b) => a.emOrdem - b.emOrdem);
    const validos = ordenada.filter((r) => dentroDoLimite(r, dataStatus));
    if (validos.length > 0) {
      saida.set(tarefaId, validos[validos.length - 1].progresso);
    } else {
      // Nenhuma mudança até essa data: o valor de então é o "antes" da primeira mudança.
      saida.set(tarefaId, ordenada[0].anterior);
    }
  }
  return saida;
}

/**
 * Linhas cujo % veio do valor de HOJE por falta de registro — a tela avisa, porque nessas o VA de uma
 * data passada continua otimista (é o estado de antes da decisão #17, só que agora visível).
 */
export function linhasSemHistorico(
  registros: readonly RegistroProgresso[],
  atuais: ReadonlyMap<string, number>,
): string[] {
  const comRegistro = new Set(registros.map((r) => r.tarefaId));
  // Linha em 0% não interessa: sem avanço, o % de hoje e o de qualquer data passada são o mesmo zero.
  return [...atuais.entries()].filter(([id, pct]) => pct > 0 && !comRegistro.has(id)).map(([id]) => id);
}
