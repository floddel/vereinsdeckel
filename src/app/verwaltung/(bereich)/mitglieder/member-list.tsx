"use client";

import { ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MemberListRow } from "@/server/queries/members";
import { MemberDialog } from "./member-dialog";
import { NativeSelect } from "@/components/native-select";

type Filter = "aktiv" | "inaktiv" | "alle";

function normalize(s: string) {
  return s.toLocaleLowerCase("de").normalize("NFD").replace(/\p{M}/gu, "");
}

export function MemberList({ members }: { members: MemberListRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("aktiv");
  const [dialogOpen, setDialogOpen] = useState(false);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return members.filter(
      (m) =>
        (filter === "alle" || (filter === "aktiv") === m.active) &&
        (!q || normalize(m.name).includes(q)),
    );
  }, [members, query, filter]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Name suchen …"
            aria-label="Mitglieder suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9 text-base"
          />
        </div>
        <NativeSelect
          aria-label="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="h-10"
        >
          <option value="aktiv">Aktive</option>
          <option value="inaktiv">Inaktive</option>
          <option value="alle">Alle</option>
        </NativeSelect>
        <Button size="lg" onClick={() => setDialogOpen(true)}>
          <Plus /> Neues Mitglied
        </Button>
      </div>

      <p className="mb-2 text-sm text-muted-foreground">{visible.length} von {members.length} Mitgliedern</p>

      {/* Tabelle ab Tablet */}
      <div className="hidden overflow-hidden rounded-2xl bg-card px-2 shadow-soft dark:ring-1 dark:ring-white/5 md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Öffnen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <Link href={`/verwaltung/mitglieder/${m.id}`} className="hover:underline">
                    {m.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadges m={m} />
                </TableCell>
                <TableCell className="text-right">
                  <Button nativeButton={false} variant="ghost" size="sm" render={<Link href={`/verwaltung/mitglieder/${m.id}`} />}>
                    Öffnen <ChevronRight />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Gruppierte Liste wie unter iOS auf kleinen Bildschirmen */}
      <ul className="flex flex-col divide-y overflow-hidden rounded-2xl bg-card shadow-soft md:hidden dark:ring-1 dark:ring-white/5">
        {visible.map((m) => (
          <li key={m.id}>
            <Link
              href={`/verwaltung/mitglieder/${m.id}`}
              className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-muted"
            >
              <p className="min-w-0 flex-1 truncate font-medium">{m.name}</p>
              <StatusBadges m={m} />
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {visible.length === 0 && <p className="py-8 text-center text-muted-foreground">Keine Mitglieder gefunden.</p>}

      <MemberDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function StatusBadges({ m }: { m: MemberListRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {!m.active && <Badge variant="outline">inaktiv</Badge>}
      {!m.token && <Badge variant="destructive">Link gesperrt</Badge>}
    </span>
  );
}
