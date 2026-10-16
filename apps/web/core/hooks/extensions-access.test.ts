import { describe, expect, it } from "bun:test";
import { isExtensionManager } from "@/hooks/extensions-access";

const withPermissions = (permissions: string[]) => ({ permissions });

describe("isExtensionManager", () => {
  it("libera o admin da instância mesmo sem espaço", () => {
    expect(isExtensionManager(true, [])).toBe(true);
  });

  it("libera quem envia extensões em algum espaço", () => {
    expect(isExtensionManager(false, [withPermissions(["issue.view"]), withPermissions(["extension.upload"])])).toBe(
      true
    );
  });

  it("libera quem gerencia plugins em algum espaço", () => {
    expect(isExtensionManager(false, [withPermissions(["plugin.manage"])])).toBe(true);
  });

  it("nega quem não tem nenhuma das ações em nenhum espaço", () => {
    expect(isExtensionManager(false, [withPermissions(["issue.view", "report.view"]), undefined])).toBe(false);
  });

  it("nega enquanto a matriz não chegou", () => {
    expect(isExtensionManager(false, [undefined])).toBe(false);
  });
});
