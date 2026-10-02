import Link from "next/link";

/**
 * Abas de Contas (mock de 2026-10-02): "Em aberto" (o que vence) e "Pagas e recebidas" (o que já
 * saiu ou entrou). As duas são rotas da MESMA página, por `?situacao=pagas`, para o link abrir direto na aba.
 * Cada tela a desenha logo depois da barra do Financeiro.
 */
export function AbasContas({ ativa, abertas, pagas }: { ativa: "aberto" | "pagas"; abertas: number; pagas?: number }) {
  const aba = (on: boolean) =>
    `-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
  return (
    <div role="tablist" aria-label="Situação das contas" className="flex flex-wrap border-b">
      <Link href="/financeiro/contas" role="tab" aria-selected={ativa === "aberto"} className={aba(ativa === "aberto")}>
        Em aberto
        <span className="ml-1.5 rounded-sm bg-muted px-1.5 font-mono text-[11px]">{abertas}</span>
      </Link>
      <Link href="/financeiro/contas?situacao=pagas" role="tab" aria-selected={ativa === "pagas"} className={aba(ativa === "pagas")}>
        Pagas e recebidas
        {pagas != null && <span className="ml-1.5 rounded-sm bg-muted px-1.5 font-mono text-[11px]">{pagas}</span>}
      </Link>
    </div>
  );
}
