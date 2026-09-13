---
titulo: Folha CLT
descricao: Folhas de pagamento dos colaboradores CLT — importação automática do PDF do contador, cálculo de encargos (INSS/IRRF) e assinatura obrigatória do holerite.
resumo: Importe a folha direto do PDF do contador (ou gere à mão), acompanhe os holerites e a assinatura de cada colaborador; o sistema calcula encargos progressivos (INSS e IRRF).
tags: [folha, clt, holerite, encargos, inss, irrf, pagamento, importar, assinatura, assinar, pdf, contador, rubrica, matrícula]
palavras-chave: [folha, clt, holerite, salário, encargos, inss, irrf, desconto, pagamento, importar, importação, pdf, contador, assinatura, assinar, rubrica, matrícula, lembrete]
sinonimos: [folha de pagamento, holerite, payroll, assinatura do holerite, importar folha]
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
  não.

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

**Assinei um holerite e o RH reabriu a folha depois — preciso assinar de novo?** Sim, se o
RH fechar a folha outra vez. Reabrir apaga a assinatura porque os valores podem ter mudado.
