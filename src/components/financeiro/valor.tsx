import { brl, brlComSinal, cn } from "@/lib/utils";

/**
 * Valor em reais com o sinal escrito (+ / −), fonte mono tabular e a cor só como reforço. É o
 * jeito único de mostrar entrada, saída, saldo e resultado no Financeiro.
 *
 * `sentido`: `auto` colore pelo sinal e escreve + e −; `neutro` não colore e só escreve o −
 * (saldo de conta, caixa, total: "R$ 87.500", nunca "+R$ 87.500") — nada depende da cor.
 */
export function Valor({
  valor,
  sentido = "auto",
  className,
}: {
  valor: number;
  sentido?: "auto" | "neutro";
  className?: string;
}) {
  const cor = sentido === "neutro" || valor === 0 ? "" : valor > 0 ? "text-success" : "text-destructive";
  const texto = sentido === "neutro" && valor >= 0 ? brl(valor) : brlComSinal(valor);
  return <span className={cn("font-mono tabular-nums", cor, className)}>{texto}</span>;
}
