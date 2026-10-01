"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  chaveConfirmacao,
  mensagemConflito,
  operacoesComId,
  planejarTransferencia,
  type CatalogoSnap,
  type OperacaoTela,
  type PlanoTransferencia,
} from "@/modules/projetos/nomenclatura/catalogo/versao";

/**
 * Prévia, no navegador, do que salvar `ops` faria com as siglas dos outros itens. O servidor recalcula
 * contra o banco ao gravar. Passe `ops` memorizado (`useMemo`), senão a prévia refaz a cada render.
 */
export function usePlanoTransferencia(
  snap: CatalogoSnap,
  versao: number,
  versoes: readonly number[],
  ops: readonly OperacaoTela[],
): PlanoTransferencia {
  return useMemo(() => planejarTransferencia(snap, versao, operacoesComId(ops), versoes), [snap, versao, versoes, ops]);
}

/** Pede "Entendi" antes de salvar: a transferência deixa outro item sem sigla oficial na versão. */
export function exigeConfirmacao(plano: PlanoTransferencia): boolean {
  return plano.conflitos.some((c) => c.papel === "oficial");
}

/**
 * Estado do "Entendi": vale só para os donos que ele citava quando foi marcado. Trocar a sigla
 * digitada (outro dono perde a oficial) desmarca sozinho.
 */
export function useConfirmacao(plano: PlanoTransferencia): { confirmado: boolean; onConfirmar: (v: boolean) => void } {
  const chave = chaveConfirmacao(plano);
  const [confirmadoPara, setConfirmadoPara] = useState<string | null>(null);
  return { confirmado: chave !== "" && confirmadoPara === chave, onConfirmar: (v) => setConfirmadoPara(v ? chave : null) };
}

/** Ids das transferências que a tela mostrou — o servidor só tira a sigla de quem está aqui. */
export function idsTransferencias(plano: PlanoTransferencia): string[] {
  return plano.encerrar.map((o) => o.id);
}

/** Rótulo do botão de salvar: "Tirar de Hidrossanitário e adicionar" quando há transferência. */
export function rotuloSalvar(plano: PlanoTransferencia, verbo: string, padrao: string): string {
  const donos = [...new Set(plano.conflitos.map((c) => c.dono))];
  if (donos.length === 0) return padrao;
  return donos.length === 1 ? `Tirar de ${donos[0]} e ${verbo}` : `Transferir e ${verbo}`;
}

/** Conflitos de sigla dentro do diálogo, antes de salvar (spec §4.5). Nada quando não há conflito. */
export function AvisoConflitos({
  plano,
  versao,
  confirmado,
  onConfirmar,
}: {
  plano: PlanoTransferencia;
  versao: number;
  confirmado: boolean;
  onConfirmar: (v: boolean) => void;
}) {
  if (plano.recusa) {
    return (
      <div role="alert" className="flex gap-2.5 rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p>{plano.recusa}</p>
      </div>
    );
  }
  if (plano.conflitos.length === 0) return null;
  const anteriores = versao - 1 === 1 ? "Na v1" : `Até a v${versao - 1}`;
  const semSigla = [...new Set(plano.conflitos.filter((c) => c.papel === "oficial").map((c) => c.dono))];
  return (
    <div role="status" className="space-y-3 rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm">
      {plano.conflitos.map((c) => (
        <div key={`${c.sigla}:${c.dono}`} className="flex gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <strong className="block font-semibold">{mensagemConflito(c)}</strong>
            {c.papel === "oficial"
              ? `Se passar para cá, “${c.dono}” fica sem sigla na v${versao}: os arquivos dele deixam de ser reconhecidos pela sigla até você dar uma nova. ${anteriores} nada muda.`
              : `Para usar aqui, a sigla sai de “${c.dono}” a partir da v${versao}. ${anteriores} ela continua sendo de “${c.dono}” — projetos dessas versões não mudam.`}
          </p>
        </div>
      ))}
      {semSigla.length > 0 && (
        <label className="flex items-start gap-2.5">
          <Checkbox checked={confirmado} onCheckedChange={(v) => onConfirmar(!!v)} className="mt-0.5" />
          <span>
            Entendi: {semSigla.map((d) => `“${d}”`).join(" e ")} {semSigla.length === 1 ? "fica" : "ficam"} sem sigla na v{versao}.
          </span>
        </label>
      )}
    </div>
  );
}
