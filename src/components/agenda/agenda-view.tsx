"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Check, X, Trash2, MapPin } from "lucide-react";
import {
  criarCompromisso,
  confirmarPresenca,
  excluirCompromisso,
} from "@/modules/agenda/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Comp = {
  id: string;
  titulo: string;
  local: string | null;
  inicio: string;
  fim: string | null;
  criador: string;
  minhaConfirmacao: boolean | null;
  participantes: { nome: string; confirmado: boolean | null }[];
};
type Prazo = { data: string; rotulo: string; href: string; tipo: "projeto" | "disciplina" };

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function AgendaView({
  ano,
  mes,
  compromissos,
  prazos,
  internos,
  meuId,
}: {
  ano: number;
  mes: number;
  compromissos: Comp[];
  prazos: Prazo[];
  internos: { id: string; name: string }[];
  meuId: string;
}) {
  const router = useRouter();
  const [dialogNovo, setDialogNovo] = useState(false);
  void meuId;

  function nav(delta: number) {
    const d = new Date(ano, mes - 1 + delta, 1);
    router.push(`/agenda?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // grade do mês
  const primeiro = new Date(ano, mes - 1, 1);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const offset = primeiro.getDay();
  const hoje = new Date();
  const ehHoje = (d: number) =>
    hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes && hoje.getDate() === d;

  const porDia = new Map<number, { comps: Comp[]; prazos: Prazo[] }>();
  for (let d = 1; d <= diasNoMes; d++) porDia.set(d, { comps: [], prazos: [] });
  for (const c of compromissos) {
    const d = new Date(c.inicio).getDate();
    porDia.get(d)?.comps.push(c);
  }
  for (const p of prazos) {
    const d = Number(p.data.slice(8, 10));
    porDia.get(d)?.prazos.push(p);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => nav(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="w-48 text-center text-xl font-extrabold tracking-tight">
            {MESES[mes - 1]} {ano}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => nav(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button onClick={() => setDialogNovo(true)}>
          <Plus className="size-4" /> Novo compromisso
        </Button>
      </div>

      {/* Grade mensal */}
      <div className="grid grid-cols-7 gap-1">
        {DIAS.map((d, i) => (
          <div key={i} className="px-1 py-1 text-center font-mono text-[10px] uppercase text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`v${i}`} />
        ))}
        {Array.from({ length: diasNoMes }).map((_, i) => {
          const d = i + 1;
          const info = porDia.get(d)!;
          return (
            <div
              key={d}
              className={`min-h-20 rounded-sm border p-1 text-xs ${ehHoje(d) ? "border-primary bg-primary/5" : "border-border/60"}`}
            >
              <span className={`font-mono ${ehHoje(d) ? "font-bold text-primary" : "text-muted-foreground"}`}>{d}</span>
              <div className="mt-0.5 space-y-0.5">
                {info.prazos.map((p, j) => (
                  <Link
                    key={j}
                    href={p.href}
                    className="block truncate rounded-sm bg-destructive/15 px-1 text-[10px] text-destructive"
                    title={p.rotulo}
                  >
                    ⚑ {p.rotulo}
                  </Link>
                ))}
                {info.comps.map((c) => (
                  <p key={c.id} className="truncate rounded-sm bg-primary/15 px-1 text-[10px] text-primary" title={c.titulo}>
                    {new Date(c.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {c.titulo}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lista do mês */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compromissos do mês</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {compromissos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum compromisso.</p>
          ) : (
            compromissos.map((c) => <CompRow key={c.id} c={c} />)
          )}
        </CardContent>
      </Card>

      <NovoCompromissoDialog open={dialogNovo} onOpenChange={setDialogNovo} internos={internos} />
    </div>
  );
}

function CompRow({ c }: { c: Comp }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function confirmar(confirmado: boolean) {
    start(async () => {
      const r = await confirmarPresenca({ id: c.id, confirmado });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }
  function excluir() {
    start(async () => {
      const r = await excluirCompromisso({ id: c.id });
      if (r.ok) {
        toast.success("Compromisso excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const confirmados = c.participantes.filter((p) => p.confirmado === true).length;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border p-2.5 text-sm">
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(c.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="font-medium">{c.titulo}</span>
      {c.local && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" /> {c.local}
        </span>
      )}
      <Badge variant="outline">
        {confirmados}/{c.participantes.length} confirmado(s)
      </Badge>
      <div className="ml-auto flex items-center gap-1">
        {c.minhaConfirmacao === null && (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => confirmar(true)}>
              <Check className="size-3.5" /> Vou
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirmar(false)}>
              <X className="size-3.5" /> Não vou
            </Button>
          </>
        )}
        {c.minhaConfirmacao === true && (
          <Badge variant="outline" className="text-success border-success/40">confirmado</Badge>
        )}
        {c.minhaConfirmacao === false && (
          <Badge variant="outline" className="text-muted-foreground">recusado</Badge>
        )}
        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={excluir}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function NovoCompromissoDialog({
  open,
  onOpenChange,
  internos,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  internos: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [local, setLocal] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [participantes, setParticipantes] = useState<string[]>([]);

  function criar() {
    start(async () => {
      const r = await criarCompromisso({
        titulo,
        descricao: "",
        local,
        inicio,
        fim,
        participantesIds: participantes,
      });
      if (r.ok) {
        toast.success("Compromisso criado — convites enviados.");
        onOpenChange(false);
        setTitulo("");
        setLocal("");
        setInicio("");
        setFim("");
        setParticipantes([]);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo compromisso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Convidados</Label>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {internos.map((u) => {
                const sel = participantes.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() =>
                      setParticipantes((p) => (sel ? p.filter((x) => x !== u.id) : [...p, u.id]))
                    }
                    className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                      sel ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={criar} disabled={pending || !titulo || !inicio}>
            {pending ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
