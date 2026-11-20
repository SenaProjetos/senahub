---
titulo: Portal do cliente (Meus projetos)
descricao: Visão externa, somente leitura, onde o cliente acompanha seus projetos.
resumo: O cliente vê os projetos do seu cadastro em cartões com situação, prazo e progresso, abre cada um para detalhes, baixa as pranchas entregues e acompanha no Financeiro as parcelas em aberto e pagas.
tags: [portal, cliente, meus projetos, acompanhamento, externo, somente leitura, pranchas, entregas, financeiro, parcelas]
palavras-chave: [portal, cliente, meus projetos, acompanhar projeto, progresso, prazo, situação, andamento, fase, linha do tempo, resumo, e-mail]
sinonimos: [área do cliente, portal externo, acompanhamento de projeto]
---

# Portal do cliente (Meus projetos)

## Objetivo

Permitir que o **cliente** acompanhe, de forma simples e somente leitura, o andamento
dos projetos contratados com o escritório.

## Quando utilizar

- Quando o cliente quer ver status, prazo e progresso dos seus projetos.
- Quando o cliente quer abrir ou baixar as pranchas que o escritório já entregou.

## Quando não utilizar

- Não é área de edição: o cliente **não** cria nem altera dados aqui.
- Perfis internos não usam o portal — eles têm o [Dashboard](dashboard.md) e o módulo
  de [Projetos](../projetos/README.md).

## Como acessar

- Exclusivo do perfil **cliente**: menu → **Meus projetos**, ou a rota `/portal`.
- Perfis internos que tentem abrir `/portal` são redirecionados para o Início.

## Pré-requisitos

- A conta do cliente precisa estar **vinculada a um cadastro de cliente**. Sem vínculo,
  a tela mostra: *"Sua conta ainda não está vinculada a um cliente. Contate o
  escritório."*

## Fluxo completo

1. O cliente entra no sistema e cai em **Meus projetos**.
2. Vê **um cartão por projeto** do seu cadastro, com:
   - **Código** e **nome** do projeto;
   - **Situação** (etiqueta);
   - **nº de disciplinas**;
   - **Prazo** final;
   - **barra de progresso (%)** — a mesma conta do **Andamento** (veja abaixo).
3. Clicar em um cartão abre o **detalhe do projeto** (`/portal/{projeto}`), com o **Andamento**, a
   **Linha do tempo**, as **Entregas** e os **Documentos** que o cliente envia ao escritório.

## Andamento e linha do tempo

O card **Andamento** mostra cada disciplina com as suas fases (EP, BS, EX…), cada uma numa situação:

- **Não iniciada** — o trabalho da fase ainda não começou;
- **Em andamento** — a fase está sendo feita, revisada ou analisada pelo escritório;
- **Concluída** (com a data) — a fase foi aprovada pelo escritório **e** o cliente já recebeu pranchas dela
  (em **Compartilhado** ou **Liberado para obra**). Fase aprovada sem prancha enviada continua em andamento.

O **% concluído** soma o peso das fases concluídas (o mesmo peso que divide o valor da disciplina). Disciplina
sem fases conta como concluída ou não, inteira.

O portal **não mostra datas previstas** — só o que já aconteceu. O prazo do contrato continua no topo.

A **Linha do tempo** lista, do mais novo para o mais antigo, o que chegou ao cliente: pranchas compartilhadas,
pranchas liberadas para obra e fases concluídas, agrupadas por dia e disciplina. Mostra só o que está hoje nas
**Entregas**: quando uma revisão nova substitui a anterior, o envio antigo sai da lista. Aparecem os 10 mais
recentes; **Mostrar tudo** abre o resto.

## Pranchas e entregas

A seção **Entregas** do detalhe do projeto mostra o que o escritório já entregou, em duas pastas:

- **Compartilhado** — as pranchas enviadas ao cliente;
- **Liberado para obra** — as pranchas que a obra pode usar.

Dentro de cada pasta, as pranchas ficam por disciplina, fase (EP, BS, EX…) e formato (PDF, DWG…). Cada
arquivo mostra a **revisão** (R00, R01…) e, quando houver, **o que mudou** nela. Abaixo das pastas ficam as
**ARTs** do projeto, com o histórico de versões.

- O ícone de olho **abre a prancha no portal**, com zoom e o botão **Pedir revisão**; o de seta **baixa** o arquivo.
- O ícone de pacote ao lado de uma pasta baixa **a pasta inteira em .zip**; **Baixar tudo (.zip)** baixa todas.
- **Em revisão** — o escritório está preparando uma revisão nova desta prancha (normalmente a pedido do
  cliente). A prancha atual continua valendo até a nova chegar.
- **Download bloqueado** — o escritório bloqueou temporariamente esta revisão. Ela aparece na lista, mas não
  abre nem baixa; fale com a equipe do projeto.

Só aparecem aqui as pranchas que o escritório colocou nas pastas do cliente. Revisões em andamento ou em
análise interna não aparecem. Os mesmos arquivos são os que um link de arquivos do projeto mostraria.

## Pedir revisão de uma prancha

Quando algo numa prancha precisa mudar, peça pelo portal: o pedido chega à equipe com o lugar exato.

1. Em **Entregas**, clique no olho do PDF. A prancha abre no portal, com zoom.
2. Clique **Pedir revisão**. Escolha uma ferramenta (**Alfinete**, **Retângulo**, **Seta**, **Nuvem**, **Cota** ou
   **Traço livre**) e marque na prancha. Cada marcação pede um texto: o que mudar ali.
