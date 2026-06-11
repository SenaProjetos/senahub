import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { listarUsuarios } from "@/modules/usuarios/queries";
import { UsuariosView } from "@/components/configuracoes/usuarios-view";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const usuarios = await listarUsuarios({ incluirInativos: true });
  return <UsuariosView usuarios={usuarios} />;
}
