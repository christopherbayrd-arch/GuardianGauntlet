"use client";

const KEY = "gg:passcode";

export function getPasscode(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function setPasscode(value: string) {
  window.sessionStorage.setItem(KEY, value);
}

export function clearPasscode() {
  window.sessionStorage.removeItem(KEY);
}

export class AdminAuthError extends Error {}

export async function adminFetch<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const passcode = getPasscode();
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-gauntlet-passcode": passcode ?? "",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401) {
    clearPasscode();
    throw new AdminAuthError("Wrong passcode");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `Request failed (${res.status})`
    );
  }
  return data as T;
}
