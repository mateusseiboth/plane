/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TApiDaReferencia,
  TCampoDaReferencia,
  TConstanteDaReferencia,
  TFuncaoDaReferencia,
  TReferencia,
  TTipoDaReferencia,
} from "@mateusseiboth/widgets-aviao/referencia-tipos";
import { BlocoDeCodigo, Pilula, Secao, Tabela, TextoComCodigo } from "@/components/developers/widgets/blocos";

type TVisivel = (id: string) => boolean;

function Descricao({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <p className="whitespace-pre-line">
      <TextoComCodigo texto={texto} />
    </p>
  );
}

function TabelaDeCampos({ campos }: { campos: TCampoDaReferencia[] }) {
  if (campos.length === 0) return null;
  return (
    <Tabela
      cabecalhos={["Campo", "Tipo", "Obrigatório", "Descrição"]}
      linhas={campos.map((campo) => [
        <Pilula key="nome">{campo.nome}</Pilula>,
        <Pilula key="tipo">{campo.tipo}</Pilula>,
        campo.obrigatorio ? "Sim" : "Não",
        <TextoComCodigo key="descricao" texto={campo.descricao} />,
      ])}
    />
  );
}

/** Hook, função ou método: assinatura, descrição, parâmetros, retorno, permissão e exemplo. */
function CartaoDeFuncao({ funcao, ancora }: { funcao: TFuncaoDaReferencia; ancora?: string }) {
  return (
    <article id={ancora} className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-subtle p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-15 font-semibold text-primary">{funcao.nome}</h3>
        {funcao.permissao && <Pilula>{funcao.permissao}</Pilula>}
      </header>
      <BlocoDeCodigo codigo={funcao.assinatura} />
      <Descricao texto={funcao.descricao} />
      {funcao.parametros.length > 0 && (
        <Tabela
          cabecalhos={["Parâmetro", "Tipo", "Descrição"]}
          linhas={funcao.parametros.map((parametro) => [
            <Pilula key="nome">{`${parametro.nome}${parametro.opcional ? "?" : ""}`}</Pilula>,
            <Pilula key="tipo">{parametro.tipo}</Pilula>,
            <TextoComCodigo key="descricao" texto={parametro.descricao} />,
          ])}
        />
      )}
      <p>
        <span className="font-medium text-primary">Retorno:</span> <Pilula>{funcao.retorno.tipo}</Pilula>
        {funcao.retorno.descricao && (
          <>
            {" "}
            <TextoComCodigo texto={funcao.retorno.descricao} />
          </>
        )}
      </p>
      {funcao.exemplo && <BlocoDeCodigo rotulo="Exemplo" codigo={funcao.exemplo} />}
    </article>
  );
}

function CartaoDeApi({ api }: { api: TApiDaReferencia }) {
  return (
    <article id={`api-${api.nome}`} className="flex scroll-mt-6 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-16 font-semibold text-primary">{api.nome}</h3>
        {api.permissao ? <Pilula>{api.permissao}</Pilula> : <span className="text-12">Sem permissão</span>}
      </header>
      <Descricao texto={api.descricao} />
      {api.metodos.map((metodo) => (
        <CartaoDeFuncao key={metodo.nome} funcao={metodo} />
      ))}
    </article>
  );
}

function CartaoDeTipo({ tipo }: { tipo: TTipoDaReferencia }) {
  return (
    <article id={`tipo-${tipo.nome}`} className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-subtle p-4">
      <h3 className="font-mono text-15 font-semibold text-primary">{tipo.nome}</h3>
      <BlocoDeCodigo codigo={tipo.definicao} />
      <Descricao texto={tipo.descricao} />
      {tipo.valores.length > 0 && (
        <p className="flex flex-wrap items-center gap-1">
          <span className="font-medium text-primary">Valores aceitos:</span>
          {tipo.valores.map((valor) => (
            <Pilula key={valor}>{valor}</Pilula>
          ))}
        </p>
      )}
      <TabelaDeCampos campos={tipo.campos} />
    </article>
  );
}

function CartaoDeConstante({ constante }: { constante: TConstanteDaReferencia }) {
  return (
    <article
      id={`constante-${constante.nome}`}
      className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-subtle p-4"
    >
      <h3 className="font-mono text-15 font-semibold text-primary">{constante.nome}</h3>
      <Descricao texto={constante.descricao} />
      <BlocoDeCodigo rotulo="Valor" codigo={JSON.stringify(constante.valor, null, 2)} />
    </article>
  );
}

/** Hooks, APIs, funções, tipos e constantes, cada item filtrado pela busca. */
export function SecoesDaApi({ referencia, isVisivel }: { referencia: TReferencia; isVisivel: TVisivel }) {
  return (
    <>
      {isVisivel("hooks") && (
        <Secao id="hooks" titulo="Hooks">
          <p>
            Hooks React para ler dados no componente. Todos devolvem{" "}
            <Pilula>{"{ data, loading, error, refetch }"}</Pilula> e refazem a consulta quando os filtros mudam. Cada um
            exige a permissão indicada no manifesto.
          </p>
          {referencia.hooks
            .filter((hook) => isVisivel(`hook-${hook.nome}`))
            .map((hook) => (
              <CartaoDeFuncao key={hook.nome} funcao={hook} ancora={`hook-${hook.nome}`} />
            ))}
        </Secao>
      )}
      {isVisivel("apis") && (
        <Secao id="apis" titulo="APIs">
          <p>
            As mesmas consultas dos hooks como funções assíncronas, mais armazenamento local, avisos e interface. Use
            fora de componentes ou quando precisar controlar quando a chamada acontece.
          </p>
          {referencia.apis
            .filter((api) => isVisivel(`api-${api.nome}`))
            .map((api) => (
              <CartaoDeApi key={api.nome} api={api} />
            ))}
        </Secao>
      )}
      {isVisivel("funcoes") && (
        <Secao id="funcoes" titulo="Funções">
          {referencia.funcoes
            .filter((funcao) => isVisivel(`funcao-${funcao.nome}`))
            .map((funcao) => (
              <CartaoDeFuncao key={funcao.nome} funcao={funcao} ancora={`funcao-${funcao.nome}`} />
            ))}
        </Secao>
      )}
      {isVisivel("tipos") && (
        <Secao id="tipos" titulo="Tipos">
          {referencia.tipos
            .filter((tipo) => isVisivel(`tipo-${tipo.nome}`))
            .map((tipo) => (
              <CartaoDeTipo key={tipo.nome} tipo={tipo} />
            ))}
        </Secao>
      )}
      {isVisivel("constantes") && (
        <Secao id="constantes" titulo="Constantes">
          <p>O contrato com a plataforma também é exportado, para o widget consultar em código.</p>
          {referencia.constantes
            .filter((constante) => isVisivel(`constante-${constante.nome}`))
            .map((constante) => (
              <CartaoDeConstante key={constante.nome} constante={constante} />
            ))}
        </Secao>
      )}
    </>
  );
}

export { TabelaDeCampos };
