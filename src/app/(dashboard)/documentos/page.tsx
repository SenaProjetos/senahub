import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listarModelos } from "@/modules/documentos/queries";
import { fontesPermitidasOpcoes } from "@/modules/documentos/fontes-perm";
import { listarDatasetsParaFonte } from "@/modules/documentos/dataset-queries";
import { perfisAtivosParaSelect } from "@/modules/perfis/queries";
import { DocumentosView } from "@/components/documentos/documentos-view";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentosPage() {
  const user = await requirePermission("documentos", "ver");
  const podeGerir = await can(user, "documentos", "gerir");
  const viewer = {
    id: user.id,
    perfilChave: user.perfilChave,
    superUsuario: user.superUsuario,
  };
  const [modelos, fontes, datasets, perfis] = await Promise.all([
    listarModelos(viewer),
    fontesPermitidasOpcoes(user),
    podeGerir ? listarDatasetsParaFonte() : Promise.resolve([]),
    podeGerir ? perfisAtivosParaSelect() : Promise.resolve([]),
  ]);
  return (
    <DocumentosView
      podeGerir={podeGerir}
      viewer={viewer}
      perfisDisponiveis={perfis.map((p) => ({ chave: p.chave, nome: p.nome }))}
      fontes={fontes}
      datasets={datasets}
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
