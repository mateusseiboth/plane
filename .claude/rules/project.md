# Arquitetura

## Backend Atual

O backend oficial do projeto é implementado em Typescript.

Toda nova funcionalidade, correção, refatoração ou melhoria deve ser realizada exclusivamente na implementação Typescript.

## Código Legado Django

A pasta `api/` contém a antiga implementação em Django/Python.

Essa estrutura foi mantida apenas como referência para consulta de regras de negócio, comportamento legado, endpoints e processos já existentes.

### Regras

- Não criar novos códigos em Django.
- Não corrigir bugs na implementação Django.
- Não adicionar endpoints Django.
- Não gerar migrations Django.
- Não alterar models Django, exceto quando explicitamente solicitado.
- Considerar o código Django como somente leitura.
- Utilizar o código Django apenas para entender comportamentos legados durante a migração ou implementação em Typescript.

### Ao analisar o projeto

Quando houver implementações equivalentes em Django e Typescript:

1. Considere a implementação Typescript como a fonte da verdade.
2. Utilize o código Django apenas para consulta histórica.
3. Nunca proponha soluções baseadas em expandir ou continuar a arquitetura Django.
4. Toda nova implementação deve seguir os padrões atuais do projeto em Typescript.
