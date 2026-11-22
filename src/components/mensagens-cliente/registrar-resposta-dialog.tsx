"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { registrarRespostaPorFora } from "@/modules/portal/aprovacao-entrega/actions";
import {
  EXTENSOES_COMPROVANTE,
  NOME_POR_FORA_MAX,
  ROTULO_RESPOSTA,
  TAMANHO_MAX_COMPROVANTE_LABEL,
  TEXTO_MAX,
  motivoDoComprovante,
  type Resposta,
} from "@/modules/portal/aprovacao-entrega/regras";
import { diaDeSaoPaulo } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CLASSE_TEXTAREA =
  "w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring";

const tamanho = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/**
 * Registrar uma resposta que o cliente deu fora do portal (e-mail, WhatsApp, papel), com comprovante obrigatório. O
 * arquivo vai pela rota ao ser escolhido (antes de registrar); o registro exige esse comprovante deste pedido.
 */
export function RegistrarRespostaDialog({
  aprovacaoId,
  titulo,
  aberto,
  onFechar,
}: {
  aprovacaoId: string;
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();
  const hoje = diaDeSaoPaulo();
  const [resposta, setResposta] = useState<Resposta>("aprovado");
  const [texto, setTexto] = useState("");
  const [dia, setDia] = useState(hoje);
  const [nome, setNome] = useState("");
  const [comprovante, setComprovante] = useState<{ id: string; nome: string; tamanho: number } | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [enviando, startTransition] = useTransition();
  const ids = { texto: useId(), dia: useId(), nome: useId(), arquivo: useId(), erroArquivo: useId() };
  const pedeTexto = resposta !== "aprovado";
  const ocupado = enviando || enviandoArquivo;

  async function escolherArquivo(file: File | undefined) {
    setErroArquivo(null);
    setComprovante(null);
    if (!file) return;
    const motivo = motivoDoComprovante({ nome: file.name, tamanho: file.size });
    if (motivo) {
      setErroArquivo(motivo);
      return;
    }
    setEnviandoArquivo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/portal/aprovacoes/${encodeURIComponent(aprovacaoId)}/comprovante`, { method: "POST", body: fd });
      const corpo = (await res.json().catch(() => ({}))) as { comprovanteId?: string; nome?: string; tamanho?: number; error?: string };
      if (!res.ok || !corpo.comprovanteId) {
        setErroArquivo(corpo.error ?? "Não foi possível enviar o comprovante. Tente de novo.");
        return;
      }
      setComprovante({ id: corpo.comprovanteId, nome: corpo.nome ?? file.name, tamanho: corpo.tamanho ?? file.size });
    } catch {
      setErroArquivo("Não foi possível enviar o comprovante. Tente de novo.");
    } finally {
      setEnviandoArquivo(false);
    }
  }

  function registrar() {
    if (!comprovante) return;
    startTransition(async () => {
      const r = await registrarRespostaPorFora({
        aprovacaoId,
        resposta,
        texto: texto || null,
        dia,
        respondidoPorNome: nome,
        comprovanteId: comprovante.id,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Resposta registrada.");
      onFechar();
      router.refresh();
    });
  }

  const pode = !ocupado && comprovante !== null && nome.trim().length > 0 && dia.length === 10 && (!pedeTexto || texto.trim().length > 0);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar resposta recebida por fora</DialogTitle>
          <DialogDescription className="break-words">{titulo}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Resposta do cliente</legend>
            {(Object.keys(ROTULO_RESPOSTA) as Resposta[]).map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`resposta-${aprovacaoId}`} checked={resposta === r} onChange={() => setResposta(r)} disabled={ocupado} />
                {ROTULO_RESPOSTA[r]}
              </label>
            ))}
          </fieldset>
          {pedeTexto && (
            <div className="space-y-1.5">
              <Label htmlFor={ids.texto}>{resposta === "nao_aprovado" ? "Motivo de não aprovar" : "Ressalvas do cliente"}</Label>
              <textarea
                id={ids.texto}
                rows={3}
                maxLength={TEXTO_MAX}
                className={CLASSE_TEXTAREA}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                disabled={ocupado}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.dia}>Data da resposta</Label>
              <Input id={ids.dia} type="date" max={hoje} value={dia} onChange={(e) => setDia(e.target.value)} disabled={ocupado} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.nome}>Quem respondeu</Label>
              <Input id={ids.nome} value={nome} maxLength={NOME_POR_FORA_MAX} onChange={(e) => setNome(e.target.value)} disabled={ocupado} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.arquivo}>Comprovante</Label>
            <Input
              id={ids.arquivo}
              type="file"
              accept={EXTENSOES_COMPROVANTE.map((e) => `.${e}`).join(",")}
              aria-invalid={erroArquivo ? true : undefined}
              aria-describedby={erroArquivo ? ids.erroArquivo : undefined}
              onChange={(e) => void escolherArquivo(e.target.files?.[0])}
              disabled={ocupado}
            />
            <p className="text-xs text-muted-foreground">
              E-mail salvo (EML ou MSG), PDF ou imagem do recebimento, até {TAMANHO_MAX_COMPROVANTE_LABEL}. O cliente não vê.
            </p>
            {enviandoArquivo && <p className="text-xs text-muted-foreground" role="status">Enviando o comprovante…</p>}
            {comprovante && (
              <p className="flex items-center gap-1.5 text-sm" role="status">
                <Paperclip className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all">{comprovante.nome}</span>
                <span className="text-xs text-muted-foreground">({tamanho(comprovante.tamanho)})</span>
              </p>
            )}
            {erroArquivo && (
              <p id={ids.erroArquivo} className="text-sm text-destructive">
                {erroArquivo}
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={registrar} disabled={!pode}>
            <span role="status">{enviando ? "Registrando…" : "Registrar resposta"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
