"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Check, X, Trash2, MapPin, CalendarDays, Download, Pencil } from "lucide-react";
import {
  criarCompromisso,
  editarCompromisso,
  confirmarPresenca,
  excluirCompromisso,
} from "@/modules/agenda/actions";
import { gerarIcs } from "@/modules/agenda/ics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
  descricao?: string | null;
  local: string | null;
  inicio: string;
  fim: string | null;
  criador: string;
  minhaConfirmacao: boolean | null;
  participantes: { nome: string; confirmado: boolean | null }[];
  participantesIds: string[];
};
type Prazo = { data: string; rotulo: string; href: string; tipo: "projeto" | "disciplina" };
type Vista = "mes" | "semana" | "dia";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// chave YYYY-MM-DD em horário local, para agrupar compromissos por dia
function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// segunda-feira da semana que contém `d` (início do dia)
function inicioSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay(); // 0=dom … 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow; // recua até segunda
  r.setDate(r.getDate() + diff);
  return r;
}
function addDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// dispara o download de um .ics no client
function baixarIcs(comps: Comp[], nomeArquivo: string) {
  if (comps.length === 0) {
    toast.info("Nenhum compromisso para exportar.");
    return;
  }
  const ics = gerarIcs(
    comps.map((c) => ({
      uid: `${c.id}@senahub`,
      titulo: c.titulo,
      inicio: c.inicio,
      fim: c.fim ?? undefined,
      descricao: c.descricao ?? undefined,
      local: c.local ?? undefined,
    })),
  );
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
  const [vista, setVista] = useState<Vista>("mes");
  // dia/semana de referência (estado local) — começa em hoje ou no mês exibido
  const [refData, setRefData] = useState<Date>(() => {
    const h = new Date();
    return h.getFullYear() === ano && h.getMonth() + 1 === mes
      ? new Date(h.getFullYear(), h.getMonth(), h.getDate())
      : new Date(ano, mes - 1, 1);
  });
  void meuId;

  function navMes(delta: number) {
    const d = new Date(ano, mes - 1 + delta, 1);
    router.push(`/agenda?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // compromissos agrupados por dia (chave local YYYY-MM-DD), reaproveitando os dados carregados
  const compsPorChave = useMemo(() => {
    const m = new Map<string, Comp[]>();
    for (const c of compromissos) {
      const k = chaveDia(new Date(c.inicio));
      const lista = m.get(k);
      if (lista) lista.push(c);
      else m.set(k, [c]);
    }
    return m;
  }, [compromissos]);

  // dias da semana corrente (segunda → domingo)
  const diasDaSemana = useMemo(() => {
    const seg = inicioSemana(refData);
    return Array.from({ length: 7 }, (_, i) => addDias(seg, i));
  }, [refData]);

  const hoje = new Date();
  const [editando, setEditando] = useState<Comp | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleVista vista={vista} onChange={setVista} />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => baixarIcs(compromissosVisiveis(vista, compromissos, refData, diasDaSemana), nomeArquivoIcs(vista, refData, ano, mes))}
          >
            <Download className="size-4" /> Exportar .ics
          </Button>
          <Button onClick={() => setDialogNovo(true)}>
            <Plus className="size-4" /> Novo compromisso
          </Button>
        </div>
      </div>

      {vista === "mes" && (
        <VistaMes
          ano={ano}
          mes={mes}
          compromissos={compromissos}
          prazos={prazos}
          onNav={navMes}
          onEditar={setEditando}
        />
      )}
      {vista === "semana" && (
        <VistaSemana
          dias={diasDaSemana}
          compsPorChave={compsPorChave}
          hoje={hoje}
          onNav={(delta) => setRefData((d) => addDias(d, delta * 7))}
          onHoje={() => setRefData(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))}
        />
      )}
      {vista === "dia" && (
        <VistaDia
          dia={refData}
          comps={compsPorChave.get(chaveDia(refData)) ?? []}
          ehHoje={chaveDia(refData) === chaveDia(hoje)}
          onNav={(delta) => setRefData((d) => addDias(d, delta))}
          onHoje={() => setRefData(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))}
          onEditar={setEditando}
        />
      )}

      <NovoCompromissoDialog open={dialogNovo} onOpenChange={setDialogNovo} internos={internos} />
      {editando && (
        <EditarCompromissoDialog
          comp={editando}
          internos={internos}
          onOpenChange={(o) => { if (!o) setEditando(null); }}
        />
      )}
    </div>
  );
}

// ── seletor de vista ──────────────────────────────────────────────────────
function ToggleVista({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  const opts: { v: Vista; label: string }[] = [
    { v: "mes", label: "Mês" },
    { v: "semana", label: "Semana" },
    { v: "dia", label: "Dia" },
  ];
  return (
    <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Vista da agenda">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={vista === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
            vista === o.v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// compromissos visíveis na vista corrente — base para o export .ics
function compromissosVisiveis(vista: Vista, todos: Comp[], refData: Date, diasSemana: Date[]): Comp[] {
  if (vista === "mes") return todos;
  if (vista === "dia") {
    const k = chaveDia(refData);
    return todos.filter((c) => chaveDia(new Date(c.inicio)) === k);
  }
  const chaves = new Set(diasSemana.map(chaveDia));
  return todos.filter((c) => chaves.has(chaveDia(new Date(c.inicio))));
}

function nomeArquivoIcs(vista: Vista, refData: Date, ano: number, mes: number): string {
  if (vista === "mes") return `agenda-${ano}-${String(mes).padStart(2, "0")}.ics`;
  if (vista === "dia") return `agenda-${chaveDia(refData)}.ics`;
  const seg = inicioSemana(refData);
  return `agenda-semana-${chaveDia(seg)}.ics`;
}

// ── vista mensal (grade original) ─────────────────────────────────────────
function VistaMes({
  ano,
  mes,
  compromissos,
  prazos,
  onNav,
  onEditar,
}: {
  ano: number;
  mes: number;
  compromissos: Comp[];
  prazos: Prazo[];
  onNav: (delta: number) => void;
  onEditar: (c: Comp) => void;
}) {
  const primeiro = new Date(ano, mes - 1, 1);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const offset = primeiro.getDay();
  const hoje = new Date();
  const ehHoje = (d: number) =>
    hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes && hoje.getDate() === d;

  // só os compromissos do mês exibido (a query carrega ±7 dias de folga)
  const compsDoMes = compromissos.filter((c) => {
    const d = new Date(c.inicio);
    return d.getFullYear() === ano && d.getMonth() + 1 === mes;
  });

  const porDia = new Map<number, { comps: Comp[]; prazos: Prazo[] }>();
  for (let d = 1; d <= diasNoMes; d++) porDia.set(d, { comps: [], prazos: [] });
  for (const c of compsDoMes) {
    const d = new Date(c.inicio).getDate();
    porDia.get(d)?.comps.push(c);
  }
  for (const p of prazos) {
    const [py, pm, pd] = p.data.split("-").map(Number);
    if (py === ano && pm === mes) porDia.get(pd)?.prazos.push(p);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => onNav(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="w-48 text-center text-xl font-extrabold tracking-tight">
          {MESES[mes - 1]} {ano}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => onNav(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

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
                    {fmtHora(c.inicio)} {c.titulo}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compromissos do mês</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {compsDoMes.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nenhum compromisso." />
          ) : (
            compsDoMes.map((c) => <CompRow key={c.id} c={c} onEditar={onEditar} />)
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── vista semanal ─────────────────────────────────────────────────────────
function VistaSemana({
  dias,
  compsPorChave,
  hoje,
  onNav,
  onHoje,
}: {
  dias: Date[];
  compsPorChave: Map<string, Comp[]>;
  hoje: Date;
  onNav: (delta: number) => void;
  onHoje: () => void;
}) {
  const seg = dias[0];
  const dom = dias[6];
  const chaveHoje = chaveDia(hoje);
  const titulo = `${seg.getDate()} ${MESES[seg.getMonth()].slice(0, 3)} – ${dom.getDate()} ${MESES[dom.getMonth()].slice(0, 3)} ${dom.getFullYear()}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Semana anterior" onClick={() => onNav(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="min-w-56 text-center text-lg font-extrabold tracking-tight">{titulo}</h2>
        <Button variant="ghost" size="icon" aria-label="Próxima semana" onClick={() => onNav(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onHoje}>
          Hoje
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-7">
        {dias.map((dia, i) => {
          const k = chaveDia(dia);
          const comps = (compsPorChave.get(k) ?? [])
            .slice()
            .sort((a, b) => a.inicio.localeCompare(b.inicio));
          const ehHoje = k === chaveHoje;
          return (
            <div
              key={k}
              className={`min-h-32 rounded-sm border p-1.5 ${ehHoje ? "border-primary bg-primary/5" : "border-border/60"}`}
            >
              <div className={`mb-1 text-xs font-semibold ${ehHoje ? "text-primary" : "text-muted-foreground"}`}>
                <span className="uppercase">{DIAS_SEMANA[i].slice(0, 3)}</span>{" "}
                <span className="font-mono">{dia.getDate()}</span>
              </div>
              <div className="space-y-1">
                {comps.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/60">—</p>
                ) : (
                  comps.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-sm bg-primary/15 px-1.5 py-1 text-[11px] text-primary"
                      title={c.local ? `${c.titulo} · ${c.local}` : c.titulo}
                    >
                      <span className="font-mono">{fmtHora(c.inicio)}</span>{" "}
                      <span className="font-medium">{c.titulo}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── vista diária ──────────────────────────────────────────────────────────
function VistaDia({
  dia,
  comps,
  ehHoje,
  onNav,
  onHoje,
  onEditar,
}: {
  dia: Date;
  comps: Comp[];
  ehHoje: boolean;
  onNav: (delta: number) => void;
  onHoje: () => void;
  onEditar: (c: Comp) => void;
}) {
  const ordenados = comps.slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
  const titulo = dia.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Dia anterior" onClick={() => onNav(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className={`min-w-64 text-center text-lg font-extrabold tracking-tight ${ehHoje ? "text-primary" : ""}`}>
          {titulo}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Próximo dia" onClick={() => onNav(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onHoje}>
          Hoje
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-5">
          {ordenados.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nenhum compromisso neste dia." />
          ) : (
            ordenados.map((c) => <CompRow key={c.id} c={c} onEditar={onEditar} />)
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CompRow({ c, onEditar }: { c: Comp; onEditar: (c: Comp) => void }) {
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
        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => onEditar(c)}>
          <Pencil className="size-4" />
        </Button>
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

function EditarCompromissoDialog({
  comp,
  internos,
  onOpenChange,
}: {
  comp: Comp;
  internos: { id: string; name: string }[];
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toLocalDT(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const [titulo, setTitulo] = useState(comp.titulo);
  const [local, setLocal] = useState(comp.local ?? "");
  const [inicio, setInicio] = useState(toLocalDT(comp.inicio));
  const [fim, setFim] = useState(comp.fim ? toLocalDT(comp.fim) : "");
  const [participantes, setParticipantes] = useState<string[]>(comp.participantesIds);

  function salvar() {
    start(async () => {
      const r = await editarCompromisso({
        id: comp.id,
        titulo,
        descricao: comp.descricao ?? "",
        local,
        inicio,
        fim,
        participantesIds: participantes,
      });
      if (r.ok) {
        toast.success("Compromisso atualizado.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar compromisso</DialogTitle>
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
          <Button onClick={salvar} disabled={pending || !titulo || !inicio}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
