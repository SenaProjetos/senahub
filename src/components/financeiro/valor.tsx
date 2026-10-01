import { brl, brlComSinal, brlInteiro, cn } from "@/lib/utils";

/**
 * Valor em reais com o sinal escrito (+ / −), fonte mono tabular e a cor só como reforço. É o
 * jeito único de mostrar entrada, saída, saldo e resultado no Financeiro.
 *
 * `sentido`: `auto` colore pelo sinal e escreve + e −; `neutro` não colore e só escreve o −
 * (saldo de conta, caixa, total: "R$ 87.500", nunca "+R$ 87.500") — nada depende da cor.
 * `inteiro`: reais sem centavos, para resumos apertados (arredonda antes do sinal: −0,40 vira R$ 0).
 */
export function Valor({
  valor,
  sentido = "auto",
  inteiro = false,
  className,
}: {
  valor: number;
  sentido?: "auto" | "neutro";
  inteiro?: boolean;
  className?: string;
}) {
  const v = (inteiro ? Math.round(valor) : valor) || 0; // −0 viraria "−R$ 0,00"
  const cor = sentido === "neutro" || v === 0 ? "" : v > 0 ? "text-success" : "text-destructive";
  const texto = inteiro
    ? (v < 0 ? "−" : v > 0 && sentido === "auto" ? "+" : "") + brlInteiro(Math.abs(v))
    : sentido === "neutro" && v >= 0
      ? brl(v)
      : brlComSinal(v);
  return <span className={cn("font-mono tabular-nums", cor, className)}>{texto}</span>;
}
