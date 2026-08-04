/**
 * Barramento SSE em memória — publishRealtime avisa os navegadores conectados
 * àquele workspace. Um listener quebrado nunca pode derrubar quem publica.
 */
import {describe, expect, it} from "bun:test";
import {publishRealtime, subscribeRealtime, type RealtimeEvent} from "@utils/realtime";

const ws = () => `ws-${Math.random().toString(36).slice(2)}`;

describe("subscribeRealtime / publishRealtime", () => {
  it("entrega o evento a todos os inscritos do workspace", () => {
    const id = ws();
    const a: RealtimeEvent[] = [];
    const b: RealtimeEvent[] = [];
    const offA = subscribeRealtime(id, (e) => a.push(e));
    const offB = subscribeRealtime(id, (e) => b.push(e));

    publishRealtime(id, {entity: "issue", action: "create", id: "i1"});

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].entity).toBe("issue");
    expect(typeof a[0].ts).toBe("number");
    offA();
    offB();
  });

  it("não vaza eventos entre workspaces", () => {
    const one = ws();
    const two = ws();
    const received: RealtimeEvent[] = [];
    const off = subscribeRealtime(one, (e) => received.push(e));
    publishRealtime(two, {entity: "comment", action: "update"});
    expect(received).toHaveLength(0);
    off();
  });

  it("para de entregar após o unsubscribe", () => {
    const id = ws();
    const received: RealtimeEvent[] = [];
    const off = subscribeRealtime(id, (e) => received.push(e));
    publishRealtime(id, {entity: "cycle", action: "create"});
    off();
    publishRealtime(id, {entity: "cycle", action: "delete"});
    expect(received).toHaveLength(1);
  });

  it("unsubscribe é idempotente e tolera canal já removido", () => {
    const id = ws();
    const off = subscribeRealtime(id, () => {});
    off();
    expect(() => off()).not.toThrow();
  });

  it("ignora workspaceId nulo ou vazio", () => {
    expect(() => publishRealtime(null, {entity: "issue", action: "create"})).not.toThrow();
    expect(() => publishRealtime(undefined, {entity: "issue", action: "create"})).not.toThrow();
    expect(() => publishRealtime("", {entity: "issue", action: "create"})).not.toThrow();
  });

  it("publicar sem inscritos é um no-op", () => {
    expect(() => publishRealtime(ws(), {entity: "state", action: "update"})).not.toThrow();
  });

  it("um listener que lança não impede a entrega aos demais", () => {
    const id = ws();
    const received: RealtimeEvent[] = [];
    const offBad = subscribeRealtime(id, () => {
      throw new Error("consumidor quebrado");
    });
    const offGood = subscribeRealtime(id, (e) => received.push(e));
    expect(() => publishRealtime(id, {entity: "intake", action: "create"})).not.toThrow();
    expect(received).toHaveLength(1);
    offBad();
    offGood();
  });
});
