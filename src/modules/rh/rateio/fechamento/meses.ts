import { mesesAbertos } from "./regras";

export type MesDaTela = { ano: number; mes: number; chave: string; emCurso: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const chaveDe = (ano: number, mes: number) => `${ano}-${pad(mes)}`;

function mesAnterior(chave: string): string {
  const [a, m] = chave.split("-").map(Number);
  return m === 1 ? chaveDe(a - 1, 12) : chaveDe(a, m - 1);
}

/**
 * Meses que a tela do rateio lista (R3.5), do mais novo ao mais antigo: o mês em curso (estimativa,
 * ainda não fecha), os 12 últimos meses terminados e todo mês terminado desde o corte do cálculo novo
 * que ficou sem fechar — esse não pode sumir da lista só porque passou de um ano.
 * PURO: `hojeSP` é o dia de hoje em São Paulo (`AAAA-MM-DD`).
 */
export function mesesDaTela(p: { corte: string; hojeSP: string; fechados: string[] }): MesDaTela[] {
  const atual = p.hojeSP.slice(0, 7);
  const ultimoTerminado = mesAnterior(atual);
  const chaves = new Set<string>([atual]);
  for (let i = 0, m = ultimoTerminado; i < 12; i++, m = mesAnterior(m)) chaves.add(m);
  for (const m of mesesAbertos({ corte: p.corte, ate: ultimoTerminado, fechados: p.fechados })) chaves.add(m);
  return [...chaves]
    .sort((a, b) => b.localeCompare(a))
    .map((chave) => {
      const [ano, mes] = chave.split("-").map(Number);
      return { ano, mes, chave, emCurso: chave === atual };
    });
}
