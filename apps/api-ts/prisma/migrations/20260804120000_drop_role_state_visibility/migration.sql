-- Visibilidade de quadro por papel foi removida do produto.
--
-- Antes, um papel com linhas em role_state_visibility só enxergava as etapas
-- listadas: o TI, por exemplo, não via nada em Triagem. Agora quem participa do
-- projeto vê todos os chamados em qualquer etapa, e o recorte por setor é feito
-- por FILTRO (a UI traz templates prontos). O que o papel ainda controla é para
-- onde ele pode MOVER um chamado (role_state_transitions, preservada).
DROP TABLE IF EXISTS "role_state_visibility";
