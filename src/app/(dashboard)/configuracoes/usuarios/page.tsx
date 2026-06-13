import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarUsuarios } from "@/modules/usuarios/queries";
import { listarClientes } from "@/modules/clientes/queries";
import { UsuariosView } from "@/components/configuracoes/usuarios-view";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const [usuarios, clientes] = await Promise.all([
    listarUsuarios({ incluirInativos: true }),
    listarClientes({ incluirInativos: false }),
  ]);
  return (
    <UsuariosView usuarios={usuarios} clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />
  );
}
