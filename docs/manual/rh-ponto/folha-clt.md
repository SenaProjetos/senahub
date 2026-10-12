---
titulo: Folha CLT
descricao: Folhas de pagamento dos colaboradores CLT — importação automática do PDF do contador, cálculo de encargos (INSS/IRRF) e assinatura do holerite.
resumo: Importe a folha direto do PDF do contador (ou gere à mão), acompanhe os holerites e a assinatura de cada colaborador; o sistema calcula encargos progressivos (INSS e IRRF).
tags: [folha, clt, holerite, encargos, inss, irrf, pagamento, importar, assinatura, assinar, pdf, contador, rubrica, matrícula, 13º salário, timbrado]
palavras-chave: [folha, clt, holerite, salário, encargos, inss, irrf, desconto, pagamento, importar, importação, pdf, contador, assinatura, assinar, rubrica, matrícula, lembrete, 13º, décimo terceiro, gratificação natalina, ignorar funcionário, timbrado]
sinonimos: [folha de pagamento, holerite, payroll, assinatura do holerite, importar folha, folha de 13º, décimo terceiro salário]
---

# Folha CLT

## Objetivo

Gerar e acompanhar as **folhas de pagamento** dos colaboradores CLT, com os **encargos**
calculados automaticamente — a partir do PDF que o contador já envia todo mês, ou lançada à
mão. Depois de fechada, cada colaborador **assina** o próprio holerite dentro do sistema.

## Como acessar

- Menu → **Folha CLT** (`/rh/folha`). Restrito aos **gestores de RH** (admin, supervisor,
  administrativo).

## Importar a folha do PDF do contador

Enquanto a folha está **aberta**, o botão **Importar PDF** lê o arquivo que o contador envia
todo mês e preenche os holerites automaticamente — sem digitar rubrica por rubrica.

- O sistema casa cada código de rubrica e cada matrícula do PDF com o cadastro já existente.
- **Rubrica ou matrícula que o sistema não reconhece:** nada é importado ainda — a tela mostra
  o que falta cadastrar:
  - **Rubrica nova:** vincule a uma rubrica já existente (ex.: o código mudou de descrição
    esse mês) ou cadastre uma nova, escolhendo se é **provento** ou **desconto**.
  - **Matrícula nova:** escolha a qual colaborador ela pertence, na lista de CLT já
    cadastrados.
  - **Pessoa que não vai usar o sistema** (ex.: um sócio com pró-labore que aparece no PDF,
    mas não tem login): clique em **Ignorar funcionário**. A partir daí, essa matrícula é
    deixada de fora de **todos** os imports — não vira holerite, não entra no total
    importado e não pede cadastro de novo. As matrículas ignoradas aparecem numa lista
    própria na mesma tela; **Voltar a pedir cadastro** desfaz a escolha.
  - Depois de resolver, **reenvie o mesmo arquivo** — o sistema processa de novo do zero.
- **Se um código ou matrícula estava vinculado à pessoa errada**, vincular ao certo **move**
  o vínculo — a tela avisa em destaque de quem ele saiu, porque isso significa que um
  pagamento anterior pode ter caído na ficha de outra pessoa.
- **Números que não fecham:** se a soma dos valores do PDF não bater com o total impresso
  nele, o import inteiro é recusado — nada fica gravado pela metade.
- Colaborador que já tinha holerite na folha e **não aparece** no PDF deste mês não é apagado
  — a tela avisa, e o holerite antigo continua como estava (pode ter saído, ou ter sido
  lançado à mão por outro motivo).
- O PDF original fica salvo e disponível para conferência.
- O **total líquido** mostrado ao fim do import é o que **entrou** no sistema — sem as
  matrículas ignoradas. Por isso pode ficar abaixo do total impresso no PDF.

- **Quem passa o mês inteiro de férias** vem no PDF do contador sem nenhuma rubrica e com
  totais zerados. Isso **não trava** o import: os demais holerites são gravados e essa pessoa
  aparece num aviso amarelo **"Lançar manualmente — sem movimento no PDF"**, para o RH lançar o
  holerite dela à mão.
- **Auxílio transporte e auxílio alimentação** (pagos pela empresa, não saem no holerite do
  contador): no editor do holerite há os botões **+ Auxílio transporte** e **+ Auxílio
  alimentação** (proventos). Reimportar o PDF **não apaga** esses dois itens. O **Calcular INSS/IRRF** deixa os
  dois fora da base.
- **INSS:** o cálculo automático trunca cada faixa no centavo, como o sistema do contador —
  antes arredondava e dava 1 ou 2 centavos a mais.

## Folha de 13º salário

O contador manda o **13º salário em um PDF separado** da folha do mês. No sistema, ele
também é uma **folha separada**: em **Nova folha**, escolha o tipo **13º salário**. Assim a
folha mensal de dezembro e a de 13º de dezembro existem lado a lado, cada uma com os seus
holerites e as suas assinaturas.

- A folha de 13º aparece na lista como **13º salário 12/2026**; o holerite dela sai com o
  título **Holerite de 13º salário**, e o colaborador vê isso na hora de assinar.
