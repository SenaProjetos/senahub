"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
import { arquivarParceiro, reativarParceiro } from "@/modules/comercial/actions";
import type { ParceiroItem } from "@/modules/comercial/queries";
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
              {parceiros.map((p) => (
                <TableRow key={p.id} className={!p.ativo ? "opacity-60" : ""}>
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ParceiroDialog parceiro={editando} open={dialogAberto} onOpenChange={setDialogAberto} />
    </div>
  );
}
