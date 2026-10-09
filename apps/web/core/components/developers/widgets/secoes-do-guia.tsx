/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import type { TReferencia } from "@mateusseiboth/widgets-aviao/referencia-tipos";
import type { TComandosDoSdk } from "@/components/developers/widgets/comandos-do-sdk";
import { BlocoDeCodigo, Pilula, Secao, Tabela } from "@/components/developers/widgets/blocos";
import { TabelaDeCampos } from "@/components/developers/widgets/secoes-da-api";

const BOTAO_DE_DOWNLOAD =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-13 font-medium focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

export function SecaoInstalar({ comandos, versao }: { comandos: TComandosDoSdk; versao: string }) {
  return (
    <Secao id="instalar" titulo="Instalar o SDK">
      <p>
        O pacote <Pilula>@mateusseiboth/widgets-aviao</Pilula> não está no npm: esta instância serve o SDK. No projeto
        do widget, rode:
      </p>
      <BlocoDeCodigo codigo={comandos.npmInstall} />
      <p>Para fixar a versão {versao} e o projeto não mudar quando a instância atualizar:</p>
      <BlocoDeCodigo codigo={comandos.npmInstallDaVersao} />
      <div className="flex flex-wrap gap-2">
        <a href={comandos.tarball} download className={`${BOTAO_DE_DOWNLOAD} bg-accent-primary text-on-color`}>
          <Download aria-hidden className="size-3.5" /> Baixar SDK
        </a>
        <a
          href={comandos.exemplo}
          download
          className={`${BOTAO_DE_DOWNLOAD} border border-subtle text-primary hover:bg-layer-1`}
        >
          <Download aria-hidden className="size-3.5" /> Baixar exemplo
        </a>
      </div>
      <h3 className="text-15 font-semibold text-primary">Pelo repositório</h3>
      <p>
        O npm não instala uma subpasta de monorepo direto do git:{" "}
        <Pilula>{`npm install ${comandos.git.urlNpm}`}</Pilula> instalaria a raiz do repositório, não o SDK. Por isso o
        arquivo servido pela instância é o caminho recomendado. Para usar o código do repositório, gere o pacote e
        instale o arquivo gerado:
      </p>
      <BlocoDeCodigo codigo={comandos.git.passos.join("\n")} />
    </Secao>
  );
}

function Passo({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-12 font-semibold text-accent-primary"
      >
        {numero}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-14 font-semibold text-primary">{titulo}</h3>
        {children}
      </div>
    </li>
  );
}

export function SecaoTutorial({ comandos, workspaceSlug }: { comandos: TComandosDoSdk; workspaceSlug: string }) {
  return (
    <Secao id="tutorial" titulo="Tutorial: do zero à home">
      <ol className="flex flex-col gap-5">
        <Passo numero={1} titulo="Crie o projeto a partir do exemplo">
          <p>
            O exemplo é um projeto Vite com o SDK em <Pilula>vendor/</Pilula>, um widget pronto e dados de teste.
          </p>
          <BlocoDeCodigo
            codigo={`curl -O ${comandos.exemplo}\nunzip widget-exemplo.zip && cd widget-exemplo\nnpm install`}
          />
        </Passo>
        <Passo numero={2} titulo="Desenvolva com dados de teste">
          <p>
            O servidor de desenvolvimento responde as rotas do SDK com <Pilula>dev/dados-de-teste.ts</Pilula>: não
            precisa da plataforma. Edite <Pilula>src/index.tsx</Pilula> e veja o widget em cada tamanho de cartão.
          </p>
          <BlocoDeCodigo codigo="npm run dev" />
        </Passo>
        <Passo numero={3} titulo="Ajuste o manifesto">
          <p>
            Em <Pilula>manifest.json</Pilula>, troque <Pilula>name</Pilula>, <Pilula>author</Pilula> e peça só as
            permissões que o widget usa. Os campos estão em <a href="#manifesto">Manifesto</a>.
          </p>
        </Passo>
        <Passo numero={4} titulo="Empacote">
          <p>
            Compila e junta o manifesto e o <Pilula>widget.js</Pilula> em <Pilula>widget.zip</Pilula>.
          </p>
          <BlocoDeCodigo codigo="npm run empacotar" />
        </Passo>
        <Passo numero={5} titulo="Envie como meu widget">
          <p>
            Na{" "}
            <Link href={`/${workspaceSlug}/`} className="text-accent-primary hover:underline">
              página inicial
            </Link>
            , abra <strong>Gerenciar widgets</strong> e use <strong>Enviar meu widget</strong>. Não precisa de quem
            administra.
          </p>
        </Passo>
        <Passo numero={6} titulo="Veja na home">
          <p>
            O widget entra no fim da grade, só para você. Mova, redimensione e oculte como os outros cartões. Para
            trocar a versão, aumente <Pilula>version</Pilula> no manifesto e envie de novo.
          </p>
        </Passo>
        <Passo numero={7} titulo="Peça para tornar global">
          <p>
            Quem administra a instância (ou é do TI) abre <strong>Configurações &gt; Widgets &gt; De usuários</strong> e
            usa <strong>Tornar global</strong>. A partir daí o widget aparece para todos.
          </p>
        </Passo>
      </ol>
    </Secao>
  );
}

