import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  GanttChart,
  Layers,
  ListChecks,
  Rocket,
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
 * Guia de uso do setor Projetos (`/guias/projetos`). F1 do plano
 * `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`.
 *
 * Escrito conferindo cada afirmação contra o código, não contra o manual (ADR-001):
 * `modules/projetos/{status,health,atraso,prontidao,estrutura-tipo,abas,visao-geral}.ts`,
 * `modules/planejamento/motor.ts` e o `projeto-visao-geral.tsx`. As divergências
 * encontradas estão na §12 do plano.
 *
 * Começa exatamente onde o guia do Comercial termina: o projeto nasce do aceite da proposta.
 */

const MARCOS: readonly MarcoGuia[] = [
  { numero: "01", nome: "Nasce", href: "#nasce" },
  { numero: "02", nome: "Planejar", href: "#planejar" },
  { numero: "03", nome: "Equipe", href: "#equipe" },
  { numero: "04", nome: "Executar", href: "#executar" },
  { numero: "05", nome: "Entregar", href: "#entregar" },
];

const INDICE: readonly ItemIndice[] = [
  { href: "#nasce", label: "O projeto nasce" },
  { href: "#planejar", label: "Planejar" },
  { href: "#equipe", label: "Montar a equipe" },
  { href: "#executar", label: "Executar" },
  { href: "#entregar", label: "Entregar e aprovar" },
];

const VOCABULARIO: readonly TermoGuia[] = [
  {
    termo: "Disciplina",
    definicao:
      "A frente de engenharia dentro do projeto — Estrutural, Elétrico, Hidráulico. Cada uma tem responsável, prazo e status próprios. É a unidade real de trabalho: quase tudo no sistema pendura na disciplina, não no projeto.",
    exemplo: "Um projeto pode estar 60% pronto porque o Estrutural foi aprovado e o Elétrico nem começou.",
  },
  {
    termo: "Código do projeto",
    definicao:
      "O identificador sequencial no formato AAXXXX — dois dígitos do ano mais quatro do sequencial. É por ele que o time se refere ao projeto em conversa.",
    exemplo: "260142 é o 142º projeto aberto em 2026.",
  },
  {
    termo: "Tipo de projeto",
    definicao:
      "Particular, Licitação, Aprovação ou Laudo. Não é rótulo: o tipo decide como os arquivos são organizados e como a disciplina é concluída.",
  },
  {
    termo: "Prazo de contrato",
    definicao:
      "A data prometida ao cliente. É o compromisso externo — aparece no Portal e é o que vale numa cobrança.",
  },
  {
    termo: "Prazo planejado",
    definicao:
      "A data que a equipe persegue internamente, normalmente antes do contrato para dar folga. É este — não o de contrato — que alimenta a saúde do projeto e o cronograma.",
    exemplo: "Contrato em 30/11, planejado em 15/11: o projeto acende amarelo a partir de 01/11, não de 16/11.",
  },
  {
    termo: "Status da disciplina",
    definicao:
      "Aguardando → Em andamento → Entregue ⇄ Em revisão → Aprovado. O vaivém entre Entregue e Em revisão é normal e esperado; Aprovado é ponto final.",
  },
  {
    termo: "Progresso",
    definicao:
      "O percentual do projeto, calculado como média do peso de cada status de disciplina — Aguardando vale 0, Em andamento 40%, Em revisão 60%, Entregue 85%, Aprovado 100%.",
    exemplo: "Duas disciplinas, uma aprovada e outra sem começar, dão 50% — mesmo que a segunda seja o dobro de trabalho.",
  },
  {
    termo: "Saúde",
    definicao:
      "O semáforo do projeto. Vermelho quando o prazo planejado já passou ou metade ou mais das disciplinas ativas estão atrasadas; amarelo quando há qualquer disciplina atrasada ou o prazo planejado cai em até 14 dias; verde no resto. Só existe para projetos em andamento.",
  },
  {
    termo: "Apontamento",
    definicao:
      "Um problema marcado num ponto específico: um pino numa prancha em PDF, ou um pino no modelo 3D federado da Compatibilização. Tem número, autor, descrição e um ciclo próprio até ser fechado.",
    exemplo: "“#7 (pág. 3) — viga colide com a tubulação” é um apontamento de prancha.",
  },
  {
    termo: "EAP",
    definicao:
      "A decomposição do projeto em tarefas numeradas em árvore (1, 1.2, 1.2.3). É o cronograma: cada tarefa tem uma duração em dias úteis e pode depender de outra, e o sistema calcula as datas a partir disso.",
  },
  {
    termo: "Caminho crítico e folga",
    definicao:
      "A folga é quanto uma tarefa pode atrasar (em dias úteis) sem empurrar o fim do projeto. Tarefas com folga zero formam o caminho crítico — atrasou uma delas, atrasou tudo.",
    exemplo: "Se o levantamento em campo tem folga zero, uma semana perdida ali é uma semana no fim do projeto.",
  },
  {
    termo: "Alocação e carga",
    definicao:
      "Alocação é o compromisso de uma pessoa com um projeto, com período de início e fim. Carga é quanto do tempo dela já está comprometido no total. A matriz de Recursos mostra as duas coisas juntas.",
  },
  {
    termo: "Revisão",
    definicao:
      "Uma versão de um documento entregue. O apontamento nasce numa revisão e é verificado em outra — é assim que se sabe se a correção realmente entrou no arquivo novo.",
  },
];

