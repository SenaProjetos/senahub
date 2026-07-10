"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { criarEntradaDiario, buscarUltimasEntradasDiario } from "@/modules/projetos/diario/actions";
import type { UltimaEntradaDiario } from "@/modules/projetos/diario/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataLabel(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/**
 * Modal compartilhado de entrada no diário: form (data + evolução) + últimas 5
 * entradas da disciplina. Usado no atalho do card disciplina, no atalho do
 * ponto (com seletor quando o usuário responde por mais de uma disciplina) e
 * — sem o link para o painel — dentro do próprio painel do diário.
 */
export function DiarioEntradaDialog({
  open,
  onOpenChange,
  disciplinas,
  projetoId,
  dataInicial,
  linkParaPainel = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Uma disciplina fixa (card/painel) OU lista p/ o usuário escolher (ponto, quando responsável por mais de uma). */
  disciplinas: { id: string; nome: string }[];
  projetoId: string;
  dataInicial?: string;
  /** Botão "Ir para o painel do diário" — atalhos fora do painel; o painel em si não passa isso. */
  linkParaPainel?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [disciplinaId, setDisciplinaId] = useState(disciplinas[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [data, setData] = useState(dataInicial ?? hojeISO());
  const [ultimas, setUltimas] = useState<UltimaEntradaDiario[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDisciplinaId(disciplinas[0]?.id ?? "");
    setTexto("");
    setData(dataInicial ?? hojeISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reabrir o modal deve resetar; `disciplinas`/`dataInicial` mudariam a cada render do pai.
  }, [open]);

  useEffect(() => {
    if (!open || !disciplinaId) {
      setUltimas([]);
      return;
    }
    let vivo = true;
    setCarregando(true);
    buscarUltimasEntradasDiario({ disciplinaId })
      .then((r) => {
        if (!vivo) return;
        setUltimas(r.ok ? r.data : []);
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [open, disciplinaId]);

  function registrar() {
    if (!texto.trim() || !disciplinaId) return;
    start(async () => {
      const r = await criarEntradaDiario({ disciplinaId, data, texto: texto.trim() });
      if (r.ok) {
        toast.success("Entrada registrada.");
        setTexto("");
        const res = await buscarUltimasEntradasDiario({ disciplinaId });
        if (res.ok) setUltimas(res.data);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const disciplinaNome = disciplinas.find((d) => d.id === disciplinaId)?.nome ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Diário{disciplinaNome ? ` — ${disciplinaNome}` : ""}</DialogTitle>
          <DialogDescription>Registre a evolução do dia.</DialogDescription>
        </DialogHeader>

        {disciplinas.length > 1 && (
          <Select value={disciplinaId} onValueChange={(v) => v && setDisciplinaId(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {disciplinas.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="space-y-2 rounded-sm border bg-muted/20 p-2.5">
          <textarea
            rows={3}
            placeholder="Descreva a evolução do dia…"
            className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={5000}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <input
              type="date"
              value={data}
              max={hojeISO()}
              onChange={(e) => setData(e.target.value)}
              className="rounded-sm border bg-background px-2 py-1 text-xs"
            />
            <Button size="sm" onClick={registrar} disabled={pending || !texto.trim() || !disciplinaId}>
              Registrar
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Últimas entradas</p>
          {carregando ? (
            <p className="py-2 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : ultimas.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">Nenhuma entrada registrada.</p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {ultimas.map((e) => (
                <li key={e.id} className="rounded-sm border px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize text-muted-foreground">{dataLabel(e.data)}</span>
                    <span className="text-muted-foreground">{e.autorNome}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{e.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {linkParaPainel && (
          <DialogFooter>
            <Button variant="outline" size="sm" render={<Link href={`/projetos/${projetoId}/diario`} />}>
              <NotebookPen className="size-3.5" /> Ir para o painel do diário
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
