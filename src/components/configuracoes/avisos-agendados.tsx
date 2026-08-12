"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Clock, Mail } from "lucide-react";
import { cancelarAvisoAgendado } from "@/modules/notificacoes/avisos/actions";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { formatarDataHora } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type AvisoAgendado = {
  id: string;
  titulo: string;
  autor: string;
  alvoTipo: string;
  alvoRoles: string[];
  agendadoPara: string | Date | null;
  canceladoEm: string | Date | null;
  emailSolicitado: boolean;
};

function alvoTexto(a: AvisoAgendado): string {
  if (a.alvoTipo === "todos") return "Todos";
  if (a.alvoTipo === "usuarios") return "Por nome";
  return a.alvoRoles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ") || "Categorias";
}

/**
 * Avisos que ainda não dispararam (e os que foram cancelados antes de disparar).
 * O alvo só vira lista de destinatários no envio, por isso aqui não há contagem
 * de leitura — o que se pode fazer é cancelar.
 */
export function AvisosAgendados({ avisos }: { avisos: AvisoAgendado[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  async function cancelar(a: AvisoAgendado) {
    const ok = await confirm({
      title: "Cancelar o envio?",
      description: `“${a.titulo}” não será enviado. Não dá para desfazer o cancelamento.`,
      variant: "destructive",
      confirmLabel: "Cancelar envio",
    });
    if (!ok) return;
    setCancelandoId(a.id);
    const r = await cancelarAvisoAgendado({ id: a.id });
    setCancelandoId(null);
    if (r.ok) {
      toast.success("Envio cancelado.");
      router.refresh();
    } else toast.error(r.error);
  }

  if (avisos.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nenhum aviso agendado"
        description="Ao criar um aviso, ligue “Agendar envio” para programá-lo — ele aparece aqui até disparar."
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
            <TableHead>Envio programado</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {avisos.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <span className="font-medium">{a.titulo}</span>
                <span className="block text-xs text-muted-foreground">por {a.autor}</span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {alvoTexto(a)}
                {a.emailSolicitado && (
                  <Mail className="ml-1 inline size-3 text-muted-foreground/70" aria-label="Também por e-mail" />
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {a.agendadoPara ? formatarDataHora(new Date(a.agendadoPara)) : "—"}
              </TableCell>
              <TableCell>
                {a.canceladoEm ? (
                  <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                    <Ban className="size-3" /> Cancelado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 font-normal">
                    <Clock className="size-3" /> Aguardando
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {!a.canceladoEm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancelandoId === a.id}
                    onClick={() => void cancelar(a)}
                  >
                    {cancelandoId === a.id ? "Cancelando…" : "Cancelar"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
