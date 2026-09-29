"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Calendar, ChevronRight, FolderKanban, Search } from "lucide-react";
import { normalizar } from "@/lib/disciplinas-core";
import { hrefGlobal, type AnoDoDiretorio } from "@/modules/arquivos/pastas-globais";
import { cn } from "@/lib/utils";

export type SelecaoDiretorio = {
  ano: string | null;
  projetoId: string | null;
  /** O projeto aberto está na raiz dele (nenhuma disciplina, área ou lista escolhida). */
  naRaizDoProjeto: boolean;
};

const LINHA = "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Árvore do diretório geral: Todos os projetos → ano → projeto. Dentro do projeto aberto vão as
 * MESMAS pastas da aba Arquivos dele (`doProjeto`, montado pela tela do projeto) — o diretório é a
 * aba com dois níveis por cima, não uma tela à parte.
 *
 * Ano e projeto são endereços (`Link`): trocar de projeto zera a pasta aberta no anterior. Só o
 * projeto aberto desce na árvore; os outros abrem ao clicar, como uma pasta no Google Drive.
 */
export function ArvoreProjetos({
  anos,
  selecao,
  doProjeto,
}: {
  anos: AnoDoDiretorio[];
  selecao: SelecaoDiretorio;
  doProjeto?: ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const caminho = [selecao.ano, selecao.projetoId].filter((c): c is string => !!c);
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(caminho));
  // A seleção mudou por fora da árvore (pasta da lista, trilha, voltar): abre o caminho dela.
  const chaveCaminho = caminho.join("|");
  const [caminhoVisto, setCaminhoVisto] = useState(chaveCaminho);
  if (caminhoVisto !== chaveCaminho) {
    setCaminhoVisto(chaveCaminho);
    setAbertos((atual) => new Set([...atual, ...caminho]));
  }

  function alternar(chave: string) {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  const termo = normalizar(busca.trim());
  // A busca filtra por projeto (código ou nome), que é como se procura um projeto de cabeça.
  const filtrados = termo
    ? anos
        .map((a) => ({
          ...a,
          projetos: a.projetos.filter((p) => normalizar(p.codigo).includes(termo) || normalizar(p.nome).includes(termo)),
        }))
        .filter((a) => a.projetos.length > 0)
    : anos;
  const totalGeral = anos.reduce((soma, a) => soma + a.total, 0);

  return (
    <div>
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar projeto"
            aria-label="Pesquisar projeto"
            className="h-8 w-full rounded-md border border-border bg-background pr-2 pl-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <ul className="space-y-0.5 p-2" role="tree" aria-label="Arquivos por ano e projeto">
        <li role="none">
          <Link
            href={hrefGlobal(null)}
            scroll={false}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors",
              selecao.ano === null ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
            )}
          >
            <span>Todos os projetos</span>
            <span className="font-normal tabular-nums text-muted-foreground">{totalGeral}</span>
          </Link>
        </li>

        {filtrados.map((a) => {
          const ano = String(a.ano);
          const aberto = abertos.has(ano) || !!termo;
          const anoSelecionado = selecao.ano === ano && selecao.projetoId === null;
          return (
            <li key={ano} role="treeitem" aria-expanded={aberto} aria-selected={anoSelecionado}>
              <div className={cn("flex items-center gap-0.5 rounded-md transition-colors", anoSelecionado ? "bg-accent" : "hover:bg-accent/60")}>
                <BotaoAbrir aberto={aberto} rotulo={ano} onClick={() => alternar(ano)} />
                <Link href={hrefGlobal(ano)} scroll={false} className={LINHA}>
                  <Calendar className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{ano}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{a.total}</span>
                </Link>
              </div>

              {aberto && (
                <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-border pl-2" role="group">
                  {a.projetos.map((p) => {
                    const ehAberto = selecao.projetoId === p.projetoId;
                    const expandido = ehAberto && abertos.has(p.projetoId);
                    const destacado = ehAberto && selecao.naRaizDoProjeto;
                    return (
                      <li key={p.projetoId} role="treeitem" aria-expanded={ehAberto ? expandido : false} aria-selected={destacado}>
                        <div className={cn("flex items-center gap-0.5 rounded-md transition-colors", destacado ? "bg-accent" : "hover:bg-accent/60")}>
                          {ehAberto ? (
                            <BotaoAbrir aberto={expandido} rotulo={p.codigo} onClick={() => alternar(p.projetoId)} />
                          ) : (
                            // Projeto fechado: a seta abre o projeto (as pastas dele vêm do servidor).
                            <Link
                              href={hrefGlobal(ano, p.projetoId)}
                              scroll={false}
                              aria-label={`Abrir ${p.codigo}`}
                              title="Abrir"
                              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                            >
                              <ChevronRight className="size-3.5" aria-hidden />
                            </Link>
                          )}
                          <Link href={hrefGlobal(ano, p.projetoId)} scroll={false} title={`${p.codigo} · ${p.nome}`} className={LINHA}>
                            <FolderKanban className="size-3.5 shrink-0 text-primary" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-medium">{p.codigo}</span> <span className="text-muted-foreground">{p.nome}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{p.total}</span>
                          </Link>
                        </div>
                        {expandido && doProjeto && (
                          <div className="mt-0.5 ml-3 border-l border-border pl-2">{doProjeto}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}

        {termo && filtrados.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum projeto encontrado para &quot;{busca.trim()}&quot;.</li>
        )}
        {anos.length === 0 && !termo && (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum projeto visível para o seu perfil.</li>
        )}
      </ul>
    </div>
  );
}

function BotaoAbrir({ aberto, rotulo, onClick }: { aberto: boolean; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      aria-label={aberto ? `Recolher ${rotulo}` : `Expandir ${rotulo}`}
      title={aberto ? "Recolher" : "Expandir"}
    >
      <ChevronRight className={cn("size-3.5 transition-transform", aberto && "rotate-90")} aria-hidden />
    </button>
  );
}
