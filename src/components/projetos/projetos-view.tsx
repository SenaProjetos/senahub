"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus } from "lucide-react";
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

export function ProjetosView({
  projetos,
  podeGerir,
  busca,
  situacao,
  clientes,
  catalogo,
  internos,
}: {
  projetos: ProjetoListItem[];
  podeGerir: boolean;
  busca: string;
  situacao: string;
  clientes: { id: string; nome: string }[];
  catalogo: string[];
  internos: { id: string; name: string; role: string }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(busca);
  const [formOpen, setFormOpen] = useState(false);

  function aplicar(next: { q?: string; situacao?: string }) {
    const p = new URLSearchParams();
    const qv = next.q ?? q;
    const sv = next.situacao ?? situacao;
    if (qv) p.set("q", qv);
    if (sv) p.set("situacao", sv);
    router.push(`/projetos${p.toString() ? `?${p}` : ""}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Projetos</h2>
          <p className="text-sm text-muted-foreground">{projetos.length} projeto(s).</p>
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
            onKeyDown={(e) => e.key === "Enter" && aplicar({})}
          />
          <Button variant="outline" size="icon" onClick={() => aplicar({})} aria-label="Buscar">
            <Search className="size-4" />
          </Button>
        </div>
        <Select
          value={situacao || "todas"}
          onValueChange={(v) => aplicar({ situacao: !v || v === "todas" ? "" : v })}
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
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Projeto</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Disciplinas</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projetos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum projeto.
                </TableCell>
              </TableRow>
            ) : (
              projetos.map((p) => {
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
