"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
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
import { salvarPrazosCertidoes } from "@/modules/certidoes/actions";
import {
  DIAS_MAXIMO,
  MAX_AVISOS,
  PRAZOS_CERTIDOES_PADRAO,
  avisosAntesDaFaixa,
  normalizarDiasAvisos,
  type PrazosCertidoes,
} from "@/modules/certidoes/prazos";

function rotuloDia(d: number): string {
  if (d === 0) return "No dia";
  return d === 1 ? "1 dia" : `${d} dias`;
}

/** "30 dias, 15 dias e 7 dias". */
function juntarComE(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * Prazos das certidões: a partir de quando a certidão aparece como "Vence em breve" e em quais
 * dias antes da validade sai a notificação. Regras e limites em `modules/certidoes/prazos.ts`.
 */
export function PrazosCertidoesDialog({
  open,
  onClose,
  prazos,
}: {
  open: boolean;
  onClose: () => void;
  prazos: PrazosCertidoes;
}) {
  const router = useRouter();
  const [pendente, start] = useTransition();
  const [emBreve, setEmBreve] = useState(String(prazos.diasEmBreve));
  const [avisos, setAvisos] = useState<number[]>(prazos.diasAvisos);
  const [novoAviso, setNovoAviso] = useState("");
  const [erroAviso, setErroAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const novoAvisoRef = useRef<HTMLInputElement>(null);
  const noLimite = avisos.length >= MAX_AVISOS;

  // Reabre sempre com o que está gravado, não com o rascunho de uma abertura anterior cancelada.
  const [abertoAntes, setAbertoAntes] = useState(open);
  if (open !== abertoAntes) {
    setAbertoAntes(open);
    if (open) {
      setEmBreve(String(prazos.diasEmBreve));
      setAvisos(prazos.diasAvisos);
      setNovoAviso("");
      setErroAviso(null);
      setErro(null);
    }
  }

  const diasEmBreve = Number(emBreve);
  const emBreveValido = Number.isInteger(diasEmBreve) && diasEmBreve >= 1 && diasEmBreve <= DIAS_MAXIMO;
  const antesDaFaixa = emBreveValido ? avisosAntesDaFaixa({ diasEmBreve, diasAvisos: avisos }) : [];

  function adicionarAviso() {
    const d = Number(novoAviso);
    if (novoAviso.trim() === "" || !Number.isInteger(d) || d < 0 || d > DIAS_MAXIMO) {
      setErroAviso(`Informe um número inteiro de 0 a ${DIAS_MAXIMO}.`);
      return;
    }
    if (avisos.includes(d)) {
      setErroAviso("Esse dia já está na lista.");
      return;
    }
    if (avisos.length >= MAX_AVISOS) {
      setErroAviso(`No máximo ${MAX_AVISOS} avisos.`);
      return;
    }
    setAvisos(normalizarDiasAvisos([...avisos, d]));
    setNovoAviso("");
    setErroAviso(null);
  }

  function usarPadrao() {
    setEmBreve(String(PRAZOS_CERTIDOES_PADRAO.diasEmBreve));
    setAvisos([...PRAZOS_CERTIDOES_PADRAO.diasAvisos]);
    setErroAviso(null);
    setErro(null);
  }

  function removerAviso(d: number) {
    setAvisos(avisos.filter((x) => x !== d));
    setErroAviso(null);
    // O chip some junto com o botão focado: devolve o foco ao campo, senão o teclado cai no <body>.
    novoAvisoRef.current?.focus();
  }

  function salvar() {
    setErro(null);
    if (!emBreveValido) {
      setErro(`"Vence em breve" precisa de um número inteiro de 1 a ${DIAS_MAXIMO} dias.`);
      return;
    }
    start(async () => {
      const r = await salvarPrazosCertidoes({ diasEmBreve, diasAvisos: avisos });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success("Prazos das certidões salvos.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !pendente && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prazos de vencimento</DialogTitle>
          <DialogDescription>Valem para todas as certidões, a partir de agora.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="prazo-em-breve">Marcar como &quot;Vence em breve&quot; a partir de (dias antes)</Label>
            <Input
              id="prazo-em-breve"
              type="number"
              inputMode="numeric"
              min={1}
              max={DIAS_MAXIMO}
              className="w-28"
              value={emBreve}
              disabled={pendente}
              aria-invalid={!emBreveValido}
              aria-describedby={erro ? "prazo-em-breve-ajuda prazos-erro" : "prazo-em-breve-ajuda"}
              onChange={(e) => {
                setEmBreve(e.target.value);
                setErro(null);
              }}
            />
            <p id="prazo-em-breve-ajuda" className="text-xs text-muted-foreground">
              Muda a cor da certidão na lista, o aviso do menu e o card do Início.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prazo-novo-aviso">Notificar quando faltarem</Label>
            {avisos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum aviso: ninguém é notificado do vencimento.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Dias de aviso">
                {avisos.map((d) => (
                  <li
                    key={d}
                    className="inline-flex items-center gap-1 rounded-sm border bg-muted/40 py-0.5 pr-0.5 pl-2 text-sm"
                  >
                    {rotuloDia(d)}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={`Remover aviso de ${rotuloDia(d).toLowerCase()}`}
                      disabled={pendente}
                      onClick={() => removerAviso(d)}
                    >
                      <X className="size-3" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={novoAvisoRef}
                id="prazo-novo-aviso"
                type="number"
                inputMode="numeric"
                min={0}
                max={DIAS_MAXIMO}
                placeholder="dias"
                className="w-24"
                value={novoAviso}
                disabled={pendente || noLimite}
                aria-invalid={!!erroAviso}
                aria-describedby="prazo-novo-aviso-ajuda"
                onChange={(e) => {
                  setNovoAviso(e.target.value);
                  setErroAviso(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarAviso();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pendente || noLimite}
                onClick={adicionarAviso}
              >
                <Plus className="size-3.5" aria-hidden /> Adicionar
              </Button>
            </div>
            {erroAviso ? (
              <p id="prazo-novo-aviso-ajuda" role="alert" className="text-xs text-destructive">
                {erroAviso}
              </p>
            ) : (
              <p id="prazo-novo-aviso-ajuda" className="text-xs text-muted-foreground">
                {noLimite
                  ? `No máximo ${MAX_AVISOS} avisos: remova um para adicionar outro.`
                  : "Uma notificação por dia da lista, para a gestão e o responsável da certidão. 0 = no dia do vencimento."}
              </p>
            )}
            {antesDaFaixa.length > 0 && (
              <p className="text-xs text-warning-text">
                {antesDaFaixa.length === 1 ? "O aviso de " : "Os avisos de "}
                {juntarComE(antesDaFaixa.map(rotuloDia))} {antesDaFaixa.length === 1 ? "chega" : "chegam"} antes de a
                certidão aparecer como &quot;Vence em breve&quot; ({rotuloDia(diasEmBreve)}).
              </p>
            )}
          </div>

          {erro && (
            <p id="prazos-erro" role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={usarPadrao} disabled={pendente}>
            Usar o padrão
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvar} disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
