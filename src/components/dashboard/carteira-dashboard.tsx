import Link from "next/link";
import { saudeProjeto } from "@/modules/projetos/health";
import { formatarCodigo } from "@/modules/projetos/numbering";
import type { carteiraProjetosDashboard } from "@/modules/dashboard/queries";

type Projeto = Awaited<ReturnType<typeof carteiraProjetosDashboard>>[number];

const SAUDE_BORDER = {
  ok: "border-l-success",
  atencao: "border-l-warning",
  critico: "border-l-destructive",
} as const;
const SAUDE_LABEL = { ok: "Saudável", atencao: "Atenção", critico: "Crítico" } as const;
const SAUDE_TEXT = {
  ok: "text-success",
  atencao: "text-warning",
  critico: "text-destructive",
} as const;

function diasAtraso(prazoFinal: string | null): number {
  if (!prazoFinal) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(prazoFinal + "T00:00:00");
  return Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000));
}

function ProjetoChip({ p }: { p: Projeto }) {
  const saude = saudeProjeto(p.disciplinas, p.prazoFinal ? new Date(p.prazoFinal) : null, "em_andamento");
  const atraso = diasAtraso(p.prazoFinal);
  return (
    <Link
      href={`/projetos/${p.id}`}
      className={`block rounded-md border border-l-4 bg-card p-3 hover:bg-muted/30 ${
        saude ? SAUDE_BORDER[saude] : "border-l-muted"
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-mono text-[11px] text-muted-foreground">{formatarCodigo(p.codigo)}</span>
        {saude && (
          <span className={`text-[10px] font-medium ${SAUDE_TEXT[saude]}`}>{SAUDE_LABEL[saude]}</span>
        )}
      </div>
      <p className="mt-0.5 truncate text-sm font-medium">{p.nome}</p>
      <p className="truncate text-[11px] text-muted-foreground">{p.cliente}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${p.progresso}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{p.progresso}%</span>
        {atraso > 0 && (
          <span className="font-medium text-destructive">+{atraso}d atraso</span>
        )}
      </div>
    </Link>
  );
}

export function CarteiraDashboard({ projetos }: { projetos: Projeto[] }) {
  if (projetos.length === 0) return null;
  const criticos = projetos.filter((p) =>
    saudeProjeto(p.disciplinas, p.prazoFinal ? new Date(p.prazoFinal) : null, "em_andamento") === "critico",
  ).length;
  const atencao = projetos.filter((p) =>
    saudeProjeto(p.disciplinas, p.prazoFinal ? new Date(p.prazoFinal) : null, "em_andamento") === "atencao",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold tracking-tight">Carteira de projetos</h3>
        <div className="flex gap-3 text-xs">
          {criticos > 0 && <span className="text-destructive font-medium">{criticos} crítico{criticos > 1 ? "s" : ""}</span>}
          {atencao > 0 && <span className="text-warning font-medium">{atencao} em atenção</span>}
          <span className="text-muted-foreground">{projetos.length} total</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projetos.map((p) => (
          <ProjetoChip key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