3. Escreva o **comentário geral** e, se quiser, anexe até 5 arquivos (PDF, imagem PNG ou JPG, DWG ou DXF).
4. Clique **Enviar pedido**.

Também dá para pedir sem marcar: **Pedir revisão** na linha do PDF, nas Entregas, abre só o comentário e os anexos.

- As marcações ficam guardadas neste navegador até o envio: fechar a aba não perde o trabalho. **Descartar** apaga.
- **Cota** só funciona quando a equipe já definiu a escala da prancha; sem ela, o botão fica desabilitado. O valor da
  cota é recalculado pelo sistema ao enviar.
- No celular, o botão **Pedido (N)** abre a lista de marcações, o comentário e o envio.

O pedido aparece no card **Pedidos de revisão** e a prancha ganha o selo **Pedido aguardando** nas Entregas. Quando
a equipe responde, chega um aviso no sino e um e-mail:

- **Aceito** — a prancha passa a mostrar **Em revisão** e a equipe prepara a revisão nova.
- **Recusado** — a resposta da equipe explica o motivo.

Enquanto o pedido aguarda, qualquer conta da sua empresa pode **Cancelar pedido**. Pedido enviado não se edita:
cancele e faça outro. Se a prancha ganhar revisão nova antes da resposta, o pedido mostra **Revisão substituída** —
confira a revisão nova. Na prancha, as marcações dos pedidos que ainda aguardam a equipe aparecem em cinza, para
ninguém pedir a mesma coisa duas vezes.

## Resumo por e-mail

Nos dias em que um projeto anda, o cliente recebe **às 7h do dia seguinte** um e-mail (um por projeto) com o que
chegou: pranchas compartilhadas, pranchas liberadas para obra e fases concluídas — as mesmas linhas da **Linha do
tempo** — e o botão **Abrir no portal**. Dia sem novidade não manda nada. O mesmo resumo aparece no sino do portal.

- Para não receber o e-mail, desmarque **Receber por e-mail o resumo dos dias em que um projeto andar**, no rodapé de
  **Meus projetos**. O aviso no sino continua.
- Se o servidor ficou fora alguns dias, o cliente recebe um e-mail só com os dias que faltaram.
- O escritório liga e desliga o resumo em Configurações → **Portal do cliente**.

## Financeiro

No menu **Financeiro** o cliente vê as parcelas que paga ao escritório, **só valores e datas** — sem nota
fiscal, boleto, conta bancária ou descrição interna.

- No topo, três totais: **Vencido**, **A vencer** e **Pago**.
- **Em aberto** — parcelas ainda não pagas, da mais antiga para a mais nova, com projeto, vencimento, valor e
  situação (**Vencida** ou **A vencer**).
- **Pagas** — da mais recente para a mais antiga, com o vencimento e a data em que o pagamento foi registrado.

Regras:

- Entra a parcela ligada ao cliente, ou sem cliente num projeto dele. Parcela com outro pagador no mesmo projeto
  não aparece.
- O valor é o que o cliente paga: quando a nota tem imposto retido, aparece o líquido. Numa parcela paga em
  parte, a parte paga fica em **Pagas** e o resto em **Em aberto**.
- Não aparecem: previsão de recebimento do cronograma (ainda não faturada), parcela cancelada, juros e descontos
  da baixa e, como na cobrança por e-mail, parcelas de licitação (salvo se a cobrança de licitação estiver ligada
  em Configurações → Avisos de vencimento).
- Cliente desativado no cadastro vê o aviso de acesso suspenso, como no resto do portal.

## Casos especiais

- Cliente sem projetos → "Nenhum projeto ainda.".
- Conta sem vínculo de cliente → mensagem orientando contatar o escritório.
- Projeto sem prancha nas pastas do cliente → "Nenhuma prancha compartilhada ainda." nas Entregas e "Ainda não há
  entregas neste projeto." na Linha do tempo.

## Regras de negócio e escopo

- Mostra **apenas** os projetos do cliente vinculado à conta (`clienteId`). Nenhum dado
  de outros clientes é exibido.
- Tela **somente leitura** (o único envio é o do bloco Documentos).
- Cada abertura ou download de prancha fica registrado no histórico do documento, com o nome de quem baixou
  e a marca "portal do cliente".

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| "Sua conta ainda não está vinculada…" | Conta sem `clienteId` | O escritório vincula a conta ao cadastro do cliente |
| "Nenhum projeto ainda." | Cliente sem projetos cadastrados | Aguardar o cadastro do projeto |
| "Aceite o termo de uso para continuar." ao baixar | Há uma versão nova do termo de uso | Sair e entrar de novo e aceitar o termo |
| "Não foi possível carregar o andamento e as entregas agora." | Falha ao ler as entregas | Clicar em **Tentar de novo**; se continuar, falar com o escritório |
| "Arquivo indisponível." ao baixar | A prancha saiu das pastas do cliente ou foi bloqueada | Recarregar a página; se continuar, falar com o escritório |

## Funcionalidades relacionadas

- [Início (Dashboard)](dashboard.md) — equivalente interno
- [Clientes](../clientes-comercial/README.md) — onde o vínculo é configurado

## FAQ

**O cliente edita algo no portal?** Não. É acompanhamento, download das entregas e envio de documentos.

**Por que o cliente não vê projeto de outra empresa?** O portal é limitado ao cadastro
de cliente vinculado à conta.
