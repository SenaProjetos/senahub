"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { definirModeloDoCliente } from "@/modules/inputs/modelo-actions";

const PADRAO_DO_SISTEMA = "__padrao";

/**
 * Formulário de briefing PADRÃO do cliente (Lote 4b): os projetos dele que não escolheram um modelo próprio seguem este.
 * Trocar recalcula o status dos briefings desses projetos e zera as ocultações feitas sobre o formulário anterior; as
 * respostas ficam (pergunta de mesma chave aproveita a resposta) — por isso confirma antes.
 */
export function ModeloBriefingCliente({
  clienteId,
  atual,
  modelos,
  padraoNome,
  podeEditar,
}: {
  clienteId: string;
  atual: string | null;
  modelos: { id: string; nome: string; padrao: boolean; ativo: boolean }[];
  /** Nome do modelo padrão do sistema (o que vale quando o cliente não escolhe). */
  padraoNome: string;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, startTransition] = useTransition();
  const [valor, setValor] = useState(atual ?? PADRAO_DO_SISTEMA);
  const nomeAtual = atual ? (modelos.find((m) => m.id === atual)?.nome ?? "modelo escolhido") : `${padraoNome} (padrão do sistema)`;

  async function trocar(novo: string | null) {
    if (!novo || novo === valor) return;
    const nome = novo === PADRAO_DO_SISTEMA ? `${padraoNome} (padrão do sistema)` : (modelos.find((m) => m.id === novo)?.nome ?? "");
    // Confirma ANTES de abrir a transição (o diálogo não pode ficar dentro dela).
    const ok = await confirm({
      title: `Usar o formulário “${nome}” para este cliente?`,
      description:
        "Os projetos do cliente que não escolheram um modelo próprio passam a usar este formulário: o status do briefing é recalculado e as perguntas ocultas voltam a aparecer. As respostas já dadas ficam guardadas.",
      confirmLabel: "Trocar formulário",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const r = await definirModeloDoCliente({ clienteId, modeloId: novo === PADRAO_DO_SISTEMA ? null : novo });
        if (r.ok) {
          setValor(novo);
          toast.success(r.data.projetosAfetados > 0 ? `Formulário do cliente alterado (${r.data.projetosAfetados} briefing(s) recalculado(s)).` : "Formulário do cliente alterado.");
          router.refresh();
        } else toast.error(r.error);
      } catch {
        toast.error("Não foi possível trocar o formulário. Verifique a conexão e tente de novo.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Formulário de briefing</CardTitle>
        <CardDescription>
          O modelo de perguntas que os projetos deste cliente usam, a menos que o projeto escolha outro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {podeEditar ? (
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="modelo-briefing-cliente" className="text-xs text-muted-foreground">
              Modelo do cliente
            </Label>
            <Select value={valor} onValueChange={trocar} disabled={pendente}>
              <SelectTrigger id="modelo-briefing-cliente" className="w-72 max-w-full" aria-label="Modelo do cliente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PADRAO_DO_SISTEMA}>Padrão do sistema — {padraoNome}</SelectItem>
                {modelos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                    {m.padrao ? " (padrão)" : ""}
                    {!m.ativo ? " (arquivado)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm">{nomeAtual}</p>
        )}
      </CardContent>
    </Card>
  );
}
