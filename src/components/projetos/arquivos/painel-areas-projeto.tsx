"use client";

import { useEffect } from "react";
import { FileCheck2, FolderOpen, Inbox, Ruler, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AREA_ROTULO, type AreaDisponivel, type AreaProjeto } from "@/modules/uploads/areas-projeto";
import { useSetParams } from "@/lib/use-set-param";
import { cn } from "@/lib/utils";

/**
 * Áreas do projeto que NÃO são documentos de disciplina (paridade com a tela antiga).
 *
 * Recebidos, Base Arquitetônica, Geral, ARTs e Lixeira existiam só no explorer antigo e
 * ficaram de fora quando a tela nova nasceu focada no documento de engenharia — quem ligasse
 * a tela nova perdia acesso a tudo isso. Aqui elas voltam como destinos de navegação, ao lado
 * de Disciplinas e Listas.
 *
 * A seleção vive na URL (`?area=`), igual a disciplina e lista: assim o servidor decide o que
 * renderizar e o link é compartilhável. Rótulos e validação moram em
 * `modules/uploads/areas-projeto.ts`, que a página (server) também importa.
 */

/**
 * Baixa antes do clique o código que desenha as áreas.
 *
 * O `DocumentosShell` é Server Component e só referencia `ConteudoAreaProjeto` quando há área
 * selecionada — então o chunk dele (que traz o explorer antigo inteiro) só era pedido DEPOIS da
 * resposta do servidor, no primeiro clique: um round-trip a mais em produção e, no `npm run dev`,
 * a compilação sob demanda do Turbopack. As disciplinas não sofriam isso porque a tabela já vem
 * na carga da página. O `import()` é idempotente (o bundler guarda o módulo), chamar de novo no
 * hover não custa nada.
 */
function preCarregarConteudoArea() {
  void import("@/components/projetos/arquivos/conteudo-area-projeto");
}

const ICONE: Record<AreaProjeto, LucideIcon> = {
  recebidos: Inbox,
  base: Ruler,
  geral: FolderOpen,
  arts: FileCheck2,
  lixeira: Trash2,
};

export function PainelAreasProjeto({
  areas,
  selecionada,
}: {
  areas: AreaDisponivel[];
  selecionada: AreaProjeto | null;
}) {
  const setParams = useSetParams();
  const visiveis = areas.filter((a) => a.visivel);
  const temAreas = visiveis.length > 0;

  // Com o navegador ocioso, não disputa banda com a carga da página. Safari não tem
  // `requestIdleCallback`: cai num timeout curto.
  useEffect(() => {
    if (!temAreas) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preCarregarConteudoArea, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(preCarregarConteudoArea, 1500);
    return () => window.clearTimeout(t);
  }, [temAreas]);

  if (!temAreas) return null;

  return (
    <div className="border-t border-border p-2">
      <p className="px-2 pb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Áreas do projeto
      </p>
      <ul className="space-y-0.5" role="list">
        {visiveis.map((a) => {
          const meta = AREA_ROTULO[a.id];
          const Icone = ICONE[a.id];
          const ativa = selecionada === a.id;
          return (
            <li key={a.id}>
              <button
                type="button"
                // Escolher uma área limpa a disciplina e a lista: são navegações concorrentes,
                // e manter as três na URL mostraria um recorte que a tela não representa.
                onClick={() =>
                  setParams({ area: ativa ? null : a.id, disciplinaId: null, listaId: null })
                }
                onPointerEnter={preCarregarConteudoArea}
                onFocus={preCarregarConteudoArea}
                title={meta.descricao}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  ativa ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60",
                )}
              >
                <Icone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{meta.rotulo}</span>
                {a.total > 0 && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">{a.total}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
