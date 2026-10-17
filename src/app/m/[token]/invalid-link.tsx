import { Link2Off } from "lucide-react";

/** Neutrale Meldung – verrät nicht, ob es das Mitglied gibt oder ob der Link gesperrt wurde. */
export function InvalidLink() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="link-ungueltig">
      <Link2Off className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="font-heading text-2xl font-bold">Dieser Link ist nicht gültig</h1>
      <p className="max-w-80 text-muted-foreground">Bitte frag an der Theke nach deinem persönlichen QR-Code.</p>
    </div>
  );
}
