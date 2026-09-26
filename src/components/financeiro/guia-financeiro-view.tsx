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
 * Conferido contra o código, não contra o manual (ADR-001): `lib/{aging,ofx,aprovacao}.ts`,
 * `modules/financeiro/{caixa,aging,relatorios,fechamento}/queries.ts`, `fechamento/calculo.ts` e o
 * enum `StatusLancamento`. Divergências na §12 do plano.
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
  { href: "#realizar", label: "Realizar" },
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
    termo: "Previsto",
    definicao:
      "O lançamento existe mas o dinheiro não andou: é a conta a pagar ou a receber em aberto. Não entra no caixa nem no resultado — só na projeção e no aging.",
    exemplo: "A nota que você vai receber dia 30 é um previsto até cair na conta.",
  },
  {
    termo: "Previsão do cronograma",
    definicao:
      "O recebimento esperado de uma parcela de contrato cobrado por entrega, na data do marco do cronograma. Aparece só na projeção de caixa: não é conta a receber e não entra no aging nem na inadimplência até a parcela ser faturada no contrato.",
    exemplo: "“40% na entrega do básico” aparece como previsão na semana do marco; ao faturar, vira um previsto de verdade.",
  },
  {
    termo: "Confirmado",
    definicao:
      "O dinheiro andou de verdade. É o único estado que entra no caixa e no resultado do mês. Confirmar é o ato central do Financeiro — antes disso, nenhum número de resultado enxerga o lançamento.",
  },
  {
    termo: "Vencimento",
    definicao:
      "A data em que o previsto deveria ser pago ou recebido. É o que organiza a projeção de caixa e o aging — não o que organiza o resultado.",
  },
  {
    termo: "Data de confirmação",
    definicao:
      "O dia em que o dinheiro efetivamente entrou ou saiu. É por esta data que o resultado, o fluxo e os gráficos mensais agrupam os valores.",
  },
  {
    termo: "Regime de caixa × competência",
    definicao:
      "Caixa é organizar pelo dia em que o dinheiro andou; competência, pelo mês a que o valor se refere. Um serviço prestado em março e pago em maio é março na competência e maio no caixa.",
    exemplo: "No SenaHub praticamente tudo é lido em regime de caixa — veja as armadilhas antes de assumir o contrário.",
  },
  {
    termo: "Valor efetivo",
    definicao:
      "Quanto realmente foi pago ou recebido, quando difere do combinado. Preenchido, é ele que vale nos relatórios; vazio, vale o valor original.",
    exemplo: "Cobrança de R$ 10.000 recebida com R$ 200 de desconto: valor 10.000, efetivo 9.800.",
  },
  {
    termo: "Aging",
    definicao:
      "A régua de atraso das contas em aberto, em faixas: a vencer, 1–30, 31–60, 61–90, 91–120 e 120+ dias. Quanto mais à direita, mais difícil de receber.",
  },
  {
    termo: "Alçada",
    definicao:
      "O limite de valor acima do qual uma despesa precisa ser aprovada antes de seguir. Vale só para despesa — receita nunca trava.",
  },
  {
    termo: "Conciliação",
    definicao:
      "Casar o extrato do banco com os lançamentos do sistema, importando um arquivo OFX. Cada transação do banco tem um identificador próprio, então reimportar o mesmo extrato não duplica nada.",
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
      "Consolidar o mês: trava o resultado e calcula as retenções e descontos sobre a folha dos projetistas, usando as alíquotas configuradas.",
  },
];

