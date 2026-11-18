# Pacote de implementação: Calculadora de cargas e demanda (SenaHub)

Data: 10/11/2026. Responsável pelo conteúdo: Tadrio, Sena Projetos.

## Ordem de leitura
1. `especificacao-calculadora-cargas-demanda.md`: documento principal (o que a calculadora faz, entradas, fórmulas, alertas, saídas, hipóteses e dúvidas em aberto).
2. `anexo-A-neoenergia.md` a `anexo-G-energisa.md`: método de demanda, tabelas, limites de atendimento e recarga de cada concessionária.
3. `casos-de-teste-demanda-preliminar.xlsx`: 31 casos de teste. Pendente: 4 células amarelas do caso 29.
4. `relatorio-exemplo-calculadora.docx` e `.xlsx`: modelo visual do relatório com os dados do exemplo de 3 CMDs.
5. Desenho das telas (canvas com 11 telas). Está no Claude e é privado até o autor compartilhar: https://claude.ai/artifact/AntWYudaqpFB9uFz8jQebQ
6. PDFs das normas e dos catálogos citados nos anexos (não estão neste pacote; vêm à parte).

## Regras principais, em uma linha cada
- A tela mostra só o que o projetista preenche e os valores sugeridos; a fonte de cada valor vai só no relatório. Exceção: aviso de edição da norma.
- Cada concessionária usa só o seu método e os seus valores, literais das normas.
- Cálculo em precisão total, 2 casas decimais na exibição, tolerância de ±0,01 nos testes.
- CMD: demanda da soma do que há nele, com a quantidade de apartamentos do CMD. CPG: soma de tudo, com o total de apartamentos.
- Disjuntor sugerido: menor valor da série maior ou igual a Ib; adotado digitado. Seção sem queda de tensão.
- Relatório em Word e Excel, com bloco do responsável técnico (CREA).

## O que a equipe de desenvolvimento decide
Como carregar as tabelas das normas na biblioteca (cada tabela guarda norma, edição e vigência), como implementar o arrastar de linhas e a organização dos módulos. Melhorias depois dos primeiros testes entram pelo Suporte (categoria Sugestão) e erros pela categoria Erro.
