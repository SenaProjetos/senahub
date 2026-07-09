import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { escalaUsuarioGrade, escalaRoleGrade } from "@/modules/rh/escalas/queries";
import { EscalaGrade } from "@/components/rh/escala-grade";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Minha escala" };

export default async function MinhaEscalaPage() {
  // Espelho de escala é só para quem tem jornada CLT/estágio.
  const user = await requireRole("clt", "estagiario");
  const [usuario, roleDias] = await Promise.all([
    escalaUsuarioGrade(user.id),
    escalaRoleGrade(user.role),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Minha escala</h1>
        <p className="text-sm text-muted-foreground">
          Sua jornada de trabalho por dia da semana. Somente leitura — ajustes com o RH.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <EscalaGrade temOverride={usuario.temOverride} dias={usuario.dias} roleDias={roleDias} />
        </CardContent>
      </Card>
    </div>
  );
}
