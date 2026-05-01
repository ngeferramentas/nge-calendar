"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { searchCollaboratorsForAgenda } from "@/app/actions/users";
import type { UserRole } from "@/lib/types/database";
import { Loader2 } from "lucide-react";

export type CollaboratorOption = {
  id: string;
  full_name: string;
  role?: UserRole;
};

function optionLabel(o: CollaboratorOption): string {
  const suffix = o.role === "admin" ? " (Admin)" : "";
  return `${o.full_name || o.id}${suffix}`;
}

type Props = {
  value: CollaboratorOption | null;
  onChange: (c: CollaboratorOption | null) => void;
  disabled?: boolean;
};

export function CollaboratorCombobox({ value, onChange, disabled }: Props) {
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<CollaboratorOption[]>([]);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    const res = await searchCollaboratorsForAgenda(term);
    setLoading(false);
    if (res.ok && res.data)
      setOptions(
        res.data.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          role: r.role,
        })),
      );
    else setOptions([]);
  }, []);

  useEffect(() => {
    const delay = filter.trim() ? 250 : 0;
    const t = setTimeout(() => void load(filter.trim()), delay);
    return () => clearTimeout(t);
  }, [filter, load]);

  const mergedOptions = useMemo(() => {
    if (!value) return options;
    if (options.some((o) => o.id === value.id)) return options;
    return [value, ...options];
  }, [options, value]);

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        <select
          className="w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 py-2 pr-9 text-sm outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] disabled:opacity-50"
          disabled={disabled || loading}
          value={value?.id ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              onChange(null);
              return;
            }
            const opt = mergedOptions.find((o) => o.id === id);
            if (opt) onChange(opt);
          }}
        >
          <option value="">Selecione um colaborador…</option>
          {mergedOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {optionLabel(c)}
            </option>
          ))}
        </select>
        {loading && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
        )}
      </div>
    </div>
  );
}
