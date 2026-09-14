import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { requireInterno } from "@/lib/session";
import { SETORES_GUIA, rotaGuia } from "@/lib/guias";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Guias de uso",
  description: "O que cada setor do SenaHub faz, em linguagem de quem está começando.",
};

/**
 * Índice dos Guias de uso. Lista os **9 setores**, não só os que têm guia: a cobertura é parcial de
 * propósito (N10/N11 do plano `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`) e o
 * índice é o roadmap visível disso.
 */
export default async function GuiasPage() {
  await requireInterno();

  const prontos = SETORES_GUIA.filter((s) => s.estado === "pronto");
  const emBreve = SETORES_GUIA.filter((s) => s.estado === "em-breve");

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="size-4.5" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">Guias de uso</h2>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Um guia por setor, para quem ainda não conhece o assunto: o que cada termo significa, por que
          o processo existe e como as telas se encadeiam. Para permissões, regras exatas e mensagens de
          erro, veja o{" "}
          <Link href="/ajuda" className="font-medium text-foreground underline underline-offset-2">
            manual de referência
          </Link>
          .
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Disponíveis</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* `relative` no card + `after:inset-0` no link fazem o card inteiro virar área de clique. */}
          {prontos.map((setor) => (
            <Card key={setor.chave} className="relative transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <setor.icone className="size-4.5" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      <Link href={rotaGuia(setor.chave)} className="outline-none after:absolute after:inset-0 focus-visible:underline">
                        {setor.titulo}
                      </Link>
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{setor.descricao}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-1 text-sm font-medium text-primary">
                Abrir guia <ArrowRight className="size-3.5" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Em preparação</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {emBreve.map((setor) => (
            <Card key={setor.chave} className="border-dashed bg-muted/20">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <setor.icone className="size-4.5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base text-muted-foreground">{setor.titulo}</CardTitle>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        Em breve
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{setor.descricao}</p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Enquanto o guia não sai, a seção correspondente do{" "}
          <Link href="/ajuda" className="font-medium text-foreground underline underline-offset-2">
            manual
          </Link>{" "}
          já cobre as telas desses setores.
        </p>
      </section>
    </div>
  );
}
