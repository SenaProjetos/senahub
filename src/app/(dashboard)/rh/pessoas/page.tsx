import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { can, canRole } from "@/lib/permissions";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { listarPessoas } from "@/modules/rh/pessoas/queries";
import { opcoesCadastroFuncionario } from "@/modules/rh/funcionarios/queries";
import { alteracoesPendentes } from "@/modules/rh/cadastro/queries";
import { contasPendentesTodas } from "@/modules/rh/contas/queries";
import { PessoasLista } from "@/components/rh/pessoas-lista";
import { PendenciasCadastro } from "@/components/rh/pendencias-cadastro";
import { PendenciasContas } from "@/components/rh/pendencias-contas";
import { WizardCadastroFuncionario } from "@/components/rh/wizard-cadastro-funcionario";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PessoasPage() {
  const user = await requirePermission("rh", "cadastro");
  // Criar funcionário completo (wizard) é ação de HR-admin — o cadastrarFuncionario gateia por HR_ADMIN_ROLES.
  const podeCriar = HR_ADMIN_ROLES.includes(user.role);
  // Mesmo gate de `[id]/page.tsx`: sem `rh:folha`, salário/conta bancária saem da checagem de
  // completude da lista (ver `completude.ts` § avaliarFolha) — este viewer não pode corrigi-los.
  const podeFolha =
    (await can(user, "rh", "folha")) || (user.ehSocio === true && (await canRole("supervisor", "rh", "folha")));
  const [pessoas, pendencias, pendenciasContas, opcoes] = await Promise.all([
    listarPessoas(podeFolha),
    alteracoesPendentes(),
    // Contas bancárias são dado de folha: mesmo gate de `contasDoColaborador`.
    podeFolha ? contasPendentesTodas() : Promise.resolve([]),
    podeCriar ? opcoesCadastroFuncionario() : Promise.resolve(null),
  ]);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pessoas</h1>
          <p className="text-sm text-muted-foreground">
            Ficha única de cada pessoa — cadastro, ausências, escala, banco de horas e acesso num só lugar.
          </p>
        </div>
        {podeCriar && opcoes && (
          <WizardCadastroFuncionario
            templates={opcoes.templates}
            pessoasJuridicas={opcoes.pessoasJuridicas}
            cargos={opcoes.cargos}
            departamentos={opcoes.departamentos}
          />
        )}
      </div>
      <PendenciasCadastro pendencias={pendencias} />
      <PendenciasContas pendencias={pendenciasContas} />
      <PessoasLista pessoas={pessoas} />
    </div>
  );
}
