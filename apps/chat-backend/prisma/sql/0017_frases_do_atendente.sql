-- Frases prontas por atendente: cada pessoa cadastra as próprias, e as do espaço
-- continuam compartilhadas. `owner_user_id` nulo = frase do espaço (as que já
-- existiam); preenchido = frase pessoal (id do usuário do Plane, como o resto do chat).

ALTER TABLE "chat_frases_prontas"
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "chat_frases_prontas_workspace_id_owner_user_id_ordem_idx"
  ON "chat_frases_prontas" ("workspace_id", "owner_user_id", "ordem");
