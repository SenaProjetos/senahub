"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Plus, Save, Trash2 } from "lucide-react";
import { salvarComposicaoPreco } from "@/modules/projetos/receita/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

type Item = { id: string; descricao: string; quantidade: number; valorUnitario: number };
type Composicao = { observacao: string | null; itens: Item[] };

/**
 * Conteúdo comparável da lista, sem o `id`: item novo nasce com id do navegador e volta do
 * banco com outro depois de salvar — comparar com id deixaria o "Salvar" sempre ativo.
 */
function conteudo(itens: Item[]): string {
  return JSON.stringify(itens.map(({ descricao, quantidade, valorUnitario }) => [descricao.trim(), quantidade, valorUnitario]));
}

/**
 * Composição de preço do projeto — memória de cálculo do valor. Veio da antiga aba Extras para
 * a aba Financeiro (2026-09-29), que só abre com `financeiro:ver`: lá ela ficava visível a
 * qualquer um que abrisse o projeto. Quando tem itens, o total vira a referência de receita do
 * card "Receita / Contrato" (P-23).
 */
export function ComposicaoPrecoCard({
  projetoId,
  composicao,
  podeGerir,
}: {
  projetoId: string;
  composicao: Composicao;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [itens, setItens] = useState<Item[]>(composicao.itens);
  const [observacao, setObservacao] = useState(composicao.observacao ?? "");

  const total = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  const alterado = observacao !== (composicao.observacao ?? "") || conteudo(itens) !== conteudo(composicao.itens);

  function mudar(idx: number, campo: Partial<Item>) {
    setItens((atual) => atual.map((it, i) => (i === idx ? { ...it, ...campo } : it)));
  }

  function salvar() {
    start(async () => {
      const r = await salvarComposicaoPreco({
        projetoId,
        observacao,
        itens: itens
          .filter((i) => i.descricao.trim())
          .map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valorUnitario: i.valorUnitario })),
      });
      if (r.ok) {
        toast.success("Composição salva.");
        // Linha sem descrição não vai para o banco; tirar daqui também, senão a tela diverge.
        setItens((atual) => atual.filter((i) => i.descricao.trim()));
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="size-4" /> Composição de preço
        </CardTitle>
        <CardDescription>
          Memória de cálculo do valor do projeto. Com itens, o total é a referência de receita acima, no lugar do
          valor de contrato. Total: <span className="font-mono font-semibold text-foreground">{brl(total)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {itens.length === 0 ? (
          <EmptyState icon={Calculator} title="Sem composição de preço" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-120 text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Descrição</th>
                  <th className="w-20 py-1 font-medium">Qtd</th>
                  <th className="w-32 py-1 font-medium">Valor unit. (R$)</th>
                  <th className="w-28 py-1 text-right font-medium">Total</th>
                  {podeGerir && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {itens.map((it, idx) =>
                  podeGerir ? (
                    <tr key={it.id}>
                      <td className="py-1 pr-2">
                        <Input
                          value={it.descricao}
                          aria-label="Descrição do item"
                          onChange={(e) => mudar(idx, { descricao: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.quantidade}
                          aria-label="Quantidade"
                          onChange={(e) => mudar(idx, { quantidade: Number(e.target.value) || 0 })}
                          className="h-8"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <InputMoeda
                          semPrefixo
                          value={it.valorUnitario}
                          aria-label="Valor unitário"
                          onChange={(v) => mudar(idx, { valorUnitario: v ?? 0 })}
                          className="h-8"
                        />
                      </td>
                      <td className="py-1 text-right font-mono text-xs">{brl(it.quantidade * it.valorUnitario)}</td>
                      <td className="py-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remover item"
                          onClick={() => setItens((atual) => atual.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={it.id} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-2">{it.descricao}</td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{it.quantidade.toLocaleString("pt-BR")}</td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{brl(it.valorUnitario)}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{brl(it.quantidade * it.valorUnitario)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {!podeGerir && composicao.observacao && (
          <p className="text-xs text-muted-foreground">Observação: {composicao.observacao}</p>
        )}

        {podeGerir && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setItens((atual) => [...atual, { id: crypto.randomUUID(), descricao: "", quantidade: 1, valorUnitario: 0 }])
              }
            >
              <Plus className="size-3.5" /> Item
            </Button>
            <Input
              placeholder="Observação"
              aria-label="Observação da composição"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="min-w-40 flex-1"
            />
            <Button size="sm" variant="outline" onClick={salvar} disabled={pending || !alterado}>
              <Save className="size-3.5" /> Salvar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
