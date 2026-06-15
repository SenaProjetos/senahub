import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarInputTemplates } from "@/modules/inputs/queries";
import { catalogoDisciplinas } from "@/modules/projetos/queries";
import { InputsPadraoView } from "@/components/configuracoes/inputs-padrao-view";

export const metadata: Metadata = { title: "Inputs padrão" };

export default async function InputsPadraoPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const [templates, catalogo] = await Promise.all([listarInputTemplates(), catalogoDisciplinas()]);
  return (
    <InputsPadraoView
      templates={templates.map((t) => ({ id: t.id, disciplina: t.disciplina, pergunta: t.pergunta, ordem: t.ordem }))}
      disciplinas={catalogo.map((d) => d.nome)}
    />
  );
}
