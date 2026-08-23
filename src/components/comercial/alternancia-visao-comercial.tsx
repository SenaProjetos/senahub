import Link from "next/link";
import { Button } from "@/components/ui/button";

/** F6.6 — a URL mantém o recorte compartilhável, sem estado local. */
export function AlternanciaVisaoComercial({ meus }: { meus: boolean }) {
  return (
    <div className="flex items-center gap-1" aria-label="Escopo do painel comercial">
      <Button size="sm" variant={meus ? "outline" : "secondary"} aria-pressed={!meus} render={<Link href="/comercial" />}>
        Todos
      </Button>
      <Button size="sm" variant={meus ? "secondary" : "outline"} aria-pressed={meus} render={<Link href="/comercial?visao=meus" />}>
        Meus
      </Button>
    </div>
  );
}
