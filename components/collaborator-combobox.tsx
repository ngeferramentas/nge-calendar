"use client";

import { useCallback, useEffect, useState } from "react";
import { searchCollaborators } from "@/app/actions/users";
import { Loader2 } from "lucide-react";

type CollaboratorOption = { id: string; full_name: string };

type Props = {
  value: CollaboratorOption | null;
  onChange: (c: CollaboratorOption | null) => void;
  disabled?: boolean;
};

export function CollaboratorCombobox({ value, onChange, disabled }: Props) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CollaboratorOption[]>([]);
  const [open, setOpen] = useState(false);

  const runSearch = useCallback(async (term: string) => {
    if (term.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const res = await searchCollaborators(term);
    setLoading(false);
    if (res.ok && res.data) setResults(res.data);
    else setResults([]);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  return (
    <div className="relative w-full">
      <label className="mb-1 block text-sm font-medium text-zinc-700">
        Buscar colaborador
      </label>
      <input
        type="text"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4] disabled:opacity-50"
        placeholder="Digite para buscar..."
        value={value ? value.full_name : q}
        disabled={disabled}
        onChange={(e) => {
          onChange(null);
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && !disabled && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setQ("");
                }}
              >
                <span className="font-medium">{c.full_name || c.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <Loader2 className="absolute right-3 top-9 h-4 w-4 animate-spin text-zinc-400" />
      )}
    </div>
  );
}
