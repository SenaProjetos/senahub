import type { Metadata } from "next";
import { requireGestorRh } from "@/lib/session";

import { listarFolhas } from "@/modules/rh/folha/queries";
import { FolhasView } from "@/components/rh/folha/folhas-view";

export const metadata: Metadata = { title: "Folha CLT" };

export default async function FolhaPage() {
  await requireGestorRh();
  const folhas = await listarFolhas();
  return <FolhasView folhas={folhas} />;
}
