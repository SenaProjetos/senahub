import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Handshake,
  MessageSquareText,
  Rocket,
  Search,
  Target,
  UserPlus,
  Users,
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
 * Guia de uso do setor Clientes e Comercial (`/guias/clientes-comercial`).
 *
 * Foi o piloto do formato; migrado para `GuiaShell` na F0 do plano
 * `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`, ganhando as seções `#vocabulario` e
 * `#armadilhas` que o original não tinha. O glossário veio do `.md` que existia em
 * `docs/manual/clientes-comercial/guia-iniciante.md` — hoje reduzido a stub, porque a fonte da
 * verdade passou a ser esta página (ADR-0001).
 */

const MARCOS: readonly MarcoGuia[] = [
  { numero: "01", nome: "Entrada", href: "#entrada" },
  { numero: "02", nome: "Prospecção", href: "#prospeccao" },
  { numero: "03", nome: "Negociação", href: "#negociacao" },
  { numero: "04", nome: "Proposta", href: "#proposta" },
  { numero: "05", nome: "Projeto", href: "#fechamento" },
];

const INDICE: readonly ItemIndice[] = [
  { href: "#antes", label: "Antes de começar" },
  { href: "#entrada", label: "Registrar a entrada" },
  { href: "#prospeccao", label: "Acompanhar o lead" },
  { href: "#negociacao", label: "Abrir a negociação" },
  { href: "#proposta", label: "Preparar a proposta" },
  { href: "#fechamento", label: "Fechar a venda" },
  { href: "#rotina", label: "Rotina diária" },
];

const VOCABULARIO: readonly TermoGuia[] = [
  {
    termo: "Empresa",
    definicao: "Quem pode contratar o escritório. Uma mesma empresa contrata várias obras ao longo do tempo.",
    exemplo: "A construtora que já fez o projeto do galpão e agora quer o do prédio comercial é uma empresa só.",
  },
  {
    termo: "Contato",
    definicao: "A pessoa com quem você conversa dentro da empresa. Uma empresa tem vários contatos.",
    exemplo: "O engenheiro que pediu o orçamento e o sócio que assina o contrato são dois contatos da mesma empresa.",
  },
  {
    termo: "Entrada comercial",
    definicao: "O registro de como a demanda chegou: indicação, site, cliente recorrente, prospecção ativa ou outro canal.",
    exemplo: "Saber que 60% dos contratos vêm de indicação só é possível porque a origem foi registrada na entrada.",
  },
  {
    termo: "Lead",
    definicao:
      "Um contato que ainda precisa ser desenvolvido — há interesse, mas ainda não há pedido concreto. Vive no quadro de Prospecção.",
    exemplo: "Alguém que pediu para “conversar sobre um projeto no ano que vem” é lead, não negociação.",
  },
  {
    termo: "Prospecção",
    definicao: "O trabalho de desenvolver leads até virarem demanda real. É o primeiro dos dois quadros do Comercial.",
  },
  {
    termo: "Negociação",
    definicao:
      "O momento em que a demanda é real e você define escopo, disciplinas, valores e prazo. É o segundo quadro, e nasce de um lead qualificado.",
    exemplo: "O cliente disse “me manda uma proposta para o projeto estrutural”. Isso é negociação, não mais prospecção.",
  },
  {
    termo: "Proposta",
    definicao:
      "A oferta formal que o cliente recebe, com disciplinas, área, valores, validade e condições. Cada salvamento gera uma versão.",
  },
  {
    termo: "Follow-up",
    definicao: "Um retorno programado, com data, para a conversa não morrer por esquecimento. Aparece na Agenda e no Meu Dia.",
    exemplo: "“Ligar quinta que vem para saber se aprovaram o orçamento” é um follow-up.",
  },
  {
    termo: "Empresa 360",
    definicao:
      "A visão que reúne tudo sobre uma empresa: contatos, interações, prospecções, negociações, propostas, projetos e a próxima ação.",
    exemplo: "É por onde se retoma um cliente meses depois sem precisar perguntar ao time o que já aconteceu.",
  },
  {
    termo: "Tabela de preço",
    definicao: "Uma lista de valores por disciplina e área, usada para preencher a proposta sem calcular tudo à mão.",
  },
  {
    termo: "Parceiro",
    definicao: "Quem indicou o contato ou participa do negócio. É o que permite medir quanto cada indicador traz de trabalho.",
  },
];

