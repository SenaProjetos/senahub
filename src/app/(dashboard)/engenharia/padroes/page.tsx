import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarPadroes, disciplinasCatalogo } from "@/modules/engenharia/queries";
import { podeIncluirBiblioteca, podeGerirBiblioteca } from "@/modules/engenharia/acesso";
import { PadroesView } from "@/components/engenharia/padroes-view";

export const metadata: Metadata = { title: "Padrões Técnicos" };

export default async function PadroesPage() {
  const user = await requirePermission("biblioteca_tecnica", "ver");
  const [grupos, disciplinas, podeIncluir, podeGerir] = await Promise.all([
    listarPadroes(),
    disciplinasCatalogo(),
    podeIncluirBiblioteca(user.role),
    podeGerirBiblioteca(user.role),
  ]);

  return (
    <PadroesView
      grupos={grupos}
      disciplinas={disciplinas}
      podeIncluir={podeIncluir}
      podeGerir={podeGerir}
      usuarioId={user.id}
    />
  );
}
