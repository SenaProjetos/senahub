import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarModelos } from "@/modules/documentos/queries";
import { DocumentosView } from "@/components/documentos/documentos-view";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentosPage() {
  const user = await requirePermission("documentos", "ver");
  const podeGerir = await can(user.role, "documentos", "gerir");
  const modelos = await listarModelos({ id: user.id, role: user.role });
  return (
    <DocumentosView
      podeGerir={podeGerir}
      viewer={{ id: user.id, role: user.role, isAdmin: user.role === "admin" }}
      modelos={modelos.map((m) => ({
        id: m.id,
        nome: m.nome,
        tipo: m.tipo,
        fonte: m.fonte,
        versoes: m._count.versoes,
        atualizadoEm: m.updatedAt.toISOString(),
        donoId: m.donoId,
        visibilidade: m.visibilidade,
        perfis: m.perfis,
      }))}
    />
  );
}
