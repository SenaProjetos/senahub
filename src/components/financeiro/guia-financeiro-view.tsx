import {
  ArrowLeftRight,
  BarChart3,
  Banknote,
  CalendarCheck,
  CircleDollarSign,
  Receipt,
  ShieldCheck,
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
 * Guia de uso do setor Financeiro (`/guias/financeiro`). F2 do plano
 * `docs/superpowers/plans/2026-09-09-guias-de-uso-in-app.md`.
 *
 * Conferido contra o código, não contra o manual (ADR-001). Revisto em 2026-10-03 contra o núcleo N0–N7 e as fases
 * M0–M10: alçada por faixas (`aprovacao/niveis.ts`), máquina de situações (`lancamentos/transicoes.ts`), baixa completa
 * (`lancamentos/baixa.ts`), conciliação (`conciliacao/casamento.ts`), trava do mês (`fechamento/trava.ts`) e a regra
 * única da DRE (`whereDRE` em `relatorios/queries.ts`).
 */

const MARCOS: readonly MarcoGuia[] = [
  { numero: "01", nome: "Prever", href: "#prever" },
  { numero: "02", nome: "Aprovar", href: "#aprovar" },
  { numero: "03", nome: "Realizar", href: "#realizar" },
  { numero: "04", nome: "Conciliar", href: "#conciliar" },
  { numero: "05", nome: "Fechar", href: "#fechar" },
];

const INDICE: readonly ItemIndice[] = [
  { href: "#prever", label: "Prever" },
  { href: "#aprovar", label: "Aprovar a despesa" },
  { href: "#realizar", label: "Pagar e receber" },
  { href: "#conciliar", label: "Conciliar com o banco" },
  { href: "#fechar", label: "Fechar o mês" },
];

const VOCABULARIO: readonly TermoGuia[] = [
  {
    termo: "Lançamento",
    definicao:
      "Uma linha de dinheiro: receita ou despesa. É a unidade de tudo no Financeiro — relatório, aging, fluxo e fechamento são todos recortes diferentes do mesmo conjunto de lançamentos.",
  },
  {
    termo: "Previsto (em aberto)",
    definicao:
      "O lançamento existe mas o dinheiro não andou: é a conta a pagar ou a receber em aberto. Não entra no caixa; aparece na projeção, no aging e na DRE por competência.",
    exemplo: "A nota que você vai receber dia 30 é um previsto até cair na conta.",
  },
  {
    termo: "Previsão do cronograma",
    definicao:
      "O recebimento esperado de uma parcela de contrato cobrado por entrega, na data do marco do cronograma. Entra no planejador como Estimada — fora do cenário Provável até alguém incluir — e não é conta a receber: não entra no aging nem na inadimplência até a parcela ser faturada no contrato.",
    exemplo: "“40% na entrega do básico” aparece como previsão no dia do marco; ao faturar, vira um previsto de verdade.",
  },
  {
    termo: "Pago / Recebido",
    definicao:
      "O dinheiro andou de verdade (no sistema, o status “confirmado”). É o único estado que entra no caixa, na DRE por caixa e no DFC.",
  },
  {
    termo: "Vencimento",
    definicao:
      "A data em que o previsto deveria ser pago ou recebido. É o que organiza a projeção de caixa e o aging — não o que organiza o resultado.",
  },
  {
    termo: "Data de competência",
    definicao:
      "O mês a que o valor pertence. Sem ela, vale a data do lançamento. É por ela que a DRE por competência e os Indicadores em competência agrupam.",
  },
  {
    termo: "Data do pagamento",
    definicao:
      "O dia em que o dinheiro efetivamente entrou ou saiu. É por ela que o caixa, o fluxo, o DFC e a DRE por caixa agrupam.",
  },
  {
    termo: "Regime de caixa × competência",
    definicao:
      "Caixa organiza pelo dia em que o dinheiro andou e só conta o que foi pago. Competência organiza pelo mês a que o valor pertence e conta o pago e o que está em aberto.",
    exemplo: "Serviço de março pago em maio: na competência é março (mesmo antes de pago); no caixa é maio.",
  },
  {
    termo: "Baixa",
    definicao:
      "Registrar que uma conta foi paga ou recebida: conta, data, quanto do título foi quitado e, separados, juros, multa e desconto. Quitar menos que o título deixa o saldo como uma nova conta em aberto; juros, multa e desconto viram lançamentos próprios, nas categorias deles.",
    exemplo: "Boleto de R$ 1.000 pago com R$ 32,50 de juros e multa: o título fica pago e sai da conta R$ 1.032,50.",
  },
  {
    termo: "Estorno",
    definicao:
      "Desfazer um pagamento registrado por engano: o lançamento volta a ficar em aberto, levando junto os juros/desconto e o saldo de uma baixa parcial. Conta, forma ou data errada não precisa de estorno — use Corrigir pagamento.",
  },
  {
    termo: "Aging",
    definicao:
      "A régua de atraso das contas em aberto, em faixas: a vencer, 1–30, 31–60, 61–90, 91–120 e 120+ dias. Quanto mais à direita, mais difícil de receber.",
  },
  {
    termo: "Alçada",
    definicao:
      "Faixas de valor configuradas no Financeiro dizem quem precisa aprovar uma despesa antes que ela possa ser paga. Vale só para despesa lançada à mão (e para a que muda de valor); produções do sistema, como folha, projetistas, ART e recorrências, já vêm aprovadas na origem.",
  },
  {
    termo: "Transferência entre contas",
    definicao:
      "Dinheiro que só muda de conta dentro da empresa. São duas pernas que andam sempre juntas — sai de uma, entra na outra — e não entram no resultado.",
  },
  {
    termo: "Regra de preenchimento",
    definicao:
      "“Quando a descrição contiver X, preencher a categoria Y”. Vale na conciliação, na importação de planilha e ao lançar à mão, e nunca troca o que você já escolheu.",
  },
  {
    termo: "Conciliação",
    definicao:
      "Casar o extrato do banco (arquivo OFX) com os lançamentos do sistema. Cada transação do banco tem um identificador próprio, então reimportar o mesmo extrato não duplica nada.",
  },
  {
    termo: "DRE",
    definicao:
      "O demonstrativo de resultado: receitas menos despesas do período, agrupadas por categoria do plano de contas. Responde “sobrou ou faltou, e em quê”.",
  },
  {
    termo: "DFC",
    definicao:
      "O demonstrativo de fluxo de caixa: o mesmo dinheiro, mas agrupado por tipo de atividade em vez de por categoria. Responde “de onde veio e para onde foi”.",
  },
  {
    termo: "Fechamento do mês",
    definicao:
      "Consolidar e travar o mês: depois de fechado, nada com data naquele mês é criado, alterado, pago, estornado ou excluído até alguém com permissão reabrir. Também calcula as retenções sobre a folha dos projetistas.",
  },
];

const ARMADILHAS: readonly ArmadilhaGuia[] = [
  {
    titulo: "Caixa e competência dão números diferentes — e os dois estão certos",
    texto: (
      <>
        Em <strong>Relatórios</strong> e em <strong>Indicadores</strong> há a escolha{" "}
        <strong>Caixa / Competência</strong>. Caixa conta só o que foi <strong>pago</strong>, pela data
        do pagamento. Competência conta o pago <strong>e o que está em aberto</strong>, no mês a que
        pertence. O painel do Financeiro, o fluxo de caixa, o DFC, o balanço e a rentabilidade seguem
        sempre caixa.
      </>
    ),
  },
  {
    titulo: "A alçada olha o total, e quem lança não aprova",
    texto: (
      <>
        Uma compra parcelada é julgada pelo <strong>total</strong>, não pela parcela: 60 parcelas de R$ 900
        caem na faixa de R$ 54.000. Mudar o valor de uma despesa já aprovada a <strong>manda de volta</strong>{" "}
        para a fila. E ninguém aprova a própria despesa — só o administrador, para o escritório não travar.
      </>
    ),
  },
  {
    titulo: "Previsto não é dinheiro",
    texto: (
      <>
        Um lançamento <strong>previsto</strong> aparece na projeção, no aging e na DRE por competência,
        mas <strong>não existe</strong> para o caixa, a DRE por caixa, o DFC ou o balanço. Um mês cheio
        de contas lançadas e nenhuma paga mostra caixa parado, e está certo.
      </>
    ),
  },
  {
    titulo: "Pago não se cancela: estorne antes",
    texto: (
      <>
        O que já foi pago ou recebido não pode ser cancelado nem excluído direto: primeiro{" "}
        <strong>Estornar</strong>, que o devolve a em aberto. Se ele está <strong>conciliado</strong> com o
        extrato do banco, nem o estorno passa — desconcilie a transação antes. Pagamento de projetista se
        estorna pela tela de <strong>Produção</strong>.
      </>
    ),
  },
  {
    titulo: "Mês fechado não muda",
    texto: (
      <>
        Depois de <strong>Fechar mês</strong>, o sistema recusa criar, mudar valor, categoria, datas ou
        conta, pagar, estornar e excluir lançamentos com data naquele mês. Uma conta vencida do mês
        fechado continua podendo ser paga — num mês aberto. Para corrigir algo lá, alguém com permissão
        precisa <strong>Reabrir</strong>.
      </>
    ),
  },
  {
    titulo: "Aging só enxerga o que está em aberto",
    texto: (
      <>
        O aging monta as faixas a partir dos lançamentos <strong>previstos</strong>, pelo{" "}
        <strong>vencimento</strong> (ou pela data do lançamento, se não houver vencimento). Pagar uma conta
        a tira do aging na hora — o atraso não fica registrado ali como histórico.
      </>
    ),
  },
  {
    titulo: "Excluir um lançamento não o apaga",
    texto: (
      <>
        Um lançamento excluído some das listas e dos relatórios, mas continua registrado no histórico e
        na auditoria. Se um valor desapareceu sem explicação, ele provavelmente foi excluído, não perdido.
      </>
    ),
  },
];

const DUVIDAS: readonly DuvidaGuia[] = [
  {
    pergunta: "Lancei a conta mas o caixa e o resultado do mês não mudaram. Por quê?",
    resposta:
      "Porque ela ainda está em aberto. O caixa, a DRE por caixa e o DFC só contam o que foi pago. Na DRE por competência ela já aparece, no mês a que pertence.",
  },
  {
    pergunta: "Qual data eu preencho: vencimento, competência ou pagamento?",
    resposta:
      "Vencimento é quando deveria acontecer, e organiza projeção e aging. Competência é o mês a que o valor pertence (sem ela vale a data do lançamento). A data do pagamento é preenchida na baixa, e é por ela que o caixa agrupa.",
  },
  {
    pergunta: "Minha despesa ficou aguardando aprovação. O que houve?",
    resposta:
      "O total dela caiu numa faixa de alçada que exige aprovação, ou o valor mudou depois de aprovada. Fica travada até alguém com permissão aprovar — e não pode ser você, se foi você quem lançou.",
  },
  {
    pergunta: "Recebi menos do que o combinado. O que faço?",
    resposta:
      "Na baixa, se o cliente vai pagar o resto depois, informe só o valor quitado: o saldo vira uma nova conta em aberto. Se foi um desconto para quitar, use o campo Desconto: o título fica quitado e o desconto entra na DRE na linha dele.",
  },
  {
    pergunta: "Registrei o pagamento na conta ou na data errada.",
    resposta:
      "Use Corrigir pagamento no menu do lançamento: troca conta, forma e data sem estornar. Se o pagamento nem aconteceu, use Estornar.",
  },
  {
    pergunta: "O sistema não me deixa dar baixa: pede comprovante.",
    resposta:
      "A exigência de comprovante está ligada em Configurações. Anexe o arquivo no próprio diálogo de baixa (ou em Detalhes) e confirme de novo.",
  },
  {
    pergunta: "Importei o mesmo extrato duas vezes. Dupliquei tudo?",
    resposta:
      "Não. Cada transação do OFX tem um identificador próprio do banco, e a importação usa isso para reconhecer o que já entrou.",
  },
  {
    pergunta: "Por que a conciliação não casou sozinha uma transação óbvia?",
    resposta:
      "Ela só casa sozinha quando há exatamente uma conta em aberto com o mesmo valor, na mesma conta, até 5 dias de diferença. Empate, valor diferente (juros, desconto) ou transferência ficam para você casar à mão.",
  },
  {
    pergunta: "Qual a diferença entre DRE e DFC?",
    resposta:
      "É o mesmo dinheiro visto de dois ângulos. O DRE agrupa por categoria do plano de contas e responde onde sobrou ou faltou. O DFC agrupa por tipo de atividade e responde de onde o dinheiro veio e para onde foi.",
  },
  {
    pergunta: "Só vejo “Meu extrato”. Cadê o resto?",
    resposta:
      "Seu acesso é ao próprio extrato, não à gestão financeira. É o caso normal de quem recebe por produção. O guia continua valendo para entender o que acontece do outro lado.",
  },
];

export function GuiaFinanceiroView() {
  return (
    <GuiaShell
      voltar={{ href: "/financeiro", label: "Voltar ao Financeiro" }}
      titulo="Do previsto ao mês fechado"
      descricao="Todo dinheiro percorre o mesmo caminho aqui: é previsto, passa pela alçada quando é despesa que exige aprovação, é pago ou recebido quando anda de verdade, é conciliado com o extrato do banco e entra no fechamento do mês."
      acoes={
        <>
          <Button size="sm" render={<Link href="/financeiro/lancamentos" />}>
            <Receipt className="size-4" aria-hidden="true" /> Abrir Lançamentos
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/financeiro/contas" />}>
            <ArrowLeftRight className="size-4" aria-hidden="true" /> Contas
          </Button>
        </>
      }
      regra={{
        texto: (
          <>
            <strong>Previsto não é dinheiro; pago é.</strong> O caixa só anda com o que foi pago ou recebido,
            pela data do pagamento. Competência é outra pergunta: a que mês aquele valor pertence.
          </>
        ),
      }}
      marcos={MARCOS}
      indice={INDICE}
      vocabulario={VOCABULARIO}
      armadilhas={ARMADILHAS}
      duvidas={DUVIDAS}
      cta={{
        titulo: "Comece pelas contas em aberto",
        descricao: "É onde o previsto vira trabalho: o que vence, o que atrasou e o que falta pagar ou receber.",
        href: "/financeiro/contas",
        label: "Abrir Contas",
      }}
    >
      <Etapa
        id="prever"
        numero="01"
        icone={Receipt}
        titulo="Lance o que ainda vai acontecer"
        resumo="Todo compromisso entra em aberto — é o que alimenta a projeção de caixa, o planejador e o aging."
      >
        <p>
          Um lançamento novo nasce <strong>em aberto</strong>: a conta a pagar ou a receber que existe no
          papel mas ainda não andou. Além do valor, o que mais importa é o <strong>vencimento</strong> — é
          ele que coloca o valor no dia certo da projeção e que define a faixa de atraso se a data passar.
        </p>
        <Acao
          tela="Lançamentos"
          clique={<NomeBotao>Novo lançamento</NomeBotao>}
          resultado="Cria a linha em aberto; ela passa a aparecer em Contas, na projeção de caixa e — se vencer — no aging."
        />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <CircleDollarSign className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Categoria</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A linha do plano de contas, do mesmo tipo do lançamento (receita ou despesa). É por ela que a
              DRE agrupa — categoria errada é relatório errado.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <BarChart3 className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Centro de custo</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Onde o dinheiro foi consumido dentro da empresa. Uma despesa compartilhada pode ser rateada
              entre vários centros e projetos (menu do lançamento → Ratear).
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <Banknote className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Projeto</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Amarrar ao projeto é o que torna possível saber depois se ele deu lucro.
            </p>
          </div>
        </div>
        <Dica>
          Conta que se repete (aluguel, pró-labore, folha) vira <strong>compromisso recorrente</strong>: o
          sistema gera cada mês sozinho. Descrição que sempre vai para a mesma categoria vira{" "}
          <strong>regra de preenchimento</strong> — ou use <strong>Duplicar lançamento</strong> no menu
          para partir de um parecido.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/lancamentos">Lançamentos</Atalho>
          <Atalho href="/financeiro/regras">Regras de preenchimento</Atalho>
          <Atalho href="/financeiro/cadastros">Plano de contas e cadastros</Atalho>
          <Atalho href="/ajuda/financeiro/lancamentos">Referência: Lançamentos</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="aprovar"
        numero="02"
        icone={ShieldCheck}
        titulo="Despesa acima da faixa passa pela alçada"
        resumo="É o único ponto do caminho em que o lançamento trava sozinho, esperando decisão de outra pessoa."
      >
        <p>
          Quando o <strong>total</strong> de uma despesa lançada à mão cai numa faixa de alçada que exige
          aprovação, ela fica <strong>aguardando aprovação</strong> e não pode ser paga até alguém com
          permissão liberar. Receita nunca passa por isso, em nenhum valor.
        </p>
        <Acao
          tela="Aprovações do Financeiro"
          clique={<NomeBotao>Aprovar</NomeBotao>}
          resultado="Libera a despesa para seguir o fluxo normal e poder ser paga."
        />
        <Dica>
          As faixas ficam em <strong>Configurações do Financeiro</strong>: cada faixa diz até que valor vai
          e quem aprova; faixa sem ninguém marcado aprova sozinha. Quem lançou a despesa não a aprova — só o
          administrador.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/aprovacoes">Fila de aprovações</Atalho>
          <Atalho href="/ajuda/financeiro/aprovacoes">Referência: Aprovações</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="realizar"
        numero="03"
        icone={CircleDollarSign}
        titulo="Dê baixa quando o dinheiro andar"
        resumo="É o ato que faz o lançamento existir para o caixa."
      >
        <p>
          Dar baixa não é marcar uma caixinha de controle: é o que move o lançamento de “vai acontecer” para
          “aconteceu”. A partir daí ele entra no <strong>caixa</strong>, no DFC e na DRE por caixa — todos
          agrupando pela <strong>data do pagamento</strong>.
        </p>
        <Acao
          tela="Contas"
          clique={
            <>
              <NomeBotao>Pagar</NomeBotao> ou <NomeBotao>Receber</NomeBotao>
            </>
          }
          resultado="Grava a conta e o dia em que o dinheiro andou, tira a conta do aging e passa a contar no caixa."
        />
        <Dica>
          Pagou ou recebeu valor diferente? No diálogo da baixa, informe <strong>juros</strong>,{" "}
          <strong>multa</strong> e <strong>desconto</strong> separados, ou quite só parte (o resto fica em
          aberto). Errou a conta ou a data? <strong>Corrigir pagamento</strong>. O pagamento não aconteceu?{" "}
          <strong>Estornar</strong>.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/contas">Contas</Atalho>
          <Atalho href="/financeiro/contas?situacao=pagas">Pagas e recebidas</Atalho>
          <Atalho href="/ajuda/financeiro/contas-e-aging">Referência: Contas e aging</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="conciliar"
        numero="04"
        icone={ArrowLeftRight}
        titulo="Case o sistema com o extrato do banco"
        resumo="A conciliação é o que garante que o que está no sistema é o que aconteceu na conta."
      >
        <p>
          Você baixa o extrato do banco em <strong>OFX</strong> e importa. O sistema casa sozinho só o que
          não tem dúvida — uma única conta em aberto, mesmo valor, mesma conta, até 5 dias — e deixa o resto
          numa fila para você casar à mão ou virar lançamento novo. Quando o extrato traz o saldo do banco, a
          tela compara com o saldo do sistema.
        </p>
        <Acao
          tela="Conciliação"
          clique={<NomeBotao>Importar extrato (.ofx)</NomeBotao>}
          resultado="Lê as transações do extrato, casa o que reconhece e deixa o restante numa fila de pendentes."
        />
        <Dica>
          Reimportar o mesmo arquivo é seguro: cada transação carrega um identificador do próprio banco.
          Desconciliar devolve o lançamento ao que era antes. O <strong>Extrato por conta</strong> mostra, mês a
          mês, o que já foi conciliado e o que falta.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/conciliacao">Conciliação</Atalho>
          <Atalho href="/financeiro/extrato">Extrato por conta</Atalho>
          <Atalho href="/ajuda/financeiro/conciliacao-ofx">Referência: Conciliação OFX</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="fechar"
        numero="05"
        icone={CalendarCheck}
        titulo="Feche o mês e leia os números"
        resumo="O fechamento consolida o mês, guarda o saldo de cada conta e trava o período."
        ultima
      >
        <p>
          <strong>Gerar / atualizar fechamento</strong> consolida o que foi pago e recebido no mês e calcula as
          retenções sobre a <strong>folha bruta dos projetistas</strong>. <strong>Fechar mês</strong> guarda o
          saldo de cada conta no último dia e <strong>trava</strong> o período: daí em diante nada com data
          naquele mês muda até alguém com permissão reabrir.
        </p>
        <Acao
          tela="Fechamento"
          clique={<NomeBotao>Fechar mês</NomeBotao>}
          resultado="Trava o mês e congela o saldo de cada conta no último dia, para conferir com o extrato do banco."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <BarChart3 className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">DRE, DFC e Indicadores</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O mesmo dinheiro por recortes diferentes: por categoria, por atividade, e em margem, prazos,
              inadimplência e dias de caixa — em caixa ou em competência.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <Banknote className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Rentabilidade</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Margem por projeto. Só funciona na medida em que os lançamentos foram amarrados a projetos lá no
              passo 01.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/fechamento">Fechamento</Atalho>
          <Atalho href="/financeiro/relatorios">Relatórios</Atalho>
          <Atalho href="/financeiro/indicadores">Indicadores</Atalho>
          <Atalho href="/financeiro/rentabilidade">Rentabilidade</Atalho>
          <Atalho href="/ajuda/financeiro/relatorios">Referência: Relatórios</Atalho>
        </div>
      </Etapa>
    </GuiaShell>
  );
}
