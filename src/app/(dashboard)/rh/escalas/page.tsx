import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { escalaContratacaoGrade, escalaUsuarioGrade, usuariosParaEscala } from "@/modules/rh/escalas/queries";
import { CONTRATACOES_COM_ESCALA } from "@/modules/rh/escalas/schemas";
import { EscalasView } from "@/components/rh/escalas-view";

export const metadata: Metadata = { title: "Escalas de trabalho" };

export default async function EscalasPage() {
  await requirePermission("ponto", "gerir_escalas");

  const [gradesPares, usuarios] = await Promise.all([
    Promise.all(CONTRATACOES_COM_ESCALA.map(async (c) => [c, await escalaContratacaoGrade(c)] as const)),
    usuariosParaEscala(),
  ]);
  const gradesPorContratacao = Object.fromEntries(gradesPares);

  const escalasPares = await Promise.all(
    usuarios.map(async (u) => [u.id, await escalaUsuarioGrade(u.id)] as const),
  );
  const escalasPorUsuario = Object.fromEntries(escalasPares);

  return (
    <EscalasView
      gradesPorContratacao={gradesPorContratacao}
      usuarios={usuarios}
      escalasPorUsuario={escalasPorUsuario}
    />
  );
}
