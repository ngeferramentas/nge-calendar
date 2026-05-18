"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  CollaboratorCombobox,
  type CollaboratorOption,
} from "@/components/collaborator-combobox";

type Props = {
  value: CollaboratorOption[];
  onChange: (value: CollaboratorOption[]) => void;
  disabled?: boolean;
  label?: string;
};

const emptySlot = (): CollaboratorOption => ({ id: "", full_name: "" });

function filledKey(rows: CollaboratorOption[]): string {
  return rows
    .filter((r) => r.id)
    .map((r) => r.id)
    .join(",");
}

export function CollaboratorMultiPicker({
  value,
  onChange,
  disabled,
  label = "Colaboradores",
}: Props) {
  const [rows, setRows] = useState<CollaboratorOption[]>(() =>
    value.length > 0 ? value : [emptySlot()],
  );

  useEffect(() => {
    setRows((prev) => {
      const prevFilled = filledKey(prev);
      const nextFilled = filledKey(value);
      const hasDraftEmpty = prev.some((r) => !r.id);
      if (hasDraftEmpty && prevFilled === nextFilled) return prev;
      return value.length > 0 ? value : [emptySlot()];
    });
  }, [value]);

  function applyRows(next: CollaboratorOption[]) {
    const display = next.length > 0 ? next : [emptySlot()];
    setRows(display);
    onChange(next.filter((r) => r.id));
  }

  function updateRow(index: number, next: CollaboratorOption | null) {
    const copy = [...rows];
    if (!next || !next.id) {
      if (copy.length > 1) {
        copy.splice(index, 1);
        applyRows(copy);
        return;
      }
      applyRows([]);
      return;
    }
    if (copy.some((r, i) => i !== index && r.id === next.id)) {
      return;
    }
    copy[index] = next;
    applyRows(copy);
  }

  function addRow() {
    setRows((prev) => [...prev.filter((r) => r.id), emptySlot()]);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      applyRows([]);
      return;
    }
    applyRows(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-zinc-900">{label}</label>
        <button
          type="button"
          onClick={addRow}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          aria-label="Adicionar colaborador"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Adicionar
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={`row-${index}`} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CollaboratorCombobox
                value={row.id ? row : null}
                onChange={(c) => updateRow(index, c)}
                disabled={disabled}
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={disabled}
                className="mt-1 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
                aria-label="Remover colaborador"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
