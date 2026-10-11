import Link from "next/link";
import { FileSignature } from "lucide-react";

/**
 * Tarja no topo do sistema avisando de holerite aguardando assinatura. Não bloqueia nada: o
 * funcionário segue trabalhando e assina quando puder (antes era um redirecionamento a cada
 * navegação, que atrapalhava quando o RH reabria e fechava a folha de novo).
 */
export function TarjaAssinaturaHolerite({ total, revisados }: { total: number; revisados: number }) {
  if (total <= 0) return null;
  const plural = total > 1;
  const texto =
    revisados > 0
      ? `${revisados > 1 ? `${revisados} holerites foram corrigidos` : "Um holerite foi corrigido"} pelo RH e ${
          revisados > 1 ? "precisam" : "precisa"
        } de nova assinatura.`
      : `Você tem ${plural ? `${total} holerites aguardando` : "um holerite aguardando"} sua assinatura.`;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/15 px-4 py-1.5 text-xs"
    >
      <span className="flex items-center gap-1.5 font-medium">
        <FileSignature className="size-3.5 shrink-0 text-warning" aria-hidden />
        {texto}
      </span>
      <Link
        href="/assinar-holerite"
        className="font-semibold underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Conferir e assinar
      </Link>
    </div>
  );
}