const ARMADILHAS: readonly ArmadilhaGuia[] = [
  {
    titulo: "São dois quadros, não um",
    texto: (
      <>
        <strong>Prospecção</strong> e <strong>Negociações</strong> são quadros separados, com
        estágios próprios. Prospecção é para quem ainda precisa ser desenvolvido; Negociações é para
        quem já tem demanda real. Procurar um cliente no quadro errado é a confusão número um de quem
        está começando — o card não sumiu, ele avançou de quadro.
      </>
    ),
  },
  {
    titulo: "Empresa não é demanda",
    texto: (
      <>
        A mesma empresa contrata várias obras. Reaproveite sempre o cadastro dela, mas escolha{" "}
        <strong>Nova demanda / novo projeto</strong> quando o pedido for outra obra ou outro escopo.
        Criar uma segunda empresa para “separar os projetos” quebra o histórico e duplica o cliente.
      </>
    ),
  },
  {
    titulo: "Proposta avulsa nasce sem lead",
    texto: (
      <>
        Criar a proposta por <strong>Comercial → Propostas → Nova proposta</strong> a liga apenas ao
        cliente: ela fica <strong>sem vínculo com o lead</strong>, e some do histórico da prospecção.
        Para manter a linha do tempo inteira, use <strong>Nova proposta</strong> a partir da ficha do
        lead — esse caminho cria o cliente sozinho se ainda não existir.
      </>
    ),
  },
  {
    titulo: "Quem cria o projeto é a proposta",
    texto: (
      <>
        Não arraste a negociação para <strong>Contratado</strong> na mão achando que isso fecha a
        venda. O projeto nasce do botão <strong>Aceitar → projeto</strong> na proposta, que é o único
        caminho que leva as disciplinas e abre os canais. Marcar contratado à mão deixa a operação
        sem o projeto.
      </>
    ),
  },
  {
    titulo: "Perdido não é apagar",
    texto: (
      <>
        Marcar <strong>Perdido</strong> com o motivo real é o que alimenta a Inteligência — é assim
        que a gestão descobre se perde por preço, por prazo ou por falta de retorno. E o histórico
        continua lá: se o cliente voltar, é só reabrir.
      </>
    ),
  },
  {
    titulo: "Botão que não aparece é permissão",
    texto: (
      <>
        Se algum botão citado aqui não existir na sua tela, seu acesso é de consulta. Não é erro do
        sistema nem tela diferente — peça a permissão de gestão do Comercial a um gestor.
      </>
    ),
  },
];

const DUVIDAS: readonly DuvidaGuia[] = [
  {
    pergunta: "O cliente chegou por indicação. Preciso prospectar primeiro?",
    resposta:
      "Não. Registre a Nova entrada com o canal Indicação. Se já houver pedido concreto, escolha Abrir negociação agora; se ainda for um contato inicial, escolha Acompanhar como lead.",
  },
  {
    pergunta: "A empresa já existe. Crio outra?",
    resposta:
      "Não. Selecione a empresa encontrada. Para outra obra ou outro escopo, mantenha a empresa e escolha Nova demanda / novo projeto.",
  },
  {
    pergunta: "Lead, prospecção e negociação são a mesma coisa?",
    resposta:
      "Não. O lead é o interesse registrado dentro da prospecção. A negociação nasce quando esse interesse é qualificado. O sistema mantém os dois ligados.",
  },
  {
    pergunta: "Posso criar uma proposta sem negociação?",
    resposta:
      "Não para vendas novas. Qualifique a prospecção primeiro; depois escolha essa negociação ao criar a proposta.",
  },
  {
    pergunta: "O cliente voltou depois de uma perda. Começo do zero?",
    resposta:
      "Não. Reabra a negociação ou crie uma nova prospecção para uma nova demanda. O histórico anterior deve continuar visível.",
  },
  {
    pergunta: "Por que não vejo um botão citado aqui?",
    resposta:
      "Seu perfil pode ter acesso somente de consulta. Peça a um gestor ou administrador a permissão adequada.",
  },
  {
    pergunta: "Onde vejo tudo que já aconteceu com a empresa?",
    resposta:
      "Abra a ficha do cliente e consulte a Empresa 360: contatos, prospecções, negociações, propostas, projetos e interações ficam reunidos ali.",
  },
];

