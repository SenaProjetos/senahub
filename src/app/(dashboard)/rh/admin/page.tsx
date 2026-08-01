import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import {
  abonosPendentes,
  feriasPendentes,
  alteracoesFeriasPendentes,
  feriasAprovadasVigentes,
  climaResumo,
  listarFeedbackHumor,
  onboardingsAtivos,
  opcoesOnboarding,
  nfsPendentes,
  nfsValidadas,
} from "@/modules/rh/queries";
import { fechamentosDoMes, saldoCorrenteEquipe, primeiroMesFechado } from "@/modules/rh/banco/queries";
import { listarFeedbacks, colaboradoresInternos } from "@/modules/rh/feedback/queries";
import { RhAdminView } from "@/components/rh/rh-admin-view";
import { OnboardingAdmin } from "@/components/rh/onboarding-admin";
import { NfAdmin } from "@/components/rh/nf-admin";
import { BancoHorasAdmin } from "@/components/rh/banco-horas-admin";
import { FeedbackSection } from "@/components/rh/rh-extras-admin";

export const metadata: Metadata = { title: "RH — administração" };

export default async function RhAdminPage() {
  await requireRole(...HR_ADMIN_ROLES);
  // Banco de horas: alvo de fechamento = mês anterior ao atual; o saldo corrente
  // (ao vivo, até hoje) é do mês ATUAL — as duas colunas do card.
  const agora = new Date();
  const bancoMes = agora.getMonth() === 0 ? 12 : agora.getMonth();
  const bancoAno = agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear();
  const mesCorrente = agora.getMonth() + 1;
  const anoCorrente = agora.getFullYear();

  const [abonos, ferias, alteracoesFerias, feriasVigentes, clima, feedbacksHumor, processos, opcoes, nfs, nfsHistorico, fechamentos, saldoCorrente, inicioRecalculo, feedbacks, colaboradores] = await Promise.all([
    abonosPendentes(),
    feriasPendentes(),
    alteracoesFeriasPendentes(),
    feriasAprovadasVigentes(),
    climaResumo(),
    listarFeedbackHumor(),
    onboardingsAtivos(),
    opcoesOnboarding(),
    nfsPendentes(),
    nfsValidadas(),
    fechamentosDoMes(bancoAno, bancoMes),
    saldoCorrenteEquipe(anoCorrente, mesCorrente),
    primeiroMesFechado(),
    listarFeedbacks(),
    colaboradoresInternos(),
  ]);
  return (
    <div className="space-y-6">
      <RhAdminView
        abonos={abonos}
        ferias={ferias}
        alteracoesFerias={alteracoesFerias}
        feriasVigentes={feriasVigentes}
        clima={clima}
        feedbacksHumor={feedbacksHumor}
      />
      <BancoHorasAdmin
        ano={bancoAno}
        mes={bancoMes}
        fechamentos={fechamentos}
        corrente={saldoCorrente}
        anoCorrente={anoCorrente}
        mesCorrente={mesCorrente}
        inicioRecalculo={inicioRecalculo}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <FeedbackSection feedbacks={feedbacks} colaboradores={colaboradores} />
      </div>
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
          validadas={nfsHistorico.map((n) => ({
            id: n.id,
            user: { name: n.user.name },
            numero: n.numero,
            valor: Number(n.valor),
            status: n.status as "aprovada" | "rejeitada",
            observacao: n.observacao,
            validadoPor: n.validadoPor?.name ?? null,
            validadoEm: n.validadoEm?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  );
}
