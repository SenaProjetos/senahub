"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VersaoOpcao } from "@/components/configuracoes/siglas-versao-dialog";
import type { FaixaVersao } from "@/modules/uploads/nomenclatura/siglas-versao";

/** Faixa no formato do formulário: números como texto, `ate` vazio = sem fim. */
export type FaixaForm = { desde: string; ate: string };

const SEM_FIM = "__sem_fim__";

export function faixaParaForm(f: FaixaVersao): FaixaForm {
  return { desde: String(f.versaoDesde), ate: f.versaoAte === null ? "" : String(f.versaoAte) };
}

export function faixaDoForm(f: FaixaForm): FaixaVersao {
  return { versaoDesde: Number(f.desde) || 1, versaoAte: f.ate ? Number(f.ate) : null };
}

/** Os campos só aparecem quando há o que escolher: mais de uma versão, ou o item já tem validade própria. */
export function mostrarValidade(versoes: readonly VersaoOpcao[], f: FaixaForm): boolean {
  return versoes.length > 1 || f.desde !== "1" || f.ate !== "";
}

export function rotuloVersaoOpcao(v: VersaoOpcao): string {
  return `v${v.numero} — ${v.nome}${v.publicadaEm ? "" : " (rascunho)"}`;
}

/**
 * "Vale a partir da vN · até a vM" de um item de catálogo (card, sub-disciplina, item da Lista
 * Mestre) — D11 da spec de nomenclatura versionada. Fora da faixa o item some dos cadastros novos
 * daquela versão (adicionar disciplina no projeto, proposta nova) e o envio não o reconhece; o que
 * já está em projeto continua funcionando.
 */
export function ValidadeVersaoCampos({
  versoes,
  valor,
  onChange,
  disabled,
}: {
  versoes: readonly VersaoOpcao[];
  valor: FaixaForm;
  onChange: (v: FaixaForm) => void;
  disabled?: boolean;
}) {
  const ordenadas = [...versoes].sort((a, b) => a.numero - b.numero);
  const desde = Number(valor.desde) || 1;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Vale a partir da</Label>
          <Select
            value={valor.desde}
            disabled={disabled}
            onValueChange={(v) => {
              const novo = v ?? "1";
              // "Até" antes do novo início deixaria a faixa invertida: volta para sem fim.
              const ate = valor.ate && Number(valor.ate) < Number(novo) ? "" : valor.ate;
              onChange({ desde: novo, ate });
            }}
          >
            <SelectTrigger className="w-full text-xs"><SelectValue placeholder="Versão" /></SelectTrigger>
            <SelectContent>
              {ordenadas.map((v) => (
                <SelectItem key={v.id} value={String(v.numero)}>{rotuloVersaoOpcao(v)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Até a</Label>
          <Select
            value={valor.ate || SEM_FIM}
            disabled={disabled}
            onValueChange={(v) => onChange({ ...valor, ate: !v || v === SEM_FIM ? "" : v })}
          >
            <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FIM}>Sem fim (próximas versões)</SelectItem>
              {ordenadas
                .filter((v) => v.numero >= desde)
                .map((v) => (
                  <SelectItem key={v.id} value={String(v.numero)}>{rotuloVersaoOpcao(v)}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Versões do padrão de nomenclatura em que este item existe. Fora delas ele não é oferecido em cadastro novo nem
        reconhecido no envio; o que já está em projeto continua funcionando.
      </p>
    </div>
  );
}