const ARMADILHAS: readonly ArmadilhaGuia[] = [
  {
    titulo: "“Pendências” não é uma coisa só",
    texto: (
      <>
        O cartão <strong>Pendências críticas</strong> da Visão Geral soma <strong>cinco</strong> filas
        diferentes: apontamentos de prancha, apontamentos da Compatibilização, tarefas abertas,
        solicitações de revisão e aprovações aguardando. Mas o link <strong>Ver pendências</strong>{" "}
        leva a uma tela chamada <strong>Apontamentos</strong>, que mostra só a primeira delas — então
        o número lá costuma ser menor que o do cartão. Não é erro de contagem: são recortes
        diferentes. Para saber de onde vem cada item, olhe a própria Visão Geral, que separa as filas.
      </>
    ),
  },
  {
    titulo: "São dois prazos, e o que manda depende de para quem você olha",
    texto: (
      <>
        <strong>Contrato</strong> é a data do cliente. <strong>Planejado</strong> é a data da equipe.
        A saúde do projeto, o cronograma e o alerta de atraso leem o <strong>planejado</strong>. Se
        você preencher só o de contrato, o projeto não fica “sem prazo” — fica sem semáforo, e ninguém
        é avisado antes de estourar.
      </>
    ),
  },
  {
    titulo: "Você não escolhe “Aprovado” no seletor",
    texto: (
      <>
        <strong>Aprovado</strong> é ponto final e não aparece na lista de status. A disciplina chega
        lá por outro caminho: pela validação da entrega (quando todos os entregáveis foram conferidos)
        ou pela confirmação da aprovação, nos projetos que usam a árvore de pastas. Procurar o status
        no seletor e não achar é normal — o botão está no fluxo de entrega, não no menu de status.
      </>
    ),
  },
  {
    titulo: "Dois jeitos de concluir, e vale por disciplina",
    texto: (
      <>
        Projetos de <strong>Aprovação</strong> e <strong>Laudo</strong> usam uma árvore de pastas e
        concluem por confirmação em duas etapas. <strong>Particular</strong> e{" "}
        <strong>Licitação</strong> usam pacotes de entregáveis e concluem por validação arquivo a
        arquivo. A pegadinha: isso é decidido <strong>por disciplina</strong>, não pelo tipo do
        projeto — disciplinas antigas de um projeto de Aprovação podem seguir no fluxo de pacotes. Se
        a tela não oferece o que você esperava, é esse o motivo.
      </>
    ),
  },
  {
    titulo: "A tela do seu colega pode ter outras abas",
    texto: (
      <>
        As abas do projeto (Disciplinas, Inputs, Financeiro, Lista Mestre, Compatibilização, Custos,
        Diário…) são <strong>configuráveis por projeto</strong>, e ainda somem quando você não tem
        permissão ou quando estão vazias. Combinar “abre a aba Custos” por telefone falha quando o
        projeto do outro está com ela oculta.
      </>
    ),
  },
  {
    titulo: "“Adiado” tira da fila; “Em correção” não",
    texto: (
      <>
        Um apontamento <strong>Em correção</strong> continua contando como aberto e continua
        segurando a validação da entrega — alguém estar mexendo nele não o resolve.{" "}
        <strong>Adiado</strong> é o único estado que tira o item da fila sem encerrá-lo, e é decisão
        de quem coordena, não atalho para destravar a entrega.
      </>
    ),
  },
];

