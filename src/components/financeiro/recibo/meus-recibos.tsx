"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Download, FileText, PenLine, Upload } from "lucide-react";
import { assinarRecibo } from "@/modules/financeiro/recibo/actions";
import type { ReciboItem } from "@/modules/financeiro/recibo/queries";
import { competenciaRecibo } from "@/modules/financeiro/recibo/service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { brl, formatarData } from "@/lib/utils";

const TONE_NF: Record<string, "success" | "warning" | "danger"> = {
  aprovada: "success",
  enviada: "warning",
  rejeitada: "danger",
};

/**
 * Recibos do próprio projetista (G5/D36): ler o texto, assinar, baixar o PDF e — para PJ —
 * anexar a(s) NF(s) daquele recibo.
 *
 * A assinatura é o aceite do texto EXATO mostrado aqui; por isso o texto fica visível na
 * própria tela (expansível), e não só dentro do PDF.
 */
export function MeusRecibos({ recibos, podeEnviarNf }: { recibos: ReciboItem[]; podeEnviarNf: boolean }) {
  const [nfDe, setNfDe] = useState<ReciboItem | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recibos</CardTitle>
        <CardDescription>
          Recibos dos pagamentos já efetivados. Assinar é a sua confirmação de que recebeu os valores listados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {recibos.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhum recibo por enquanto." />
        ) : (
          <div className="divide-y">
            {recibos.map((r) => (
              <LinhaRecibo key={r.id} recibo={r} podeEnviarNf={podeEnviarNf} onEnviarNf={() => setNfDe(r)} />
            ))}
          </div>
        )}
      </CardContent>

      <EnviarNfDialog recibo={nfDe} onClose={() => setNfDe(null)} />
    </Card>
  );
}

function LinhaRecibo({
  recibo,
  podeEnviarNf,
  onEnviarNf,
}: {
  recibo: ReciboItem;
  podeEnviarNf: boolean;
  onEnviarNf: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const competencia = competenciaRecibo(recibo.ano, recibo.mes);
  const rotulo = recibo.tipo === "mensal" ? `Recibo de ${competencia ?? "—"}` : "Recibo de entrega";

  async function assinar() {
    const ok = await confirm({
      title: "Assinar recibo",
      description:
        "Ao assinar, você declara que recebeu os valores listados neste recibo. Ficam registrados seu nome, a data e a hora.",
      confirmLabel: "Assinar",
    });
    if (!ok) return;
    start(async () => {
      const r = await assinarRecibo({ id: recibo.id });
      if (r.ok) {
        toast.success("Recibo assinado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Collapsible className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <CollapsibleTrigger className="group/recibo flex flex-1 items-center gap-2 text-left">
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]/recibo:rotate-180"
          />
          <span className="font-medium">{rotulo}</span>
          <span className="font-mono text-sm">{brl(recibo.valor)}</span>
          <span className="text-xs text-muted-foreground">
            {recibo.itens.length === 1 ? "1 entrega" : `${recibo.itens.length} entregas`}
          </span>
        </CollapsibleTrigger>

        {recibo.assinadoEm ? (
          <StatusBadge tone="success">Assinado em {formatarData(recibo.assinadoEm)}</StatusBadge>
        ) : (
          <StatusBadge tone="warning">A assinar</StatusBadge>
        )}

        {!recibo.assinadoEm && (
          <Button size="sm" onClick={assinar} disabled={pending}>
            <PenLine className="size-3.5" /> Assinar
          </Button>
        )}
        <Button size="sm" variant="outline" render={<a href={`/api/financeiro/recibos/${recibo.id}/pdf`} />}>
          <Download className="size-3.5" /> PDF
        </Button>
        {podeEnviarNf && (
          <Button size="sm" variant="outline" onClick={onEnviarNf}>
            <Upload className="size-3.5" /> Enviar NF
          </Button>
        )}
      </div>

      <CollapsiblePanel>
        <div className="mt-2 space-y-3 border-t pt-2">
          {/* O texto assinável, como está gravado — é o que a assinatura cobre. */}
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-sm bg-muted/40 p-3 font-mono text-xs">
            {recibo.texto}
          </pre>
          <div>
            <p className="text-xs font-medium">Notas fiscais deste recibo</p>
            {recibo.notas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma NF enviada.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs">
                {recibo.notas.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{n.numero ? `NF ${n.numero}` : n.arquivoNome}</span>
                    <span className="text-muted-foreground">{brl(n.valor)}</span>
                    <StatusBadge tone={TONE_NF[n.status] ?? "neutral"}>{n.status}</StatusBadge>
                    <span className="text-muted-foreground">{formatarData(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Código de verificação (SHA-256): <span className="break-all font-mono">{recibo.textoHash}</span>
          </p>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/**
 * Envio da NF amarrada ao recibo. Reusa a rota que o PJ já usa para mandar nota
 * (`/api/rh/nf`, multipart) — só passa `reciboId` junto; o RH continua validando por lá.
 */
function EnviarNfDialog({ recibo, onClose }: { recibo: ReciboItem | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [numero, setNumero] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file || !recibo) {
      toast.error("Escolha o arquivo da NF.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Valor da NF = valor do recibo: é a nota daquelas entregas, não um valor solto.
      fd.append("valor", String(recibo.valor));
      fd.append("numero", numero);
      fd.append("reciboId", recibo.id);
      const res = await fetch("/api/rh/nf", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha no envio.");
      toast.success("NF enviada — o RH foi avisado.");
      setNumero("");
      onClose();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!recibo} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Enviar NF do recibo</DialogTitle>
          <DialogDescription>
            {recibo && (
              <>
                {competenciaRecibo(recibo.ano, recibo.mes) ?? "Entrega avulsa"} — {brl(recibo.valor)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nf-numero">Número da NF</Label>
            <Input id="nf-numero" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nf-arquivo">Arquivo</Label>
            <Input id="nf-arquivo" ref={fileRef} type="file" disabled={busy} />
          </div>
          <p className="text-xs text-muted-foreground">
            O valor enviado é o do recibo ({recibo ? brl(recibo.valor) : "—"}). Mais de uma NF pode ser enviada para o
            mesmo recibo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={busy}>
            {busy ? "Enviando…" : "Enviar NF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
