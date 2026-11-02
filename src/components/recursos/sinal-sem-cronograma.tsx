import Link from "next/link";
import { FileClock } from "lucide-react";
import { formatarCodigo } from "@/modules/projetos/numbering";
import type { ProjetoRef } from "@/modules/planejamento/recursos-filtros";

/**
 * Sinal de que a pessoa está em projeto ativo SEM cronograma aprovado: a carga dele não existe nas EAPs,
 * então `/recursos` não a soma nem pinta sobrecarga — só avisa. `detalhado` lista um link por projeto
 * para a EAP, onde se resolve.
 */
export function SinalSemCronograma({ projetos, detalhado = false }: { projetos: ProjetoRef[]; detalhado?: boolean }) {
  if (projetos.length === 0) return null;
  const nomes = projetos.map((p) => `${formatarCodigo(p.codigo)} · ${p.nome}`).join("; ");
  const titulo = `Em projeto sem cronograma aprovado: ${nomes}. Não soma horas na carga.`;
  if (!detalhado) {
    return (
      <span
        title={titulo}
        className="inline-flex items-center gap-1 rounded-sm border border-dashed border-warning/50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-warning"
      >
        <FileClock className="size-3" aria-hidden /> sem cronograma
        <span className="sr-only">: {nomes}</span>
      </span>
    );
  }
  return (
    <>
      {projetos.map((p) => (
        <Link
          key={p.id}
          href={`/projetos/${p.id}/eap`}
          title={`${p.nome} — sem cronograma aprovado; não soma horas. Abrir a EAP.`}
          aria-label={`${formatarCodigo(p.codigo)} ${p.nome}, sem cronograma aprovado: abrir a EAP`}
          className="inline-flex items-center gap-1 rounded-sm border border-dashed border-warning/50 px-1.5 py-0.5 font-mono text-[11px] text-warning hover:bg-warning/10"
        >
          <FileClock className="size-3" aria-hidden /> {formatarCodigo(p.codigo)}
          <span className="text-[9px] uppercase">sem cronograma</span>
        </Link>
      ))}
    </>
  );
}
