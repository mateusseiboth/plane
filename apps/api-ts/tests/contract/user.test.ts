import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, apiClient } from "@tests/helpers/factory";

describe("TestUserAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser({ firstName: "João", lastName: "Silva", displayName: "João Silva" });
    userId = user.id;
    const token = await createApiToken(user.id);
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  it("GET /users/me/ returns current user profile", async () => {
    const res = await client.get("/users/me/");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(userId);
    expect(data.first_name ?? data.firstName).toBeDefined();
    expect(data.email).toBeDefined();
    expect(data.password).toBeUndefined();
  });

  it("PATCH /users/me/ updates display name", async () => {
    const res = await client.patch("/users/me/", { display_name: "JoãoUpdated", user_timezone: "America/Sao_Paulo" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.display_name ?? data.displayName).toBe("JoãoUpdated");
  });

  it("PATCH /users/me/ updates first and last name", async () => {
    const res = await client.patch("/users/me/", { first_name: "Maria", last_name: "Santos" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.first_name ?? data.firstName).toBe("Maria");
    expect(data.last_name ?? data.lastName).toBe("Santos");
  });

  it("GET /users/me/ without auth returns 401", async () => {
    const unauthClient = apiClient("bad-token");
    const res = await unauthClient.get("/users/me/");
    expect(res.status).toBe(401);
  });
});
