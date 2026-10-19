"use client";
import { useEffect, useState } from "react";

export interface Tokens { field: string; sheet: string; raised: string; hair: string; rule: string; ink: string; ink2: string; ink3: string; up: string; down: string; stamp: string; upWash: string; downWash: string }

const NAMES: [keyof Tokens, string][] = [
  ["field", "--field"], ["sheet", "--sheet"], ["raised", "--raised"], ["hair", "--hair"], ["rule", "--rule"],
  ["ink", "--ink"], ["ink2", "--ink-2"], ["ink3", "--ink-3"], ["up", "--up"], ["down", "--down"], ["stamp", "--stamp"],
  ["upWash", "--up-wash"], ["downWash", "--down-wash"],
];

export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Tokens;
  for (const [k, v] of NAMES) out[k] = cs.getPropertyValue(v).trim();
  return out;
}

/** Resolved Kharita tokens for canvas/chart code; updates when the theme attribute changes. */
export function useTokens(): Tokens | undefined {
  const [tokens, setTokens] = useState<Tokens>();
  useEffect(() => {
    setTokens(readTokens());
    const obs = new MutationObserver(() => setTokens(readTokens()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onMq = () => setTokens(readTokens());
    mq.addEventListener("change", onMq);
    return () => { obs.disconnect(); mq.removeEventListener("change", onMq); };
  }, []);
  return tokens;
}
