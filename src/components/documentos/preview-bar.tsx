"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Printer, Pencil, Save, FileDown, Ruler, Mail } from "lucide-react";
import { registrarDocumentoGerado, enviarDocumentoPorEmail } from "@/modules/documentos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ParamFonte } from "@/modules/documentos/fontes-meta";

export function PreviewBar({
  modeloId,
  nome,
  fonte,
  valores,
  opcoes,
}: {
  modeloId: string;
  nome: string;
  fonte: { id: string; label: string; params: ParamFonte[] } | null;
  valores: Record<string, string>;
  /** Opções dos selects por tipo de parâmetro (projeto, cliente, usuario, proposta, licitacao, holerite). */
  opcoes: Record<string, { id: string; label: string }[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [emailOpen, setEmailOpen] = useState(false);
  const [enviando, startEnvio] = useTransition();
  const [para, setPara] = useState("");
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");

  function setParam(id: string, valor: string) {
    const p = new URLSearchParams(valores);
    if (valor) p.set(id, valor);
    else p.delete(id);
    router.push(`/documentos/${modeloId}/preview?${p.toString()}`);
  }

  // Pode salvar a geração quando todos os parâmetros da fonte estão preenchidos.
  const podeSalvar = !fonte || fonte.params.every((p) => valores[p.id]);

  function salvarGeracao() {
    start(async () => {
      const r = await registrarDocumentoGerado({ modeloId, params: valores });
      if (r.ok) toast.success("Documento gerado salvo no histórico.");
      else toast.error(r.error);
    });
  }

  function enviarEmail() {
    if (!para.trim()) {
      toast.error("Informe o e-mail do destinatário.");
      return;
    }
    startEnvio(async () => {
      const r = await enviarDocumentoPorEmail({
        modeloId,
        params: valores,
        para: para.trim(),
        assunto: assunto.trim() || undefined,
        mensagem: mensagem.trim() || undefined,
      });
      if (r.ok) {
        toast.success(`Documento enviado para ${r.data.para}.`);
        setEmailOpen(false);
        setPara("");
        setAssunto("");
        setMensagem("");
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="doc-no-print flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="icon" render={<Link href="/documentos" aria-label="Voltar" />}>
        <ArrowLeft className="size-4" />
      </Button>
      <h2 className="text-lg font-bold tracking-tight">{nome}</h2>
      {fonte && <span className="text-xs text-muted-foreground">· {fonte.label}</span>}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {fonte?.params.map((p) => {
          if (p.tipo === "mes") {
            return (
              <Input
                key={p.id}
                type="month"
                className="w-44"
                value={valores[p.id] ?? ""}
                onChange={(e) => setParam(p.id, e.target.value)}
                aria-label={p.label}
              />
            );
          }
          const lista = opcoes[p.tipo] ?? [];
          return (
            <Select key={p.id} value={valores[p.id] ?? ""} onValueChange={(v) => setParam(p.id, v ?? "")}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={p.label} />
              </SelectTrigger>
              <SelectContent>
                {lista.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        <Button variant="ghost" size="sm" render={<Link href="/documentos/gerados" />}>
          Gerados
        </Button>
        <Button variant="outline" size="sm" render={<Link href={`/documentos/${modeloId}`} />}>
          <Pencil className="size-4" /> Editar
        </Button>
        <Button variant="outline" size="sm" onClick={salvarGeracao} disabled={pending || !podeSalvar}>
          <Save className="size-4" /> {pending ? "Salvando…" : "Salvar geração"}
        </Button>
        {podeSalvar && (
          <Button
            variant="outline"
            size="sm"
            render={
              <a
                href={`/api/documentos/${modeloId}/pdf?${new URLSearchParams(valores).toString()}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <FileDown className="size-4" /> Baixar PDF
          </Button>
        )}
        {podeSalvar && (
          <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>
            <Mail className="size-4" /> Enviar por e-mail
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={`/api/documentos/${modeloId}/dxf?${new URLSearchParams(valores).toString()}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <Ruler className="size-4" /> Baixar DXF
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir / PDF
        </Button>
      </div>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar documento por e-mail</DialogTitle>
            <DialogDescription>
              O PDF de “{nome}” será gerado e anexado à mensagem.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="email-para">Destinatário</Label>
              <Input
                id="email-para"
                type="email"
                placeholder="nome@empresa.com"
                value={para}
                onChange={(e) => setPara(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email-assunto">Assunto</Label>
              <Input
                id="email-assunto"
                placeholder={`Documento: ${nome}`}
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email-mensagem">Mensagem</Label>
              <textarea
                id="email-mensagem"
                rows={4}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                placeholder="Mensagem opcional para o corpo do e-mail…"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviarEmail} disabled={enviando}>
              <Mail className="size-4" /> {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
