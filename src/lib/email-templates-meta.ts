/**
 * Catálogo dos e-mails do sistema (client-safe, sem `server-only`).
 * Cada tipo define suas variáveis (`{{nome}}`) e o corpo PADRÃO em **Markdown**.
 * O admin pode sobrescrever assunto/corpo por `EmailTemplateVariante` (DB); sem
 * override, usa-se o padrão daqui.
 *
 * Fluxo de render: `{{variavel}}` é substituída pelo valor cru e depois o corpo
 * (Markdown/GFM) é convertido em HTML. O assunto é texto puro (sem Markdown).
 */
export type EmailVariavel = { nome: string; descricao: string; exemplo: string };

export type EmailTemplateMeta = {
  slug: string;
  /** Agrupador visual na lista de categorias. */
  grupo: string;
  label: string;
  descricao: string;
  variaveis: EmailVariavel[];
  assuntoPadrao: string;
  corpoPadrao: string;
};

// ── Alertas de ponto ──────────────────────────────────────────────────────
// Cada tipo de alerta é uma CATEGORIA de e-mail própria: texto totalmente
// editável, com `{{hora}}` (vem da escala do funcionário) e `{{nome}}`
// (primeiro nome, pro tom ficar pessoal — sino/Push usam o MESMO texto).
// A chave espelha modules/ponto/alertas.ts; jobs-handlers roteia por ela.

type PontoAlertaDef = {
  chave: string;
  slug: string;
  label: string;
  assunto: string;
  corpo: string;
  exemploHora: string;
};

const PONTO_ALERTAS: PontoAlertaDef[] = [
  { chave: "entrada:prox", slug: "ponto-entrada-prox", label: "Entrada se aproximando", assunto: "Sua entrada está chegando", corpo: "Oi, {{nome}}! Faltam poucos minutos para o horário previsto da sua entrada, às {{hora}}. Não esqueça de bater o ponto.", exemploHora: "08:00" },
  { chave: "entrada:atingido", slug: "ponto-entrada-atingido", label: "Entrada não registrada", assunto: "Ainda não vimos sua entrada hoje", corpo: "Oi, {{nome}}! Sua entrada estava prevista para {{hora}} e ainda não foi registrada. Se você já chegou, é só bater o ponto no SenaHub.", exemploHora: "08:00" },
  { chave: "descanso_inicio:prox", slug: "ponto-descanso-inicio-prox", label: "Descanso se aproximando", assunto: "Seu descanso está chegando", corpo: "Oi, {{nome}}! Seu horário de descanso começa às {{hora}}. Lembre-se de registrar a saída para o intervalo.", exemploHora: "12:00" },
  { chave: "descanso_inicio:atingido", slug: "ponto-descanso-inicio-atingido", label: "Hora do descanso", assunto: "Hora de fazer seu descanso", corpo: "Oi, {{nome}}! O horário previsto para o início do seu descanso era {{hora}}. Se ainda não bateu, aproveite para registrar agora.", exemploHora: "12:00" },
  { chave: "descanso_fim:prox", slug: "ponto-descanso-fim-prox", label: "Fim do descanso se aproximando", assunto: "Seu descanso está terminando", corpo: "Oi, {{nome}}! Seu retorno do descanso está previsto para {{hora}}. Não esqueça de bater o ponto ao voltar.", exemploHora: "13:00" },
  { chave: "descanso_fim:atingido", slug: "ponto-descanso-fim-atingido", label: "Hora de voltar do descanso", assunto: "Já passou da hora de voltar do descanso", corpo: "Oi, {{nome}}! Seu retorno estava previsto para {{hora}}. Se você já voltou, registre sua entrada no sistema.", exemploHora: "13:00" },
  { chave: "saida:prox", slug: "ponto-saida-prox", label: "Fim da jornada se aproximando", assunto: "Sua jornada está chegando ao fim", corpo: "Oi, {{nome}}! Sua saída está prevista para {{hora}}. Não esqueça de bater o ponto antes de encerrar o dia.", exemploHora: "17:00" },
  { chave: "saida:atingido", slug: "ponto-saida-atingido", label: "Passou do horário de saída", assunto: "Já passou do seu horário de saída", corpo: "Oi, {{nome}}! Sua saída estava prevista para {{hora}} e ainda não foi registrada. Se você já encerrou o expediente, é só bater o ponto.", exemploHora: "17:00" },
  { chave: "jornada_cumprida", slug: "ponto-jornada-cumprida", label: "Jornada cumprida", assunto: "Você completou sua jornada de hoje", corpo: "Oi, {{nome}}! Você já somou {{hora}} de trabalho hoje. Este é só um aviso informativo — não representa cálculo de hora extra.", exemploHora: "8h00" },
];

