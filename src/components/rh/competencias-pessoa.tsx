"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, GraduationCap, Plus } from "lucide-react";
import { declararMeuNivel, definirNivelPessoa, removerMinhaHabilidade } from "@/modules/rh/habilidades/actions";
import { itensDaCompetencia } from "@/modules/rh/habilidades/acoes";
import { CATEGORIA_LABEL, NIVEIS, type Categoria } from "@/modules/rh/habilidades/regras";
import type { CompetenciasDaPessoa } from "@/modules/rh/habilidades/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarData } from "@/lib/utils";

type Item = CompetenciasDaPessoa["competencias"][number];

/**
 * Competências com nível (F2). `self`: a pessoa declara o nível (Minha conta) — mudar tira a
 * validação. `gestor`: RH/coordenação define e valida o nível de outra pessoa. `leitura`: só vê.
 */
export function CompetenciasPessoa({
  userId,
  dados,
  modo,
  quemId,
}: {
  userId: string;
  dados: CompetenciasDaPessoa;
  modo: "gestor" | "self" | "leitura";
  quemId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [nova, setNova] = useState<{ habilidadeId: string; nivel: string }>({ habilidadeId: "", nivel: "" });
  const ehPropria = userId === quemId;
  const disponiveis = dados.catalogo.filter((h) => !dados.competencias.some((c) => c.habilidadeId === h.id));

  function gravarNivel(c: { habilidadeId: string }, nivel: number | null, validar: boolean) {
    start(async () => {
      const r =
        modo === "self"
          ? await declararMeuNivel({ habilidadeId: c.habilidadeId, nivel: nivel ?? 1 })
          : await definirNivelPessoa({ userId, habilidadeId: c.habilidadeId, nivel, validar });
      if (r.ok) {
        toast.success(modo === "self" ? "Nível declarado. A coordenação vai validar." : validar ? "Nível validado." : "Nível salvo.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function aoSelecionar(c: Item, acao: AcaoItemAcao) {
    if (acao.confirmar) {
      const ok = await confirm({ title: acao.confirmar.titulo, description: acao.confirmar.descricao, confirmLabel: acao.confirmar.rotuloConfirmar, variant: "destructive" });
      if (!ok) return;
    }
    if (acao.id === "validar") gravarNivel(c, c.nivel, true);
    else if (acao.id === "desvalidar") gravarNivel(c, c.nivel, false);
    else if (acao.id === "remover") {
      start(async () => {
        const r = await removerMinhaHabilidade({ habilidadeId: c.habilidadeId });
        if (r.ok) router.refresh();
        else toast.error(r.error);
      });
    }
  }

  function adicionar() {
    const nivel = Number(nova.nivel);
    if (!nova.habilidadeId || !nivel) {
      toast.error("Escolha a competência e o nível.");
      return;
    }
    // Quem gere valida ao incluir (é o validador); a pessoa só declara.
    gravarNivel({ habilidadeId: nova.habilidadeId }, nivel, modo === "gestor" && !ehPropria);
    setNova({ habilidadeId: "", nivel: "" });
  }

  function linha(c: Item) {
    const acoes = itensDaCompetencia(c, { modo, ehPropria });
    const podeMudarNivel = modo === "self" || (modo === "gestor" && !ehPropria);
    return (
      <LinhaComMenu key={c.habilidadeId} itens={acoes} onSelect={(a) => aoSelecionar(c, a)}
        render={<li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {c.nome}
            {c.categoria && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {c.validadoEm ? (
              <span className="inline-flex items-center gap-1 text-success">
                <BadgeCheck className="size-3" /> validado{c.validadoPor ? ` por ${c.validadoPor}` : ""} em {formatarData(c.validadoEm)}
              </span>
            ) : c.nivel != null ? (
              "declarado, ainda não validado"
            ) : (
              "nível não informado"
            )}
          </p>
        </div>
        {podeMudarNivel ? (
          <Select value={c.nivel != null ? String(c.nivel) : ""} onValueChange={(v) => v && gravarNivel(c, Number(v), false)}>
            <SelectTrigger className="h-8 w-44" aria-label={`Nível em ${c.nome}`} disabled={pending}>
              <SelectValue placeholder="Nível…" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(NIVEIS).map(([n, d]) => (
                <SelectItem key={n} value={n}>{d.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-mono text-xs">{c.nivel != null ? NIVEIS[c.nivel].rotulo : "—"}</span>
        )}
        <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionar(c, a)} rotulo={`Ações da competência ${c.nome}`} />
      </LinhaComMenu>
    );
  }

  return (
    <div className="space-y-3">
      {modo === "self" && (
        <p className="text-sm text-muted-foreground">
          Declare o seu nível em cada competência. A coordenação valida; mudar o nível pede uma validação nova.
        </p>
      )}
      {dados.competencias.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Nenhuma competência registrada" />
      ) : (
        <ul className="divide-y rounded-sm border">{dados.competencias.map(linha)}</ul>
      )}
      {modo !== "leitura" && !(modo === "gestor" && ehPropria) && disponiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-2">
          <Select value={nova.habilidadeId} onValueChange={(v) => setNova({ ...nova, habilidadeId: v ?? "" })}>
            <SelectTrigger className="h-8 w-56" aria-label="Competência">
              <SelectValue placeholder="Competência…" />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((h) => (
                <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={nova.nivel} onValueChange={(v) => setNova({ ...nova, nivel: v ?? "" })}>
            <SelectTrigger className="h-8 w-44" aria-label="Nível">
              <SelectValue placeholder="Nível…" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(NIVEIS).map(([n, d]) => (
                <SelectItem key={n} value={n}>{d.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={pending} onClick={adicionar}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}
