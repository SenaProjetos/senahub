"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSetParams } from "@/lib/use-set-param";
import { brl } from "@/lib/utils";
import { removerItem, excluirComposicao } from "@/modules/custos/composicoes/actions";
import type { ComposicaoDetalhe, BasePrecoItem } from "@/modules/custos/composicoes/queries";
import { AdicionarItemDialog } from "./adicionar-item-dialog";

export function ComposicaoDetalheView({
  composicao,
  bases,
  basePrecoId,
  podeGerir,
}: {
  composicao: ComposicaoDetalhe;
  bases: BasePrecoItem[];
  basePrecoId: string | null;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const setParams = useSetParams();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const propria = composicao.fonte === "propria";

  function removerItemLinha(itemId: string) {
    startTransition(async () => {
      const r = await removerItem({ itemId });
      if (r.ok) {
        toast.success("Item removido.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  async function excluir() {
    const ok = await confirm({
      title: "Excluir composição?",
      description: "Só é possível se ela não estiver sendo usada como auxiliar em outra composição.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await excluirComposicao({ id: composicao.id });
      if (r.ok) {
        toast.success("Composição excluída.");
        router.push("/custos/bancos?tab=composicoes");
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" render={<Link href="/custos/bancos?tab=composicoes" />}>
            <ArrowLeft className="size-4" /> Composições
          </Button>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight">
              <span className="font-mono">{composicao.codigo}</span> — {composicao.descricao}
            </h2>
            <Badge variant="outline" className="uppercase">
              {composicao.fonte}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Unidade: {composicao.unidade}
            {composicao.grupo && <> · Grupo: {composicao.grupo}</>}
          </p>
        </div>
        {podeGerir && propria && (
          <Button variant="outline" onClick={excluir} disabled={pending}>
            <Trash2 className="size-4" /> Excluir
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64 space-y-1.5">
          <label className="text-sm font-medium">Base de preço (UF/regime)</label>
          <Select value={basePrecoId ?? ""} onValueChange={(v) => v && setParams({ base: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a base" />
            </SelectTrigger>
            <SelectContent>
              {bases.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border px-4 py-2">
          <p className="text-xs text-muted-foreground">Custo unitário (calculado a partir dos coeficientes)</p>
          {composicao.erroCalculo ? (
            <p className="text-sm text-destructive">{composicao.erroCalculo}</p>
          ) : composicao.custoUnitario != null ? (
            <p className="text-lg font-bold">{brl(composicao.custoUnitario)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Selecione uma base de preço.</p>
          )}
        </div>
      </div>

      {composicao.semPreco.length > 0 && (
        <p className="text-sm text-warning">
          {composicao.semPreco.length} insumo(s) sem cotação nesta base — custo parcial.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Itens</h3>
          {podeGerir && propria && <AdicionarItemDialog composicaoId={composicao.id} />}
        </div>
        <div className="rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Coeficiente</TableHead>
                {podeGerir && propria && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {composicao.itens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum item.
                  </TableCell>
                </TableRow>
              ) : (
                composicao.itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline">{item.tipo === "insumo" ? "Insumo" : "Composição"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.tipo === "composicao" ? (
                        <Link href={`/custos/composicoes/${item.refId}`} className="hover:underline">
                          {item.codigo}
                        </Link>
                      ) : (
                        item.codigo
                      )}
                    </TableCell>
                    <TableCell>{item.descricao}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.unidade}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{item.coeficiente}</TableCell>
                    {podeGerir && propria && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover item"
                          disabled={pending}
                          onClick={() => removerItemLinha(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
