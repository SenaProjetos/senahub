import type { Metadata } from "next";
import Link from "next/link";
import { History, BookOpen, ChevronRight } from "lucide-react";
import { requireRole } from "@/lib/session";
import { INTERNAL_ROLES } from "@/lib/roles";
import { lerChangelog, type VersaoChangelog } from "@/lib/changelog";
import { APP_VERSION, VERSION_LABEL } from "@/lib/version";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Histórico de versões" };

/**
 * Changelog versão a versão, lido em runtime do `CHANGELOG.md` — que o `npm run release`
 * regera a partir dos commits. Nada aqui precisa ser atualizado à mão a cada deploy.
 *
 * Conteúdo técnico (linguagem de commit): restrito aos perfis internos. A versão em
 * linguagem do dia a dia, essa sim visível ao cliente, vive em `/ajuda/novidades`.
 */
export default async function VersoesPage() {
  await requireRole(...INTERNAL_ROLES);
  const versoes = await lerChangelog();

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 size-7 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">Histórico de versões</h2>
            <Badge variant="secondary" title={VERSION_LABEL}>
              em uso: v{APP_VERSION}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            O que entrou em cada versão do SenaHub, da mais recente para a mais antiga.
            Gerado a partir dos commits a cada publicação.{" "}
            <Link href="/ajuda/novidades" className="inline-flex items-center gap-1 text-primary hover:underline">
              <BookOpen className="size-3.5" />
              Novidades explicadas
            </Link>
          </p>
        </div>
      </div>

      {versoes.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sem histórico disponível"
          description="O arquivo CHANGELOG.md não foi encontrado nesta instalação."
        />
      ) : (
        <div className="space-y-4">
          {versoes.map((v, i) => (
            <VersaoCard key={v.versao} versao={v} atual={v.versao === APP_VERSION} aberta={i < 3} />
          ))}
        </div>
      )}
    </div>
  );
}

function VersaoCard({
  versao,
  atual,
  aberta,
}: {
  versao: VersaoChangelog;
  atual: boolean;
  aberta: boolean;
}) {
  const total = versao.secoes.reduce((acc, s) => acc + s.itens.length, 0);

  return (
    <Card className="overflow-hidden py-0">
      {/* <details> nativo: abre/fecha sem estado no cliente (a página é um Server Component). */}
      <details open={aberta} className="group">
        <summary className="cursor-pointer list-none">
          <CardHeader className="flex flex-wrap items-center gap-x-3 gap-y-1 py-4 transition-colors group-hover:bg-muted/40">
            {/* `list-none` some com o triângulo nativo — o chevron devolve a pista de que abre. */}
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              aria-hidden
            />
            <CardTitle className="text-base font-bold">v{versao.versao}</CardTitle>
            {atual && <Badge>versão em uso</Badge>}
            {versao.data && (
              <span className="text-xs text-muted-foreground">{formatarData(versao.data)}</span>
            )}
            <span className="ms-auto text-xs text-muted-foreground">
              {total} {total === 1 ? "mudança" : "mudanças"}
            </span>
          </CardHeader>
        </summary>

        <CardContent className="space-y-5 border-t pt-4 pb-5">
          {versao.secoes
            .filter((s) => s.itens.length > 0)
            .map((secao) => (
              <section key={secao.titulo} className="space-y-2">
                <h3 className="text-sm font-bold tracking-tight text-foreground/80">
                  {secao.titulo}
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {secao.itens.map((item, idx) => (
                    <li key={`${item.hash ?? "sem-hash"}-${idx}`} className="flex flex-wrap items-baseline gap-x-2">
                      {item.escopo && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {item.escopo}
                        </Badge>
                      )}
                      <span className="min-w-0">{item.texto}</span>
                      {item.hash && (
                        // Texto puro, não link: as URLs do arquivo apontam para um repositório
                        // inexistente (campo `repository` faltava no package.json até v1.13.0).
                        <span className="font-mono text-[10px] text-muted-foreground/70">
                          {item.hash}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </CardContent>
      </details>
    </Card>
  );
}
