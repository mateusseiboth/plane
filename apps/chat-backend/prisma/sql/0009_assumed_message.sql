-- Aviso ao cliente quando um atendente assume a conversa.
--
-- Até aqui o "<Atendente> iniciou o atendimento." era um evento interno: quem
-- estava do outro lado no WhatsApp não recebia nada e continuava sem saber se
-- tinha alguém ali. Agora a frase é enviada ao cliente e o texto é editável,
-- como as demais mensagens do robô. `{attendant}` vira o nome de quem assumiu.
ALTER TABLE "chat_bot_config"
  ADD COLUMN IF NOT EXISTS "assumed_message" TEXT NOT NULL
  DEFAULT '{attendant} entrou no atendimento e vai te ajudar a partir de agora.';
