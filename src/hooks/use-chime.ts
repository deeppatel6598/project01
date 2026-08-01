"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The new-order chime.
 *
 * Two problems it has to solve:
 *
 *   1. **Autoplay.** Browsers refuse to start audio until the page has had a
 *      real user gesture, so the AudioContext is only ever built inside one.
 *   2. **Remembering.** The pass screen gets switched on once in the morning
 *      and then nobody touches it, so the choice is stored — and on the next
 *      load the *first* tap anywhere on the board silently re-arms the sound
 *      rather than making staff hunt for the button again.
 *
 * Synthesised with an oscillator rather than shipped as an audio file: two
 * clean tones, no asset to load over cafe wifi, and no codec to worry about.
 */

const STORAGE_KEY = "tablekit:chime-enabled";

interface WindowWithLegacyAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function useChime() {
  const [enabled, setEnabled] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);

  const start = useCallback((): boolean => {
    if (contextRef.current) return true;

    try {
      const Ctor = window.AudioContext ?? (window as WindowWithLegacyAudio).webkitAudioContext;
      if (!Ctor) return false;

      const context = new Ctor();
      void context.resume();
      contextRef.current = context;
      return true;
    } catch {
      // No audio on this device; the board works fine silent.
      return false;
    }
  }, []);

  /** Called from the "Turn on sound" button — always inside a gesture. */
  const enable = useCallback(() => {
    if (!start()) return;
    setEnabled(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Non-fatal: sound works this session, just is not remembered.
    }
  }, [start]);

  const disable = useCallback(() => {
    setEnabled(false);
    void contextRef.current?.close();
    contextRef.current = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Non-fatal.
    }
  }, []);

  /**
   * Re-arm from the stored preference on the first interaction of the
   * session.
   *
   * The listener is the gesture the autoplay policy demands, so this needs no
   * button press of its own — a chef tapping "Start" on the first docket of
   * the morning is enough. Registered once and removed as soon as it fires.
   */
  useEffect(() => {
    let remembered = false;
    try {
      remembered = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Storage blocked — the button is still there.
    }
    if (!remembered) return;

    const onGesture = () => {
      if (start()) setEnabled(true);
    };

    // `once` unregisters after the first event, so this costs nothing beyond
    // the initial tap.
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [start]);

  const play = useCallback(() => {
    const context = contextRef.current;
    if (!enabled || !context) return;

    // A short two-note figure — audible over an espresso machine, and short
    // enough that four orders landing together do not turn into a drone.
    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    for (const [frequency, offset] of [
      [880, 0],
      [1320, 0.12],
    ] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      oscillator.connect(gain);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.3);
    }
  }, [enabled]);

  return { enabled, enable, disable, play };
}
