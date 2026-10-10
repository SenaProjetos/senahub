import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { can, canRole } from "@/lib/permissions";
import { logAudit, getClientIp } from "@/lib/audit";
import { CADASTRO_ROLES, PJ_ROLES, HR_ADMIN_ROLES } from "@/lib/roles";
import {
  fichaPessoa,
  cadastroDaPessoa,
  solicitacoesDoUsuario,
  holeritesDaPessoa,
  notasDoUsuario,
} from "@/modules/rh/pessoas/queries";
import { opcoesCadastroFuncionario } from "@/modules/rh/funcionarios/queries";
import { contasDoColaborador } from "@/modules/rh/contas/queries";
import { historicoContratualDaPessoa } from "@/modules/rh/contratual/queries";
import { HistoricoContratual } from "@/components/rh/historico-contratual";
import { bancoHorasDe, ultimoMesFechado } from "@/modules/rh/banco/queries";
import { contextoApuracao } from "@/modules/ponto/apuracao";
import { escalaUsuarioGrade, escalaPadraoDoUsuario } from "@/modules/rh/escalas/queries";
import { overridesDeUsuario } from "@/modules/perfis/queries";
import { Pessoa360View } from "@/components/rh/pessoa-360-view";
import { CiclosPessoa } from "@/components/rh/ciclos-pessoa";
import { PedidoDadosFicha } from "@/components/rh/pedido-dados";
import { pedidoDaPessoa } from "@/modules/rh/cadastro/queries";
import { CompetenciasPessoa } from "@/components/rh/competencias-pessoa";
import { competenciasDaPessoa, listarHabilidades } from "@/modules/rh/habilidades/queries";
import { DesenvolvimentoPessoa } from "@/components/rh/desenvolvimento-pessoa";
import { desenvolvimentoDaPessoa, pessoasParaLiderar } from "@/modules/rh/desenvolvimento/queries";
import { ciclosDaPessoa, equipamentosDaPessoa, opcoesDeCicloDaPessoa } from "@/modules/rh/ciclo/queries";

export const metadata: Metadata = { title: "Ficha da pessoa" };

