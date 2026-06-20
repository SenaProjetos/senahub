"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, AlertTriangle, Trash2, UserPlus, Users } from "lucide-react";
import { salvarRecurso, salvarAlocacao, removerAlocacao } from "@/modules/planejamento/actions";
import { criarHabilidade, alternarHabilidadeUsuario } from "@/modules/rh/habilidades/actions";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Alocacao = {
  id: string;
  projetoId: string;
  projetoCodigo: string;
  projetoNome: string;
  percentual: number;
  inicio: string | null;
  fim: string | null;
  observacao: string | null;
};
type Linha = {
  recursoId: string;
  userId: string;
  nome: string;
  role: string;
  capacidade: number;
  capacidadePct: number;
  cor: string;
  custoHora: number | null;
  totalAlocado: number;
  superalocado: boolean;
  alocacoes: Alocacao[];
};
type Projeto = { id: string; codigo: string; nome: string };

const NONE = "__none";

type Habilidade = { id: string; nome: string };

export function RecursosMatrix({
  linhas,
  projetos,
  usuariosSemRecurso,
  podeGerir,
  catalogoHabilidades,
  habilidadesPorUser,
}: {
  linhas: Linha[];
  projetos: Projeto[];
  usuariosSemRecurso: { id: string; name: string; role: string }[];
  podeGerir: boolean;
  catalogoHabilidades: Habilidade[];
  habilidadesPorUser: Record<string, Habilidade[]>;
}) {
  const router = useRouter();
  const [habDlg, setHabDlg] = useState<{ userId: string; nome: string } | null>(null);
  const [pending, start] = useTransition();
  const [recursoDlg, setRecursoDlg] = useState<{ open: boolean; linha: Linha | null }>({
    open: false,
    linha: null,
  });
  const [novoOpen, setNovoOpen] = useState(false);
  const [alocDlg, setAlocDlg] = useState<{ open: boolean; linha: Linha | null; aloc: Alocacao | null }>({
    open: false,
    linha: null,
    aloc: null,
  });

  const totalSuper = linhas.filter((l) => l.superalocado).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Matriz de recursos</h2>
          <p className="text-sm text-muted-foreground">
            Alocação por pessoa × projeto. Capacidade é o multiplicador (1,0 = jornada cheia).
            {totalSuper > 0 && (
              <span className="ml-1 text-destructive">
                {totalSuper} recurso(s) superalocado(s).
              </span>
            )}
          </p>
        </div>
        {podeGerir && usuariosSemRecurso.length > 0 && (
          <Button size="sm" onClick={() => setNovoOpen(true)}>
            <UserPlus className="size-3.5" /> Adicionar recurso
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-sm border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pessoa</th>
              <th className="px-3 py-2">Capacidade</th>
              <th className="px-3 py-2">Alocações</th>
              <th className="px-3 py-2 w-48">Total</th>
              {podeGerir && <th className="px-3 py-2 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={podeGerir ? 5 : 4} className="px-3 py-8">
                  <EmptyState icon={Users} title="Nenhum recurso cadastrado." />
                </td>
              </tr>
            ) : (
              linhas.map((l) => (
                <tr key={l.recursoId} className={l.superalocado ? "bg-destructive/5" : ""}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.cor }} />
                      <div>
                        <div className="font-medium">{l.nome}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {ROLE_LABELS[l.role as Role] ?? l.role}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {(habilidadesPorUser[l.userId] ?? []).map((h) => (
                            <span key={h.id} className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {h.nome}
                            </span>
                          ))}
                          {podeGerir && (
                            <button
                              type="button"
                              onClick={() => setHabDlg({ userId: l.userId, nome: l.nome })}
                              className="rounded-sm border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-foreground"
                            >
                              + habilidade
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {l.capacidade.toFixed(2).replace(".", ",")}×
                    {l.custoHora != null && (
                      <span className="ml-1 text-muted-foreground">
                        · R$ {l.custoHora.toLocaleString("pt-BR")}/h
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {l.alocacoes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        l.alocacoes.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            disabled={!podeGerir}
                            onClick={() => setAlocDlg({ open: true, linha: l, aloc: a })}
                            className={`rounded-sm border px-1.5 py-0.5 font-mono text-[11px] ${
                              podeGerir ? "hover:border-primary" : ""
                            }`}
                            title={`${a.projetoNome}${a.observacao ? ` — ${a.observacao}` : ""}`}
                          >
                            {formatarCodigo(a.projetoCodigo)} <span className="text-muted-foreground">{a.percentual}%</span>
                          </button>
                        ))
                      )}
                      {podeGerir && projetos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setAlocDlg({ open: true, linha: l, aloc: null })}
                          className="rounded-sm border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                        >
                          <Plus className="inline size-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className={`h-full ${l.superalocado ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, (l.totalAlocado / l.capacidadePct) * 100)}%` }}
                        />
                      </div>
                      <span className="w-20 text-right font-mono text-xs">
                        {l.totalAlocado}/{l.capacidadePct}%
                      </span>
                      {l.superalocado && <AlertTriangle className="size-3.5 shrink-0 text-destructive" />}
                    </div>
                  </td>
                  {podeGerir && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRecursoDlg({ open: true, linha: l })}
                      >
                        Editar
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {podeGerir && (
        <>
          <NovoRecursoDialog
            open={novoOpen}
            onOpenChange={setNovoOpen}
            usuarios={usuariosSemRecurso}
            pending={pending}
            onSalvar={(payload) =>
              start(async () => {
                const r = await salvarRecurso(payload);
                if (r.ok) {
                  toast.success("Recurso adicionado.");
                  setNovoOpen(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          />
          <RecursoDialog
            state={recursoDlg}
            onOpenChange={(o) => setRecursoDlg((s) => ({ ...s, open: o }))}
            pending={pending}
            onSalvar={(payload) =>
              start(async () => {
                const r = await salvarRecurso(payload);
                if (r.ok) {
                  toast.success("Recurso atualizado.");
                  setRecursoDlg((s) => ({ ...s, open: false }));
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          />
          <AlocacaoDialog
            state={alocDlg}
            projetos={projetos}
            onOpenChange={(o) => setAlocDlg((s) => ({ ...s, open: o }))}
            pending={pending}
            onSalvar={(payload) =>
              start(async () => {
                const r = await salvarAlocacao(payload);
                if (r.ok) {
                  toast.success("Alocação salva.");
                  setAlocDlg((s) => ({ ...s, open: false }));
                  router.refresh();
                } else toast.error(r.error);
              })
            }
            onRemover={(id) =>
              start(async () => {
                const r = await removerAlocacao({ id });
                if (r.ok) {
                  toast.success("Alocação removida.");
                  setAlocDlg((s) => ({ ...s, open: false }));
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          />
        </>
      )}

      {podeGerir && habDlg && (
        <HabilidadesDialog
          alvo={habDlg}
          catalogo={catalogoHabilidades}
          atribuidas={(habilidadesPorUser[habDlg.userId] ?? []).map((h) => h.id)}
          pending={pending}
          onClose={() => setHabDlg(null)}
          onToggle={(habilidadeId) =>
            start(async () => {
              const r = await alternarHabilidadeUsuario({ userId: habDlg.userId, habilidadeId });
              if (r.ok) router.refresh();
              else toast.error(r.error);
            })
          }
          onCriar={(nome) =>
            start(async () => {
              const r = await criarHabilidade({ nome });
              if (r.ok) router.refresh();
              else toast.error(r.error);
            })
          }
        />
      )}
    </div>
  );
}

function HabilidadesDialog({
  alvo,
  catalogo,
  atribuidas,
  pending,
  onClose,
  onToggle,
  onCriar,
}: {
  alvo: { userId: string; nome: string };
  catalogo: Habilidade[];
  atribuidas: string[];
  pending: boolean;
  onClose: () => void;
  onToggle: (habilidadeId: string) => void;
  onCriar: (nome: string) => void;
}) {
  const [nova, setNova] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Habilidades · {alvo.nome}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {catalogo.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma habilidade. Crie abaixo.</p>}
          {catalogo.map((h) => {
            const on = atribuidas.includes(h.id);
            return (
              <button
                key={h.id}
                type="button"
                disabled={pending}
                onClick={() => onToggle(h.id)}
                className={`rounded-sm border px-2 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}
              >
                {h.nome}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Nova habilidade…"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nova.trim()) {
                onCriar(nova);
                setNova("");
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !nova.trim()}
            onClick={() => {
              onCriar(nova);
              setNova("");
            }}
          >
            Criar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NovoRecursoDialog({
  open,
  onOpenChange,
  usuarios,
  pending,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  usuarios: { id: string; name: string; role: string }[];
  pending: boolean;
  onSalvar: (p: { userId: string; capacidade: number; cor: string; ativo: boolean }) => void;
}) {
  const [userId, setUserId] = useState(NONE);
  const [capacidade, setCapacidade] = useState("1.0");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar recurso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Pessoa</Label>
            <Select value={userId} onValueChange={(v) => setUserId(v ?? NONE)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Capacidade (multiplicador)</Label>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || userId === NONE}
            onClick={() => onSalvar({ userId, capacidade: Number(capacidade), cor: "", ativo: true })}
          >
            {pending ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecursoDialog({
  state,
  onOpenChange,
  pending,
  onSalvar,
}: {
  state: { open: boolean; linha: Linha | null };
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSalvar: (p: {
    userId: string;
    capacidade: number;
    custoHora?: number;
    cor: string;
    ativo: boolean;
  }) => void;
}) {
  const l = state.linha;
  const [capacidade, setCapacidade] = useState("1.0");
  const [custoHora, setCustoHora] = useState("");
  const [cor, setCor] = useState("#576980");
  const [lastId, setLastId] = useState<string | null>(null);
  if (l && lastId !== l.recursoId) {
    setLastId(l.recursoId);
    setCapacidade(String(l.capacidade));
    setCustoHora(l.custoHora != null ? String(l.custoHora) : "");
    setCor(l.cor);
  }
  if (!l) return null;
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{l.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Capacidade</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Custo/hora (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={custoHora}
                onChange={(e) => setCustoHora(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <input
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-sm border bg-background"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              onSalvar({
                userId: l.userId,
                capacidade: Number(capacidade),
                custoHora: custoHora ? Number(custoHora) : undefined,
                cor,
                ativo: true,
              })
            }
          >
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlocacaoDialog({
  state,
  projetos,
  onOpenChange,
  pending,
  onSalvar,
  onRemover,
}: {
  state: { open: boolean; linha: Linha | null; aloc: Alocacao | null };
  projetos: Projeto[];
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSalvar: (p: {
    recursoId: string;
    projetoId: string;
    percentual: number;
    inicio: string;
    fim: string;
    observacao: string;
  }) => void;
  onRemover: (id: string) => void;
}) {
  const { linha: l, aloc } = state;
  const [projetoId, setProjetoId] = useState(NONE);
  const [percentual, setPercentual] = useState("100");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${l?.recursoId ?? ""}:${aloc?.id ?? "nova"}`;
  if (state.open && lastKey !== key) {
    setLastKey(key);
    setProjetoId(aloc?.projetoId ?? NONE);
    setPercentual(String(aloc?.percentual ?? 100));
    setInicio(aloc?.inicio ?? "");
    setFim(aloc?.fim ?? "");
    setObservacao(aloc?.observacao ?? "");
  }
  if (!l) return null;

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Alocação · {l.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Projeto</Label>
            <Select
              value={projetoId}
              onValueChange={(v) => setProjetoId(v ?? NONE)}
              disabled={!!aloc}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatarCodigo(p.codigo)} · {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Percentual: {percentual}%</Label>
            <input
              type="range"
              min={1}
              max={100}
              step={5}
              value={percentual}
              onChange={(e) => setPercentual(e.target.value)}
              className="w-full accent-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início (opcional)</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim (opcional)</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {aloc ? (
            <Button variant="ghost" size="sm" onClick={() => onRemover(aloc.id)} disabled={pending}>
              <Trash2 className="size-3.5" /> Remover
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              disabled={pending || projetoId === NONE}
              onClick={() =>
                onSalvar({
                  recursoId: l.recursoId,
                  projetoId,
                  percentual: Number(percentual),
                  inicio,
                  fim,
                  observacao,
                })
              }
            >
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
