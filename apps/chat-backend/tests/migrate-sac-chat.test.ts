/**
 * Regras de conversão do histórico do chat antigo (SAC) — ver
 * scripts/sac-chat-mapping.ts.
 *
 * São funções puras: nada aqui toca banco, storage ou rede. É o contrato que a
 * migração (scripts/migrate-sac-chat.ts) precisa respeitar em 2 milhões de
 * mensagens, então cada mapeamento é fixado aqui.
 */

import { describe, expect, test } from "bun:test";
import {
  externalMediaKey,
  fixMojibake,
  legacyProtocol,
  mapChannel,
  mapMessageType,
  mapSender,
  mapSessionStatus,
  mediaKeyFor,
  mimeForLegacyFile,
  normalizePhone,
  parseClienteInfo,
  parseLegacyAttachment,
  sanitizeLegacyText,
  typeWithMedia,
} from "@scripts/sac-chat-mapping";

describe("autor → sender", () => {
  test("0 é o atendente da conversa, 1 o cliente e 2 a mensagem automática", () => {
    expect(mapSender(0)).toEqual({ sender: "attendant", attendantLegacyId: null });
    expect(mapSender(1)).toEqual({ sender: "client", attendantLegacyId: null });
    expect(mapSender(2)).toEqual({ sender: "bot", attendantLegacyId: null });
  });

  test("ids acima de 2 são atendentes gravados pelo formato antigo", () => {
    expect(mapSender(405)).toEqual({ sender: "attendant", attendantLegacyId: 405 });
  });

  test("sem autor vira mensagem de sistema (bot)", () => {
    expect(mapSender(null)).toEqual({ sender: "bot", attendantLegacyId: null });
    expect(mapSender(undefined)).toEqual({ sender: "bot", attendantLegacyId: null });
  });
});

describe("chat_tipo_msg → type", () => {
  test("texto, mídia e casos especiais", () => {
    expect(mapMessageType(1)).toBe("text");
    expect(mapMessageType(2)).toBe("image");
    expect(mapMessageType(3)).toBe("image"); // sticker
    expect(mapMessageType(4)).toBe("file");
    expect(mapMessageType(5)).toBe("audio");
    expect(mapMessageType(6)).toBe("video");
    expect(mapMessageType(7)).toBe("text"); // contato
  });

  test("nulo (1,4 milhão de linhas antigas) e desconhecido caem em texto", () => {
    expect(mapMessageType(null)).toBe("text");
    expect(mapMessageType(99)).toBe("text");
  });

  test("com anexo, o mime do arquivo decide o tipo final", () => {
    expect(typeWithMedia("text", "image/jpeg")).toBe("image");
    expect(typeWithMedia("text", "audio/ogg")).toBe("audio");
    expect(typeWithMedia("text", "video/mp4")).toBe("video");
    expect(typeWithMedia("text", "application/pdf")).toBe("file");
  });

  test("sem mime (só link externo) o tipo do legado é mantido", () => {
    expect(typeWithMedia("image", null)).toBe("image");
    expect(typeWithMedia("text", undefined)).toBe("text");
  });
});

describe("chat_atendido → status", () => {
  test("todo histórico entra encerrado, com o motivo preservado", () => {
    expect(mapSessionStatus(2)).toEqual({ status: "closed", closedReason: "finished" });
    expect(mapSessionStatus(3)).toEqual({ status: "closed", closedReason: "finished" });
    expect(mapSessionStatus(4)).toEqual({ status: "closed", closedReason: "abandoned" });
    expect(mapSessionStatus(0)).toEqual({ status: "closed", closedReason: "unfinished" });
    expect(mapSessionStatus(1)).toEqual({ status: "closed", closedReason: "unfinished" });
    expect(mapSessionStatus(5)).toEqual({ status: "closed", closedReason: "unfinished" });
  });

  test("código fora da tabela legada não quebra a importação", () => {
    expect(mapSessionStatus(99)).toEqual({ status: "closed", closedReason: "unknown" });
    expect(mapSessionStatus(null)).toEqual({ status: "closed", closedReason: "unknown" });
  });
});

