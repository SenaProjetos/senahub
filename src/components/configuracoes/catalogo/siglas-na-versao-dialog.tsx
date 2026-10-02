"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizarSigla } from "@/modules/projetos/nomenclatura/catalogo/planilha";
import {
  linhasDoItemNaVersao,
  opsDasSiglas,
  type AlvoCatalogo,
  type CatalogoSnap,
  type OperacaoTela,
} from "@/modules/projetos/nomenclatura/catalogo/versao";
import { AvisoConflitos, exigeConfirmacao, idsTransferencias, rotuloSalvar, useConfirmacao, usePlanoTransferencia } from "./aviso-conflitos";

/** Sigla oficial e sinônimos do item NESTA versão (spec §4.4). Salvar manda tudo numa transação. */
export function SiglasNaVersaoDialog({
  snap,
  versao,
  versoes,
  alvo,
  rotulo,
  pending,
  onFechar,
  onSalvar,
}: {
  snap: CatalogoSnap;
  versao: number;
  versoes: readonly number[];
  alvo: AlvoCatalogo;
  rotulo: string;
  pending: boolean;
  onFechar: () => void;
  onSalvar: (operacoes: OperacaoTela[], transferencias: string[]) => void;
}) {
  const antes = useMemo(() => linhasDoItemNaVersao(snap, alvo, versao), [snap, alvo, versao]);
  const [oficial, setOficial] = useState(antes.oficial?.sigla ?? "");
  const [sinonimos, setSinonimos] = useState<string[]>(() => antes.sinonimos.map((l) => l.sigla));
  const [novo, setNovo] = useState("");

  // A oficial que o item já tem passa como está, mesmo legada (fora do formato atual de 2 a 6
  // letras/números) — senão nenhuma outra mudança no item poderia ser salva.
  const oficialDigitada = oficial.trim();
  const oficialNorm =
    oficialDigitada === "" ? null : oficialDigitada === antes.oficial?.sigla ? antes.oficial.sigla : normalizarSigla(oficialDigitada);
  const oficialInvalida = oficialDigitada !== "" && oficialNorm === null;
  const novoNorm = normalizarSigla(novo);
  const ops = useMemo(
    () => (oficialInvalida ? [] : opsDasSiglas(alvo, antes, { oficial: oficialNorm, sinonimos })),
    [alvo, antes, oficialNorm, oficialInvalida, sinonimos],
  );
  const plano = usePlanoTransferencia(snap, versao, versoes, ops);
  const { confirmado, onConfirmar } = useConfirmacao(plano);
  const podeSalvar = ops.length > 0 && !plano.recusa && (!exigeConfirmacao(plano) || confirmado);

  function adicionar() {
    if (!novoNorm || sinonimos.includes(novoNorm) || novoNorm === oficialNorm) return;
    setSinonimos((s) => [...s, novoNorm]);
    setNovo("");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Siglas de {rotulo} na v{versao}
          </DialogTitle>
          <DialogDescription>A oficial vai no nome dos arquivos. Sinônimos são reconhecidos no envio, nunca escritos.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="w-40 space-y-1.5">
            <Label htmlFor="sigla-oficial">Oficial</Label>
            <Input
              id="sigla-oficial"
              value={oficial}
              maxLength={6}
              className="font-mono uppercase"
              aria-invalid={oficialInvalida || undefined}
              onChange={(e) => setOficial(e.target.value.toUpperCase())}
            />
            {oficialInvalida && <p className="text-xs text-destructive">Sigla de 2 a 6 letras ou números.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sinonimo-novo">Sinônimos</Label>
            <div className="flex flex-wrap items-center gap-2">
              {sinonimos.map((s) => (
                <span key={s} className="inline-flex items-center gap-0.5 rounded-sm border border-dashed pl-2.5 font-mono text-sm">
                  {s}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Remover sinônimo ${s}`}
                    onClick={() => setSinonimos((l) => l.filter((x) => x !== s))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  id="sinonimo-novo"
                  value={novo}
                  maxLength={6}
                  placeholder="Novo"
                  className="w-24 font-mono uppercase"
                  onChange={(e) => setNovo(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionar();
                    }
                  }}
                />
                <Button size="sm" variant="outline" disabled={!novoNorm} onClick={adicionar}>
                  Adicionar
                </Button>
              </div>
            </div>
          </div>
          <p className="rounded-sm bg-muted/60 p-3 text-sm">
            O que mudar aqui vale a partir da v{versao}; as versões anteriores ficam como estão.
          </p>
          <AvisoConflitos plano={plano} versao={versao} confirmado={confirmado} onConfirmar={onConfirmar} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending || !podeSalvar} onClick={() => onSalvar(ops, idsTransferencias(plano))}>
            {pending ? "Salvando…" : rotuloSalvar(plano, "salvar", "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
