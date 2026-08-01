"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buscarComposicoesParaVinculo,
  buscarInsumosParaVinculo,
  criarItem,
  vincularComposicao,
  vincularInsumo,
} from "@/modules/custos/orcamento/actions";

type Opcao = { id: string; codigo: string; descricao: string; unidade: string; basePrecoNome?: string; categoria?: string };

type Fonte = "composicao" | "insumo";

type Props = {
  fonte: Fonte;
  open: boolean;
  onOpenChange: (v: boolean) => void;
} & (
  | { modo: "criar"; orcamentoId: string; parentId: string | null; parentDescricao: string | null }
  | { modo: "vincular"; itemId: string; itemDescricao: string }
);

const ROTULO: Record<Fonte, { titulo: string; buscaLabel: string; placeholder: string }> = {
  composicao: {
    titulo: "composição",
    buscaLabel: "Buscar por código ou descrição (todos os bancos)",
    placeholder: "Ex.: 88316 ou alvenaria",
  },
  insumo: {
    titulo: "insumo",
    buscaLabel: "Buscar por código ou descrição",
    placeholder: "Ex.: cimento CP-II",
  },
};

/**
 * Busca composição OU insumo (parametrizado por `fonte`) e ou cria um serviço novo já vinculado
 * (`modo: "criar"`) ou re-vincula um serviço existente (`modo: "vincular"`) — um componente só, pra
 * não duplicar o layout de busca por fonte nem por modo.
 */
export function BuscaBancoDialog(props: Props) {
  const { fonte, open, onOpenChange } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [escolhida, setEscolhida] = useState<Opcao | null>(null);
  const [descricao, setDescricao] = useState("");
  const [buscando, setBuscando] = useState(false);

  const rotulo = ROTULO[fonte];

  function fechar() {
    onOpenChange(false);
    setBusca("");
    setOpcoes([]);
    setEscolhida(null);
    setDescricao("");
  }

  async function buscar() {
    setBuscando(true);
    try {
      const r = fonte === "composicao" ? await buscarComposicoesParaVinculo({ q: busca }) : await buscarInsumosParaVinculo({ q: busca });
      if (r.ok) setOpcoes(r.data);
      else toast.error(r.error);
    } finally {
      setBuscando(false);
    }
  }

  function escolher(o: Opcao) {
    setEscolhida(o);
    setDescricao(o.descricao);
  }

  function confirmar() {
    if (!escolhida) return;
    startTransition(async () => {
      if (props.modo === "criar") {
        const r = await criarItem({
          orcamentoId: props.orcamentoId,
          parentId: props.parentId,
          tipo: "servico",
          descricao: descricao.trim() || escolhida.descricao,
          composicaoId: fonte === "composicao" ? escolhida.id : undefined,
          insumoId: fonte === "insumo" ? escolhida.id : undefined,
        });
        if (r.ok) {
          const semPreco = r.data.semPreco.length;
          toast.success(semPreco > 0 ? `Serviço criado — sem cotação nesta base (custo parcial).` : "Serviço criado.");
          fechar();
          router.refresh();
        } else {
          toast.error(r.error);
        }
      } else {
        const r =
          fonte === "composicao"
            ? await vincularComposicao({ itemId: props.itemId, composicaoId: escolhida.id })
            : await vincularInsumo({ itemId: props.itemId, insumoId: escolhida.id });
        if (r.ok) {
          const semPreco = r.data.semPreco.length;
          toast.success(semPreco > 0 ? `Vinculado — sem cotação nesta base (custo parcial).` : "Vinculado e custo calculado.");
          fechar();
          router.refresh();
        } else {
          toast.error(r.error);
        }
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {props.modo === "criar" ? `Novo serviço — ${rotulo.titulo}` : `Vincular ${rotulo.titulo}`}
          </DialogTitle>
          <DialogDescription>
            {props.modo === "criar"
              ? props.parentDescricao
                ? `Dentro de: ${props.parentDescricao}`
                : "Busque e escolha uma opção do banco — o custo é calculado automaticamente."
              : `O custo unitário de "${props.itemDescricao}" passa a vir daqui, calculado na base de preço do orçamento.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="busca-banco">{rotulo.buscaLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="busca-banco"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder={rotulo.placeholder}
                autoFocus
              />
              <Button variant="outline" size="icon" onClick={buscar} aria-label="Buscar" disabled={buscando}>
                <Search className="size-4" />
              </Button>
            </div>
          </div>

          {opcoes.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => escolher(o)}
                  className={`block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted ${
                    escolhida?.id === o.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="font-mono">{o.codigo}</span> — {o.descricao}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({o.unidade}){o.basePrecoNome ? ` · ${o.basePrecoNome}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          {escolhida && (
            <div className="space-y-1.5 border-t pt-3">
              <Label htmlFor="descricao-item">Descrição do item (editável)</Label>
              <Input id="descricao-item" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !escolhida}>
            {props.modo === "criar" ? <Plus className="size-4" /> : <Link2 className="size-4" />}
            {pending ? "Salvando…" : props.modo === "criar" ? "Criar" : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
