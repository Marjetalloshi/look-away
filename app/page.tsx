"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const LookAwaySketch = require("./LookAwaySketch").default;
  return <LookAwaySketch />;
}
