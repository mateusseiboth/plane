/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Comandos de instalação do SDK de widgets. O pacote não está no npm: o build
 * do web copia o tarball e o projeto de exemplo para `/sdk/`, e a página monta
 * os endereços pela origem em que está aberta.
 */

type TPacoteDoSdk = { versao: string; repositorio: string; diretorio: string };

/** `git+https://host/dono/repo.git` ou `git+ssh://git@host/dono/repo.git` para `git@host:dono/repo.git`. */
export function buildUrlSshDoGit(url: string): string {
  const { host, pathname } = new URL(url.replace(/^git\+/, ""));
  return `git@${host}:${pathname.replace(/^\//, "")}`;
}

const readNomeDoRepositorio = (url: string) => (url.split("/").pop() ?? "repositorio").replace(/\.git$/, "");

export function buildComandosDoSdk(origem: string, pacote: TPacoteDoSdk) {
  const base = `${origem.replace(/\/+$/, "")}/sdk`;
  const tarball = `${base}/widgets-aviao.tgz`;
  const tarballDaVersao = `${base}/widgets-aviao-${pacote.versao}.tgz`;
  const ssh = buildUrlSshDoGit(pacote.repositorio);
  const pastaDoPacote = `${readNomeDoRepositorio(pacote.repositorio)}/${pacote.diretorio}`;

  return {
    tarball,
    tarballDaVersao,
    exemplo: `${base}/widget-exemplo.zip`,
    npmInstall: `npm install ${tarball}`,
    npmInstallDaVersao: `npm install ${tarballDaVersao}`,
    git: {
      /** O endereço que o npm aceitaria, mas instalaria a raiz do repositório, não a pasta do SDK. */
      urlNpm: `git+ssh://${ssh.replace(":", "/")}`,
      passos: [
        `git clone --depth 1 ${ssh}`,
        `cd ${pastaDoPacote} && npm install && npm run build`,
        `npm install /caminho/do/clone/${pastaDoPacote}/dist/publico/widgets-aviao.tgz`,
      ],
    },
  };
}

export type TComandosDoSdk = ReturnType<typeof buildComandosDoSdk>;
