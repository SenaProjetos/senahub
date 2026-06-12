import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import {
  abonosPendentes,
  feriasPendentes,
  climaResumo,
  onboardingsAtivos,
  opcoesOnboarding,
  nfsPendentes,
} from "@/modules/rh/queries";
import { RhAdminView } from "@/components/rh/rh-admin-view";
import { OnboardingAdmin } from "@/components/rh/onboarding-admin";
import { NfAdmin } from "@/components/rh/nf-admin";

export const metadata: Metadata = { title: "RH — administração" };

export default async function RhAdminPage() {
  await requireRole(...HR_ADMIN_ROLES);
  const [abonos, ferias, clima, processos, opcoes, nfs] = await Promise.all([
    abonosPendentes(),
    feriasPendentes(),
    climaResumo(),
    onboardingsAtivos(),
    opcoesOnboarding(),
    nfsPendentes(),
  ]);
  return (
    <div className="space-y-6">
      <RhAdminView abonos={abonos} ferias={ferias} clima={clima} />
      <div className="grid gap-4 lg:grid-cols-2">
        <OnboardingAdmin
          processos={processos.map((p) => ({
            id: p.id,
            user: { name: p.user.name, role: p.user.role },
            itens: p.itens.map((i) => ({ id: i.id, descricao: i.descricao, concluido: i.concluido })),
          }))}
          templates={opcoes.templates.map((t) => ({ id: t.id, nome: t.nome }))}
          usuarios={opcoes.usuarios}
        />
        <NfAdmin
          nfs={nfs.map((n) => ({
            id: n.id,
            user: { name: n.user.name },
            numero: n.numero,
            valor: Number(n.valor),
            arquivoNome: n.arquivoNome,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
