"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";
import { criarFolha } from "@/modules/rh/folha/actions";
import type { FolhaResumo } from "@/modules/rh/folha/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { PAGE_SIZES, PAGE_SIZE_PADRAO, pageCount as calcPageCount } from "@/lib/list-params";
import { brl } from "@/lib/utils";

export function FolhasView({ folhas }: { folhas: FolhaResumo[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const hoje = new Date();
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [mes, setMes] = useState(String(hoje.getMonth() + 1));

  // Histórico paginado client-side: a query já traz todos os meses (desc).
  const total = folhas.length;
  const psRaw = Number(searchParams.get("pageSize"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(psRaw) ? psRaw : PAGE_SIZE_PADRAO;
  const pageCount = calcPageCount(total, pageSize);
  const pageRaw = Number(searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, pageCount) : 1;
  const visiveis = folhas.slice((page - 1) * pageSize, page * pageSize);

  function criar() {
    start(async () => {
      const r = await criarFolha({ ano: Number(ano), mes: Number(mes) });
      if (r.ok) {
        toast.success("Folha criada.");
        router.push(`/rh/folha/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Folha CLT</h2>
          <p className="text-sm text-muted-foreground">
            Histórico de holerites mensais; fechar gera o custo na DRE (categoria 2.03).
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Input
            type="number"
            className="w-20"
            value={mes}
            min={1}
            max={12}
            onChange={(e) => setMes(e.target.value)}
            aria-label="Mês"
          />
          <Input
            type="number"
            className="w-28"
            value={ano}
            onChange={(e) => setAno(e.target.value)}
            aria-label="Ano"
          />
          <Button onClick={criar} disabled={pending}>
            <Plus className="size-4" /> Nova folha
          </Button>
        </div>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competência</TableHead>
              <TableHead>Holerites</TableHead>
              <TableHead className="text-right">Proventos</TableHead>
              <TableHead className="text-right">Descontos</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {total === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState icon={FileText} title="Nenhuma folha" />
                </TableCell>
              </TableRow>
            ) : (
              visiveis.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/rh/folha/${f.id}`} className="hover:underline">
                      {String(f.mes).padStart(2, "0")}/{f.ano}
                    </Link>
                  </TableCell>
                  <TableCell>{f.holerites}</TableCell>
                  <TableCell className="text-right font-mono text-success">{brl(f.proventos)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(f.descontos)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{brl(f.liquido)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={f.status === "fechada" ? "success" : "warning"}>
                      {f.status}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />
    </div>
  );
}
