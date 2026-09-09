import { ArrowRight, Lightbulb, MousePointerClick, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Primitivas de apresentação dos Guias de uso. **Só apresentação** — sem estado, sem hook, sem
 * leitura de dados: são componentes de servidor e devem continuar assim, para que um guia inteiro
 * fique fora do bundle do cliente.
 *
 * Extraídas de `guia-comercial-view.tsx` (o piloto) na F0 do plano
 * `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`, sem mudança visual.
 */

/** Nome de um botão da interface, como ele aparece na tela. */
export function NomeBotao({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 font-medium text-foreground shadow-xs">
      <MousePointerClick className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * A tríade que carrega a pedagogia do guia: onde a pessoa está, o que ela clica, e o que o sistema
 * faz em resposta. É o que separa um guia de uma lista de botões.
 */
export function Acao({ tela, clique, resultado }: { tela: string; clique: ReactNode; resultado: string }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[0.8fr_1fr_1.35fr]">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Na tela</p>
        <p className="mt-1 text-sm font-medium">{tela}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clique em</p>
        <div className="mt-1 text-sm">{clique}</div>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">O que acontece</p>
        <p className="mt-1 text-sm text-muted-foreground">{resultado}</p>
      </div>
    </div>
  );
}

/** Observação que economiza tempo de quem está aprendendo. Não use para regra de negócio. */
export function Dica({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/** Link-pílula para uma tela relacionada. */
export function Atalho({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button variant="outline" size="sm" render={<Link href={href} />}>
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

/** Um passo do caminho natural do setor, na trilha numerada. */
export function Etapa({
  id,
  numero,
  icone: Icone,
  titulo,
  resumo,
  ultima = false,
  children,
}: {
  id: string;
  numero: string;
  icone: LucideIcon;
  titulo: string;
  resumo: string;
  /** Corta a linha da trilha embaixo do marcador — use no último passo. */
  ultima?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="grid gap-3 md:grid-cols-[3.25rem_1fr]">
        <div className="hidden flex-col items-center md:flex" aria-hidden="true">
          <div className="grid size-11 place-items-center rounded-full border-2 border-primary bg-background font-mono text-sm font-bold text-primary">
            {numero}
          </div>
          {!ultima && <div className="mt-2 min-h-12 w-px grow bg-border" />}
        </div>
        <Card className="mb-5 [--card-edge:var(--primary)]">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icone className="size-4.5" aria-hidden="true" />
              </div>
              <div>
                <Badge variant="outline" className="mb-1 font-mono md:hidden">
                  Passo {numero}
                </Badge>
                <CardTitle className="text-lg">{titulo}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{resumo}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 leading-relaxed">{children}</CardContent>
        </Card>
      </div>
    </section>
  );
}

/** Seção de largura cheia, fora da trilha numerada (vocabulário, armadilhas, dúvidas). */
export function SecaoGuia({
  id,
  sobretitulo,
  titulo,
  children,
}: {
  id: string;
  sobretitulo: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{sobretitulo}</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}
