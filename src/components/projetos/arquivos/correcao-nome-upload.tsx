"use client";

import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { nomeCorrigidoPeloPadrao } from "@/modules/uploads/nome-corrigido";
import { siglaNoLugarDaDisciplina } from "@/modules/uploads/nomenclatura/siglas-nome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Opcao = { id: string; sigla: string; nome: string };

export type DadosCorrecaoNomeUpload = {
  codigoProjeto: string;
  /** Sigla GERAL do card na versão do padrão; null = card identificado só por sub. */
  siglaDisciplina: string | null;
  /** Subs do card na versão (padrão v2); vazio/ausente = card sem sub. */
  subdisciplinas?: { id: string; sigla: string }[];
  /** Sub já lida do nome, para vir marcada. */
  subdisciplinaId?: string;
  fases: Opcao[];
  tipos: Opcao[];
  /** Modelo e largura do número da versão do projeto; ausentes = formato original (v1). */
  padrao?: string | null;
  larguraNumero?: number;
};

/** Valor do Select para "sem sub" (a sigla geral do card) — base-ui não aceita "" como item. */
const SEM_SUB = "__geral";

export function CorrecaoNomeUpload({
  nomeOriginal,
  faseId,
  dados,
  onFaseChange,
  onAplicar,
}: {
  nomeOriginal: string;
  faseId: string | undefined;
  dados: DadosCorrecaoNomeUpload;
  onFaseChange: (faseId: string | null) => void;
  onAplicar: (nome: string) => void;
}) {
  const [tipoId, setTipoId] = useState<string | null>(null);
  const [numeracao, setNumeracao] = useState("");
  const subs = dados.subdisciplinas ?? [];
  const [subId, setSubId] = useState<string | null>(
    dados.subdisciplinaId ?? (dados.siglaDisciplina ? null : subs[0]?.id ?? null),
  );
  const fase = dados.fases.find((item) => item.id === faseId);
  const tipo = dados.tipos.find((item) => item.id === tipoId);
  const numero = Number(numeracao);
  const siglaDisc = siglaNoLugarDaDisciplina({ sigla: dados.siglaDisciplina, subdisciplinas: subs }, subId);
  const pronto = !!siglaDisc && !!fase && !!tipo
    && Number.isInteger(numero) && numero >= 0;

  return (
    <div className="mt-2 grid gap-1.5 rounded-md border border-dashed bg-muted/30 p-2">
      <p className="text-[11px] font-medium">Corrigir pelo padrão</p>
      {!dados.siglaDisciplina && subs.length === 0 && (
        <p className="text-[11px] text-destructive">A disciplina não possui sigla cadastrada; corrija o nome manualmente.</p>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {subs.length > 0 && (
          <div className="space-y-1">
            <Label className="text-[11px]">Sub-disciplina</Label>
            <Select
              value={subId ?? SEM_SUB}
              onValueChange={(valor) => setSubId(!valor || valor === SEM_SUB ? null : valor)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {dados.siglaDisciplina && (
                  <SelectItem value={SEM_SUB}>{dados.siglaDisciplina} · geral do card</SelectItem>
                )}
                {subs.map((sub) => <SelectItem key={sub.id} value={sub.id}>{sub.sigla}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-[11px]">Fase</Label>
          <Select value={faseId ?? ""} onValueChange={onFaseChange}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {dados.fases.map((item) => <SelectItem key={item.id} value={item.id}>{item.sigla} · {item.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Tipo</Label>
          <Select value={tipoId ?? ""} onValueChange={setTipoId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {dados.tipos.map((item) => <SelectItem key={item.id} value={item.id}>{item.sigla} · {item.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Numeração</Label>
          <Input type="number" min="0" value={numeracao} onChange={(event) => setNumeracao(event.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <Button
        size="xs"
        variant="secondary"
        disabled={!pronto}
        onClick={() => {
          if (!pronto || !fase || !tipo || !siglaDisc) return;
          onAplicar(nomeCorrigidoPeloPadrao({
            nomeOriginal,
            codigoProjeto: dados.codigoProjeto,
            siglaDisciplina: siglaDisc,
            fase: fase.sigla,
            tipo: tipo.sigla,
            numeracao: numero,
            padrao: dados.padrao,
            larguraNumero: dados.larguraNumero,
          }));
        }}
      >
        <WandSparkles className="size-3" /> Aplicar nome corrigido
      </Button>
    </div>
  );
}
