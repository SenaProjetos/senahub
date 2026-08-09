import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";
import { orcamentosDoProjeto } from "@/modules/custos/queries";
import { ProjetoCustosView } from "@/components/custos/projeto-custos-view";

export const metadata: Metadata = { title: "Custos" };

export default async function ProjetoCustosPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("custos", "ver");
  const { id } = await params;

  const projeto = await prisma.projeto.findFirst({
    where: { AND: [{ id }, escopoProjeto(user)] },
    select: { id: true, codigo: true, nome: true },
  });
  if (!projeto) notFound();

  const [itens, podeGerir] = await Promise.all([
    orcamentosDoProjeto(id, user),
    can(user, "custos", "gerir"),
  ]);

  return <ProjetoCustosView projeto={projeto} itens={itens} podeGerir={podeGerir} />;
}
