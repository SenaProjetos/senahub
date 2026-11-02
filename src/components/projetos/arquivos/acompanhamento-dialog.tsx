"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { enviarAcompanhamentoProjeto } from "@/modules/projetos/acompanhamento/actions";
import type { AcompanhamentoParaTela } from "@/modules/projetos/acompanhamento/queries";
import { EVENTO_ARQUIVOS } from "@/components/projetos/arquivos/menu-arquivos";
import { useAbrirPorEvento } from "@/lib/use-abrir-por-evento";
import { formatarDataHora } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputFormatado } from "@/components/ui/input-formatado";
import { Label } from "@/components/ui/label";
import { useFieldErrors } from "@/lib/use-field-errors";

/**
 * "E-mail de acompanhamento" (Lote 3): monta e envia ao cliente o que já foi enviado a ele, na mesma conversa
 * de e-mail de antes. Abre pelo ⋯ de Arquivos (evento), como os outros diálogos do projeto.
 */
export function AcompanhamentoDialog({ projetoId, dados }: { projetoId: string; dados: AcompanhamentoParaTela }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const fe = useFieldErrors({ destinatarios: "acomp-extra", observacao: "acomp-obs" });
  const limparErros = fe.limpar;
  const [contatos, setContatos] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [itens, setItens] = useState<Set<string>>(new Set());
  const [observacao, setObservacao] = useState("");
  const [copia, setCopia] = useState(true);

  const abrir = useCallback(() => {
    // Abre sempre do zero: o primeiro contato (o principal) e o que é novo desde o último e-mail já marcados.
    setContatos(new Set(dados.contatos.slice(0, 1).map((c) => c.id)));
    setExtra("");
    setItens(new Set(dados.itens.filter((i) => i.novo).map((i) => i.revisaoId)));
    setObservacao("");
    setCopia(true);
    limparErros();
    setAberto(true);
  }, [dados, limparErros]);
  useAbrirPorEvento(EVENTO_ARQUIVOS.acompanhamento, abrir);

  const alternar = (set: Set<string>, id: string, marcar: (s: Set<string>) => void) => {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    marcar(novo);
  };
  const emails = [...dados.contatos.filter((c) => contatos.has(c.id)).map((c) => c.email), ...(extra.trim() ? [extra.trim()] : [])];
  const podeEnviar = dados.smtp && emails.length > 0 && itens.size > 0 && !pending;

  async function enviar() {
    const ok = await confirm({
      title: "Enviar o e-mail de acompanhamento?",
      description: `Vai para ${emails.length} destinatário(s), listando ${itens.size} revisão(ões). O e-mail sai agora e fica registrado no projeto.`,
      confirmLabel: "Enviar",
    });
    if (!ok) return;
    start(async () => {
      const r = await enviarAcompanhamentoProjeto({
        projetoId,
        destinatarios: emails,
        revisaoIds: [...itens],
        observacao: observacao.trim() || undefined,
        copiaParaMim: copia,
      });
      if (r.ok) {
        toast.success(`E-mail enviado para ${r.data.destinatarios.length} destinatário(s).`);
        setAberto(false);
        router.refresh();
      } else if (!fe.registrar(r)) {
        toast.error(r.error);
      }
    });
  }

  const novos = dados.itens.filter((i) => i.novo);
  const anteriores = dados.itens.filter((i) => !i.novo);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>E-mail de acompanhamento</DialogTitle>
          <DialogDescription>
            Avisa o cliente{dados.cliente ? ` (${dados.cliente})` : ""} do que já foi enviado a ele. Cada envio continua a conversa
            anterior na caixa dele.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!dados.smtp && (
            <p role="alert" className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              O envio de e-mail não está configurado neste servidor (SMTP). Peça a quem administra o sistema.
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Destinatários</legend>
            {dados.contatos.length === 0 && (
              <p className="text-xs text-muted-foreground">O cliente do projeto não tem contato com e-mail. Digite um abaixo.</p>
            )}
            {dados.contatos.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={contatos.has(c.id)} onCheckedChange={() => alternar(contatos, c.id, setContatos)} />
                <span>{c.nome}</span>
                <span className="text-xs text-muted-foreground">{c.email}</span>
              </label>
            ))}
            <div className="space-y-1">
              <Label htmlFor="acomp-extra">Outro e-mail</Label>
              <InputFormatado
                id="acomp-extra"
                tipo="email"
                value={extra}
                erro={fe.erros.destinatarios}
                onChange={(v) => {
                  fe.limpar("destinatarios");
                  setExtra(v);
                }}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">O que vai na lista</legend>
            {dados.itens.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhuma revisão está marcada como “Enviado ao cliente” neste projeto. Marque no menu da revisão antes de enviar.
              </p>
            )}
            {novos.length > 0 && <p className="text-xs text-muted-foreground">Novos desde o último e-mail</p>}
            {novos.map((i) => (
              <label key={i.revisaoId} className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={itens.has(i.revisaoId)} onCheckedChange={() => alternar(itens, i.revisaoId, setItens)} />
                <span>{i.rotulo}</span>
              </label>
            ))}
            {anteriores.length > 0 && <p className="pt-1 text-xs text-muted-foreground">Já enviados antes</p>}
            {anteriores.map((i) => (
              <label key={i.revisaoId} className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={itens.has(i.revisaoId)} onCheckedChange={() => alternar(itens, i.revisaoId, setItens)} />
                <span className="text-muted-foreground">{i.rotulo}</span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="acomp-obs">Observação (opcional)</Label>
            <textarea
              id="acomp-obs"
              rows={3}
              maxLength={1000}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={observacao}
              onChange={(e) => {
                fe.limpar("observacao");
                setObservacao(e.target.value);
              }}
              aria-invalid={fe.erros.observacao ? true : undefined}
            />
            {fe.erros.observacao && <p className="text-xs text-destructive">{fe.erros.observacao}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={copia} onCheckedChange={(v) => setCopia(v === true)} />
            Receber uma cópia (Cco). As respostas do cliente também chegam para você.
          </label>

          {dados.historico.length > 0 && (
            <CollapsibleSection titulo="Envios anteriores" resumo={`${dados.historico.length}`}>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {dados.historico.map((h) => (
                  <li key={h.id}>
                    {formatarDataHora(h.enviadoEm)} · {h.enviadoPor ?? "—"} · {h.itens} revisão(ões) · {h.destinatarios.join(", ")}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button disabled={!podeEnviar} onClick={() => void enviar()}>
            <Send className="size-3.5" /> {pending ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
