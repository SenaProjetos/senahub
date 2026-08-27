"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { editarProjeto } from "@/modules/projetos/actions";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { ABA_LABEL, abasParaEdicao, type AbaConfigItem } from "@/modules/projetos/abas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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

type ProjetoEditavel = {
  id: string;
  nome: string;
  tipo: "particular" | "licitacao" | "aprovacao" | "laudo";
  situacao: "em_andamento" | "concluido" | "arquivado" | "cancelado";
  descricao: string | null;
  areaM2: number | null;
  endereco: string | null;
  prazoFinal: string | null; // ISO date (yyyy-mm-dd)
  valorContrato: number | null;
  clienteId: string;
  abasConfig: AbaConfigItem[] | null;
};

/** Item 12 (beta): editar todas as informações do projeto, não só o nome. */
export function EditarProjetoDialog({
  projeto,
  clientes,
}: {
  projeto: ProjetoEditavel;
  clientes: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [nome, setNome] = useState(projeto.nome);
  const [tipo, setTipo] = useState(projeto.tipo);
  const [situacao, setSituacao] = useState(projeto.situacao);
  const [clienteId, setClienteId] = useState(projeto.clienteId);
  const [descricao, setDescricao] = useState(projeto.descricao ?? "");
  const [areaM2, setAreaM2] = useState(projeto.areaM2 != null ? String(projeto.areaM2) : "");
  const [endereco, setEndereco] = useState(projeto.endereco ?? "");
  const [prazoFinal, setPrazoFinal] = useState(projeto.prazoFinal ?? "");
  const [valorContrato, setValorContrato] = useState<number | null>(projeto.valorContrato ?? null);
  const [abas, setAbas] = useState<AbaConfigItem[]>(() => abasParaEdicao(projeto.abasConfig));

  function moverAba(i: number, direcao: -1 | 1) {
    setAbas((atual) => {
      const j = i + direcao;
      if (j < 0 || j >= atual.length) return atual;
      const nova = atual.slice();
      [nova[i], nova[j]] = [nova[j], nova[i]];
      return nova;
    });
  }

  function alternarOculta(i: number) {
    setAbas((atual) => atual.map((a, idx) => (idx === i ? { ...a, oculta: !a.oculta } : a)));
  }

  function abrir() {
    // Reseta para os valores atuais do projeto a cada abertura.
    setNome(projeto.nome);
    setTipo(projeto.tipo);
    setSituacao(projeto.situacao);
    setClienteId(projeto.clienteId);
    setDescricao(projeto.descricao ?? "");
    setAreaM2(projeto.areaM2 != null ? String(projeto.areaM2) : "");
    setEndereco(projeto.endereco ?? "");
    setPrazoFinal(projeto.prazoFinal ?? "");
    setValorContrato(projeto.valorContrato ?? null);
    setAbas(abasParaEdicao(projeto.abasConfig));
    setOpen(true);
  }

  function salvar() {
    if (!nome.trim()) {
      toast.error("Informe o nome do projeto.");
      return;
    }
    start(async () => {
      const res = await editarProjeto({
        id: projeto.id,
        clienteId,
        nome,
        tipo,
        situacao,
        descricao: descricao || undefined,
        areaM2: areaM2 ? Number(areaM2) : undefined,
        endereco: endereco || undefined,
        prazoFinal: prazoFinal || undefined,
        valorContrato: valorContrato ?? undefined,
        abasConfig: abas,
      });
      if (res.ok) {
        toast.success("Projeto atualizado.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>
        <Pencil className="size-4" /> Editar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar projeto</DialogTitle>
            <DialogDescription>O código do projeto não pode ser alterado.</DialogDescription>
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
                <Label>Situação</Label>
                <Select value={situacao} onValueChange={(v) => v && setSituacao(v as typeof situacao)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SITUACAO_PROJETO_LABEL).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
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

            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clienteId} onValueChange={(v) => v && setClienteId(v)}>
                <SelectTrigger>
                  <SelectValue />
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

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Endereço</Label>
              <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Área (m²)</Label>
                <Input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo final</Label>
                <Input type="date" value={prazoFinal} onChange={(e) => setPrazoFinal(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor de contrato (R$)</Label>
                <InputMoeda value={valorContrato} onChange={setValorContrato} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Abas do projeto</Label>
              <p className="text-xs text-muted-foreground">
                Ordem de exibição e visibilidade das abas — Visão Geral fica sempre fixa primeiro.
              </p>
              <ul className="divide-y rounded-lg border">
                {abas.map((a, i) => (
                  <li
                    key={a.suffix}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 text-sm",
                      a.oculta && "text-muted-foreground",
                    )}
                  >
                    <div className="flex flex-col">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-5"
                        disabled={i === 0}
                        onClick={() => moverAba(i, -1)}
                        aria-label={`Mover ${ABA_LABEL[a.suffix]} para cima`}
                      >
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-5"
                        disabled={i === abas.length - 1}
                        onClick={() => moverAba(i, 1)}
                        aria-label={`Mover ${ABA_LABEL[a.suffix]} para baixo`}
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </div>
                    <span className={cn("flex-1", a.oculta && "italic")}>{ABA_LABEL[a.suffix]}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => alternarOculta(i)}
                    >
                      {a.oculta ? (
                        <>
                          <EyeOff className="size-3.5" /> Oculta
                        </>
                      ) : (
                        <>
                          <Eye className="size-3.5" /> Visível
                        </>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
