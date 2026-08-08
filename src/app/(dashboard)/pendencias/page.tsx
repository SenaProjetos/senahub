import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { visaoConsolidadaPendencias } from "@/modules/projetos/pendencias/queries";
import { PendenciasConsolidadoView } from "@/components/projetos/pendencias-consolidado-view";

export const metadata: Metadata = { title: "Apontamentos" };

/**
 * Visão consolidada de apontamentos abertos (item 16) — mesmo gate de leitura de
 * `/arquivos` (`arquivos:ver`): não introduz um recurso de permissão novo (e o `db:seed` que
 * isso exigiria em produção) só para uma tela que agrega dado já visível projeto a projeto.
 */
export default async function PendenciasConsolidadoPage() {
  const user = await requirePermission("arquivos", "ver");
  const itens = await visaoConsolidadaPendencias(user);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Apontamentos</h1>
        <p className="text-sm text-muted-foreground">
          Todos os apontamentos abertos, agrupados por projeto/disciplina/responsável, com tempo em aberto.
        </p>
      </div>
      <PendenciasConsolidadoView itens={itens} />
    </div>
  );
}
