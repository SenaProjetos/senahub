"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { criarFolha } from "@/modules/rh/folha/actions";
import type { FolhaResumo } from "@/modules/rh/folha/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FolhasView({ folhas }: { folhas: FolhaResumo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = new Date();
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [mes, setMes] = useState(String(hoje.getMonth() + 1));

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
            Holerites mensais; fechar gera o custo na DRE (categoria 2.03).
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
            {folhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma folha.
                </TableCell>
              </TableRow>
            ) : (
              folhas.map((f) => (
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
                    <Badge
                      variant="outline"
                      className={f.status === "fechada" ? "text-success border-success/40" : "text-warning border-warning/40"}
                    >
                      {f.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
