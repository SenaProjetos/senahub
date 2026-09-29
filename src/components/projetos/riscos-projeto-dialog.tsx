"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { criarRisco, atualizarRisco, excluirRisco } from "@/modules/projetos/riscos/actions";
import {
  GRAU_RISCO_LABEL,
  NIVEL_RISCO_LABEL,
  STATUS_RISCO,
  STATUS_RISCO_LABEL,
  nivelRisco,
  type StatusRisco,
} from "@/modules/projetos/riscos/regras";
import { NIVEL_RISCO_VISUAL } from "@/components/projetos/riscos-visual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type RiscoProjeto = {
  id: string;
  descricao: string;
  probabilidade: number;
  impacto: number;
  mitigacao: string | null;
  status: string;
};

/**
 * Registro de riscos do projeto, aberto pelo "Ver todos" do painel da Visão Geral (antes ficava
 * na aba Extras). Lista inteira na ordem do painel; quem gerencia o projeto registra, edita
 * (inclusive o plano de mitigação e a situação) e exclui.
 */
export function RiscosProjetoDialog({
  projetoId,
  riscos,
  podeGerir,
}: {
  projetoId: string;
  riscos: RiscoProjeto[];
  podeGerir: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  if (riscos.length === 0 && !podeGerir) return null;

  function mudarAberto(v: boolean) {
    setAberto(v);
    if (!v) setEditando(null);
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
            onClick={() => setEditando(riscos.length === 0 ? "novo" : null)}
          />
        }
      >
        {riscos.length > 0 ? `Ver todos (${riscos.length})` : "Registrar risco"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Riscos do projeto</DialogTitle>
          <DialogDescription>
            Probabilidade e impacto de baixo a alto. Os abertos vêm primeiro, do mais grave ao mais leve.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {podeGerir &&
            (editando === "novo" ? (
              <RiscoForm projetoId={projetoId} aoTerminar={() => setEditando(null)} />
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditando("novo")}>
                <Plus className="size-3.5" /> Novo risco
              </Button>
            ))}

          {riscos.length === 0 && editando !== "novo" && (
            <EmptyState icon={ShieldAlert} title="Nenhum risco registrado" />
          )}

          <ul className="space-y-2">
            {riscos.map((risco) =>
              editando === risco.id ? (
                <li key={risco.id}>
                  <RiscoForm projetoId={projetoId} risco={risco} aoTerminar={() => setEditando(null)} />
                </li>
              ) : (
                <LinhaRisco
                  key={risco.id}
                  risco={risco}
                  podeGerir={podeGerir}
                  aoEditar={() => setEditando(risco.id)}
                />
              ),
            )}
          </ul>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function LinhaRisco({ risco, podeGerir, aoEditar }: { risco: RiscoProjeto; podeGerir: boolean; aoEditar: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const nivel = nivelRisco(risco.probabilidade, risco.impacto);
  const encerrado = risco.status !== "aberto";

  async function excluir() {
    const ok = await confirm({
      title: "Excluir este risco?",
      description: `"${risco.descricao}" sai do registro do projeto. A exclusão fica no histórico de auditoria.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirRisco({ riscoId: risco.id });
      if (r.ok) {
        toast.success("Risco excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <li className={cn("rounded-md border border-l-2 p-3 text-sm", NIVEL_RISCO_VISUAL[nivel].borda)}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn("min-w-0 font-medium", encerrado && "text-muted-foreground line-through")}>{risco.descricao}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline" className={cn("h-5 text-[10px]", NIVEL_RISCO_VISUAL[nivel].badge)}>
            {NIVEL_RISCO_LABEL[nivel]}
          </Badge>
          {podeGerir && (
            <>
              <Button size="icon-sm" variant="ghost" aria-label="Editar risco" onClick={aoEditar} disabled={pending}>
                <Pencil className="size-3.5" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Excluir risco" onClick={excluir} disabled={pending}>
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {STATUS_RISCO_LABEL[risco.status as StatusRisco] ?? risco.status} · Probabilidade:{" "}
        {GRAU_RISCO_LABEL[risco.probabilidade]} · Impacto: {GRAU_RISCO_LABEL[risco.impacto]}
      </p>
      <p className={cn("mt-1.5 text-xs", risco.mitigacao ? "text-foreground" : "text-muted-foreground italic")}>
        {risco.mitigacao ? `Mitigação: ${risco.mitigacao}` : "Sem plano de mitigação."}
      </p>
    </li>
  );
}

function RiscoForm({
  projetoId,
  risco,
  aoTerminar,
}: {
  projetoId: string;
  risco?: RiscoProjeto;
  aoTerminar: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [descricao, setDescricao] = useState(risco?.descricao ?? "");
  const [probabilidade, setProbabilidade] = useState(String(risco?.probabilidade ?? 1));
  const [impacto, setImpacto] = useState(String(risco?.impacto ?? 1));
  const [status, setStatus] = useState<StatusRisco>((risco?.status as StatusRisco) ?? "aberto");
  const [mitigacao, setMitigacao] = useState(risco?.mitigacao ?? "");
  const prefixo = risco ? `risco-${risco.id}` : "risco-novo";

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const campos = {
      descricao,
      probabilidade: Number(probabilidade),
      impacto: Number(impacto),
      mitigacao,
    };
    start(async () => {
      const r = risco
        ? await atualizarRisco({ riscoId: risco.id, ...campos, status })
        : await criarRisco({ projetoId, ...campos });
      if (r.ok) {
        toast.success(risco ? "Risco atualizado." : "Risco registrado.");
        router.refresh();
        aoTerminar();
      } else toast.error(r.error);
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixo}-descricao`}>Risco</Label>
        <Input
          id={`${prefixo}-descricao`}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: atraso na aprovação da prefeitura"
          autoFocus
        />
      </div>
      <div className={cn("grid gap-3", risco ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <div className="space-y-1.5">
          <Label>Probabilidade</Label>
          <Select value={probabilidade} onValueChange={(v) => v && setProbabilidade(v)}>
            <SelectTrigger className="w-full" aria-label="Probabilidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {GRAU_RISCO_LABEL[n]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Impacto</Label>
          <Select value={impacto} onValueChange={(v) => v && setImpacto(v)}>
            <SelectTrigger className="w-full" aria-label="Impacto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {GRAU_RISCO_LABEL[n]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {risco && (
          <div className="space-y-1.5">
            <Label>Situação</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v as StatusRisco)}>
              <SelectTrigger className="w-full" aria-label="Situação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_RISCO.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_RISCO_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixo}-mitigacao`}>Plano de mitigação</Label>
        <textarea
          id={`${prefixo}-mitigacao`}
          value={mitigacao}
          onChange={(e) => setMitigacao(e.target.value)}
          rows={3}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="O que será feito para evitar ou reduzir o risco"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={aoTerminar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending || !descricao.trim()}>
          {risco ? "Salvar" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