/** chave do alerta (alertas.ts) → slug da categoria de e-mail. */
const PONTO_ALERTA_SLUG = new Map(PONTO_ALERTAS.map((p) => [p.chave, p.slug]));

export function slugAlertaPonto(chave: string): string | undefined {
  return PONTO_ALERTA_SLUG.get(chave);
}

/** chave do alerta → rótulo legível (usado no resumo diário — nunca a chave crua). */
const PONTO_ALERTA_LABEL = new Map(PONTO_ALERTAS.map((p) => [p.chave, p.label]));

export function labelAlertaPonto(chave: string): string {
  return PONTO_ALERTA_LABEL.get(chave) ?? chave;
}

const HORA_VAR = (exemplo: string): EmailVariavel => ({
  nome: "hora",
  descricao: "Horário previsto (ou duração, na jornada cumprida) — vem da escala do funcionário.",
  exemplo,
});

const NOME_VAR = (exemplo: string): EmailVariavel => ({
  nome: "nome",
  descricao: "Primeiro nome do funcionário.",
  exemplo,
});

const templatesPonto: EmailTemplateMeta[] = PONTO_ALERTAS.map((p) => ({
  slug: p.slug,
  grupo: "Alertas de ponto",
  label: p.label,
  descricao: p.chave.endsWith(":atingido")
    ? "Alerta de ponto. Horário ({{hora}}) e nome ({{nome}}) vêm da escala/cadastro do funcionário. Vai por e-mail na hora pra quem escolheu \"todos\" nas Preferências; sempre entra no resumo diário de quem escolheu essa opção."
    : "Alerta de ponto informativo (sem atraso). Não dispara e-mail avulso — só aparece no sino/Push e, se o usuário escolher, no resumo diário de fim do dia.",
  variaveis: [HORA_VAR(p.exemploHora), NOME_VAR("Maria")],
  assuntoPadrao: p.assunto,
  corpoPadrao: p.corpo,
}));

