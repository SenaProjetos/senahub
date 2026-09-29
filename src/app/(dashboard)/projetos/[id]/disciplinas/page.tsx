import type { Metadata } from "next";
import { DisciplinasOperacionais } from "@/components/projetos/disciplinas-operacionais";

export const metadata: Metadata = { title: "Disciplinas — projeto" };

export default async function DisciplinasProjetoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { id } = await params;
  return <DisciplinasOperacionais projetoId={id} sp={await searchParams} />;
}
