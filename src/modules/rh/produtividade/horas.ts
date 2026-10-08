import { minutosPorDiaSessao } from "@/modules/ponto/engine";
import type { TipoAlocacaoPonto } from "@/modules/ponto/alocacao";
import { listarDias, type Bucket } from "./periodo";

/**
 * Horas por pessoa, por dia e por destino — **puro** (cliente e servidor). É a regra única das telas
 * de horas: RH → Produtividade, Ponto → Minhas horas e o card do Início leem daqui, então uma pessoa
 * num dia nunca mostra dois números.
 *
 * Soma em MINUTOS. Totais e médias saem com 1 casa; as séries (`porDia`, `porDestino`) saem em horas
 * SEM arredondar, porque a tela ainda soma por pilha e por semana — arredondar antes faria 3 × 20 min
 * virar 0,9h na barra e 1h no ranking. Quem mostra formata (`rotuloHoras`).
 * A divisão da sessão pelos dias é a do ponto (`minutosPorDiaSessao`): cruza a meia-noite repartindo,
 * e sessão aberta conta até `agora`.
 */

export type SessaoHoras = {
  userId: string;
  inicio: Date;
  fim: Date | null;
  tipoAlocacao: TipoAlocacaoPonto;
  projeto: { id: string; codigo: string; nome: string } | null;
};

export const DESTINO_REUNIOES = "reunioes";
export const DESTINO_SEM_PROJETO = "sem_projeto";
export const DESTINO_OUTROS = "outros";

const ROTULOS_FIXOS: Record<string, string> = {
  [DESTINO_REUNIOES]: "Reuniões",
  [DESTINO_SEM_PROJETO]: "Sem projeto",
  [DESTINO_OUTROS]: "Outros projetos",
};

export type HorasPessoa = {
  userId: string;
  totalHoras: number;
  diasComRegistro: number;
  mediaPorDiaComRegistro: number;
  /** Alinhado a `dias`, em horas sem arredondar. */
  porDia: number[];
  /** Chave do destino → horas (sem arredondar) alinhadas a `dias`. */
  porDestino: Record<string, number[]>;
};

export type HorasDoPeriodo = { dias: string[]; destinos: Record<string, string>; pessoas: HorasPessoa[] };

export type SerieHoras = { chave: string; rotulo: string; valores: number[] };

const umaCasa = (n: number) => Math.round(n * 10) / 10;
const horas = (minutos: number) => umaCasa(minutos / 60);
const horasCruas = (minutos: number) => minutos / 60;

/** `p:<projetoId>` | reuniões (interna + externa) | sem projeto — tipo projeto sem projeto cai aqui. */
export function chaveDestino(s: Pick<SessaoHoras, "tipoAlocacao" | "projeto">): string {
  if (s.tipoAlocacao === "projeto" && s.projeto) return `p:${s.projeto.id}`;
  if (s.tipoAlocacao === "reuniao_interna" || s.tipoAlocacao === "reuniao_externa") return DESTINO_REUNIOES;
  return DESTINO_SEM_PROJETO;
}

export function agregarHoras(
  sessoes: SessaoHoras[],
  { de, ate, agora, userIds }: { de: string; ate: string; agora: Date; userIds: string[] },
): HorasDoPeriodo {
  const dias = listarDias(de, ate);
  const indiceDoDia = new Map(dias.map((d, i) => [d, i]));
  const destinos: Record<string, string> = {};
  // userId → destino → minutos por índice de dia
  const minutos = new Map<string, Map<string, number[]>>(userIds.map((id) => [id, new Map()]));

  for (const s of sessoes) {
    const porDestino = minutos.get(s.userId);
    if (!porDestino) continue;
    const chave = chaveDestino(s);
    for (const [dia, min] of minutosPorDiaSessao(s.inicio, s.fim, agora)) {
      const i = indiceDoDia.get(dia);
      if (i === undefined || min <= 0) continue;
      let serie = porDestino.get(chave);
      if (!serie) {
        serie = new Array<number>(dias.length).fill(0);
        porDestino.set(chave, serie);
        destinos[chave] ??= s.projeto && chave.startsWith("p:") ? `${s.projeto.codigo} · ${s.projeto.nome}` : ROTULOS_FIXOS[chave];
      }
      serie[i] += min;
    }
  }

  const pessoas = userIds.map((userId): HorasPessoa => {
    const porDestinoMin = minutos.get(userId)!;
    const porDiaMin = new Array<number>(dias.length).fill(0);
    const porDestino: Record<string, number[]> = {};
    for (const [chave, serie] of porDestinoMin) {
      serie.forEach((m, i) => (porDiaMin[i] += m));
      porDestino[chave] = serie.map(horasCruas);
    }
    const totalMin = porDiaMin.reduce((s, m) => s + m, 0);
    const diasComRegistro = porDiaMin.filter((m) => m > 0).length;
    return {
      userId,
      totalHoras: horas(totalMin),
      diasComRegistro,
      mediaPorDiaComRegistro: diasComRegistro === 0 ? 0 : horas(totalMin / diasComRegistro),
      porDia: porDiaMin.map(horasCruas),
      porDestino,
    };
  });

  return { dias, destinos, pessoas };
}

/** Barras empilhadas de UMA pessoa: os `n` maiores projetos, depois Outros, Reuniões e Sem projeto. */
export function empilharPorDestino(pessoa: HorasPessoa, destinos: Record<string, string>, n = 5): SerieHoras[] {
  const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const projetos = Object.entries(pessoa.porDestino)
    .filter(([chave, v]) => chave.startsWith("p:") && soma(v) > 0)
    .sort((a, b) => soma(b[1]) - soma(a[1]) || (destinos[a[0]] ?? "").localeCompare(destinos[b[0]] ?? ""));

  const series: SerieHoras[] = projetos
    .slice(0, n)
    .map(([chave, valores]) => ({ chave, rotulo: destinos[chave] ?? chave, valores }));

  const resto = projetos.slice(n);
  if (resto.length > 0) {
    const valores = pessoa.porDia.map((_, i) => resto.reduce((s, [, v]) => s + v[i], 0));
    series.push({ chave: DESTINO_OUTROS, rotulo: ROTULOS_FIXOS[DESTINO_OUTROS], valores });
  }
  for (const chave of [DESTINO_REUNIOES, DESTINO_SEM_PROJETO]) {
    const valores = pessoa.porDestino[chave];
    if (valores && soma(valores) > 0) series.push({ chave, rotulo: ROTULOS_FIXOS[chave], valores });
  }
  return series;
}

/** Soma por dia/semana, sem arredondar (quem mostra formata). */
export function somarPorBucket(valores: number[], buckets: Bucket[]): number[] {
  return buckets.map((b) => b.indices.reduce((s, i) => s + (valores[i] ?? 0), 0));
}
