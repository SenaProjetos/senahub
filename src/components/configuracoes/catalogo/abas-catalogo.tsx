import Link from "next/link";
import { cn } from "@/lib/utils";

export type AbaNomenclatura = "disciplinas" | "fases" | "tipos" | "folhas";

const ABAS: { valor: AbaNomenclatura; rotulo: string }[] = [
  { valor: "disciplinas", rotulo: "Disciplinas" },
  { valor: "fases", rotulo: "Fases" },
  { valor: "tipos", rotulo: "Tipos de documento" },
  { valor: "folhas", rotulo: "Formatos de folha" },
];

/**
 * Abas da tela única — as mesmas nas duas lentes (uma versão ou "todas"). "Formatos de folha" não tem
 * versão (E11) e é de quem administra a configuração; quem não administra não vê a aba.
 */
export function AbasCatalogo({ lente, aba, podeGerir }: { lente: number | "todas"; aba: AbaNomenclatura; podeGerir: boolean }) {
  return (
    <nav aria-label="Seções do catálogo" className="flex flex-wrap gap-1 border-b">
      {ABAS.filter((a) => a.valor !== "folhas" || podeGerir).map((a) => (
        <Link
          key={a.valor}
          href={`/configuracoes/nomenclatura/${lente}?aba=${a.valor}`}
          aria-current={a.valor === aba ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3.5 py-2.5 text-sm",
            a.valor === aba ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
