import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { lerPaginaManual, listarSecoes } from "@/lib/manual";
import { MarkdownManual } from "@/components/ajuda/markdown-manual";
import { ManualNav } from "@/components/ajuda/manual-nav";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await lerPaginaManual(slug);
  return { title: pagina ? `${pagina.titulo} · Ajuda` : "Ajuda" };
}

export default async function AjudaPaginaPage({ params }: Props) {
  await requireUser();
  const { slug } = await params;
  const [pagina, secoes] = await Promise.all([lerPaginaManual(slug), listarSecoes()]);
  if (!pagina) notFound();

  return (
    <div className="flex gap-8">
      <aside className="sticky top-20 hidden h-[calc(100svh-6rem)] w-60 shrink-0 overflow-y-auto pr-2 lg:block">
        <ManualNav secoes={secoes} />
      </aside>

      <article className="min-w-0 flex-1">
        <Link
          href="/ajuda"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Ajuda
        </Link>
        <MarkdownManual corpo={pagina.corpo} baseDir={pagina.baseDir} />
      </article>
    </div>
  );
}
