# Anexo D — Celesc

Valores literais das normas, "a conferir" até a validação.

## 1. Documentos e edições
| Documento | Edição | Conteúdo usado |
|---|---|---|
| N-321.0003 | dez/2023 (Res. DCL 235/2023, 19/12/2023) | Edificações de uso coletivo: método de demanda e atendimento |
| I-321.0043 | Res. DCL 136/2025, 31/10/2025 | Recarga de veículos elétricos |
| N-321.0001 | rev. dez/2025 | Baixa tensão (identificada; tabelas de demanda individual não lidas) |
| N-321.0002 | edição maio/2016, enviada pelo usuário; sem versão mais recente localizada | Média tensão, individuais acima de 75 kW (não lida a fundo) |

## 2. Método de demanda — empreendimento residencial (N-321.0003, 5.6.2)
- DP = k · (D1 + D2) + De + Ds, com k = 1,2 para todas as edificações (aplicado a apartamentos e condomínio).
- D1 = F · Da. F: Tabela 01 (nº de apartamentos; 2 = 2,00 e 3 = 3,00). Da: Tabela 02 (por m² exato, até 400 m²; usar 1,57 kVA para áreas inferiores a 70 m²). Acima de 400 m²: Da = 0,034939 × A^0,895075.
- D2 = Di + Dt + Dm. Di: iluminação das áreas comuns, 100% nos 10 kW iniciais e 25% no restante, FP 0,90. Dt: tomadas de uso geral, 20%, FP 0,90. Dm: motores, Tabela 04.
- De: cargas especiais (centrais de refrigeração ou aquecimento, iluminação de quadras, saunas, recarga etc.), FD 100%, fora do k.
- Ds: comercial (salas, lojas), Tabelas 05, 06 e 07, fora do k.
- Apartamentos de áreas diferentes: média ponderada (ex.: 20 de 100 m² e 16 de 80 m² = 36 de 91,1 m²).
- O projetista pode adotar outro critério, desde que não dê demanda inferior ao da norma, e deve apresentar o cálculo da norma (5.6.1.2 e 5.6.1.3). Vários blocos: soma das demandas de cada bloco (5.6.1.5).

## 3. Tabelas (estrutura)
| Tabela | Chave | Resultado |
|---|---|---|
| 01 | nº de apartamentos | F |
| 02 | área útil em m² | kVA por unidade |
| 04 | potência e quantidade de motores | kVA |
| 05 | tipo de uso | FD em %: lojas e bancos 75; auditório, barbearia, clubes, garagens, igrejas e restaurantes 90; escolas 90 nos 12 kW iniciais e 50 acima; escritórios 90 nos 20 kW iniciais e 70 acima; hospitais 40 nos 50 kW iniciais e 20 acima; hotéis 60 nos 20 kW iniciais e 40 acima |
| 06 | aparelhos de aquecimento por nº (nota 3: hotel, motel e apart-hotel, FD pelo projetista, recomendável próximo a 100%) | FD |
| 07 | ar-condicionado | FD |

## 4. Atendimento (5.3.4)
- Demanda provável até 300 kVA: pode ser baixa tensão, após avaliação da Celesc; ramal aéreo multiplexado até 145 kVA (alumínio) ou 131 kVA (cobre); entre esses valores e 300 kVA, ou em rede subterrânea, ramal de entrada subterrâneo.
- Acima de 300 kVA, ou sem condição técnica em baixa tensão: média tensão, com reserva de espaço para subestação abrigada.
- Subestação com potência de transformação até 300 kVA e acima de 300 kVA tem proteção distinta (5.10.1 e 5.10.2).

## 5. Recarga (I-321.0043)
Sem gerenciador de demanda, a estação é carga especial com FD = 1 (5.5.1); com controle, entra a demanda gerenciada (5.5.2). Em coletivas com demanda até 300 kVA em baixa tensão, admite-se unidade adicional do condomínio para recarga com demanda máxima de 75 kVA (5.4.3.1). Pedido acima de 75 kVA: projeto em média tensão (5.7.4). Condomínio acima de 75 kW em média tensão: transformador exclusivo (5.4.3.2).

## 6. Divergência a conferir
Tabela 01, 203 apartamentos: 80,89 (a sequência e as demais trazem 80,99).
