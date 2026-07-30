"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  FolderPlus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Lock,
  LockOpen,
  Link2,
  ListTree,
  MoreHorizontal,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/utils";
import { moverItem, excluirItem, alternarTrava } from "@/modules/custos/orcamento/actions";
import type { ArvoreOrcamento, ItemArvore } from "@/modules/custos/orcamento/queries";
import { ItemDialog, type AlvoItem } from "./item-dialog";
import { VincularComposicaoDialog } from "./vincular-composicao-dialog";
import { VerNoModeloDialog } from "../quantitativos/ver-no-modelo-dialog";

export function OrcamentoArvoreView({
  orcamentoId,
  arvore,
  podeGerir,
  temBasePreco,
  vinculosPorItem = {},
}: {
  orcamentoId: string;
  arvore: ArvoreOrcamento;
  podeGerir: boolean;
  temBasePreco: boolean;
  vinculosPorItem?: Record<string, number>;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const [alvo, setAlvo] = useState<AlvoItem | null>(null);
  const [itemDialogAberto, setItemDialogAberto] = useState(false);
  const [vinculoAlvo, setVinculoAlvo] = useState<ItemArvore | null>(null);
  const [verNoModeloAlvo, setVerNoModeloAlvo] = useState<ItemArvore | null>(null);

  function abrirCriar(tipo: "grupo" | "servico", pai: ItemArvore | null) {
    setAlvo({ modo: "criar", tipo, parentId: pai?.id ?? null, parentDescricao: pai?.descricao ?? null });
    setItemDialogAberto(true);
  }

  function abrirEditar(item: ItemArvore) {
    setAlvo({ modo: "editar", item });
    setItemDialogAberto(true);
  }

  function mover(item: ItemArvore, direcao: "cima" | "baixo") {
    startTransition(async () => {
      const r = await moverItem({ id: item.id, direcao });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function excluir(item: ItemArvore) {
    const temFilhos = arvore.itens.some((i) => i.parentId === item.id);
    const ok = await confirm({
      title: `Excluir "${item.descricao}"?`,
      description: temFilhos
        ? "Este item tem filhos — a subárvore inteira será excluída."
        : "O item será removido do orçamento.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await excluirItem({ id: item.id });
      if (r.ok) {
        toast.success("Item excluído.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function alternarTravaItem(item: ItemArvore) {
    startTransition(async () => {
      const r = await alternarTrava({ id: item.id, bloqueado: !item.bloqueado });
      if (r.ok) {
        toast.success(item.bloqueado ? "Item destravado." : "Item travado — imune a recálculo.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  if (arvore.erro) {
    return <p className="text-sm text-destructive">Erro na árvore do orçamento: {arvore.erro}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Planilha orçamentária</h3>
          <p className="text-xs text-muted-foreground">
            {arvore.itens.length} item(ns) · total com BDI <strong>{brl(arvore.totalComBdi)}</strong>
          </p>
        </div>
        {podeGerir && (
          <Button size="sm" onClick={() => abrirCriar("grupo", null)}>
            <FolderPlus className="size-4" /> Novo grupo
          </Button>
        )}
      </div>

      {!temBasePreco && podeGerir && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Escolha a base de preço na aba <strong>Cabeçalho</strong> para poder vincular composições.
        </p>
      )}

      {arvore.itens.length === 0 ? (
        <EmptyState
          icon={ListTree}
          title="Orçamento sem itens."
          description={podeGerir ? 'Comece criando um grupo com "Novo grupo".' : undefined}
        />
      ) : (
        <div className="rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-16">Un.</TableHead>
                <TableHead className="w-24 text-right">Qtd.</TableHead>
                <TableHead className="w-28 text-right">Custo unit.</TableHead>
                <TableHead className="w-20 text-right">BDI</TableHead>
                <TableHead className="w-32 text-right">Total c/ BDI</TableHead>
                {podeGerir && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {arvore.itens.map((item) => {
                const ehGrupo = item.tipo === "grupo";
                return (
                  <TableRow key={item.id} className={ehGrupo ? "bg-muted/40 font-medium" : ""}>
                    <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                    <TableCell>
                      <span style={{ paddingLeft: `${item.nivel * 1.25}rem` }} className="inline-flex items-center gap-1.5">
                        {item.descricao}
                        {item.bloqueado && <Lock className="size-3 text-muted-foreground" aria-label="Travado" />}
                        {item.composicaoCodigo && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {item.composicaoCodigo}
                          </Badge>
                        )}
                        {!ehGrupo && (vinculosPorItem[item.id] ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setVerNoModeloAlvo(item)}
                            className="inline-flex items-center gap-1 rounded-sm border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
                            title="Ver elementos vinculados no modelo 3D"
                          >
                            <Box className="size-3" /> {vinculosPorItem[item.id]} no modelo
                          </button>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.unidade ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {ehGrupo ? "—" : item.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {ehGrupo ? "—" : brl(item.custoUnitario)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {item.bdiEfetivo.toFixed(2)}%
                      {item.bdiPercentual !== null && <span className="ml-0.5 text-[10px]">*</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(item.totalComBdi)}</TableCell>
                    {podeGerir && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" aria-label={`Ações de ${item.descricao}`} disabled={pending}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            {ehGrupo && (
                              <>
                                <DropdownMenuItem onClick={() => abrirCriar("grupo", item)}>
                                  <FolderPlus className="size-4" /> Subgrupo aqui
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => abrirCriar("servico", item)}>
                                  <Plus className="size-4" /> Serviço aqui
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem onClick={() => abrirEditar(item)}>
                              <Pencil className="size-4" /> Editar
                            </DropdownMenuItem>
                            {!ehGrupo && (
                              <DropdownMenuItem onClick={() => setVinculoAlvo(item)} disabled={!temBasePreco}>
                                <Link2 className="size-4" /> Vincular composição
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => mover(item, "cima")}>
                              <ChevronUp className="size-4" /> Mover para cima
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => mover(item, "baixo")}>
                              <ChevronDown className="size-4" /> Mover para baixo
                            </DropdownMenuItem>
                            {!ehGrupo && (
                              <DropdownMenuItem onClick={() => alternarTravaItem(item)}>
                                {item.bloqueado ? (
                                  <>
                                    <LockOpen className="size-4" /> Destravar preço
                                  </>
                                ) : (
                                  <>
                                    <Lock className="size-4" /> Travar preço
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => excluir(item)}>
                              <Trash2 className="size-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              <TableRow className="border-t-2 font-bold">
                <TableCell colSpan={6} className="text-right">
                  Total sem BDI
                </TableCell>
                <TableCell className="text-right font-mono">{brl(arvore.totalSemBdi)}</TableCell>
                {podeGerir && <TableCell />}
              </TableRow>
              <TableRow className="font-bold">
                <TableCell colSpan={6} className="text-right">
                  Total com BDI
                </TableCell>
                <TableCell className="text-right font-mono">{brl(arvore.totalComBdi)}</TableCell>
                {podeGerir && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {arvore.resumoGrupos.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Participação por grupo</h4>
          <div className="rounded-sm border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Código</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Total c/ BDI</TableHead>
                  <TableHead className="w-24 text-right">Participação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arvore.resumoGrupos.map((g) => (
                  <TableRow key={g.codigo}>
                    <TableCell className="font-mono text-xs">{g.codigo}</TableCell>
                    <TableCell className="text-sm">{g.descricao}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(g.totalComBdi)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{g.participacaoPct.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">* BDI definido no próprio item/grupo (não herdado).</p>

      <ItemDialog
        orcamentoId={orcamentoId}
        alvo={alvo}
        open={itemDialogAberto}
        onOpenChange={setItemDialogAberto}
      />
      <VincularComposicaoDialog
        itemId={vinculoAlvo?.id ?? null}
        itemDescricao={vinculoAlvo?.descricao ?? ""}
        open={vinculoAlvo !== null}
        onOpenChange={(v) => !v && setVinculoAlvo(null)}
      />
      <VerNoModeloDialog
        itemId={verNoModeloAlvo?.id ?? null}
        itemDescricao={verNoModeloAlvo?.descricao ?? ""}
        open={verNoModeloAlvo !== null}
        onOpenChange={(v) => !v && setVerNoModeloAlvo(null)}
      />
    </div>
  );
}
