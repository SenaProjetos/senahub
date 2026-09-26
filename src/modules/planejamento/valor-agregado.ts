/**
 * Valor Agregado (F8 — D1, "EVM") — regras puras, sem I/O. A leitura do banco fica em
 * `valor-agregado-service.ts`.
 *
 * Mede o projeto contra a LINHA DE BASE, na DATA DE STATUS (D39), em duas réguas do mesmo cálculo:
 *  - HORAS: orçamento = horas previstas congeladas; realizado = horas apontadas no ponto. Serve a
 *    quem coordena, sem expor taxa de remuneração.
 *  - CUSTO (R$): orçamento = custo previsto congelado (F7.1); realizado = horas apontadas × custo/hora
 *    de Recursos — a MESMA base do orçamento. Só para quem vê o financeiro.
 *
 * Os números, com o nome do MS Project entre parênteses:
 *  - ONT (orçamento no término, BAC): soma do orçamento das folhas da baseline.
 *  - VP (valor planejado, COTA/BCWS): quanto do orçamento a baseline previa pronto até a Data de
 *    Status — por dias úteis decorridos da barra de base (distribuição uniforme, a do Project).
 *  - VA (valor agregado, COTR/BCWP): orçamento × % concluído INFORMADO (D19) de cada folha.
 *  - CR (custo real, CRTR/ACWP): o realizado até a Data de Status.
 *  - IDP = VA ÷ VP (prazo) e IDC = VA ÷ CR (custo/horas); ENT = ONT ÷ IDC; VNT = ONT − ENT.
 *
 * DESCONHECIDO NUNCA VIRA ZERO: folha da baseline sem orçamento (perfil, pessoa sem taxa, baseline
 * congelada antes de haver custo) deixa a régua inteira sem número, com o motivo. Um índice sobre
 * orçamento incompleto é exatamente o que faz a equipe deixar de confiar no relatório (spec §5).
 *
 * As datas reais NÃO entram (a D6 ainda não existe): o cálculo não "empurra" a baseline.
 */

type Dia = string;

export type LinhaBaseEvm = {
  /** A linha de hoje. Nulo = excluída depois do congelamento (conta como não feita). */
  tarefaId: string | null;
  inicio: Dia;
  fim: Dia;
  horas: number | null;
  custo: number | null;
  /** Era agrupamento no congelamento — fora da soma (as folhas já carregam o trabalho). */
  resumo: boolean;
};

export type Regua = "horas" | "custo";

export type IndicesEvm = {
  ont: number;
  vp: number;
  va: number;
  /** Nulo = realizado desconhecido (ex.: alguém apontou sem custo/hora cadastrado). */
  cr: number | null;
  /** VA − VP. Negativo = atrás da baseline. */
  vpr: number;
  /** VA − CR. Negativo = gastando mais do que o avanço vale. */
  vc: number | null;
  idp: number | null;
  idc: number | null;
  ent: number | null;
  vnt: number | null;
  /** VP ÷ ONT e VA ÷ ONT, em 0–100. */
  planejadoPct: number;
  realizadoPct: number;
};

export type ResultadoRegua = { ok: true; indices: IndicesEvm; motivoRealizado: string | null } | { ok: false; motivo: string };

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Fração da barra de base que deveria estar pronta na Data de Status, por DIAS ÚTEIS decorridos
 * (inclusive o próprio dia). Antes do início: 0; do término em diante: 1. Marco (início = fim)
 * vale 0 ou 1.
 */
export function fracaoPlanejada(inicio: Dia, fim: Dia, dataStatus: Dia, diasUteis: (a: Dia, b: Dia) => number): number {
  if (dataStatus < inicio) return 0;
  if (dataStatus >= fim) return 1;
  const total = diasUteis(inicio, fim);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, diasUteis(inicio, dataStatus) / total));
}

/**
 * Uma régua do Valor Agregado. `progresso` é o % de HOJE de cada linha (0–100): da folha, o
 * informado; de uma linha que virou agrupamento depois da baseline, o calculado dos filhos.
 */
export function calcularRegua(p: {
  regua: Regua;
  linhas: readonly LinhaBaseEvm[];
  progresso: ReadonlyMap<string, number>;
  dataStatus: Dia;
  diasUteis: (a: Dia, b: Dia) => number;
  /** O realizado até a Data de Status. Nulo = desconhecido (`motivoRealizado` diz por quê). */
  realizado: number | null;
  motivoRealizado?: string | null;
}): ResultadoRegua {
  const folhas = p.linhas.filter((l) => !l.resumo);
  if (folhas.length === 0) return { ok: false, motivo: "A linha de base não tem atividades." };

  const semValor = folhas.filter((l) => (p.regua === "horas" ? l.horas : l.custo) == null).length;
  if (semValor > 0) {
    return {
      ok: false,
      motivo:
        p.regua === "horas"
          ? `${semValor} atividade(s) da linha de base sem horas previstas — estime as horas e replaneje para medir em horas.`
          : `${semValor} atividade(s) da linha de base sem custo (perfil, pessoa sem custo/hora, ou baseline congelada antes do custo) — complete e replaneje para medir em R$.`,
    };
  }

  let ont = 0;
  let vp = 0;
  let va = 0;
  for (const l of folhas) {
    const v = (p.regua === "horas" ? l.horas : l.custo) as number;
    ont += v;
    vp += v * fracaoPlanejada(l.inicio, l.fim, p.dataStatus, p.diasUteis);
    const pct = l.tarefaId ? Math.min(100, Math.max(0, p.progresso.get(l.tarefaId) ?? 0)) : 0;
    va += (v * pct) / 100;
  }
  if (!(ont > 0)) {
    return {
      ok: false,
      motivo: p.regua === "horas" ? "A linha de base não tem horas previstas." : "A linha de base não tem custo previsto.",
    };
  }

  const cr = p.realizado;
  const idp = vp > 0 ? va / vp : null;
  const idc = cr != null && cr > 0 ? va / cr : null;
  const ent = idc != null && idc > 0 ? ont / idc : null;
  return {
    ok: true,
    motivoRealizado: cr == null ? (p.motivoRealizado ?? "Realizado desconhecido.") : null,
    indices: {
      ont: r2(ont),
      vp: r2(vp),
      va: r2(va),
      cr: cr == null ? null : r2(cr),
      vpr: r2(va - vp),
      vc: cr == null ? null : r2(va - cr),
      idp: idp == null ? null : Math.round(idp * 1000) / 1000,
      idc: idc == null ? null : Math.round(idc * 1000) / 1000,
      ent: ent == null ? null : r2(ent),
      vnt: ent == null ? null : r2(ont - ent),
      planejadoPct: Math.round((vp / ont) * 1000) / 10,
      realizadoPct: Math.round((va / ont) * 1000) / 10,
    },
  };
}

/** Leitura em uma palavra, para a tela: ≥ 1 em dia/econômico; 0,9–1 atenção; < 0,9 crítico. */
export function faixaDoIndice(i: number | null): "sem_dado" | "bom" | "atencao" | "critico" {
  if (i == null) return "sem_dado";
  if (i >= 1) return "bom";
  if (i >= 0.9) return "atencao";
  return "critico";
}
