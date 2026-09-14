"use client";

import { AlertTriangle, Clock, ShieldCheck, FileX, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PanoramaCompliance } from "@/modules/certidoes/service";
import type { Filtros } from "@/components/certidoes/tipos";

/**
 * §3 — resumo operacional em quatro cards compactos.
 *
 * Os cards SÃO os filtros rápidos de situação: o §17 pedia chips com as mesmas quatro contagens,
 * e renderizar o mesmo controle duas vezes na mesma dobra só duplicaria a decisão do usuário.
 * Sobraram como aba de verdade apenas "Todas" e "Excluídas", que os cards não cobrem.
 *
 * As contagens vêm prontas do servidor (`panoramaCompliance`), não recontadas aqui (§17/§23).
 *
 * "Sem documento" é uma dimensão SEPARADA de validade (§5) — por isso é um card à parte e não um
 * quarto valor de situação. Clicar nele filtra por documento, sem mexer no filtro de situação.
 */
type Card = {
  chave: "vencida" | "vence_em_breve" | "ok" | "sem_documento";
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  /** Cor só no ícone e no número — o card em si fica neutro (§21: nada de dashboard colorido). */
  cor: string;
  fundo: string;
};

const CARDS: Card[] = [
  {
    chave: "vencida",
    titulo: "Vencidas",
    descricao: "Precisam de atualização",
    icone: AlertTriangle,
    cor: "text-destructive",
    fundo: "bg-destructive/10",
  },
  {
    chave: "vence_em_breve",
    titulo: "Vencem em breve",
    descricao: "Próximas do vencimento",
    icone: Clock,
    cor: "text-warning",
    fundo: "bg-warning/10",
  },
  {
    chave: "ok",
    titulo: "Regulares",
    descricao: "Dentro da validade",
    icone: ShieldCheck,
    cor: "text-success",
    fundo: "bg-success/10",
  },
  {
    chave: "sem_documento",
    titulo: "Sem documento",
    descricao: "PDF não cadastrado",
    icone: FileX,
    cor: "text-muted-foreground",
    fundo: "bg-muted",
  },
];

export function CertidoesResumo({
  panorama,
  filtros,
  onFiltrar,
}: {
  panorama: PanoramaCompliance;
  filtros: Filtros;
  onFiltrar: (parcial: Partial<Filtros>) => void;
}) {
  const valor = {
    vencida: panorama.vencidas,
    vence_em_breve: panorama.venceEmBreve,
    ok: panorama.ok,
    sem_documento: panorama.semArquivo,
  };

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {CARDS.map((c) => {
        const ativo =
          c.chave === "sem_documento" ? filtros.documento === "sem" : filtros.situacao === c.chave;

        // Clicar de novo no card ativo limpa aquele recorte — sem isso o usuário fica preso no
        // filtro e precisa caçar o "Limpar filtros" para voltar à lista inteira.
        function alternar() {
          if (c.chave === "sem_documento") {
            onFiltrar({ documento: ativo ? "" : "sem" });
          } else {
            onFiltrar({ situacao: ativo ? "" : c.chave });
          }
        }

        return (
          <button
            key={c.chave}
            type="button"
            onClick={alternar}
            aria-pressed={ativo}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
              "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo && "border-primary bg-primary/5",
            )}
          >
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", c.fundo)}>
              <c.icone className={cn("size-5", c.cor)} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className={cn("block text-2xl font-bold leading-none tabular-nums", c.cor)}>
                {valor[c.chave]}
              </span>
              <span className="mt-1 block truncate text-xs font-medium">{c.titulo}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{c.descricao}</span>
            </span>
            {/* O estado ativo não fica só na cor da borda (§20). */}
            {ativo && <span className="sr-only">(filtro aplicado)</span>}
          </button>
        );
      })}
    </div>
  );
}