- **Trava contra PDF na folha errada:** se o PDF tiver rubrica de 13º (ex.: "13º Salário",
  "INSS 13º", "Gratificação natalina") e você estiver importando na folha **mensal**, o
  import é recusado e a tela diz em qual folha importar. O contrário também: PDF sem
  nenhuma rubrica de 13º numa folha de 13º é recusado.
- **Gerar automático** (cálculo pelo salário do cadastro) só existe na folha **mensal**. Na
  de 13º, importe o PDF do contador ou lance os itens à mão.

> **Atenção no primeiro 13º importado.** A trava reconhece o 13º **pelo nome da rubrica**,
> e ainda não foi testada com um PDF de 13º real do contador. No primeiro import de 13º,
> confira os holerites antes de fechar a folha. Se um PDF de 13º entrar na folha mensal por
> engano, os itens da mensal de quem está nesse PDF são substituídos. Com a folha ainda
> **aberta**, importar de novo o PDF mensal certo devolve os valores de quem está nele; item
> que tinha sido **lançado à mão** não volta e precisa ser lançado de novo. Avise o suporte,
> para a trava passar a reconhecer aquele nome de rubrica.

## O que a tela mostra

- Lista de **folhas** geradas, para consulta e gestão.
- Dentro de cada folha: um cartão por colaborador, com os itens do holerite, e — depois de
  **fechada** — se já foi **assinado** ou está **pendente**.
- O sistema calcula **INSS** e **IRRF** de forma **progressiva** (por faixas), conforme
  as regras vigentes (para holerite gerado automaticamente, sem PDF).

## Assinatura do holerite

Depois que a folha é **fechada**, cada colaborador precisa **assinar** o próprio holerite —
é a confirmação de que recebeu os valores. A assinatura **não atrasa nem trava o pagamento**:
a folha já fechou antes disso.

- **Para o colaborador:** se houver holerite fechado sem assinatura, a partir do **dia do
  pagamento da folha** (vencimento da conta a pagar; antes disso, ou seja, enquanto o RH ainda
  pode reabrir e corrigir, **não se cobra**) aparece uma **tarja
  amarela no topo do sistema** com o link **Conferir e assinar** — ela **não bloqueia nada**,
  dá para continuar trabalhando e assinar quando puder (ou escolher **Assinar depois** na tela
  de assinatura). A tela mostra os valores (proventos, descontos, líquido) e um botão para
  baixar o PDF. Havendo mais de um pendente, assina um de cada vez. Holerite de antes desta funcionalidade existir
  **não** entra nessa exigência — mas continua disponível para assinar por conta própria em
  **Minha conta** (menu lateral), se quiser.
- **Para o RH:** o ícone de sino ao lado de "assinatura pendente" envia um **lembrete** ao
  colaborador. Se ele tiver desativado avisos de pagamento, a tela avisa — o lembrete não é
  enviado silenciosamente.
- **Reabrir a folha** (para corrigir algo) **apaga as assinaturas** já feitas nela — quem
  já tinha assinado precisa assinar de novo quando a folha for fechada outra vez, porque os
  valores podem mudar na correção. O sistema avisa quantas assinaturas seriam perdidas antes
  de confirmar a reabertura. **Quem já tinha assinado vê o que mudou:** na nova assinatura, o
  holerite traz um quadro "corrigido pelo RH depois da sua assinatura de…" listando cada item
  incluído, removido ou alterado (valor antes → depois) e o líquido antes → depois. Se a folha
  foi só reaberta e fechada sem mudar valores, o quadro diz isso. Na ficha (**Minha conta**), um holerite corrigido mostra **Ver o que mudou e assinar**, que
  leva a essa mesma tela.
