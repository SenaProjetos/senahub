import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarUsuarios } from "@/modules/usuarios/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { solicitacoesCadastroPendentes } from "@/modules/auth/cadastro/queries";
import { opcoesCadastroFuncionario } from "@/modules/rh/funcionarios/queries";
import { UsuariosView } from "@/components/configuracoes/usuarios-view";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const user = await requireRole("admin", "supervisor", "administrativo");
  const [usuarios, clientes, pedidos, opcoes] = await Promise.all([
    listarUsuarios({ incluirInativos: true }),
    listarClientes({ incluirInativos: false }),
    solicitacoesCadastroPendentes(),
    opcoesCadastroFuncionario(),
  ]);
  return (
    <div className="space-y-5">
      <UsuariosView
        usuarios={usuarios}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
        pedidos={pedidos}
        pessoasJuridicas={opcoes.pessoasJuridicas}
        templates={opcoes.templates}
        podeDefinirSocio={user.role === "admin"}
        podeExcluir={user.role === "admin"}
      />
    </div>
  );
}
