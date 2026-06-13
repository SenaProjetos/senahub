import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { padroesDocumento } from "@/modules/documentos/queries";
import { FONTES } from "@/modules/documentos/fontes-meta";
import { PadroesDocumentoView } from "@/components/documentos/padroes-view";

export const metadata: Metadata = { title: "Documentos padrão" };

export default async function DocumentosPadraoPage() {
  await requirePermission("documentos", "gerir");
  const [modelos, padroes] = await Promise.all([
    prisma.documentoModelo.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, fonte: true },
    }),
    padroesDocumento(),
  ]);

  const fontes = FONTES.filter((f) => modelos.some((m) => m.fonte === f.id)).map((f) => ({
    id: f.id,
    label: f.label,
    modelos: modelos.filter((m) => m.fonte === f.id).map((m) => ({ id: m.id, nome: m.nome })),
    padrao: padroes[f.id] ?? "",
  }));

  return <PadroesDocumentoView fontes={fontes} />;
}
