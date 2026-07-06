import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/session";
import { catalogosPranchaConfig } from "@/modules/projetos/pranchas/queries";
import { nomenclaturaGlobal } from "@/modules/projetos/nomenclatura/queries";
import { ListaMestreConfigView } from "@/components/configuracoes/lista-mestre-config-view";
import { NomenclaturaForm } from "@/components/projetos/nomenclatura-form";

export const metadata: Metadata = { title: "Lista Mestre" };

export default async function ListaMestreConfigPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const [catalogos, nomencla] = await Promise.all([catalogosPranchaConfig(null), nomenclaturaGlobal()]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/configuracoes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Lista Mestre</h2>
        <p className="text-sm text-muted-foreground">
          Siglas de folha, tipo e fase usadas na composição do código das folhas técnicas (globais a todos os projetos).
        </p>
      </div>
      <NomenclaturaForm escopo="global" inicial={{ exigir: nomencla.exigir, padrao: nomencla.padrao }} />
      <ListaMestreConfigView catalogos={catalogos} />
    </div>
  );
}
