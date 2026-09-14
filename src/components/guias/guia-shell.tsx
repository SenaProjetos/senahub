import { ArrowLeft, ArrowRight, BookOpenText, CircleHelp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SecaoGuia } from "@/components/guias/primitivas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Um marco do fluxo ponta a ponta, na régua horizontal do topo. */
export type MarcoGuia = { numero: string; nome: string; href: string };

/**
 * Classes literais por quantidade de marcos. O Tailwind varre o código-fonte: uma classe montada
 * por interpolação (`sm:grid-cols-${n}`) não existiria no CSS gerado.
 */
const COLUNAS_MARCOS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
};

/** Uma entrada do índice lateral. Só as etapas — o shell acrescenta as seções fixas. */
export type ItemIndice = { href: string; label: string };

/** Um termo do jargão do setor, em linguagem de leigo. */
export type TermoGuia = { termo: string; definicao: ReactNode; exemplo?: ReactNode };

/** Onde a pessoa se perde neste setor. */
export type ArmadilhaGuia = { titulo: string; texto: ReactNode };

/** Pergunta **conceitual** e resposta. Mensagem de erro é assunto do manual, não do guia. */
export type DuvidaGuia = { pergunta: string; resposta: ReactNode };

/**
 * Envelope de um Guia de uso: cabeçalho, régua de marcos, índice lateral e as três seções fixas
 * (vocabulário, armadilhas, dúvidas). As etapas do caminho natural entram como `children`.
 *
 * `vocabulario` e `armadilhas` são **obrigatórios de propósito** (N8 do plano
 * `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`): o piloto do Comercial não tinha
 * nenhum dos dois, e é no termo — não no clique — que o leigo trava em Financeiro e RH. Tipo
 * obrigatório é o único jeito de a próxima fase não "esquecer".
 *
 * O índice é montado aqui a partir de `indice` + as seções fixas, para não haver duas listas de
 * âncoras para manter em sincronia.
 */
export function GuiaShell({
  voltar,
  titulo,
  descricao,
  acoes,
  regra,
  marcos,
  indice,
  vocabulario,
  armadilhas,
  duvidas,
  cta,
  children,
}: {
  voltar: { href: string; label: string };
  titulo: string;
  descricao: string;
  /** Botões de ação real — levam a fazer, não a ler. */
  acoes?: ReactNode;
  /** A única coisa que a pessoa precisa levar embora se ler só um parágrafo. */
  regra: { titulo?: string; texto: ReactNode };
  marcos: readonly MarcoGuia[];
  /** Só as etapas; vocabulário, armadilhas e dúvidas entram automaticamente. */
  indice: readonly ItemIndice[];
  vocabulario: readonly TermoGuia[];
  armadilhas: readonly ArmadilhaGuia[];
  duvidas: readonly DuvidaGuia[];
  cta: { titulo: string; descricao: string; href: string; label: string };
  children: ReactNode;
}) {
  const indiceCompleto: ItemIndice[] = [
    { href: "#vocabulario", label: "O vocabulário" },
    ...indice,
    { href: "#armadilhas", label: "Armadilhas" },
    { href: "#duvidas", label: "Dúvidas comuns" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="space-y-4">
        <Button variant="ghost" size="sm" render={<Link href={voltar.href} aria-label={voltar.label} />}>
          <ArrowLeft className="size-4" aria-hidden="true" /> {voltar.label}
        </Button>

        <Card className="relative overflow-hidden border-primary/20 bg-primary/5 [--card-edge:var(--primary)]">
          <div
            className="absolute -right-16 -top-20 size-56 rounded-full border-[32px] border-primary/5"
            aria-hidden="true"
          />
          <CardContent className="relative grid gap-6 py-4 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div className="space-y-4">
              <Badge variant="secondary" className="gap-1">
                <BookOpenText className="size-3" aria-hidden="true" /> Guia prático
              </Badge>
              <div>
                <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">{titulo}</h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{descricao}</p>
              </div>
              {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
            </div>
            <div className="rounded-lg border bg-background/80 p-4 backdrop-blur-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {regra.titulo ?? "Regra mais importante"}
              </p>
              <p className="mt-2 text-sm leading-relaxed">{regra.texto}</p>
            </div>
          </CardContent>
        </Card>
      </header>

      <nav aria-label="Etapas do fluxo" className="rounded-xl border bg-card p-3">
        <ol className={`grid grid-cols-2 gap-2 ${COLUNAS_MARCOS[marcos.length] ?? "sm:grid-cols-5"}`}>
          {marcos.map((marco, index) => (
            <li key={marco.href} className="relative">
              <a
                href={marco.href}
                className="group flex min-h-14 items-center gap-2 rounded-lg px-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-mono text-xs font-bold text-primary">{marco.numero}</span>
                <span className="text-sm font-semibold">{marco.nome}</span>
              </a>
              {index < marcos.length - 1 && (
                <ArrowRight
                  className="absolute -right-2 top-5 hidden size-3 text-muted-foreground sm:block"
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <SecaoGuia id="vocabulario" sobretitulo="Comece por aqui" titulo="O vocabulário deste setor">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Estes são os termos que aparecem nas telas e nas conversas do time. Entender o que cada um
          significa resolve a maior parte da confusão antes do primeiro clique.
        </p>
        <dl className="grid gap-3 md:grid-cols-2">
          {vocabulario.map((t) => (
            <div key={t.termo} className="rounded-lg border p-3">
              <dt className="font-semibold">{t.termo}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                {t.definicao}
                {t.exemplo && (
                  <span className="mt-2 block border-l-2 border-primary/30 pl-2 text-foreground/80">
                    <span className="font-medium">Por exemplo: </span>
                    {t.exemplo}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </SecaoGuia>

      <div className="grid gap-6 xl:grid-cols-[14rem_1fr]">
        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-3 rounded-xl border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nesta página</p>
            <nav aria-label="Índice do guia">
              <ol className="space-y-1 text-sm">
                {indiceCompleto.map((item) => (
                  <li key={item.href}>
                    <a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href={item.href}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>

        <main>{children}</main>
      </div>

      <SecaoGuia id="armadilhas" sobretitulo="Onde as pessoas se perdem" titulo="Armadilhas deste setor">
        <div className="grid gap-3 md:grid-cols-2">
          {armadilhas.map((a) => (
            <div key={a.titulo} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{a.titulo}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{a.texto}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SecaoGuia>

      <SecaoGuia id="duvidas" sobretitulo="Consulta rápida" titulo="Dúvidas comuns">
        <div className="grid gap-3 md:grid-cols-2">
          {duvidas.map((d) => (
            <Card key={d.pergunta} size="sm">
              <CardHeader>
                <CardTitle>{d.pergunta}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{d.resposta}</CardContent>
            </Card>
          ))}
        </div>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Permissões, regras exatas, campo a campo e mensagens de erro ficam no{" "}
            <Link href="/ajuda" className="font-medium text-foreground underline underline-offset-2">
              manual de referência
            </Link>
            . Este guia explica o caminho; o manual responde o detalhe.
          </span>
        </p>
      </SecaoGuia>

      <Card className="[--card-edge:var(--primary)]">
        <CardContent className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{cta.titulo}</p>
            <p className="text-sm text-muted-foreground">{cta.descricao}</p>
          </div>
          <Button render={<Link href={cta.href} />}>
            {cta.label} <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
