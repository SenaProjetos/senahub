"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { cn } from "@/lib/utils";
import { acaoUnica } from "@/modules/projetos/nomenclatura/catalogo/acoes";
import { rotuloSiglas, type LinhaTodas } from "@/modules/projetos/nomenclatura/catalogo/todas";
import { SiglaOficial, SiglaSinonimo } from "./sigla-chips";

/** Colunas do mockup: caixa · nome · CARD/SUB · existe em · siglas · em uso · ações (a partir de md). */
export const GRADE_TODAS = "md:grid md:grid-cols-[28px_minmax(0,1fr)_44px_130px_minmax(0,320px)_72px_40px] md:gap-x-3";

const ESTRUTURA = { disciplina: "CARD", subdisciplina: "SUB", prancha: "" } as const;

/**
 * Uma linha da lente Todas as versões. O menu de contexto e o `...` leem o MESMO `menuItens`
 * (ADR-0002); linha com uma ação só vira botão. Componente no nível do arquivo: dentro do pai ele
 * remontaria a cada render e fecharia o menu aberto.
 */
export function LinhaTodasItem({
  linha,
  donoNome,
  usoRotulo,
  usoHref,
  selecionavel,
  marcado,
  onAlternar,
  aoAbrirMenu,
  menuItens,
  onSelect,
  onVerSiglas,
  pending,
}: {
  linha: LinhaTodas;
  /** Nome do card, quando a linha é sub (para o leitor de tela). */
  donoNome?: string;
  /** "18 proj.", "3 etapas"… ou null (mostra "—"). */
  usoRotulo: string | null;
  /** Leva à lista do que usa o item (ex.: projetos com a disciplina). */
  usoHref?: string;
  selecionavel: boolean;
  marcado: boolean;
  onAlternar: () => void;
  aoAbrirMenu: (aberto: boolean) => void;
  menuItens: AcaoItem[];
  onSelect: (acao: AcaoItemAcao) => void;
  onVerSiglas: () => void;
  pending: boolean;
}) {
  const ehSub = linha.alvo.tipo === "subdisciplina";
  const rotuloLinha = ehSub && donoNome ? `${linha.nome}, sub de ${donoNome}` : linha.nome;
  const unica = acaoUnica(menuItens);
  const Icone = unica?.icone;
  return (
    <LinhaComMenu
      itens={unica ? [] : menuItens}
      onSelect={onSelect}
      aoAbrir={aoAbrirMenu}
      render={
        <div
          data-marcada={marcado}
          className={cn(
            "flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-t py-1.5 pl-4 pr-3 text-sm data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50",
            GRADE_TODAS,
            !linha.ativo && "opacity-60",
          )}
        />
      }
    >
      <span className="flex w-7 shrink-0 items-center">
        {selecionavel && <Checkbox checked={marcado} onCheckedChange={onAlternar} aria-label={`Selecionar ${rotuloLinha}`} />}
      </span>
      <span className={cn("min-w-0 flex-1 basis-40 break-words", ehSub ? "pl-5" : "font-semibold", !linha.ativo && "line-through")}>
        {linha.nome}
        {!linha.ativo && (
          <Badge variant="outline" className="ml-2 align-middle text-[10px] font-normal text-muted-foreground no-underline">
            arquivada
          </Badge>
        )}
      </span>
      <span className="text-[10px] font-bold tracking-wider text-muted-foreground md:w-11">{ESTRUTURA[linha.alvo.tipo]}</span>
      <span>{linha.existeEm}</span>
      <button
        type="button"
        onClick={onVerSiglas}
        aria-label={rotuloSiglas(rotuloLinha, linha.siglas)}
        title="Ver o histórico de siglas"
        className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-sm text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {linha.siglas.length === 0 ? (
          <span className="text-xs text-muted-foreground">sem sigla</span>
        ) : (
          linha.siglas.map((s) => (
            <span key={`${s.sigla}-${s.faixa.versaoDesde}-${s.oficial}`} className="inline-flex items-center gap-1">
              {s.oficial ? <SiglaOficial sigla={s.sigla} /> : <SiglaSinonimo sigla={s.sigla} />}
              {s.rotulo && <span className="text-[11px] text-muted-foreground">{s.rotulo}</span>}
            </span>
          ))
        )}
      </button>
      {usoRotulo && usoHref ? (
        <Link href={usoHref} className="text-muted-foreground hover:text-foreground hover:underline" title={`Ver os projetos com ${linha.nome}`}>
          {usoRotulo}
        </Link>
      ) : (
        <span className="text-muted-foreground">{usoRotulo ?? "—"}</span>
      )}
      <span className="ml-auto flex items-center justify-end md:ml-0">
        {unica ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`${unica.rotulo.replace("…", "")} — ${rotuloLinha}`}
            title={unica.rotulo.replace("…", "")}
            disabled={pending || !!unica.desabilitado}
            onClick={() => onSelect(unica)}
          >
            {Icone && <Icone className="size-4" />}
          </Button>
        ) : (
          <BotaoAcoes itens={menuItens} onSelect={onSelect} rotulo={`Ações de ${rotuloLinha}`} className="size-8" />
        )}
      </span>
    </LinhaComMenu>
  );
}
