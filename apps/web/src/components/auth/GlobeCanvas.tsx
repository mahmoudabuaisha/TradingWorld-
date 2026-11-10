"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { GlobePose, GlobeScene, SessionId } from "./GlobeScene";

export interface GlobeHandle {
  go(pose: GlobePose, ms?: number): void;
  jump(pose: GlobePose): void;
  react(kind: "key" | "error" | "success"): void;
}

/**
 * The canvas behind the sign-in screen. three.js and the scene load after the page is interactive (their own chunk);
 * until then, and where WebGL is not available, a still CSS globe stands in. Poses asked for before the scene is
 * ready are applied when it is.
 */
export function GlobeCanvas({
  ref,
  initial,
  mirrored,
  sessions,
}: {
  ref: Ref<GlobeHandle>;
  initial: GlobePose;
  mirrored: boolean;
  sessions: () => SessionId[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<GlobeScene | undefined>(undefined);
  const pending = useRef<{ pose: GlobePose; ms?: number } | undefined>(undefined);
  /** where the globe stands (the last jump) and where it was last sent (jump or glide) */
  const base = useRef<GlobePose>(initial);
  const last = useRef<GlobePose>(initial);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useImperativeHandle(
    ref,
    () => ({
      go(pose, ms) {
        last.current = pose;
        if (scene.current) scene.current.go(pose, ms);
        else pending.current = { pose, ms };
      },
      jump(pose) {
        base.current = pose;
        last.current = pose;
        pending.current = undefined;
        scene.current?.jump(pose);
      },
      react(kind) {
        scene.current?.react(kind);
      },
    }),
    [],
  );

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void import("./GlobeScene")
      .then(({ GlobeScene }) => {
        if (disposed) return;
        const s = new GlobeScene(el, { reducedMotion, mirrored, sessions: () => sessionsRef.current() });
        scene.current = s;
        const fit = () => s.resize(el.clientWidth, el.clientHeight);
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        // start from where the page last put the globe, then carry out a glide that was asked for meanwhile
        s.jump(pending.current ? base.current : last.current);
        if (pending.current) s.go(pending.current.pose, pending.current.ms);
        pending.current = undefined;
        s.start();
        setState("ready");

        const onMove = (e: PointerEvent) => s.point((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
        let dragging: { x: number; y: number } | undefined;
        const onDown = (e: PointerEvent) => {
          dragging = { x: e.clientX, y: e.clientY };
          el.setPointerCapture(e.pointerId);
        };
        const onDrag = (e: PointerEvent) => {
          if (!dragging) return;
          s.drag(e.clientX - dragging.x, e.clientY - dragging.y);
          dragging = { x: e.clientX, y: e.clientY };
        };
        const onUp = () => (dragging = undefined);
        window.addEventListener("pointermove", onMove, { passive: true });
        el.addEventListener("pointerdown", onDown);
        el.addEventListener("pointermove", onDrag);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
        cleanup = () => {
          ro.disconnect();
          window.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerdown", onDown);
          el.removeEventListener("pointermove", onDrag);
          el.removeEventListener("pointerup", onUp);
          el.removeEventListener("pointercancel", onUp);
          s.dispose();
          scene.current = undefined;
          base.current = last.current; // a rebuilt scene starts where this one stood
        };
      })
      .catch(() => {
        // no WebGL (or the chunk did not load): the still globe stays
        if (!disposed) setState("unavailable");
      });
    return () => {
      disposed = true;
      cleanup();
    };
    // the scene is rebuilt only when the page flips between right-to-left and left-to-right
  }, [mirrored]);

  return (
    <div className="au-globe" data-state={state} aria-hidden="true">
      {state !== "ready" && <div className="au-globe-still" />}
      <canvas ref={canvas} className="au-globe-canvas" />
    </div>
  );
}
