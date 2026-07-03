"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  FolderOpen,
  Table as TableIcon,
  LayoutGrid,
  KanbanSquare,
  Download,
  FileSpreadsheet,
  FileText,
  CalendarClock,
} from "lucide-react";
import type { ProjetoListItem } from "@/modules/projetos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import {
  SITUACAO_PROJETO_LABEL,
  TIPO_PROJETO_LABEL,
  progressoProjeto,
} from "@/modules/projetos/status";
import { ProjetoForm } from "@/components/projetos/projeto-form";
import { DisciplinaIcones } from "@/components/projetos/disciplina-icones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { SortableHead } from "@/components/ui/sortable-head";
import { Pagination } from "@/components/ui/pagination";
import { useSetParams } from "@/lib/use-set-param";
import { formatarData } from "@/lib/utils";
import { saudeProjeto, type NivelSaude } from "@/modules/projetos/health";

const SAUDE_LABEL: Record<NivelSaude, string> = {
  ok: "OK",
  atencao: "Atenção",
  critico: "Crítico",
};
const SAUDE_CLASS: Record<NivelSaude, string> = {
  ok: "text-success",
  atencao: "text-warning",
  critico: "text-destructive",
};


type Vista = "cards" | "tabela" | "kanban";
const VISTA_KEY = "projetos:vista";
const SAUDE_ORDEM: Record<NivelSaude, number> = { critico: 0, atencao: 1, ok: 2 };

/** Dias de atraso de um projeto em andamento (0 se sem prazo ou no prazo). */
function diasAtraso(p: ProjetoListItem): number {
  if (!p.prazoFinal || p.situacao !== "em_andamento") return 0;
  return Math.max(0, Math.round((Date.now() - new Date(p.prazoFinal).getTime()) / 86400000));
}

/** Cor do texto do prazo conforme a saúde do projeto. */
function corPrazo(saude: NivelSaude | null): string {
  if (saude === "critico") return "text-destructive";
  if (saude === "atencao") return "text-warning";
  return "text-muted-foreground";
}