const DUVIDAS: readonly DuvidaGuia[] = [
  {
    pergunta: "De onde vem um projeto?",
    resposta:
      "Do aceite de uma proposta no Comercial. O botão Aceitar → projeto cria o projeto já com as disciplinas negociadas e abre os canais de conversa. Projeto criado à mão existe, mas perde o vínculo com o histórico comercial.",
  },
  {
    pergunta: "O projeto está 85% e nada foi aprovado. Faz sentido?",
    resposta:
      "Sim. O progresso é a média do peso dos status, e Entregue já vale 85%. Um projeto com tudo entregue e nada aprovado marca 85% — falta a conferência, não o trabalho.",
  },
  {
    pergunta: "Qual a diferença entre tarefa e apontamento?",
    resposta:
      "Tarefa é trabalho que alguém planejou fazer. Apontamento é um problema encontrado num ponto específico de uma prancha ou do modelo 3D. Apontamentos podem virar itens de uma tarefa, mas nascem da revisão, não do plano.",
  },
  {
    pergunta: "Mudei o prazo de uma disciplina para depois do fim do projeto. Pode?",
    resposta:
      "A disciplina não pode passar do prazo planejado do projeto. Ao reabrir uma disciplina com prazo maior, o prazo planejado do projeto é empurrado junto — mas só se o projeto já tiver um. Projeto sem prazo planejado não ganha um por causa disso.",
  },
  {
    pergunta: "O que é “folga zero” no cronograma?",
    resposta:
      "Que a tarefa está no caminho crítico: qualquer atraso nela atrasa a entrega final. O cálculo conta dias úteis (segunda a sexta, sem os feriados cadastrados) e entende os quatro tipos de dependência, com atraso opcional.",
  },
  {
    pergunta: "Onde vejo só o que é meu?",
    resposta:
      "Em Meu trabalho. Ele lista as disciplinas em que você é responsável, apenas de projetos em andamento e ainda não aprovadas, ordenadas por prazo.",
  },
  {
    pergunta: "Por que não vejo uma aba ou um botão citado aqui?",
    resposta:
      "Pode ser permissão, pode ser configuração de abas do projeto, e pode ser que a aba esteja vazia. Se for permissão, peça a um gestor; as outras duas se resolvem na própria configuração do projeto.",
  },
];

