import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenText,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Handshake,
  Lightbulb,
  MessageSquareText,
  MousePointerClick,
  Rocket,
  Search,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MARCOS = [
  { numero: "01", nome: "Entrada", href: "#entrada" },
  { numero: "02", nome: "Prospecção", href: "#prospeccao" },
  { numero: "03", nome: "Negociação", href: "#negociacao" },
  { numero: "04", nome: "Proposta", href: "#proposta" },
  { numero: "05", nome: "Projeto", href: "#fechamento" },
] as const;

function NomeBotao({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5 font-medium text-foreground shadow-xs">
      <MousePointerClick className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}

function Acao({ tela, clique, resultado }: { tela: string; clique: ReactNode; resultado: string }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[0.8fr_1fr_1.35fr]">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Na tela</p>
        <p className="mt-1 text-sm font-medium">{tela}</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clique em</p>
        <div className="mt-1 text-sm">{clique}</div>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">O que acontece</p>
        <p className="mt-1 text-sm text-muted-foreground">{resultado}</p>
      </div>
    </div>
  );
}

function Dica({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function Etapa({
  id,
  numero,
  icone: Icone,
  titulo,
  resumo,
  ultima = false,
  children,
}: {
  id: string;
  numero: string;
  icone: LucideIcon;
  titulo: string;
  resumo: string;
  ultima?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="grid gap-3 md:grid-cols-[3.25rem_1fr]">
        <div className="hidden flex-col items-center md:flex" aria-hidden="true">
          <div className="grid size-11 place-items-center rounded-full border-2 border-primary bg-background font-mono text-sm font-bold text-primary">
            {numero}
          </div>
          {!ultima && <div className="mt-2 min-h-12 w-px grow bg-border" />}
        </div>
        <Card className="mb-5 [--card-edge:var(--primary)]">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icone className="size-4.5" aria-hidden="true" />
              </div>
              <div>
                <Badge variant="outline" className="mb-1 font-mono md:hidden">
                  Passo {numero}
                </Badge>
                <CardTitle className="text-lg">{titulo}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{resumo}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 leading-relaxed">{children}</CardContent>
        </Card>
      </div>
    </section>
  );
}

function Atalho({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button variant="outline" size="sm" render={<Link href={href} />}>
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

export function GuiaComercialView() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/comercial" aria-label="Voltar ao Comercial" />}
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Voltar ao Comercial
        </Button>

        <Card className="relative overflow-hidden border-primary/20 bg-primary/5 [--card-edge:var(--primary)]">
          <div className="absolute -right-16 -top-20 size-56 rounded-full border-[32px] border-primary/5" aria-hidden="true" />
          <CardContent className="relative grid gap-6 py-4 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div className="space-y-4">
              <Badge variant="secondary" className="gap-1">
                <BookOpenText className="size-3" aria-hidden="true" /> Guia prático
              </Badge>
              <div>
                <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Da entrada do cliente ao projeto contratado
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  Este é o caminho completo para indicações, demandas espontâneas, clientes recorrentes
                  e prospecção ativa. Siga a ordem e registre cada conversa enquanto ela acontece.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" render={<Link href="/comercial/prospeccao" />}>
                  <Rocket className="size-4" aria-hidden="true" /> Registrar nova entrada
                </Button>
                <Button variant="outline" size="sm" render={<Link href="/comercial?visao=meus" />}>
                  <CalendarClock className="size-4" aria-hidden="true" /> Abrir Meu Dia
                </Button>
              </div>
            </div>
            <div className="rounded-lg border bg-background/80 p-4 backdrop-blur-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Regra mais importante</p>
              <p className="mt-2 text-sm leading-relaxed">
                Não crie outro cadastro para “avançar” uma venda. O lead continua existindo; o sistema
                liga a ele a negociação, a proposta e, quando houver aceite, o projeto.
              </p>
            </div>
          </CardContent>
        </Card>
      </header>

      <nav aria-label="Etapas do fluxo comercial" className="rounded-xl border bg-card p-3">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {MARCOS.map((marco, index) => (
            <li key={marco.href} className="relative">
              <a
                href={marco.href}
                className="group flex min-h-14 items-center gap-2 rounded-lg px-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-mono text-xs font-bold text-primary">{marco.numero}</span>
                <span className="text-sm font-semibold">{marco.nome}</span>
              </a>
              {index < MARCOS.length - 1 && (
                <ArrowRight className="absolute -right-2 top-5 hidden size-3 text-muted-foreground sm:block" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-6 xl:grid-cols-[14rem_1fr]">
        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-3 rounded-xl border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nesta página</p>
            <nav aria-label="Índice do guia">
              <ol className="space-y-1 text-sm">
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#antes">Antes de começar</a></li>
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#entrada">Registrar a entrada</a></li>
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#prospeccao">Acompanhar o lead</a></li>
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#negociacao">Abrir a negociação</a></li>
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#proposta">Preparar a proposta</a></li>
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#fechamento">Fechar a venda</a></li>
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#rotina">Rotina diária</a></li>
                <li><a className="block rounded-sm px-2 py-1.5 hover:bg-muted" href="#duvidas">Dúvidas comuns</a></li>
              </ol>
            </nav>
          </div>
        </aside>

        <main>
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
            <Atalho href="/comercial/prospeccao">Abrir quadro de Prospecção</Atalho>
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
            <Atalho href="/comercial/negociacoes">Abrir Negociações</Atalho>
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
        </main>
      </div>

      <section id="duvidas" className="scroll-mt-24 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Consulta rápida</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Dúvidas comuns</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["O cliente chegou por indicação. Preciso prospectar primeiro?", "Não. Registre a Nova entrada com o canal Indicação. Se já houver pedido concreto, escolha Abrir negociação agora; se ainda for um contato inicial, escolha Acompanhar como lead."],
            ["A empresa já existe. Crio outra?", "Não. Selecione a empresa encontrada. Para outra obra ou outro escopo, mantenha a empresa e escolha Nova demanda / novo projeto."],
            ["Lead, prospecção e negociação são a mesma coisa?", "Não. O lead é o interesse registrado dentro da prospecção. A negociação nasce quando esse interesse é qualificado. O sistema mantém os dois ligados."],
            ["Posso criar uma proposta sem negociação?", "Não para vendas novas. Qualifique a prospecção primeiro; depois escolha essa negociação ao criar a proposta."],
            ["O cliente voltou depois de uma perda. Começo do zero?", "Não. Reabra a negociação ou crie uma nova prospecção para uma nova demanda. O histórico anterior deve continuar visível."],
            ["Por que não vejo um botão citado aqui?", "Seu perfil pode ter acesso somente de consulta. Peça a um gestor ou administrador a permissão adequada."],
            ["Onde vejo tudo que já aconteceu com a empresa?", "Abra a ficha do cliente e consulte a Empresa 360: contatos, prospecções, negociações, propostas, projetos e interações ficam reunidos ali."],
          ].map(([pergunta, resposta]) => (
            <Card key={pergunta} size="sm">
              <CardHeader><CardTitle>{pergunta}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{resposta}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="[--card-edge:var(--primary)]">
        <CardContent className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Pronto para começar?</p>
            <p className="text-sm text-muted-foreground">Abra o quadro e registre a próxima entrada real do time.</p>
          </div>
          <Button render={<Link href="/comercial/prospeccao" />}>
            Registrar nova entrada <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