export function SecaoManifesto({ manifesto }: { manifesto: TReferencia["manifesto"] }) {
  return (
    <Secao id="manifesto" titulo="Manifesto">
      <p className="whitespace-pre-line">{manifesto.descricao}</p>
      <TabelaDeCampos campos={manifesto.campos} />
      <BlocoDeCodigo rotulo="manifest.json" codigo={manifesto.exemplo} />
    </Secao>
  );
}

export function SecaoPermissoes({ permissoes }: { permissoes: TReferencia["permissoes"] }) {
  return (
    <Secao id="permissoes" titulo="Permissões">
      <p>
        O gateway só responde as chamadas cujas permissões o manifesto declarou. Avisos, interface e armazenamento local
        não precisam de permissão.
      </p>
      <Tabela
        cabecalhos={["Permissão", "O que libera", "Usada por"]}
        linhas={permissoes.map((permissao) => [
          <Pilula key="chave">{permissao.chave}</Pilula>,
          permissao.libera,
          <span key="uso" className="flex flex-wrap gap-1">
            {permissao.usadaPor.map((nome) => (
              <Pilula key={nome}>{nome}</Pilula>
            ))}
          </span>,
        ])}
      />
    </Secao>
  );
}

export function SecaoCicloDeVida({ etapas }: { etapas: TReferencia["cicloDeVida"] }) {
  return (
    <Secao id="ciclo-de-vida" titulo="Ciclo de vida">
      <ol className="flex flex-col gap-3">
        {etapas.map((etapa, indice) => (
          <Passo key={etapa.etapa} numero={indice + 1} titulo={etapa.etapa}>
            <p>{etapa.descricao}</p>
          </Passo>
        ))}
      </ol>
      <BlocoDeCodigo
        rotulo="Props recebidas"
        codigo={`import type { WidgetHomeProps } from "@mateusseiboth/widgets-aviao";\n\nexport default function MeuWidget({ size }: WidgetHomeProps) {\n  return <p>Cartão em {size}</p>;\n}`}
      />
    </Secao>
  );
}

export function SecaoEventos({ eventos }: { eventos: TReferencia["eventos"] }) {
  return (
    <Secao id="eventos" titulo="Eventos">
      <Tabela
        cabecalhos={["Evento", "Disparado por", "Dados", "Para que serve"]}
        linhas={eventos.map((evento) => [
          <Pilula key="nome">{evento.nome}</Pilula>,
          <Pilula key="origem">{evento.origem}</Pilula>,
          <Pilula key="payload">{evento.payload}</Pilula>,
          evento.descricao,
        ])}
      />
    </Secao>
  );
}

export function SecaoErros({ erros }: { erros: TReferencia["erros"] }) {
  return (
    <Secao id="erros" titulo="Erros e códigos">
      <p>
        Toda resposta de erro traz <Pilula>{"{ detail }"}</Pilula> com a mensagem. Nos hooks ela chega em{" "}
        <Pilula>error</Pilula>; nas APIs, a promessa é rejeitada com essa mensagem.
      </p>
      <Tabela
        cabecalhos={["Código", "Quando"]}
        linhas={erros.map((erro) => [<Pilula key="status">{String(erro.status)}</Pilula>, erro.quando])}
      />
    </Secao>
  );
}

const formatValorDoLimite = (nome: string, valor: number | string) =>
  nome.endsWith("Bytes") && typeof valor === "number" ? `${valor / 1024 / 1024} MB` : String(valor);

export function SecaoLimites({ limites }: { limites: TReferencia["limites"] }) {
  return (
    <Secao id="limites" titulo="Limites">
      <Tabela
        cabecalhos={["Limite", "Valor", "Descrição"]}
        linhas={limites.map((limite) => [
          <Pilula key="nome">{limite.nome}</Pilula>,
          <Pilula key="valor">{formatValorDoLimite(limite.nome, limite.valor)}</Pilula>,
          limite.descricao,
        ])}
      />
    </Secao>
  );
}
