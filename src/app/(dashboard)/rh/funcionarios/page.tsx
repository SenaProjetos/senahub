import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { listarFuncionarios, opcoesCadastroFuncionario } from "@/modules/rh/funcionarios/queries";
import { FuncionariosView } from "@/components/rh/funcionarios-view";

export const metadata: Metadata = { title: "Funcionários" };

export default async function FuncionariosPage() {
  await requireRole(...HR_ADMIN_ROLES);
  const [funcionarios, opcoes] = await Promise.all([listarFuncionarios(), opcoesCadastroFuncionario()]);
  return (
    <FuncionariosView
      funcionarios={funcionarios}
      templates={opcoes.templates}
      pessoasJuridicas={opcoes.pessoasJuridicas}
    />
  );
}
