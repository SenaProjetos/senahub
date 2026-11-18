"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { motivoParaNaoApontar } from "@/modules/coordenacao/sobreposicao/apontar";
import type { CamadaDaCena } from "@/modules/coordenacao/sobreposicao/queries";
import {
  SEVERIDADES,
  SEVERIDADE_LABEL,
  TIPOS_PENDENCIA,
  TIPO_PENDENCIA_LABEL,
  type Severidade,
  type TipoPendencia,
} from "@/modules/projetos/pendencias/helpers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DadosApontamento = {
  camadaId: string;
  texto: string;
  severidade: Severidade | null;
  tipo: TipoPendencia | null;
};

type Props = {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Camadas ligadas (a base inclusive): quem pode ter de alterar. */
  camadas: CamadaDaCena[];
  /** Troca a camada para o PDF (o pino só cai no PDF). */
  onUsarPdf: (camadaId: string) => void;
  /** Cria o apontamento; devolve a mensagem de erro (o diálogo fica aberto) ou null. */
  onConfirmar: (dados: DadosApontamento) => Promise<string | null>;
};

const SEM = "__sem__";

/** Disciplina que deve alterar + texto + classificação opcional, como o apontamento comum. */
export function ApontarDialog({ aberto, onOpenChange, camadas, onUsarPdf, onConfirmar }: Props) {
  const [camadaId, setCamadaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [severidade, setSeveridade] = useState<Severidade | null>(null);
  const [tipo, setTipo] = useState<TipoPendencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const escolhida = camadas.find((c) => c.id === camadaId) ?? null;
  const motivo = escolhida ? motivoParaNaoApontar(escolhida) : null;

  function fechar(aberto: boolean) {
    if (enviando) return;
    if (!aberto) limpar();
    onOpenChange(aberto);
  }

  function limpar() {
    setCamadaId(null);
    setTexto("");
    setSeveridade(null);
    setTipo(null);
    setErro(null);
  }

  async function confirmar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!escolhida || motivo || !texto.trim()) return;
    setEnviando(true);
    setErro(null);
    let r: string | null;
    try {
      r = await onConfirmar({ camadaId: escolhida.id, texto: texto.trim(), severidade, tipo });
    } catch {
      // Falha de rede: o diálogo nunca fica preso em "enviando".
      r = "Não foi possível criar o apontamento. Confira a conexão e tente de novo.";
    }
    setEnviando(false);
    if (r) {
      setErro(r);
      return;
    }
    limpar();
    onOpenChange(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={confirmar} className="contents">
          <DialogHeader>
            <DialogTitle>Apontar interferência</DialogTitle>
            <DialogDescription>
              O apontamento vai para a prancha da disciplina que deve alterar, como rascunho, com a imagem da sobreposição.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="apontar-camada">Disciplina que deve alterar</Label>
              <Select value={camadaId ?? ""} onValueChange={(v) => setCamadaId(v || null)}>
                <SelectTrigger
                  id="apontar-camada"
                  className="w-full"
                  aria-invalid={motivo !== null || undefined}
                  aria-describedby={motivo ? "apontar-motivo" : undefined}
                >
                  <SelectValue placeholder="Escolha a disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {camadas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.disciplina} · {c.titulo}
                      {c.base ? " (base)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {escolhida && motivo && (
                <div className="flex flex-wrap items-center gap-2">
                  <p id="apontar-motivo" className="text-sm text-warning-text">
                    {motivo.erro}
                  </p>
                  {motivo.trocarParaPdf && (
                    <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onUsarPdf(escolhida.id)}>
                      Usar o PDF
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="apontar-texto">O que precisa mudar</Label>
              <textarea
                id="apontar-texto"
                className="w-full rounded-sm border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Ex.: o tubo de esgoto atravessa o pilar P12."
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="apontar-severidade">Severidade</Label>
                <Select value={severidade ?? SEM} onValueChange={(v) => setSeveridade(!v || v === SEM ? null : (v as Severidade))}>
                  <SelectTrigger id="apontar-severidade" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem severidade</SelectItem>
                    {SEVERIDADES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SEVERIDADE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="apontar-tipo">Tipo</Label>
                <Select value={tipo ?? SEM} onValueChange={(v) => setTipo(!v || v === SEM ? null : (v as TipoPendencia))}>
                  <SelectTrigger id="apontar-tipo" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM}>Sem tipo</SelectItem>
                    {TIPOS_PENDENCIA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_PENDENCIA_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || !escolhida || motivo !== null || !texto.trim()}>
              {enviando && <Loader2 className="size-4 animate-spin" />}
              Apontar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