- **Fechar a folha mensal define o valor da conta do mês** no Financeiro: o líquido real vai para a conta
  a pagar da competência (a que a recorrência gerou, ou uma nova), que vence no 5º dia útil do mês
  seguinte e **continua em aberto** até ser paga no Financeiro. O adiantamento de salário é outra conta e
  não muda. A mensagem do fechamento diz o valor e o vencimento. Reabrir não mexe na conta; com ela já
  paga, reabrir é recusado. Detalhes em
  [Sócios, pró-labore e compromissos recorrentes](../financeiro/socios-e-recorrentes.md#folha-clt-fechar-define-o-valor-pagar-é-outro-passo).
- O **PDF do holerite** pode ser baixado tanto pelo colaborador quanto pelo RH, assinado ou
  não. Ele sai com o **timbrado da empresa** (logo, razão social, CNPJ e endereço) no topo,
  configurado em [Configurações → Empresa](../sistema/configuracoes.md#sistema).

## Fechar a folha: o que vai para o Financeiro

Ao fechar, a folha lança no Financeiro **contas a pagar em aberto** — fechar **não paga**:

- **Líquido dos CLT**, em Salários, no prazo do salário (5º dia útil do mês seguinte, contando o sábado).
- **Bolsa dos estagiários**, em Bolsa, no mesmo prazo.
- **INSS descontado**, **IRRF descontado** e **FGTS**, no **dia 20 do mês seguinte** (se não for dia útil,
  antecipa para o dia útil anterior). Os valores vêm do relatório do contador; o import do PDF já os preenche, e
  o cartão **Guias do mês** permite corrigir com a folha aberta. Campo vazio = a parte não é lançada.
  Na **folha de 13º**, o INSS e o IRRF vencem no **dia 20 de dezembro** (o próprio mês); o FGTS segue no mês seguinte.
- **Vale-transporte** e **vale-refeição** (benefícios da tabela de encargos), somados de todos os CLT.
- **Taxa do agente de integração (IEL)**: a taxa da tabela de encargos do estágio × os estagiários contratados pelo IEL
  que estão na folha, em "Taxa do agente (IEL)", no prazo do salário — o mesmo valor que entra no custo da hora. Se o
  boleto do IEL vier diferente, ajuste a conta no Financeiro.

Fechar de novo atualiza as **mesmas contas** enquanto estão em aberto; conta já paga não é mexida (o aviso
conta a diferença); uma parte que saiu da folha tem a conta **cancelada**, não apagada. O bloco **Contas
lançadas no Financeiro** da folha fechada mostra cada conta com a situação (em aberto, paga) e abre o lançamento.

O bloco **Custo total da folha** soma, por pessoa, o salário, os encargos da empresa e os benefícios, pela
mesma tabela de encargos do rateio de horas. Só aparece na folha mensal.

### Reabrir a folha

**Reabrir** pede um **motivo** (10 caracteres ou mais) e é recusado se **qualquer** conta lançada já foi paga —
estorne o pagamento no Financeiro antes. As contas em aberto continuam e o próximo fechamento atualiza **as mesmas**
(inclusive na folha de 13º). Se depois da reabertura a folha ficar sem nenhum CLT, a conta do líquido é cancelada no
próximo fechamento. Conta que está aguardando aprovação no Financeiro não é mexida: o fechamento avisa.
Reabrir cancela as assinaturas dos holerites, mas a **versão que cada pessoa assinou fica guardada** (em
"Versões assinadas" do holerite, com a data e o motivo), e a reabertura entra no histórico da folha.

## Permissões

- Import, cadastro de rubrica/matrícula e lembrete: restrito a **HR_ADMIN_ROLES**.
- Assinar: qualquer colaborador assina só o **próprio** holerite — não depende de permissão.

## Funcionalidades relacionadas

- [Funcionários](funcionarios.md) · [RH — administração](rh-admin.md) · [Financeiro](../financeiro/README.md)

## FAQ

**O cálculo de INSS/IRRF é automático?** Sim — progressivo, por faixas, quando o holerite é
gerado automaticamente. Quando vem do PDF do contador, os valores são os que o próprio PDF
traz.

**PJ tem holerite?** Não. Prestadores PJ recebem por **nota fiscal**; holerite é só para
CLT. Veja [Pessoas Jurídicas](pessoas-juridicas.md).

**Preciso escolher o arquivo de novo depois de cadastrar a rubrica/matrícula que faltava?**
Não — a tela guarda o mesmo arquivo, é só clicar em **Reenviar arquivo**.

**Posso adiar a assinatura do holerite?** Pode. Nada trava: a tarja no topo do sistema fica
lembrando enquanto houver holerite pendente, e você assina quando quiser.

**Por que o total importado é menor que o total do PDF?** Porque as matrículas marcadas
como **Ignorar funcionário** ficam de fora. O total do PDF inclui todo mundo que o contador
listou.

**Como importo o 13º salário?** Crie uma folha nova do tipo **13º salário** para o mesmo
mês e importe o PDF de 13º nela — não na folha mensal. Veja
[Folha de 13º salário](#folha-de-13º-salário).

**Assinei um holerite e o RH reabriu a folha depois — preciso assinar de novo?** Sim, se o
RH fechar a folha outra vez. Reabrir apaga a assinatura porque os valores podem ter mudado.

## Custo da hora e encargos

Desde outubro de 2026, o custo de uma hora de trabalho é o **custo do mês da pessoa dividido pelas horas que ela marcou no ponto**.

- **Custo do mês:** o salário do holerite (ou, sem holerite, o do histórico contratual) mais os encargos da tabela da contratação: FGTS, reservas de 13º, férias e aviso prévio, multa do FGTS e os benefícios (vale-transporte e vale-refeição).
- **Estagiário:** bolsa, reserva do recesso e a taxa do IEL (só de quem foi contratado pelo IEL).
- **Sócio:** o pró-labore dividido pela jornada de referência. O que ele não apontar em projeto fica em "não alocado".
- **PJ e freelancer:** entram só com horas; o custo vem da Produção.

As tabelas ficam em **RH → Encargos da empresa**. Cada mudança é uma versão nova que vale a partir de um mês; os meses anteriores continuam com a versão da época. Uma versão já usada no fechamento de um mês não pode ser excluída.

No fechamento do mês (Ponto → Rateio), o custo que não foi para projeto nenhum aparece na linha **Não alocado**. Os meses fechados antes de outubro de 2026 continuam com o cálculo antigo.
