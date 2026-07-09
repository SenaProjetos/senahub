import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { CLT_ROLES, CADASTRO_ROLES, INTERNAL_ROLES, PJ_ROLES } from "@/lib/roles";
import { fichaPessoa, cadastroDaPessoa, solicitacoesDoUsuario, notasDoUsuario } from "@/modules/rh/pessoas/queries";
import { bancoHorasDe } from "@/modules/rh/banco/queries";
import { escalaUsuarioGrade, escalaRoleGrade } from "@/modules/rh/escalas/queries";
import { Pessoa360View } from "@/components/rh/pessoa-360-view";

export const metadata: Metadata = { title: "Ficha da pessoa" };

export default async function PessoaFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "supervisor", "administrativo");
  const { id } = await params;

  const pessoa = await fichaPessoa(id);
  if (!pessoa) notFound();

  // Folha/salário: quem administra RH (admin/supervisor/administrativo — já acessa /rh/folha) ou sócio.
  // Minimização: se não puder, o salário nem chega ao cliente (ver `pessoaView`).
  const podeFolha =
    user.role === "admin" || user.role === "supervisor" || user.role === "administrativo" || user.ehSocio === true;

  const isCadastro = CADASTRO_ROLES.includes(pessoa.role);
  const isCLT = CLT_ROLES.includes(pessoa.role);
  const isPJ = PJ_ROLES.includes(pessoa.role) || !!pessoa.pj;
  const temEscala = isCLT || INTERNAL_ROLES.includes(pessoa.role);
  const batePonto = pessoa.role !== "cliente"; // internos + PJ têm espelho de ponto

  // Ponto (espelhoMes) é a leitura mais cara → carregada sob demanda pela aba (lazy client).
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

  const pessoaView = podeFolha ? pessoa : { ...pessoa, salarioBase: null };

  return (
    <Pessoa360View
      pessoa={pessoaView}
      podeFolha={podeFolha}
      cadastro={cadastro}
      ausencias={ausencias}
      escala={escala}
      banco={banco}
      temPonto={batePonto}
      nf={nf}
    />
  );
}
