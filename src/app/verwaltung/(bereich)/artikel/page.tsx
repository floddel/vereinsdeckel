import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { getArticlesByCategory } from "@/server/queries/articles";
import { requireVerwaltung } from "@/server/session";
import { ArticleList } from "./article-list";

export default function ArtikelPage() {
  return (
    <>
      <PageHeader
        title="Artikel"
        description="Kacheln an der Theke. Mit dem Schalter rechts legst du fest, was es gibt: Ausgeschaltete Artikel sind an der Theke und auf der Karte ausgeblendet, der Bestand bleibt. Reihenfolge mit den Pfeilen oder per Ziehen ändern. Preisänderungen gelten nur für neue Buchungen."
      />
      <Suspense fallback={<Loading />}>
        <Articles />
      </Suspense>
    </>
  );
}

async function Articles() {
  await requireVerwaltung();
  return <ArticleList groups={await getArticlesByCategory()} />;
}
