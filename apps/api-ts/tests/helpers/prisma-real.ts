/**
 * O Prisma de verdade, mesmo quando `@db` está trocado por um dublê.
 *
 * `auth-middleware.test.ts` usa `mock.module("@db", …)` para testar o middleware
 * sem banco. Esse mock reescreve as ligações vivas de TODOS os importadores —
 * inclusive as dos helpers de teste — e `mock.restore()` NÃO o desfaz. O
 * sintoma era `prisma.user.create is not a function` em arquivos carregados
 * depois, uma falha que aparecia e sumia conforme a ordem dos testes.
 *
 * O cliente verdadeiro fica em `globalThis.__prisma` (ver src/db.ts), e o dublê
 * nunca escreve ali. A infraestrutura de teste lê de lá; o código de produção
 * continua importando `@db` normalmente, que é o que permite mockar.
 */
import prisma from "@db";

export const prismaReal = (): typeof prisma => ((globalThis as any).__prisma ?? prisma) as typeof prisma;
