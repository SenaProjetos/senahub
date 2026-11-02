/** Regras puras de capacidade e vigência usadas por Recursos e RH. */

export type FaixaData = { inicio: string | null; fim: string | null };

/** Datas são YYYY-MM-DD e os limites de uma faixa são inclusivos. */
export function diaEstaNaFaixa(dia: string, faixa: FaixaData): boolean {
  return (!faixa.inicio || faixa.inicio <= dia) && (!faixa.fim || faixa.fim >= dia);
}

export function minutosDisponiveisNoDia(
  minutosDeJornada: number,
  multiplicador: number,
  indisponivel: boolean,
): number {
  if (indisponivel) return 0;
  return Math.max(0, Math.round(minutosDeJornada * multiplicador));
}

export function percentualAlocadoNoDia(dia: string, alocacoes: (FaixaData & { percentual: number })[]): number {
  return alocacoes.reduce((total, alocacao) => total + (diaEstaNaFaixa(dia, alocacao) ? alocacao.percentual : 0), 0);
}

export function capacidadeEfetivaPctNoDia(
  dia: string,
  capacidadePct: number,
  indisponibilidades: FaixaData[],
): number {
  return indisponibilidades.some((faixa) => diaEstaNaFaixa(dia, faixa)) ? 0 : capacidadePct;
}

/** Chave de semana no padrão ISO, inclusive nas viradas de ano. */
export function chaveSemanaIso(dia: string): string {
  // Tudo em meia-noite UTC: com meio-dia a conta do dia do ano ganhava meio dia e a semana
  // avançava cedo quando o dia da quinta-feira da semana era múltiplo de 7 (2027-01-04 virava W02).
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, diaDoMes));
  const diaDaSemana = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaDaSemana); // a quinta-feira da semana decide o ano ISO
  const inicioAno = Date.UTC(data.getUTCFullYear(), 0, 1);
  const semana = Math.ceil(((data.getTime() - inicioAno) / 86_400_000 + 1) / 7);
  return `${data.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

function proximoDia(dia: string): string {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, diaDoMes + 1)).toISOString().slice(0, 10);
}

/** Verdadeiro quando algum dia da janela ultrapassa a capacidade disponível. */
export function superalocadoNaJanela(
  inicio: string,
  fim: string,
  capacidadePct: number,
  alocacoes: (FaixaData & { percentual: number })[],
  indisponibilidades: FaixaData[],
): boolean {
  if (!inicio || !fim || fim < inicio) return false;
  for (let dia = inicio; dia <= fim; dia = proximoDia(dia)) {
    if (percentualAlocadoNoDia(dia, alocacoes) > capacidadeEfetivaPctNoDia(dia, capacidadePct, indisponibilidades)) {
      return true;
    }
  }
  return false;
}
