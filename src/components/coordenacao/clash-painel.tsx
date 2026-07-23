"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Camera, FileText, MapPin, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { ViewerEngine, ConflitoView } from "@/modules/coordenacao/viewer/engine";
import { criarApontamentoCoordenacao } from "@/modules/coordenacao/actions";
import { formatarMetros } from "@/modules/coordenacao/medicao";
import { montarRelatorioClashHtml, type ItemRelatorioClash } from "@/modules/coordenacao/relatorio-clash";
import { formatarDataHora } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type ModeloClash = { uploadId: string; disciplinaId: string | null; label: string };

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o snapshot."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Detecção de conflitos (clash) entre 2 disciplinas: escolhe os modelos, roda o
 * núcleo puro (AABB+tolerância, via engine.detectarConflitos), lista os pares,
 * foca/realça cada um no viewer, vira apontamento com 1 clique, ou gera um
 * relatório HTML (imagem de cada conflito) que abre numa aba pra imprimir/salvar
 * como PDF pelo navegador — sem dependência nova.
 */
export function ClashPainel({
  engine,
  modelos,
  projetoId,
  projetoCodigo,
  projetoNome,
}: {
  engine: ViewerEngine | null;
  modelos: ModeloClash[];
  projetoId: string;
  projetoCodigo: string;
  projetoNome: string;
}) {
  const [modeloAId, setModeloAId] = useState<string | null>(null);
  const [modeloBId, setModeloBId] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<ConflitoView[]>([]);
  const [detectando, setDetectando] = useState(false);
  const [ativoIdx, setAtivoIdx] = useState<number | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [pending, start] = useTransition();

  const nomeDe = (uploadId: string) => modelos.find((m) => m.uploadId === uploadId)?.label ?? "—";

  async function detectar() {
    if (!engine || !modeloAId || !modeloBId) return;
    setDetectando(true);
    setAtivoIdx(null);
    setSelecionados(new Set());
    await engine.limparRealceConflito();
    try {
      const r = await engine.detectarConflitos(modeloAId, modeloBId);
      setConflitos(r);
      if (r.length === 0) toast.success("Nenhum conflito encontrado entre as disciplinas escolhidas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao detectar conflitos.");
    } finally {
      setDetectando(false);
    }
  }

  async function focar(idx: number) {
    if (!engine) return;
    const c = conflitos[idx];
    setAtivoIdx(idx);
    await engine.focarConflito(c);
    await engine.realcarConflito(c);
  }

  function alternarSelecionado(idx: number) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });
  }

  function virarApontamento(idx: number) {
    if (!engine) return;
    const c = conflitos[idx];
    const modeloA = modelos.find((m) => m.uploadId === c.modeloIdA);
    start(async () => {
      await engine.focarConflito(c);
      await engine.realcarConflito(c);
      const [guidsA, guidsB] = await Promise.all([
        engine.guidsPorLocalIds(c.modeloIdA, [c.localIdA]),
        engine.guidsPorLocalIds(c.modeloIdB, [c.localIdB]),
      ]);
      const camera = engine.capturarCamera();
      const r = await criarApontamentoCoordenacao({
        projetoId,
        disciplinaId: modeloA?.disciplinaId ?? undefined,
        uploadId: c.modeloIdA,
        titulo: `Conflito: ${nomeDe(c.modeloIdA)} × ${nomeDe(c.modeloIdB)}`,
        texto: `Interferência detectada automaticamente (penetração ${formatarMetros(c.profundidade)}).`,
        guids: [...guidsA, ...guidsB],
        camera,
      });
      if (r.ok) toast.success(`Apontamento #${r.data.numero} criado a partir do conflito.`);
      else toast.error(r.error);
    });
  }

  async function gerarRelatorio() {
    if (!engine || conflitos.length === 0) return;
    const alvo = selecionados.size > 0 ? [...selecionados] : conflitos.map((_, i) => i);
    setGerandoRelatorio(true);
    try {
      const itens: ItemRelatorioClash[] = [];
      for (const idx of alvo) {
        const c = conflitos[idx];
        await engine.focarConflito(c);
        await engine.realcarConflito(c);
        const blob = await engine.capturarSnapshot();
        if (!blob) continue;
        const imagemDataUrl = await blobParaDataUrl(blob);
        itens.push({
          numero: idx + 1,
          disciplinaA: nomeDe(c.modeloIdA),
          disciplinaB: nomeDe(c.modeloIdB),
          profundidade: formatarMetros(c.profundidade),
          imagemDataUrl,
        });
      }
      const html = montarRelatorioClashHtml(itens, {
        projetoCodigo,
        projetoNome,
        geradoEm: formatarDataHora(new Date()),
      });
      const aba = window.open("", "_blank");
      if (aba) {
        aba.document.write(html);
        aba.document.close();
      } else {
        toast.error("O navegador bloqueou a aba do relatório — permita pop-ups para este site.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o relatório.");
    } finally {
      setGerandoRelatorio(false);
    }
  }

  if (modelos.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <AlertTriangle className="size-4" /> Detecção de conflitos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Select value={modeloAId ?? ""} onValueChange={(v) => setModeloAId(v || null)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Disciplina A" />
            </SelectTrigger>
            <SelectContent>
              {modelos.map((m) => (
                <SelectItem key={m.uploadId} value={m.uploadId}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modeloBId ?? ""} onValueChange={(v) => setModeloBId(v || null)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Disciplina B" />
            </SelectTrigger>
            <SelectContent>
              {modelos
                .filter((m) => m.uploadId !== modeloAId)
                .map((m) => (
                  <SelectItem key={m.uploadId} value={m.uploadId}>
                    {m.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!modeloAId || !modeloBId || modeloAId === modeloBId || detectando}
          onClick={detectar}
        >
          <Search className="mr-1.5 size-3.5" />
          {detectando ? "Detectando…" : "Detectar conflitos"}
        </Button>

        {conflitos.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{conflitos.length} conflito(s) encontrado(s)</p>
              <Button size="sm" variant="outline" onClick={gerarRelatorio} disabled={gerandoRelatorio}>
                <FileText className="mr-1.5 size-3.5" />
                {gerandoRelatorio ? "Gerando…" : "Relatório"}
              </Button>
            </div>
            <ScrollArea className="max-h-[35vh]">
              <div className="space-y-1.5 pr-3">
                {conflitos.map((c, idx) => (
                  <div
                    key={`${c.modeloIdA}-${c.localIdA}-${c.modeloIdB}-${c.localIdB}`}
                    className={cn(
                      "flex items-center gap-2 rounded border px-2 py-1.5 text-xs",
                      ativoIdx === idx && "border-destructive bg-destructive/5",
                    )}
                  >
                    <Checkbox checked={selecionados.has(idx)} onCheckedChange={() => alternarSelecionado(idx)} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void focar(idx)}>
                      <p className="truncate font-medium">Conflito #{idx + 1}</p>
                      <p className="truncate text-muted-foreground">penetração {formatarMetros(c.profundidade)}</p>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      title="Focar no 3D"
                      onClick={() => void focar(idx)}
                    >
                      <MapPin className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      title="Virar apontamento"
                      disabled={pending}
                      onClick={() => virarApontamento(idx)}
                    >
                      <Camera className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setConflitos([]);
                setAtivoIdx(null);
                void engine?.limparRealceConflito();
              }}
            >
              <X className="mr-1.5 size-3.5" /> Limpar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
