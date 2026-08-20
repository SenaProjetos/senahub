"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  UserCheck,
  Archive,
  MessageSquarePlus,
  ExternalLink,
  Paperclip,
  Download,
  Trash2,
  FileText,
} from "lucide-react";
import {
  criarLead,
  editarLead,
  arquivarLead,
  converterLead,
  adicionarNotaLead,
  adicionarAnexoLead,
  removerAnexoLead,
  moverLead,
} from "@/modules/comercial/actions";
import type { LeadItem } from "@/modules/comercial/queries";
import { FollowUpDialog } from "./follow-up-dialog";
import { MotivoPerdaDialog, etapaEhPerdido } from "./motivo-perda-dialog";
import { NotasHistorico } from "./notas-historico";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Form = {
  nome: string;
  contato: string;
  email: string;
  telefone: string;
  origem: string;
  valorEstimado: string;
  etapaId: string;
  observacoes: string;
  parceiroId: string;
};

/** Sentinela pro Select de parceiro (base-ui não aceita value vazio) — F1.23a. */
const SEM_PARCEIRO = "nenhum";

export function LeadDialog({
  lead,
  open,
  onOpenChange,
  etapas,
  parceiros,
}: {
  lead: LeadItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  etapas: { id: string; nome: string }[];
  parceiros: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const vazio: Form = {
    nome: "",
    contato: "",
    email: "",
    telefone: "",
    origem: "",
    valorEstimado: "",
    etapaId: etapas[0]?.id ?? "",
    observacoes: "",
    parceiroId: SEM_PARCEIRO,
  };
  const deLead = (l: LeadItem): Form => ({
    nome: l.nome,
    contato: l.contato ?? "",
    email: l.email ?? "",
    telefone: l.telefone ?? "",
    origem: l.origem ?? "",
    valorEstimado: l.valorEstimado != null ? String(Number(l.valorEstimado)) : "",
    etapaId: l.etapaId,
    observacoes: l.observacoes ?? "",
    parceiroId: l.parceiro?.id ?? SEM_PARCEIRO,
  });
  const [form, setForm] = useState<Form>(lead ? deLead(lead) : vazio);
  const [nota, setNota] = useState("");
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const key = lead?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(lead ? deLead(lead) : vazio);
    setNota("");
  }

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /** Salva os campos do lead. Quando informado, grava também o motivo da perda. */
  function persistir(motivoPerda?: string) {
    const payload = {
      nome: form.nome,
      contato: form.contato,
      email: form.email,
      telefone: form.telefone,
      origem: form.origem,
      valorEstimado: form.valorEstimado ? Number(form.valorEstimado) : undefined,
      etapaId: form.etapaId,
      observacoes: form.observacoes,
      parceiroId: form.parceiroId === SEM_PARCEIRO ? "" : form.parceiroId,
    };
    start(async () => {
      if (!lead) {
        const r = await criarLead(payload);
        if (r.ok) {
          toast.success("Lead criado.");
          onOpenChange(false);
          router.refresh();
        } else toast.error(r.error);
        return;
      }
      // Edita os campos; etapa (e motivo da perda) via moverLead se mudou.
      const r = await editarLead({ ...payload, id: lead.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (form.etapaId !== lead.etapaId) {
        const m = await moverLead({ id: lead.id, etapaId: form.etapaId, motivoPerda });
        if (!m.ok) {
          toast.error(m.error);
          return;
        }
      }
      toast.success("Lead atualizado.");
      onOpenChange(false);
      router.refresh();
    });
  }

  function salvar() {
    // Mudando para "Perdido" exige motivo antes de concluir.
    if (lead && form.etapaId !== lead.etapaId) {
      const destino = etapas.find((e) => e.id === form.etapaId);
      if (destino && etapaEhPerdido(destino.nome)) {
        setPedirMotivo(true);
        return;
      }
    }
    persistir();
  }

  function converter() {
    if (!lead) return;
    start(async () => {
      const r = await converterLead({ id: lead.id });
      if (r.ok) {
        toast.success("Lead convertido em cliente.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function arquivar() {
    if (!lead) return;
    start(async () => {
      const r = await arquivarLead({ id: lead.id });
      if (r.ok) {
        toast.success("Lead arquivado.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function addNota() {
    if (!lead || !nota.trim()) return;
    start(async () => {
      const r = await adicionarNotaLead({ leadId: lead.id, nota });
      if (r.ok) {
        toast.success("Nota registrada.");
        setNota("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? lead.nome : "Novo lead"}</DialogTitle>
          {lead && (
            <Link
              href={`/comercial/${lead.id}`}
              className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <ExternalLink className="size-3" /> Abrir página
            </Link>
          )}
        </DialogHeader>

        <div className="space-y-3">
          {lead?.motivoPerda &&
            etapaEhPerdido(etapas.find((e) => e.id === lead.etapaId)?.nome ?? "") && (
              <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-2.5 text-sm">
                <p className="text-xs font-semibold text-destructive">Motivo da perda</p>
                <p className="whitespace-pre-wrap">{lead.motivoPerda}</p>
              </div>
            )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome / empresa</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={form.etapaId} onValueChange={(v) => set("etapaId", v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Input value={form.contato} onChange={(e) => set("contato", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor estimado (R$)</Label>
              <Input
                type="number"
                value={form.valorEstimado}
                onChange={(e) => set("valorEstimado", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Input
                value={form.origem}
                onChange={(e) => set("origem", e.target.value)}
                placeholder="indicação, site…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parceiro (indicação)</Label>
              <Select
                value={form.parceiroId}
                onValueChange={(v) => set("parceiroId", v ?? SEM_PARCEIRO)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PARCEIRO}>Sem parceiro</SelectItem>
                  {parceiros.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <textarea
              rows={4}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
            />
          </div>

          {lead && <LeadAnexos leadId={lead.id} anexos={lead.anexos} />}

          {lead && (
            <div className="space-y-2 rounded-sm border border-dashed p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Atividades</Label>
                <FollowUpDialog leadId={lead.id} leadNome={lead.nome} leadEmail={lead.email} />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Nova nota…"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNota()}
                />
                <Button size="sm" variant="outline" onClick={addNota} disabled={pending}>
                  <MessageSquarePlus className="size-3.5" />
                </Button>
              </div>
              <NotasHistorico atividades={lead.atividades} className="max-h-60 overflow-y-auto" />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {lead && !lead.cliente && (
              <Button variant="outline" size="sm" onClick={converter} disabled={pending}>
                <UserCheck className="size-3.5" /> Virar cliente
              </Button>
            )}
            {lead && (
              <Button variant="ghost" size="sm" onClick={arquivar} disabled={pending}>
                <Archive className="size-3.5" /> Arquivar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending || !form.nome}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <MotivoPerdaDialog
        open={pedirMotivo}
        leadNome={form.nome}
        onOpenChange={setPedirMotivo}
        onConfirmar={(motivo) => {
          setPedirMotivo(false);
          persistir(motivo);
        }}
      />
    </Dialog>
  );
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Anexos do lead (proposta, e-mail de solicitação da arquitetura, referências).
 * Envia pela rota multipart `/api/comercial/anexos` → `adicionarAnexoLead`.
 */
function LeadAnexos({ leadId, anexos }: { leadId: string; anexos: LeadItem["anexos"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Selecione um arquivo.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/comercial/anexos", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await adicionarAnexoLead({ leadId, meta });
      if (r.ok) {
        toast.success("Anexo adicionado.");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function rm(id: string) {
    start(async () => {
      const r = await removerAnexoLead({ id });
      if (r.ok) {
        toast.success("Anexo removido.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2 rounded-sm border border-dashed p-3">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="size-3.5" /> Anexos ({anexos.length})
      </Label>
      {anexos.length > 0 && (
        <ul className="divide-y text-sm">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate" title={a.nomeArquivo}>{a.nome}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span>
              </span>
              <span className="flex shrink-0 items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Baixar anexo"
                  render={<a href={`/api/comercial/anexos/${a.id}/download`} />}
                >
                  <Download className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover anexo"
                  onClick={() => rm(a.id)}
                  disabled={pending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input ref={fileRef} type="file" className="min-w-32 flex-1" />
        <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
          <Paperclip className="size-3.5" /> {busy ? "Enviando…" : "Anexar"}
        </Button>
      </div>
    </div>
  );
}