export default async function PessoaFichaPage({ params }: { params: Promise<{ id: string }> }) {
  // Gate fino: acesso à ficha exige `rh:cadastro` (admin bypassa; sócio herda de supervisor).
  const user = await requirePermission("rh", "cadastro");
  const { id } = await params;

  // Folha/salário: permissão fina `rh:folha` (admin bypassa; sócio herda de supervisor).
  // Os demais domínios usam exatamente suas permissões — a query nem busca o dado negado.
  const podeFolha =
    (await can(user, "rh", "folha")) || (user.ehSocio === true && (await canRole("supervisor", "rh", "folha")));
  // Mesmo gate de `defineAction`: sem fallback de sócio/supervisor para escrita de acesso.
  const [podeGerirAcesso, podeVerPonto, podeVerProjetos, ehTi] = await Promise.all([
    can(user, "usuarios", "gerir"),
    can(user, "ponto", "espelho_equipe"),
    can(user, "projetos", "ver"),
    can(user, "patrimonio", "ti"),
  ]);

  const pessoa = await fichaPessoa(id, {
    folha: podeFolha,
    acesso: podeGerirAcesso,
    ponto: podeVerPonto,
    pendenciasRh: true,
    projetos: podeVerProjetos
      ? { observador: { id: user.id, role: user.role, ehSocio: user.ehSocio, superUsuario: user.superUsuario, escopoGlobalPerfil: user.escopoGlobalPerfil, tipo: user.tipo } }
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
  const isPJ = PJ_ROLES.includes(pessoa.role) || !!pessoa.pj;
  const temEscala = pessoa.tipo === "interno";
  // Jornada controlada vem da CONTRATAÇÃO vigente (vínculo), não do `role`:
  // `administrativo` contratado como CLT tem banco de horas; `clt` que virou PJ não.
  const agora = new Date();
  const { controlaJornada } = await contextoApuracao(id, agora.getFullYear(), agora.getMonth() + 1);
  const batePonto = pessoa.tipo === "interno"; // internos + PJ têm espelho de ponto

  // Edição do cadastro trabalhista: só HR-admin, só p/ papéis com cadastro (nunca cliente/ti).
  const podeEditarCadastro = isCadastro && HR_ADMIN_ROLES.includes(user.role);

  // Ponto (espelhoMes) é a leitura mais cara → carregada sob demanda pela aba (lazy client).

  const [cadastro, ausencias, banco, escalaUsuario, escalaPadrao, holerites, nf, opcoes, overrides, contas, historico, mesFechadoBanco] = await Promise.all([
    isCadastro ? cadastroDaPessoa(id) : Promise.resolve(null),
    controlaJornada ? solicitacoesDoUsuario(id) : Promise.resolve(null),
    controlaJornada && podeVerPonto ? bancoHorasDe(id) : Promise.resolve(null),
    temEscala ? escalaUsuarioGrade(id) : Promise.resolve(null),
    temEscala ? escalaPadraoDoUsuario(id) : Promise.resolve(null),
    podeFolha ? holeritesDaPessoa(id) : Promise.resolve(null),
    isPJ ? notasDoUsuario(id) : Promise.resolve(null),
    podeEditarCadastro ? opcoesCadastroFuncionario() : Promise.resolve(null),
    podeGerirAcesso ? overridesDeUsuario(id) : Promise.resolve([]),
    // Contas bancárias são dado de folha: sem `rh:folha` a consulta nem roda, e o payload RSC
    // sai sem nada bancário (antes os 4 escalares iam junto sob `rh:cadastro`).
    podeFolha ? contasDoColaborador(id) : Promise.resolve(null),
    // Histórico contratual contém remuneração: mesmo gate do salário.
    podeFolha ? historicoContratualDaPessoa(id) : Promise.resolve(null),
    // Aviso de troca de contratação retroativa (TrocarContratacaoDialog) — só quando o botão aparece.
    podeEditarCadastro ? ultimoMesFechado() : Promise.resolve(null),
  ]);

  // Entrada e saída (F4): o RH abre e cancela listas; quem vê a ficha marca o que é dele.
  const ehRh = HR_ADMIN_ROLES.includes(user.role);
  const temCiclos = pessoa.tipo === "interno";
  // "Atualize seus dados": o RH pede à pessoa o que ela mesma pode preencher.
  const pedidoDados = ehRh && isCadastro ? await pedidoDaPessoa(id) : null;
  // Competências (F2): RH e quem gere Recursos definem e validam; os demais com acesso à ficha só leem.
  const [competencias, geraRecursos] = temCiclos ? await Promise.all([competenciasDaPessoa(id), can(user, "recursos", "gerir")]) : [null, false];
  // Desenvolvimento (F3): na ficha só o RH (a liderança usa Minha equipe, sem a ficha completa).
  const [desenvolvimento, lideresPossiveis, catalogoComp] =
    ehRh && temCiclos ? await Promise.all([desenvolvimentoDaPessoa(id, "rh"), pessoasParaLiderar(id), listarHabilidades()]) : [null, [], []];
  const [ciclos, opcoesCiclo, equipamentos] = temCiclos
    ? await Promise.all([
        ciclosDaPessoa(id),
        ehRh ? opcoesDeCicloDaPessoa(id) : Promise.resolve(null),
        equipamentosDaPessoa(id),
      ])
    : [[], null, []];

  const escala = escalaUsuario && escalaPadrao
    ? { temOverride: escalaUsuario.temOverride, dias: escalaUsuario.dias, padraoDias: escalaPadrao }
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
      controlaJornada={controlaJornada}
      holerites={holerites}
      nf={nf}
      podeEditarCadastro={podeEditarCadastro}
      pessoasJuridicas={opcoes?.pessoasJuridicas ?? []}
      cargos={opcoes?.cargos ?? []}
      departamentos={opcoes?.departamentos ?? []}
      contas={contas}
      historicoSlot={historico ? <HistoricoContratual key="historico" historico={historico} /> : undefined}
      overrides={overrides}
      podeGerirAcesso={podeGerirAcesso}
      ultimoMesFechadoBanco={mesFechadoBanco}
      pedidoDadosSlot={pedidoDados ? <PedidoDadosFicha key="pedido-dados" userId={id} pedido={pedidoDados} /> : undefined}
      desenvolvimentoSlot={
        desenvolvimento ? (
          <DesenvolvimentoPessoa key="desenvolvimento" userId={id} dados={desenvolvimento} papel="rh" pessoas={lideresPossiveis} competencias={catalogoComp} />
        ) : undefined
      }
      competenciasSlot={
        competencias ? (
          <CompetenciasPessoa key="competencias" userId={id} dados={competencias} modo={ehRh || geraRecursos ? "gestor" : "leitura"} quemId={user.id} />
        ) : undefined
      }
      ciclosSlot={
        temCiclos && (ehRh || ciclos.length > 0) ? (
          <CiclosPessoa
            key="ciclos"
            userId={id}
            ciclos={ciclos}
            opcoes={opcoesCiclo}
            equipamentos={equipamentos}
            quem={{ id: user.id, ehRh, ehTi }}
          />
        ) : undefined
      }
    />
  );
}
