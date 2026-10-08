import Link from "next/link";
import { ClipboardEdit } from "lucide-react";

/**
 * Faixa "Atualize seus dados" — fica no topo de toda tela enquanto houver pedido do RH com algo a
 * preencher. Não tem botão de fechar e nunca bloqueia (CLT precisa bater ponto); com o prazo
 * vencido, ganha destaque.
 */
export function FaixaPedidoDados({ texto, vencido, mensagem }: { texto: string; vencido: boolean; mensagem: string | null }) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm lg:px-6 ${
        vencido ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"
      }`}
    >
      <ClipboardEdit className={`size-4 shrink-0 ${vencido ? "text-destructive" : "text-warning"}`} aria-hidden />
      <p className="min-w-0 flex-1">
        {texto}
        {mensagem && <span className="text-muted-foreground"> “{mensagem}”</span>}
      </p>
      <Link
        href="/minha-ficha?completar=1"
        className="shrink-0 rounded-sm border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        Atualizar agora
      </Link>
    </div>
  );
}
