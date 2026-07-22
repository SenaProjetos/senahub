---
titulo: Guia do Comercial para iniciantes
descricao: Explicação para quem nunca trabalhou com vendas — o vocabulário, as telas e o caminho natural do lead ao projeto.
resumo: Guia de formação (não de referência) para quem é leigo em processo comercial. Explica o que são lead, cliente, funil, proposta e disciplina, como as telas se encadeiam e o caminho típico do primeiro contato até o projeto criado.
tags: [comercial, guia iniciante, formação, lead, funil, proposta, glossário]
palavras-chave: [guia iniciante, comercial para leigos, o que é lead, o que é proposta, como funciona o funil, treinamento comercial]
sinonimos: [tutorial comercial, onboarding comercial, primeiros passos no comercial]
---

# Guia do Comercial para iniciantes

> **Este guia é diferente do [Comercial (funil, propostas, tabelas, metas)](comercial.md).**
> Aquela página é a **referência**: permissões, regras de negócio, tabela de erros.
> Esta aqui é a **formação**: para quem nunca trabalhou com vendas e precisa entender
> o vocabulário e o caminho natural antes de operar o sistema. Leia este primeiro.

## A ideia em 30 segundos

O comercial é a parte do escritório que **encontra clientes e fecha trabalho**. Todo o
módulo existe para acompanhar uma pessoa interessada até ela virar um contrato — e
transformar esse contrato num projeto que a equipe vai executar.

O caminho, sempre da esquerda para a direita:

**Lead** (contato interessado) → **Funil** (você acompanha e avança) → **Proposta**
(preço e escopo por escrito) → **Aceite** (o cliente diz sim) → **Projeto** (vira
trabalho da equipe).

Cada tela do módulo cuida de um pedaço desse caminho.

## O vocabulário do comercial

- **Lead** — uma pessoa ou empresa que **demonstrou interesse**, mas ainda não fechou
  nada. Guarda nome, telefone, e-mail, a *origem* (por onde chegou) e um *valor
  estimado* do negócio. Ainda não é cliente — é um cliente *em potencial*.
- **Cliente** — um cadastro **oficial** de pessoa ou empresa com quem o escritório faz
  negócio. Quando um lead evolui, ele *vira cliente* (o sistema copia os dados sozinho,
  sem redigitar). Propostas e projetos são sempre ligados a um cliente.
- **Funil de vendas** — um **quadro visual** com colunas, onde cada lead é um cartão.
  As colunas são as *etapas*. Você arrasta o cartão de uma coluna para a outra conforme
  o negócio avança. Chama-se "funil" porque entram muitos contatos no topo e poucos
  fecham no fim.
- **Etapa** — cada **coluna** do funil, um estágio do relacionamento (ex.: Novo, Em
  contato, Negociação, Ganho, Perdido). Configuráveis pelo administrador. Ao mover um
  lead para uma etapa de *perda*, o sistema **exige o motivo**.
- **Origem** — de onde o contato veio: indicação, site, feira, redes sociais. Serve para
  descobrir o que traz mais negócio.
- **Proposta** — o **documento formal** que apresenta ao cliente o que será feito e por
  quanto. Recebe um número automático como `PR-260001`. É composta por *itens* (as
  disciplinas e seus valores), *condições de pagamento*, prazo de validade e
  observações.
- **Disciplina** — cada **frente de trabalho de engenharia** vendida (ex.: Estrutural,
  Hidrossanitário, Elétrico, Arquitetura). Na proposta, cada disciplina é um item com
  seu próprio valor. Somadas, dão o total.
- **Tabela de preço** — uma lista de **preço por metro quadrado** (`R$/m²`) para cada
  disciplina. O sistema usa ela para calcular o valor sozinho: você informa a área do
  projeto, aplica a tabela, e ele preenche `R$/m² × área` em cada item.
- **Condição de pagamento** — como o cliente vai pagar: entrada, parcelas, saldo na
  entrega. Cada condição é uma linha em **porcentagem (%)** ou em **valor fixo (R$)**.
- **Aceite** — o momento em que o cliente **aprova a proposta**. Apertar
  *Aceitar → projeto* cria o **projeto** com todas as disciplinas, abre os canais de
  **chat** da equipe e avisa os gestores. É a fronteira entre "vender" e "produzir".
- **Follow-up** — o ato de **retomar o contato** com um lead que ainda não respondeu.
  Agendar um follow-up cria um compromisso na *Agenda* para não esquecer.
- **Meta comercial** — o **alvo de faturamento do mês**, em reais. Comparado ao
  *realizado* (soma das propostas aceitas no mês).
- **Pipeline** — o **conjunto de negócios em aberto** e o valor total que eles
  representam. "Pipeline de R$ 500 mil" = meio milhão em negociações que ainda podem
  fechar.

## Cada tela, para que serve

