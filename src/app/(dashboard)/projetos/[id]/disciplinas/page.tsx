import type { Metadata } from "next";
import { DisciplinasOperacionais } from "@/components/projetos/disciplinas-operacionais";

export const metadata: Metadata = { title: "Disciplinas — projeto" };

export default async function DisciplinasProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DisciplinasOperacionais projetoId={id} />;
}
