import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Rocket, HelpCircle, BookMarked, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { lerManifesto, listarSecoes, pathParaSlug } from "@/lib/manual";
import { AjudaBusca, type ItemBusca } from "@/components/ajuda/ajuda-busca";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ajuda" };

const ATALHOS = [
  { slug: "quick-start", icon: Rocket, titulo: "Início rápido", desc: "O essencial em poucos minutos." },
  { slug: "faq", icon: HelpCircle, titulo: "Perguntas frequentes", desc: "Dúvidas e erros comuns." },
  { slug: "glossary", icon: BookMarked, titulo: "Glossário", desc: "Termos do sistema." },
];

export default async function AjudaPage() {
  await requireUser();
  const [manifesto, secoes] = await Promise.all([lerManifesto(), listarSecoes()]);

  const itens: ItemBusca[] = manifesto.map((e) => ({
    slug: pathParaSlug(e.path),
    titulo: e.titulo,
    descricao: e.descricao,
    termos: [e.descricao, e.resumo, ...e.tags, ...e.palavrasChave, ...e.sinonimos].join(" ").toLowerCase(),
  }));

  // Seções de módulo (exclui a "Geral" = páginas-raiz, que viram atalhos acima).
  const secoesModulo = secoes.filter((s) => s.chave !== "");

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 size-7 shrink-0 text-primary" />
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Ajuda &amp; Manual</h2>
          <p className="text-sm text-muted-foreground">
            Documentação oficial do SenaHub. Pesquise ou navegue pelas seções.
          </p>
        </div>
      </div>

      <AjudaBusca itens={itens} />

      <div className="grid gap-3 sm:grid-cols-3">
        {ATALHOS.map((a) => (
          <Link key={a.slug} href={`/ajuda/${a.slug}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <a.icon className="mb-1 size-6 text-primary" />
                <CardTitle className="text-base">{a.titulo}</CardTitle>
                <CardDescription>{a.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-tight text-foreground/80">Seções</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {secoesModulo.map((s) => (
            <Card key={s.chave} className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{s.titulo}</CardTitle>
                <CardDescription>{s.paginas.length} página(s)</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1 text-sm">
                  {s.paginas.map((p) => (
                    <li key={p.slug}>
                      <Link
                        href={`/ajuda/${p.slug}`}
                        className="group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ArrowRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        <span className="truncate">{p.titulo}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
