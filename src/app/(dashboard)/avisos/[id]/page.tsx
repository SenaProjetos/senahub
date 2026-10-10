import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { detalheAviso } from "@/modules/notificacoes/avisos/queries";
import { statusAviso } from "@/modules/notificacoes/avisos/agendamento";
import { formatarDataHora } from "@/lib/utils";
import { CorpoAviso } from "@/components/notificacoes/corpo-aviso";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rotuloContratacao } from "@/modules/usuarios/vinculo/labels";

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
      <CabecalhoPagina
        titulo={aviso.titulo}
        trilha={[
          { href: "/", label: "Início" },
          { href: `/avisos?aba=${status === "enviado" ? "enviados" : "agendados"}`, label: "Avisos" },
        ]}
      />

      <div>
        {status === "enviado" ? (
          <p className="text-xs text-muted-foreground">
            Enviado por {aviso.criadoPor.name} em {formatarDataHora(aviso.enviadoEm ?? aviso.criadoEm)} ·{" "}
            <strong>{confirmados}</strong> de <strong>{total}</strong> confirmaram
            {aviso.exigeConfirmacao ? "" : " · sem confirmação obrigatória"}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Criado por {aviso.criadoPor.name} em {formatarDataHora(aviso.criadoEm)} ·{" "}
            {status === "cancelado"
              ? `envio cancelado em ${formatarDataHora(aviso.canceladoEm!)}`
              : `envio agendado para ${aviso.agendadoPara ? formatarDataHora(aviso.agendadoPara) : "—"}`}
          </p>
        )}
        {aviso.corpo && <CorpoAviso corpo={aviso.corpo} className="mt-2 text-muted-foreground" />}
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
                  {rotuloContratacao(d.user.contratacao)}
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
