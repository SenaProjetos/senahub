"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizarSigla } from "@/modules/projetos/nomenclatura/catalogo/planilha";
import type { CatalogoSnap, OperacaoTela } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { AvisoConflitos, exigeConfirmacao, rotuloSalvar, usePlanoTransferencia } from "./aviso-conflitos";

/** Adicionar card, sub, fase ou tipo na versão — com o conflito de sigla mostrado antes de salvar. */
export function AdicionarItemDialog({
  titulo,
  siglaObrigatoria,
  montar,
  snap,
  versao,
  versoes,
  pending,
  onFechar,
  onSalvar,
}: {
  titulo: string;
  siglaObrigatoria: boolean;
  montar: (nome: string, sigla: string | null) => OperacaoTela;
  snap: CatalogoSnap;
  versao: number;
  versoes: readonly number[];
  pending: boolean;
  onFechar: () => void;
  onSalvar: (operacao: OperacaoTela, transferir: boolean) => void;
}) {
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const siglaNorm = sigla.trim() === "" ? null : normalizarSigla(sigla);
  const siglaInvalida = sigla.trim() !== "" && siglaNorm === null;
  const nomeLimpo = nome.trim();
  const pronto = nomeLimpo !== "" && !siglaInvalida && (!siglaObrigatoria || siglaNorm !== null);
  const ops = useMemo(() => (pronto ? [montar(nomeLimpo, siglaNorm)] : []), [pronto, montar, nomeLimpo, siglaNorm]);
  const plano = usePlanoTransferencia(snap, versao, versoes, ops);
  const podeSalvar = pronto && !plano.recusa && (!exigeConfirmacao(plano) || confirmado);

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Vale a partir desta versão. A sigla é a que vai no nome dos arquivos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="adicionar-nome">Nome</Label>
              <Input id="adicionar-nome" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="w-28 space-y-1.5">
              <Label htmlFor="adicionar-sigla">Sigla{siglaObrigatoria ? "" : " (opcional)"}</Label>
              <Input
                id="adicionar-sigla"
                value={sigla}
                maxLength={6}
                className="font-mono uppercase"
                aria-invalid={siglaInvalida || undefined}
                onChange={(e) => setSigla(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          {siglaInvalida && <p className="text-xs text-destructive">Sigla de 2 a 6 letras ou números.</p>}
          <AvisoConflitos plano={plano} versao={versao} confirmado={confirmado} onConfirmar={setConfirmado} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending || !podeSalvar} onClick={() => onSalvar(ops[0], plano.conflitos.length > 0)}>
            {pending ? "Salvando…" : rotuloSalvar(plano, "adicionar", "Adicionar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
