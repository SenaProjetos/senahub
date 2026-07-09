import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { CLT_ROLES, CADASTRO_ROLES, INTERNAL_ROLES, PJ_ROLES } from "@/lib/roles";
import { fichaPessoa, cadastroDaPessoa, solicitacoesDoUsuario, notasDoUsuario } from "@/modules/rh/pessoas/queries";
import { bancoHorasDe } from "@/modules/rh/banco/queries";
import { escalaUsuarioGrade, escalaRoleGrade } from "@/modules/rh/escalas/queries";
import { Pessoa360View } from "@/components/rh/pessoa-360-view";

export const metadata: Metadata = { title: "Minha ficha" };

export default async function MinhaFichaPage() {
  const user = await requireUser();
  if (user.role === "cliente") redirect("/portal");
  const id = user.id;

  const pessoa = await fichaPessoa(id);
  if (!pessoa) redirect("/");

  const isCadastro = CADASTRO_ROLES.includes(pessoa.role);
  const isCLT = CLT_ROLES.includes(pessoa.role);
  const isPJ = PJ_ROLES.includes(pessoa.role) || !!pessoa.pj;
  const temEscala = isCLT || INTERNAL_ROLES.includes(pessoa.role);
  const batePonto = pessoa.role !== "cliente";

  const [cadastro, ausencias, banco, escalaUsuario, escalaRole, nf] = await Promise.all([
    isCadastro ? cadastroDaPessoa(id) : Promise.resolve(null),
    isCLT ? solicitacoesDoUsuario(id) : Promise.resolve(null),
    isCLT ? bancoHorasDe(id) : Promise.resolve(null),
    temEscala ? escalaUsuarioGrade(id) : Promise.resolve(null),
    temEscala ? escalaRoleGrade(pessoa.role) : Promise.resolve(null),
    isPJ ? notasDoUsuario(id) : Promise.resolve(null),
  ]);

  const escala = escalaUsuario && escalaRole
    ? { temOverride: escalaUsuario.temOverride, dias: escalaUsuario.dias, roleDias: escalaRole }
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Minha ficha</h1>
        <p className="text-sm text-muted-foreground">
          Seus dados de cadastro, ponto, ausências e escala. Para alterar, fale com o RH.
        </p>
      </div>
      {/* Auto-serviço: própria ficha, com salário próprio visível e sem links de gestão. */}
      <Pessoa360View
        pessoa={pessoa}
        podeFolha
        self
        cadastro={cadastro}
        ausencias={ausencias}
        escala={escala}
        banco={banco}
        temPonto={batePonto}
        nf={nf}
      />
    </div>
  );
}
