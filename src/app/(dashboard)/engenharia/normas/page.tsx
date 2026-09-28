import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { disciplinasCatalogo, listarNormas } from "@/modules/engenharia/queries";
import { podeIncluirBiblioteca, podeGerirBiblioteca } from "@/modules/engenharia/acesso";
import { NormasView } from "@/components/engenharia/normas-view";

export const metadata: Metadata = { title: "Normas Técnicas" };

export default async function NormasPage() {
  const user = await requirePermission("biblioteca_tecnica", "ver");
  const [normas, disciplinas, podeIncluir, podeGerir] = await Promise.all([
    listarNormas(),
    disciplinasCatalogo(),
    podeIncluirBiblioteca(user),
    podeGerirBiblioteca(user),
  ]);

  return (
    <NormasView
      normas={normas}
      disciplinas={disciplinas}
      podeIncluir={podeIncluir}
      podeGerir={podeGerir}
      usuarioId={user.id}
    />
  );
}
