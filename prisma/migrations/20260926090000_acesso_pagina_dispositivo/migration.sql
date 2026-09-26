-- Análise de uso: celular x computador (aditiva, nula nos registros antigos).
ALTER TABLE "acesso_pagina" ADD COLUMN IF NOT EXISTS "dispositivo" TEXT;
