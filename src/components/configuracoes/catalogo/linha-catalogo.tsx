"use client";

import { Plus } from "lucide-react";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { cn } from "@/lib/utils";
import { ACAO_ADICIONAR_SUB, acaoUnica } from "@/modules/projetos/nomenclatura/catalogo/acoes";
import type { AlvoCatalogo, LinhaCatalogo } from "@/modules/projetos/nomenclatura/catalogo/versao";
import { SiglaOficial, SiglaSinonimo } from "./sigla-chips";

const ESTRUTURA: Record<AlvoCatalogo["tipo"], string> = { disciplina: "CARD", subdisciplina: "SUB", prancha: "" };

function SituacaoBadge({ linha, versao }: { linha: LinhaCatalogo; versao: number }) {
  if (linha.situacao === "entra") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        novo na v{versao}
      </Badge>
    );
  }
  if (linha.situacao === "sigla-nova") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        sigla nova{linha.siglaAnterior ? ` · era ${linha.siglaAnterior}` : ""}
      </Badge>
    );
  }
  return null;
}

/**
 * Uma linha do catálogo na lente de uma versão. O menu de contexto e o `...` leem o MESMO
 * `menuItens` (ADR-0002); o `+` do card é atalho de uma ação que também está no menu.
 * Componente no nível do arquivo: dentro do pai ele remontaria a cada render e fecharia o menu aberto.
 */
export function LinhaCatalogoItem({
  linha,
  versao,
  menuItens,
  onSelect,
  pending,
}: {
  linha: LinhaCatalogo;
  versao: number;
  menuItens: AcaoItem[];
  onSelect: (acao: AcaoItemAcao) => void;
  pending: boolean;
}) {
  const estrutura = ESTRUTURA[linha.alvo.tipo];
  const adicionarSub = menuItens.find((i): i is AcaoItemAcao => i.tipo === "acao" && i.id === ACAO_ADICIONAR_SUB);
  // Linha com uma ação só não tem menu (ADR-0002, regra 4): vira um botão visível.
  const unica = acaoUnica(menuItens);
  const Icone = unica?.icone;
  return (
    <LinhaComMenu
      itens={unica ? [] : menuItens}
      onSelect={onSelect}
      render={
        <div
          className={cn(
            "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-1 text-sm data-[popup-open]:bg-muted/50",
            linha.alvo.tipo === "disciplina" && "font-semibold",
          )}
        />
      }
    >
      <span className="min-w-0 flex-1 basis-40 break-words">{linha.nome}</span>
      {estrutura && <span className="w-9 text-[10px] font-bold tracking-wider text-muted-foreground">{estrutura}</span>}
      <span className="flex flex-wrap items-center gap-1.5 sm:w-56">
        {linha.sigla ? <SiglaOficial sigla={linha.sigla} /> : <span className="text-xs font-normal text-muted-foreground">sem sigla</span>}
        {linha.sinonimos.map((s) => (
          <SiglaSinonimo key={s} sigla={s} />
        ))}
      </span>
      <span className="sm:w-40">
        <SituacaoBadge linha={linha} versao={versao} />
      </span>
      <span className="ml-auto flex w-20 items-center justify-end">
        {adicionarSub && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Adicionar sub-disciplina em ${linha.nome}`}
            title="Adicionar sub-disciplina"
            disabled={pending}
            onClick={() => onSelect(adicionarSub)}
          >
            <Plus className="size-4" />
          </Button>
        )}
        {unica ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`${unica.rotulo.replace("…", "")} — ${linha.nome}`}
            title={unica.rotulo.replace("…", "")}
            disabled={pending || !!unica.desabilitado}
            onClick={() => onSelect(unica)}
          >
            {Icone && <Icone className="size-4" />}
          </Button>
        ) : (
          <BotaoAcoes itens={menuItens} onSelect={onSelect} rotulo={`Ações de ${linha.nome}`} className="size-8" />
        )}
      </span>
    </LinhaComMenu>
  );
}
