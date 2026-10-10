-- Papel Estagiário na linha da EAP (reunião de 08/10/2026). ADD VALUE sozinho no arquivo: não roda dentro de transação com uso do valor.
ALTER TYPE "PapelEap" ADD VALUE IF NOT EXISTS 'est';
