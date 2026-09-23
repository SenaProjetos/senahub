import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { listarVersoesAdmin } from "@/modules/projetos/nomenclatura/versoes-queries";
import { NomenclaturaVersoesView } from "@/components/configuracoes/nomenclatura-versoes-view";

export const metadata: Metadata = { title: "Nomenclatura" };

export default async function NomenclaturaConfigPage() {
  await requirePermission("configuracoes", "gerir");
  const versoes = await listarVersoesAdmin();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/configuracoes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Nomenclatura</h2>
        <p className="text-sm text-muted-foreground">
          Versões do padrão de nome de arquivo. Versão publicada é imutável — corrigir é publicar uma nova. Projeto
          novo recebe a versão vigente na data em que é criado; publicar não muda projeto nenhum já existente.
        </p>
      </div>
      <NomenclaturaVersoesView versoes={versoes} />
    </div>
  );
}
