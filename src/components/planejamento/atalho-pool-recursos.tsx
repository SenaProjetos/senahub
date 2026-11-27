import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Atalho do Planejamento para o pool de recursos (a tela Por pessoa de Recursos). Com `projetoId`, abre já filtrada no
 * projeto. Quem renderiza decide se mostra: a tela de destino exige `recursos:ver`.
 */
export function AtalhoPoolRecursos({ projetoId, compacto = false }: { projetoId?: string; compacto?: boolean }) {
  const href = projetoId ? `/recursos/por-pessoa?projeto=${encodeURIComponent(projetoId)}` : "/recursos/por-pessoa";
  return (
    <Button
      size="sm"
      variant="outline"
      className={compacto ? "h-7" : undefined}
      title={projetoId ? "Abrir a carga da equipe deste projeto, pessoa por pessoa" : "Abrir a carga da equipe, pessoa por pessoa"}
      render={<Link href={href} />}
    >
      <Users className="size-3.5" aria-hidden /> Pool de recursos
    </Button>
  );
}
