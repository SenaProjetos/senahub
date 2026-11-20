"use client";

import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import type { ModeloDoPortal } from "@/modules/portal/modelo3d/queries";
import type { PavimentoUnido } from "@/modules/portal/modelo3d/regras";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** Como cada modelo pronto está na cena do navegador. */
export type EstadoNaCena = { tipo: "fila" } | { tipo: "carregando" } | { tipo: "carregado" } | { tipo: "falhou"; erro: string };

export type CorteHorizontal = { ativo: boolean; posicao: number };

/** Metros com duas casas, como numa cota de planta ("2,50 m"). */
function metros(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function Secao({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)} aria-label={titulo}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

/** O nome do arquivo vai na segunda linha, a menos que o rótulo já termine nele (IFC enviado pelo cliente). */
function segundaLinha(m: ModeloDoPortal): string | null {
  return m.rotulo.endsWith(m.nomeArquivo) ? null : m.nomeArquivo;
}

function LinhaModelo({
  modelo,
  estado,
  ligado,
  destaque,
  onLigar,
  onTentarDeNovo,
}: {
  modelo: ModeloDoPortal;
  estado: EstadoNaCena | undefined;
  ligado: boolean;
  destaque: boolean;
  onLigar: (ligar: boolean) => void;
  onTentarDeNovo: () => void;
}) {
  const id = `modelo-${modelo.modeloId}`;
  const arquivo = segundaLinha(modelo);
  const carregado = estado?.tipo === "carregado";
  return (
    <li className={cn("rounded-md border p-2", destaque && "border-primary")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor={id} className="block break-words text-sm leading-snug font-medium">
            {modelo.rotulo}
          </Label>
          {arquivo && <p className="truncate text-xs text-muted-foreground" title={arquivo}>{arquivo}</p>}
          {destaque && <p className="text-xs text-primary">Em destaque</p>}
        </div>
        {modelo.situacao === "pronto" && (
          <Switch
            id={id}
            checked={carregado && ligado}
            disabled={!carregado}
            onCheckedChange={(v) => onLigar(v)}
            aria-label={`${ligado ? "Esconder" : "Mostrar"} ${modelo.rotulo}`}
          />
        )}
      </div>
      {modelo.situacao === "preparando" && (
        <p className="mt-1 text-xs text-muted-foreground">Em preparação. Volte daqui a pouco para ver este modelo.</p>
      )}
      {modelo.situacao === "erro" && (
        <p className="mt-1 text-xs text-destructive-text">Este modelo não pôde ser preparado. Fale com a equipe do projeto.</p>
      )}
      {modelo.situacao === "pronto" && (estado?.tipo === "carregando" || estado?.tipo === "fila") && (
        <p role="status" className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden /> {estado.tipo === "fila" ? "Na fila…" : "Abrindo o modelo…"}
        </p>
      )}
      {estado?.tipo === "falhou" && (
        <div className="mt-1 space-y-1">
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive-text">
            <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden /> {estado.erro}
          </p>
          <Button size="sm" variant="outline" className="h-7" onClick={onTentarDeNovo}>
            <RotateCw className="size-3.5" /> Tentar de novo
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Painel lateral (folha no celular) do 3D do portal: modelos com liga/desliga, pavimentos, corte horizontal e as
 * propriedades do elemento selecionado.
 */
export function PainelModelo({
  modelos,
  estados,
  desligados,
  destaque,
  onLigar,
  onTentarDeNovo,
  onTirarDestaque,
  pavimentos,
  pavimentoSel,
  onPavimento,
  corte,
  onCorte,
  alturaDoCorte,
  propriedades,
}: {
  modelos: ModeloDoPortal[];
  estados: ReadonlyMap<string, EstadoNaCena>;
  desligados: ReadonlySet<string>;
  destaque: string | null;
  onLigar: (modeloId: string, ligar: boolean) => void;
  onTentarDeNovo: (modeloId: string) => void;
  onTirarDestaque: () => void;
  pavimentos: PavimentoUnido[];
  pavimentoSel: string | null;
  onPavimento: (chave: string | null) => void;
  corte: CorteHorizontal;
  onCorte: (corte: CorteHorizontal) => void;
  /** Altura do plano acima da base dos modelos (metros), quando há modelo na cena. */
  alturaDoCorte: number | null;
  propriedades: React.ReactNode;
}) {
  const algumCarregado = [...estados.values()].some((e) => e.tipo === "carregado");
  // A altura absoluta no mundo do visualizador depende de qual modelo abriu primeiro; a diferença entre pisos, não.
  const pisos = pavimentos.map((p) => p.pisoY).filter(Number.isFinite);
  const pisoMaisBaixo = pisos.length > 0 ? Math.min(...pisos) : null;
  return (
    <div className="space-y-4">
      <Secao titulo="Modelos">
        <ul className="space-y-2">
          {modelos.map((m) => (
            <LinhaModelo
              key={m.modeloId}
              modelo={m}
              estado={estados.get(m.modeloId)}
              ligado={!desligados.has(m.modeloId)}
              destaque={destaque === m.modeloId}
              onLigar={(v) => onLigar(m.modeloId, v)}
              onTentarDeNovo={() => onTentarDeNovo(m.modeloId)}
            />
          ))}
        </ul>
        {destaque && (
          <Button size="sm" variant="outline" className="w-full" onClick={onTirarDestaque}>
            Tirar o destaque
          </Button>
        )}
      </Secao>

      <Separator />

      <Secao titulo="Pavimentos">
        {pavimentos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {algumCarregado ? "Os modelos ligados não informam pavimentos." : "Aparecem quando um modelo abrir."}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {pisoMaisBaixo !== null && (
              <p className="text-xs text-muted-foreground">Altura do piso a partir do pavimento mais baixo.</p>
            )}
            <BotaoPavimento ativo={pavimentoSel === null} onClick={() => onPavimento(null)}>
              Todos
            </BotaoPavimento>
            {pavimentos.map((p) => (
              <BotaoPavimento key={p.chave} ativo={pavimentoSel === p.chave} onClick={() => onPavimento(p.chave)}>
                <span className="min-w-0 flex-1 truncate" title={p.nome}>
                  {p.nome}
                </span>
                {pisoMaisBaixo !== null && Number.isFinite(p.pisoY) && (
                  <span className="shrink-0 font-mono text-xs opacity-80">{metros(p.pisoY - pisoMaisBaixo)}</span>
                )}
              </BotaoPavimento>
            ))}
          </div>
        )}
      </Secao>

      <Separator />

      <Secao titulo="Corte">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="corte-horizontal">Corte horizontal</Label>
          <Switch
            id="corte-horizontal"
            checked={corte.ativo}
            disabled={!algumCarregado}
            onCheckedChange={(v) => onCorte({ ...corte, ativo: v })}
          />
        </div>
        {corte.ativo && (
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(corte.posicao * 100)}
              onChange={(e) => onCorte({ ...corte, posicao: Number(e.target.value) / 100 })}
              className="w-full accent-primary"
              aria-label="Altura do corte"
              aria-valuetext={alturaDoCorte !== null ? `${metros(alturaDoCorte)} acima da base` : undefined}
            />
            <p className="text-xs text-muted-foreground">
              {alturaDoCorte !== null
                ? `Corta a ${metros(alturaDoCorte)} da base do modelo; acima disso fica escondido.`
                : "Acima da altura escolhida fica escondido."}
            </p>
          </div>
        )}
      </Secao>

      <Separator />

      <Secao titulo="Propriedades">{propriedades}</Secao>
    </div>
  );
}

function BotaoPavimento({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant={ativo ? "default" : "ghost"}
      size="sm"
      aria-pressed={ativo}
      onClick={onClick}
      className="w-full justify-start gap-2 text-left"
    >
      {children}
    </Button>
  );
}
