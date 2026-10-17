import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ token }: { token: string }) {
  return (
    <Link href={`/m/${token}`} className="-ml-1.5 mb-4 flex items-center gap-0.5 self-start text-[17px] font-medium text-primary">
      <ChevronLeft className="size-7" aria-hidden /> Mein Bierdeckel
    </Link>
  );
}
