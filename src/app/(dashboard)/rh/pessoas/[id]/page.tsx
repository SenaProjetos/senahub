import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import { CLT_ROLES, CADASTRO_ROLES, INTERNAL_ROLES, PJ_ROLES } from "@/lib/roles";
import { fichaPessoa, cadastroDaPessoa, solicitacoesDoUsuario, notasDoUsuario } from "@/modules/rh/pessoas/queries";
import { bancoHorasDe } from "@/modules/rh/banco/queries";
import { escalaUsuarioGrade, escalaRoleGrade } from "@/modules/rh/escalas/queries";
import { Pessoa360View } from "@/components/rh/pessoa-360-view";

export const metadata: Metadata = { title: "Ficha da pessoa" };

export default async function PessoaFichaPage({ params }: { params: Promise<{ id: string }> }) {
  // Gate fino: acesso à ficha exige `rh:cadastro` (admin bypassa; sócio herda de supervisor).
  const user = await requirePermission("rh", "cadastro");
  const { id } = await params;

  const pessoa = await fichaPessoa(id);
  if (!pessoa) notFound();

  // Folha/salário: permissão fina `rh:folha` (admin bypassa; sócio herda de supervisor).
  // Minimização: se não puder, o salário nem chega ao cliente (ver `pessoaView`).
  const podeFolha =
    (await can(user.role, "rh", "folha")) || (user.ehSocio === true && (await can("supervisor", "rh", "folha")));

  // Log de LEITURA sensível (o conselho pediu): quem abriu a ficha de QUEM (e se viu a folha).
  // Só quando é ficha de terceiro — o próprio (minha-ficha) não gera log.
  if (user.id !== id) {
    const ip = await getClientIp();
    await logAudit({
      userId: user.id,
      modulo: "rh",
      acao: "ler-ficha-pessoa",
      resultado: "sucesso",
      entidade: "User",
      entidadeId: id,
      detalhe: { alvo: pessoa.name, folhaVisivel: podeFolha },
      ip,
    });
  }

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
