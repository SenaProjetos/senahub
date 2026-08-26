"use client";

import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { nomeCorrigidoPeloPadrao } from "@/modules/uploads/nome-corrigido";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Opcao = { id: string; sigla: string; nome: string };

export type DadosCorrecaoNomeUpload = {
  codigoProjeto: string;
  siglaDisciplina: string | null;
  fases: Opcao[];
  tipos: Opcao[];
};

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
  const [revisao, setRevisao] = useState("");
  const fase = dados.fases.find((item) => item.id === faseId);
  const tipo = dados.tipos.find((item) => item.id === tipoId);
  const numero = Number(numeracao);
  const revisaoNumero = Number(revisao);
  const pronto = !!dados.siglaDisciplina && !!fase && !!tipo
    && Number.isInteger(numero) && numero >= 0
    && Number.isInteger(revisaoNumero) && revisaoNumero >= 0;

  return (
    <div className="mt-2 grid gap-1.5 rounded-md border border-dashed bg-muted/30 p-2">
      <p className="text-[11px] font-medium">Corrigir pelo padrão</p>
      {!dados.siglaDisciplina && (
        <p className="text-[11px] text-destructive">A disciplina não possui sigla cadastrada; corrija o nome manualmente.</p>
      )}
      <div className="grid gap-1.5 sm:grid-cols-2">
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
        <div className="space-y-1">
          <Label className="text-[11px]">Revisão</Label>
          <Input type="number" min="0" value={revisao} onChange={(event) => setRevisao(event.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <Button
        size="xs"
        variant="secondary"
        disabled={!pronto}
        onClick={() => {
          if (!pronto || !fase || !tipo || !dados.siglaDisciplina) return;
          onAplicar(nomeCorrigidoPeloPadrao({
            nomeOriginal,
            codigoProjeto: dados.codigoProjeto,
            siglaDisciplina: dados.siglaDisciplina,
            fase: fase.sigla,
            tipo: tipo.sigla,
            numeracao: numero,
            revisao: revisaoNumero,
          }));
        }}
      >
        <WandSparkles className="size-3" /> Aplicar nome corrigido
      </Button>
    </div>
  );
}
