import { connection } from "next/server";
import { Suspense } from "react";
import { AdminFooter } from "@/components/admin/admin-footer";
import { BrandMark } from "@/components/admin/brand-mark";
import { AdminNav } from "@/components/admin/nav";
import { getBrand } from "@/server/queries/settings";

export default function VerwaltungLayout({ children }: LayoutProps<"/verwaltung">) {
  // Nur Name und Logo werden nachgeladen – die Navigation selbst bleibt stehen
  // (sonst klappt ein gerade geöffnetes Menü wieder zu).
  const brand = (
    <Suspense fallback={<BrandMark clubName="Vereinsdeckel" logoUrl={null} />}>
      <ClubBrand />
    </Suspense>
  );
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <AdminNav brand={brand} />
      <main className="min-w-0 flex-1 p-4 md:p-6 xl:p-8 print:p-0">
        {children}
        <AdminFooter />
      </main>
    </div>
  );
}

async function ClubBrand() {
  await connection();
  return <BrandMark {...await getBrand()} />;
}
