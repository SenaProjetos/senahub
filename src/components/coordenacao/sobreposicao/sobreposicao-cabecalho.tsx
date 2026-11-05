"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { excluirSobreposicao } from "@/modules/coordenacao/sobreposicao/actions";
import { ACAO_EXCLUIR, ACAO_RENOMEAR, itensDaSobreposicao } from "@/modules/coordenacao/sobreposicao/acoes";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NovaSobreposicaoDialog } from "./nova-sobreposicao-dialog";

type Props = {
  projetoId: string;
  sobreposicoes: { id: string; nome: string; camadas: number }[];
  /** Id da sobreposição aberta; null = o projeto ainda não tem nenhuma. */
  selecionadaId: string | null;
  podeGerir: boolean;
};

/** Título da tela + seletor de pavimento + "Nova sobreposição" + `...` da sobreposição aberta. */
export function SobreposicaoCabecalho({ projetoId, sobreposicoes, selecionadaId, podeGerir }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, start] = useTransition();
  const [criando, setCriando] = useState(false);
  const [renomeando, setRenomeando] = useState(false);

  const base = `/projetos/${projetoId}/coordenacao/sobreposicao`;
  const atual = sobreposicoes.find((s) => s.id === selecionadaId) ?? null;
  const itens = itensDaSobreposicao({ podeGerir });

  async function aoEscolherAcao(item: AcaoItemAcao) {
    if (!atual) return;
    if (item.id === ACAO_RENOMEAR) {
      setRenomeando(true);
      return;
    }
    if (item.id === ACAO_EXCLUIR) {
      // Confirmar ANTES do startTransition (um confirm dentro dele trava).
      const ok = await confirm({
        title: item.confirmar?.titulo ?? "Excluir esta sobreposição?",
        description: item.confirmar?.descricao,
        confirmLabel: item.confirmar?.rotuloConfirmar ?? "Excluir",
        variant: "destructive",
      });
      if (!ok) return;
      start(async () => {
        const r = await excluirSobreposicao({ id: atual.id });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Sobreposição excluída.");
        router.push(base);
        router.refresh();
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-40 flex-[1_1_10rem]">
        <h2 className="text-lg font-bold tracking-tight">Sobreposição 2D</h2>
        <p className="text-sm text-muted-foreground">
          Sobreponha as plantas das disciplinas de um pavimento para achar interferências.
        </p>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        {sobreposicoes.length > 0 && (
          <Select
            value={selecionadaId ?? undefined}
            onValueChange={(v) => {
              if (v && v !== selecionadaId) router.push(`${base}?s=${v}`);
            }}
          >
            <SelectTrigger className="w-52" aria-label="Pavimento">
              <SelectValue placeholder="Pavimento" />
            </SelectTrigger>
            <SelectContent>
              {sobreposicoes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {podeGerir && (
          <Button type="button" size="sm" onClick={() => setCriando(true)}>
            <Plus className="size-4" />
            Nova sobreposição
          </Button>
        )}
        {atual && <BotaoAcoes itens={itens} onSelect={aoEscolherAcao} rotulo={`Ações da sobreposição ${atual.nome}`} className="size-8" />}
      </div>

      <NovaSobreposicaoDialog projetoId={projetoId} open={criando} onOpenChange={setCriando} />
      {atual && (
        <NovaSobreposicaoDialog
          key={atual.id}
          projetoId={projetoId}
          open={renomeando}
          onOpenChange={setRenomeando}
          renomear={{ id: atual.id, nome: atual.nome }}
        />
      )}
    </div>
  );
}
