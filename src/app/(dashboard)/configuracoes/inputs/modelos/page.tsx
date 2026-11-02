import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarModelos } from "@/modules/inputs/modelo-queries";
import { ModelosBriefingView } from "@/components/configuracoes/modelos-briefing-view";

export const metadata: Metadata = { title: "Modelos de formulário" };

export default async function ModelosBriefingPage() {
  await requirePermission("configuracoes", "gerir");
  const modelos = await listarModelos();
  return (
    <ModelosBriefingView
      modelos={modelos.map((m) => ({ ...m, atualizadoEm: m.atualizadoEm.toISOString() }))}
    />
  );
}