export const TEMPLATES_CATALOGO: EmailTemplateMeta[] = [
  {
    slug: "redefinir-senha",
    grupo: "Acesso",
    label: "Esqueci minha senha (link)",
    descricao:
      "Enviado quando alguém usa \"Esqueci minha senha\" na tela de login. O link ({{link}}) vale por {{validade}} e uma vez só; a senha só muda quando a pessoa abre o link e escolhe a nova. Mantenha o {{link}} no texto.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome de quem pediu", exemplo: "Maria" },
      { nome: "link", descricao: "Link para criar a nova senha (gerado pelo sistema)", exemplo: "https://app/redefinir-senha?token=abc123" },
      { nome: "validade", descricao: "Por quanto tempo o link vale", exemplo: "1 hora" },
    ],
    assuntoPadrao: "Crie sua nova senha do SenaHub",
    corpoPadrao: `Olá, {{nome}}.

Recebemos um pedido para criar uma nova senha para a sua conta no SenaHub.

[Criar nova senha]({{link}})

O link vale por **{{validade}}** e só pode ser usado uma vez. Ao salvar a nova senha, você sai do SenaHub em todos os aparelhos e entra de novo com ela.

Se não foi você que pediu, ignore este e-mail: sua senha atual continua valendo.`,
  },
  {
    slug: "aviso-geral",
    grupo: "Comunicados",
    label: "Aviso geral",
    descricao: "Enviado quando um comunicado é direcionado com a opção de e-mail marcada.",
    variaveis: [
      { nome: "titulo", descricao: "Título do aviso", exemplo: "Manutenção no sistema" },
      { nome: "corpo", descricao: "Mensagem do aviso", exemplo: "O sistema ficará indisponível sábado das 8h às 10h." },
    ],
    assuntoPadrao: "SenaHub — {{titulo}}",
    corpoPadrao: `## {{titulo}}

{{corpo}}

_Comunicado do SenaHub — confirme a leitura ao acessar o sistema._`,
  },
  {
    slug: "lembrete-pagamento",
    grupo: "Financeiro & Comercial",
    label: "Lembrete de pagamento (inadimplência)",
    descricao: "Enviado ao cliente quando um recebimento vence e não foi baixado (D+1).",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente", exemplo: "Construtora Alfa" },
      { nome: "descricao", descricao: "Descrição do lançamento", exemplo: "Parcela 2/3 — Projeto Estrutural" },
      { nome: "valor", descricao: "Valor formatado (R$)", exemplo: "R$ 3.500,00" },
      { nome: "vencimento", descricao: "Data de vencimento", exemplo: "05/07/2026" },
    ],
    assuntoPadrao: "Lembrete de pagamento — {{descricao}}",
    corpoPadrao: `Olá, {{nomeCliente}}.

Identificamos que o pagamento referente a **{{descricao}}** no valor de **{{valor}}**, com vencimento em {{vencimento}}, ainda não foi registrado.

Caso já tenha efetuado o pagamento, desconsidere este aviso.

Em caso de dúvidas, entre em contato com nossa equipe.`,
  },
  {
    slug: "lembrete-vencimento",
    grupo: "Financeiro & Comercial",
    label: "Lembrete de vencimento (antes e no dia)",
    descricao: "Enviado ao cliente alguns dias antes do vencimento e no dia (desligado até ser ativado em Configurações do financeiro).",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente", exemplo: "Construtora Alfa" },
      { nome: "descricao", descricao: "Descrição do lançamento", exemplo: "Parcela 2/3 — Projeto Estrutural" },
      { nome: "valor", descricao: "Valor formatado (R$)", exemplo: "R$ 3.500,00" },
      { nome: "vencimento", descricao: "Data de vencimento", exemplo: "05/07/2026" },
      { nome: "situacao", descricao: "Quando vence", exemplo: "vence em 3 dias" },
    ],
    assuntoPadrao: "Lembrete: {{descricao}} {{situacao}}",
    corpoPadrao: `Olá, {{nomeCliente}}.

Este é um lembrete: o pagamento referente a **{{descricao}}**, no valor de **{{valor}}**, {{situacao}} ({{vencimento}}).

Caso já tenha efetuado o pagamento, desconsidere este aviso.

Em caso de dúvidas, entre em contato com nossa equipe.`,
  },
  {
    slug: "proposta-cliente",
    grupo: "Financeiro & Comercial",
    label: "Proposta comercial",
    descricao: "Enviado ao cliente com o link público da proposta.",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente", exemplo: "Construtora Alfa" },
      { nome: "numero", descricao: "Número da proposta", exemplo: "2026-042" },
      { nome: "titulo", descricao: "Título da proposta", exemplo: "Projeto Estrutural — Galpão" },
      { nome: "valorTotal", descricao: "Valor total formatado (R$)", exemplo: "R$ 18.000,00" },
      { nome: "url", descricao: "Link público da proposta", exemplo: "https://app/a/proposta/xyz" },
    ],
    assuntoPadrao: "Proposta {{numero}} — {{titulo}}",
    corpoPadrao: `Olá, {{nomeCliente}}.

Segue a proposta **{{numero}} — {{titulo}}**, no valor total de **{{valorTotal}}**.

[Clique aqui para visualizar a proposta]({{url}})

Sena Projetos`,
  },
  {
    slug: "projeto-disponivel",
    grupo: "Projetos",
    label: "Projeto disponível (link ao cliente)",
    descricao:
      "Enviado ao cliente pelo modal de link público de arquivos. Avisa que o projeto está disponível. O bloco de acesso ({{blocoAcesso}}) é montado pelo sistema conforme o destinatário: já é usuário → link de login; ainda não é → link público + convite para solicitar cadastro.",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente/destinatário", exemplo: "Construtora Alfa" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      {
        nome: "blocoAcesso",
        descricao:
          "Bloco de acesso gerado automaticamente (login OU link público + vantagens + convite de cadastro). Não editável — varia por destinatário.",
        exemplo:
          "[Ver os arquivos do projeto](https://app/p/arquivos/xyz)\n\nQuer acompanhar tudo pelo sistema? [Solicite seu cadastro](https://app/solicitar-cadastro).",
      },
    ],
    assuntoPadrao: "Seu projeto {{projeto}} está disponível — SenaHub",
    corpoPadrao: `Olá, {{nomeCliente}}.

O projeto **{{projeto}}** está disponível para acompanhamento.

{{blocoAcesso}}

Qualquer dúvida, é só falar com a nossa equipe.

Sena Projetos`,
  },
  {
    slug: "acompanhamento-projeto",
    grupo: "Projetos",
    label: "Acompanhamento do projeto (cliente)",
    descricao:
      "Enviado ao cliente pelo botão \"E-mail de acompanhamento\" do projeto. Lista o que já foi enviado a ele; o assunto real é fixo por projeto (para a conversa ficar encadeada na caixa do cliente).",
    variaveis: [
      { nome: "nomeCliente", descricao: "Nome do cliente", exemplo: "Construtora Alfa" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      {
        nome: "lista",
        descricao: "Lista do que foi enviado (uma linha por revisão). Montada pelo sistema.",
        exemplo: "- R01 · Planta de forma (Estrutural)\n- R02 · Detalhe de escada (Estrutural)",
      },
      { nome: "observacao", descricao: "Texto livre que quem envia acrescenta (pode ficar vazio)", exemplo: "Qualquer dúvida, é só responder este e-mail." },
    ],
    assuntoPadrao: "Acompanhamento — {{projeto}}",
    corpoPadrao: `Olá, {{nomeCliente}}.

Segue o acompanhamento do projeto **{{projeto}}**. Já enviamos a você:

{{lista}}

{{observacao}}

Sena Projetos`,
  },
  {
    slug: "resumo-andamento-portal",
    grupo: "Projetos",
    label: "Resumo diário do portal (cliente)",
    descricao:
      "Enviado às 7h a cada conta do portal do cliente, um por projeto, só quando o projeto andou no dia anterior (pranchas compartilhadas, liberadas para obra, fases concluídas). Ligado e desligado em Configurações → Portal do cliente; o cliente pode desligar em Meus projetos.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome da conta do portal", exemplo: "Mariana" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      { nome: "periodo", descricao: "Dia (ou dias, se o servidor ficou fora) do resumo", exemplo: "18/11/2026" },
      {
        nome: "lista",
        descricao: "O que andou, uma linha por item da linha do tempo. Montada pelo sistema.",
        exemplo: "- **Estrutural** · 8 pranchas compartilhadas com você\n- **Hidráulica** · Fase BS concluída",
      },
      { nome: "url", descricao: "Link do projeto no portal", exemplo: "https://app/portal/abc" },
    ],
    assuntoPadrao: "Novidades em {{projeto}} — {{periodo}}",
    corpoPadrao: `Olá, {{nome}}.

Em {{periodo}}, o projeto **{{projeto}}** andou:

{{lista}}

[Abrir no portal]({{url}})

Para não receber mais este resumo, desligue em Meus projetos, no portal.

Sena Projetos`,
  },
  {
    slug: "resumo-obra-portal",
    grupo: "Projetos",
    label: "Resumo diário do portal (obra)",
    descricao:
      "Enviado às 7h a cada conta de obra do portal, um por obra, só quando algo foi liberado, substituído ou retirado da pasta Liberado para obra no dia anterior. Ligado e desligado junto com o resumo do cliente em Configurações → Portal do cliente; a pessoa pode desligar em Minhas obras.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome da conta de obra", exemplo: "João" },
      { nome: "projeto", descricao: "Nome da obra (projeto)", exemplo: "Residencial Villa Verde" },
      { nome: "periodo", descricao: "Dia (ou dias, se o servidor ficou fora) do resumo", exemplo: "18/11/2026" },
      {
        nome: "lista",
        descricao: "O que mudou na pasta Liberado para obra, uma linha por prancha. Montada pelo sistema.",
        exemplo: "- **Estrutural** · EST-01.pdf · substituída: R00 → R01\n- **Hidráulica** · HID-03.pdf · liberada para obra (R00)",
      },
      { nome: "url", descricao: "Link da obra no portal", exemplo: "https://app/portal/abc" },
    ],
    assuntoPadrao: "Novidades na obra {{projeto}} — {{periodo}}",
    corpoPadrao: `Olá, {{nome}}.

Em {{periodo}}, mudou o que está liberado para obra em **{{projeto}}**:

{{lista}}

A prancha que vale é sempre a do portal; cópias baixadas antes podem estar desatualizadas.

[Abrir no portal]({{url}})

Para não receber mais este resumo, desligue em Minhas obras, no portal.

Sena Projetos`,
  },
  {
    slug: "pedido-revisao-respondido",
    grupo: "Projetos",
    label: "Resposta ao pedido de revisão (cliente)",
    descricao:
      "Enviado à conta do portal que pediu revisão de uma prancha ou do modelo 3D, assim que a equipe aceita ou recusa o pedido. Não tem opção de desligar: é a resposta a uma ação do próprio cliente.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome de quem pediu", exemplo: "Mariana" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      {
        nome: "prancha",
        // O valor é o nome do arquivo OU "Modelo 3D": uma frase como "da prancha {{prancha}}" leria "da prancha Modelo 3D".
        descricao:
          "Arquivo da prancha, ou \"Modelo 3D\" no pedido feito no modelo. Não escreva \"da prancha\" antes: use-a sozinha, como no texto padrão.",
        exemplo: "260507-ARQ-EX-3001-PLA.pdf",
      },
      { nome: "situacao", descricao: "aceito ou recusado", exemplo: "aceito" },
      {
        nome: "resposta",
        descricao: "A resposta da equipe, já com o rótulo; vazia quando a equipe não escreveu. Montada pelo sistema.",
        exemplo: "Resposta da equipe: vamos ajustar na próxima revisão.",
      },
      { nome: "url", descricao: "Link do projeto no portal", exemplo: "https://app/portal/abc" },
    ],
    assuntoPadrao: "Seu pedido de revisão foi {{situacao}} — {{projeto}}",
    corpoPadrao: `Olá, {{nome}}.

Seu pedido de revisão no projeto **{{projeto}}** (**{{prancha}}**) foi **{{situacao}}** pela equipe.

{{resposta}}

[Ver no portal]({{url}})

Sena Projetos`,
  },
  {
    slug: "portal-briefing-pedido",
    grupo: "Projetos",
    label: "Pedido do briefing pelo portal (cliente)",
    descricao:
      "Enviado a cada conta ativa do cliente quando a equipe pede (ou reabre) o briefing do projeto pelo portal. Não tem opção de desligar: é um pedido direto da equipe ao cliente. Sem SMTP configurado, só o sino do portal.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome da conta do portal", exemplo: "Mariana" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      { nome: "url", descricao: "Link do briefing no portal", exemplo: "https://app/portal/abc/briefing" },
      { nome: "acao", descricao: "O que a equipe fez: \"pediu\" (primeiro pedido) ou \"reabriu\" (briefing já encerrado)", exemplo: "pediu" },
    ],
    assuntoPadrao: "A equipe {{acao}} o briefing do projeto {{projeto}}",
    corpoPadrao: `Olá, {{nome}}.

A equipe {{acao}} o briefing do projeto **{{projeto}}** para você preencher. As informações nos ajudam a iniciar os projetos com tudo o que precisamos.

[Preencher no portal]({{url}})

Você pode preencher aos poucos: o que for respondido fica salvo.

Sena Projetos`,
  },
  {
    slug: "portal-contrato-assinatura",
    grupo: "Projetos",
    label: "Pedido de assinatura de contrato pelo portal (cliente)",
    descricao:
      "Enviado a cada conta ativa do cliente quando a equipe pede, no Jurídico, a assinatura de um contrato ou aditivo pelo portal. Não tem opção de desligar: é um pedido direto da equipe ao cliente. Sem SMTP configurado, só o sino do portal.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome da conta do portal", exemplo: "Mariana" },
      { nome: "documento", descricao: "Título do contrato ou aditivo", exemplo: "Contrato de prestação de serviços" },
      { nome: "projeto", descricao: "Nome do projeto (vazio quando o documento não tem projeto)", exemplo: "Residencial Villa Verde" },
      { nome: "url", descricao: "Link dos contratos no portal", exemplo: "https://app/portal/abc#contratos" },
    ],
    assuntoPadrao: "Assinatura pendente: {{documento}}",
    corpoPadrao: `Olá, {{nome}}.

A equipe pediu sua assinatura no documento **{{documento}}**. Você pode ler o PDF e assinar direto pelo portal.

[Ver e assinar no portal]({{url}})

Sena Projetos`,
  },
  {
    slug: "portal-mensagem-equipe",
    grupo: "Projetos",
    label: "Mensagem nova da coordenação no portal (cliente)",
    descricao:
      "Enviado a cada conta ativa do cliente quando a coordenação escreve na conversa do projeto pelo portal. No máximo um por conversa até a pessoa abrir a conversa; depois de ler, a próxima mensagem pode gerar outro. O cliente desliga em Meus projetos (o sino continua). Não leva o texto da mensagem.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome da conta do portal", exemplo: "Mariana" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      { nome: "autor", descricao: "Nome de quem escreveu", exemplo: "Carla Mendes" },
      { nome: "url", descricao: "Link da conversa no portal", exemplo: "https://app/portal/abc#mensagens" },
    ],
    assuntoPadrao: "Mensagem nova da coordenação: {{projeto}}",
    corpoPadrao: `Olá, {{nome}}.

**{{autor}}** escreveu na conversa do projeto **{{projeto}}**. Entre no portal para ler e responder.

[Abrir a conversa no portal]({{url}})

Sena Projetos`,
  },
  {
    slug: "portal-ata-reuniao",
    grupo: "Projetos",
    label: "Ata de reunião publicada no portal (cliente)",
    descricao:
      "Enviado a cada conta ativa do cliente quando a coordenação publica (ou corrige) a ata de uma reunião no portal, para o cliente ler e confirmar. Não tem opção de desligar: é um pedido formal da equipe ao cliente. Sem SMTP configurado, só o sino do portal.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome da conta do portal", exemplo: "Mariana" },
      { nome: "titulo", descricao: "Título da reunião", exemplo: "Reunião de alinhamento do executivo" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      { nome: "url", descricao: "Link das atas no portal", exemplo: "https://app/portal/abc#atas" },
    ],
    assuntoPadrao: "Ata para conferir: {{titulo}}",
    corpoPadrao: `Olá, {{nome}}.

A coordenação publicou a ata de **{{titulo}}**, do projeto **{{projeto}}**.

Abra o portal para ler as decisões e as tarefas combinadas e responder: Li e concordo, ou Tenho observações.

[Ler a ata]({{url}})

Sena Projetos`,
  },
  {
    slug: "portal-aprovacao-entrega",
    grupo: "Projetos",
    label: "Pedido de aprovação de entrega pelo portal (cliente)",
    descricao:
      "Enviado a cada conta ativa do cliente quando a coordenação envia um pacote de entrega para aprovação no portal. Não tem opção de desligar: é um pedido formal da equipe ao cliente. Sem SMTP configurado, só o sino do portal.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome da conta do portal", exemplo: "Mariana" },
      { nome: "titulo", descricao: "Título do pedido de aprovação", exemplo: "Entrega BS — Estrutural e Hidráulica" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      { nome: "url", descricao: "Link das aprovações no portal", exemplo: "https://app/portal/abc#aprovacoes" },
    ],
    assuntoPadrao: "Aprovação pendente: {{titulo}}",
    corpoPadrao: `Olá, {{nome}}.

A coordenação enviou **{{titulo}}**, do projeto **{{projeto}}**, para a sua aprovação.

Abra o portal para ver os arquivos e responder: Aprovo, Aprovo com ressalvas ou Não aprovo.

[Ver e responder]({{url}})

Sena Projetos`,
  },
  {
    slug: "portal-mensagem-cliente",
    grupo: "Projetos",
    label: "Mensagem nova do cliente no portal (coordenação)",
    descricao:
      "Enviado aos coordenadores do projeto (sem nenhum, à gestão) quando o cliente escreve na conversa do portal. No máximo um por conversa até a pessoa abrir a conversa. Desliga em Preferências (\"Mensagens de clientes\"), junto com o sino. Não leva o texto da mensagem.",
    variaveis: [
      { nome: "nome", descricao: "Primeiro nome de quem recebe", exemplo: "Carla" },
      { nome: "projeto", descricao: "Nome do projeto", exemplo: "Residencial Villa Verde" },
      { nome: "autor", descricao: "Nome da conta do cliente que escreveu", exemplo: "Mariana Souza" },
      { nome: "url", descricao: "Link da aba Cliente do projeto", exemplo: "https://app/projetos/abc/cliente" },
    ],
    assuntoPadrao: "Mensagem do cliente: {{projeto}}",
    corpoPadrao: `Olá, {{nome}}.

**{{autor}}** escreveu na conversa do projeto **{{projeto}}** pelo portal.

[Abrir a conversa]({{url}})

Sena Projetos`,
  },
  {
    slug: "holerite",
    grupo: "RH",
    label: "Holerite",
    descricao: "Envio do holerite mensal ao colaborador CLT/estagiário.",
    variaveis: [
      { nome: "competencia", descricao: "Mês/ano (MM/AAAA)", exemplo: "07/2026" },
      { nome: "nome", descricao: "Nome do colaborador", exemplo: "Maria Souza" },
      { nome: "linhas", descricao: "Linhas da tabela em Markdown (| Descrição | Valor |)", exemplo: "| Salário base | R$ 3.000,00 |\n| INSS | -R$ 300,00 |" },
      { nome: "liquido", descricao: "Líquido formatado", exemplo: "R$ 2.640,00" },
    ],
    assuntoPadrao: "Holerite {{competencia}} — SenaHub",
    corpoPadrao: `## Holerite {{competencia}}

{{nome}}

| Descrição | Valor |
| --- | ---: |
{{linhas}}
| **Líquido** | **{{liquido}}** |`,
  },
  {
    slug: "resumo-semanal",
    grupo: "Gestão",
    label: "Resumo semanal (gestores)",
    descricao: "Segunda de manhã: entregas da semana para quem recebe avisos de gestão; a receber e a pagar só para quem tem acesso ao financeiro.",
    variaveis: [
      { nome: "corpo", descricao: "Texto do resumo", exemplo: "Semana: 3 entrega(s) com prazo · a receber R$ 12.000 · a pagar R$ 4.000." },
    ],
    assuntoPadrao: "SenaHub — resumo semanal",
    corpoPadrao: `{{corpo}}`,
  },
  {
    slug: "resumo-ponto-diario",
    grupo: "Alertas de ponto",
    label: "Resumo diário de ponto",
    descricao: "1 e-mail no fim do dia com os alertas de ponto acumulados (para quem escolheu resumo diário).",
    variaveis: [
      NOME_VAR("Maria"),
      { nome: "linhas", descricao: "Lista de alertas do dia, já com rótulo legível (Markdown, um item por linha)", exemplo: "- 08:15 — Entrada não registrada\n- 12:40 — Fim do descanso se aproximando" },
      { nome: "batidas", descricao: "Lista das batidas de ponto do dia (Markdown, um item por linha)", exemplo: "- 08:15 — Entrada\n- 12:00 — Início do descanso\n- 13:05 — Fim do descanso\n- 18:02 — Saída" },
    ],
    assuntoPadrao: "Seu resumo de ponto de hoje",
    corpoPadrao: `Oi, {{nome}}! Aqui está um resumo do seu dia.

**Avisos que você recebeu:**

{{linhas}}

**Batidas registradas:**

{{batidas}}

Se algo parecer errado, você pode ajustar o registro em Ponto → Espelho.`,
  },
  ...templatesPonto,
];

export function metaTemplate(slug: string): EmailTemplateMeta | undefined {
  return TEMPLATES_CATALOGO.find((t) => t.slug === slug);
}

/** Valores de exemplo de todas as variáveis (para preview / envio de teste). */
export function exemplosDoTemplate(slug: string): Record<string, string> {
  const meta = metaTemplate(slug);
  if (!meta) return {};
  return Object.fromEntries(meta.variaveis.map((v) => [v.nome, v.exemplo]));
}
