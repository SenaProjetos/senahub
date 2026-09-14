---
titulo: Folha CLT
descricao: Folhas de pagamento dos colaboradores CLT — importação automática do PDF do contador, cálculo de encargos (INSS/IRRF) e assinatura obrigatória do holerite.
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

- **Para o colaborador:** se houver holerite fechado sem assinatura, o sistema pede a
  assinatura **no próximo acesso**, antes de liberar o resto das telas — mostra os valores
  (proventos, descontos, líquido) e um botão para baixar o PDF. Havendo mais de um pendente,
  assina um de cada vez até não sobrar nenhum. Holerite de antes desta funcionalidade existir
  **não** entra nessa exigência — mas continua disponível para assinar por conta própria em
  **Minha conta** (menu lateral), se quiser.
- **Para o RH:** o ícone de sino ao lado de "assinatura pendente" envia um **lembrete** ao
  colaborador. Se ele tiver desativado avisos de pagamento, a tela avisa — o lembrete não é
  enviado silenciosamente.
- **Reabrir a folha** (para corrigir algo) **apaga as assinaturas** já feitas nela — quem
  já tinha assinado precisa assinar de novo quando a folha for fechada outra vez, porque os
  valores podem mudar na correção. O sistema avisa quantas assinaturas seriam perdidas antes
  de confirmar a reabertura.
- O **PDF do holerite** pode ser baixado tanto pelo colaborador quanto pelo RH, assinado ou
  não. Ele sai com o **timbrado da empresa** (logo, razão social, CNPJ e endereço) no topo,
  configurado em [Configurações → Empresa](../sistema/configuracoes.md#sistema).

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

**Posso adiar a assinatura do holerite?** A folha fechada não trava por causa disso, mas o
sistema pede a assinatura assim que você tentar usar o sistema de novo — não dá para navegar
sem assinar o que estiver pendente.

**Por que o total importado é menor que o total do PDF?** Porque as matrículas marcadas
como **Ignorar funcionário** ficam de fora. O total do PDF inclui todo mundo que o contador
listou.

**Como importo o 13º salário?** Crie uma folha nova do tipo **13º salário** para o mesmo
mês e importe o PDF de 13º nela — não na folha mensal. Veja
[Folha de 13º salário](#folha-de-13º-salário).

**Assinei um holerite e o RH reabriu a folha depois — preciso assinar de novo?** Sim, se o
RH fechar a folha outra vez. Reabrir apaga a assinatura porque os valores podem ter mudado.
