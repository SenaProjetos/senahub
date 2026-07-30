import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import { CLT_ROLES, CADASTRO_ROLES, INTERNAL_ROLES, PJ_ROLES, HR_ADMIN_ROLES } from "@/lib/roles";
import {
  fichaPessoa,
  cadastroDaPessoa,
  solicitacoesDoUsuario,
  holeritesDaPessoa,
  notasDoUsuario,
} from "@/modules/rh/pessoas/queries";
import { opcoesCadastroFuncionario } from "@/modules/rh/funcionarios/queries";
import { bancoHorasDe } from "@/modules/rh/banco/queries";
import { escalaUsuarioGrade, escalaRoleGrade } from "@/modules/rh/escalas/queries";
import { overridesDeUsuario } from "@/modules/perfis/queries";
import { Pessoa360View } from "@/components/rh/pessoa-360-view";

export const metadata: Metadata = { title: "Ficha da pessoa" };

export default async function PessoaFichaPage({ params }: { params: Promise<{ id: string }> }) {
  // Gate fino: acesso à ficha exige `rh:cadastro` (admin bypassa; sócio herda de supervisor).
  const user = await requirePermission("rh", "cadastro");
  const { id } = await params;

  // Folha/salário: permissão fina `rh:folha` (admin bypassa; sócio herda de supervisor).
  // Os demais domínios usam exatamente suas permissões — a query nem busca o dado negado.
  const podeFolha =
    (await can(user.role, "rh", "folha")) || (user.ehSocio === true && (await can("supervisor", "rh", "folha")));
  // Mesmo gate de `defineAction`: sem fallback de sócio/supervisor para escrita de acesso.
  const [podeGerirAcesso, podeVerPonto, podeVerProjetos] = await Promise.all([
    can(user.role, "usuarios", "gerir"),
    can(user.role, "ponto", "espelho_equipe"),
    can(user.role, "projetos", "ver"),
  ]);

  const pessoa = await fichaPessoa(id, {
    folha: podeFolha,
    acesso: podeGerirAcesso,
    ponto: podeVerPonto,
    pendenciasRh: true,
    projetos: podeVerProjetos
      ? { observador: { id: user.id, role: user.role, ehSocio: user.ehSocio } }
      : null,
  });
  if (!pessoa) notFound();

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

  // Edição do cadastro trabalhista: só HR-admin, só p/ papéis com cadastro (nunca cliente/ti).
  const podeEditarCadastro = isCadastro && HR_ADMIN_ROLES.includes(user.role);

  // Ponto (espelhoMes) é a leitura mais cara → carregada sob demanda pela aba (lazy client).

  const [cadastro, ausencias, banco, escalaUsuario, escalaRole, holerites, nf, opcoes, overrides] = await Promise.all([
    isCadastro ? cadastroDaPessoa(id) : Promise.resolve(null),
    isCLT ? solicitacoesDoUsuario(id) : Promise.resolve(null),
    isCLT && podeVerPonto ? bancoHorasDe(id) : Promise.resolve(null),
    temEscala ? escalaUsuarioGrade(id) : Promise.resolve(null),
    temEscala ? escalaRoleGrade(pessoa.role) : Promise.resolve(null),
    podeFolha ? holeritesDaPessoa(id) : Promise.resolve(null),
    isPJ ? notasDoUsuario(id) : Promise.resolve(null),
    podeEditarCadastro ? opcoesCadastroFuncionario() : Promise.resolve(null),
    podeGerirAcesso ? overridesDeUsuario(id) : Promise.resolve([]),
  ]);

  const escala = escalaUsuario && escalaRole
    ? { temOverride: escalaUsuario.temOverride, dias: escalaUsuario.dias, roleDias: escalaRole }
    : null;

  return (
    <Pessoa360View
      pessoa={pessoa}
      podeFolha={podeFolha}
      cadastro={cadastro}
      ausencias={ausencias}
      escala={escala}
      banco={banco}
      temPonto={batePonto && podeVerPonto}
      controlaJornada={isCLT}
      holerites={holerites}
      nf={nf}
      podeEditarCadastro={podeEditarCadastro}
      pessoasJuridicas={opcoes?.pessoasJuridicas ?? []}
      overrides={overrides}
      podeGerirAcesso={podeGerirAcesso}
    />
  );
}
