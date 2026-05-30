import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";

export const userModule = new Elysia({ prefix: "/users" })
  .use(authPlugin)

  .get("/me/", async ({ user }) => {
    return prisma.user.findFirstOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        avatar: true,
        userTimezone: true,
        isActive: true,
        dateJoined: true,
      },
    });
  })

  .patch("/me/", async ({ user, body }) => {
    const b = body as any;
    const data: any = {};
    if (b.first_name !== undefined) data.firstName = b.first_name;
    if (b.last_name !== undefined) data.lastName = b.last_name;
    if (b.display_name !== undefined) data.displayName = b.display_name;
    if (b.user_timezone !== undefined) data.userTimezone = b.user_timezone;

    return prisma.user.update({ where: { id: user.id }, data });
  });
