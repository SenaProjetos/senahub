"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import { categoriasDistintas, pavimentosDistintos, type ElementoIndex } from "@/modules/coordenacao/indice-elementos";
import {
  extrairQuantidades,
  escolherQuantidade,
  normalizarQuantidades,
  type CustoGrandeza,
} from "@/modules/custos/quantitativos/quantidades-ifc";
import { agregarPorCategoria } from "@/modules/custos/quantitativos/agregacao";
import { registrarQuantitativo } from "@/modules/custos/quantitativos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Viewer3D = dynamic(() => import("@/components/coordenacao/viewer-3d"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

export type ModeloOpcao = { uploadId: string; nomeArquivo: string; disciplinaNome: string };

const TODOS_PAVIMENTOS = "__todos__";
const SEM_PAVIMENTO = "__sem__";

const GRANDEZA_LABEL: Record<CustoGrandeza, string> = {
  area: "Área",
  volume: "Volume",
  comprimento: "Comprimento",
  contagem: "Contagem",
  peso: "Peso",
};

/** metros por 1 unidade escolhida — mesmo princípio de `realinhamento.ts#fatorMetros`. */
const FATOR_COMPRIMENTO: { valor: number; label: string; unidade: { area: string; volume: string; comprimento: string } }[] = [
  { valor: 1, label: "Metros (m)", unidade: { area: "m²", volume: "m³", comprimento: "m" } },
  { valor: 0.01, label: "Centímetros (cm)", unidade: { area: "m²", volume: "m³", comprimento: "m" } },
  { valor: 0.001, label: "Milímetros (mm)", unidade: { area: "m²", volume: "m³", comprimento: "m" } },
];

