"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, ShieldCheck } from "lucide-react";
import { aprovarLancamento, rejeitarLancamento, salvarLimiteAprovacao } from "@/modules/financeiro/aprovacao/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Item = {
  id: string;
  descricao: string;
  valor: number;
  categoria: string;
  fornecedor: string | null;
  projeto: string | null;
  autor: string;
  vencimento: string | null;
  criadoEm: string;
};

export function AprovacoesView({
  itens,
  limite,
  podeGerir,
}: {
  itens: Item[];
  limite: number;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novoLimite, setNovoLimite] = useState(limite ? String(limite) : "");

  function salvarLimite() {
    start(async () => {
      const r = await salvarLimiteAprovacao({ limite: Number(novoLimite) || 0 });
      if (r.ok) {
        toast.success("Limite de alçada salvo.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function aprovar(id: string) {
    start(async () => {
      const r = await aprovarLancamento({ id });
      if (r.ok) {
        toast.success("Despesa aprovada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rejeitar(id: string) {
    const motivo = window.prompt("Motivo da rejeição:");
    if (!motivo?.trim()) return;
    start(async () => {
      const r = await rejeitarLancamento({ id, motivo });
      if (r.ok) {
        toast.success("Despesa rejeitada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Aprovações financeiras</h2>
        <p className="text-sm text-muted-foreground">Despesas acima da alçada aguardando liberação.</p>
      </div>

      {podeGerir && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Limite de alçada</CardTitle>
            <CardDescription>
              Despesas com valor ≥ este limite exigem aprovação. Use 0 para desativar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Limite (R$)</Label>
                <Input type="number" step="0.01" min="0" value={novoLimite} onChange={(e) => setNovoLimite(e.target.value)} className="w-44" />
              </div>
              <Button size="sm" variant="outline" onClick={salvarLimite} disabled={pending}>Salvar</Button>
              <span className="pb-2 text-xs text-muted-foreground">
                Atual: {limite > 0 ? brl(limite) : "desativado"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {itens.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <ShieldCheck className="size-4" /> Nenhuma despesa aguardando aprovação.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Descrição</th>
                  <th className="px-4 py-2">Categoria</th>
                  <th className="px-4 py-2">Solicitante</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {itens.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <span className="font-medium">{l.descricao}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.fornecedor ?? "—"}
                        {l.projeto ? ` · ${formatarCodigo(l.projeto)}` : ""}
                        {l.vencimento ? ` · vence ${new Date(l.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{l.categoria}</td>
                    <td className="px-4 py-2 text-muted-foreground">{l.autor}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">{brl(l.valor)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" className="text-success" onClick={() => aprovar(l.id)} disabled={pending}>
                        <Check className="size-3.5" /> Aprovar
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => rejeitar(l.id)} disabled={pending}>
                        <X className="size-3.5" /> Rejeitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
