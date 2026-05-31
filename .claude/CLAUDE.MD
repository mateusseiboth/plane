⚠️ IMPORTANTE

Este projeto NÃO utiliza mais Django em produção.

A pasta `api/` contém apenas código legado para consulta.

Toda implementação deve ser feita na arquitetura Typescript atual.
Nunca sugerir novas soluções baseadas em Django.

A pasta api-ts é a reimplementação da api em django. A API em django possui os contratos de API, os tipos, os retornos e tudo como funcionava antes. Qualquer endpoint faltante, tipo incorreto e etc deve ser conferido na API antiga e no Frontend.

Estamos além de tudo adicionando recursos então nem sempre o recurso irá existir na API original.

Sempre que criarmos um recurso novo, o backend e o frontend devem ser feitos juntos, garantindo que o recurso possa ser testado sem que precise informar novos comandos para criar o frontend.

Você deve seguir o padrão visual já existente. Sempre que passar em uma tela e ver algo indicando planos e pagamentos você deve remover esse pedaço e implementar o recurso para que ele esteja de fato disponível pois estamos recriando recursos premium na aplicação.

Sempre confira a tipagem dos componentes para evitar deixar tipos errados ou props invalidas no frontend.

Sempre gere arquivos de memória com a arquitetura criada, na pasta .claude DO PROJETO para que uso em outras IDEs consigam aproveitar a memória gerada.

Sempre adicione seu conhecimento adquirido do projeto na pasta do projeto para que seja mais rápido para outros agents de IA lerem e entenderem os escopos do projeto.