| Tela | Rota | Para que serve |
| --- | --- | --- |
| Painel do Comercial (funil) | `/comercial` | Entrada do módulo: meta × realizado do mês, propostas aceitas, leads ativos, e o quadro do funil. Aqui você cria leads e arrasta cartões entre etapas. |
| Detalhe do lead | `/comercial/{lead}` | Ficha completa: dados, histórico de atividades, propostas ligadas. Ações: editar, agendar follow-up, **nova proposta**, virar cliente, arquivar. |
| Oportunidades | `/comercial/oportunidades` | Lista mais enxuta dos negócios em aberto, com responsável e valor — ver seção [Funil e Oportunidades](#funil-e-oportunidades-por-que-existem-os-dois) abaixo. |
| Tabelas de preço | `/comercial/tabelas` | Onde se define o preço por m² de cada disciplina, usado nos cálculos automáticos das propostas. |
| Propostas — lista | `/comercial/propostas` | Relação de todas as propostas, com número, cliente, total, status e quantas vezes cada uma foi aberta pelo cliente. |
| Editor da proposta | `/comercial/propostas/{id}` | Onde se monta a oferta: itens, condições, envio, aceite. O coração do módulo. |
| Página pública da proposta | `/a/proposta/{token}` | O que o **cliente** vê ao abrir o link — sem login. Mostra disciplinas, total, condições; permite baixar PDF e enviar documentos. |

Detalhe de campos, permissões e regras de cada tela: veja [Comercial — referência](comercial.md).

## O caminho natural, passo a passo

1. **Registre o lead** (`/comercial`) — chegou um interessado? Clique em *Novo lead* e
   preencha nome, contato e, se souber, origem e valor estimado. Ele nasce na primeira
   etapa do funil.
2. **Trabalhe o relacionamento** (cartão do lead) — ligue, responda, mande material. A
   cada interação, registre uma **nota** no histórico; se precisar retomar depois,
   **agende um follow-up**. Conforme avança, arraste o cartão para a etapa seguinte.
3. **Tenha a tabela de preço pronta** (`/comercial/tabelas`, uma vez só) — garanta que
   exista uma tabela com o `R$/m²` de cada disciplina. É ela que calcula os valores
   automaticamente.
4. **Monte a proposta** — na ficha do lead, clique em *Nova proposta*. O sistema cria o
   cliente automaticamente (se o lead ainda não tiver um) e já vincula a proposta ao
   lead. No editor: informe a área, adicione as disciplinas, clique em *Aplicar* para
   calcular os preços, defina as condições de pagamento e a validade. Salve.
5. **Envie ao cliente** — por e-mail ou compartilhando o link/PDF. O status vira
   *enviada*. Quando o cliente abrir, o contador de aberturas mostra que ele está
   olhando.
6. **Feche o negócio** — cliente aprovou? Clique em *Aceitar → projeto*. O sistema cria
   o projeto com as disciplinas, abre os canais de chat e avisa os gestores. Se não
   avançou, use *Recusar*.
7. **Vira produção** — a partir do aceite, o trabalho sai do comercial e entra na
   execução, já como projeto ativo.

> Nada é redigitado: os valores da proposta viram as disciplinas do projeto, o cliente
> já está cadastrado, e a equipe começa com o chat pronto.

### Criar a proposta a partir do lead (recomendado)

O botão **Nova proposta** na ficha do lead (`/comercial/{lead}`) é o caminho
recomendado, porque resolve duas coisas de uma vez:

- Se o lead **ainda não é cliente**, o sistema cria o cadastro do cliente sozinho
  (copiando nome, e-mail, telefone e observações do lead) antes de criar a proposta.
- A proposta nasce **vinculada ao lead** — por isso a ficha do lead e o cartão do funil
  passam a mostrar as propostas geradas a partir dele.

Também é possível criar uma proposta "avulsa" em *Propostas → Nova proposta*, escolhendo
o cliente na mão — mas nesse caminho a proposta não fica ligada a nenhum lead.

## Funil e Oportunidades: por que existem os dois

O módulo tem **dois lugares** que acompanham negócios em aberto. À primeira vista
parecem repetidos — a diferença está no que cada um prioriza:

- **Funil de vendas** (`/comercial`) — visão **visual** (quadro de arrastar), centrada
  no *lead* e no relacionamento. É onde nascem os contatos, ficam as notas, os
  follow-ups, e de onde saem as propostas. **Use como base do dia a dia.**
- **Oportunidades** (`/comercial/oportunidades`) — visão em **lista**, mais leve, com
  *responsável* por negócio e o valor total do pipeline. Boa para uma reunião de
  acompanhamento rápida.

Para não duplicar trabalho, combine com a equipe **um** como oficial. O Funil costuma
ser a melhor escolha porque conecta direto com propostas e clientes; deixe
Oportunidades para quando quiser a lista com responsável e o valor de pipeline num
relance.

## Dúvidas comuns de quem está começando

- **Qual a diferença entre lead e cliente?** Lead é o interessado (ainda pode não
  fechar). Cliente é o cadastro oficial de quem já faz negócio. Um lead que fecha *vira*
  cliente.
- **Não consigo editar uma proposta.** Proposta *aceita* fica travada — já virou
  projeto. Use *Copiar* para partir de uma cópia.
- **O preço não calculou sozinho.** O cálculo automático precisa de duas coisas: a área
  em m² preenchida e uma tabela de preço selecionada.
- **O cliente vê os preços por dentro?** Não. Na página pública o cliente vê o valor por
  disciplina e o total, não a composição interna de cada cálculo.
- **Como sei se o cliente olhou a proposta?** O contador de *aberturas* conta cada vez
  que o link público é aberto — um bom sinal para um follow-up.
- **Movi para "Perdido" e pediu motivo — é normal?** Sim, de propósito. Registrar por
  que se perde um negócio (preço, prazo, concorrente) ajuda o time a melhorar.

Erros com mensagem específica do sistema (ex.: permissão negada): veja a tabela de
[erros e soluções](comercial.md#erros-possíveis-e-soluções) na página de referência.

## Relacionados

- [Comercial — referência completa](comercial.md) (permissões, regras, erros)
- [Clientes](clientes.md)
- [Projetos](../projetos/projetos.md) — para onde a proposta aceita vira trabalho
- [Glossário geral do sistema](../glossary.md)
