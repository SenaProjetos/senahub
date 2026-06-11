import "server-only";
import frases from "../../public/frases.json";

type Frase = { id: number; autor: string; frase: string };

const LISTA = frases as Frase[];

/**
 * Frase do dia determinística: o dia do ano (0–365) indexa a lista de 366 frases.
 * A mesma frase aparece para todos os usuários e não se repete dentro do ano.
 */
export function fraseDoDia(d = new Date()): Frase {
  const inicio = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - inicio.getTime();
  const diaDoAno = Math.floor(diff / 86_400_000); // 1–366
  const idx = (diaDoAno - 1) % LISTA.length;
  return LISTA[idx] ?? LISTA[0]!;
}
