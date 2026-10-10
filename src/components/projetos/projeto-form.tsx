"use client";

import type { Contratacao } from "@/generated/prisma/enums";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Layers } from "lucide-react";
import { criarProjeto } from "@/modules/projetos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { SeletorMultiplo } from "@/components/ui/seletor-multiplo";
import { opcoesDePessoas } from "@/components/ui/opcoes-pessoas";
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

type Interno = { id: string; name: string; contratacao: Contratacao | null };

const NAO_MONTAR = "__nao_montar";
type DiscDraft = { nome: string; prazo: string; valor: number | null; responsaveisIds: string[] };

export function ProjetoForm({
  open,
  onOpenChange,
  clientes,
  catalogo,
  internos,
  tiposEmpreendimento = [],
  modelosEap = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientes: { id: string; nome: string }[];
  catalogo: string[];
  internos: Interno[];
  /** D13: classifica o projeto e é o que sugere o modelo de EAP. Vazio = cadastro sem opções. */
  tiposEmpreendimento?: { id: string; nome: string }[];
  /** Modelos de EAP de projeto (reunião de 08/10/2026, item 7). Vazio = sem permissão no Planejamento. */
  modelosEap?: { id: string; nome: string; tipoEmpreendimentoId: string | null }[];
}) {
  const router = useRouter();
  const opcoesInternos = useMemo(() => opcoesDePessoas(internos), [internos]);
  const [pending, start] = useTransition();
  const [tipo, setTipo] = useState<"particular" | "licitacao" | "aprovacao" | "laudo">("particular");
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [prazoContrato, setPrazoContrato] = useState("");
  const [prazoPlanejado, setPrazoPlanejado] = useState("");
  const [valorContrato, setValorContrato] = useState<number | null>(null);
  const [tipoEmpreendimentoId, setTipoEmpreendimentoId] = useState("");
  // "" = não montar a EAP agora. Escolher o tipo pré-seleciona o modelo dele (a pessoa troca à vontade).
  const [modeloEapId, setModeloEapId] = useState("");
  const modelosOrdenados = useMemo(
    () =>
      [...modelosEap].sort(
        (a, b) =>
          Number(b.tipoEmpreendimentoId === tipoEmpreendimentoId && !!tipoEmpreendimentoId) -
          Number(a.tipoEmpreendimentoId === tipoEmpreendimentoId && !!tipoEmpreendimentoId),
      ),
    [modelosEap, tipoEmpreendimentoId],
  );

  function escolherTipo(id: string) {
    setTipoEmpreendimentoId(id);
    const doTipo = modelosEap.find((m) => m.tipoEmpreendimentoId === id);
    if (doTipo) setModeloEapId(doTipo.id);
  }
  const [disciplinas, setDisciplinas] = useState<DiscDraft[]>([]);

  function addDisciplina() {
    const usada = new Set(disciplinas.map((d) => d.nome));
    const proxima = catalogo.find((c) => !usada.has(c)) ?? catalogo[0] ?? "";
    setDisciplinas((d) => [...d, { nome: proxima, prazo: "", valor: null, responsaveisIds: [] }]);
  }

  function setDisc(i: number, patch: Partial<DiscDraft>) {
    setDisciplinas((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function salvar() {
    if (!nome || !clienteId) {
      toast.error("Informe nome e cliente.");
      return;
    }
    if (!prazoContrato) {
      toast.error("Informe o prazo de contrato.");
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
        prazoContrato,
        // Vazio = nasce igual ao contrato (o servidor faz a cópia).
        prazoPlanejado: prazoPlanejado || undefined,
        valorContrato: valorContrato ?? undefined,
        tipoEmpreendimentoId: tipoEmpreendimentoId || undefined,
        modeloEapId: modeloEapId || undefined,
        membrosIds: [],
        disciplinas: disciplinas.map((d) => ({
          nome: d.nome,
          prazo: d.prazo || undefined,
          valor: d.valor ?? undefined,
          responsaveisIds: d.responsaveisIds,
        })),
      });
      if (res.ok) {
        if (res.data.avisoModelo) {
          toast.warning(`Projeto ${res.data.codigo} criado, mas a EAP não foi montada: ${res.data.avisoModelo}`);
        } else {
          toast.success(modeloEapId ? `Projeto ${res.data.codigo} criado, com a EAP do modelo em rascunho.` : `Projeto ${res.data.codigo} criado.`);
        }
        onOpenChange(false);
        setNome("");
        setClienteId("");
        setAreaM2("");
        setPrazoContrato("");
        setPrazoPlanejado("");
        setValorContrato(null);
        setTipoEmpreendimentoId("");
        setModeloEapId("");
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
              <Select value={tipo} onValueChange={(v) => v && setTipo(v as typeof tipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular</SelectItem>
                  <SelectItem value="licitacao">Licitação</SelectItem>
                  <SelectItem value="aprovacao">Aprovação</SelectItem>
                  <SelectItem value="laudo">Laudo</SelectItem>
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

          {tiposEmpreendimento.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tipo de empreendimento</Label>
              <Select value={tipoEmpreendimentoId} onValueChange={(v) => escolherTipo(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {tiposEmpreendimento.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                É o que sugere o modelo de EAP no planejamento deste projeto.
              </p>
            </div>
          )}

          {modelosEap.length > 0 && (
            <div className="space-y-1.5">
              <Label>Montar a EAP com o modelo</Label>
              <Select value={modeloEapId || NAO_MONTAR} onValueChange={(v) => setModeloEapId(!v || v === NAO_MONTAR ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Não montar agora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NAO_MONTAR}>Não montar agora</SelectItem>
                  {modelosOrdenados.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                      {tipoEmpreendimentoId && m.tipoEmpreendimentoId === tipoEmpreendimentoId ? " · sugerido" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                A EAP nasce em rascunho, com as etapas de cada disciplina. Linhas de disciplina que o projeto não tem ficam de fora.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Área (m²)</Label>
              <Input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo de contrato *</Label>
              <Input type="date" value={prazoContrato} onChange={(e) => setPrazoContrato(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo planejado</Label>
              <Input
                type="date"
                value={prazoPlanejado}
                onChange={(e) => setPrazoPlanejado(e.target.value)}
                placeholder="Igual ao contrato"
              />
              <p className="text-xs text-muted-foreground">Em branco, acompanha o contrato.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Valor de contrato (R$)</Label>
            <InputMoeda
              value={valorContrato}
              onChange={setValorContrato}
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
                    <InputMoeda value={d.valor} onChange={(v) => setDisc(i, { valor: v })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Responsáveis</Label>
                  <SeletorMultiplo
                    opcoes={opcoesInternos}
                    selecionados={d.responsaveisIds}
                    onChange={(ids) => setDisc(i, { responsaveisIds: ids })}
                    placeholder="Buscar pessoa…"
                    rotuloBusca={`Buscar responsável de ${d.nome || "disciplina"}`}
                    vazio="Nenhuma pessoa encontrada."
                    rotuloContagem={(n) => (n === 1 ? "1 responsável" : `${n} responsáveis`)}
                    alturaLista="max-h-36"
                  />
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
