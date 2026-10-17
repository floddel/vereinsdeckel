"use client";

import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArticleIcon } from "@/components/article-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatVolume } from "@/domain/volume";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { moveArticleAction, reorderArticlesAction, setArticleAvailableAction } from "@/server/article-actions";
import type { ArticleRow, CategoryRow } from "@/server/queries/articles";
import { ArticleDialog } from "./article-dialog";

type Group = { category: CategoryRow; articles: ArticleRow[] };

export function ArticleList({ groups }: { groups: Group[] }) {
  const [dialog, setDialog] = useState<{ article?: ArticleRow; categoryId?: string } | null>(null);
  const categories = groups.map((g) => g.category);
  const tallyGroups = [...new Set(groups.flatMap((g) => g.articles.map((a) => a.tallyGroup).filter(Boolean)))] as string[];
  // mögliche „Bestand aus“-Artikel: Ausschank mit eigenem Bestand
  const stockSources = groups.flatMap((g) => g.articles.filter((a) => a.servingMl && !a.stockArticleId).map((a) => ({ id: a.id, name: a.name })));
  const nameById = new Map(groups.flatMap((g) => g.articles.map((a) => [a.id, a.name])));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="lg" onClick={() => setDialog({})}>
          <Plus /> Neuer Artikel
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {groups.map((g) => (
          <CategoryCard
            key={g.category.id}
            group={g}
            nameById={nameById}
            onEdit={(article) => setDialog({ article })}
            onAdd={() => setDialog({ categoryId: g.category.id })}
          />
        ))}
      </div>
      <ArticleDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        article={dialog?.article}
        defaultCategoryId={dialog?.categoryId}
        categories={categories}
        tallyGroups={tallyGroups}
        stockSources={stockSources}
      />
    </>
  );
}

function CategoryCard({
  group,
  nameById,
  onEdit,
  onAdd,
}: {
  group: Group;
  nameById: Map<string, string>;
  onEdit: (a: ArticleRow) => void;
  onAdd: () => void;
}) {
  const [optimistic, setOptimistic] = useOptimistic(group.articles);
  const [, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  function reorder(ids: string[], persist: () => Promise<void>) {
    startTransition(async () => {
      setOptimistic(ids.map((id) => optimistic.find((a) => a.id === id)!));
      await persist();
    });
  }

  function move(index: number, direction: "up" | "down") {
    const ids = optimistic.map((a) => a.id);
    const j = direction === "up" ? index - 1 : index + 1;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder(ids, () => moveArticleAction(optimistic[index].id, direction));
  }

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = optimistic.map((a) => a.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    reorder(ids, () => reorderArticlesAction(group.category.id, ids));
    setDragId(null);
  }

  /** Schalter: sofort umlegen, im Hintergrund speichern (bei einem Fehler springt er zurück) */
  function setAvailable(a: ArticleRow, available: boolean) {
    startTransition(async () => {
      setOptimistic((rows) => rows.map((r) => (r.id === a.id ? { ...r, available } : r)));
      try {
        await setArticleAvailableAction(a.id, available);
      } catch {
        toast.error(`„${a.name}“ nicht umgestellt – bitte noch einmal versuchen`);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl">{group.category.name}</CardTitle>
        <Button variant="ghost" size="sm" className="text-primary" onClick={onAdd}>
          <Plus /> Hinzufügen
        </Button>
      </CardHeader>
      <CardContent>
        {optimistic.length === 0 && <p className="text-muted-foreground">Noch keine Artikel.</p>}
        {/* @container: Ist die Karte schmal (Handy, zwei Spalten am Desktop), kommen Preis und Knöpfe in eine zweite Zeile */}
        <ol className="@container flex flex-col divide-y">
          {optimistic.map((a, i) => {
            const off = !a.active || !a.available;
            return (
              <li
                key={a.id}
                draggable
                onDragStart={() => setDragId(a.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(a.id)}
                onDragEnd={() => setDragId(null)}
                className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 @min-[30rem]:flex-nowrap", dragId === a.id && "opacity-50")}
              >
                <GripVertical className="hidden size-4 shrink-0 cursor-grab text-muted-foreground lg:@min-[30rem]:block" aria-hidden />
                <span className={cn("grid size-10 shrink-0 place-items-center transition", off && "opacity-40 grayscale")}>
                  <ArticleIcon icon={a.icon} className="size-9" />
                </span>
                <div className={cn("min-w-0 flex-1", off && "text-muted-foreground")}>
                  <p className="truncate text-base font-semibold">{a.name}</p>
                  {a.note && <p className="line-clamp-2 text-sm text-muted-foreground">{a.note}</p>}
                  <div className="flex flex-wrap gap-1">
                    {a.servingMl && (
                      <Badge variant="secondary">
                        {formatVolume(a.servingMl)}
                        {a.bottleMl && ` aus ${formatVolume(a.bottleMl)}`}
                      </Badge>
                    )}
                    {a.stockArticleId && <Badge variant="outline">Bestand aus {nameById.get(a.stockArticleId)}</Badge>}
                    {a.packSize && <Badge variant="secondary">Kiste {a.packSize}</Badge>}
                    {a.tallyGroup && <Badge variant="secondary">{a.tallyGroup}</Badge>}
                    {a.orderable && a.categoryId === "essen" && <Badge variant="secondary">per Handy</Badge>}
                    {a.dailySpecial && <Badge variant="secondary">selbst gekocht, unter „Heute“</Badge>}
                    {!a.active && <Badge variant="outline">inaktiv</Badge>}
                    {!a.trackStock && <Badge variant="outline">ohne Bestand</Badge>}
                  </div>
                </div>
                <div className="order-last flex w-full items-center justify-between gap-3 pl-13 @min-[30rem]:order-none @min-[30rem]:w-auto @min-[30rem]:pl-0">
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 font-semibold tabular-nums transition",
                      off ? "bg-muted text-muted-foreground" : "bg-highlight text-highlight-foreground",
                    )}
                  >
                    {formatCents(a.priceCents)}
                  </span>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label={`${a.name} nach oben`} disabled={i === 0} onClick={() => move(i, "up")}>
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${a.name} nach unten`}
                      disabled={i === optimistic.length - 1}
                      onClick={() => move(i, "down")}
                    >
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`${a.name} bearbeiten`} onClick={() => onEdit(a)}>
                      <Pencil />
                    </Button>
                  </div>
                </div>
                {/* Kein Schalter für Inaktive (ausgemustert) und selbst Gekochtes (wird unter „Heute“ eingeschaltet) – der Platz bleibt für eine ruhige Spalte */}
                <span className="ml-1 flex w-12 shrink-0 justify-end">
                  {a.active && !a.dailySpecial && (
                    <Switch size="lg" checked={a.available} onCheckedChange={(on) => setAvailable(a, on)} aria-label={`${a.name} verfügbar`} />
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
