"use client";

import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { useSetParams } from "@/lib/use-set-param";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AcessosTabela, type LinhaAcesso } from "./acessos-tabela";
import { AcessosFiltros, type FiltrosAtuais } from "./acessos-filtros";
import { AcessoRapido, type CategoriaAtalho } from "./acesso-rapido";
import { PainelAtencao, type AlertaUI } from "./painel-atencao";
import { CardsIndicadores, type Indicadores } from "./cards-indicadores";
import { ResumoStatus, type ContagemStatus } from "./resumo-status";
import { RodapeSeguranca } from "./rodape-seguranca";
import { AcessoDrawer } from "./acesso-drawer";

/**
 * Central de Acessos (§6–§20), no arranjo da referência visual do dono:
 *
 *   cabeçalho → indicadores → busca/filtros → [acesso rápido | tabela | atenção + resumo] → rodapé
 *
 * As três colunas só existem a partir de `xl`. Abaixo disso empilham na ordem em que importam:
 * tabela primeiro (é o trabalho), atalhos e painéis depois — em tela estreita, uma coluna lateral
 * antes da tabela empurraria o conteúdo principal para fora da primeira dobra.
 */
export function AcessosView({
  items,
  total,
  page,
  pageCount,
  pageSize,
  skip,
  categorias,
  responsaveis,
  indicadores,
  contagemStatus,
  alertas,
  podeGerir,
  podeRevelar,
  filtros,
}: {
  items: LinhaAcesso[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  skip: number;
  categorias: CategoriaAtalho[];
  responsaveis: Array<{ id: string; name: string }>;
  indicadores: Indicadores;
  contagemStatus: ContagemStatus;
  alertas: AlertaUI[];
  podeGerir: boolean;
  podeRevelar: boolean;
  filtros: FiltrosAtuais;
}) {
  const setParams = useSetParams();
  const [aberto, setAberto] = useState<string | null>(null);
  // Abre já expandido quando a URL trouxe filtro: esconder um filtro ativo dentro de um painel
  // fechado é como o usuário perde a noção de por que a lista está curta.
  const [avancados, setAvancados] = useState(
    Boolean(filtros.categoriaId || filtros.estado || filtros.responsavelId || filtros.nivelAcesso || filtros.status),
  );

  const temFiltro =
    Boolean(
      filtros.q ||
        filtros.categoriaId ||
        filtros.estado ||
        filtros.responsavelId ||
        filtros.nivelAcesso ||
        filtros.status,
    ) || filtros.favoritos;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acessos e Credenciais</h1>
          <p className="text-sm text-muted-foreground">
            Central de contas, portais, softwares e licenças da empresa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filtros.favoritos ? "secondary" : "outline"}
            onClick={() => setParams({ favoritos: filtros.favoritos ? null : "1" })}
            aria-pressed={filtros.favoritos}
          >
            <Star className={cn("size-4", filtros.favoritos && "fill-current")} aria-hidden />
            Favoritos
          </Button>
          {podeGerir && (
            <Button disabled title="O formulário de cadastro entra na Fase 6">
              <Plus className="size-4" aria-hidden />
              Nova conta
            </Button>
          )}
        </div>
      </header>

      <CardsIndicadores indicadores={indicadores} />

      <AcessosFiltros
        filtros={filtros}
        categorias={categorias}
        responsaveis={responsaveis}
        avancadosAbertos={avancados}
        onAlternarAvancados={() => setAvancados((v) => !v)}
      />

      {/* `min-w-0` na coluna do meio: sem isso o grid usa a largura intrínseca da tabela como
          mínimo e a página inteira ganha barra horizontal em vez de a tabela rolar sozinha. */}
      <div className="grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        <div className="order-2 xl:order-1">
          <AcessoRapido categorias={categorias} categoriaAtiva={filtros.categoriaId} />
        </div>

        <section aria-labelledby="contas" className="order-1 min-w-0 xl:order-2">
          <div className="rounded-lg border bg-card">
            <h2
              id="contas"
              className="border-b px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              Contas cadastradas
            </h2>
            <AcessosTabela
              items={items}
              temFiltro={temFiltro}
              podeGerir={podeGerir}
              podeRevelar={podeRevelar}
              onAbrir={setAberto}
              total={total}
              skip={skip}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
            />
          </div>
        </section>

        <div className="order-3 space-y-4">
          <PainelAtencao alertas={alertas} onAbrir={setAberto} />
          <ResumoStatus contagem={contagemStatus} />
        </div>
      </div>

      <RodapeSeguranca />

      <AcessoDrawer credencialId={aberto} onFechar={() => setAberto(null)} podeRevelar={podeRevelar} />
    </div>
  );
}
