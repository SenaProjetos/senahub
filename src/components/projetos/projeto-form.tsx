"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Layers } from "lucide-react";
import { criarProjeto } from "@/modules/projetos/actions";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

type Interno = { id: string; name: string; role: string };
type DiscDraft = { nome: string; prazo: string; valor: string; responsaveisIds: string[] };

export function ProjetoForm({
  open,
  onOpenChange,
  clientes,
  catalogo,
  internos,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientes: { id: string; nome: string }[];
  catalogo: string[];
  internos: Interno[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tipo, setTipo] = useState<"particular" | "licitacao">("particular");
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [prazoFinal, setPrazoFinal] = useState("");
  const [valorContrato, setValorContrato] = useState("");
  const [disciplinas, setDisciplinas] = useState<DiscDraft[]>([]);

  function addDisciplina() {
    const usada = new Set(disciplinas.map((d) => d.nome));
    const proxima = catalogo.find((c) => !usada.has(c)) ?? catalogo[0] ?? "";
    setDisciplinas((d) => [...d, { nome: proxima, prazo: "", valor: "", responsaveisIds: [] }]);
  }

  function setDisc(i: number, patch: Partial<DiscDraft>) {
    setDisciplinas((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function toggleResp(i: number, userId: string) {
    setDisciplinas((ds) =>
      ds.map((d, idx) => {
        if (idx !== i) return d;
        const has = d.responsaveisIds.includes(userId);
        return {
          ...d,
          responsaveisIds: has
            ? d.responsaveisIds.filter((x) => x !== userId)
            : [...d.responsaveisIds, userId],
        };
      }),
    );
  }

  function salvar() {
    if (!nome || !clienteId) {
      toast.error("Informe nome e cliente.");
      return;
    }
    if (disciplinas.length === 0) {
      toast.error("Adicione ao menos uma disciplina.");
      return;
    }
    start(async () => {
      const res = await criarProjeto({
        tipo,
        nome,
        clienteId,
        areaM2: areaM2 ? Number(areaM2) : undefined,
        prazoFinal: prazoFinal || undefined,
        valorContrato: valorContrato ? Number(valorContrato) : undefined,
        membrosIds: [],
        disciplinas: disciplinas.map((d) => ({
          nome: d.nome,
          prazo: d.prazo || undefined,
          valor: d.valor ? Number(d.valor) : undefined,
          responsaveisIds: d.responsaveisIds,
        })),
      });
      if (res.ok) {
        toast.success(`Projeto ${res.data.codigo} criado.`);
        onOpenChange(false);
        setNome("");
        setClienteId("");
        setAreaM2("");
        setPrazoFinal("");
        setValorContrato("");
        setDisciplinas([]);
        router.push(`/projetos/${res.data.id}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            O número AAXXXX é gerado automaticamente ao salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "particular" | "licitacao")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular</SelectItem>
                  <SelectItem value="licitacao">Licitação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome do projeto</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Área (m²)</Label>
              <Input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo final</Label>
              <Input type="date" value={prazoFinal} onChange={(e) => setPrazoFinal(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Valor de contrato (R$)</Label>
            <Input
              type="number"
              value={valorContrato}
              onChange={(e) => setValorContrato(e.target.value)}
              placeholder="Receita contratada — base para gerar parcelas"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label className="text-sm">Disciplinas</Label>
            <Button type="button" variant="outline" size="sm" onClick={addDisciplina}>
              <Plus className="size-4" /> Adicionar
            </Button>
          </div>

          {disciplinas.length === 0 && (
            <EmptyState icon={Layers} title="Nenhuma disciplina ainda" />
          )}

          <div className="space-y-3">
            {disciplinas.map((d, i) => (
              <div key={i} className="space-y-2 rounded-sm border p-3">
                <div className="flex items-center gap-2">
                  <Select value={d.nome} onValueChange={(v) => setDisc(i, { nome: v ?? "" })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogo.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDisciplinas((ds) => ds.filter((_, idx) => idx !== i))}
                    aria-label="Remover"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Prazo</Label>
                    <Input
                      type="date"
                      value={d.prazo}
                      onChange={(e) => setDisc(i, { prazo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Valor projetista (R$)</Label>
                    <Input
                      type="number"
                      value={d.valor}
                      onChange={(e) => setDisc(i, { valor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Responsáveis</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {internos.map((u) => {
                      const sel = d.responsaveisIds.includes(u.id);
                      return (
                        <button
                          type="button"
                          key={u.id}
                          onClick={() => toggleResp(i, u.id)}
                          className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                            sel
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {u.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Criando…" : "Criar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
