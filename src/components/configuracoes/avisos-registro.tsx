"use client";

import Link from "next/link";
import { Mail, ChevronRight } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { formatarDataHora } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export type AvisoRegistro = {
  id: string;
  titulo: string;
  criadoEm: string | Date;
  autor: string;
  alvoTipo: string;
  alvoRoles: string[];
  enviouEmail: boolean;
  total: number;
  confirmados: number;
};

function alvoTexto(a: AvisoRegistro): string {
  if (a.alvoTipo === "todos") return "Todos";
  if (a.alvoTipo === "usuarios") return "Por nome";
  return a.alvoRoles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ") || "Categorias";
}

export function AvisosRegistro({ avisos }: { avisos: AvisoRegistro[] }) {
  if (avisos.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="Nenhum aviso enviado"
        description="Os comunicados enviados aparecerão aqui com o total de confirmações de leitura."
      />
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aviso</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead className="text-right">Leituras</TableHead>
            <TableHead>Enviado</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {avisos.map((a) => {
            const pct = a.total > 0 ? Math.round((a.confirmados / a.total) * 100) : 0;
            return (
              <TableRow key={a.id} className="cursor-pointer">
                <TableCell>
                  <Link href={`/configuracoes/avisos/${a.id}`} className="block">
                    <span className="font-medium">{a.titulo}</span>
                    <span className="block text-xs text-muted-foreground">por {a.autor}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {alvoTexto(a)}
                  {a.enviouEmail && (
                    <Mail className="ml-1 inline size-3 text-muted-foreground/70" aria-label="Enviado por e-mail" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm tabular-nums">
                    {a.confirmados}/{a.total}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">({pct}%)</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatarDataHora(new Date(a.criadoEm))}
                </TableCell>
                <TableCell>
                  <Link href={`/configuracoes/avisos/${a.id}`} aria-label="Ver detalhes">
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
