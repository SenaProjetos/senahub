"use client";

import { useRouter } from "next/navigation";
import { Mail, ChevronRight } from "lucide-react";
import { formatarDataHora } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export type AvisoRegistro = {
  id: string;
  titulo: string;
  criadoEm: string | Date;
  /** Momento do disparo. Nos avisos antigos (antes do agendamento) = criadoEm. */
  enviadoEm: string | Date | null;
  agendadoPara: string | Date | null;
  autor: string;
  /** Rótulo do alvo já resolvido no servidor (ver modules/notificacoes/avisos/alvo-label.ts). */
  alvoLabel: string;
  enviouEmail: boolean;
  total: number;
  confirmados: number;
};

export function AvisosRegistro({ avisos }: { avisos: AvisoRegistro[] }) {
  const router = useRouter();

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
              <TableRow
                key={a.id}
                className="cursor-pointer"
                onClick={() => router.push(`/configuracoes/avisos/${a.id}`)}
              >
                <TableCell>
                  <span className="font-medium">{a.titulo}</span>
                  <span className="block text-xs text-muted-foreground">por {a.autor}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.alvoLabel}
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
                  {formatarDataHora(new Date(a.enviadoEm ?? a.criadoEm))}
                  {a.agendadoPara && (
                    <span className="block text-[11px] text-muted-foreground/70">agendado</span>
                  )}
                </TableCell>
                <TableCell>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
