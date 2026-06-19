import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarChecklistModelos } from "@/modules/licitacoes/habilitacao/queries";
import { HabilitacaoView } from "@/components/configuracoes/habilitacao-view";

export const metadata: Metadata = { title: "Checklist de habilitação" };

export default async function HabilitacaoConfigPage() {
  await requirePermission("licitacoes", "gerir");
  const modelos = await listarChecklistModelos(true);
  return (
    <HabilitacaoView
      modelos={modelos.map((m) => ({
        id: m.id,
        nome: m.nome,
        ativo: m.ativo,
        ordem: m.ordem,
        itens: m.itens.map((it) => ({
          id: it.id,
          exigencia: it.exigencia,
          obrigatorio: it.obrigatorio,
          ordem: it.ordem,
        })),
      }))}
    />
  );
}
