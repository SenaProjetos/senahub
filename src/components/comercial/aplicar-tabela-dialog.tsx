"use client";

import { useEffect, useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/utils";
import {
  preencherItensDaTabela,
  valorPorArea,
  type ItemProposta,
  type LinhaTabelaPreco,
} from "@/modules/comercial/honorarios";

export type TabelaPrecoParaEditor = { id: string; nome: string; itens: LinhaTabelaPreco[] };

/**
 * Pré-preenchimento da proposta a partir de uma tabela de preço (F1.22).
 *
 * Substitui o botão "Aplicar (R$/m² × área)", que só reprecificava itens JÁ digitados — quem
 * montava uma proposta ainda tinha de adicionar cada disciplina à mão antes de ver qualquer
 * preço. Aqui as disciplinas vêm da própria tabela e o valor de cada uma aparece ANTES de
 * confirmar, com o total, porque este é o número que vai para o cliente.
 *
 * Só mexe no estado local do editor: nada é gravado até o "Salvar proposta".
 */
export function AplicarTabelaDialog({
  tabelas,
  itens,
  areaM2,
  onAplicar,
}: {
  tabelas: TabelaPrecoParaEditor[];
  itens: ItemProposta[];
  areaM2: number;
  onAplicar: (itens: ItemProposta[], resumo: { adicionados: number; reprecificados: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tabelaId, setTabelaId] = useState(tabelas[0]?.id ?? "");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const tabela = tabelas.find((t) => t.id === tabelaId);
  const areaValida = areaM2 > 0;
  const jaNaProposta = useMemo(() => new Set(itens.map((i) => i.disciplina)), [itens]);

  // Abrir já marca o que a proposta tem: reaplicar depois de mudar a área é um clique só.
  useEffect(() => {
    if (!open || !tabela) return;
    setMarcadas(new Set(tabela.itens.filter((l) => jaNaProposta.has(l.disciplina)).map((l) => l.disciplina)));
  }, [open, tabela, jaNaProposta]);

  function alternar(disciplina: string) {
    setMarcadas((s) => {
      const novo = new Set(s);
      if (novo.has(disciplina)) novo.delete(disciplina);
      else novo.add(disciplina);
      return novo;
    });
  }

  function aplicar() {
    if (!tabela) return;
    const r = preencherItensDaTabela({
      itens,
      linhas: tabela.itens,
      areaM2,
      selecionadas: [...marcadas],
    });
    onAplicar(r.itens, { adicionados: r.adicionados, reprecificados: r.reprecificados });
    setOpen(false);
  }

  const totalMarcado = tabela
    ? tabela.itens
        .filter((l) => marcadas.has(l.disciplina))
        .reduce((s, l) => s + valorPorArea(l.valorM2, areaM2), 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={tabelas.length === 0}>
        <Wand2 className="size-3.5" /> Preencher pela tabela
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preencher pela tabela de preço</DialogTitle>
          <DialogDescription>
            Cada disciplina marcada vira um item com valor R$/m² × área. As disciplinas não
            marcadas ficam como estão — nada é removido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Select value={tabelaId} onValueChange={(v) => setTabelaId(v ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tabela de preço" />
            </SelectTrigger>
            <SelectContent>
              {tabelas.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!areaValida ? (
            <p className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">
              Informe a área (m²) da proposta para calcular os valores.
            </p>
          ) : !tabela || tabela.itens.length === 0 ? (
            <p className="rounded-sm border border-dashed p-3 text-sm text-muted-foreground">
              Esta tabela não tem disciplinas cadastradas.
            </p>
          ) : (
            <>
              <div className="max-h-72 overflow-y-auto rounded-sm border">
                {tabela.itens.map((l) => (
                  <label
                    key={l.disciplina}
                    className="flex items-center gap-2 border-b p-2 text-sm last:border-b-0"
                  >
                    <Checkbox
                      checked={marcadas.has(l.disciplina)}
                      onCheckedChange={() => alternar(l.disciplina)}
                    />
                    <span className="min-w-0 flex-1">
                      {l.disciplina}
                      {jaNaProposta.has(l.disciplina) && (
                        <span className="ml-1 text-xs text-muted-foreground">(já na proposta)</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {brl(l.valorM2)}/m² × {areaM2} m²
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-sm">
                      {brl(valorPorArea(l.valorM2, areaM2))}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-right text-sm">
                Total marcado: <span className="font-mono font-bold">{brl(totalMarcado)}</span>
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={!areaValida || marcadas.size === 0}>
            Preencher ({marcadas.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