export function GuiaComercialView() {
  return (
    <GuiaShell
      voltar={{ href: "/comercial", label: "Voltar ao Comercial" }}
      titulo="Da entrada do cliente ao projeto contratado"
      descricao="Este é o caminho completo para indicações, demandas espontâneas, clientes recorrentes e prospecção ativa. Siga a ordem e registre cada conversa enquanto ela acontece."
      acoes={
        <>
          <Button size="sm" render={<Link href="/comercial/funil" />}>
            <Rocket className="size-4" aria-hidden="true" /> Registrar nova entrada
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/comercial?visao=meus" />}>
            <CalendarClock className="size-4" aria-hidden="true" /> Abrir Meu Dia
          </Button>
        </>
      }
      regra={{
        texto: (
          <>
            Não crie outro cadastro para “avançar” uma venda. O lead continua existindo; o sistema
            liga a ele a negociação, a proposta e, quando houver aceite, o projeto.
          </>
        ),
      }}
      marcos={MARCOS}
      indice={INDICE}
      vocabulario={VOCABULARIO}
      armadilhas={ARMADILHAS}
      duvidas={DUVIDAS}
      cta={{
        titulo: "Pronto para começar?",
        descricao: "Abra o quadro e registre a próxima entrada real do time.",
        href: "/comercial/funil",
        label: "Registrar nova entrada",
      }}
    >
      <Etapa
        id="antes"
        numero="00"
        icone={ClipboardCheck}
        titulo="Antes de começar: prepare o terreno"
        resumo="Estas configurações ajudam, mas você não precisa preencher tudo para registrar o primeiro contato."
      >
        <p>
          Para registrar uma entrada, saiba a <strong>empresa</strong>, o <strong>contato</strong> e
          <strong> como ele chegou</strong>. Se foi uma indicação, escolha também o parceiro ou
          indicador. Campanha e tabela de preço são úteis quando se aplicarem.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <Target className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Campanha</p>
            <p className="mt-1 text-sm text-muted-foreground">Agrupa contatos de uma mesma ação, lista ou evento.</p>
          </div>
          <div className="rounded-lg border p-3">
            <Users className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Parceiro</p>
            <p className="mt-1 text-sm text-muted-foreground">Identifica quem indicou ou participa do possível negócio.</p>
          </div>
          <div className="rounded-lg border p-3">
            <FileSpreadsheet className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Tabela de preço</p>
            <p className="mt-1 text-sm text-muted-foreground">Preenche valores da proposta por disciplina e área.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/comercial/campanhas">Campanhas</Atalho>
          <Atalho href="/comercial/parceiros">Parceiros</Atalho>
          <Atalho href="/comercial/tabelas">Tabelas de preço</Atalho>
        </div>
        <Dica>
          Se algum botão de criação ou edição não aparecer, seu acesso é somente de consulta. Peça ao
          responsável pelo SenaHub a permissão de gestão do Comercial.
        </Dica>
      </Etapa>

      <Etapa
        id="entrada"
        numero="01"
        icone={UserPlus}
        titulo="Registre a entrada comercial — é aqui que o lead nasce"
        resumo="Use o mesmo formulário para indicação, demanda espontânea, cliente recorrente ou prospecção ativa."
      >
        <div>
          <h3 className="font-semibold">Para registrar uma nova entrada</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:font-bold marker:text-primary">
            <li>Na página <strong className="text-foreground">Comercial</strong>, clique em <NomeBotao>Prospecção</NomeBotao>.</li>
            <li>No alto do quadro, clique em <NomeBotao>Nova entrada</NomeBotao>.</li>
            <li>Em <strong className="text-foreground">Como este contato chegou?</strong>, escolha indicação, site, cliente recorrente, prospecção ativa ou o canal correto.</li>
            <li>Se foi indicação, escolha quem indicou em <strong className="text-foreground">Quem indicou / parceiro</strong>. O perfil do LinkedIn é opcional.</li>
            <li>Digite o nome da empresa e aguarde a busca. Se ela já existir, <strong className="text-foreground">selecione o cadastro encontrado</strong>.</li>
            <li>Se a empresa tiver uma demanda ativa, informe se este contato pertence ao <strong className="text-foreground">mesmo trabalho</strong> ou a uma <strong className="text-foreground">nova demanda / novo projeto</strong>.</li>
            <li>Procure o contato existente ou preencha nome, cargo, e-mail e telefone para criar um novo.</li>
            <li>Escreva o nome da demanda ou empreendimento e registre a primeira interação.</li>
            <li>Escolha <NomeBotao>Acompanhar como lead</NomeBotao> quando ainda for preciso desenvolver o contato, ou <NomeBotao>Abrir negociação agora</NomeBotao> quando já houver pedido concreto de orçamento ou projeto.</li>
          </ol>
        </div>
        <Acao
          tela="Prospecção"
          clique={<NomeBotao>Nova entrada</NomeBotao>}
          resultado="Reaproveita empresa e contato sem misturar projetos; depois acompanha o lead ou abre a negociação imediatamente."
        />
        <Dica>
          <strong>Empresa não é demanda.</strong> Reaproveite o cadastro da empresa, mas escolha
          “Nova demanda / novo projeto” quando o novo pedido for outra obra ou outro escopo.
        </Dica>

        <div className="border-t pt-4">
          <h3 className="font-semibold">Para uma lista de prospecção ativa</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra <NomeBotao>Importar</NomeBotao>, escolha <NomeBotao>Selecionar arquivo</NomeBotao>,
            associe as colunas, clique em <NomeBotao>Validar</NomeBotao> e confira o resumo. Só então use
            <NomeBotao>Importar … linha(s)</NomeBotao>. A tela mostra o que será criado, vinculado, ignorado ou recusado.
          </p>
          <div className="mt-3">
            <Atalho href="/comercial/importar">Abrir importação</Atalho>
          </div>
        </div>
      </Etapa>

      <Etapa
        id="prospeccao"
        numero="02"
        icone={MessageSquareText}
        titulo="Trabalhe o contato e deixe o próximo passo marcado"
        resumo="Use esta etapa somente para entradas que ainda precisam ser desenvolvidas pelo time."
      >
        <p>
          Arraste o card conforme a conversa avançar: <strong>Identificado → Contato iniciado → Em contato →
          Qualificado</strong>. Não é preciso forçar todas as etapas se a pessoa já chegar interessada, mas o
          estágio deve sempre representar a situação real de hoje. Se você escolheu
          <strong> Abrir negociação agora</strong> na entrada, pule este passo e siga para Negociação.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <MessageSquareText className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Depois de conversar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No card, use o ícone <strong className="text-foreground">Registrar interação</strong> e escolha
              ligação, WhatsApp, e-mail, LinkedIn, reunião ou nota.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <CalendarClock className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Antes de encerrar o atendimento</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clique no nome da empresa para abrir a ficha do lead e use
              <strong className="text-foreground"> Agendar follow-up</strong>. Informe o que fazer e quando. A
              tarefa aparecerá no Meu Dia.
            </p>
          </div>
        </div>
        <Acao
          tela="Quadro de Prospecção"
          clique={<NomeBotao>Registrar interação</NomeBotao>}
          resultado="Guarda a conversa na linha do tempo da empresa e evita depender de memória, WhatsApp ou anotações soltas."
        />
        <Dica>
          Uma boa rotina é simples: <strong>conversou, registrou; prometeu retorno, agendou</strong>. Assim qualquer
          pessoa do time entende o que aconteceu e qual é o próximo passo.
        </Dica>
        <Atalho href="/comercial/funil">Abrir o funil</Atalho>
      </Etapa>

      <Etapa
        id="negociacao"
        numero="03"
        icone={Handshake}
        titulo="Qualifique e abra a negociação"
        resumo="Faça isso quando existir uma demanda real: obra, escopo, prazo ou interesse concreto em receber uma proposta."
      >
        <p>
          Quando um lead acompanhado ganhar uma demanda real, arraste o card para
          <strong> Negociação criada</strong>. Se a demanda já chegou concreta — comum em indicações e
          clientes recorrentes — a opção <strong>Abrir negociação agora</strong> da entrada faz isso no
          mesmo salvamento. Nos dois casos, o sistema mantém o lead original e liga a negociação a ele.
        </p>
        <Acao
          tela="Quadro de Prospecção"
          clique={<NomeBotao>Arrastar para “Negociação criada”</NomeBotao>}
          resultado="Qualifica o lead e abre uma negociação no estágio Levantamento, preservando todo o histórico anterior."
        />
        <div>
          <h3 className="font-semibold">Depois, abra o quadro Negociações</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            O caminho normal é <strong className="text-foreground">Levantamento → Orçamento → Proposta enviada →
            Negociação</strong>. Arraste o card à medida que a venda avançar. Use o checklist do card como lembrete
            e continue registrando interações.
          </p>
        </div>
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">Se a conversa parar ou terminar</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li><strong className="text-foreground">Em espera:</strong> existe chance, mas não é hora de avançar.</li>
            <li><strong className="text-foreground">Perdido:</strong> a venda não aconteceu; informe o motivo solicitado.</li>
            <li><strong className="text-foreground">Cancelado:</strong> o processo foi encerrado sem uma perda comercial comum.</li>
            <li>Se o cliente voltar, use <strong className="text-foreground">Reabrir negociação</strong>; o histórico não é apagado.</li>
          </ul>
        </div>
        <Atalho href="/comercial/funil">Abrir o funil</Atalho>
      </Etapa>

      <Etapa
        id="proposta"
        numero="04"
        icone={FileText}
        titulo="Monte, salve e envie a proposta"
        resumo="Toda proposta nova deve nascer de uma negociação existente."
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:font-bold marker:text-primary">
          <li>Abra <strong className="text-foreground">Comercial → Propostas</strong>.</li>
          <li>Clique em <NomeBotao>Nova proposta</NomeBotao>.</li>
          <li>Informe o título, escolha o cliente e depois a negociação correspondente. Clique em <NomeBotao>Criar</NomeBotao>.</li>
          <li>Inclua as disciplinas com <NomeBotao>Item</NomeBotao> ou use <NomeBotao>Preencher pela tabela de preço</NomeBotao>.</li>
          <li>Preencha área, validade, observações, desconto e condições de pagamento quando se aplicarem.</li>
          <li>Clique em <NomeBotao>Salvar proposta</NomeBotao>. Cada salvamento cria uma versão, preservando o que foi enviado antes.</li>
          <li>Use <NomeBotao>E-mail</NomeBotao> para enviar pelo sistema ou <NomeBotao>Link</NomeBotao> para copiar o endereço público.</li>
          <li>Quando o cliente começar a discutir valores ou condições, clique em <NomeBotao>Em negociação</NomeBotao>.</li>
        </ol>
        <Acao
          tela="Editor da proposta"
          clique={<NomeBotao>Salvar proposta</NomeBotao>}
          resultado="Grava uma nova versão com os itens, valores, condições, validade e desconto exibidos na tela."
        />
        <Dica>
          Confira o total antes de enviar. Se o desconto ultrapassar o limite definido pela empresa, o sistema pedirá uma justificativa.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/comercial/propostas">Abrir Propostas</Atalho>
          <Atalho href="/comercial/tabelas">Consultar tabelas de preço</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="fechamento"
        numero="05"
        icone={CheckCircle2}
        titulo="Registre a decisão e transforme o aceite em projeto"
        resumo="O fechamento correto mantém os relatórios confiáveis e entrega o trabalho para a operação."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <CheckCircle2 className="mb-2 size-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">Se o cliente aceitou</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Abra a proposta aceita e clique em <NomeBotao>Aceitar → projeto</NomeBotao>. O SenaHub marca a
              negociação como Contratado, cria o projeto, leva as disciplinas e abre os canais necessários.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <CircleHelp className="mb-2 size-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-semibold">Se o cliente recusou</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Clique em <NomeBotao>Recusar</NomeBotao> e informe o motivo. Se a negociação inteira acabou,
              mova também o card para Perdido e registre o motivo comercial.
            </p>
          </div>
        </div>
        <Acao
          tela="Proposta"
          clique={<NomeBotao>Aceitar → projeto</NomeBotao>}
          resultado="Cria o projeto uma única vez e mantém empresa, lead, negociação e proposta ligados no histórico comercial."
        />
        <Dica>
          Não mova manualmente uma negociação para Contratado antes do aceite. O botão da proposta é o caminho
          que cria o projeto com os dados corretos.
        </Dica>
      </Etapa>

      <Etapa
        id="rotina"
        numero="06"
        icone={CalendarClock}
        titulo="Use o Comercial todos os dias"
        resumo="A venda só fica organizada quando o sistema acompanha também os retornos, não apenas os cadastros."
        ultima
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <CalendarClock className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Meu Dia</p>
            <p className="mt-1 text-sm text-muted-foreground">Veja ações vencidas, próximas ações, propostas aguardando retorno e negociações paradas.</p>
          </div>
          <div className="rounded-lg border p-3">
            <Search className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Meus × Todos</p>
            <p className="mt-1 text-sm text-muted-foreground">Use “Meus” para focar na sua carteira e “Todos” para acompanhar o time inteiro.</p>
          </div>
          <div className="rounded-lg border p-3">
            <BarChart3 className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Inteligência</p>
            <p className="mt-1 text-sm text-muted-foreground">Acompanhe conversão, receita, ticket, canais, campanhas e listas que precisam de reativação.</p>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="font-semibold">Checklist de cinco minutos</p>
          <ol className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li>1. Abra <strong className="text-foreground">Meu Dia</strong>.</li>
            <li>2. Resolva primeiro o que está atrasado.</li>
            <li>3. Registre as conversas que aconteceram.</li>
            <li>4. Agende o próximo passo de cada contato.</li>
            <li>5. Atualize os cards que mudaram de situação.</li>
            <li>6. Confira propostas perto do vencimento.</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/comercial?visao=meus">Abrir Meu Dia</Atalho>
          <Atalho href="/comercial/inteligencia">Abrir Inteligência</Atalho>
        </div>
      </Etapa>
    </GuiaShell>
  );
}
