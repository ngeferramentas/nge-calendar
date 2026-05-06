"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CollaboratorCalendarMeta } from "@/lib/types/database";

const STORAGE_PREFIX = "nge-calendar:agendaHiddenCollaborators:v1:";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readHiddenFromStorage(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeHiddenToStorage(userId: string, hidden: string[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(hidden));
  } catch {
    // ignore quota / private mode
  }
}

export type CollaboratorVisibilityContextValue = {
  members: CollaboratorCalendarMeta[];
  hiddenIds: ReadonlySet<string>;
  toggle: (collaboratorId: string) => void;
  isVisible: (collaboratorId: string) => boolean;
  isEventRowVisible: (collaboratorId: string | null) => boolean;
};

const CollaboratorVisibilityContext =
  createContext<CollaboratorVisibilityContextValue | null>(null);

type ProviderProps = {
  userId: string;
  members: CollaboratorCalendarMeta[];
  children: React.ReactNode;
};

export function CollaboratorVisibilityProvider({
  userId,
  members,
  children,
}: ProviderProps) {
  const memberIds = useMemo(
    () => new Set(members.map((m) => m.id)),
    [members],
  );

  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readHiddenFromStorage(userId);
    const pruned = stored.filter((id) => memberIds.has(id));
    setHiddenIds(pruned);
    setHydrated(true);
    if (pruned.length !== stored.length) {
      writeHiddenToStorage(userId, pruned);
    }
  }, [userId, memberIds]);

  useEffect(() => {
    if (!hydrated) return;
    writeHiddenToStorage(userId, hiddenIds);
  }, [userId, hiddenIds, hydrated]);

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const isVisible = useCallback(
    (collaboratorId: string) => !hiddenSet.has(collaboratorId),
    [hiddenSet],
  );

  const isEventRowVisible = useCallback(
    (collaboratorId: string | null) => {
      if (!collaboratorId) return true;
      return !hiddenSet.has(collaboratorId);
    },
    [hiddenSet],
  );

  const toggle = useCallback((collaboratorId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(collaboratorId)) next.delete(collaboratorId);
      else next.add(collaboratorId);
      return [...next];
    });
  }, []);

  const value = useMemo<CollaboratorVisibilityContextValue>(
    () => ({
      members,
      hiddenIds: hiddenSet,
      toggle,
      isVisible,
      isEventRowVisible,
    }),
    [members, hiddenSet, toggle, isVisible, isEventRowVisible],
  );

  return (
    <CollaboratorVisibilityContext.Provider value={value}>
      {children}
    </CollaboratorVisibilityContext.Provider>
  );
}

export function useCollaboratorVisibility(): CollaboratorVisibilityContextValue | null {
  return useContext(CollaboratorVisibilityContext);
}
