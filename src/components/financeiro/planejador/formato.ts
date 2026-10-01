/** Formatação do planejador (centavos → texto). Sem React; usado pelos componentes da tela. */
import { brl, brlComSinal, brlInteiro } from "@/lib/utils";
import { diaDaSemana, diaMes } from "@/modules/financeiro/liquidez/datas";
import type { DataIso } from "@/modules/financeiro/liquidez/tipos";

export const reais = (c: number) => c / 100;
export const brlC = (c: number) => brl(c / 100).replace(/ /g, " ");
export const brlCSinal = (c: number) => brlComSinal(c / 100);
/** Número de destaque, sem centavos (como o mock aprovado): "R$ 87.500". */
export const brlCInteiro = (c: number) => brlInteiro(c / 100);

/** "05/10, seg". */
export function rotuloDia(d: DataIso): string {
  return `${diaMes(d)}, ${diaDaSemana(d)}`;
}

/** Eixo do gráfico: "90 mil", "1,2 mi", "−5 mil". */
export function rotuloCompacto(c: number): string {
  const v = c / 100;
  const sinal = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sinal}${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${sinal}${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${sinal}${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** Até 5 marcas "redondas" entre `min` e `max` (centavos), para as linhas de grade do gráfico. */
export function marcasDoEixo(min: number, max: number, alvo = 4): number[] {
  const faixa = max - min;
  if (!(faixa > 0)) return [min];
  const bruto = faixa / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => faixa / p <= alvo + 1) ?? 10 * potencia;
  const marcas: number[] = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max; v += passo) marcas.push(Math.round(v));
  return marcas;
}
