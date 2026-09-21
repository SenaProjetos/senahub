import Link from "next/link";
import { Button } from "@/components/ui/button";

/** F6.6 — a URL mantém o recorte compartilhável, sem estado local. */
export function AlternanciaVisaoComercial({
  meus,
  basePath = "/comercial",
}: {
  meus: boolean;
  /** Rota da própria tela — sem isso o link "Todos"/"Meus" sempre voltava pra Home (F7.11). */
  basePath?: string;
}) {
  return (
    <div className="flex items-center gap-1" aria-label="Escopo do painel comercial">
      <Button size="sm" variant={meus ? "outline" : "secondary"} aria-pressed={!meus} render={<Link href={basePath} />}>
        Todos
      </Button>
      <Button
        size="sm"
        variant={meus ? "secondary" : "outline"}
        aria-pressed={meus}
        render={<Link href={`${basePath}?visao=meus`} />}
      >
        Meus
      </Button>
    </div>
  );
}