const ARMADILHAS: readonly ArmadilhaGuia[] = [
  {
    titulo: "O seletor “Competência” muda menos do que parece",
    texto: (
      <>
        Em <strong>Relatórios</strong> existe um seletor <strong>Caixa / Competência</strong>. Ele
        muda <strong>apenas o DRE comparativo</strong> daquela tela. Todo o resto — o painel do
        Financeiro, o fluxo de caixa, o DFC, o balanço, o gráfico de resultado mensal e a
        rentabilidade — lê sempre a <strong>data de confirmação</strong>, ou seja, regime de caixa.
        Preencher <strong>Data de competência</strong> no lançamento organiza um único quadro atrás
        de um único seletor; não reorganiza o Financeiro.
      </>
    ),
  },
  {
    titulo: "Limite de alçada zero não trava nada",
    texto: (
      <>
        A leitura intuitiva é ao contrário: limite <strong>zero</strong> não significa “tudo precisa
        de aprovação”, significa <strong>a trava está desligada</strong>. E a comparação inclui o
        próprio limite — uma despesa exatamente no valor do limite <strong>trava</strong>. Se você
        quer aprovar tudo acima de mil, o limite é mil e uma despesa de mil já vai para a fila.
      </>
    ),
  },
  {
    titulo: "Previsto não é dinheiro",
    texto: (
      <>
        Um lançamento <strong>previsto</strong> aparece na projeção de caixa e no aging, mas{" "}
        <strong>não existe</strong> para o resultado do mês, o DRE, o DFC ou o balanço — todos leem
        só <strong>confirmado</strong>. Um mês cheio de contas lançadas e nenhuma confirmada mostra
        resultado zero, e está certo.
      </>
    ),
  },
  {
    titulo: "Aging só enxerga o que está em aberto",
    texto: (
      <>
        O aging monta as faixas a partir dos lançamentos <strong>previstos</strong>, pelo{" "}
        <strong>vencimento</strong> (ou pela data do lançamento, se não houver vencimento).
        Confirmar uma conta a tira do aging na hora — o atraso não fica registrado ali como
        histórico. Se você precisa saber que aquele cliente pagou com 60 dias de atraso, o aging de
        hoje não vai contar essa história.
      </>
    ),
  },
  {
    titulo: "O fechamento são duas contas independentes",
    texto: (
      <>
        Na mesma tela convivem duas coisas que não se somam: o <strong>resultado do mês</strong>{" "}
        (receita menos despesa confirmadas) e as <strong>retenções e descontos</strong>, que
        incidem <strong>só sobre a folha bruta dos projetistas</strong> — não sobre a receita, não
        sobre o resultado. Ler as alíquotas como se fossem imposto sobre o faturamento é erro comum.
      </>
    ),
  },
  {
    titulo: "Excluir um lançamento não o apaga",
    texto: (
      <>
        Um lançamento excluído some das listas e dos relatórios, mas continua registrado — a
        exclusão é reversível e fica no histórico. Isso é proposital, e é o motivo de “sumiu” e “foi
        apagado” não serem a mesma coisa aqui. Se um valor desapareceu sem explicação, ele
        provavelmente foi excluído, não perdido.
      </>
    ),
  },
];

