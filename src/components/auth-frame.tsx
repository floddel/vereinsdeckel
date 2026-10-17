import { Beer } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Zentrierte Karte auf dem App-Hintergrund für Einrichten, Login und PIN – mit App-Symbol wie auf dem iPhone. */
export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <span className="grid size-18 place-items-center rounded-[22px] bg-primary text-primary-foreground shadow-soft">
        <Beer className="size-9" aria-hidden />
      </span>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-[1.75rem] leading-tight font-bold">{title}</CardTitle>
          {description && <CardDescription className="text-base">{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <a href="/datenschutz" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Datenschutz
      </a>
    </main>
  );
}
