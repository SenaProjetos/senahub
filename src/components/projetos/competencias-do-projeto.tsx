"use client";

import { useState, useTransition } from "react";
import { Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { removerNecessidade, salvarNecessidade } from "@/modules/rh/habilidades/actions";
import { ACAO_NECESSIDADE_EDITAR, ACAO_NECESSIDADE_REMOVER, itensDeNecessidade } from "@/modules/rh/habilidades/acoes-necessidade";
import type { CompetenciasDoProjeto, NecessidadeDoProjeto } from "@/modules/rh/habilidades/queries";
import { NIVEIS } from "@/modules/rh/habilidades/regras";

type Props = { projetoId: string; dados: CompetenciasDoProjeto; podeEditar: boolean };

type Edicao = { habilidadeId: string; nivelMinimo: string; observacao: string; existente: NecessidadeDoProjeto | null };

/**
 * "Competências que o projeto precisa" (Visão Geral): competência + nível mínimo, e quem já cobre.
 * Substitui a lista que vivia em Recursos. A folga das pessoas no período continua em Recursos.
 */
export function CompetenciasDoProjeto({ projetoId, dados, podeEditar }: Props) {
  const confirm = useConfirm();
  const [pendente, startTransition] = useTransition();
  const [edicao, setEdicao] = useState<Edicao | null>(null);

  const usadas = new Set(dados.necessidades.map((n) => n.habilidadeId));
  const disponiveis = dados.catalogo.filter((h) => !usadas.has(h.id));
  const motivoSemOpcao =
    disponiveis.length > 0
      ? null
      : dados.catalogo.length === 0
        ? "Nenhuma competência publicada pelo RH ainda."
        : "Todas as competências publicadas já estão neste projeto.";
  const abrirNova = () => setEdicao({ habilidadeId: "", nivelMinimo: "3", observacao: "", existente: null });
  const falhaDeRede = () => toast.error("Não foi possível concluir. Verifique a conexão e tente de novo.");

  async function executar(n: NecessidadeDoProjeto, item: AcaoItemAcao) {
    if (item.id === ACAO_NECESSIDADE_EDITAR) {
      setEdicao({ habilidadeId: n.habilidadeId, nivelMinimo: String(n.nivelMinimo), observacao: n.observacao ?? "", existente: n });
      return;
    }
    if (item.id !== ACAO_NECESSIDADE_REMOVER) return;
    // Confirma ANTES de abrir a transição (regra do projeto).
    const ok = await confirm({
      title: item.confirmar?.titulo ?? "Remover?",
      description: item.confirmar?.descricao,
      confirmLabel: item.confirmar?.rotuloConfirmar,
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const r = await removerNecessidade({ id: n.id });
        if (r.ok) {
          toast.success("Competência removida do projeto.");
          // A linha removida leva o foco junto: devolve ao botão Adicionar do cartão.
          requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`competencias-adicionar-${projetoId}`)?.focus()));
        } else toast.error(r.error);
      } catch {
        falhaDeRede();
      }
    });
  }

  function salvar(e: Edicao) {
    startTransition(async () => {
      try {
        const r = await salvarNecessidade({
          projetoId,
          habilidadeId: e.habilidadeId,
          nivelMinimo: Number(e.nivelMinimo),
          observacao: e.observacao.trim() || null,
        });
        if (r.ok) {
          toast.success("Competência salva.");
          setEdicao(null);
        } else toast.error(r.error);
      } catch {
        falhaDeRede();
      }
    });
  }

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm">Competências que o projeto precisa</CardTitle>
            <CardDescription>Nível mínimo exigido e quem já cobre. A folga no período fica em Recursos.</CardDescription>
          </div>
          {podeEditar && (
            <Button id={`competencias-adicionar-${projetoId}`} type="button" size="sm" variant="outline" disabled={motivoSemOpcao !== null} onClick={abrirNova}>
              <Plus aria-hidden className="mr-1.5 size-3.5" /> Adicionar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {podeEditar && motivoSemOpcao && <p className="mb-2 text-xs text-muted-foreground">{motivoSemOpcao}</p>}
        {dados.necessidades.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Nenhuma competência exigida"
            description={podeEditar ? "Adicione as competências que o projeto precisa para o RH e a coordenação enxergarem lacunas." : undefined}
            action={
              podeEditar && !motivoSemOpcao ? (
                <Button type="button" size="sm" onClick={abrirNova}>
                  <Plus aria-hidden className="mr-1.5 size-3.5" /> Adicionar
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2" aria-label="Competências exigidas pelo projeto">
            {dados.necessidades.map((n) => {
              const itens = itensDeNecessidade({ podeEditar, competencia: n.habilidade });
              const total = n.aptosValidados + n.aptosDeclarados;
              return (
                <LinhaComMenu key={n.id} itens={itens} onSelect={(item) => void executar(n, item)} render={<li className="rounded-md border p-2.5" />}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {n.habilidade} <span className="font-normal text-muted-foreground">· mínimo {NIVEIS[n.nivelMinimo]?.rotulo ?? n.nivelMinimo}</span>
                      </p>
                      {n.observacao && <p className="text-xs text-muted-foreground">{n.observacao}</p>}
                      {total === 0 ? (
                        <p className="mt-1 text-xs font-medium text-warning-text">Lacuna: ninguém no nível exigido.</p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {total} {total === 1 ? "pessoa cobre" : "pessoas cobrem"} ({n.aptosValidados} validada{n.aptosValidados === 1 ? "" : "s"}, {n.aptosDeclarados} só declarada
                          {n.aptosDeclarados === 1 ? "" : "s"})
                          {n.pessoas && n.pessoas.length > 0 && (
                            <>
                              {": "}
                              {n.pessoas.map((p) => `${p.nome} (${p.nivel}${p.validado ? "" : ", declarado"})`).join(", ")}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    <BotaoAcoes itens={itens} onSelect={(item) => void executar(n, item)} rotulo={`Ações da competência ${n.habilidade}`} className="size-7" />
                  </div>
                </LinhaComMenu>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={edicao !== null} onOpenChange={(aberto) => !aberto && setEdicao(null)}>
        <DialogContent>
          {edicao && (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                salvar(edicao);
              }}
              className="flex min-h-0 flex-col gap-4"
            >
              <DialogHeader>
                <DialogTitle>{edicao.existente ? `Alterar ${edicao.existente.habilidade}` : "Adicionar competência ao projeto"}</DialogTitle>
                <DialogDescription>Escolha a competência e o nível mínimo que o projeto exige. Só entram competências publicadas pelo RH.</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-3">
                {!edicao.existente && (
                  <div className="space-y-1.5">
                    <Label htmlFor="comp-habilidade">Competência</Label>
                    <Select value={edicao.habilidadeId} onValueChange={(v) => v && setEdicao({ ...edicao, habilidadeId: v })}>
                      <SelectTrigger id="comp-habilidade" aria-label="Competência">
                        <SelectValue placeholder="Escolha" />
                      </SelectTrigger>
                      <SelectContent>
                        {disponiveis.map((h) => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="comp-nivel">Nível mínimo</Label>
                  <Select value={edicao.nivelMinimo} onValueChange={(v) => v && setEdicao({ ...edicao, nivelMinimo: v })}>
                    <SelectTrigger id="comp-nivel" aria-label="Nível mínimo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(NIVEIS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v.rotulo} — {v.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="comp-obs">Observação (opcional)</Label>
                  <textarea
                    id="comp-obs"
                    rows={2}
                    maxLength={300}
                    value={edicao.observacao}
                    onChange={(e) => setEdicao({ ...edicao, observacao: e.target.value })}
                    className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEdicao(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pendente || !edicao.habilidadeId}>
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
