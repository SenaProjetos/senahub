import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { listarFolhas } from "@/modules/rh/folha/queries";
import { FolhasView } from "@/components/rh/folha/folhas-view";

export const metadata: Metadata = { title: "Folha CLT" };

export default async function FolhaPage() {
  await requireRole(...HR_ADMIN_ROLES);
  const folhas = await listarFolhas();
  return <FolhasView folhas={folhas} />;
}
