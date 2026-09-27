import type { ReactNode } from "react";
import { AjusteCabecalho } from "@/components/shell/ajuste-cabecalho";
import { Breadcrumb, type BreadcrumbItem } from "@/components/shell/breadcrumb";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página único: título, descrição curta e ações da página na linha da barra do topo
 * (plano `docs/superpowers/plans/2026-09-25-area-util-celular.md`, etapa 1.1).
 *
 * Sem contexto nem portal, de propósito: a barra do topo é cliente e persiste entre navegações,
 * e o título vem de página de servidor. Levar o título até ela por estado só funcionaria depois da
 * hidratação — no HTML do servidor a barra mostraria o título genérico e os botões apareceriam
 * atrasados. Aqui o cabeçalho é renderizado no fluxo da própria página, e o CSS faz o resto:
 * - a barra do topo esconde o título padrão dela quando existe um `[data-cabecalho-pagina]` na
 *   página (`:has()` em globals.css) — vale já no primeiro desenho;
 * - a partir de `xl` o cabeçalho sobe para dentro da linha da barra (margem negativa = altura da
 *   barra + padding do `main`) e reserva à direita a largura dos controles globais, que a barra
 *   mede e publica em `--barra-global`. Abaixo de `xl` a largura não comporta os dois (com o menu
 *   aberto sobraria pouco para o título), então ele fica numa linha própria logo abaixo da barra.
 *   Mesmo em `xl`, se título e ações não couberem (menu aberto, muitas ações), `AjusteCabecalho`
 *   marca `data-apertado` e ele volta para a linha própria.
 *
 * Deve ser o PRIMEIRO elemento da página, sem ancestral com padding/borda no topo nem `overflow`
 * diferente de `visible` entre ele e o `main` — a margem negativa e o `sticky` dependem disso.
 */
export function CabecalhoPagina({
  titulo,
  descricao,
  trilha,
  acoes,
  className,
}: {
  titulo: ReactNode;
  /** Uma frase curta. Some abaixo de `md` para o título não brigar por espaço. */
  descricao?: ReactNode;
  /** Trilha com nomes já resolvidos (projeto, cliente…). Sem ela, a trilha é montada pela URL. */
  trilha?: BreadcrumbItem[];
  /** Ações da página. Mantenha poucas e compactas: dividem a linha com os controles globais. */
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-cabecalho-pagina
      className={cn(
        // Estreito: as ações descem para a linha de baixo quando não sobram 10rem para o título
        // (sem isso o título virava "Finan…" no celular). Na barra (`xl`), uma linha só.
        "flex min-h-10 min-w-0 flex-wrap items-center gap-x-3 gap-y-2",
        "xl:sticky xl:top-0 xl:z-30 xl:-mt-20 xl:mb-4 xl:h-14 xl:flex-nowrap xl:mr-[calc(var(--barra-global)+0.75rem)]",
        className,
      )}
    >
      {/* min-w (mesmo piso do flex-basis, 10rem) em vez de min-w-0: com muitas ações (3+ botões),
          o título não pode sumir por completo — encolhe até este piso e deixa as ações
          estourarem/quebrarem, não o inverso. */}
      <div className="min-w-40 flex-[1_1_10rem]">
        <Breadcrumb items={trilha} />
        <div className="flex min-w-0 items-baseline gap-2">
          {/* shrink-0: o título nunca perde espaço para a descrição — só ela encolhe/some. `max-w-full`: mas
              também nunca passa da própria coluna (título longo no celular corria por baixo das ações). */}
          <h1 className="max-w-full shrink-0 truncate text-lg font-bold tracking-tight">{titulo}</h1>
          {descricao && (
            <p className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">
              <span aria-hidden>· </span>
              {descricao}
            </p>
          )}
        </div>
      </div>
      {acoes && (
        <div data-cabecalho-acoes className="flex max-w-full shrink-0 flex-wrap items-center gap-2 xl:flex-nowrap">
          {acoes}
        </div>
      )}
      <AjusteCabecalho />
    </div>
  );
}
