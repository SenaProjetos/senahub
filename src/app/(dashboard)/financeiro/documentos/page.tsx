import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  listarDocumentosFinanceiros,
  opcoesDocumentoFinanceiro,
} from "@/modules/financeiro/documentos/queries";
import { DocumentosFinanceirosView } from "@/components/financeiro/documentos-financeiros-view";

export const metadata: Metadata = { title: "Documentos financeiros" };

export default async function DocumentosFinanceirosPage() {
  const user = await requirePermission("financeiro", "ver");
  const [docs, opcoes, podeGerir] = await Promise.all([
    listarDocumentosFinanceiros(),
    opcoesDocumentoFinanceiro(),
    can(user.role, "financeiro", "gerir"),
  ]);
  return <DocumentosFinanceirosView docs={docs} opcoes={opcoes} podeGerir={podeGerir} />;
}
