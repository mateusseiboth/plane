/**
 * Contract tests for the workspace print settings endpoints
 * (`/workspaces/:slug/print-settings/`).
 */
import prisma from "@db";
import {apiClient, createApiToken, createUser, createWorkspace} from "@tests/helpers/factory";
import {cleanDb} from "@tests/helpers/setup";
import {afterAll, beforeAll, describe, expect, it} from "bun:test";

describe("TestWorkspacePrintSettingsEndpoints", () => {
  let adminClient: ReturnType<typeof apiClient>;
  let memberClient: ReturnType<typeof apiClient>;
  let wsSlug: string;

  beforeAll(async () => {
    await cleanDb();
    const admin = await createUser();
    const adminToken = await createApiToken(admin.id);
    const ws = await createWorkspace(admin.id);
    wsSlug = ws.slug;
    adminClient = apiClient(adminToken.token);

    const member = await createUser();
    const memberToken = await createApiToken(member.id);
    await prisma.workspaceMember.create({
      data: {workspaceId: ws.id, memberId: member.id, role: 15, isActive: true},
    });
    memberClient = apiClient(memberToken.token);
  });

  afterAll(() => cleanDb());

  it("returns defaults when the workspace has no print settings yet", async () => {
    const res = await adminClient.get(`/workspaces/${wsSlug}/print-settings/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data).toEqual({
      logo_asset: null,
      logo_url: null,
      header_text: null,
      footer_text: null,
      show_generated_at: true,
    });
  });

  it("admin updates print settings and the values persist", async () => {
    const patchRes = await adminClient.patch(`/workspaces/${wsSlug}/print-settings/`, {
      header_text: "Quality Sistemas",
      footer_text: "Documento gerado pelo sistema",
      show_generated_at: false,
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as any;
    expect(patched.header_text).toBe("Quality Sistemas");
    expect(patched.footer_text).toBe("Documento gerado pelo sistema");
    expect(patched.show_generated_at).toBe(false);

    const getRes = await adminClient.get(`/workspaces/${wsSlug}/print-settings/`);
    const data = (await getRes.json()) as any;
    expect(data.header_text).toBe("Quality Sistemas");
    expect(data.show_generated_at).toBe(false);
  });

  it("patch merges — omitted keys keep their stored value", async () => {
    const res = await adminClient.patch(`/workspaces/${wsSlug}/print-settings/`, {footer_text: "Rodapé novo"});
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.footer_text).toBe("Rodapé novo");
    expect(data.header_text).toBe("Quality Sistemas");
    expect(data.show_generated_at).toBe(false);
  });

  it("empty strings clear a text field", async () => {
    const res = await adminClient.patch(`/workspaces/${wsSlug}/print-settings/`, {header_text: "   "});
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.header_text).toBeNull();
  });

  it("logo_url is derived from the uploaded asset id", async () => {
    const ws = await prisma.workspace.findUniqueOrThrow({where: {slug: wsSlug}});
    const asset = await prisma.fileAsset.create({
      data: {workspaceId: ws.id, entityType: 0, asset: `ws/${ws.id}/logo.png`, size: 10, isUploaded: true},
    });

    const res = await adminClient.patch(`/workspaces/${wsSlug}/print-settings/`, {logo_asset: asset.id});
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.logo_asset).toBe(asset.id);
    expect(data.logo_url).toBe(`/api/assets/v2/workspaces/${wsSlug}/${asset.id}/`);
  });

  it("any member can read the print settings", async () => {
    const res = await memberClient.get(`/workspaces/${wsSlug}/print-settings/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.footer_text).toBe("Rodapé novo");
  });

  it("non-admin members cannot update the print settings", async () => {
    const res = await memberClient.patch(`/workspaces/${wsSlug}/print-settings/`, {header_text: "Hack"});
    expect(res.status).toBe(403);
  });
});
