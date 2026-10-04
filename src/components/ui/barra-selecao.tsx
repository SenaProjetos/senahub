"use client";

import { X } from "lucide-react";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { acimaDoTeto, motivoAcimaDoTeto } from "@/lib/lote";
import { cn } from "@/lib/utils";

const CLASSE_BOTAO_CLARO = "bg-background text-foreground hover:bg-muted hover:text-foreground";

/**
 * Barra de ações em lote — uma só para o sistema (decisão do dono, 2026-09-20).
 *
 * Come o MESMO `AcaoItem[]` do menu de contexto e do `...`: assim a lista de ações de uma entidade
 * é escrita uma vez e aparece nos três lugares, com os mesmos gates e os mesmos motivos.
 *
 * As ações livres viram botão; as que o estado impede ficam no `...` do fim, que é onde o motivo
 * aparece escrito (botão desabilitado não recebe hover, então `title` nele não seria lido).
 *
 * **Variante `cabecalho`** (pedido do dono, 2026-10-04: embaixo ela ficava longe do "selecionar todos",
 * onde a seleção começa): a barra cobre o cabeçalho da tabela e repõe o checkbox dele. Vai como
 * primeiro filho da caixa da tabela, ANTES do `<Table>`; tem a altura do cabeçalho (`h-9`) e `-mb-9`,
 * então aparece sem empurrar as linhas, e é `sticky top-0` para seguir à vista ao rolar. A caixa precisa
 * de `overflow-clip`, não `overflow-hidden`: `hidden` vira contêiner de rolagem e prende o `sticky`
 * numa caixa que não rola. Abaixo de `xl` os botões mostram só o ícone (o rótulo fica no `title`).
 * Lista de cartões no celular não tem cabeçalho: lá continua a variante `rodape`, ao alcance do polegar.
 */
export function BarraSelecao({
  total,
  itens,
  onSelect,
  onLimpar,
  substantivo,
  genero = "m",
  rotulo,
  progresso,
  pendente = false,
  comTeto = true,
  variante = "rodape",
  todasMarcadas,
  onAlternarTodas,
  className,
}: {
  total: number;
  itens: readonly AcaoItem[];
  onSelect: (item: AcaoItemAcao) => void;
  onLimpar: () => void;
  /** Par singular/plural do que está selecionado: ["documento", "documentos"]. */
  substantivo: [string, string];
  /** Concordância de "selecionado(s)": "campanhas selecionadas", "lançamentos selecionados". */
  genero?: "m" | "f";
  /** Troca a contagem padrão ("3 documentos selecionados") quando a tela precisa dizer mais. */
  rotulo?: string;
  /** Enquanto o lote roda: mostra o andamento no lugar da contagem. */
  progresso?: { feitos: number; total: number } | null;
  /** Ação em curso fora do `progresso` (ex.: uma Server Action única): trava os botões. */
  pendente?: boolean;
  /**
   * `false` quando cada ação já vai ao servidor em UMA chamada (ex.: o .zip e o lote da aba Arquivos):
   * o teto existe para o `useLote`, que repete a action por item no navegador.
   */
  comTeto?: boolean;
  variante?: "rodape" | "cabecalho";
  /** Só no cabeçalho: o checkbox de "selecionar todos" que a barra cobre. */
  todasMarcadas?: boolean;
  onAlternarTodas?: () => void;
  className?: string;
}) {
  if (total === 0) return null;

  const emCurso = progresso ?? null;
  const travada = emCurso !== null || pendente;
  const excedeu = comTeto && acimaDoTeto(total);
  const noCabecalho = variante === "cabecalho";
  const acoesLivres = itens.filter(
    (i): i is AcaoItemAcao => i.tipo === "acao" && !i.desabilitado,
  );
  const nomeDoTotal = total === 1 ? substantivo[0] : substantivo[1];
  const contagem =
    rotulo ??
    `${total} ${nomeDoTotal} ${genero === "f" ? (total === 1 ? "selecionada" : "selecionadas") : total === 1 ? "selecionado" : "selecionados"}`;

  return (
    <div
      role="region"
      aria-label="Ações da seleção"
      className={cn(
        "z-10 flex items-center gap-2 bg-primary text-primary-foreground",
        noCabecalho
          ? "sticky top-0 z-20 -mb-9 h-9 overflow-hidden px-2"
          : "sticky bottom-3 flex-wrap justify-between rounded-md border border-border px-3 py-2 shadow-md",
        className,
      )}
    >
      {noCabecalho && onAlternarTodas && (
        <Checkbox
          checked={todasMarcadas}
          onCheckedChange={onAlternarTodas}
          aria-label={todasMarcadas ? "Desmarcar todos" : "Marcar todos desta lista"}
          // Sobre o fundo primário o marcado padrão (primário) sumiria: aqui ele é invertido.
          className="shrink-0 border-primary-foreground/70 data-checked:border-primary-foreground data-checked:bg-primary-foreground data-checked:text-primary dark:data-checked:bg-primary-foreground"
        />
      )}

      <span
        className={cn("font-medium tabular-nums", noCabecalho ? "min-w-0 truncate text-xs" : "text-sm")}
        aria-live="polite"
      >
        {emCurso ? `Processando ${emCurso.feitos} de ${emCurso.total}…` : contagem}
      </span>

      <div className={cn("flex items-center gap-1.5", noCabecalho ? "ml-auto shrink-0" : "flex-wrap")}>
        {excedeu ? (
          <span className="text-xs text-primary-foreground/90">{motivoAcimaDoTeto(total)}</span>
        ) : (
          acoesLivres.map((item) => {
            const Icone = item.icone;
            const destrutivo = item.variant === "destructive";
            return (
              <Button
                key={item.id}
                size={noCabecalho ? "xs" : "sm"}
                // No cabeçalho o `destructive` (vermelho translúcido) some sobre o primário: fundo claro, texto vermelho.
                variant={destrutivo && !noCabecalho ? "destructive" : "outline"}
                className={
                  destrutivo
                    ? noCabecalho
                      ? cn(CLASSE_BOTAO_CLARO, "text-destructive hover:text-destructive")
                      : undefined
                    : CLASSE_BOTAO_CLARO
                }
                onClick={() => onSelect(item)}
                disabled={travada}
                title={noCabecalho ? item.rotulo : undefined}
              >
                {Icone ? <Icone className={noCabecalho ? undefined : "size-3.5"} aria-hidden /> : null}
                {noCabecalho ? <span className="max-xl:sr-only">{item.rotulo}</span> : item.rotulo}
              </Button>
            );
          })
        )}

        {/* A lista completa, com os itens impedidos e o motivo de cada um. */}
        <BotaoAcoes
          itens={itens}
          onSelect={onSelect}
          rotulo={`Todas as ações para ${total} ${nomeDoTotal}`}
          className={cn(noCabecalho ? "size-6" : "size-7", CLASSE_BOTAO_CLARO)}
        />

        <Button
          size={noCabecalho ? "icon-xs" : "sm"}
          variant="ghost"
          onClick={onLimpar}
          aria-label="Limpar seleção"
          disabled={emCurso !== null}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
