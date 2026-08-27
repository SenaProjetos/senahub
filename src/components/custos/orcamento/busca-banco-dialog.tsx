"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { criarComposicao, criarInsumo } from "@/modules/custos/composicoes/actions";

type Opcao = { id: string; codigo: string; descricao: string; unidade: string; basePrecoNome?: string; categoria?: string };

type Fonte = "composicao" | "insumo";

type Props = {
  fonte: Fonte;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Habilita o "criar novo" inline — exige `custos:bancos`, diferente do `custos:gerir` da árvore. */
  podeGerirBancos?: boolean;
  /** Base de preço ativa do orçamento — usada só pra já precificar um insumo próprio recém-criado. */
  basePrecoId?: string | null;
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

const CATEGORIA_LABEL: Record<string, string> = {
  servicos: "Serviços",
  material: "Material",
  mao_de_obra: "Mão de obra",
  encargos_complementares: "Encargos complementares",
  equipamento: "Equipamento",
  especiais: "Especiais",
};

const NOVO_COMPOSICAO = { codigo: "", descricao: "", unidade: "", grupo: "" };
const NOVO_INSUMO = { codigo: "", descricao: "", unidade: "", categoria: "material", preco: null as number | null };

/**
 * Busca composição OU insumo (parametrizado por `fonte`) e ou cria um serviço novo já vinculado
 * (`modo: "criar"`) ou re-vincula um serviço existente (`modo: "vincular"`) — um componente só, pra
 * não duplicar o layout de busca por fonte nem por modo. Busca é em tempo real (debounce); "não
 * encontrou" oferece cadastrar um insumo/composição própria sem sair do diálogo.
 */
export function BuscaBancoDialog(props: Props) {
  const { fonte, open, onOpenChange, podeGerirBancos = false, basePrecoId = null } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [escolhida, setEscolhida] = useState<Opcao | null>(null);
  const [descricao, setDescricao] = useState("");
  const [buscando, setBuscando] = useState(false);
  const buscaSeq = useRef(0);

  const [criandoNovo, setCriandoNovo] = useState(false);
  const [novaComposicao, setNovaComposicao] = useState(NOVO_COMPOSICAO);
  const [novoInsumo, setNovoInsumo] = useState(NOVO_INSUMO);

  const rotulo = ROTULO[fonte];

  function fechar() {
    onOpenChange(false);
    setBusca("");
    setOpcoes([]);
    setEscolhida(null);
    setDescricao("");
    setCriandoNovo(false);
    setNovaComposicao(NOVO_COMPOSICAO);
    setNovoInsumo(NOVO_INSUMO);
  }

  async function buscar(termo: string) {
    const seq = ++buscaSeq.current;
    setBuscando(true);
    try {
      const r = fonte === "composicao" ? await buscarComposicoesParaVinculo({ q: termo }) : await buscarInsumosParaVinculo({ q: termo });
      if (seq !== buscaSeq.current) return; // resposta de uma busca já superada — ignora
      if (r.ok) setOpcoes(r.data);
      else toast.error(r.error);
    } finally {
      if (seq === buscaSeq.current) setBuscando(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => buscar(busca), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, open]);

  function escolher(o: Opcao) {
    setEscolhida(o);
    setDescricao(o.descricao);
    setCriandoNovo(false);
  }

  function criarNovoComposicao() {
    if (!novaComposicao.codigo.trim() || !novaComposicao.descricao.trim() || !novaComposicao.unidade.trim()) {
      toast.error("Código, descrição e unidade são obrigatórios.");
      return;
    }
    startTransition(async () => {
      const r = await criarComposicao({
        codigo: novaComposicao.codigo.trim(),
        descricao: novaComposicao.descricao.trim(),
        unidade: novaComposicao.unidade.trim(),
        grupo: novaComposicao.grupo.trim(),
      });
      if (r.ok) {
        toast.success("Composição própria criada — nasce sem itens, complete em /custos/bancos.");
        escolher({ id: r.data.id, codigo: r.data.codigo, descricao: r.data.descricao, unidade: r.data.unidade, basePrecoNome: "Própria" });
      } else {
        toast.error(r.error);
      }
    });
  }

  function criarNovoInsumo() {
    if (!novoInsumo.codigo.trim() || !novoInsumo.descricao.trim() || !novoInsumo.unidade.trim()) {
      toast.error("Código, descrição e unidade são obrigatórios.");
      return;
    }
    const preco = novoInsumo.preco ?? undefined;
    if (preco !== undefined && preco <= 0) {
      toast.error("Preço inválido.");
      return;
    }
    startTransition(async () => {
      const r = await criarInsumo({
        codigo: novoInsumo.codigo.trim(),
        descricao: novoInsumo.descricao.trim(),
        unidade: novoInsumo.unidade.trim(),
        categoria: novoInsumo.categoria as never,
        basePrecoId: basePrecoId ?? undefined,
        preco,
      });
      if (r.ok) {
        toast.success(preco !== undefined ? "Insumo próprio criado e precificado nesta base." : "Insumo próprio criado — sem cotação ainda.");
        escolher({ id: r.data.id, codigo: r.data.codigo, descricao: r.data.descricao, unidade: r.data.unidade, basePrecoNome: "Própria" });
      } else {
        toast.error(r.error);
      }
    });
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
                onKeyDown={(e) => e.key === "Enter" && buscar(busca)}
                placeholder={rotulo.placeholder}
                autoFocus
              />
              <Button variant="outline" size="icon" onClick={() => buscar(busca)} aria-label="Buscar" disabled={buscando}>
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

          {!buscando && busca.trim().length > 0 && opcoes.length === 0 && podeGerirBancos && !criandoNovo && (
            <button
              type="button"
              onClick={() => setCriandoNovo(true)}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Não encontrou? Criar {rotulo.titulo} própria
            </button>
          )}

          {criandoNovo && fonte === "composicao" && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Cria a composição própria (nasce sem itens — adicione depois em /custos/bancos).
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Código"
                  value={novaComposicao.codigo}
                  onChange={(e) => setNovaComposicao((f) => ({ ...f, codigo: e.target.value }))}
                />
                <Input
                  placeholder="Unidade"
                  value={novaComposicao.unidade}
                  onChange={(e) => setNovaComposicao((f) => ({ ...f, unidade: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Descrição"
                value={novaComposicao.descricao}
                onChange={(e) => setNovaComposicao((f) => ({ ...f, descricao: e.target.value }))}
              />
              <Input
                placeholder="Grupo (opcional)"
                value={novaComposicao.grupo}
                onChange={(e) => setNovaComposicao((f) => ({ ...f, grupo: e.target.value }))}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCriandoNovo(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={criarNovoComposicao} disabled={pending}>
                  {pending ? "Criando…" : "Criar composição"}
                </Button>
              </div>
            </div>
          )}

          {criandoNovo && fonte === "insumo" && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Código"
                  value={novoInsumo.codigo}
                  onChange={(e) => setNovoInsumo((f) => ({ ...f, codigo: e.target.value }))}
                />
                <Input
                  placeholder="Unidade"
                  value={novoInsumo.unidade}
                  onChange={(e) => setNovoInsumo((f) => ({ ...f, unidade: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Descrição"
                value={novoInsumo.descricao}
                onChange={(e) => setNovoInsumo((f) => ({ ...f, descricao: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Select value={novoInsumo.categoria} onValueChange={(v) => v && setNovoInsumo((f) => ({ ...f, categoria: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIA_LABEL).map(([valor, label]) => (
                      <SelectItem key={valor} value={valor}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {basePrecoId && (
                  <InputMoeda
                    placeholder="Preço nesta base (opcional)"
                    value={novoInsumo.preco}
                    onChange={(v) => setNovoInsumo((f) => ({ ...f, preco: v }))}
                  />
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCriandoNovo(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={criarNovoInsumo} disabled={pending}>
                  {pending ? "Criando…" : "Criar insumo"}
                </Button>
              </div>
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
