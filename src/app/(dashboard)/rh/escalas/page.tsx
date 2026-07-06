import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { INTERNAL_ROLES, type Role } from "@/lib/roles";
import { escalaRoleGrade, escalaUsuarioGrade, usuariosParaEscala } from "@/modules/rh/escalas/queries";
import { EscalasView } from "@/components/rh/escalas-view";

export const metadata: Metadata = { title: "Escalas de trabalho" };

// INTERNAL_ROLES nunca inclui "cliente" em runtime, mas é tipado `Role[]` (largo,
// usado em vários módulos) — este filtro estreita o tipo para bater com o que
// `salvarEscalaRole` aceita (o schema Zod recusa "cliente").
const ROLES_ESCALA = INTERNAL_ROLES.filter((r): r is Exclude<Role, "cliente"> => r !== "cliente");

export default async function EscalasPage() {
  await requirePermission("ponto", "gerir_escalas");

  const [gradesPares, usuarios] = await Promise.all([
    Promise.all(ROLES_ESCALA.map(async (role) => [role, await escalaRoleGrade(role)] as const)),
    usuariosParaEscala(),
  ]);
  const gradesPorRole = Object.fromEntries(gradesPares);

  const escalasPares = await Promise.all(
    usuarios.map(async (u) => [u.id, await escalaUsuarioGrade(u.id)] as const),
  );
  const escalasPorUsuario = Object.fromEntries(escalasPares);

  return (
    <EscalasView
      roles={ROLES_ESCALA}
      gradesPorRole={gradesPorRole}
      usuarios={usuarios}
      escalasPorUsuario={escalasPorUsuario}
    />
  );
}