export function ProjetosView({
  items: itemsOriginais,
  podeGerir,
  podeVerTodos,
  busca,
  situacao,
  clienteId,
  responsavelId,
  disciplina,
  meusProjetos,
  page,
  pageCount,
  pageSize,
  total,
  clientes,
  catalogo,
  internos,
}: {
  items: ProjetoListItem[];
  podeGerir: boolean;
  podeVerTodos: boolean;
  busca: string;
  situacao: string;
  clienteId: string;
  responsavelId: string;
  disciplina: string;
  meusProjetos: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  clientes: { id: string; nome: string }[];
  catalogo: string[];
  internos: { id: string; name: string; role: string }[];
}) {
  const setParams = useSetParams();
  const [q, setQ] = useState(busca);
  const [formOpen, setFormOpen] = useState(false);
  const [sortRisco, setSortRisco] = useState(false);
  // Visão é preferência pessoal (não filtro compartilhável): estado local persistido em localStorage.
  // Render inicial determinístico ("cards") evita mismatch de hidratação; useEffect restaura a escolha.
  const [vista, setVista] = useState<Vista>("cards");
  useEffect(() => {
    const salvo = localStorage.getItem(VISTA_KEY);
    if (salvo === "cards" || salvo === "tabela" || salvo === "kanban") setVista(salvo);
  }, []);
  function mudarVista(v: Vista) {
    setVista(v);
    localStorage.setItem(VISTA_KEY, v);
  }

  const items = sortRisco
    ? [...itemsOriginais].sort((a, b) => {
        const sa = saudeProjeto(a.disciplinas, a.prazoFinal, a.situacao) ?? "ok";
        const sb = saudeProjeto(b.disciplinas, b.prazoFinal, b.situacao) ?? "ok";
        return SAUDE_ORDEM[sa] - SAUDE_ORDEM[sb];
      })
    : itemsOriginais;

  function aplicarBusca() {
    setParams({ q: q || null });
  }

  const TOGGLES: { v: Vista; icon: typeof LayoutGrid; label: string }[] = [
    { v: "cards", icon: LayoutGrid, label: "Visão em cards" },
    { v: "tabela", icon: TableIcon, label: "Visão em lista" },
    { v: "kanban", icon: KanbanSquare, label: "Visão em kanban" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Projetos</h2>
          <p className="text-sm text-muted-foreground">{total} projeto(s).</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-sm border p-0.5">
            {TOGGLES.map((t) => (
              <Button
                key={t.v}
                type="button"
                variant={vista === t.v ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                aria-label={t.label}
                aria-pressed={vista === t.v}
                onClick={() => mudarVista(t.v)}
              >
                <t.icon className="size-4" />
              </Button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" aria-label="Exportar carteira">
                  <Download className="size-4" /> Exportar
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<a href="/api/projetos/carteira?formato=xlsx" download />}>
                <FileSpreadsheet className="size-4" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem render={<a href="/api/projetos/carteira?formato=csv" download />}>
                <FileText className="size-4" /> CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {podeGerir && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> Novo projeto
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-sm flex-1 items-center gap-2">
          <Input
            placeholder="Buscar por código, nome ou cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarBusca()}
          />
          <Button variant="outline" size="icon" onClick={aplicarBusca} aria-label="Buscar">
            <Search className="size-4" />
          </Button>
        </div>
        <Select
          value={situacao || "todas"}
          onValueChange={(v) => setParams({ situacao: v === "todas" ? null : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações</SelectItem>
            {Object.entries(SITUACAO_PROJETO_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {podeVerTodos && (
          <Button
            variant={meusProjetos ? "secondary" : "outline"}
            size="sm"
            onClick={() => setParams({ meu: meusProjetos ? null : "1" })}
          >
            Meus projetos
          </Button>
        )}
        <Button
          variant={sortRisco ? "secondary" : "outline"}
          size="sm"
          onClick={() => setSortRisco((v) => !v)}
          title="Ordenar por nível de saúde (crítico primeiro)"
        >
          Ordenar por risco
        </Button>
        {podeGerir && (
          <>
            <Select
              value={clienteId || "todos"}
              onValueChange={(v) => setParams({ cliente: v === "todos" ? null : v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os clientes</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={responsavelId || "todos"}
              onValueChange={(v) => setParams({ responsavel: v === "todos" ? null : v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os responsáveis</SelectItem>
                {internos.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={disciplina || "todas"}
              onValueChange={(v) => setParams({ disciplina: v === "todas" ? null : v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Disciplina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as disciplinas</SelectItem>
                {catalogo.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-sm border">
          <EmptyState
            icon={FolderOpen}
            title="Nenhum projeto"
            description={podeGerir ? "Crie o primeiro projeto para começar." : "Nenhum projeto designado a você ainda."}
          />
        </div>
      ) : vista === "kanban" ? (
        <ProjetosKanban items={items} />
      ) : vista === "cards" ? (
        <ProjetosCards items={items} />
      ) : (
        <ProjetosTabela items={items} />
      )}

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />

      {podeGerir && (
        <ProjetoForm
          open={formOpen}
          onOpenChange={setFormOpen}
          clientes={clientes}
          catalogo={catalogo}
          internos={internos}
        />
      )}
    </div>
  );
}

/** Visão LISTA responsiva: colunas prioritárias sempre visíveis; secundárias colapsam em telas estreitas. */
function ProjetosTabela({ items }: { items: ProjetoListItem[] }) {
  return (
    <div className="rounded-sm border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead field="codigo" className="w-24">
              Código
            </SortableHead>
            <SortableHead field="nome">Projeto</SortableHead>
            <SortableHead field="cliente" className="hidden md:table-cell">
              Cliente
            </SortableHead>
            <TableHead className="hidden sm:table-cell">Disciplinas</TableHead>
            <TableHead className="hidden lg:table-cell">Prazo</TableHead>
            <SortableHead field="situacao" className="hidden xl:table-cell">
              Situação
            </SortableHead>
            <TableHead>Saúde</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => {
            const saude = saudeProjeto(p.disciplinas, p.prazoFinal, p.situacao);
            const atraso = diasAtraso(p);
            return (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/projetos/${p.id}`} className="hover:underline">
                    {formatarCodigo(p.codigo)}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/projetos/${p.id}`} className="hover:underline">
                    {p.nome}
                  </Link>
                  <span className="block text-xs font-normal text-muted-foreground md:hidden">
                    {p.cliente.nome}
                  </span>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {p.cliente.nome}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <DisciplinaIcones disciplinas={p.disciplinas} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {p.prazoFinal ? (
                    <span className={`inline-flex items-center gap-1 text-xs ${corPrazo(saude)}`}>
                      {formatarData(p.prazoFinal)}
                      {atraso > 0 && (
                        <Badge variant="destructive" className="text-[9px] leading-tight">
                          +{atraso}d
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <Badge variant="outline">{SITUACAO_PROJETO_LABEL[p.situacao]}</Badge>
                </TableCell>
                <TableCell>
                  {saude ? (
                    <span className={`text-xs font-medium ${SAUDE_CLASS[saude]}`}>
                      {SAUDE_LABEL[saude]}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Visão CARDS (padrão): grade responsiva com tipo, prazo+risco, ícones de disciplina e progresso. */
function ProjetosCards({ items }: { items: ProjetoListItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => {
        const prog = progressoProjeto(p.disciplinas.map((d) => d.status));
        const saude = saudeProjeto(p.disciplinas, p.prazoFinal, p.situacao);
        const atraso = diasAtraso(p);
        return (
          <Link
            key={p.id}
            href={`/projetos/${p.id}`}
            className="flex min-w-0 flex-col gap-2 rounded-sm border bg-card p-3 shadow-sm transition-colors hover:border-primary"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">{formatarCodigo(p.codigo)}</span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {TIPO_PROJETO_LABEL[p.tipo] ?? p.tipo}
              </Badge>
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium leading-tight" title={p.nome}>{p.nome}</p>
              <p className="truncate text-xs text-muted-foreground" title={p.cliente.nome}>{p.cliente.nome}</p>
            </div>
            <DisciplinaIcones disciplinas={p.disciplinas} />
            <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
              {p.prazoFinal ? (
                <span className={`inline-flex items-center gap-1 ${corPrazo(saude)}`}>
                  <CalendarClock className="size-3.5" aria-hidden />
                  {formatarData(p.prazoFinal)}
                  {atraso > 0 && (
                    <Badge variant="destructive" className="text-[9px] leading-tight">
                      +{atraso}d
                    </Badge>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">Sem prazo</span>
              )}
              {saude && (
                <span className={`font-medium ${SAUDE_CLASS[saude]}`}>{SAUDE_LABEL[saude]}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${prog}%` }} />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{prog}%</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** Ordem fixa das colunas do kanban por situação. */
const SITUACOES_KANBAN = ["em_andamento", "concluido", "arquivado", "cancelado"] as const;

/** Visão KANBAN read-only: agrupa os projetos da página atual por `situacao`. */
function ProjetosKanban({ items }: { items: ProjetoListItem[] }) {
  const grupos = SITUACOES_KANBAN.map((sit) => ({
    sit,
    label: SITUACAO_PROJETO_LABEL[sit] ?? sit,
    projetos: items.filter((p) => p.situacao === sit),
  }));

  return (
    <div className="flex w-full min-w-0 gap-3 overflow-x-auto pb-2">
      {grupos.map((g) => (
        <div key={g.sit} className="w-[80vw] min-w-[16rem] max-w-72 shrink-0 sm:w-72">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold">{g.label}</span>
            <Badge variant="outline" className="ml-auto">
              {g.projetos.length}
            </Badge>
          </div>
          <div className="min-h-40 space-y-2 rounded-sm border border-dashed p-2">
            {g.projetos.map((p) => {
              const prog = progressoProjeto(p.disciplinas.map((d) => d.status));
              const atraso = diasAtraso(p);
              return (
                <Link
                  key={p.id}
                  href={`/projetos/${p.id}`}
                  className="block min-w-0 rounded-sm border bg-card p-2.5 text-sm shadow-sm transition-colors hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-mono text-xs text-muted-foreground">{formatarCodigo(p.codigo)}</p>
                    {atraso > 0 && (
                      <Badge variant="destructive" className="shrink-0 text-[9px] leading-tight">+{atraso}d</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-medium leading-tight" title={p.nome}>{p.nome}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={p.cliente.nome}>{p.cliente.nome}</p>
                  <div className="mt-2">
                    <DisciplinaIcones disciplinas={p.disciplinas} size="size-3.5" />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${prog}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{prog}%</span>
                  </div>
                </Link>
              );
            })}
            {g.projetos.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">vazio</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
