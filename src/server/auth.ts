import { randomInt } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { count } from "drizzle-orm";
import { getDb } from "@/db/client";
import { authOrigin, secureCookies } from "./app-url";
import { authAccount, authSession, authTwoFactor, authUser, authVerification } from "@/db/schema";

/** Gibt es schon das (einzige) Admin-Konto? */
export async function adminExists(): Promise<boolean> {
  const [{ n }] = await getDb().select({ n: count() }).from(authUser);
  return n > 0;
}

/**
 * 10 Notfall-Codes wie „k7mqp-2xh9d“: nur Kleinbuchstaben und Ziffern ohne Verwechslungsgefahr
 * (kein 0/o, 1/l/i) – sie werden von einem Zettel abgetippt. 10 Zeichen aus 31 ≈ 49 Bit Zufall.
 */
export const BACKUP_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function backupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const c = Array.from({ length: 10 }, () => BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)]).join("");
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

function createAuth() {
  return betterAuth({
    // Adresse: BETTER_AUTH_URL/APP_URL oder bei Vercel automatisch (siehe app-url.ts)
    baseURL: authOrigin() ?? undefined,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
        twoFactor: authTwoFactor,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
    },
    session: {
      // Tablet an der Theke bleibt dauerhaft angemeldet (1 Jahr, verlängert sich bei Nutzung).
      expiresIn: 60 * 60 * 24 * 365,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      session: {
        create: {
          // Datensparsamkeit: weder Browser-Kennung noch IP-Adresse zur Anmeldung speichern
          before: async (session) => ({ data: { ...session, userAgent: null, ipAddress: null } }),
        },
      },
      user: {
        create: {
          // Es darf nur ein einziges Admin-Konto geben.
          before: async (user) => {
            if (await adminExists()) {
              throw new APIError("FORBIDDEN", { message: "Es gibt bereits ein Admin-Konto" });
            }
            return { data: user };
          },
        },
      },
    },
    // Better Auth hat keine eigene Web-Schnittstelle (/api/auth gibt es nicht): Die App ruft es nur
    // auf dem Server auf (auth-actions.ts – mit Sperre nach Fehlversuchen und „nur ein Admin-Konto“).
    // Falls die Schnittstelle je wieder eingebunden wird, bleiben Anmelden und Konto anlegen trotzdem zu.
    disabledPaths: ["/sign-in/email", "/sign-up/email"],
    // IP-Adressen nutzt Better Auth nur kurz im Arbeitsspeicher für seine Bremse gegen zu viele
    // Anfragen; gespeichert werden sie nicht (siehe session.create oben).
    advanced: { useSecureCookies: secureCookies() }, // siehe app-url.ts
    telemetry: { enabled: false },
    plugins: [
      // Zweiter Faktor beim Anmelden: 6-stelliger Code aus einer Authenticator-App (oder ein Notfall-Code).
      // Eigene Sperre gegen Durchprobieren: 5 Versuche je Anmeldung, nach 10 Fehlversuchen 15 Minuten gesperrt.
      twoFactor({ issuer: "Vereinsdeckel", backupCodeOptions: { customBackupCodesGenerate: backupCodes } }),
      nextCookies(), // muss als letztes stehen
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __vereinsdeckelAuth?: Auth };

/** Login-System; wird erst beim ersten Gebrauch erzeugt (nicht schon beim Bauen der App). */
export function getAuth(): Auth {
  globalForAuth.__vereinsdeckelAuth ??= createAuth();
  return globalForAuth.__vereinsdeckelAuth;
}
