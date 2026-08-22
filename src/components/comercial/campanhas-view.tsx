"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
import { arquivarCampanha, reativarCampanha } from "@/modules/comercial/actions";
import type { CampanhaItem } from "@/modules/comercial/queries";
import { CampanhaDialog } from "./campanha-dialog";
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
import { brlInteiro, formatarData } from "@/lib/utils";

/**
 * Gestão de campanhas (F4.2) — mesma forma de `ParceirosView`. Vincular uma campanha a um lead
 * acontece no `lead-dialog.tsx` (Select, nunca texto livre); aqui só existe o catálogo e o
 * placar de quantas prospecções/negociações cada campanha já puxou.
 */
export function CampanhasView({
  campanhas,
  canais,
  responsaveis,
}: {
  campanhas: CampanhaItem[];
  canais: { id: string; nome: string }[];
  responsaveis: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<CampanhaItem | null>(null);

  function abrirNovo() {
    setEditando(null);
    setDialogAberto(true);
  }
  function abrirEdicao(c: CampanhaItem) {
    setEditando(c);
    setDialogAberto(true);
  }

  function alternarAtivo(c: CampanhaItem) {
    start(async () => {
      const r = c.ativo ? await arquivarCampanha({ id: c.id }) : await reativarCampanha({ id: c.id });
      if (r.ok) {
        toast.success(c.ativo ? "Campanha arquivada." : "Campanha reativada.");
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
          <h2 className="text-2xl font-extrabold tracking-tight">Campanhas</h2>
          <p className="text-sm text-muted-foreground">
            Marketing/prospecção — vinculada a prospecções e negociações, com meta e período.
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="size-4" /> Nova campanha
        </Button>
      </div>

      {campanhas.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nenhuma campanha cadastrada"
          description="Cadastre para poder vincular a uma prospecção ou negociação."
          action={<Button size="sm" onClick={abrirNovo}>Nova campanha</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="text-right">Prospecções</TableHead>
                <TableHead className="text-right">Negociações</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campanhas.map((c) => (
                <TableRow key={c.id} className={!c.ativo ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.canal?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.periodoInicio ? formatarData(c.periodoInicio) : "—"}
                    {c.periodoFim ? ` – ${formatarData(c.periodoFim)}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.responsavel?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {c.meta != null ? brlInteiro(Number(c.meta)) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{c._count.leads}</TableCell>
                  <TableCell className="text-right font-mono">{c._count.negociacoes}</TableCell>
                  <TableCell>
                    <Badge variant={c.ativo ? "default" : "outline"}>
                      {c.ativo ? "Ativa" : "Arquivada"}
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
                        <DropdownMenuItem onClick={() => abrirEdicao(c)}>
                          <Pencil className="size-3.5" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => alternarAtivo(c)} disabled={pending}>
                          {c.ativo ? (
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

      <CampanhaDialog
        campanha={editando}
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        canais={canais}
        responsaveis={responsaveis}
      />
    </div>
  );
}
