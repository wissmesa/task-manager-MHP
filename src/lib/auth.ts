import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const password = credentials.password as string;
        const email = credentials.email as string;

        if (password.startsWith("eyJ") && process.env.JWT_SECRET) {
          try {
            const decoded = jwt.verify(password, process.env.JWT_SECRET) as {
              userId: string;
              email: string;
            };

            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, decoded.userId))
              .limit(1);

            if (!user || !user.isActive) return null;

            return {
              id: user.id,
              email: user.email,
              name: user.fullName,
              role: user.role,
              tenantId: user.tenantId,
            };
          } catch {
            return null;
          }
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.isActive) return null;

        const isValid = await bcryptjs.compare(password, user.passwordHash);

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.role = u.role;
        token.tenantId = u.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = session.user as any;
        s.role = token.role;
        s.tenantId = token.tenantId;
      }
      return session;
    },
  },
});