const DUVIDAS: readonly DuvidaGuia[] = [
  {
    pergunta: "Lancei a conta mas o resultado do mês não mudou. Por quê?",
    resposta:
      "Porque ela ainda está prevista. Só lançamento confirmado entra no resultado, no DRE e no DFC. Previsto aparece na projeção de caixa e no aging.",
  },
  {
    pergunta: "Qual data eu preencho: vencimento, competência ou confirmação?",
    resposta:
      "Vencimento é quando deveria acontecer, e organiza projeção e aging. A data de confirmação é preenchida quando você confirma, e é por ela que quase todo relatório agrupa. Competência é opcional e hoje só muda o DRE comparativo.",
  },
  {
    pergunta: "Minha despesa ficou aguardando aprovação. O que houve?",
    resposta:
      "Ela atingiu ou passou o limite de alçada configurado. Fica travada até alguém com permissão aprovar — não é erro, é a regra de valor da empresa.",
  },
  {
    pergunta: "Importei o mesmo extrato duas vezes. Dupliquei tudo?",
    resposta:
      "Não. Cada transação do OFX tem um identificador próprio do banco, e a importação usa isso para reconhecer o que já entrou.",
  },
  {
    pergunta: "Recebi menos do que o combinado. Mudo o valor?",
    resposta:
      "Não mude o valor original — preencha o valor efetivo. Assim o combinado e o recebido ficam ambos registrados, e os relatórios usam o efetivo.",
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
      descricao="Todo dinheiro percorre o mesmo caminho aqui: é previsto, passa pela alçada quando é despesa grande, é confirmado quando anda de verdade, é conciliado com o extrato do banco e entra no fechamento do mês."
      acoes={
        <>
          <Button size="sm" render={<Link href="/financeiro/lancamentos" />}>
            <Receipt className="size-4" aria-hidden="true" /> Abrir Lançamentos
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/financeiro/contas" />}>
            <ArrowLeftRight className="size-4" aria-hidden="true" /> Contas a pagar e receber
          </Button>
        </>
      }
      regra={{
        texto: (
          <>
            <strong>Previsto não é dinheiro; confirmado é.</strong> Quase todo número de resultado
            neste módulo lê só o que foi confirmado, e agrupa pela data em que o dinheiro andou.
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
        descricao: "É onde o previsto vira trabalho: o que vence, o que atrasou e o que falta confirmar.",
        href: "/financeiro/contas",
        label: "Abrir Contas",
      }}
    >
      <Etapa
        id="prever"
        numero="01"
        icone={Receipt}
        titulo="Lance o que ainda vai acontecer"
        resumo="Todo compromisso entra como previsto — é o que alimenta a projeção de caixa e o aging."
      >
        <p>
          Um lançamento novo nasce <strong>previsto</strong>: a conta a pagar ou a receber que existe
          no papel mas ainda não andou. Além do valor, o que mais importa é o{" "}
          <strong>vencimento</strong> — é ele que coloca o valor na semana certa da projeção e que
          define a faixa de atraso se a data passar.
        </p>
        <Acao
          tela="Lançamentos"
          clique={<NomeBotao>Novo lançamento</NomeBotao>}
          resultado="Cria a linha como prevista; ela passa a aparecer em Contas, na projeção de caixa e — se vencer — no aging."
        />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <CircleDollarSign className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Categoria</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A linha do plano de contas. É por ela que o DRE agrupa — categoria errada é relatório
              errado.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <BarChart3 className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Centro de custo</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Onde o dinheiro foi consumido dentro da empresa, independente da categoria.
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
          Amarre ao <strong>projeto</strong> sempre que fizer sentido. A rentabilidade por projeto é
          construída inteiramente a partir dessa ligação — lançamento solto vira custo que ninguém
          consegue atribuir.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/lancamentos">Lançamentos</Atalho>
          <Atalho href="/financeiro/cadastros">Plano de contas e cadastros</Atalho>
          <Atalho href="/ajuda/financeiro/lancamentos">Referência: Lançamentos</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="aprovar"
        numero="02"
        icone={ShieldCheck}
        titulo="Despesa grande passa pela alçada"
        resumo="É o único ponto do caminho em que o lançamento trava sozinho, esperando decisão de outra pessoa."
      >
        <p>
          Quando uma <strong>despesa</strong> atinge o limite configurado, ela não segue direto: fica{" "}
          <strong>aguardando aprovação</strong> até alguém com permissão liberar. Receita nunca
          passa por isso, em nenhum valor.
        </p>
        <Acao
          tela="Aprovações do Financeiro"
          clique={<NomeBotao>Aprovar</NomeBotao>}
          resultado="Libera a despesa para seguir o fluxo normal e poder ser confirmada."
        />
        <Dica>
          O limite fica nas configurações do Financeiro. <strong>Zero desliga a trava</strong> — não é
          “aprovar tudo”. E o valor exatamente igual ao limite já trava.
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
        titulo="Confirme quando o dinheiro andar"
        resumo="É o ato que faz o lançamento existir para o resultado do mês."
      >
        <p>
          Confirmar não é marcar uma caixinha de controle: é o que move o lançamento de “vai
          acontecer” para “aconteceu”. A partir daí ele entra no <strong>caixa</strong>, no{" "}
          <strong>DRE</strong>, no DFC e nos gráficos mensais — todos agrupando pela{" "}
          <strong>data de confirmação</strong>.
        </p>
        <Acao
          tela="Contas a pagar e receber"
          clique={<NomeBotao>Confirmar</NomeBotao>}
          resultado="Grava a data em que o dinheiro andou, tira a conta do aging e passa a contar no resultado do mês."
        />
        <Dica>
          Recebeu ou pagou valor diferente do combinado? Preencha o <strong>valor efetivo</strong> em
          vez de corrigir o valor original — assim fica registrado o que foi acordado e o que de fato
          aconteceu, e os relatórios usam o efetivo.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/contas">Contas a pagar e receber</Atalho>
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
          Você baixa o extrato do banco em <strong>OFX</strong> e importa. O sistema lê as transações
          e tenta casar cada uma com um lançamento existente; o que não casa fica na fila para você
          resolver — ou virar lançamento novo.
        </p>
        <Acao
          tela="Conciliação"
          clique={<NomeBotao>Importar OFX</NomeBotao>}
          resultado="Lê as transações do extrato, casa o que reconhece e deixa o restante numa fila de pendentes."
        />
        <Dica>
          Reimportar o mesmo arquivo é seguro: cada transação carrega um identificador do próprio
          banco, e a importação usa isso para não duplicar.
        </Dica>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/conciliacao">Conciliação</Atalho>
          <Atalho href="/ajuda/financeiro/conciliacao-ofx">Referência: Conciliação OFX</Atalho>
        </div>
      </Etapa>

      <Etapa
        id="fechar"
        numero="05"
        icone={CalendarCheck}
        titulo="Feche o mês e leia os números"
        resumo="O fechamento consolida o resultado e calcula as retenções da folha de projetistas."
        ultima
      >
        <p>
          Fechar o mês consolida receita e despesa <strong>confirmadas</strong> e aplica as alíquotas
          configuradas sobre a <strong>folha bruta dos projetistas</strong>, chegando à folha
          líquida. São duas contas que dividem a tela mas não se misturam.
        </p>
        <Acao
          tela="Fechamento"
          clique={<NomeBotao>Gerar fechamento</NomeBotao>}
          resultado="Consolida o mês com as alíquotas vigentes. Um mês já fechado não é regerado por cima."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <BarChart3 className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">DRE e DFC</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O mesmo dinheiro por dois recortes: por categoria (onde sobrou ou faltou) e por
              atividade (de onde veio, para onde foi).
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <Banknote className="mb-2 size-4 text-primary" aria-hidden="true" />
            <p className="font-semibold">Rentabilidade</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Margem por projeto. Só funciona na medida em que os lançamentos foram amarrados a
              projetos lá no passo 01.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Atalho href="/financeiro/fechamento">Fechamento</Atalho>
          <Atalho href="/financeiro/relatorios">Relatórios</Atalho>
          <Atalho href="/financeiro/rentabilidade">Rentabilidade</Atalho>
          <Atalho href="/ajuda/financeiro/relatorios">Referência: Relatórios</Atalho>
        </div>
      </Etapa>
    </GuiaShell>
  );
}