export function LevantarIfcDialog({
  orcamentoId,
  modelos,
  open,
  onOpenChange,
}: {
  orcamentoId: string;
  modelos: ModeloOpcao[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [modeloId, setModeloId] = useState<string>("");
  const [engine, setEngine] = useState<ViewerEngine | null>(null);
  const [carregandoIndice, setCarregandoIndice] = useState(false);
  const [elementos, setElementos] = useState<ElementoIndex[]>([]);

  const [categoria, setCategoria] = useState<string>("");
  const [pavimento, setPavimento] = useState<string>(TODOS_PAVIMENTOS);
  const [grandeza, setGrandeza] = useState<CustoGrandeza>("area");
  const [fatorIdx, setFatorIdx] = useState(0);

  const [calculando, setCalculando] = useState(false);
  const [amostra, setAmostra] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ soma: number; comQtd: number; semQtd: number; total: number } | null>(null);
  const [guidsFiltrados, setGuidsFiltrados] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");

  const categorias = useMemo(() => categoriasDistintas(elementos), [elementos]);
  const pavimentos = useMemo(() => pavimentosDistintos(elementos), [elementos]);
  const fator = FATOR_COMPRIMENTO[fatorIdx];
  const unidade = grandeza === "area" || grandeza === "volume" || grandeza === "comprimento" ? fator.unidade[grandeza] : grandeza === "contagem" ? "un" : "kg";

  async function onReady(eng: ViewerEngine) {
    // Viewer3D é desmontado ao fechar o diálogo (`{open && <Viewer3D/>}`) — reabrir cria uma engine
    // NOVA, sem nada carregado. Todo estado que dependia do modelo anterior tem que voltar a zero,
    // senão a UI mostra "modelo escolhido" com um viewer vazio por baixo (soma sai 0 em silêncio).
    setEngine(eng);
    setModeloId("");
    setElementos([]);
    setCategoria("");
    setPavimento(TODOS_PAVIMENTOS);
    setPreview(null);
    setAmostra(null);
    setGuidsFiltrados([]);
  }

  async function escolherModelo(id: string) {
    if (!engine) return;
    setModeloId(id);
    setCategoria("");
    setPavimento(TODOS_PAVIMENTOS);
    setPreview(null);
    setCarregandoIndice(true);
    try {
      const modelo = modelos.find((m) => m.uploadId === id);
      await engine.carregarModelo(id, `/api/coordenacao/frag/${encodeURIComponent(id)}`);
      const els = await engine.indiceDoModelo(id);
      setElementos(els);
      setDescricao(modelo ? `${GRANDEZA_LABEL[grandeza]} — ${modelo.nomeArquivo}` : "");
      await engine.enquadrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar o modelo.");
    } finally {
      setCarregandoIndice(false);
    }
  }

  async function calcular() {
    if (!engine || !modeloId || !categoria) return;
    setCalculando(true);
    setPreview(null);
    try {
      const filtrados = elementos.filter((e) => {
        if (e.category !== categoria) return false;
        if (pavimento === TODOS_PAVIMENTOS) return true;
        if (pavimento === SEM_PAVIMENTO) return e.pavimentoNome === null;
        return e.pavimentoNome === pavimento;
      });
      const localIds = filtrados.map((e) => e.localId);
      const brutos = await engine.dadosBrutosPorLocalIds(modeloId, localIds);

      const valorPorLocalId = new Map<number, number>();
      let primeiraAmostra: number | null = null;
      localIds.forEach((localId, i) => {
        const quantidades = normalizarQuantidades(extrairQuantidades(brutos[i]), fator.valor);
        const escolhida = escolherQuantidade(quantidades, grandeza);
        if (escolhida) {
          valorPorLocalId.set(localId, escolhida.valor);
          if (primeiraAmostra === null) primeiraAmostra = escolhida.valor;
        }
      });

      const [linha] = agregarPorCategoria(filtrados, valorPorLocalId);
      setPreview(
        linha
          ? { soma: linha.soma, comQtd: linha.comQuantidade, semQtd: linha.semQuantidade, total: linha.totalElementos }
          : { soma: 0, comQtd: 0, semQtd: 0, total: 0 },
      );
      setAmostra(primeiraAmostra);

      const guids = await engine.guidsPorLocalIds(modeloId, localIds);
      setGuidsFiltrados(guids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao calcular quantidades.");
    } finally {
      setCalculando(false);
    }
  }

  function salvar() {
    if (!preview || !descricao.trim()) return;
    startTransition(async () => {
      const r = await registrarQuantitativo({
        orcamentoId,
        descricao: descricao.trim(),
        grandeza,
        unidade,
        quantidade: preview.soma,
        origem: "ifc",
        uploadId: modeloId,
        guids: guidsFiltrados,
        memoria: `Extraído do IFC — categoria ${categoria}${pavimento !== TODOS_PAVIMENTOS ? `, pavimento ${pavimento === SEM_PAVIMENTO ? "(sem pavimento)" : pavimento}` : ""}. ${preview.comQtd}/${preview.total} elementos com quantidade${preview.semQtd > 0 ? ` (${preview.semQtd} sem dado no IFC)` : ""}.`,
      });
      if (r.ok) {
        toast.success("Levantamento gravado.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-4 py-2">
          <DialogTitle className="text-sm">Levantar quantidade do IFC</DialogTitle>
          <DialogDescription className="text-xs">
            Filtre por categoria, confira a amostra e a unidade antes de gravar — nunca assume metros em silêncio.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="relative w-2/3 shrink-0 border-r">
            {open && <Viewer3D onReady={onReady} onSelecionar={() => {}} />}
            {(carregandoIndice || !modeloId) && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
                {modeloId ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Carregando modelo…
                  </span>
                ) : (
                  "Escolha um modelo ao lado."
                )}
              </div>
            )}
          </div>

          <div className="flex w-1/3 flex-col gap-3 overflow-y-auto p-3">
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modeloId} onValueChange={(v) => v && escolherModelo(v)} disabled={!engine}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o modelo convertido" />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.uploadId} value={m.uploadId}>
                      {m.disciplinaNome} · {m.nomeArquivo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {modeloId && !carregandoIndice && (
              <>
                <div className="space-y-1.5">
                  <Label>Categoria (IfcClass)</Label>
                  <Select value={categoria} onValueChange={(v) => v && setCategoria(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Pavimento</Label>
                  <Select value={pavimento} onValueChange={(v) => v && setPavimento(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os pavimentos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS_PAVIMENTOS}>Todos</SelectItem>
                      {pavimentos.map((p) => (
                        <SelectItem key={p.localId ?? SEM_PAVIMENTO} value={p.nome ?? SEM_PAVIMENTO}>
                          {p.nome ?? "Sem pavimento"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Grandeza</Label>
                  <Select value={grandeza} onValueChange={(v) => v && setGrandeza(v as CustoGrandeza)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(GRANDEZA_LABEL) as CustoGrandeza[]).map((g) => (
                        <SelectItem key={g} value={g}>
                          {GRANDEZA_LABEL[g]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(grandeza === "area" || grandeza === "volume" || grandeza === "comprimento") && (
                  <div className="space-y-1.5">
                    <Label>Unidade declarada no arquivo IFC</Label>
                    <Select value={String(fatorIdx)} onValueChange={(v) => v && setFatorIdx(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FATOR_COMPRIMENTO.map((f, i) => (
                          <SelectItem key={f.label} value={String(i)}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      O IFC não converte a quantidade automaticamente pra metros — confira a amostra abaixo antes de
                      gravar.
                    </p>
                  </div>
                )}

                <Button size="sm" onClick={calcular} disabled={!categoria || calculando}>
                  {calculando ? <Loader2 className="size-4 animate-spin" /> : null} Calcular prévia
                </Button>

                {preview && (
                  <div className="space-y-2 rounded-sm border p-2 text-sm">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-7">Elementos</TableHead>
                          <TableHead className="h-7 text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>Total no filtro</TableCell>
                          <TableCell className="text-right font-mono">{preview.total}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Com quantidade no IFC</TableCell>
                          <TableCell className="text-right font-mono">{preview.comQtd}</TableCell>
                        </TableRow>
                        {preview.semQtd > 0 && (
                          <TableRow>
                            <TableCell className="text-warning">Sem quantidade (não somados)</TableCell>
                            <TableCell className="text-right font-mono text-warning">{preview.semQtd}</TableCell>
                          </TableRow>
                        )}
                        <TableRow className="font-semibold">
                          <TableCell>
                            Soma ({GRANDEZA_LABEL[grandeza]}, {unidade})
                          </TableCell>
                          <TableCell className="text-right font-mono">{preview.soma.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    {amostra !== null && (
                      <p className="text-[11px] text-muted-foreground">
                        Amostra (1º elemento com dado): {amostra.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}{" "}
                        {unidade} — confira se bate com a unidade escolhida acima.
                      </p>
                    )}
                    {preview.semQtd > 0 && (
                      <p className="text-[11px] text-warning">
                        {preview.semQtd} elemento(s) do filtro não têm essa grandeza no IFC — não entraram na soma.
                      </p>
                    )}

                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="descricao-quantitativo">Descrição do levantamento</Label>
                      <Input
                        id="descricao-quantitativo"
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        maxLength={200}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!preview || !descricao.trim() || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Gravar levantamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
