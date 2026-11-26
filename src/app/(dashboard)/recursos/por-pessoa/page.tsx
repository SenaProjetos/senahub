import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { planejadorDaEquipe } from "@/modules/planejamento/planejador-queries";
import type { EscalaPlanejador } from "@/modules/planejamento/planejador-equipe";
import { PlanejadorEquipeView } from "@/components/recursos/planejador-equipe-view";

export const metadata: Metadata = { title: "Recursos por pessoa" };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tela por pessoa de Recursos (pool de recursos, parte 2). Só leitura: vê quem vê Recursos (decisão 7); a dedicação por
 * disciplina se edita aqui também, para quem monta a EAP (decisão 5).
 *
 * `?escala=semanas`, `?de=AAAA-MM-DD` (o início da janela), `?disciplina=`, `?projeto=`, `?pessoa=` (o link do aviso).
 */
export default async function RecursosPorPessoaPage({
  searchParams,
}: {
  searchParams: Promise<{ escala?: string; de?: string; disciplina?: string; projeto?: string; pessoa?: string }>;
}) {
  const user = await requirePermission("recursos", "ver");
  const sp = await searchParams;
  const escala: EscalaPlanejador = sp.escala === "semanas" ? "semanas" : "dias";
  const filtros = { disciplina: sp.disciplina?.trim() || null, projetoId: sp.projeto || null, userId: sp.pessoa || null };
  const dados = await planejadorDaEquipe(user, {
    escala,
    inicio: sp.de && DIA.test(sp.de) ? sp.de : undefined,
    filtros,
    editarDedicacao: await can(user, "planejamento", "gerir"),
  });
  return <PlanejadorEquipeView dados={dados} filtros={filtros} />;
}
