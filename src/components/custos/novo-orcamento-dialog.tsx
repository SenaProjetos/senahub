"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import {
  criarOrcamento,
  listarProjetosParaOrcamento,
  listarClientesParaOrcamento,
} from "@/modules/custos/actions";

type ProjetoOpcao = { id: string; codigo: string; nome: string };
type ClienteOpcao = { id: string; nome: string };

const ORIGEM_PROJETO = "projeto";
const ORIGEM_AVULSO = "avulso";

const VAZIO = {
  titulo: "",
  projetoId: "",
  nomeAvulso: "",
  contratanteId: "",
  contratanteNome: "",
  dataBase: new Date().toISOString().slice(0, 10),
};

export function NovoOrcamentoDialog({ projetoFixo }: { projetoFixo?: ProjetoOpcao }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [origem, setOrigem] = useState(projetoFixo ? ORIGEM_PROJETO : ORIGEM_PROJETO);
  const [form, setForm] = useState(VAZIO);
  const [projetos, setProjetos] = useState<ProjetoOpcao[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);

  useEffect(() => {
    if (!open || projetoFixo) return;
    listarProjetosParaOrcamento({}).then((r) => {
      if (r.ok) setProjetos(r.data);
    });
  }, [open, projetoFixo]);

  useEffect(() => {
    if (!open) return;
    listarClientesParaOrcamento({}).then((r) => {
      if (r.ok) setClientes(r.data);
    });
  }, [open]);

  function set<K extends keyof typeof VAZIO>(campo: K, valor: (typeof VAZIO)[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function fechar() {
    setOpen(false);
    setForm(VAZIO);
    setOrigem(projetoFixo ? ORIGEM_PROJETO : ORIGEM_PROJETO);
  }

  function salvar() {
    if (!form.titulo.trim()) {
      toast.error("Informe um título.");
      return;
    }
    const projetoId = projetoFixo?.id || (origem === ORIGEM_PROJETO ? form.projetoId : "");
    const nomeAvulso = origem === ORIGEM_AVULSO ? form.nomeAvulso.trim() : "";
    if (!projetoId && !nomeAvulso) {
      toast.error(origem === ORIGEM_PROJETO ? "Escolha um projeto." : "Informe o nome do orçamento avulso.");
      return;
    }
    startTransition(async () => {
      const r = await criarOrcamento({
        titulo: form.titulo.trim(),
        projetoId,
        nomeAvulso,
        contratanteId: form.contratanteId,
        contratanteNome: form.contratanteNome.trim(),
        dataBase: form.dataBase,
      });
      if (r.ok) {
        toast.success("Orçamento criado.");
        fechar();
        router.push(`/custos/${r.data.id}`);
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : fechar())}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Novo orçamento
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo orçamento</DialogTitle>
          <DialogDescription>Vincule a um projeto existente ou crie um estudo avulso.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="orc-titulo">Título</Label>
            <Input
              id="orc-titulo"
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex.: Orçamento — Edifício Alfa"
              autoFocus
            />
          </div>

          {!projetoFixo && (
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={origem} onValueChange={(v) => v && setOrigem(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ORIGEM_PROJETO}>Vinculado a um projeto</SelectItem>
                  <SelectItem value={ORIGEM_AVULSO}>Estudo avulso (sem projeto)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {!projetoFixo && origem === ORIGEM_PROJETO && (
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={form.projetoId} onValueChange={(v) => set("projetoId", v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.codigo} — {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!projetoFixo && origem === ORIGEM_AVULSO && (
            <div className="space-y-1.5">
              <Label htmlFor="orc-avulso">Nome do estudo</Label>
              <Input
                id="orc-avulso"
                value={form.nomeAvulso}
                onChange={(e) => set("nomeAvulso", e.target.value)}
                placeholder="Ex.: Estudo preliminar — Cliente X"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Contratante (opcional, se diferente do cliente do projeto)</Label>
            <Select value={form.contratanteId} onValueChange={(v) => set("contratanteId", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orc-contratante-nome">Ou nome livre do contratante</Label>
            <Input
              id="orc-contratante-nome"
              value={form.contratanteNome}
              onChange={(e) => set("contratanteNome", e.target.value)}
              placeholder="Ex.: Prefeitura Municipal de…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orc-data-base">Data-base</Label>
            <Input
              id="orc-data-base"
              type="date"
              value={form.dataBase}
              onChange={(e) => set("dataBase", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Criando…" : "Criar orçamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
