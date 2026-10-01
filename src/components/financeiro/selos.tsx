import { cn } from "@/lib/utils";
import type { Confianca, Prioridade } from "@/modules/financeiro/liquidez/tipos";

/**
 * Selos do planejador (mock "Padrões"): sempre com texto, nunca só cor. Prioridade distingue-se em
 * preto e branco (cheio, contorno, texto, tracejado); confiança é lida pela quantidade de barras.
 */

const PRIORIDADE: Record<Prioridade, { rotulo: string; descricao: string; classe: string }> = {
  p1: { rotulo: "P1", descricao: "não pode atrasar", classe: "border-primary bg-primary text-primary-foreground" },
  p2: { rotulo: "P2", descricao: "importante", classe: "border-primary text-foreground" },
  p3: { rotulo: "P3", descricao: "pode negociar", classe: "border-border text-muted-foreground" },
  p4: { rotulo: "P4", descricao: "adiável", classe: "border-dashed border-border text-muted-foreground" },
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  p1: "P1 · não pode atrasar",
  p2: "P2 · importante",
  p3: "P3 · pode negociar",
  p4: "P4 · adiável",
};

export function SeloPrioridade({ prioridade, className }: { prioridade: Prioridade; className?: string }) {
  const p = PRIORIDADE[prioridade];
  return (
    <span
      title={`${p.rotulo}: ${p.descricao}`}
      className={cn("inline-flex h-6 items-center rounded-sm border px-2 text-xs font-semibold", p.classe, className)}
    >
      {p.rotulo}
    </span>
  );
}

const CONFIANCA: Record<Confianca, { rotulo: string; barras: number; descricao: string }> = {
  confirmada_cliente: { rotulo: "Confirmada pelo cliente", barras: 4, descricao: "o cliente confirmou; não quer dizer recebida" },
  provavel: { rotulo: "Provável", barras: 3, descricao: "faturada, ainda sem confirmação" },
  estimada: { rotulo: "Estimada", barras: 2, descricao: "previsão do cronograma" },
  incerta: { rotulo: "Incerta", barras: 1, descricao: "vencida há mais de 30 dias" },
};

export const ROTULO_CONFIANCA: Record<Confianca, string> = {
  confirmada_cliente: "Confirmada pelo cliente",
  provavel: "Provável",
  estimada: "Estimada",
  incerta: "Incerta",
};

export function SeloConfianca({ confianca, className }: { confianca: Confianca; className?: string }) {
  const c = CONFIANCA[confianca];
  return (
    <span title={c.descricao} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", className)}>
      <span aria-hidden className="inline-flex gap-px">
        {[0, 1, 2, 3].map((i) => (
          <i
            key={i}
            className={cn("inline-block h-2.5 w-1.5 border border-foreground", i < c.barras && "bg-foreground")}
          />
        ))}
      </span>
      {c.rotulo}
    </span>
  );
}