describe("canal", () => {
  test("chat_zap = 1 é WhatsApp; o resto é o widget nativo", () => {
    expect(mapChannel(1)).toBe("whatsapp");
    expect(mapChannel(0)).toBe("native");
    expect(mapChannel(null)).toBe("native");
  });
});

describe("protocolo", () => {
  test("reaproveita o número conhecido pelo cliente com prefixo LEG-", () => {
    expect(legacyProtocol(104804, "6492-2026")).toBe("LEG-6492-2026");
  });

  test("números repetidos no legado recebem o chat_id como desempate", () => {
    expect(legacyProtocol(50123, "2651-2021", true)).toBe("LEG-2651-2021-50123");
  });

  test("sem número, cai no chat_id — determinístico e único", () => {
    expect(legacyProtocol(77, null)).toBe("LEG-77");
    expect(legacyProtocol(77, "  ")).toBe("LEG-77");
  });

  test("nunca colide com o formato atual YYYYMMDD-####", () => {
    expect(legacyProtocol(1, "20260803-0001")).not.toMatch(/^\d{8}-\d{4}$/);
  });
});

describe("telefone e chat_cliente_info", () => {
  test("normaliza para dígitos e descarta o que não é telefone", () => {
    expect(normalizePhone("+55 (67) 99694-7583")).toBe("5567996947583");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  test("formato do widget web: telefone, nome e browser id", () => {
    const info =
      "web|web|web|2026-05-22 15:36:16|Mozilla/5.0 (Windows NT 10.0)|web|67888888888|0|Teste|uuid:cust_6b0eecd7-ab56";
    expect(parseClienteInfo(info)).toEqual({
      phone: "67888888888",
      name: "Teste",
      browserId: "cust_6b0eecd7-ab56",
    });
  });

  test("formato do WhatsApp: telefone e nome, sem browser id", () => {
    const info = "versao|Firebird|computador|data|navegador|S.O.|5567996947583|ZAP|Carlos Eduardo";
    expect(parseClienteInfo(info)).toEqual({
      phone: "5567996947583",
      name: "Carlos Eduardo",
      browserId: null,
    });
  });

  test("formato antigo de 2011 não tem cliente algum", () => {
    expect(parseClienteInfo("2.0.0.0|WI-V2.1.3|FINANSERVER|21/11/2011 08:20:56|msie 7.0|Windows XP")).toEqual({
      phone: null,
      name: null,
      browserId: null,
    });
    expect(parseClienteInfo(null)).toEqual({ phone: null, name: null, browserId: null });
  });
});

describe("texto legado", () => {
  test("converte o HTML gravado pelo chat antigo em texto puro", () => {
    expect(sanitizeLegacyText("<b>Contato recebido:</b> Adelino - 556799835766")).toBe(
      "Contato recebido: Adelino - 556799835766"
    );
    expect(sanitizeLegacyText("linha 1<br>linha 2")).toBe("linha 1\nlinha 2");
    // Token de quebra da ponte do WhatsApp + CRLF do sistema antigo.
    expect(sanitizeLegacyText("Bem-vindo.|br|\r\nOlá, meu nome é Mauricio")).toBe("Bem-vindo.\nOlá, meu nome é Mauricio");
    expect(sanitizeLegacyText('<img src="https://tempstorage.download/a.webp">')).toBe("");
  });

  test("decodifica as entidades acentuadas gravadas pelo chat antigo", () => {
    expect(sanitizeLegacyText("H&aacute; algo em que eu possa ajudar?")).toBe("Há algo em que eu possa ajudar?");
    expect(sanitizeLegacyText("estamos &agrave; disposi&ccedil;&atilde;o &amp; obrigado")).toBe(
      "estamos à disposição & obrigado"
    );
    expect(sanitizeLegacyText("n&#227;o &#x27;ok&#x27;")).toBe("não 'ok'");
  });

  test("remove os caracteres de controle que o Postgres rejeita", () => {
    expect(sanitizeLegacyText("bom\u0000 dia")).toBe("bom dia");
  });

  test("corrige o UTF-8 duplamente codificado de parte das linhas", () => {
    expect(sanitizeLegacyText("Este Ã© o chat nÃºmero 2989-2026")).toBe("Este é o chat número 2989-2026");
    expect(fixMojibake("já está correto")).toBe("já está correto");
  });

  test("descarta a mídia embutida em base64 no corpo da mensagem", () => {
    const embedded = `- <img id=9FCBE8FF src=data:image/jpeg;base64,${"/9j/4AAQSkZJRg".repeat(80)}>`;
    expect(sanitizeLegacyText(embedded)).toBe("");
    expect(sanitizeLegacyText(`Segue a foto <img src="data:image/png;base64,iVBORw0KGgo=">`)).toBe("Segue a foto");
  });

  test("link com data URI mantém só o rótulo", () => {
    expect(sanitizeLegacyText('<a href="data:application/pdf;base64,JVBERi0=">Baixar</a>')).toBe("Baixar");
  });

  test("preserva o destino do link de arquivo da intranet", () => {
    const html = 'O cliente enviou um arquivo: <a href="../intranet/arquivos_chat/2026/02/ERRO.png">Clique aqui.</a>';
    expect(sanitizeLegacyText(html)).toBe(
      "O cliente enviou um arquivo: Clique aqui. (../intranet/arquivos_chat/2026/02/ERRO.png)"
    );
  });

  test("vazio/nulo viram string vazia", () => {
    expect(sanitizeLegacyText(null)).toBe("");
    expect(sanitizeLegacyText("   ")).toBe("");
  });
});

describe("anexos", () => {
  const jpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAY=";

  test("data URI completo entrega base64, mime e nome padrão", () => {
    const parsed = parseLegacyAttachment(`data:image/jpeg;base64,${jpegBase64}`, { legacyMessageId: 42 });
    expect(parsed).toEqual({ base64: jpegBase64, mime: "image/jpeg", name: "legado-42.jpg" });
  });

  test("base64 cru usa tipo_arquivo/nome_arquivo do legado", () => {
    expect(parseLegacyAttachment(jpegBase64, { nome: "foto2.jpg", tipo: "jpg" })).toEqual({
      base64: jpegBase64,
      mime: "image/jpeg",
      name: "foto2.jpg",
    });
  });

  test("tipo genérico do WhatsApp usa a extensão do nome", () => {
    expect(mimeForLegacyFile("document", "ManualWebServ_v4.pdf")).toBe("application/pdf");
    expect(mimeForLegacyFile("ptt", null)).toBe("audio/ogg");
    expect(mimeForLegacyFile("sticker", null)).toBe("image/webp");
    expect(mimeForLegacyFile(null, "arquivo.desconhecido")).toBe("application/octet-stream");
  });

  test("blob vazio não vira anexo", () => {
    expect(parseLegacyAttachment(null)).toBeNull();
    expect(parseLegacyAttachment("data:image/jpeg;base64,")).toBeNull();
  });

  test("a chave no storage é determinística por sessão + mensagem", () => {
    const key = mediaKeyFor("11111111-2222-3333-4444-555555555555", 987);
    expect(key).toBe("11111111-2222-3333-4444-555555555555/legacy-987");
    expect(mediaKeyFor("11111111-2222-3333-4444-555555555555", 987)).toBe(key);
  });

  test("mídia sem blob guarda o link do WhatsApp na convenção ext:", () => {
    expect(externalMediaKey("https://tempstorage.download/a.jpeg")).toBe("ext:https://tempstorage.download/a.jpeg");
    expect(externalMediaKey("BEGIN:VCARD\nVERSION:3.0")).toBeNull();
    expect(externalMediaKey(null)).toBeNull();
  });
});
