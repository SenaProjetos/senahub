import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  listarProjetos,
  catalogoDisciplinas,
  usuariosInternos,
} from "@/modules/projetos/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { ProjetosView } from "@/components/projetos/projetos-view";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjetosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const sp = await searchParams;
  const projetos = await listarProjetos(user, { q: sp.q, situacao: sp.situacao });
  const podeGerir = await can(user.role, "projetos", "gerir");

  const [clientes, catalogo, internos] = podeGerir
    ? await Promise.all([
        listarClientes({ incluirInativos: false }),
        catalogoDisciplinas(),
        usuariosInternos(),
      ])
    : [[], [], []];

  return (
    <ProjetosView
      projetos={projetos}
      podeGerir={podeGerir}
      busca={sp.q ?? ""}
      situacao={sp.situacao ?? ""}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      catalogo={catalogo.map((d) => d.nome)}
      internos={internos}
    />
  );
}
