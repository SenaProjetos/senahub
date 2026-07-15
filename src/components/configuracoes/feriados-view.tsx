"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Download, CalendarOff, Repeat } from "lucide-react";
import {
  salvarFeriado,
  excluirFeriado,
  salvarFeriadoRecorrente,
  excluirFeriadoRecorrente,
  importarFeriadosNacionais,
} from "@/modules/rh/feriados/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type FeriadoDia = { id: string; data: string; nome: string; tipo: string; origem: "unico" | "recorrente" };
type Recorrente = { id: string; dia: number; mes: number; nome: string; tipo: string };

const ESFERAS = [
  { v: "nacional", l: "Nacional" },
  { v: "estadual", l: "Estadual" },
  { v: "municipal", l: "Municipal" },
] as const;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function FeriadosView({
  ano,
  feriados,
  recorrentes,
}: {
  ano: number;
  feriados: FeriadoDia[];
  recorrentes: Recorrente[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("municipal");
  const [recorrente, setRecorrente] = useState(false);
  const [data, setData] = useState("");
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("1");
  const atual = new Date().getFullYear();
  const anos = [atual + 1, atual, atual - 1];

  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

  function limpar() {
    setNome("");
    setData("");
    setDia("");
    setMes("1");
  }

  function adicionar() {
    if (!nome.trim()) return;
    if (recorrente) {
      const d = Number(dia);
      if (!Number.isInteger(d) || d < 1 || d > 31) return toast.error("Informe o dia (1–31).");
      start(async () => {
        const r = await salvarFeriadoRecorrente({ dia: d, mes: Number(mes), nome, tipo });
        if (r.ok) {
          toast.success("Feriado recorrente salvo.");
          limpar();
          router.refresh();
        } else toast.error(r.error);
      });
    } else {
      if (!data) return toast.error("Informe a data.");
      start(async () => {
        const r = await salvarFeriado({ data, nome, tipo });
        if (r.ok) {
          toast.success("Feriado salvo.");
          limpar();
          router.refresh();
        } else toast.error(r.error);
      });
    }
  }

  function removerUnico(id: string) {
    start(async () => {
      const r = await excluirFeriado({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function removerRecorrente(id: string, nomeF: string) {
    const ok = await confirm({
      title: "Remover feriado recorrente",
      description: `"${nomeF}" deixa de aparecer em TODOS os anos. Continuar?`,
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirFeriadoRecorrente({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function importar() {
    start(async () => {
      const r = await importarFeriadosNacionais({ ano });
      if (r.ok) {
        toast.success(`${r.data.total} feriados nacionais importados.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/configuracoes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Feriados</h2>
        <p className="text-sm text-muted-foreground">
          Usados no ponto/escala (descontam do esperado) e exibidos na Agenda. Feriados de data fixa podem repetir todo ano.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={String(ano)} onValueChange={(v) => router.push(`/configuracoes/feriados?ano=${v ?? ano}`)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={importar} disabled={pending}>
          <Download className="size-3.5" /> Importar nacionais {ano}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adicionar feriado</CardTitle>
          <CardDescription>
            Escolha a esfera. Marque &quot;repete todo ano&quot; para feriados de data fixa (sem informar o ano).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {recorrente ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Dia</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={dia}
                    onChange={(e) => setDia(e.target.value)}
                    className="w-20"
                    placeholder="Dia"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mês</Label>
                  <Select value={mes} onValueChange={(v) => setMes(v ?? "1")}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MESES.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-44" />
              </div>
            )}
            <div className="space-y-1 flex-1 min-w-48">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input placeholder="Nome do feriado" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Esfera</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v ?? "municipal")}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESFERAS.map((e) => (
                    <SelectItem key={e.v} value={e.v}>
                      {e.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={adicionar} disabled={pending || !nome.trim()}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
            <Repeat className="size-3.5" /> Repete todo ano (data fixa)
          </label>
        </CardContent>
      </Card>

      {recorrentes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feriados recorrentes (todo ano)</CardTitle>
            <CardDescription>Repetem automaticamente em todos os anos. Móveis (Carnaval, Páscoa…) use &quot;Importar nacionais&quot;.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {recorrentes.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-16 font-mono text-xs text-muted-foreground">
                      {String(r.dia).padStart(2, "0")}/{String(r.mes).padStart(2, "0")}
                    </span>
                    <span>{r.nome}</span>
                    <Badge variant="outline" className="capitalize">{r.tipo}</Badge>
                    <Badge variant="secondary" className="gap-1">
                      <Repeat className="size-3" /> todo ano
                    </Badge>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Remover recorrente" onClick={() => removerRecorrente(r.id, r.nome)} disabled={pending}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{feriados.length} feriado(s) em {ano}</CardTitle>
        </CardHeader>
        <CardContent>
          {feriados.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Nenhum feriado" description="Importe os feriados nacionais para começar." />
          ) : (
            <ul className="divide-y text-sm">
              {feriados.map((f) => (
                <li key={`${f.origem}-${f.id}-${f.data}`} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-3">
                    <span className="w-28 font-mono text-xs capitalize text-muted-foreground">{fmt(f.data)}</span>
                    <span>{f.nome}</span>
                    <Badge variant="outline" className="capitalize">{f.tipo}</Badge>
                    {f.origem === "recorrente" && (
                      <Badge variant="secondary" className="gap-1">
                        <Repeat className="size-3" /> todo ano
                      </Badge>
                    )}
                  </div>
                  {f.origem === "unico" ? (
                    <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => removerUnico(f.id)} disabled={pending}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : (
                    <span className="pr-2 text-[10px] text-muted-foreground">gerido acima</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
