import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarReferencias } from "@/modules/engenharia/referencias/queries";
import { podeIncluirBiblioteca, podeGerirBiblioteca } from "@/modules/engenharia/acesso";
import { ReferenciasView } from "@/components/engenharia/referencias-view";

export const metadata: Metadata = { title: "Referências Técnicas" };

export default async function ReferenciasPage() {
  const user = await requirePermission("biblioteca_tecnica", "ver");
  const [referencias, podeIncluir, podeGerir] = await Promise.all([
    listarReferencias(),
    podeIncluirBiblioteca(user.role),
    podeGerirBiblioteca(user.role),
  ]);

  return (
    <ReferenciasView
      referencias={referencias}
      podeIncluir={podeIncluir}
      podeGerir={podeGerir}
      usuarioId={user.id}
    />
  );
}
