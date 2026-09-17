"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, Folder, FolderOpen, FolderKanban, Search } from "lucide-react";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { useSetParams } from "@/lib/use-set-param";
import { normalizar } from "@/lib/disciplinas-core";
import { cn } from "@/lib/utils";
import type { NoAnoGlobal, NoDisciplinaGlobal, NoPastaGlobal, NoProjetoGlobal } from "@/modules/arquivos/arvore-global";
import type { NoFase } from "@/modules/uploads/arvore-navegacao";

export type SelecaoGlobal = {
  ano: string | null;
  projetoId: string | null;
  disciplinaId: string | null;
  fase: string | null;
  ext: string | null;
};

/**
 * Painel de pastas do diretório geral: ano → projeto → disciplina → fase → formato.
 *
 * Dois tipos de nó, com comportamentos diferentes de propósito:
 *
 *  - ano, projeto, disciplina, fase e formato são FILTROS — clicar recorta a tabela ao lado, e a
 *    seleção vive na URL (mesmo padrão da aba do projeto);
 *  - pasta (aprovação/laudo) e área (Recebidos, ARTs…) são LINKS para a aba do projeto. Elas têm
 *    telas próprias lá, com as ações que fazem sentido em cada uma; refazê-las aqui seria manter
 *    duas versões da mesma coisa. O ícone de link externo avisa que o clique muda de tela.
 */
