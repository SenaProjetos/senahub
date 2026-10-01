"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { siglasParaVoltar, type AlvoCatalogo, type CatalogoSnap, type OperacaoTela } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { AvisoConflitos, exigeConfirmacao, rotuloSalvar, usePlanoTransferencia } from "./aviso-conflitos";
import { SiglaOficial, SiglaSinonimo } from "./sigla-chips";

/** "Voltar para a vN": o item volta com as siglas marcadas (E4 da spec). */
export function VoltarVersaoDialog({
  snap,
  versao,
  versoes,
  alvo,
  nome,
  pending,
  onFechar,
  onSalvar,
}: {
  snap: CatalogoSnap;
  versao: number;
  versoes: readonly number[];
  alvo: AlvoCatalogo;
  nome: string;
  pending: boolean;
  onFechar: () => void;
  onSalvar: (operacao: OperacaoTela, transferir: boolean) => void;
}) {
  const oferta = useMemo(() => siglasParaVoltar(snap, alvo, versao), [snap, alvo, versao]);
  const [marcadas, setMarcadas] = useState(() => new Set(oferta.map((s) => s.sigla)));
  const [confirmado, setConfirmado] = useState(false);
  const ops = useMemo<OperacaoTela[]>(
    () => [{ tipo: "entra", alvo, siglas: oferta.filter((s) => marcadas.has(s.sigla)) }],
    [alvo, oferta, marcadas],
  );
  const plano = usePlanoTransferencia(snap, versao, versoes, ops);
  const podeSalvar = !plano.recusa && (!exigeConfirmacao(plano) || confirmado);

  function alternar(sigla: string, marcada: boolean) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (marcada) novo.add(sigla);
      else novo.delete(sigla);
      return novo;
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Voltar {nome} para a v{versao}
          </DialogTitle>
          <DialogDescription>
            {oferta.length > 0
              ? `Estas eram as siglas de ${nome} — as marcadas voltam junto.`
              : `${nome} não tinha sigla. Volta sem sigla na v${versao}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {oferta.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="sr-only">Siglas que voltam</legend>
              {oferta.map((s) => (
                <label key={s.sigla} className="flex min-h-11 items-center gap-3 rounded-sm border px-3">
                  <Checkbox checked={marcadas.has(s.sigla)} onCheckedChange={(v) => alternar(s.sigla, !!v)} />
                  {s.oficial ? <SiglaOficial sigla={s.sigla} /> : <SiglaSinonimo sigla={s.sigla} />}
                  <span className="text-sm">{s.oficial ? "oficial" : "sinônimo"}</span>
                </label>
              ))}
            </fieldset>
          )}
          <AvisoConflitos plano={plano} versao={versao} confirmado={confirmado} onConfirmar={setConfirmado} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending || !podeSalvar} onClick={() => onSalvar(ops[0], plano.conflitos.length > 0)}>
            {pending ? "Salvando…" : rotuloSalvar(plano, "voltar", `Voltar para a v${versao}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
