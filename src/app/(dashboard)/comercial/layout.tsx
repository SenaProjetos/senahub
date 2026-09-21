import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ComercialNav } from "@/components/comercial/comercial-nav";

/**
 * Layout não reexecuta ao navegar entre as filhas — o gate real de cada rota continua na própria
 * `page.tsx` (`requirePermission`). Aqui só decide se o ícone de Configurações aparece.
 */
export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("comercial", "ver");
  const podeGerir = await can(user, "comercial", "gerir");
  // Biblioteca de cláusulas: gate próprio (ADR-0006), mais restrito que `gerir`.
  const podeModelos = await can(user, "comercial", "modelos");

  return (
    <div className="space-y-4">
      <ComercialNav podeGerir={podeGerir} podeModelos={podeModelos} />
      {children}
    </div>
  );
}