export function ArvoreGlobalView({ arvore, selecao }: { arvore: NoAnoGlobal[]; selecao: SelecaoGlobal }) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    // Abre sozinho o caminho da seleção: voltar no navegador ou abrir um link com filtro tem de
    // mostrar onde a pessoa está, não a árvore fechada.
    const caminho = [selecao.ano, selecao.ano && selecao.projetoId ? `${selecao.ano}/${selecao.projetoId}` : null];
    if (selecao.ano && selecao.projetoId && selecao.disciplinaId) {
      caminho.push(`${selecao.ano}/${selecao.projetoId}/${selecao.disciplinaId}`);
    }
    return new Set(caminho.filter((c): c is string => !!c));
  });

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
  const filtrada = termo
    ? arvore
        .map((ano) => ({
          ...ano,
          projetos: ano.projetos.filter(
            (p) => normalizar(p.codigo).includes(termo) || normalizar(p.nome).includes(termo),
          ),
        }))
        .filter((ano) => ano.projetos.length > 0)
    : arvore;

  return (
    <div>
      <div className="border-b border-border px-3 py-2.5">
        <h3 className="text-sm font-semibold">Pastas</h3>
      </div>

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

      <ul className="space-y-0.5 p-2" role="tree" aria-label="Pastas por ano, projeto, disciplina, fase e formato">
        <li role="none">
          <BotaoNo
            nivel={0}
            rotulo="Todos os projetos"
            total={arvore.reduce((soma, a) => soma + a.total, 0)}
            selecionado={!selecao.ano && !selecao.projetoId}
            negrito
            onClick={() => setParams({ ano: null, projetoId: null, disciplinaId: null, fase: null, ext: null })}
          />
        </li>

        {filtrada.map((ano) => {
          const chave = String(ano.ano);
          const aberto = abertos.has(chave) || !!termo;
          return (
            <li key={ano.ano} role="treeitem" aria-expanded={aberto} aria-selected={selecao.ano === chave && !selecao.projetoId}>
              <BotaoNo
                nivel={0}
                rotulo={chave}
                total={ano.total}
                selecionado={selecao.ano === chave && !selecao.projetoId}
                aberto={aberto}
                temFilhos
                icone={<Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                onChevron={() => alternar(chave)}
                onClick={() => {
                  setAbertos((a) => new Set(a).add(chave));
                  setParams({ ano: chave, projetoId: null, disciplinaId: null, fase: null, ext: null });
                }}
              />
              {aberto && (
                <ul role="group">
                  {ano.projetos.map((projeto) => (
                    <NoProjeto
                      key={projeto.projetoId}
                      ano={chave}
                      projeto={projeto}
                      selecao={selecao}
                      abertos={abertos}
                      alternar={alternar}
                      abrir={(c) => setAbertos((a) => new Set(a).add(c))}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}

        {filtrada.length === 0 && (
          <li className="px-2 py-3 text-xs text-muted-foreground">Nenhum projeto encontrado.</li>
        )}
      </ul>
    </div>
  );
}

function NoProjeto({
  ano,
  projeto,
  selecao,
  abertos,
  alternar,
  abrir,
}: {
  ano: string;
  projeto: NoProjetoGlobal;
  selecao: SelecaoGlobal;
  abertos: Set<string>;
  alternar: (chave: string) => void;
  abrir: (chave: string) => void;
}) {
  const setParams = useSetParams();
  const chave = `${ano}/${projeto.projetoId}`;
  const aberto = abertos.has(chave);
  const selecionado = selecao.projetoId === projeto.projetoId && !selecao.disciplinaId;

  return (
    <li role="treeitem" aria-expanded={aberto} aria-selected={selecionado}>
      <BotaoNo
        nivel={1}
        rotulo={projeto.codigo}
        descricao={projeto.nome}
        total={projeto.total}
        selecionado={selecionado}
        aberto={aberto}
        temFilhos
        icone={<FolderKanban className="size-3.5 shrink-0 text-primary" aria-hidden />}
        onChevron={() => alternar(chave)}
        onClick={() => {
          abrir(chave);
          setParams({ ano, projetoId: projeto.projetoId, disciplinaId: null, fase: null, ext: null });
        }}
      />
      {aberto && (
        <ul role="group">
          {projeto.disciplinas.map((disciplina) => (
            <NoDisciplina
              key={disciplina.disciplinaId}
              ano={ano}
              projetoId={projeto.projetoId}
              disciplina={disciplina}
              selecao={selecao}
              abertos={abertos}
              alternar={alternar}
              abrir={abrir}
            />
          ))}
          {projeto.areas.map((area) => (
            <li key={area.area} role="treeitem" aria-selected={false}>
              <LinkParaProjeto
                nivel={2}
                rotulo={area.rotulo}
                total={area.total}
                href={`/projetos/${projeto.projetoId}/arquivos?area=${area.area}`}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function NoDisciplina({
  ano,
  projetoId,
  disciplina,
  selecao,
  abertos,
  alternar,
  abrir,
}: {
  ano: string;
  projetoId: string;
  disciplina: NoDisciplinaGlobal;
  selecao: SelecaoGlobal;
  abertos: Set<string>;
  alternar: (chave: string) => void;
  abrir: (chave: string) => void;
}) {
  const setParams = useSetParams();
  const chave = `${ano}/${projetoId}/${disciplina.disciplinaId}`;
  const aberto = abertos.has(chave);
  const selecionado = selecao.disciplinaId === disciplina.disciplinaId && !selecao.fase;

  return (
    <li role="treeitem" aria-expanded={aberto} aria-selected={selecionado}>
      <BotaoNo
        nivel={2}
        rotulo={disciplina.rotulo}
        total={disciplina.total}
        selecionado={selecionado}
        aberto={aberto}
        temFilhos
        icone={<DisciplinaIcone nome={disciplina.rotulo} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        onChevron={() => alternar(chave)}
        onClick={() => {
          abrir(chave);
          setParams({ ano, projetoId, disciplinaId: disciplina.disciplinaId, fase: null, ext: null });
        }}
      />
      {aberto && (
        <ul role="group">
          {disciplina.formato === "pastas"
            ? disciplina.pastas.map((pasta) => (
                <NoPasta key={pasta.pastaId} nivel={3} pasta={pasta} projetoId={projetoId} />
              ))
            : disciplina.fases.map((fase) => (
                <NoFaseItem
                  key={fase.chave}
                  ano={ano}
                  projetoId={projetoId}
                  disciplinaId={disciplina.disciplinaId}
                  fase={fase}
                  selecao={selecao}
                  abertos={abertos}
                  alternar={alternar}
                  abrir={abrir}
                />
              ))}
        </ul>
      )}
    </li>
  );
}

function NoFaseItem({
  ano,
  projetoId,
  disciplinaId,
  fase,
  selecao,
  abertos,
  alternar,
  abrir,
}: {
  ano: string;
  projetoId: string;
  disciplinaId: string;
  fase: NoFase;
  selecao: SelecaoGlobal;
  abertos: Set<string>;
  alternar: (chave: string) => void;
  abrir: (chave: string) => void;
}) {
  const setParams = useSetParams();
  const chave = `${ano}/${projetoId}/${disciplinaId}/${fase.chave}`;
  const aberto = abertos.has(chave);
  const selecionado = selecao.disciplinaId === disciplinaId && selecao.fase === fase.chave && !selecao.ext;

  return (
    <li role="treeitem" aria-expanded={aberto} aria-selected={selecionado}>
      <BotaoNo
        nivel={3}
        rotulo={fase.rotulo}
        titulo={fase.titulo}
        total={fase.total}
        selecionado={selecionado}
        aberto={aberto}
        temFilhos={fase.extensoes.length > 0}
        onChevron={() => alternar(chave)}
        onClick={() => {
          abrir(chave);
          setParams({ ano, projetoId, disciplinaId, fase: fase.chave, ext: null });
        }}
      />
      {aberto && (
        <ul role="group">
          {fase.extensoes.map((ext) => (
            <li
              key={ext.chave}
              role="treeitem"
              aria-selected={selecao.disciplinaId === disciplinaId && selecao.fase === fase.chave && selecao.ext === ext.chave}
            >
              <BotaoNo
                nivel={4}
                rotulo={ext.rotulo}
                total={ext.total}
                mono
                selecionado={
                  selecao.disciplinaId === disciplinaId && selecao.fase === fase.chave && selecao.ext === ext.chave
                }
                onClick={() => setParams({ ano, projetoId, disciplinaId, fase: fase.chave, ext: ext.chave })}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Pasta de aprovação/laudo: leva para a aba do projeto, que é onde essa árvore é operada. */
function NoPasta({ nivel, pasta, projetoId }: { nivel: number; pasta: NoPastaGlobal; projetoId: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <li role="treeitem" aria-expanded={pasta.filhos.length > 0 ? aberto : undefined} aria-selected={false}>
      <div className="flex items-center">
        {pasta.filhos.length > 0 && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? `Recolher ${pasta.rotulo}` : `Expandir ${pasta.rotulo}`}
            className="shrink-0 rounded p-0.5 hover:bg-accent"
            style={{ marginLeft: `${nivel * 12}px` }}
          >
            <ChevronRight className={cn("size-3 text-muted-foreground transition-transform", aberto && "rotate-90")} />
          </button>
        )}
        <LinkParaProjeto
          nivel={pasta.filhos.length > 0 ? 0 : nivel}
          rotulo={pasta.rotulo}
          total={pasta.total}
          href={`/projetos/${projetoId}/arquivos`}
        />
      </div>
      {aberto && (
        <ul role="group">
          {pasta.filhos.map((filho) => (
            <NoPasta key={filho.pastaId} nivel={nivel + 1} pasta={filho} projetoId={projetoId} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LinkParaProjeto({
  nivel,
  rotulo,
  total,
  href,
}: {
  nivel: number;
  rotulo: string;
  total: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs text-foreground transition-colors hover:bg-accent/60"
      style={{ paddingLeft: `${8 + nivel * 12}px` }}
    >
      <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="shrink-0 tabular-nums text-muted-foreground">{total}</span>
    </Link>
  );
}

function BotaoNo({
  nivel,
  rotulo,
  descricao,
  titulo,
  total,
  selecionado,
  aberto,
  temFilhos,
  icone,
  mono,
  negrito,
  onChevron,
  onClick,
}: {
  nivel: number;
  rotulo: string;
  descricao?: string;
  titulo?: string;
  total: number;
  selecionado: boolean;
  aberto?: boolean;
  temFilhos?: boolean;
  icone?: React.ReactNode;
  mono?: boolean;
  negrito?: boolean;
  onChevron?: () => void;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center" style={{ paddingLeft: `${nivel * 12}px` }}>
      {temFilhos ? (
        <button
          type="button"
          onClick={onChevron}
          aria-label={aberto ? `Recolher ${rotulo}` : `Expandir ${rotulo}`}
          className="shrink-0 rounded p-0.5 hover:bg-accent"
        >
          <ChevronRight className={cn("size-3 text-muted-foreground transition-transform", aberto && "rotate-90")} />
        </button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={onClick}
        title={titulo}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-2 pl-1 text-left text-xs transition-colors",
          selecionado ? "bg-accent font-semibold text-foreground" : "text-foreground hover:bg-accent/60",
          negrito && "font-semibold",
        )}
      >
        {icone}
        <span className={cn("min-w-0 flex-1 truncate", mono && "font-mono uppercase")}>
          {rotulo}
          {descricao && <span className="ml-1.5 font-normal text-muted-foreground">{descricao}</span>}
        </span>
        <span className="shrink-0 font-normal tabular-nums text-muted-foreground">{total}</span>
      </button>
    </div>
  );
}
