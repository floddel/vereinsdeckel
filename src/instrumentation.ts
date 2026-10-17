// Läuft einmal beim Start des Next.js-Servers.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { prepareDatabase } = await import("./db/prepare");
    await prepareDatabase();
  }
}
