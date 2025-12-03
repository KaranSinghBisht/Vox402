"use client";
import React, { useEffect, useState } from "react";

const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}!@#$%^&*";

export function DecryptedText({ text, speed = 80, maxIterations = 10 }: { text: string; speed?: number; maxIterations?: number }) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    let frame = 0;
    const letters = text.split("");
    const interval = setInterval(() => {
      const next = letters.map((char, idx) => {
        if (char === " " || frame > maxIterations + idx) return char;
        return charset[Math.floor(Math.random() * charset.length)] ?? char;
      });
      setDisplay(next.join(""));
      frame++;
      if (frame > maxIterations + letters.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, maxIterations]);

  return <>{display}</>;
}