export function GuiaProjetosView() {
  return (
    <GuiaShell
      voltar={{ href: "/projetos", label: "Voltar aos Projetos" }}
      titulo="Do projeto contratado à entrega aprovada"
      descricao="Este é o caminho que todo projeto percorre: nasce do aceite da proposta, ganha um plano e uma equipe, é executado disciplina a disciplina e termina quando cada entrega é aprovada."
      acoes={
        <>
          <Button size="sm" render={<Link href="/projetos" />}>
            <FolderKanban className="size-4" aria-hidden="true" /> Abrir a carteira
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/projetos/meu-trabalho" />}>
            <ListChecks className="size-4" aria-hidden="true" /> Ver Meu trabalho
          </Button>
        </>
      }
      regra={{
        texto: (
          <>
            Quase tudo pendura na <strong>disciplina</strong>, não no projeto: responsável, prazo,
            status, arquivos e apontamentos. Quando algo parecer perdido, pergunte primeiro “de qual
            disciplina isso é?”.
          </>
        ),
      }}
      marcos={MARCOS}
      indice={INDICE}
      vocabulario={VOCABULARIO}
      armadilhas={ARMADILHAS}
      duvidas={DUVIDAS}
      cta={{
        titulo: "Comece pelo que é seu",
        descricao: "Meu trabalho mostra suas disciplinas ativas, na ordem do prazo.",
        href: "/projetos/meu-trabalho",
        label: "Abrir Meu trabalho",
      }}
    >
      <Etapa
        id="nasce"
        numero="01"
        icone={Rocket}
        titulo="O projeto nasce do aceite da proposta"
        resumo="É aqui que o guia do Comercial termina e este começa — os dois se encaixam neste ponto."
      >
        <p>
          Quando o cliente aprova a proposta, alguém do Comercial clica em{" "}
          <NomeBotao>Aceitar → projeto</NomeBotao>. O SenaHub cria o projeto já com as{" "}
          <strong>disciplinas</strong> que foram negociadas, dá a ele um <strong>código</strong> do
          ano e abre os canais de conversa. Nada disso precisa ser refeito à mão.
        </p>
        <Acao
          tela="Proposta aceita, no Comercial"
          clique={<NomeBotao>Aceitar → projeto</NomeBotao>}
          resultado="Cria o projeto com as disciplinas negociadas, gera o código do ano e abre os canais — uma vez só."
        />
        <div>
          <h3 className="font-semibold">O que conferir logo no começo</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:font-bold marker:text-primary">
            <li>
              <strong className="text-foreground">Os dois prazos.</strong> O de contrato veio da
              proposta; o <strong className="text-foreground">planejado</strong> normalmente precisa
              ser preenchido, e é ele que liga o semáforo e o cronograma.
            </li>
            <li>
              <strong className="text-foreground">O tipo.</strong> Particular, Licitação, Aprovação ou
              Laudo — decide como os arquivos se organizam e como a entrega é concluída.
            </li>
            <li>
              <strong className="text-foreground">As disciplinas.</strong> Confira se a lista bate com
              o que foi vendido, e dê a cada uma responsável e prazo.
            </li>
          </ol>
        </div>
        <Dica>
          <strong>O aceite não traz tudo pronto — e isso é proposital.</strong> Ele cria as
          disciplinas e coloca o responsável da negociação como coordenador, mas{" "}
          <strong>não</strong> define quem faz cada disciplina nem monta o cronograma: a proposta não
          diz quem desenha o Estrutural nem que tarefas o projeto tem. É exatamente por isso que os
          dois passos seguintes existem.
        </Dica>
        <Dica>
          A <strong>Visão Geral</strong> do projeto é a primeira aba e nunca some. É de lá que se lê a
          saúde, o progresso, as filas em aberto e os riscos registrados.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/projetos">Carteira de projetos</Atalho>
          <Atalho href="/ajuda/projetos/projetos">Referência: Projetos</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="planejar"
        numero="02"
        icone={GanttChart}
        titulo="Monte a EAP e descubra o caminho crítico"
        resumo="O planejamento transforma “entregar até novembro” em uma sequência de tarefas com datas e dependências."
      >
        <p>
          Em <strong>Planejamento</strong> o projeto é quebrado em tarefas numeradas em árvore — a{" "}
          <strong>EAP</strong>. Cada tarefa recebe uma duração em dias úteis, e você liga umas às outras
          dizendo o que precisa terminar antes do que — as datas o sistema calcula. Com isso o sistema calcula sozinho a{" "}
          <strong>folga</strong> de cada tarefa e destaca o <strong>caminho crítico</strong>.
        </p>
        <Acao
          tela="Planejamento do projeto"
          clique={<NomeBotao>Nova tarefa</NomeBotao>}
          resultado="Entra na EAP com numeração em árvore; ao ganhar predecessoras, passa a contar no cálculo de folga."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <GanttChart className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Caminho crítico</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A corrente de tarefas com folga zero. Atrasar qualquer uma delas atrasa a entrega — é
              onde vale gastar atenção antes de gastar hora extra.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <ClipboardCheck className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Plano × realidade</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ao aprovar o cronograma, o sistema congela a linha de base — o combinado — e passa a
              mostrar o desvio conforme as tarefas andam. É assim que se percebe o atraso enquanto
              ainda dá para reagir.
            </p>
          </div>
        </div>
        <Dica>
          O cálculo trabalha em <strong>dias úteis</strong> — segunda a sexta, sem os feriados
          cadastrados — e entende os quatro tipos de dependência, com atraso. Salvar uma tarefa já
          recalcula o cronograma inteiro.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/planejamento">Abrir Planejamento</Atalho>
          <Atalho href="/ajuda/projetos/planejamento">Referência: Planejamento</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="equipe"
        numero="03"
        icone={Users}
        titulo="Coloque gente nas disciplinas"
        resumo="Sem responsável, a disciplina não anda — e não pode nem ser aprovada no fim."
      >
        <p>
          Cada disciplina tem um ou mais <strong>responsáveis</strong>. É essa ligação que faz o
          trabalho aparecer em <strong>Meu trabalho</strong> para a pessoa certa, e é ela que a
          validação da entrega vai cobrar lá no fim: disciplina sem responsável não é aprovada.
        </p>
        <Acao
          tela="Disciplinas do projeto"
          clique={<NomeBotao>Responsáveis</NomeBotao>}
          resultado="Liga a pessoa à disciplina; o item passa a aparecer no Meu trabalho dela, ordenado por prazo."
        />
        <div>
          <h3 className="font-semibold">Antes de prometer prazo, olhe a carga</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A matriz de <strong className="text-foreground">Recursos</strong> mostra quem está alocado
            em quê e quanto do tempo de cada pessoa já está comprometido. Alocação tem{" "}
            <strong className="text-foreground">período</strong>: começa e termina, e duas alocações
            da mesma pessoa não podem se sobrepor no mesmo intervalo.
          </p>
        </div>
        <Dica>
          Prazo apertado com a pessoa certa costuma ser melhor que prazo folgado com quem já está em
          três projetos. A matriz existe para essa conversa acontecer antes, não depois.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/recursos">Abrir Recursos</Atalho>
          <Atalho href="/ajuda/projetos/recursos">Referência: Recursos</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="executar"
        numero="04"
        icone={Layers}
        titulo="Toque o dia a dia: tarefas, agenda e apontamentos"
        resumo="É a etapa mais longa e a que mais depende de registro — o que não é anotado some."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <ListChecks className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Meu trabalho</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Suas disciplinas ativas, por prazo. Só projetos em andamento, só o que ainda não foi
              aprovado.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <ClipboardCheck className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Tarefas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O quadro do que precisa ser feito. Um apontamento pode virar item de uma tarefa, ligando
              a revisão ao trabalho.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <CalendarDays className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Agenda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Compromissos e próximas ações, incluindo o que veio do Comercial e dos lembretes do
              projeto.
            </p>
          </div>
        </div>
        <div>
          <h3 className="font-semibold">Revisar é apontar no ponto exato</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Em vez de mandar “tem um erro na prancha 3”, você clica no ponto e escreve ali. O{" "}
            <strong className="text-foreground">apontamento</strong> ganha número, fica ancorado
            àquele trecho do documento e sobrevive à revisão seguinte — dá para verificar se a
            correção realmente entrou no arquivo novo. O mesmo vale no modelo 3D, na aba de{" "}
            <strong className="text-foreground">Compatibilização</strong>.
          </p>
        </div>
        <Acao
          tela="Prancha aberta no visualizador"
          clique={<NomeBotao>Apontar</NomeBotao>}
          resultado="Cria um apontamento numerado no ponto clicado, com autor e descrição, visível para o responsável da disciplina."
        />
        <Dica>
          Enquanto houver apontamento em aberto, a entrega não é validada. É intencional: a
          conferência acontece antes do “pronto”, não depois.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/projetos/meu-trabalho">Meu trabalho</Atalho>
          <Atalho href="/tarefas">Tarefas</Atalho>
          <Atalho href="/agenda">Agenda</Atalho>
          <Atalho href="/pendencias">Apontamentos abertos</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="entregar"
        numero="05"
        icone={CheckCircle2}
        titulo="Entregue, revise se precisar, e aprove"
        resumo="O fim da disciplina não é marcar um status: é passar pela conferência da entrega."
        ultima
      >
        <p>
          A disciplina caminha <strong>Aguardando → Em andamento → Entregue</strong>. Dali ela pode ir
          e voltar para <strong>Em revisão</strong> quantas vezes for preciso — isso é normal, não é
          retrabalho mal-feito. O último passo, <strong>Aprovado</strong>, é ponto final e{" "}
          <strong>não se escolhe no seletor de status</strong>.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <CheckCircle2 className="mb-2 size-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">Particular e Licitação</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Os entregáveis são conferidos um a um. Quando todos estiverem validados e a disciplina
              tiver responsável, ela fica <strong>pronta para aprovar</strong> — e a aprovação da
              entrega é o que a leva a Aprovado.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <ClipboardCheck className="mb-2 size-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-semibold">Aprovação e Laudo</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Os arquivos ficam numa árvore de pastas própria e a conclusão é em duas etapas: o
              responsável solicita, e a disciplina fica <strong>aguardando confirmação</strong> até
              alguém confirmar.
            </p>
          </div>
        </div>
        <Acao
          tela="Disciplina pronta"
          clique={<NomeBotao>Aprovar entrega</NomeBotao>}
          resultado="Leva a disciplina a Aprovado, que é terminal — dali ela sai das filas de trabalho e do Meu trabalho."
        />
        <Dica>
          Se a disciplina não oferece o botão que você esperava, olhe qual dos dois fluxos ela usa: a
          escolha é por <strong>disciplina</strong>, não pelo tipo do projeto.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/aprovacoes">Fila de aprovações</Atalho>
          <Atalho href="/ajuda/projetos/projetos">Referência: Projetos</Atalho>
        </div>
      </Etapa>
    </GuiaShell>
  );
}
