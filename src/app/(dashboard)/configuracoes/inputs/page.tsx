import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarInputTemplates } from "@/modules/inputs/queries";
import { catalogoDisciplinas } from "@/modules/projetos/queries";
import { InputsPadraoView } from "@/components/configuracoes/inputs-padrao-view";

export const metadata: Metadata = { title: "Inputs padrão" };

export default async function InputsPadraoPage() {
  // F4 (2026-09-02): era `requireRole("admin","supervisor","administrativo")`. O par
  // `configuracoes:gerir` só está semeado em `administrativo`, então **o Coordenador perde
  // o acesso** — redução deliberada, decidida pelo dono em 2026-09-02. Para devolver,
  // basta marcar o par no perfil Coordenador (a tela agora resolve isso sem deploy).
  await requirePermission("configuracoes", "gerir");
  const [templates, catalogo] = await Promise.all([listarInputTemplates(), catalogoDisciplinas()]);
  return (
    <InputsPadraoView
      templates={templates.map((t) => ({ id: t.id, disciplina: t.disciplina, pergunta: t.pergunta, ordem: t.ordem }))}
      disciplinas={catalogo.map((d) => d.nome)}
    />
  );
}
