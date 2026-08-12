import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { detalheAviso } from "@/modules/notificacoes/avisos/queries";
import { statusAviso } from "@/modules/notificacoes/avisos/agendamento";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { formatarDataHora } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Detalhe do aviso" };

export default async function AvisoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("avisos", "enviar");
  const { id } = await params;
  const aviso = await detalheAviso(id);
  if (!aviso) notFound();

  const confirmados = aviso.destinatarios.filter((d) => d.lidoEm).length;
  const total = aviso.destinatarios.length;
  const status = statusAviso(aviso);

  return (
    <div className="space-y-5">
      <Link
        href="/configuracoes/avisos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Avisos
      </Link>

      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">{aviso.titulo}</h2>
        {aviso.corpo && <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{aviso.corpo}</p>}
        {status === "enviado" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Enviado por {aviso.criadoPor.name} em {formatarDataHora(aviso.enviadoEm ?? aviso.criadoEm)} ·{" "}
            <strong>{confirmados}</strong> de <strong>{total}</strong> confirmaram
            {aviso.exigeConfirmacao ? "" : " · sem confirmação obrigatória"}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Criado por {aviso.criadoPor.name} em {formatarDataHora(aviso.criadoEm)} ·{" "}
            {status === "cancelado"
              ? `envio cancelado em ${formatarDataHora(aviso.canceladoEm!)}`
              : `envio agendado para ${aviso.agendadoPara ? formatarDataHora(aviso.agendadoPara) : "—"}`}
          </p>
        )}
      </div>

      {status !== "enviado" ? (
        /* Sem destinatários ainda: o alvo só é resolvido no disparo. */
        <EmptyState
          icon={Clock}
          title={status === "cancelado" ? "Envio cancelado" : "Ainda não enviado"}
          description={
            status === "cancelado"
              ? "Este aviso foi cancelado antes de disparar, então ninguém o recebeu."
              : "Os destinatários são apurados no momento do envio — a lista aparece aqui depois que o aviso disparar."
          }
        />
      ) : (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Confirmado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aviso.destinatarios.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <span className="font-medium">{d.user.name}</span>
                  <span className="block text-xs text-muted-foreground">{d.user.email}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ROLE_LABELS[d.user.role as Role] ?? d.user.role}
                </TableCell>
                <TableCell>
                  {d.lidoEm ? (
                    <Badge variant="default" className="gap-1 font-normal">
                      <Check className="size-3" /> Lido
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                      <Clock className="size-3" /> Pendente
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.lidoEm ? formatarDataHora(d.lidoEm) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}
