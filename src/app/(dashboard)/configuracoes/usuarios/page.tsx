import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarUsuarios } from "@/modules/usuarios/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { solicitacoesCadastroPendentes } from "@/modules/auth/cadastro/queries";
import { UsuariosView } from "@/components/configuracoes/usuarios-view";
import { SolicitacoesCadastro } from "@/components/configuracoes/solicitacoes-cadastro";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const [usuarios, clientes, pedidos] = await Promise.all([
    listarUsuarios({ incluirInativos: true }),
    listarClientes({ incluirInativos: false }),
    solicitacoesCadastroPendentes(),
  ]);
  return (
    <div className="space-y-5">
      <SolicitacoesCadastro pedidos={pedidos} />
      <UsuariosView usuarios={usuarios} clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />
    </div>
  );
}
