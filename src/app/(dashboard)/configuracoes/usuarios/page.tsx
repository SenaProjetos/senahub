import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { listarUsuarios } from "@/modules/usuarios/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { solicitacoesCadastroPendentes } from "@/modules/auth/cadastro/queries";
import { opcoesCadastroFuncionario } from "@/modules/rh/funcionarios/queries";
import { perfisAtivosParaSelect } from "@/modules/perfis/queries";
import { UsuariosView } from "@/components/configuracoes/usuarios-view";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  // F4 (2026-09-02): era `requireRole("admin","supervisor","administrativo")`. O par
  // `configuracoes:gerir` só está semeado em `administrativo`, então **o Coordenador perde
  // o acesso** — redução deliberada, decidida pelo dono em 2026-09-02. Para devolver,
  // basta marcar o par no perfil Coordenador (a tela agora resolve isso sem deploy).
  const user = await requirePermission("usuarios", "gerir");
  const [usuarios, clientes, pedidos, opcoes, perfis] = await Promise.all([
    listarUsuarios({ incluirInativos: true }),
    listarClientes({ incluirInativos: false }),
    solicitacoesCadastroPendentes(),
    opcoesCadastroFuncionario(),
    perfisAtivosParaSelect(),
  ]);
  return (
    <div className="space-y-5">
      <UsuariosView
        usuarios={usuarios}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
        pedidos={pedidos}
        pessoasJuridicas={opcoes.pessoasJuridicas}
        templates={opcoes.templates}
        perfis={perfis}
        cargos={opcoes.cargos}
        podeDefinirSocio={user.role === "admin"}
        podeExcluir={user.role === "admin"}
        ehAdmin={user.role === "admin"}
      />
    </div>
  );
}
