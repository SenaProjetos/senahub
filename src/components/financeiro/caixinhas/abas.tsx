import Link from "next/link";
import { Button } from "@/components/ui/button";

const ABAS = [
  { id: "caixinhas", rotulo: "Caixinhas", href: "/financeiro/caixinhas" },
  { id: "regras", rotulo: "Regras de distribuição", href: "/financeiro/distribuicao" },
  { id: "extrato", rotulo: "Extrato de movimentos", href: "/financeiro/caixinhas?aba=extrato" },
] as const;

export type AbaCaixinhas = (typeof ABAS)[number]["id"];

/** As três seções de Caixinhas (mock): cartões, regras de distribuição e extrato. */
export function AbasCaixinhas({ ativa }: { ativa: AbaCaixinhas }) {
  return (
    <div role="tablist" aria-label="Seções de caixinhas" className="flex flex-wrap gap-1">
      {ABAS.map((a) => (
        <Button key={a.id} size="sm" role="tab" aria-selected={ativa === a.id} variant={ativa === a.id ? "default" : "outline"} render={<Link href={a.href} />}>
          {a.rotulo}
        </Button>
      ))}
    </div>
  );
}
