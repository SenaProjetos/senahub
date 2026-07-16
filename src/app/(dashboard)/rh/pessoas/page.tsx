import type { Metadata } from "next";
import { requirePermission } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { listarPessoas } from "@/modules/rh/pessoas/queries";
import { opcoesCadastroFuncionario } from "@/modules/rh/funcionarios/queries";
import { alteracoesPendentes } from "@/modules/rh/cadastro/queries";
import { PessoasLista } from "@/components/rh/pessoas-lista";
import { PendenciasCadastro } from "@/components/rh/pendencias-cadastro";
import { WizardCadastroFuncionario } from "@/components/rh/wizard-cadastro-funcionario";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PessoasPage() {
  const user = await requirePermission("rh", "cadastro");
  // Criar funcionário completo (wizard) é ação de HR-admin — o cadastrarFuncionario gateia por HR_ADMIN_ROLES.
  const podeCriar = HR_ADMIN_ROLES.includes(user.role);
  const [pessoas, pendencias, opcoes] = await Promise.all([
    listarPessoas(),
    alteracoesPendentes(),
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
          <WizardCadastroFuncionario templates={opcoes.templates} pessoasJuridicas={opcoes.pessoasJuridicas} />
        )}
      </div>
      <PendenciasCadastro pendencias={pendencias} />
      <PessoasLista pessoas={pessoas} />
    </div>
  );
}
