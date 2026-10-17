import { redirect } from "next/navigation";

// Die Startseite leitet zur Theke weiter (ohne Login weiter zur Anmeldung).
export default function Home() {
  redirect("/theke");
}
