"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { editarProjeto } from "@/modules/projetos/actions";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
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

type ProjetoEditavel = {
  id: string;
  nome: string;
  tipo: "particular" | "licitacao" | "aprovacao";
  situacao: "em_andamento" | "concluido" | "arquivado" | "cancelado";
  descricao: string | null;
  areaM2: number | null;
  endereco: string | null;
  prazoFinal: string | null; // ISO date (yyyy-mm-dd)
  valorContrato: number | null;
  clienteId: string;
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
  const [valorContrato, setValorContrato] = useState(
    projeto.valorContrato != null ? String(projeto.valorContrato) : "",
  );

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
    setValorContrato(projeto.valorContrato != null ? String(projeto.valorContrato) : "");
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
        valorContrato: valorContrato ? Number(valorContrato) : undefined,
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
                <Input
                  type="number"
                  value={valorContrato}
                  onChange={(e) => setValorContrato(e.target.value)}
                />
              </div>
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
