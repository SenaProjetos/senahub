import Link from "next/link";
import { ChevronRight, Ruler } from "lucide-react";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { EmptyState } from "@/components/ui/empty-state";

export type ProjetoParaEstudo = { id: string; codigo: string; nome: string; cliente: string | null };

/**
 * Ferramenta que só roda dentro de um projeto (módulo Estudos): a galeria leva até aqui e a pessoa escolhe o projeto.
 * O link abre a aba Estudos já pedindo o estudo novo do tipo certo (`?novo=`).
 */
export function EscolhaProjetoEstudo({
  nome,
  descricao,
  tipoDoEstudo,
  projetos,
  q,
}: {
  nome: string;
  descricao: string;
  tipoDoEstudo: string;
  projetos: ProjetoParaEstudo[];
  q: string;
}) {
  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo={nome} descricao="Esta ferramenta roda dentro de um projeto, na aba Estudos." />
      <p className="text-sm text-muted-foreground">{descricao}</p>
      <form method="get" className="flex flex-wrap items-center gap-2">
        <label htmlFor="escolha-projeto-q" className="text-sm font-medium">
          Em qual projeto você quer fazer o estudo?
        </label>
        <input
          id="escolha-projeto-q"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, código ou cliente"
          className="h-9 min-w-64 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted">
          Buscar
        </button>
      </form>
      {projetos.length === 0 ? (
        <EmptyState icon={Ruler} title="Nenhum projeto encontrado" description="Confira a busca ou peça acesso ao projeto." />
      ) : (
        <ul className="divide-y rounded-md border">
          {projetos.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projetos/${p.id}/estudos?novo=${tipoDoEstudo}`}
                className="flex items-center gap-3 p-3 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nome}</span>
                {p.cliente && <span className="hidden truncate text-xs text-muted-foreground sm:block">{p.cliente}</span>}
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
