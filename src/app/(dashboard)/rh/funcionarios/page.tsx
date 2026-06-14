import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { listarFuncionarios } from "@/modules/rh/funcionarios/queries";
import { FuncionariosView } from "@/components/rh/funcionarios-view";

export const metadata: Metadata = { title: "Funcionários" };

export default async function FuncionariosPage() {
  await requireRole(...HR_ADMIN_ROLES);
  const funcionarios = await listarFuncionarios();
  return <FuncionariosView funcionarios={funcionarios} />;
}
