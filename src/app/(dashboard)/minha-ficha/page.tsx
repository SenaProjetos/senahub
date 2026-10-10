import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";

import {
  fichaPessoa,
  cadastroDaPessoa,
  solicitacoesDoUsuario,
  holeritesDaPessoa,
  notasDoUsuario,
} from "@/modules/rh/pessoas/queries";
import { bancoHorasDe } from "@/modules/rh/banco/queries";
import { contextoApuracao } from "@/modules/ponto/apuracao";
import { escalaUsuarioGrade, escalaPadraoDoUsuario } from "@/modules/rh/escalas/queries";
import { minhaAlteracaoPendente } from "@/modules/rh/cadastro/queries";
import { carregarPreferenciasDaConta } from "@/modules/usuarios/preferencias/queries";
import { meuAcesso } from "@/modules/usuarios/vinculo/queries";
import { contasDoColaborador, minhaContaPendente } from "@/modules/rh/contas/queries";
import { historicoContratualDaPessoa } from "@/modules/rh/contratual/queries";
import { HistoricoContratual } from "@/components/rh/historico-contratual";
import { MeuAcesso } from "@/components/usuarios/meu-acesso";
import { Pessoa360View } from "@/components/rh/pessoa-360-view";
import { EditarMeusDados } from "@/components/rh/editar-meus-dados";
import { PreferenciasView } from "@/components/configuracoes/preferencias-view";
import { CiclosPessoa } from "@/components/rh/ciclos-pessoa";
import { CompletarMeusDados } from "@/components/rh/completar-meus-dados";
import { reconfirmacaoAberta, situacaoDaPessoa } from "@/modules/rh/cadastro/pedido-service";
import { ConfirmarMeusDados } from "@/components/rh/confirmar-meus-dados";
import { CompetenciasPessoa } from "@/components/rh/competencias-pessoa";
import { competenciasDaPessoa } from "@/modules/rh/habilidades/queries";
import { DesenvolvimentoPessoa } from "@/components/rh/desenvolvimento-pessoa";
import { desenvolvimentoDaPessoa, quantosLidera } from "@/modules/rh/desenvolvimento/queries";
import { ciclosDaPessoa, equipamentosDaPessoa } from "@/modules/rh/ciclo/queries";

export const metadata: Metadata = { title: "Minha conta" };

