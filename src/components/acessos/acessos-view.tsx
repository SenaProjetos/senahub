"use client";

import { useEffect, useState } from "react";
import { KeyRound, Landmark, Monitor, ShieldCheck, Search, X, Star } from "lucide-react";
import { useSetParams } from "@/lib/use-set-param";
import { KpiCard } from "@/components/ui/kpi-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { iconeDaCategoria } from "@/modules/acessos/labels";
import { STATUS_CREDENCIAL } from "@/modules/acessos/service";
import { STATUS_LABEL } from "@/modules/acessos/labels";
import { UFS } from "@/modules/acessos/schemas";
import { AcessosTabela, type LinhaAcesso } from "./acessos-tabela";
import { AreaAtencao, type AlertaUI } from "./area-atencao";
import { AcessoDrawer } from "./acesso-drawer";

export type CategoriaFiltro = { id: string; nome: string; icone: string | null; quantidade: number };

/**
 * Tela da Central de Acessos (§6–§20).
 *
 * Hierarquia da referência visual: cabeçalho compacto → cards de indicador → atenção → busca +
 * filtros → acesso rápido → tabela. Densidade alta, cor institucional só na ação primária, e
 * verde/âmbar/vermelho reservados a status (§3).
 */
export function AcessosView({
  items,
  total,
  page,
  pageCount,
  pageSize,
  categorias,
  responsaveis,
  indicadores,
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
  categorias: CategoriaFiltro[];
  responsaveis: Array<{ id: string; name: string }>;
  indicadores: { total: number; portais: number; softwares: number; restritos: number };
  alertas: AlertaUI[];
  podeGerir: boolean;
  podeRevelar: boolean;
  filtros: {
    q: string;
    categoriaId: string;
    estado: string;
    responsavelId: string;
    status: string;
    favoritos: boolean;
  };
}) {
  const setParams = useSetParams();
  const [busca, setBusca] = useState(filtros.q);
  const [aberto, setAberto] = useState<string | null>(null);

  /**
   * Busca com debounce (§9 — "não realizar pesquisas excessivas no servidor").
   *
   * Dispara em `replace`, não `push`: cada tecla que virasse entrada de histórico faria o
   * botão Voltar do navegador desfazer a busca letra por letra.
   *
   * A guarda `busca === filtros.q` é o que impede o laço — depois que a navegação acontece,
   * o servidor devolve `filtros.q` igual ao estado local e o efeito não redispara. Também
   * evita disparar na montagem quando a página já veio com `?q=` na URL.
   */
  useEffect(() => {
    if (busca === filtros.q) return;
    const t = setTimeout(() => setParams({ q: busca || null }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [busca, filtros.q, setParams]);

  const temFiltro =
    Boolean(filtros.categoriaId || filtros.estado || filtros.responsavelId || filtros.status || filtros.q) ||
    filtros.favoritos;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Cabeçalho (§6) */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acessos e Credenciais</h1>
          <p className="text-sm text-muted-foreground">
            Central de contas, portais, softwares e licenças da empresa
          </p>
        </div>
        {podeGerir && (
          <Button disabled title="O formulário de cadastro entra na Fase 6">
            <KeyRound className="size-4" aria-hidden />
            Novo acesso
          </Button>
        )}
      </header>

      {/* Indicadores (§7). Todos com `detalhe` — sem ele o card fica com espaço morto embaixo e
          estoura os 80-100px que §68 pede. Os números são do ESCOPO do viewer, não do cofre. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Contas cadastradas"
          valor={indicadores.total}
          icone={KeyRound}
          detalhe="Acessos que você alcança"
        />
        <KpiCard
          label="Portais públicos"
          valor={indicadores.portais}
          icone={Landmark}
          detalhe="Órgãos, conselhos e prefeituras"
        />
        <KpiCard
          label="Softwares e licenças"
          valor={indicadores.softwares}
          icone={Monitor}
          detalhe="Contratos e assentos"
        />
        <KpiCard
          label="Acessos restritos"
          valor={indicadores.restritos}
          icone={ShieldCheck}
          detalhe="Credencial só com pessoas nominais"
        />
      </div>

      {/* Atenção necessária (§8) — só aparece quando há o que mostrar */}
      <AreaAtencao alertas={alertas} onAbrir={setAberto} />

      {/* Busca (§9) + filtros (§10) */}
      <div className="space-y-3">
        <form
          // Enter continua submetendo — quem digita e aperta não espera o debounce.
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q: busca || null });
          }}
          className="relative"
          role="search"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conta, órgão, software, usuário ou estado..."
            aria-label="Buscar acessos"
            className="pl-9"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <FiltroSelect
            rotulo="Categoria"
            valor={filtros.categoriaId}
            onChange={(v) => setParams({ categoriaId: v })}
            opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          />
          <FiltroSelect
            rotulo="Estado"
            valor={filtros.estado}
            onChange={(v) => setParams({ estado: v })}
            opcoes={[
              { valor: "NACIONAL", rotulo: "Nacional" },
              { valor: "NA", rotulo: "Não aplicável" },
              ...UFS.map((uf) => ({ valor: uf, rotulo: uf })),
            ]}
          />
          <FiltroSelect
            rotulo="Responsável"
            valor={filtros.responsavelId}
            onChange={(v) => setParams({ responsavelId: v })}
            opcoes={responsaveis.map((r) => ({ valor: r.id, rotulo: r.name }))}
          />
          <FiltroSelect
            rotulo="Status"
            valor={filtros.status}
            onChange={(v) => setParams({ status: v })}
            opcoes={STATUS_CREDENCIAL.map((s) => ({ valor: s, rotulo: STATUS_LABEL[s] }))}
          />

          <Button
            variant={filtros.favoritos ? "secondary" : "outline"}
            size="sm"
            onClick={() => setParams({ favoritos: filtros.favoritos ? null : "1" })}
            aria-pressed={filtros.favoritos}
          >
            <Star className={cn("size-4", filtros.favoritos && "fill-current")} aria-hidden />
            Favoritos
          </Button>

          {temFiltro && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setParams({
                  q: null,
                  categoriaId: null,
                  estado: null,
                  responsavelId: null,
                  status: null,
                  favoritos: null,
                })
              }
            >
              <X className="size-4" aria-hidden />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Acesso rápido (§11) — clicar aplica o filtro, não navega */}
      {categorias.length > 0 && (
        <section aria-labelledby="acesso-rapido">
          <h2
            id="acesso-rapido"
            className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Acesso rápido
          </h2>
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => {
              const Icone = iconeDaCategoria(c.nome);
              const ativo = filtros.categoriaId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setParams({ categoriaId: ativo ? null : c.id })}
                  aria-pressed={ativo}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ativo ? "border-primary bg-primary/5" : "bg-card hover:bg-accent",
                  )}
                >
                  <Icone className="size-4 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium">{c.nome}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {c.quantidade} {c.quantidade === 1 ? "conta" : "contas"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Tabela (§12) */}
      <section aria-labelledby="contas">
        <h2 id="contas" className="sr-only">
          Contas
        </h2>
        <AcessosTabela
          items={items}
          temFiltro={temFiltro}
          podeGerir={podeGerir}
          onAbrir={setAberto}
        />
        {pageCount > 1 && (
          <div className="mt-4">
            <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />
          </div>
        )}
      </section>

      <AcessoDrawer
        credencialId={aberto}
        onFechar={() => setAberto(null)}
        podeRevelar={podeRevelar}
      />
    </div>
  );
}

/** Select de filtro com opção "Todos" — o valor vazio limpa o parâmetro da URL. */
function FiltroSelect({
  rotulo,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string | null) => void;
  opcoes: Array<{ valor: string; rotulo: string }>;
}) {
  return (
    <Select
      value={valor || "__todos"}
      // base-ui devolve `string | null`, diferente do Radix — ver gotcha do CLAUDE.md.
      onValueChange={(v) => onChange(!v || v === "__todos" ? null : v)}
    >
      <SelectTrigger className="h-9 w-auto min-w-36" aria-label={rotulo}>
        <SelectValue placeholder={rotulo} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__todos">{rotulo}: todos</SelectItem>
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
