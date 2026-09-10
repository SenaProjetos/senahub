import {
  Award,
  FileCheck2,
  Gavel,
  KeyRound,
  ScrollText,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import {
  GuiaShell,
  type ArmadilhaGuia,
  type DuvidaGuia,
  type ItemIndice,
  type MarcoGuia,
  type TermoGuia,
} from "@/components/guias/guia-shell";
import { Acao, Atalho, Dica, Etapa, NomeBotao } from "@/components/guias/primitivas";
import { Button } from "@/components/ui/button";

/**
 * Guia de uso do setor Gestão (`/guias/gestao`). F4 do plano
 * `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`.
 *
 * Gestão reúne seis rotas independentes, não um fluxo único — o "caminho natural" aqui é a
 * relação entre elas, não uma sequência ponta a ponta. Conferido contra o código, não contra o
 * manual (ADR-001): `modules/licitacoes/{status,habilitacao,sancoes}.ts`, `modules/acessos/*` e
 * o memo de decisões de segurança de Acessos e Credenciais. Divergências na §12 do plano.
 */

const MARCOS: readonly MarcoGuia[] = [
  { numero: "01", nome: "Licitações", href: "#licitacoes" },
  { numero: "02", nome: "Certidões", href: "#certidoes" },
  { numero: "03", nome: "Jurídico", href: "#juridico" },
  { numero: "04", nome: "Qualidade", href: "#qualidade" },
  { numero: "05", nome: "Patrimônio", href: "#patrimonio" },
  { numero: "06", nome: "Acessos", href: "#acessos" },
];

const INDICE: readonly ItemIndice[] = [
  { href: "#licitacoes", label: "Licitações" },
  { href: "#certidoes", label: "Certidões" },
  { href: "#juridico", label: "Jurídico" },
  { href: "#qualidade", label: "Qualidade" },
  { href: "#patrimonio", label: "Patrimônio" },
  { href: "#acessos", label: "Acessos e Credenciais" },
];

const VOCABULARIO: readonly TermoGuia[] = [
  {
    termo: "Licitação",
    definicao:
      "Um processo público que o escritório disputa. Passa por uma máquina de estados própria: só avança pra frente, e a maioria das transições é manual — quem opera arrasta o processo, o sistema não decide por conta própria.",
  },
  {
    termo: "Habilitação",
    definicao:
      "O checklist de documentos exigidos para participar de uma licitação. Cada item pode ser marcado manualmente como atendido, ou ligado a uma certidão — nesse caso o item se resolve sozinho pela validade dela.",
    exemplo: "Um item de \"Certidão Negativa Federal\" ligado a uma certidão vencida some da lista de atendidos, mesmo que ninguém tenha desmarcado nada.",
  },
  {
    termo: "Sanção",
    definicao:
      "Uma penalidade registrada contra um fornecedor ou contra o próprio escritório num processo público. É histórico, não é ação — fica registrada mesmo depois de resolvida.",
  },
  {
    termo: "Certidão",
    definicao:
      "Um documento com prazo de validade — negativa federal, estadual, municipal, FGTS, trabalhista. Vencer não apaga a certidão: só faz ela parar de contar como válida em qualquer lugar que a use.",
  },
  {
    termo: "Contrato (Jurídico)",
    definicao:
      "Um `DocumentoJuridico` com vencimento e valor. Pode ser de cliente (nascido de uma proposta aceita) ou de equipe (ligado a um vínculo de trabalho, não à pessoa direto) — os dois vivem na mesma tela, mas são coisas diferentes por dentro.",
  },
  {
    termo: "Índice de retrabalho",
    definicao:
      "A métrica da Qualidade: quantas disciplinas em andamento já tiveram pelo menos uma revisão. Revisão não é falha — é o vaivém normal do fluxo de entrega — mas quando o índice sobe demais, é sinal de algo a investigar.",
  },
  {
    termo: "Patrimônio",
    definicao:
      "O cadastro dos bens físicos do escritório. TI é um recorte dentro dele — máquinas e equipamentos de informática — com uma permissão própria, separada da gestão geral de patrimônio.",
  },
  {
    termo: "Credencial",
    definicao:
      "Uma senha ou acesso guardado no cofre corporativo: e-mail, sistema de terceiro, portal de prefeitura. É criptografada, e ver o cadastro não é a mesma coisa que ver a senha — são duas permissões separadas.",
  },
  {
    termo: "Compartilhamento (Acessos)",
    definicao:
      "Quem, além do responsável, pode ver o cadastro ou a senha de uma credencial. Pode ser dado por pessoa, por perfil de acesso ou por setor — e os dois níveis (ver cadastro, ver senha) são concedidos separadamente.",
  },
];

const ARMADILHAS: readonly ArmadilhaGuia[] = [
  {
    titulo: "Gestão não é um fluxo — são seis gavetas",
    texto: (
      <>
        Diferente do Comercial ou de Projetos, este setor não tem um caminho único do início ao
        fim. Licitações, Certidões, Jurídico, Qualidade, Patrimônio e Acessos são{" "}
        <strong>áreas independentes</strong>, cada uma com sua própria rotina. O que conecta
        algumas delas é pontual — como a certidão que alimenta um item de habilitação — não um
        fluxo que atravessa todas.
      </>
    ),
  },
  {
    titulo: "Licitação só anda pra frente, e quase sempre na mão",
    texto: (
      <>
        A máquina de estados não deixa voltar: uma licitação <strong>ganha</strong> não retorna a{" "}
        <strong>em andamento</strong>. A única transição automática é{" "}
        <strong>ganha → em execução</strong>, e só acontece ao importar a licitação — todo o resto
        é decisão de quem está operando, feita na tela.
      </>
    ),
  },
  {
    titulo: "Certidão vencida desmarca o item sozinha",
    texto: (
      <>
        Se um item de habilitação está ligado a uma certidão, ele <strong>não</strong> fica
        marcado como atendido por vontade própria — ele lê a validade da certidão contra a data de
        referência. Uma certidão que vence <strong>depois</strong> de marcada some da lista de
        atendidos sem ninguém ter clicado em nada. Renovar a certidão é o que resolve, não
        desmarcar e marcar de novo.
      </>
    ),
  },
  {
    titulo: "Ver o cadastro não é ver a senha",
    texto: (
      <>
        Em Acessos, <strong>ver que a credencial existe</strong> e <strong>ver a senha dela</strong>{" "}
        são duas permissões separadas, concedidas independentemente. Alguém pode aparecer na lista
        de credenciais compartilhadas e mesmo assim ver a senha como <strong>•••</strong> — não é
        erro, é o segundo gate funcionando.
      </>
    ),
  },
  {
    titulo: "Contrato de cliente e contrato de equipe moram na mesma tela",
    texto: (
      <>
        O Jurídico mistura dois tipos de contrato que não têm nada a ver entre si: o{" "}
        <strong>de cliente</strong>, que nasce de uma proposta aceita, e o <strong>de equipe</strong>,
        ligado ao vínculo de trabalho de alguém (com dado sensível — salário, CPF — visível só a
        quem administra RH). Filtrar por engano pode misturar as duas listas na cabeça de quem
        está olhando.
      </>
    ),
  },
  {
    titulo: "TI é patrimônio, mas com porta própria",
    texto: (
      <>
        Máquinas e equipamentos de TI vivem dentro do Patrimônio, só que atrás de uma permissão
        separada da gestão geral de bens. Ter acesso a Patrimônio não garante ver TI, e o inverso
        também não é automático.
      </>
    ),
  },
];

const DUVIDAS: readonly DuvidaGuia[] = [
  {
    pergunta: "Marquei um item de habilitação como atendido e ele desapareceu da lista de pendentes. Depois voltou. Por quê?",
    resposta:
      "Provavelmente o item está ligado a uma certidão, e ela venceu. A marcação manual só vale quando não há certidão vinculada — com certidão, é a validade dela que decide.",
  },
  {
    pergunta: "Posso voltar uma licitação de \"ganha\" para \"em andamento\"?",
    resposta:
      "Não. A máquina de estados não tem essa transição. Se foi engano, é caso para conferir com quem administra o módulo — não é algo que se desfaz pela tela.",
  },
  {
    pergunta: "Tenho acesso a uma credencial mas a senha aparece como pontos. É erro?",
    resposta:
      "Não. Ver o cadastro e ver a senha são permissões independentes. Você tem a primeira e não a segunda — é o cofre funcionando como deveria.",
  },
  {
    pergunta: "O contrato que vejo em Jurídico é de cliente ou de equipe?",
    resposta:
      "Olhe o vínculo: contrato de equipe está ligado a um vínculo de trabalho (e carrega dado de RH); contrato de cliente está ligado a uma proposta ou a um cliente. Os dois aparecem na mesma lista.",
  },
  {
    pergunta: "O índice de retrabalho subiu. Isso é ruim?",
    resposta:
      "Não necessariamente — revisão é parte normal do fluxo de entrega. Mas um índice em alta sustentada é sinal de que vale investigar onde as revisões estão se concentrando.",
  },
  {
    pergunta: "Tenho permissão de Patrimônio. Vejo as máquinas de TI?",
    resposta:
      "Não automaticamente. TI é uma permissão separada dentro do Patrimônio, pensada para quem administra equipamentos de informática especificamente.",
  },
];

export function GuiaGestaoView() {
  return (
    <GuiaShell
      voltar={{ href: "/licitacoes", label: "Voltar a Licitações" }}
      titulo="Seis áreas de gestão, cada uma com sua própria rotina"
      descricao="Gestão não é um fluxo único: é onde vivem os processos públicos, os contratos, os documentos com validade, a qualidade da entrega, os bens do escritório e o cofre de acessos. Cada área tem seu próprio caminho — o que muda de setor pra setor é o que conecta uma à outra."
      acoes={
        <>
          <Button size="sm" render={<Link href="/licitacoes" />}>
            <Gavel className="size-4" aria-hidden="true" /> Abrir Licitações
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/certidoes" />}>
            <FileCheck2 className="size-4" aria-hidden="true" /> Ver Certidões
          </Button>
        </>
      }
      regra={{
        texto: (
          <>
            <strong>São seis gavetas, não um fluxo.</strong> Não procure uma sequência que atravesse
            todas — procure o que conecta duas delas quando o problema pedir, como certidão e
            habilitação.
          </>
        ),
      }}
      marcos={MARCOS}
      indice={INDICE}
      vocabulario={VOCABULARIO}
      armadilhas={ARMADILHAS}
      duvidas={DUVIDAS}
      cta={{
        titulo: "Comece pela área que você opera",
        descricao: "Cada área de Gestão tem sua própria rotina — não é preciso passar pelas seis.",
        href: "/licitacoes",
        label: "Abrir Licitações",
      }}
    >
      <Etapa
        id="licitacoes"
        numero="01"
        icone={Gavel}
        titulo="Licitações: do edital ao contrato executado"
        resumo="Um processo público segue uma máquina de estados que só avança — e quase sempre por decisão manual."
      >
        <p>
          Cada licitação nasce <strong>em andamento</strong> e segue uma trilha fixa: pode ser
          marcada <strong>ganha</strong> ou <strong>perdida</strong>; uma vez ganha, vira{" "}
          <strong>em execução</strong> — só isso é automático, e só ao importar a licitação. De lá,
          o encerramento é manual, para <strong>concluída</strong>.
        </p>
        <Acao
          tela="Licitações"
          clique={<NomeBotao>Nova licitação</NomeBotao>}
          resultado="Cria o processo em andamento; o checklist de habilitação e a viabilidade ficam disponíveis a partir daqui."
        />
        <Dica>
          A <strong>habilitação</strong> é o checklist de documentos exigidos. Ligar um item a uma
          certidão existente evita marcar manualmente — e evita esquecer de desmarcar quando ela
          vencer.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/licitacoes">Licitações</Atalho>
          <Atalho href="/licitacoes/sancoes">Sanções</Atalho>
          <Atalho href="/ajuda/gestao/licitacoes">Referência: Licitações</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="certidoes"
        numero="02"
        icone={FileCheck2}
        titulo="Certidões: documentos com prazo de validade"
        resumo="O que conecta esta área a Licitações: um item de habilitação pode se resolver pela validade de uma certidão."
      >
        <p>
          Cada certidão tem um <strong>tipo</strong> e uma <strong>validade</strong>. Vencer não a
          apaga — só para de contar como válida em qualquer lugar que a use, inclusive num item de
          habilitação ligado a ela.
        </p>
        <Acao
          tela="Certidões"
          clique={<NomeBotao>Nova versão</NomeBotao>}
          resultado="Registra a renovação sem perder o histórico das versões anteriores da mesma certidão."
        />
        <Dica>
          Antes de sair procurando por que um item de habilitação “desmarcou sozinho”, confira a
          validade da certidão ligada a ele.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/certidoes">Certidões</Atalho>
          <Atalho href="/ajuda/gestao/certidoes">Referência: Certidões</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="juridico"
        numero="03"
        icone={ScrollText}
        titulo="Jurídico: contratos de cliente e de equipe, na mesma tela"
        resumo="Dois tipos de contrato convivem aqui — a origem de cada um é o que os distingue."
      >
        <p>
          Um contrato de <strong>cliente</strong> nasce de uma proposta aceita no Comercial. Um
          contrato de <strong>equipe</strong> está ligado ao vínculo de trabalho de alguém — CLT,
          estágio, PJ ou freelancer — e carrega dado sensível de RH quando presente.
        </p>
        <Acao
          tela="Jurídico"
          clique={<NomeBotao>Novo documento</NomeBotao>}
          resultado="Cria o registro com vencimento e valor, que alimentam alertas de vencimento e alçada de aprovação."
        />
        <Dica>
          Contrato de equipe é sobre o <strong>vínculo</strong>, não sobre a pessoa direto — um
          aditivo ou rescisão é um novo documento para o mesmo vínculo, não uma edição do contrato
          original.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/juridico">Jurídico</Atalho>
          <Atalho href="/ajuda/gestao/juridico">Referência: Jurídico</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="qualidade"
        numero="04"
        icone={Award}
        titulo="Qualidade: acompanhe o retrabalho, não a culpa"
        resumo="O índice mede quantas disciplinas já passaram por revisão — não é um placar de erro."
      >
        <p>
          O <strong>índice de retrabalho</strong> é a fração de disciplinas em andamento que já
          tiveram pelo menos uma revisão. Revisão faz parte do fluxo normal de entrega — o índice
          serve para enxergar tendência, não para apontar disciplina por disciplina.
        </p>
        <Acao
          tela="Qualidade"
          clique={<NomeBotao>Ver por disciplina</NomeBotao>}
          resultado="Mostra onde as revisões estão concentradas, agrupado pelo nome da disciplina."
        />
        <div className="flex flex-wrap gap-2">
          <Atalho href="/qualidade">Qualidade</Atalho>
          <Atalho href="/ajuda/gestao/qualidade">Referência: Qualidade</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="patrimonio"
        numero="05"
        icone={Wrench}
        titulo="Patrimônio: os bens do escritório, e TI à parte"
        resumo="TI mora dentro do Patrimônio, mas tem porta própria."
      >
        <p>
          O cadastro geral cobre os bens físicos do escritório. As <strong>máquinas de TI</strong>{" "}
          formam um recorte dentro dele, atrás de uma permissão separada — ter acesso ao patrimônio
          geral não abre TI automaticamente.
        </p>
        <Acao
          tela="Patrimônio"
          clique={<NomeBotao>Novo item</NomeBotao>}
          resultado="Cadastra o bem; se for equipamento de TI, entra na aba própria, visível só a quem tem a permissão de TI."
        />
        <div className="flex flex-wrap gap-2">
          <Atalho href="/patrimonio">Patrimônio</Atalho>
          <Atalho href="/patrimonio/ti">TI</Atalho>
          <Atalho href="/ajuda/gestao/patrimonio">Referência: Patrimônio</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="acessos"
        numero="06"
        icone={KeyRound}
        titulo="Acessos e Credenciais: o cofre corporativo"
        resumo="Dois gates independentes decidem quem vê o cadastro e quem vê a senha — nunca é a mesma pergunta."
        ultima
      >
        <p>
          Cada credencial guarda uma senha criptografada. <strong>Ver que ela existe</strong> e{" "}
          <strong>ver a senha</strong> são permissões separadas, e podem ser compartilhadas por
          pessoa, por perfil de acesso ou por setor — independentemente uma da outra.
        </p>
        <Acao
          tela="Acessos"
          clique={<NomeBotao>Compartilhar</NomeBotao>}
          resultado="Concede ver cadastro e/ou ver senha para uma pessoa, perfil ou setor — os dois níveis, marcados separadamente."
        />
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <ShieldCheck className="mb-2 size-5 text-primary" aria-hidden="true" />
          <p className="font-semibold">Isto é o módulo mais sensível do sistema</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Responsável de uma credencial ganha o cadastro e a edição, nunca a senha por
            consequência. E o escopo global de acesso do sistema — quem vê “tudo” — não se aplica
            aqui: só <strong>superusuário</strong> vê todas as credenciais.
          </p>
        </div>
        <Dica>
          Senha nunca aparece em lista, mesmo para quem tem permissão — só linha a linha, ao abrir o
          registro específico. Ver <strong>•••</strong> numa credencial que você acessa é o segundo
          gate, não uma falha.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/acessos">Acessos</Atalho>
          <Atalho href="/acessos/categorias">Categorias</Atalho>
          <Atalho href="/ajuda/gestao/acessos">Referência: Acessos</Atalho>
        </div>
      </Etapa>
    </GuiaShell>
  );
}
