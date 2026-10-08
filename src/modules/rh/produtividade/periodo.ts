/**
 * Período das telas de horas (RH → Produtividade, Ponto → Minhas horas, card do Início) — **puro**,
 * importado por componentes de cliente: nada de Prisma, server-only ou Next aqui.
 *
 * Dia = `YYYY-MM-DD` no calendário de Brasília (quem chama passa `hoje` = `diaLocal(new Date())`).
 * Sem teto de período (decisão do dono, 2026-10-07): acima de `LIMITE_DIARIO` dias o gráfico deixa de
 * ser dia a dia e agrupa por semana, porque ~7 px por barra já é o limite de leitura.
 */

export const LIMITE_DIARIO = 92;

export type AtalhoPeriodo = "7d" | "14d" | "30d" | "mes_atual" | "mes_anterior";

export const ATALHOS: readonly { id: AtalhoPeriodo; rotulo: string }[] = [
  { id: "7d", rotulo: "7 dias" },
  { id: "14d", rotulo: "14 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "mes_atual", rotulo: "Mês atual" },
  { id: "mes_anterior", rotulo: "Mês anterior" },
];

export type Granularidade = "dia" | "semana";

export type Periodo = { de: string; ate: string; atalho: AtalhoPeriodo | null; granularidade: Granularidade };

export type Bucket = { inicio: string; fim: string; indices: number[] };

const PADRAO: AtalhoPeriodo = "14d";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/**
 * "Sem teto" é sobre o desenho, não sobre aceitar qualquer ano: `?de=1000-01-01` (ou um ano digitado
 * pela metade no campo de data) montaria centenas de milhares de dias por pessoa no servidor.
 */
const PRIMEIRO_DIA = "2000-01-01";

function paraUtc(dia: string): Date {
  return new Date(`${dia}T00:00:00Z`);
}

function diaValido(dia: string | undefined): dia is string {
  if (!dia || !ISO.test(dia) || dia < PRIMEIRO_DIA) return false;
  const d = paraUtc(dia);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

export function somarDias(dia: string, n: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + n)).toISOString().slice(0, 10);
}

export function listarDias(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

export function intervaloDoAtalho(atalho: AtalhoPeriodo, hoje: string): { de: string; ate: string } {
  switch (atalho) {
    case "7d":
      return { de: somarDias(hoje, -6), ate: hoje };
    case "14d":
      return { de: somarDias(hoje, -13), ate: hoje };
    case "30d":
      return { de: somarDias(hoje, -29), ate: hoje };
    case "mes_atual":
      return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
    case "mes_anterior": {
      const [ano, mes] = hoje.split("-").map(Number);
      const de = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10);
      const ate = new Date(Date.UTC(ano, mes - 1, 0)).toISOString().slice(0, 10);
      return { de, ate };
    }
  }
}

/**
 * Regra única do intervalo livre: o seletor mostra este motivo e não deixa aplicar; o servidor usa a
 * mesma regra para cair no padrão. `ate` no futuro não é motivo — o servidor corta em hoje.
 */
export function motivoIntervaloInvalido(de: string, ate: string, hoje: string): string | null {
  if (!de || !ate) return "Informe as duas datas.";
  if (de < PRIMEIRO_DIA || ate < PRIMEIRO_DIA) return "Escolha uma data a partir de 2000.";
  if (!diaValido(de) || !diaValido(ate)) return "Data inválida.";
  if (de > ate) return "A data inicial é depois da final.";
  if (de > hoje) return "A data inicial é depois de hoje.";
  return null;
}

/** Lê `?de=&ate=`. Qualquer coisa inválida (data impossível, de > ate, de no futuro) volta ao padrão. */
export function resolverPeriodo(params: { de?: string; ate?: string }, hoje: string): Periodo {
  let { de, ate } = intervaloDoAtalho(PADRAO, hoje);
  if (params.de && params.ate && motivoIntervaloInvalido(params.de, params.ate, hoje) === null) {
    de = params.de;
    ate = params.ate > hoje ? hoje : params.ate;
  }
  const atalho =
    ATALHOS.find((a) => {
      const i = intervaloDoAtalho(a.id, hoje);
      return i.de === de && i.ate === ate;
    })?.id ?? null;
  const qtdDias = Math.round((paraUtc(ate).getTime() - paraUtc(de).getTime()) / 86_400_000) + 1;
  return { de, ate, atalho, granularidade: qtdDias > LIMITE_DIARIO ? "semana" : "dia" };
}

/**
 * Agrupa os índices de `dias` para o gráfico. Semanal quebra na segunda-feira, mas o 1º bucket
 * começa no 1º dia do período (nunca numa segunda fora do intervalo pedido).
 */
export function bucketsDoPeriodo(dias: string[], granularidade: Granularidade): Bucket[] {
  if (granularidade === "dia") return dias.map((dia, i) => ({ inicio: dia, fim: dia, indices: [i] }));
  const buckets: Bucket[] = [];
  dias.forEach((dia, i) => {
    const ehSegunda = paraUtc(dia).getUTCDay() === 1;
    const atual = buckets[buckets.length - 1];
    if (!atual || ehSegunda) buckets.push({ inicio: dia, fim: dia, indices: [i] });
    else {
      atual.fim = dia;
      atual.indices.push(i);
    }
  });
  return buckets;
}
