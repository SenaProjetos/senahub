---
titulo: Perguntas Frequentes (FAQ)
descricao: Dúvidas e erros comuns do SenaHub com solução objetiva.
resumo: Respostas rápidas para acesso, senha, permissões, busca e problemas do dia a dia.
tags: [faq, dúvidas, erros, problemas, suporte, ajuda, cronograma, pagamento por fase, contrato por entrega]
palavras-chave: [faq, perguntas, dúvida, erro, não consigo, esqueci a senha, permissão, acesso negado, reagendar, linha de base, replanejar, previsão de recebimento, faturar parcela]
sinonimos: [perguntas frequentes, troubleshooting, solução de problemas, ajuda comum]
---

# Perguntas Frequentes (FAQ)

> Esta lista cresce conforme o Conselho documenta novos módulos. Todas as respostas
> refletem o comportamento real do sistema.

## Acesso e conta

**Esqueci minha senha. E agora?**
Na tela **Entrar**, clique em **Esqueci minha senha** e siga o formulário de
recuperação. Se não resolver, peça ao administrador para redefinir.

**Como troco minha senha?**
Menu da conta (avatar, canto superior direito) → **Trocar senha**.

**Recebi "E-mail ou senha incorretos."**
E-mail ou senha não conferem. Revise os dois (atenção a maiúsculas/espaços) e, se
preciso, use **Esqueci minha senha**.

**Não tenho conta. Como solicito acesso?**
Na tela de login, clique em **Solicitar acesso** e preencha o pedido de cadastro.

**Como troco minha foto de perfil?**
Menu da conta → **Alterar foto** → escolha uma imagem. Também dá para trocar em **Preferências → Meu
perfil**.

**Como saio com segurança?**
Menu da conta → **Sair**. A sessão é encerrada.

## Navegação e busca

**Como busco rápido por um projeto, cliente ou lançamento?**
Tecle **Ctrl + K** (**⌘ + K** no Mac) ou clique em **Buscar** no topo. Digite ao menos
2 caracteres. A busca cobre projetos, clientes, tarefas, documentos, lançamentos,
licitações e propostas.

**Mudei um filtro e a lista "voltou ao começo". É bug?**
Não. Ao mudar qualquer filtro, a lista volta para a **página 1** de propósito.

**Posso compartilhar uma lista já filtrada?**
Sim. Filtros, ordenação e página ficam na **URL** — copie o link.

## Permissões

**Um módulo/botão não aparece para mim. Por quê?**
Quase sempre é **permissão**: seu perfil não tem acesso àquela área ou ação. Confira os
[perfis no Guia de Início Rápido](quick-start.md#9-perfis-de-acesso-quem-vê-o-quê) ou
peça ao administrador.

**Sou cliente. Por que vejo poucas opções?**
O perfil **Cliente** é uma visão externa reduzida: **Meus projetos** (portal) e seu
**Financeiro** (extrato), além do Suporte.

## Comercial

**O cliente chegou por indicação. Preciso passar por toda a prospecção?**
Não. Abra **Comercial → Prospecção → Nova entrada**, escolha o canal **Indicação** e,
quando possível, informe **Quem indicou / parceiro**. Se já existe um pedido concreto de
orçamento ou projeto, escolha **Abrir negociação agora**. Use **Acompanhar como lead** apenas
quando o contato ainda precisa ser desenvolvido.

**A empresa já é cliente e trouxe outra obra. Devo criar outra empresa?**
Não. Selecione a empresa existente e escolha **Nova demanda / novo projeto**. Assim o histórico
da empresa fica reunido, mas cada obra segue em seu próprio lead e em sua própria negociação.

## Projetos, cronograma e pagamento

**Mudei a duração ou uma dependência e as datas não mudaram.**
As datas exibidas só se atualizam quando você clica em **Reagendar** (ou ao definir o início do
projeto). A folga e o caminho crítico aparecem sempre calculados na hora. Veja
[Planejamento](projetos/planejamento.md).

**Uma tarefa terminou depois do dia que eu digitei.**
O cronograma conta **dias úteis** (segunda a sexta, sem os feriados cadastrados). Uma tarefa que
atravessa fim de semana ou feriado pode terminar **depois** do fim que você digitou. Confira a coluna
**Duração** e leia a nota "Atenção (versão atual)" em [Planejamento](projetos/planejamento.md).

**O que muda depois que aprovo o cronograma?**
A aprovação congela a **linha de base** (BL-00) — o combinado —, e ela nunca é alterada. Ajustes de plano
entram como **Replanejar** (BL-01, BL-02…), sempre com motivo, e o sistema mostra o desvio contra o
combinado.

**O card do meu quadro de Tarefas não deixa mudar o prazo.**
Card que vem do cronograma acompanha a EAP: título, prazo, projeto, disciplina e responsáveis ficam
travados e mudam na EAP do projeto. Coluna, prioridade, descrição, checklist e comentários continuam
livres. Veja [Tarefas](projetos/tarefas.md).

**A mesma disciplina aparece em duas linhas na Produção para o mesmo projetista.**
É o **pagamento por fase**: cada fase aprovada tem a sua linha ("Elétrica · BS"), e a soma delas é o
valor da disciplina. Veja [Etapas e pagamento por fase](projetos/etapas-e-pagamento-por-fase.md).

**A parcela do contrato por entrega não aparece em Contas a receber.**
Enquanto não é faturada, ela é só **previsão** — aparece no **Fluxo de caixa**. Vira conta a receber
quando o financeiro clica em **Faturar** no diálogo **Pagamento** do contrato. Veja
[Contrato por entrega](financeiro/contrato-por-entrega.md).

**Não vejo valores em R$ no Valor Agregado.**
A régua em R$ e o custo só aparecem para quem tem acesso ao financeiro; os demais veem a régua em
**horas**. Veja [Valor Agregado](projetos/valor-agregado.md).

## Problemas comuns

**Chat ou notificações em tempo real não atualizam.**
Recursos de tempo real dependem do servidor completo estar no ar. Se persistir, abra um
chamado no **Suporte** / fale com a TI.

**A tela ficou com aparência "quebrada" por um instante ao navegar.**
Em ambiente de desenvolvimento isso pode ser um efeito temporário do recarregamento.
Em produção não deve ocorrer — se ocorrer, registre no **Suporte**.

---

## Veja também

- [Guia de Início Rápido](quick-start.md)
- [Glossário](glossary.md)
