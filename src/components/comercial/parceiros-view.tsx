"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Plus, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
import { arquivarParceiro, leadsDoParceiroAction, reativarParceiro } from "@/modules/comercial/actions";
import type { LeadDoParceiro, ParceiroItem } from "@/modules/comercial/queries";
import { STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/prospeccao";
import { brl, formatarData } from "@/lib/utils";
import { ParceiroDialog } from "./parceiro-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

export function ParceirosView({ parceiros }: { parceiros: ParceiroItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<ParceiroItem | null>(null);
  // Só uma linha expandida por vez (F7.11); cache por parceiro pra não rebuscar ao fechar/reabrir.
  const [expandido, setExpandido] = useState<string | null>(null);
  const [leadsPorParceiro, setLeadsPorParceiro] = useState<Record<string, LeadDoParceiro[]>>({});
  const [carregando, setCarregando] = useState<string | null>(null);

  function alternarExpansao(id: string) {
    if (expandido === id) {
      setExpandido(null);
      return;
    }
    setExpandido(id);
    if (leadsPorParceiro[id]) return;
    setCarregando(id);
    leadsDoParceiroAction(id).then((leads) => {
      setLeadsPorParceiro((m) => ({ ...m, [id]: leads }));
      setCarregando(null);
    });
  }

  function abrirNovo() {
    setEditando(null);
    setDialogAberto(true);
  }
  function abrirEdicao(p: ParceiroItem) {
    setEditando(p);
    setDialogAberto(true);
  }

  function alternarAtivo(p: ParceiroItem) {
    start(async () => {
      const r = p.ativo ? await arquivarParceiro({ id: p.id }) : await reativarParceiro({ id: p.id });
      if (r.ok) {
        toast.success(p.ativo ? "Parceiro arquivado." : "Parceiro reativado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/comercial" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight">Parceiros</h2>
          <p className="text-sm text-muted-foreground">
            Quem indica negócio — escolhido por lista no lead, nunca digitado (ADR-19).
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="size-4" /> Novo parceiro
        </Button>
      </div>

      {parceiros.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nenhum parceiro cadastrado"
          description="Cadastre para poder vincular a um lead."
          action={<Button size="sm" onClick={abrirNovo}>Novo parceiro</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parceiros.map((p) => {
                const aberto = expandido === p.id;
                const temLeads = p._count.leads > 0;
                return (
                  <Fragment key={p.id}>
                    <TableRow className={!p.ativo ? "opacity-60" : ""}>
                      <TableCell>
                        {temLeads && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            aria-label={aberto ? `Recolher leads de ${p.nome}` : `Expandir leads de ${p.nome}`}
                            aria-expanded={aberto}
                            onClick={() => alternarExpansao(p.id)}
                          >
                            <ChevronRight className={`size-3.5 transition-transform ${aberto ? "rotate-90" : ""}`} />
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>{p.tipo}</TableCell>
                      <TableCell className="font-mono text-xs">{p.documento ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.email || p.telefone || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{p._count.leads}</TableCell>
                      <TableCell>
                        <Badge variant={p.ativo ? "default" : "outline"}>
                          {p.ativo ? "Ativo" : "Arquivado"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button size="icon" variant="ghost" aria-label="Ações">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => abrirEdicao(p)}>
                              <Pencil className="size-3.5" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => alternarAtivo(p)} disabled={pending}>
                              {p.ativo ? (
                                <>
                                  <PowerOff className="size-3.5" /> Arquivar
                                </>
                              ) : (
                                <>
                                  <Power className="size-3.5" /> Reativar
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {aberto && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={6} className="bg-muted/30 py-3">
                          <LeadsDoParceiro leads={leadsPorParceiro[p.id]} carregando={carregando === p.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ParceiroDialog parceiro={editando} open={dialogAberto} onOpenChange={setDialogAberto} />
    </div>
  );
}

function LeadsDoParceiro({ leads, carregando }: { leads: LeadDoParceiro[] | undefined; carregando: boolean }) {
  if (carregando) return <p className="text-xs text-muted-foreground">Carregando…</p>;
  if (!leads || leads.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum lead indicado.</p>;
  }
  return (
    <ul className="space-y-1">
      {leads.map((l) => (
        <li key={l.id}>
          <Link
            href={`/comercial/funil?card=LEAD:${l.id}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm px-1.5 py-1 text-sm hover:bg-background"
          >
            <span className="font-medium">{l.cliente?.nome ?? l.nome}</span>
            <span className="text-xs text-muted-foreground">{l.nome}</span>
            <Badge variant="outline" className="text-[10px]">
              {STATUS_PROSPECCAO_LABEL[l.status]}
            </Badge>
            {l.valorEstimado != null && <span className="font-mono text-xs">{brl(l.valorEstimado)}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{formatarData(l.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
