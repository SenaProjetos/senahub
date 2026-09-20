import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { catalogoDisciplinas } from "@/modules/projetos/queries";
import { listarClausulas, listarModelosProposta } from "@/modules/comercial/proposta-composta/queries";
import { ModelosPropostaView } from "@/components/comercial/modelos-proposta-view";

export const metadata: Metadata = { title: "Modelos de proposta" };

/**
 * Biblioteca de cláusulas e modelos (ADR-0006). Gate `comercial:modelos`, e não `gerir`: editar
 * o texto daqui muda toda proposta montada dali em diante.
 */
export default async function ModelosPropostaPage() {
  await requirePermission("comercial", "modelos");
  const [clausulas, modelos, disciplinas] = await Promise.all([
    listarClausulas(),
    listarModelosProposta(),
    catalogoDisciplinas(),
  ]);
  return (
    <ModelosPropostaView
      clausulas={clausulas}
      modelos={modelos}
      disciplinas={disciplinas.map((d) => ({ id: d.id, nome: d.nome }))}
    />
  );
}
