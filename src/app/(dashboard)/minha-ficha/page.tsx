import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { INTERNAL_ROLES, PJ_ROLES } from "@/lib/roles";
import {
  fichaPessoa,
  cadastroDaPessoa,
  solicitacoesDoUsuario,
  holeritesDaPessoa,
  notasDoUsuario,
} from "@/modules/rh/pessoas/queries";
import { bancoHorasDe } from "@/modules/rh/banco/queries";
import { contextoApuracao } from "@/modules/ponto/apuracao";
import { escalaUsuarioGrade, escalaRoleGrade } from "@/modules/rh/escalas/queries";
import { minhaAlteracaoPendente } from "@/modules/rh/cadastro/queries";
import { carregarPreferenciasDaConta } from "@/modules/usuarios/preferencias/queries";
import { meuAcesso } from "@/modules/usuarios/vinculo/queries";
import { MeuAcesso } from "@/components/usuarios/meu-acesso";
import { Pessoa360View } from "@/components/rh/pessoa-360-view";
import { EditarMeusDados } from "@/components/rh/editar-meus-dados";
import { PreferenciasView } from "@/components/configuracoes/preferencias-view";

export const metadata: Metadata = { title: "Minha conta" };

export default async function MinhaFichaPage() {
  const user = await requireUser();
  if (user.role === "cliente") redirect("/portal");
  const id = user.id;

  const podeVerProjetos = await can(user.role, "projetos", "ver");
  const pessoa = await fichaPessoa(id, {
    folha: true,
    acesso: true,
    ponto: true,
    pendenciasRh: true,
    projetos: podeVerProjetos
      ? { observador: { id: user.id, role: user.role, ehSocio: user.ehSocio } }
      : null,
  });
  if (!pessoa) redirect("/");

  const isColaborador = pessoa.role !== "cliente";
  const isPJ = PJ_ROLES.includes(pessoa.role) || !!pessoa.pj;
  const temEscala = INTERNAL_ROLES.includes(pessoa.role);
  // Jornada controlada vem da CONTRATAÇÃO vigente (vínculo), não do `role`:
  // `administrativo` contratado como CLT tem banco de horas; `clt` que virou PJ não.
  const agora = new Date();
  const { controlaJornada } = await contextoApuracao(id, agora.getFullYear(), agora.getMonth() + 1);
  const batePonto = isColaborador;

  const [cadastro, ausencias, banco, escalaUsuario, escalaRole, holerites, nf, pendente, prefsConta, acesso] = await Promise.all([
    isColaborador ? cadastroDaPessoa(id) : Promise.resolve(null),
    controlaJornada ? solicitacoesDoUsuario(id) : Promise.resolve(null),
    controlaJornada ? bancoHorasDe(id) : Promise.resolve(null),
    temEscala ? escalaUsuarioGrade(id) : Promise.resolve(null),
    temEscala ? escalaRoleGrade(pessoa.role) : Promise.resolve(null),
    holeritesDaPessoa(id, { somenteDisponiveis: true }),
    isPJ ? notasDoUsuario(id) : Promise.resolve(null),
    isColaborador ? minhaAlteracaoPendente(id) : Promise.resolve(null),
    carregarPreferenciasDaConta(id),
    meuAcesso(id),
  ]);

  const escala = escalaUsuario && escalaRole
    ? { temOverride: escalaUsuario.temOverride, dias: escalaUsuario.dias, roleDias: escalaRole }
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Minha conta</h1>
        <p className="text-sm text-muted-foreground">
          Seus dados de cadastro, ponto, ausências, escala e preferências num só lugar. Contato, endereço e dados
          bancários você mesmo pode alterar — as mudanças passam por validação do RH.
        </p>
      </div>

      {acesso && <MeuAcesso acesso={acesso} />}

      {cadastro && <EditarMeusDados atual={cadastro} pendente={pendente} />}
      {/* Auto-serviço: própria ficha, com salário próprio visível e sem links de gestão.
          A aba Preferências recebe a PreferenciasView (foto/tema/notificações). */}
      <Pessoa360View
        pessoa={pessoa}
        podeFolha
        self
        cadastro={cadastro}
        ausencias={ausencias}
        escala={escala}
        banco={banco}
        temPonto={batePonto}
        controlaJornada={controlaJornada}
        holerites={holerites}
        nf={nf}
        preferenciasSlot={<PreferenciasView {...prefsConta} />}
      />
    </div>
  );
}
