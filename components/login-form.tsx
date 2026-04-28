"use client";

import { useState } from "react";
import { signInWithPassword } from "@/app/actions/auth";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signInWithPassword(email, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push("/agenda");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"
    >
      <h1 className="text-center text-xl font-semibold text-[#4285F4]">
        NGE Calendar
      </h1>
      <p className="text-center text-sm text-zinc-500">Entre com sua conta</p>
      {error && (
        <p className="rounded-lg bg-[#FDECEA] px-3 py-2 text-sm text-[#DB4437]">
          {error}
        </p>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          E-mail
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#4285F4]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Senha
        </label>
        <input
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#4285F4]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#4285F4] py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
