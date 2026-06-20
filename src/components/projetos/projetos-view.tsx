"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Plus, FolderOpen } from "lucide-react";
import type { ProjetoListItem } from "@/modules/projetos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL, STATUS_CHIP, STATUS_LABEL } from "@/modules/projetos/status";
import { ProjetoForm } from "@/components/projetos/projeto-form";
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
import { EmptyState } from "@/components/ui/empty-state";
import { SortableHead } from "@/components/ui/sortable-head";
import { Pagination } from "@/components/ui/pagination";
import { useSetParams } from "@/lib/use-set-param";

export function ProjetosView({
  items,
  podeGerir,
  busca,
  situacao,
  clienteId,
  responsavelId,
  disciplina,
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
  busca: string;
  situacao: string;
  clienteId: string;
  responsavelId: string;
  disciplina: string;
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

  function aplicarBusca() {
    setParams({ q: q || null });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Projetos</h2>
          <p className="text-sm text-muted-foreground">{total} projeto(s).</p>
        </div>
        {podeGerir && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Novo projeto
          </Button>
        )}
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

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="codigo" className="w-24">
                Código
              </SortableHead>
              <SortableHead field="nome">Projeto</SortableHead>
              <SortableHead field="cliente">Cliente</SortableHead>
              <TableHead>Disciplinas</TableHead>
              <SortableHead field="situacao">Situação</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState icon={FolderOpen} title="Nenhum projeto" />
                </TableCell>
              </TableRow>
            ) : (
              items.map((p) => {
                const counts = p.disciplinas.reduce<Record<string, number>>((acc, d) => {
                  acc[d.status] = (acc[d.status] ?? 0) + 1;
                  return acc;
                }, {});
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
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.cliente.nome}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(counts).map(([st, n]) => (
                          <span
                            key={st}
                            className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${STATUS_CHIP[st as keyof typeof STATUS_CHIP]}`}
                            title={STATUS_LABEL[st as keyof typeof STATUS_LABEL]}
                          >
                            {n} {STATUS_LABEL[st as keyof typeof STATUS_LABEL]}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{SITUACAO_PROJETO_LABEL[p.situacao]}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

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
