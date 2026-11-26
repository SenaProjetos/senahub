"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { definirDedicacaoDisciplina } from "@/modules/planejamento/recursos-actions";
import { Input } from "@/components/ui/input";

export type ResponsavelComDedicacao = {
  userId: string;
  nome: string;
  /** % nesta disciplina; `null` = o padrão do cadastro de Recursos. */
  dedicacao: number | null;
  /** O padrão do cadastro de Recursos, em %. */
  padrao: number;
};

/**
 * Dedicação dos responsáveis NESTA disciplina (pool de recursos, decisão 5), no painel do agrupamento da disciplina:
 * "a Mireli está a 50% na Elétrica do X". Pesa a divisão das horas automáticas das tarefas da disciplina; o padrão do
 * cadastro de Recursos não muda. Campo vazio = o padrão.
 */
export function DedicacaoDaDisciplina({
  disciplinaId,
  responsaveis,
}: {
  disciplinaId: string;
  responsaveis: readonly ResponsavelComDedicacao[];
}) {
  return (
    <div className="space-y-1.5">
      <ul className="divide-y rounded-sm border">
        {responsaveis.map((r) => (
          <LinhaDedicacao
            key={`${r.userId}:${r.dedicacao ?? ""}`}
            disciplinaId={disciplinaId}
            userId={r.userId}
            rotulo={r.nome}
            dedicacao={r.dedicacao}
            padrao={r.padrao}
            dicaId={`dedicacao-dica-${disciplinaId}`}
          />
        ))}
      </ul>
      <p id={`dedicacao-dica-${disciplinaId}`} className="text-xs text-muted-foreground">
        Divide as horas automáticas das tarefas desta disciplina. Vazio = o padrão do cadastro de Recursos, que não muda por
        aqui.
      </p>
    </div>
  );
}

/**
 * Uma linha "rótulo · [ 50 ] %" que grava a dedicação de UMA pessoa numa disciplina — no painel da disciplina (rótulo =
 * pessoa) e na tela por pessoa de Recursos (rótulo = projeto · disciplina). Remontar com `key` quando o valor gravado muda.
 */
export function LinhaDedicacao({
  disciplinaId,
  userId,
  rotulo,
  dedicacao: gravada,
  padrao,
  dicaId,
}: {
  disciplinaId: string;
  userId: string;
  rotulo: string;
  dedicacao: number | null;
  padrao: number;
  dicaId?: string;
}) {
  const responsavel = { userId, dedicacao: gravada, padrao };
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState(responsavel.dedicacao == null ? "" : String(responsavel.dedicacao));
  const id = `dedicacao-${disciplinaId}-${responsavel.userId}`;

  function gravar() {
    const texto = valor.trim();
    const dedicacao = texto === "" ? null : Number(texto.replace(",", "."));
    if (dedicacao === responsavel.dedicacao) return;
    if (dedicacao != null && (!Number.isInteger(dedicacao) || dedicacao < 1 || dedicacao > 100)) {
      toast.error("A dedicação vai de 1% a 100%.");
      setValor(responsavel.dedicacao == null ? "" : String(responsavel.dedicacao));
      return;
    }
    start(async () => {
      const r = await definirDedicacaoDisciplina({ disciplinaId, userId: responsavel.userId, dedicacao });
      if (r.ok) {
        toast.success(dedicacao == null ? `${rotulo}: volta ao padrão (${padrao}%).` : `${rotulo}: dedicação ${dedicacao}%.`);
        router.refresh();
      }
      else {
        toast.error(r.error);
        setValor(responsavel.dedicacao == null ? "" : String(responsavel.dedicacao));
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm">
      <label htmlFor={id} className="min-w-0 truncate" title={rotulo}>
        {rotulo}
      </label>
      <span className="flex shrink-0 items-center gap-1">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          value={valor}
          placeholder={String(responsavel.padrao)}
          // Não desabilita enquanto grava: o foco ficaria perdido na página.
          readOnly={pending}
          aria-describedby={dicaId}
          onChange={(e) => setValor(e.target.value)}
          onBlur={gravar}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            // Esc desiste do que foi digitado.
            if (e.key === "Escape") setValor(responsavel.dedicacao == null ? "" : String(responsavel.dedicacao));
          }}
          title={`Dedicação nesta disciplina. Vazio = ${responsavel.padrao}%, o padrão do cadastro de Recursos.`}
          className="h-7 w-16 px-1.5 text-right text-xs"
        />
        <span className="text-xs text-muted-foreground">{valor.trim() === "" ? `% (padrão ${responsavel.padrao})` : "%"}</span>
      </span>
    </li>
  );
}