export default async function MinhaFichaPage({ searchParams }: { searchParams: Promise<{ completar?: string; confirmar?: string }> }) {
  const user = await requireUser();
  if (user.tipo === "externo") redirect("/portal");
  const id = user.id;

  const podeVerProjetos = await can(user, "projetos", "ver");
  const pessoa = await fichaPessoa(id, {
    folha: true,
    acesso: true,
    ponto: true,
    pendenciasRh: true,
    projetos: podeVerProjetos
      ? { observador: { id: user.id, role: user.role, ehSocio: user.ehSocio, superUsuario: user.superUsuario, escopoGlobalPerfil: user.escopoGlobalPerfil, tipo: user.tipo } }
      : null,
  });
  if (!pessoa) redirect("/");

  const isColaborador = pessoa.tipo === "interno";
  const isPJ = pessoa.prestador || !!pessoa.pj;
  const temEscala = pessoa.tipo === "interno";
  // Jornada controlada vem da CONTRATAÇÃO vigente (vínculo), não do `role`:
  // `administrativo` contratado como CLT tem banco de horas; `clt` que virou PJ não.
  const agora = new Date();
  const { controlaJornada } = await contextoApuracao(id, agora.getFullYear(), agora.getMonth() + 1);
  const batePonto = isColaborador;

  const [cadastro, ausencias, banco, escalaUsuario, escalaPadrao, holerites, nf, pendente, prefsConta, acesso, contas, historico, contaPendente] = await Promise.all([
    isColaborador ? cadastroDaPessoa(id) : Promise.resolve(null),
    controlaJornada ? solicitacoesDoUsuario(id) : Promise.resolve(null),
    controlaJornada ? bancoHorasDe(id) : Promise.resolve(null),
    temEscala ? escalaUsuarioGrade(id) : Promise.resolve(null),
    temEscala ? escalaPadraoDoUsuario(id) : Promise.resolve(null),
    holeritesDaPessoa(id, { somenteDisponiveis: true }),
    isPJ ? notasDoUsuario(id) : Promise.resolve(null),
    isColaborador ? minhaAlteracaoPendente(id) : Promise.resolve(null),
    carregarPreferenciasDaConta(id),
    meuAcesso(id),
    // A própria pessoa sempre vê as próprias contas (mesmo critério de `podeFolha` fixo aqui).
    isColaborador ? contasDoColaborador(id) : Promise.resolve(null),
    // A pessoa vê o próprio histórico contratual (aqui `podeFolha` é fixo: é a própria ficha).
    isColaborador ? historicoContratualDaPessoa(id) : Promise.resolve(null),
    isColaborador ? minhaContaPendente(id) : Promise.resolve(null),
  ]);

  // Entrada e saída (F4): a pessoa acompanha a própria lista e marca os itens que são dela.
  const [ciclos, equipamentos, ehTi] = isColaborador
    ? await Promise.all([ciclosDaPessoa(id), equipamentosDaPessoa(id), can(user, "patrimonio", "ti")])
    : [[], [], false];
  // "Completar meus dados": o que falta e a pessoa pode preencher (abre sozinho vindo da faixa).
  const situacaoDados = isColaborador ? await situacaoDaPessoa(id) : null;
  const competencias = isColaborador ? await competenciasDaPessoa(id) : null;
  // Desenvolvimento (F3): a pessoa lê os objetivos e só o 1:1 compartilhado.
  const [desenvolvimento, lidera] = isColaborador ? await Promise.all([desenvolvimentoDaPessoa(id, "self"), quantosLidera(id)]) : [null, 0];
  const sp = await searchParams;
  const abrirCompletar = sp.completar === "1";
  // Reconfirmação anual: o cartão aparece com pedido aberto (ou vindo do link da faixa).
  const pedirConfirmacao = isColaborador && ((await reconfirmacaoAberta(id)) || sp.confirmar === "1");

  const escala = escalaUsuario && escalaPadrao
    ? { temOverride: escalaUsuario.temOverride, dias: escalaUsuario.dias, padraoDias: escalaPadrao }
    : null;

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Minha conta" descricao="Seus dados de cadastro, ponto, ausências, escala e preferências num só lugar. Contato e endereço você mesmo pode alterar — as mudanças passam por validação do RH. Contas bancárias são cadastradas pelo RH." />

      {pedirConfirmacao && cadastro && <ConfirmarMeusDados dados={cadastro} destacar={sp.confirmar === "1"} />}
      {situacaoDados && <CompletarMeusDados situacao={situacaoDados} abrir={abrirCompletar} />}

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
        contas={contas}
        contaPendente={contaPendente}
        historicoSlot={historico ? <HistoricoContratual key="historico" historico={historico} /> : undefined}
        preferenciasSlot={<PreferenciasView key="preferencias" {...prefsConta} />}
        desenvolvimentoSlot={
          desenvolvimento ? <DesenvolvimentoPessoa key="desenvolvimento" userId={id} dados={desenvolvimento} papel="self" lideraAlguem={lidera} /> : undefined
        }
        competenciasSlot={competencias ? <CompetenciasPessoa key="competencias" userId={id} dados={competencias} modo="self" quemId={id} /> : undefined}
        ciclosSlot={
          ciclos.length > 0 ? (
            <CiclosPessoa
              key="ciclos"
              userId={id}
              ciclos={ciclos}
              opcoes={null}
              equipamentos={equipamentos}
              quem={{ id, ehRh: user.gereRh, ehTi }}
            />
          ) : undefined
        }
      />
    </div>
  );
}
