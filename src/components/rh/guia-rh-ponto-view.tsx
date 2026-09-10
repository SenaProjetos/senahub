import {
  BadgeCheck,
  Banknote,
  CalendarCheck,
  Clock,
  FileCheck2,
  IdCard,
  Palmtree,
  Scale,
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
 * Guia de uso do setor RH e Ponto (`/guias/rh-ponto`). F3 do plano
 * `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`.
 *
 * Conferido contra o código, não contra o manual (ADR-001): `lib/{aquisitivo,encargos}.ts`,
 * `modules/ponto/{engine,esperado,apuracao}.ts` e `modules/rh/banco/{queries,actions}.ts`.
 * Divergências na §12 do plano.
 *
 * Setor juridicamente sensível: nenhuma afirmação aqui deve ser lida como orientação
 * trabalhista — o guia explica o que **o sistema faz**, e diz quando a regra é simplificada.
 */

const MARCOS: readonly MarcoGuia[] = [
  { numero: "01", nome: "Vínculo", href: "#vinculo" },
  { numero: "02", nome: "Bater", href: "#bater" },
  { numero: "03", nome: "Conferir", href: "#conferir" },
  { numero: "04", nome: "Fechar", href: "#fechar" },
  { numero: "05", nome: "Pagar", href: "#pagar" },
];

const INDICE: readonly ItemIndice[] = [
  { href: "#vinculo", label: "O vínculo manda" },
  { href: "#bater", label: "Bater o ponto" },
  { href: "#conferir", label: "Conferir o espelho" },
  { href: "#fechar", label: "Fechar o banco" },
  { href: "#pagar", label: "Pagar" },
  { href: "#ferias", label: "Férias" },
];

const VOCABULARIO: readonly TermoGuia[] = [
  {
    termo: "Vínculo",
    definicao:
      "O registro de que uma pessoa trabalha aqui em determinado período, com uma forma de contratação e uma escala. Tem início e pode ter fim — e é sempre o vínculo que cobre o mês analisado que vale, não o vínculo de hoje.",
    exemplo: "Quem foi estagiário até junho e virou CLT em julho tem dois vínculos; junho é apurado pelo primeiro.",
  },
  {
    termo: "Contratação",
    definicao:
      "Como a pessoa é contratada: CLT, estágio, PJ, autônomo, pró-labore. É este eixo — e não o cargo dela no sistema — que decide se há jornada a controlar, banco de horas e folha.",
  },
  {
    termo: "Jornada controlada",
    definicao:
      "Só CLT e estágio têm jornada controlada. Quem não tem não gera hora esperada em nenhum dia, logo não acumula falta nem saldo negativo.",
    exemplo: "Um projetista PJ pode não bater ponto nenhum no mês e o saldo dele continua zero, não negativo.",
  },
  {
    termo: "Batida",
    definicao:
      "Cada marcação individual: entrada, início de descanso, fim de descanso e saída. O dia se monta a partir da sequência delas.",
  },
  {
    termo: "Jornada",
    definicao:
      "O dia inteiro montado a partir das batidas. Aceita vários descansos e turno quebrado — sair e voltar no mesmo dia é normal. O dia pertence à data local da entrada.",
  },
  {
    termo: "Escala",
    definicao:
      "A grade da semana: quais dias são ativos e quantas horas cada um espera. Um dia fora da grade não cobra hora nenhuma.",
  },
  {
    termo: "Horas esperadas",
    definicao:
      "Quanto o sistema espera de você em cada dia, a partir da escala. Feriado e férias aprovadas zeram o dia; dias fora do período do vínculo também.",
  },
  {
    termo: "Espelho de ponto",
    definicao:
      "O extrato do mês: dia a dia, o que era esperado, o que foi registrado e a diferença. É onde se confere e se pede ajuste.",
  },
  {
    termo: "Banco de horas",
    definicao:
      "O saldo entre o trabalhado e o esperado, acumulado mês a mês. Quando o mês é fechado, o saldo daquele mês e o acumulado são congelados.",
  },
  {
    termo: "Período aquisitivo",
    definicao:
      "Os 12 meses de trabalho que dão direito a 30 dias de férias. Enquanto ele corre, o direito ainda está sendo adquirido.",
    exemplo: "Admitido em 10/03/2025: o primeiro período aquisitivo vai de 10/03/2025 a 09/03/2026.",
  },
  {
    termo: "Período concessivo",
    definicao:
      "A janela de 12 meses, depois que o aquisitivo fecha, para as férias serem gozadas. Passou a janela sem gozar, o período aparece como vencido.",
  },
  {
    termo: "Encargos",
    definicao:
      "INSS e IRRF calculados por faixas progressivas sobre o salário. As faixas não estão embutidas no sistema — são cadastradas em Configurações e podem estar vazias.",
  },
  {
    termo: "Folha × Produção",
    definicao:
      "Duas esteiras de pagamento diferentes. Folha é o pagamento CLT, com encargos e jornada. Produção é o pagamento do projetista PJ por entrega validada, e vive no Financeiro.",
  },
];

const ARMADILHAS: readonly ArmadilhaGuia[] = [
  {
    titulo: "É a contratação que manda, não o cargo",
    texto: (
      <>
        Cargo e forma de contratação são eixos diferentes, e quem decide banco de horas, jornada e
        folha é a <strong>contratação</strong>. Alguém com cargo administrativo{" "}
        <strong>contratado como CLT</strong> tem banco de horas; alguém com cargo de projetista que
        virou <strong>PJ</strong> não tem, mesmo que o cargo não tenha mudado. Procurar pelo cargo
        leva à pessoa errada.
      </>
    ),
  },
  {
    titulo: "O mês é apurado pelo vínculo daquele mês",
    texto: (
      <>
        Reapurar março usa o vínculo que cobria <strong>março</strong>, não o de hoje. Quem era
        estagiário até junho e virou CLT em julho tem junho apurado com a jornada de estagiário. Se
        o sistema usasse o vínculo atual, junho apareceria zerado — um mês inteiro de trabalho
        sumindo do cálculo.
      </>
    ),
  },
  {
    titulo: "Quem não tem jornada controlada não fica devendo",
    texto: (
      <>
        PJ, autônomo e pró-labore não geram hora esperada em nenhum dia. Um projetista PJ que não
        bate ponto o mês inteiro fica com saldo <strong>zero</strong>, não negativo — e isso não é
        falha de registro. Se você esperava ver falta ali, o esperado é que estava errado.
      </>
    ),
  },
  {
    titulo: "Esqueceu de bater a saída? O dia não estica",
    texto: (
      <>
        Num dia já passado com uma ponta em aberto, o sistema conta{" "}
        <strong>só os pares fechados</strong> — nunca inventa o horário de saída nem deixa o
        cronômetro correr até a meia-noite. O dia fica incompleto até alguém corrigir por ajuste. É
        proposital: extrapolar seria escrever hora que ninguém trabalhou.
      </>
    ),
  },
  {
    titulo: "Banco de horas fechado é uma fotografia",
    texto: (
      <>
        Fechar o mês <strong>congela</strong> o saldo daquele mês e o acumulado. Corrigir uma batida
        antiga, ou corrigir a própria regra de cálculo, <strong>não</strong> conserta sozinho o que
        já foi fechado — é preciso recalcular os meses fechados, do mais antigo para o mais recente.
      </>
    ),
  },
  {
    titulo: "Férias não gozadas vencem",
    texto: (
      <>
        Depois que o período aquisitivo fecha, começa uma janela de 12 meses para gozar. Passou sem
        gozar, o período fica <strong>vencido</strong> — e continua aparecendo com dias disponíveis,
        porque o direito não some. Acompanhar o vencimento mais próximo é a rotina que evita
        acumular vencido.
      </>
    ),
  },
];

const DUVIDAS: readonly DuvidaGuia[] = [
  {
    pergunta: "Meu saldo está zerado e eu trabalhei. O que houve?",
    resposta:
      "Provavelmente sua contratação não tem jornada controlada — só CLT e estágio geram hora esperada. Nesse caso o saldo é zero por construção, e o pagamento não passa por banco de horas.",
  },
  {
    pergunta: "Feriado e férias descontam do banco de horas?",
    resposta:
      "Não. Feriado e férias aprovadas zeram as horas esperadas do dia, então não geram débito nem crédito.",
  },
  {
    pergunta: "Trabalhei de madrugada, atravessando a meia-noite. Em que dia entra?",
    resposta:
      "No dia da entrada, pelo horário local. A jornada pertence ao dia em que começou, não ao dia em que terminou.",
  },
  {
    pergunta: "Posso sair e voltar no mesmo dia?",
    resposta:
      "Sim. Turno quebrado é previsto, e vários descansos também. O que o sistema não aceita é uma sequência impossível — bater saída sem ter entrado, por exemplo.",
  },
  {
    pergunta: "Fui admitido no dia 20. Devo os dias 1 a 19?",
    resposta:
      "Não. Dias fora do período do vínculo não geram hora esperada, nas duas pontas: antes da admissão e depois do desligamento.",
  },
  {
    pergunta: "Os encargos saíram zerados. Está quebrado?",
    resposta:
      "As faixas de INSS e IRRF não vêm embutidas no sistema — são cadastradas em Configurações. Sem faixas cadastradas, o cálculo devolve zero.",
  },
  {
    pergunta: "Sou projetista PJ. Onde vejo o que vou receber?",
    resposta:
      "No Financeiro, em Meu extrato: são pagamentos por entrega validada, não folha. Folha e Produção são esteiras separadas.",
  },
];

export function GuiaRhPontoView() {
  return (
    <GuiaShell
      voltar={{ href: "/rh", label: "Voltar ao RH" }}
      titulo="Do vínculo ao pagamento, passando pelo ponto"
      descricao="Este setor responde três perguntas ligadas: como cada pessoa é contratada, quanto ela trabalhou, e o que isso vira no fim do mês. A forma de contratação é o que decide tudo o mais."
      acoes={
        <>
          <Button size="sm" render={<Link href="/ponto" />}>
            <Clock className="size-4" aria-hidden="true" /> Bater ponto
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/ponto/espelho" />}>
            <FileCheck2 className="size-4" aria-hidden="true" /> Ver meu espelho
          </Button>
        </>
      }
      regra={{
        texto: (
          <>
            <strong>A contratação manda, não o cargo.</strong> CLT e estágio têm jornada controlada,
            banco de horas e folha. PJ, autônomo e pró-labore não têm nada disso — e isso não é
            registro faltando.
          </>
        ),
      }}
      marcos={MARCOS}
      indice={INDICE}
      vocabulario={VOCABULARIO}
      armadilhas={ARMADILHAS}
      duvidas={DUVIDAS}
      cta={{
        titulo: "Comece pelo seu espelho",
        descricao: "É onde o mês inteiro aparece dia a dia, com o esperado, o registrado e a diferença.",
        href: "/ponto/espelho",
        label: "Abrir meu espelho",
      }}
    >
      <Etapa
        id="vinculo"
        numero="01"
        icone={IdCard}
        titulo="Tudo começa no vínculo"
        resumo="É o vínculo que diz a forma de contratação, a escala e o período — e é dele que sai todo o resto."
      >
        <p>
          O vínculo registra que uma pessoa trabalha aqui, <strong>de quando até quando</strong>, com
          qual <strong>forma de contratação</strong> e qual <strong>escala</strong>. Não é cadastro
          burocrático: é a entrada de todos os cálculos do setor. Errar a contratação aqui faz o
          banco de horas, a folha e o espelho saírem errados juntos.
        </p>
        <Acao
          tela="RH → Pessoas"
          clique={<NomeBotao>Novo vínculo</NomeBotao>}
          resultado="Passa a valer para o período informado; a apuração de cada mês procura o vínculo que cobre aquele mês."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <BadgeCheck className="mb-2 size-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">CLT e estágio</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Jornada controlada: têm escala, horas esperadas, banco de horas, espelho e folha com
              encargos.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <Scale className="mb-2 size-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-semibold">PJ, autônomo e pró-labore</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Sem jornada controlada. Não acumulam falta nem saldo, e o pagamento acontece por outra
              esteira — a Produção, no Financeiro.
            </p>
          </div>
        </div>
        <Dica>
          Uma pessoa pode ter <strong>vários vínculos ao longo do tempo</strong>. Promoção de
          estagiário a CLT não edita o vínculo antigo: cria um novo, e cada mês continua sendo
          apurado pelo vínculo que valia nele.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/rh/pessoas">Pessoas</Atalho>
          <Atalho href="/rh/escalas">Escalas</Atalho>
          <Atalho href="/ajuda/rh-ponto/funcionarios">Referência: Funcionários</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="bater"
        numero="02"
        icone={Clock}
        titulo="Bata o ponto ao longo do dia"
        resumo="Entrada, descansos e saída. O dia se monta sozinho a partir da sequência."
      >
        <p>
          São quatro tipos de marcação: <strong>entrada</strong>, <strong>início de descanso</strong>,{" "}
          <strong>fim de descanso</strong> e <strong>saída</strong>. Você pode descansar várias vezes
          e pode sair e voltar no mesmo dia — turno quebrado é previsto. A jornada pertence ao{" "}
          <strong>dia local da entrada</strong>, mesmo que termine depois da meia-noite.
        </p>
        <Acao
          tela="Ponto"
          clique={<NomeBotao>Registrar batida</NomeBotao>}
          resultado="Entra na sequência do dia; com a jornada aberta, o tempo trabalhado corre ao vivo até a próxima marcação."
        />
        <Dica>
          Se a internet cair, as batidas feitas no aparelho ficam guardadas e sobem quando a conexão
          voltar — não é preciso anotar em papel.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/ponto">Bater ponto</Atalho>
          <Atalho href="/ajuda/rh-ponto/ponto">Referência: Ponto</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="conferir"
        numero="03"
        icone={FileCheck2}
        titulo="Confira o espelho e peça ajuste"
        resumo="O espelho mostra, dia a dia, o esperado, o registrado e a diferença. É onde os erros aparecem."
      >
        <p>
          O <strong>esperado</strong> de cada dia vem da escala: um dia fora da grade não cobra nada,
          e feriado ou férias aprovadas zeram o dia. Dias antes da admissão ou depois do
          desligamento também não contam. O que sobra é a diferença real entre o que se esperava e o
          que foi registrado.
        </p>
        <Acao
          tela="Ponto → Espelho"
          clique={<NomeBotao>Ajustar dia</NomeBotao>}
          resultado="Corrige o seu próprio dia na hora, com justificativa registrada — não há fila de aprovação para o próprio ponto."
        />
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-semibold">Quando o ajuste vem de um gestor</p>
          <p className="mt-1 text-muted-foreground">
            A correção também vale na hora, mas <strong className="text-foreground">você é
            notificado</strong> e o ajuste fica aguardando sua <strong className="text-foreground">ciência</strong>.
            Você pode confirmar ou <strong className="text-foreground">contestar</strong> — ninguém
            mexe no seu ponto sem que você fique sabendo.
          </p>
        </div>
        <Dica>
          Dia passado com uma ponta em aberto conta <strong>só os pares fechados</strong>. Se você
          esqueceu a saída de ontem, o dia vai aparecer incompleto até o ajuste — o sistema não
          inventa o horário que faltou.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/ponto/espelho">Meu espelho</Atalho>
          <Atalho href="/ajuda/rh-ponto/rh-autoatendimento">Referência: Autoatendimento</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="fechar"
        numero="04"
        icone={CalendarCheck}
        titulo="Feche o banco de horas do mês"
        resumo="Fechar congela o saldo do mês e o acumulado. É uma fotografia, não uma fórmula viva."
      >
        <p>
          O fechamento roda para quem tem <strong>jornada controlada no mês</strong> — quem estava
          CLT ou estagiário naquele período, mesmo que hoje esteja diferente, e mesmo que tenha sido
          desligado no meio do mês. O saldo do mês e o acumulado ficam congelados.
        </p>
        <Acao
          tela="RH → Banco de horas"
          clique={<NomeBotao>Fechar mês</NomeBotao>}
          resultado="Congela saldo do mês e acumulado. Rodar de novo no mesmo mês não duplica nada."
        />
        <Dica>
          Corrigiu uma batida antiga depois do fechamento? O número congelado{" "}
          <strong>não se conserta sozinho</strong>. É preciso recalcular os meses fechados, do mais
          antigo para o mais recente — nunca digitar o saldo à mão.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/rh">RH</Atalho>
          <Atalho href="/ajuda/rh-ponto/rh-admin">Referência: RH admin</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="pagar"
        numero="05"
        icone={Banknote}
        titulo="Pague — por duas esteiras diferentes"
        resumo="Folha é CLT com encargos. Produção é projetista PJ por entrega validada, e mora no Financeiro."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Banknote className="mb-2 size-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">Folha (CLT)</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Salário com INSS e IRRF calculados por faixas progressivas. As faixas são cadastradas
              em Configurações — não vêm prontas.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <Scale className="mb-2 size-5 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-semibold">Produção (PJ)</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Pagamento por entrega validada, no Financeiro. Não passa por jornada, banco de horas
              nem encargos de folha.
            </p>
          </div>
        </div>
        <Dica>
          Encargos zerados quase sempre significam <strong>faixas não cadastradas</strong>, não
          cálculo quebrado. Sem faixas, o motor devolve zero de propósito, em vez de chutar valores
          de tabela.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/rh/folha">Folha</Atalho>
          <Atalho href="/financeiro/folha-projetistas">Produção (projetistas)</Atalho>
          <Atalho href="/ajuda/rh-ponto/folha-clt">Referência: Folha CLT</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="ferias"
        numero="06"
        icone={Palmtree}
        titulo="Férias correm num relógio próprio"
        resumo="Não fazem parte do ciclo do mês: têm dois períodos encadeados que andam desde a admissão."
        ultima
      >
        <p>
          A cada 12 meses trabalhados, a pessoa adquire 30 dias — é o{" "}
          <strong>período aquisitivo</strong>. Quando ele fecha, abre uma janela de mais 12 meses
          para gozar: o <strong>período concessivo</strong>. Não gozou dentro da janela, o período
          fica marcado como <strong>vencido</strong> — o direito não desaparece, mas o atraso passa a
          ficar visível.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <Palmtree className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Em aquisição</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Os 12 meses ainda estão correndo. O direito está sendo formado.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <CalendarCheck className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">A gozar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Direito formado e janela aberta. É o estado que pede agendamento.
            </p>
          </div>
        </div>
        <Dica>
          O cálculo aqui é uma <strong>regra simplificada</strong> — 12 meses, 30 dias, janela de 12
          meses. Casos particulares da legislação (faltas que reduzem o direito, fracionamento,
          abono) não estão modelados. Para decisão trabalhista, confirme com quem responde por isso.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/minha-ficha">Minha conta</Atalho>
          <Atalho href="/ajuda/rh-ponto/rh-autoatendimento">Referência: Autoatendimento</Atalho>
        </div>
      </Etapa>
    </GuiaShell>
  );
}
