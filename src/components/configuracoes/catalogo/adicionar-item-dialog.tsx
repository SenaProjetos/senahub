"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OpcaoVersao } from "@/modules/projetos/nomenclatura/catalogo/apresentacao";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizarSigla } from "@/modules/projetos/nomenclatura/catalogo/planilha";
import type { CatalogoSnap, OperacaoTela } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { AvisoConflitos, exigeConfirmacao, idsTransferencias, rotuloSalvar, useConfirmacao, usePlanoTransferencia } from "./aviso-conflitos";

/**
 * Adicionar card, sub, fase ou tipo na versão — com o conflito de sigla mostrado antes de salvar.
 * Na lente Todas (`opcoesVersao`), a pessoa escolhe em que versão o item nasce (E7; padrão = a mais
 * nova) e a prévia de conflito segue a versão escolhida.
 */
export function AdicionarItemDialog({
  titulo,
  siglaObrigatoria,
  montar,
  snap,
  versao,
  versoes,
  opcoesVersao,
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
  /** Presente = a pessoa escolhe a versão (lente Todas); `versao` vira só o valor inicial. */
  opcoesVersao?: OpcaoVersao[];
  pending: boolean;
  onFechar: () => void;
  onSalvar: (operacao: OperacaoTela, transferencias: string[], versao: number) => void;
}) {
  const [escolhida, setEscolhida] = useState(versao);
  const v = opcoesVersao ? escolhida : versao;
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const siglaNorm = sigla.trim() === "" ? null : normalizarSigla(sigla);
  const siglaInvalida = sigla.trim() !== "" && siglaNorm === null;
  const nomeLimpo = nome.trim();
  const pronto = nomeLimpo !== "" && !siglaInvalida && (!siglaObrigatoria || siglaNorm !== null);
  const ops = useMemo(() => (pronto ? [montar(nomeLimpo, siglaNorm)] : []), [pronto, montar, nomeLimpo, siglaNorm]);
  const plano = usePlanoTransferencia(snap, v, versoes, ops);
  const { confirmado, onConfirmar } = useConfirmacao(plano);
  const podeSalvar = pronto && !plano.recusa && (!exigeConfirmacao(plano) || confirmado);

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Vale a partir da versão {v}. A sigla é a que vai no nome dos arquivos.</DialogDescription>
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
          {opcoesVersao && (
            <div className="space-y-1.5">
              <Label id="adicionar-versao-rotulo">Vale a partir da</Label>
              <Select value={String(escolhida)} onValueChange={(n) => n && setEscolhida(Number(n))}>
                <SelectTrigger className="w-full" aria-labelledby="adicionar-versao-rotulo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcoesVersao.map((o) => (
                    <SelectItem key={o.numero} value={String(o.numero)}>
                      v{o.numero} — {o.nome}
                      {o.rascunho ? " (rascunho)" : o.vigente ? " (vigente)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O item passa a existir nesta versão e nas seguintes; as anteriores não mudam.
              </p>
            </div>
          )}
          <AvisoConflitos plano={plano} versao={v} confirmado={confirmado} onConfirmar={onConfirmar} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending || !podeSalvar} onClick={() => onSalvar(ops[0], idsTransferencias(plano), v)}>
            {pending ? "Salvando…" : rotuloSalvar(plano, "adicionar", "Adicionar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
