import { z } from "zod";

// Ohne „JIT“: zod prüft sonst per Function(""), ob es Code erzeugen darf. Die Content-Security-Policy
// verbietet das (zod käme ohne aus), meldet den Versuch aber im Browser als Verstoß.
// Deshalb zod immer von hier importieren, nicht direkt aus "zod".
z.config({ jitless: true });

export { z };
