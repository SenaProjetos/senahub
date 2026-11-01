"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FORMATOS_EXIGIDOS,
  normalizarFormatosExigidos,
  resumoDosFormatos,
  type FormatoExigido,
} from "@/modules/uploads/ciclo/formatos-exigidos";

const DICA: Record<FormatoExigido, string> = {
  dwg: "desenho no formato DWG",
  pdf: "cópia de leitura em PDF",
  excel: "planilha .xls, .xlsx ou .xlsm",
  word: "texto .doc ou .docx",
  word_ou_excel: "um arquivo Word ou Excel, tanto faz qual",
};

/**
 * Arquivos que a publicação exige de um tipo de documento (ciclo documental). Vale para o tipo em todas as
 * versões. Modelo IFC é sempre isento; documento sem tipo segue a confirmação própria.
 */
export function FormatosExigidosDialog({
  nome,
  atuais,
  pending,
  onFechar,
  onSalvar,
}: {
  nome: string;
  atuais: readonly FormatoExigido[];
  pending: boolean;
  onFechar: () => void;
  onSalvar: (formatos: FormatoExigido[]) => void;
}) {
  const [marcados, setMarcados] = useState(() => new Set(atuais));
  const escolhidos = normalizarFormatosExigidos([...marcados]);

  function alternar(valor: FormatoExigido, marcado: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(valor);
      else novo.delete(valor);
      return novo;
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Arquivos exigidos — {nome}</DialogTitle>
          <DialogDescription>
            Uma revisão deste tipo só publica com todos os arquivos marcados. Os não marcados podem ir junto, mas não travam.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1">
          <legend className="sr-only">Arquivos exigidos para publicar</legend>
          {FORMATOS_EXIGIDOS.map((f) => (
            <label key={f.valor} className="flex min-h-11 items-center gap-3 rounded-sm border px-3">
              <Checkbox checked={marcados.has(f.valor)} onCheckedChange={(v) => alternar(f.valor, !!v)} />
              <span className="text-sm font-medium">{f.rotulo}</span>
              <span className="text-xs text-muted-foreground">{DICA[f.valor]}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Fica assim: <strong className="text-foreground">{resumoDosFormatos(escolhidos)}</strong>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={() => onSalvar(escolhidos)}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
