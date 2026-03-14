"use client";

import { useEffect, useRef, useState } from "react";

const IRIS_COLORS = ["#8B0BDE", "#145CFC", "#FC3702", "#2C7A15", "#F8E103", "#D556DF"];
const SCLERA_COLORS = ["#FFFFFF"];

export default function LookAwaySketch() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lookAwayRef = useRef(false);
  const eyeSizeRef = useRef(28);
  const bounceRef = useRef(0.6);
  const frictionRef = useRef(0.05);
  const airDragRef = useRef(0.005);
  const densityRef = useRef(0.002);
  const attractionRef = useRef(0.0006);
  const shakeIntensityRef = useRef(15);
  const shakeModeRef = useRef<string>("explode");
  const [shakeMode, setShakeMode] = useState(() => {
    if (typeof window === "undefined") return "explode";
    try {
      const s = localStorage.getItem("lookaway-state");
      if (s) return JSON.parse(s).settings?.shakeMode || "explode";
    } catch {}
    return "explode";
  });
  const eyeShapeRef = useRef<string>("circle");
  const motionSweepRef = useRef(0.5);
  const crossStitchRef = useRef(false);
  const crossStitchSizeRef = useRef(8);
  const crossStitchThicknessRef = useRef(0.15);
  const crossStitchGapRef = useRef(0.15);
  const crossStitchStyleRef = useRef<string>("embroidery");
  const crossStitchBgRef = useRef("#000000");
  const [crossStitch, setCrossStitch] = useState(false);
  const [crossStitchStyle, setCrossStitchStyle] = useState("embroidery");
  const [crossStitchBg, setCrossStitchBg] = useState("#000000");
  const irisColorRef = useRef<string | null>(null);
  const scleraColorRef = useRef<string | null>(null);
  const POSTER_SIZES: Record<string, { label: string; w: number; h: number }> = {
    fullscreen: { label: "Fullscreen", w: 0, h: 0 },
    square: { label: "1080×1080", w: 1080, h: 1080 },
    story: { label: "1080×1920", w: 1080, h: 1920 },
    landscape: { label: "1920×1080", w: 1920, h: 1080 },
  };
  const [posterSize, setPosterSize] = useState(() => {
    if (typeof window === "undefined") return "fullscreen";
    try {
      const s = localStorage.getItem("lookaway-state");
      if (s) return JSON.parse(s).settings?.posterSize || "fullscreen";
    } catch {}
    return "fullscreen";
  });
  const posterSizeRef = useRef(posterSize);
  const [panelOpen, setPanelOpen] = useState(true);
  const [activeStyle, setActiveStyle] = useState<string>(() => {
    if (typeof window === "undefined") return "style1";
    try {
      const s = localStorage.getItem("lookaway-state");
      if (s) return JSON.parse(s).settings?.activeStyle || "style1";
    } catch {}
    return "style1";
  });
  const activeStyleRef = useRef<string>(activeStyle);
  const actionsRef = useRef<{
    shake: () => void;
    reset: () => void;
    updatePhysics: () => void;
    exportSVG: () => void;
    startRecording: () => void;
    stopRecording: () => void;
  }>({ shake: () => {}, reset: () => {}, updatePhysics: () => {}, exportSVG: () => {}, startRecording: () => {}, stopRecording: () => {} });
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    async function init() {
      const Matter = await import("matter-js");
      const p5Module = await import("p5");
      const p5 = p5Module.default;

      // If unmounted while awaiting imports, bail out
      if (cancelled) return;

      const { Engine, Bodies, Body, Composite, Runner } = Matter;

      const engine = Engine.create({
        gravity: { x: 0, y: 0 },
        positionIterations: 6,
        velocityIterations: 4,
      });
      const runner = Runner.create();
      Runner.run(runner, engine);

      const ps = POSTER_SIZES[posterSizeRef.current];
      const W = ps && ps.w > 0 ? ps.w : window.innerWidth;
      const H = ps && ps.h > 0 ? ps.h : window.innerHeight;
      interface CenterPoint {
        x: number;
        y: number;
        scale: number;
        bodies: Matter.Body[];
      }

      const logoW = 48;
      const logoH = 20;
      const logoPad = 3; // padding around each letter block
      const centers: CenterPoint[] = [];

      // Collision boxes matching actual SVG filled areas
      const letterBoxes = [
        // m: three bars + arches as 3 boxes
        { x: 0,    y: 0,    w: 7.93, h: 20 },   // left bar
        { x: 8,    y: 0,    w: 10,   h: 20 },    // middle bar + arches
        { x: 18,   y: 0,    w: 10,   h: 20 },    // right bar + arches
        // e: top arc, center, bottom
        { x: 28.4, y: 0,    w: 19.6, h: 10 },    // top half
        { x: 28.4, y: 10,   w: 10,   h: 10 },    // bottom-left
        { x: 38.4, y: 10,   w: 6.3,  h: 10 },    // bottom-right tail
      ];

      function makeCenterBodies(x: number, y: number, scale: number): Matter.Body[] {
        const ox = x - (logoW / 2) * scale;
        const oy = y - (logoH / 2) * scale;
        return letterBoxes.map(lb => {
          const bx = ox + (lb.x + lb.w / 2) * scale;
          const by = oy + (lb.y + lb.h / 2) * scale;
          const bw = (lb.w + logoPad * 2) * scale;
          const bh = (lb.h + logoPad * 2) * scale;
          return Bodies.rectangle(bx, by, bw, bh, {
            isStatic: true,
            label: "center",
          });
        });
      }

      function addCenter(x: number, y: number, scale = 1): CenterPoint {
        const bodies = makeCenterBodies(x, y, scale);
        Composite.add(engine.world, bodies);
        const c = { x, y, scale, bodies };
        centers.push(c);
        return c;
      }

      function rescaleCenter(c: CenterPoint, newScale: number) {
        c.scale = Math.max(0.3, Math.min(20, newScale));
        for (const b of c.bodies) Composite.remove(engine.world, b);
        c.bodies = makeCenterBodies(c.x, c.y, c.scale);
        Composite.add(engine.world, c.bodies);
      }

      function repositionCenter(c: CenterPoint, nx: number, ny: number) {
        c.x = nx;
        c.y = ny;
        for (const b of c.bodies) Composite.remove(engine.world, b);
        c.bodies = makeCenterBodies(nx, ny, c.scale);
        Composite.add(engine.world, c.bodies);
      }

      // Restore or create initial center
      const saved = localStorage.getItem("lookaway-state");
      let savedState: {
        eyes: { x: number; y: number; vx: number; vy: number; radius: number; irisColor: string; scleraColor: string }[];
        centers: { x: number; y: number; scale?: number }[];
        settings: {
          activeStyle: string;
          eyeSize: number; bounce: number; friction: number; airDrag: number;
          density: number; attraction: number; shakeIntensity: number;
          shakeMode: string; eyeShape: string; lookAway: boolean;
        };
      } | null = null;
      try { if (saved) savedState = JSON.parse(saved); } catch {}

      if (savedState && savedState.centers.length > 0) {
        for (const c of savedState.centers) addCenter(c.x, c.y, c.scale ?? 1);
      } else {
        addCenter(W / 2, H / 2);
      }

      let draggingCenter: CenterPoint | null = null;

      // Walls (no restitution — eyes don't bounce off edges much)
      const wallOpts = { isStatic: true, label: "wall", restitution: 0.2 };
      const t = 100;
      const walls = [
        Bodies.rectangle(W / 2, -t / 2, W + 2 * t, t, wallOpts),
        Bodies.rectangle(W / 2, H + t / 2, W + 2 * t, t, wallOpts),
        Bodies.rectangle(-t / 2, H / 2, t, H + 2 * t, wallOpts),
        Bodies.rectangle(W + t / 2, H / 2, t, H + 2 * t, wallOpts),
      ];
      let wallsActive = false;

      interface EyeData {
        body: Matter.Body;
        radius: number;
        irisColor: string;
        scleraColor: string;
      }

      const eyes: EyeData[] = [];

      function gaussRandom(mean: number, stddev: number): number {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z * stddev;
      }

      // Audio context for spawn sounds
      let audioCtx: AudioContext | null = null;
      let lastSoundTime = 0;
      function playSpawnSound(radius: number) {
        const now = performance.now();
        if (now - lastSoundTime < 80) return; // throttle sounds
        lastSoundTime = now;
        if (!audioCtx) audioCtx = new AudioContext();
        const freq = 800 - ((radius - 8) / 47) * 600;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        if (navigator.vibrate) navigator.vibrate(radius > 30 ? 30 : 10);
      }

      function spawnEye(x: number, y: number) {
        const baseSize = eyeSizeRef.current;
        const radius = Math.max(8, Math.min(55, gaussRandom(baseSize, baseSize * 0.35)));
        // Collision body — tighter for rectangles
        const collisionScale = eyeShapeRef.current === "rect" ? 0.45 : 1.05;
        const body = Bodies.circle(x, y, radius * collisionScale, {
          restitution: bounceRef.current,
          friction: frictionRef.current,
          frictionAir: airDragRef.current,
          // Density scales with size — bigger eyes are heavier, pulled harder
          density: densityRef.current * (radius / 20),
          label: "eye",
        });
        Composite.add(engine.world, body);
        const irisColor = irisColorRef.current ?? IRIS_COLORS[Math.floor(Math.random() * IRIS_COLORS.length)];
        const scleraColor = scleraColorRef.current ?? SCLERA_COLORS[Math.floor(Math.random() * SCLERA_COLORS.length)];
        eyes.push({ body, radius, irisColor, scleraColor });
        playSpawnSound(radius);
      }

      function duplicateEye(source: EyeData, x: number, y: number) {
        const body = Bodies.circle(x, y, source.radius * 1.05, {
          restitution: bounceRef.current,
          friction: frictionRef.current,
          frictionAir: airDragRef.current,
          density: densityRef.current * (source.radius / 20),
          label: "eye",
        });
        Composite.add(engine.world, body);
        eyes.push({ body, radius: source.radius, irisColor: source.irisColor, scleraColor: source.scleraColor });
      }

      function findEyeAt(mx: number, my: number): EyeData | null {
        for (let i = eyes.length - 1; i >= 0; i--) {
          const e = eyes[i];
          if (!e.body || !e.body.position) continue;
          const dx = mx - e.body.position.x;
          const dy = my - e.body.position.y;
          if (dx * dx + dy * dy <= e.radius * e.radius) return e;
        }
        return null;
      }

      // Restore saved eyes
      if (savedState) {
        // Restore settings
        const ss = savedState.settings;
        eyeSizeRef.current = ss.eyeSize;
        bounceRef.current = ss.bounce;
        frictionRef.current = ss.friction;
        airDragRef.current = ss.airDrag;
        densityRef.current = ss.density;
        attractionRef.current = ss.attraction;
        shakeIntensityRef.current = ss.shakeIntensity;
        shakeModeRef.current = ss.shakeMode;
        eyeShapeRef.current = ss.eyeShape;
        lookAwayRef.current = ss.lookAway;
        if (ss.motionSweep !== undefined) motionSweepRef.current = ss.motionSweep;
        if (ss.crossStitch !== undefined) { crossStitchRef.current = ss.crossStitch; setCrossStitch(ss.crossStitch); }
        if (ss.crossStitchSize !== undefined) crossStitchSizeRef.current = ss.crossStitchSize;
        if (ss.crossStitchThickness !== undefined) crossStitchThicknessRef.current = ss.crossStitchThickness;
        if (ss.crossStitchGap !== undefined) crossStitchGapRef.current = ss.crossStitchGap;
        if (ss.crossStitchStyle !== undefined) { crossStitchStyleRef.current = ss.crossStitchStyle; setCrossStitchStyle(ss.crossStitchStyle); }
        if (ss.crossStitchBg !== undefined) { crossStitchBgRef.current = ss.crossStitchBg; setCrossStitchBg(ss.crossStitchBg); }
        if (ss.posterSize !== undefined) { posterSizeRef.current = ss.posterSize; setPosterSize(ss.posterSize); }

        for (const se of savedState.eyes) {
          const body = Bodies.circle(se.x, se.y, se.radius * 1.05, {
            restitution: bounceRef.current,
            friction: frictionRef.current,
            frictionAir: airDragRef.current,
            density: densityRef.current * (se.radius / 20),
            label: "eye",
          });
          Body.setVelocity(body, { x: se.vx, y: se.vy });
          Composite.add(engine.world, body);
          eyes.push({ body, radius: se.radius, irisColor: se.irisColor, scleraColor: se.scleraColor });
        }
      }

      // "me" logo SVG paths (48x20)
      const logoPaths = [
        "M27.9728 9.78723H20.0402C20.0402 8.85106 19.2887 8.08511 18.3702 8.08511V0C23.6725 0 27.9728 4.38298 27.9728 9.78723ZM7.93259 20H0V10.2128H7.93259V20ZM27.9728 20H20.0402V10.2128H27.9728V20ZM17.9527 9.78723H10.0201C10.0201 8.85106 9.26861 8.08511 8.3501 8.08511V0C13.6524 0 17.9527 4.38298 17.9527 9.78723ZM17.9527 20H10.0201V10.2128H17.9527V20ZM7.93259 9.78723H0V0H7.93259V9.78723Z",
        "M36.3099 9.78723H28.3773C28.3773 4.38298 32.6776 0 37.9799 0V8.08511C37.0614 8.08511 36.3099 8.85106 36.3099 9.78723ZM48 9.78723H40.0674C40.0674 8.85106 39.3159 8.08511 38.3974 8.08511V0C43.6997 0 48 4.38298 48 9.78723ZM28.3773 10.2128H36.3099C36.3099 11.1489 37.0614 11.9149 37.9799 11.9149V20C32.6776 20 28.3773 15.617 28.3773 10.2128ZM38.3974 20V11.9149H44.66V20H38.3974Z",
      ];

      // --- p5.js sketch ---
      let isHolding = false;
      let spawnX = 0;
      let spawnY = 0;

      const sketch = (p: import("p5")) => {
        let canvasScale = 1;
        p.setup = () => {
          const canvas = p.createCanvas(W, H);
          canvas.parent(containerRef.current!);
          // Scale canvas CSS to fit viewport while keeping full resolution
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          if (W > vw || H > vh) {
            canvasScale = Math.min(vw / W, vh / H) * 0.9;
            const el = canvas.elt as HTMLCanvasElement;
            el.style.width = `${W * canvasScale}px`;
            el.style.height = `${H * canvasScale}px`;
          }
          p.noStroke();
        };

        // Scaled mouse coordinates
        function mx() { return p.mouseX / canvasScale; }
        function my() { return p.mouseY / canvasScale; }

        // Draw circle eye — uses native canvas API for globalAlpha compatibility
        function drawEye(
          x: number, y: number, radius: number,
          lookAngle: number, irisColor: string, scleraColor: string
        ) {
          const ctx = (p as any).drawingContext as CanvasRenderingContext2D;

          // Sclera
          ctx.fillStyle = scleraColor;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();

          // Iris — offset toward look direction
          const irisRadius = radius * 0.53;
          const irisOffset = radius * 0.28;
          const ix = x + Math.cos(lookAngle) * irisOffset;
          const iy = y + Math.sin(lookAngle) * irisOffset;
          ctx.fillStyle = irisColor;
          ctx.beginPath();
          ctx.arc(ix, iy, irisRadius, 0, Math.PI * 2);
          ctx.fill();

          // Pupil
          const pupilRadius = irisRadius * 0.61;
          const pupilOffset = irisOffset * 1.1;
          const px = x + Math.cos(lookAngle) * pupilOffset;
          const py = y + Math.sin(lookAngle) * pupilOffset;
          ctx.fillStyle = "#000000";
          ctx.beginPath();
          ctx.arc(px, py, pupilRadius, 0, Math.PI * 2);
          ctx.fill();

          // Highlight dot
          const hlRadius = Math.max(1.5, irisRadius * 0.12);
          const hlx = ix - Math.cos(lookAngle) * irisRadius * 0.3 + Math.cos(lookAngle + 1) * irisRadius * 0.15;
          const hly = iy - Math.sin(lookAngle) * irisRadius * 0.3 + Math.sin(lookAngle + 1) * irisRadius * 0.15;
          ctx.fillStyle = scleraColor;
          ctx.beginPath();
          ctx.arc(hlx, hly, hlRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw triangle eye — vertex 0 (apex) points toward lookAngle
        // Iris/pupil/highlight sit near the apex
        function drawTriangleEye(
          x: number, y: number, radius: number,
          lookAngle: number, irisColor: string, scleraColor: string
        ) {
          const ctx = (p as any).drawingContext as CanvasRenderingContext2D;

          function tri(cx: number, cy: number, r: number, angle: number) {
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
              // vertex 0 points directly at `angle`
              const a = angle + (i * 2 * Math.PI) / 3;
              const tx = cx + Math.cos(a) * r;
              const ty = cy + Math.sin(a) * r;
              if (i === 0) ctx.moveTo(tx, ty);
              else ctx.lineTo(tx, ty);
            }
            ctx.closePath();
          }

          // Sclera — outer white triangle
          ctx.fillStyle = scleraColor;
          tri(x, y, radius, lookAngle);
          ctx.fill();

          // Shift iris/pupil toward the apex (which is at lookAngle direction)
          const irisShift = radius * 0.3;
          const ix = x + Math.cos(lookAngle) * irisShift;
          const iy = y + Math.sin(lookAngle) * irisShift;
          const irisR = radius * 0.55;
          ctx.fillStyle = irisColor;
          tri(ix, iy, irisR, lookAngle);
          ctx.fill();

          // Pupil — black, closer to apex
          const pupilShift = radius * 0.38;
          const px = x + Math.cos(lookAngle) * pupilShift;
          const py = y + Math.sin(lookAngle) * pupilShift;
          const pupilR = radius * 0.35;
          ctx.fillStyle = "#000000";
          tri(px, py, pupilR, lookAngle);
          ctx.fill();

          // Highlight — tiny white triangle inside pupil
          const hlR = radius * 0.08;
          const hlx = px + Math.cos(lookAngle + 2.5) * pupilR * 0.3;
          const hly = py + Math.sin(lookAngle + 2.5) * pupilR * 0.3;
          ctx.fillStyle = scleraColor;
          tri(hlx, hly, hlR, lookAngle);
          ctx.fill();
        }

        // Draw split-ring eye — colored ring with two gap cuts + colored center dot
        // Rectangle eye from SVG — colored outer rect, black inner rect, white highlight
        // SVG: outer 214x191, inner 142x126 at (40, 53), highlight 25x23 at (142, 71)
        function drawRectEye(
          x: number, y: number, radius: number,
          lookAngle: number, irisColor: string
        ) {
          const ctx = (p as any).drawingContext as CanvasRenderingContext2D;

          const outerW = radius * 2;
          const outerH = outerW * (191.085 / 214.325); // keep SVG aspect ratio

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(lookAngle - Math.PI / 2); // rotate so "top" of SVG points toward center

          // Outer colored rect
          ctx.fillStyle = irisColor;
          ctx.fillRect(-outerW / 2, -outerH / 2, outerW, outerH);

          // Inner black rect — exact SVG position ratios
          // SVG: inner starts at (39.8/214.3, 52.6/191.1) = (18.6%, 27.5%) from top-left
          const innerW = outerW * (142.231 / 214.325);
          const innerH = outerH * (126.428 / 191.085);
          const innerX = -outerW / 2 + outerW * (39.806 / 214.325);
          const innerY = -outerH / 2 + outerH * (52.592 / 191.085);
          ctx.fillStyle = "#000000";
          ctx.fillRect(innerX, innerY, innerW, innerH);

          // White highlight — exact SVG position ratios
          // SVG: highlight at (142.1/214.3, 71.1/191.1) from top-left
          const hlW = outerW * (24.834 / 214.325);
          const hlH = outerH * (22.576 / 191.085);
          const hlX = -outerW / 2 + outerW * (142.121 / 214.325);
          const hlY = -outerH / 2 + outerH * (71.058 / 191.085);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(hlX, hlY, hlW, hlH);

          ctx.restore();
        }

        p.draw = () => {
          p.background(0);

          // Continuous spawning while mouse held
          if (isHolding && p.frameCount % 4 === 0) {
            const angle = Math.random() * Math.PI * 2;
            const spread = 20 + Math.random() * 15;
            const ox = Math.cos(angle) * spread;
            const oy = Math.sin(angle) * spread;
            spawnEye(spawnX + ox, spawnY + oy);
            const last = eyes[eyes.length - 1];
            if (last && last.body) {
              Body.setVelocity(last.body, {
                x: Math.cos(angle) * 2,
                y: Math.sin(angle) * 2,
              });
            }
          }

          const isLookAway = lookAwayRef.current;
          const attractionStrength = attractionRef.current;

          // Walls always active
          if (!wallsActive) {
            Composite.add(engine.world, walls);
            wallsActive = true;
          }

          // Sort eyes once in-place (big first so small draw on top)
          eyes.sort((a, b) => b.radius - a.radius);

          // Apply attraction/repulsion toward nearest center
          for (const eye of eyes) {
            const b = eye.body;
            if (!b || !b.position) continue;
            let bestDx = 0, bestDy = 0, bestD2 = Infinity;
            for (const c of centers) {
              const dx = c.x - b.position.x;
              const dy = c.y - b.position.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < bestD2) { bestDx = dx; bestDy = dy; bestD2 = d2; }
            }
            const dist = Math.sqrt(bestD2);
            if (dist > 1) {
              const gravityScale = Math.min(3, 300 / (dist + 50));
              const force = attractionStrength * b.mass * gravityScale;
              const dir = isLookAway ? -1 : 1;
              Body.applyForce(b, b.position, {
                x: (bestDx / dist) * force * dir,
                y: (bestDy / dist) * force * dir,
              });
            }
            // Cache for draw phase
            (eye as any)._ncAngle = Math.atan2(bestDy, bestDx);
          }

          // Draw eyes
          const shape = eyeShapeRef.current;
          const ctx = (p as any).drawingContext as CanvasRenderingContext2D;

          for (const eye of eyes) {
            const { body, radius, irisColor, scleraColor } = eye;
            if (!body || !body.position) continue;
            const x = body.position.x;
            const y = body.position.y;
            const vx = body.velocity.x;
            const vy = body.velocity.y;
            const speed = vx * vx + vy * vy; // squared, skip sqrt

            const angle = (eye as any)._ncAngle || 0;
            const lookAngle = isLookAway ? angle + Math.PI : angle;

            // Motion sweep — ghost trails behind eyes (only when moving)
            const sweep = motionSweepRef.current;
            if (sweep > 0 && speed > 0.25) { // speed is squared, 0.25 = 0.5^2
              const sweepCount = 3 + Math.round(sweep * 8);
              const trailLen = sweep * 30;
              for (let s = sweepCount; s >= 1; s--) {
                const t = s / sweepCount;
                const gx = x - vx * t * trailLen;
                const gy = y - vy * t * trailLen;
                ctx.save();
                ctx.globalAlpha = sweep * 0.25 * (1 - t);
                if (shape === "triangle") {
                  drawTriangleEye(gx, gy, radius, lookAngle, irisColor, scleraColor);
                } else if (shape === "rect") {
                  drawRectEye(gx, gy, radius, lookAngle, irisColor);
                } else {
                  drawEye(gx, gy, radius, lookAngle, irisColor, scleraColor);
                }
                ctx.restore();
              }
            }

            // Main eye
            if (shape === "triangle") {
              drawTriangleEye(x, y, radius, lookAngle, irisColor, scleraColor);
            } else if (shape === "rect") {
              drawRectEye(x, y, radius, lookAngle, irisColor);
            } else {
              drawEye(x, y, radius, lookAngle, irisColor, scleraColor);
            }
          }

          // Center logo — draw for each center
          ctx.fillStyle = "#ffffff";
          for (const c of centers) {
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.scale(c.scale, c.scale);
            ctx.translate(-logoW / 2, -logoH / 2);
            for (const d of logoPaths) {
              const path = new Path2D(d);
              ctx.fill(path);
            }
            ctx.restore();
          }

          // Cross-stitch post-processing
          if (crossStitchRef.current) {
            const grid = crossStitchSizeRef.current;
            const dpr = p.pixelDensity();
            const cw = W * dpr;
            const ch = H * dpr;
            const imgData = ctx.getImageData(0, 0, cw, ch);
            const pixels = imgData.data;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = crossStitchBgRef.current;
            ctx.fillRect(0, 0, cw, ch);
            const thickness = crossStitchThicknessRef.current;
            const gap = crossStitchGapRef.current;
            const stitchStyle = crossStitchStyleRef.current;
            const lw = Math.max(1, grid * dpr * thickness);
            ctx.lineWidth = lw;
            ctx.lineCap = stitchStyle === "simple" ? "round" : "square";

            // Batch stitches by color to minimize state changes
            const colorMap = new Map<string, { x1: number; y1: number; x2: number; y2: number }[]>();
            const gridPx = grid * dpr;
            const halfGrid = gridPx / 2;
            const pad = gridPx * gap;

            for (let gy = 0; gy < ch; gy += gridPx) {
              for (let gx = 0; gx < cw; gx += gridPx) {
                const sx = Math.min((gx + halfGrid) | 0, cw - 1);
                const sy = Math.min((gy + halfGrid) | 0, ch - 1);
                const idx = (sy * cw + sx) * 4;
                let r = pixels[idx];
                let g = pixels[idx + 1];
                let b = pixels[idx + 2];

                if (r < 10 && g < 10 && b < 10) continue;

                const max = Math.max(r, g, b);
                if (max > 0) {
                  const boost = 255 / max;
                  r = (r * boost) | 0;
                  g = (g * boost) | 0;
                  b = (b * boost) | 0;
                  const avg = (r + g + b) / 3;
                  r = Math.min(255, Math.max(0, (avg + (r - avg) * 2.5) | 0));
                  g = Math.min(255, Math.max(0, (avg + (g - avg) * 2.5) | 0));
                  b = Math.min(255, Math.max(0, (avg + (b - avg) * 2.5) | 0));
                }

                const key = `${r},${g},${b}`;
                let arr = colorMap.get(key);
                if (!arr) { arr = []; colorMap.set(key, arr); }
                arr.push({ x1: gx + pad, y1: gy + pad, x2: gx + gridPx - pad, y2: gy + gridPx - pad });
              }
            }

            // Draw all stitches batched by color
            for (const [color, cells] of colorMap) {
              ctx.strokeStyle = `rgb(${color})`;
              ctx.beginPath();
              for (const c of cells) {
                ctx.moveTo(c.x1, c.y1);
                ctx.lineTo(c.x2, c.y2);
                ctx.moveTo(c.x2, c.y1);
                ctx.lineTo(c.x1, c.y2);
              }
              ctx.stroke();

              if (stitchStyle === "embroidery") {
                ctx.fillStyle = `rgb(${color})`;
                const dotS = lw * 0.6;
                const halfDot = dotS / 2;
                for (const c of cells) {
                  const cx = (c.x1 + c.x2) / 2;
                  const cy = (c.y1 + c.y2) / 2;
                  ctx.fillRect(cx - halfDot, cy - halfDot, dotS, dotS);
                }
              }
            }
            ctx.restore();
          }
        };

        let isDuplicating = false;
        let duplicateSource: EyeData | null = null;
        let altDown = false;
        let shiftDown = false;

        window.addEventListener("keydown", (e) => {
          if (e.key === "Alt") altDown = true;
          if (e.key === "Shift") shiftDown = true;
        });
        window.addEventListener("keyup", (e) => {
          if (e.key === "Alt") altDown = false;
          if (e.key === "Shift") shiftDown = false;
        });

        p.doubleClicked = () => {
          // Double-click on a center to delete it (keep at least one)
          if (centers.length > 1) {
            for (let i = 0; i < centers.length; i++) {
              if (p.dist(mx(), my(), centers[i].x, centers[i].y) < 60) {
                for (const b of centers[i].bodies) Composite.remove(engine.world, b);
                centers.splice(i, 1);
                return;
              }
            }
          }
        };

        p.mousePressed = () => {
          const target = document.elementFromPoint(p.mouseX, p.mouseY);
          if (target && target.tagName === "CANVAS") {
            // Check if clicking near any center
            let clickedCenter: CenterPoint | null = null;
            for (const c of centers) {
              if (p.dist(mx(), my(), c.x, c.y) < 60) {
                clickedCenter = c;
                break;
              }
            }

            // Option+Shift+click to duplicate
            if (altDown && shiftDown) {
              // Duplicate center text
              if (clickedCenter) {
                const newC = addCenter(mx(), my());
                isDuplicating = true;
                draggingCenter = newC;
                return;
              }
              // Duplicate eye
              const hit = findEyeAt(mx(), my());
              if (hit) {
                isDuplicating = true;
                duplicateSource = hit;
                duplicateEye(hit, mx(), my());
                return;
              }
            }

            if (clickedCenter) {
              draggingCenter = clickedCenter;
            } else {
              isHolding = true;
              spawnX = mx();
              spawnY = my();
              for (let i = 0; i < 3; i++) {
                const ox = (Math.random() - 0.5) * 40;
                const oy = (Math.random() - 0.5) * 40;
                spawnEye(mx() + ox, my() + oy);
              }
            }
          }
        };

        p.mouseDragged = () => {
          if (isDuplicating && duplicateSource) {
            // Move the last spawned (duplicated) eye to cursor
            const last = eyes[eyes.length - 1];
            if (last && last.body) {
              Body.setPosition(last.body, { x: mx(), y: my() });
              Body.setVelocity(last.body, { x: 0, y: 0 });
            }
          } else if (draggingCenter) {
            repositionCenter(draggingCenter, mx(), my());
          } else {
            spawnX = mx();
            spawnY = my();
          }
        };

        p.mouseReleased = () => {
          isHolding = false;
          draggingCenter = null;
          isDuplicating = false;
          duplicateSource = null;
        };

        p.windowResized = () => {
          location.reload();
        };
      };

      const p5Instance = new p5(sketch);

      // Scroll to scale a center point
      const onWheel = (e: WheelEvent) => {
        for (const c of centers) {
          const dx = e.clientX - c.x;
          const dy = e.clientY - c.y;
          const hw = (logoW / 2 + logoPad) * c.scale;
          const hh = (logoH / 2 + logoPad) * c.scale;
          if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            rescaleCenter(c, c.scale * factor);
            break;
          }
        }
      };
      window.addEventListener("wheel", onWheel, { passive: false });

      // --- Actions ---
      actionsRef.current.shake = () => {
        const mode = shakeModeRef.current;
        const intensity = shakeIntensityRef.current;

        // Kill air friction temporarily
        const savedValues: { body: Matter.Body; air: number }[] = [];
        for (const eye of eyes) {
          if (!eye.body) continue;
          savedValues.push({ body: eye.body, air: eye.body.frictionAir });
          eye.body.frictionAir = 0;
        }

        for (const eye of eyes) {
          const b = eye.body;
          if (!b || !b.position) continue;
          // Find nearest center for this eye
          let cx = centers[0].x, cy = centers[0].y, cd = Infinity;
          for (const c of centers) {
            const d = (c.x - b.position.x) ** 2 + (c.y - b.position.y) ** 2;
            if (d < cd) { cx = c.x; cy = c.y; cd = d; }
          }
          const dx = b.position.x - cx;
          const dy = b.position.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) continue;
          const ndx = dx / dist;
          const ndy = dy / dist;

          if (mode === "explode") {
            const speed = intensity + (intensity * 200) / dist;
            const ra = (Math.random() - 0.5) * 0.8;
            Body.setVelocity(b, {
              x: (ndx * Math.cos(ra) - ndy * Math.sin(ra)) * speed,
              y: (ndx * Math.sin(ra) + ndy * Math.cos(ra)) * speed,
            });
          } else if (mode === "implode") {
            const speed = intensity + (intensity * 150) / dist;
            Body.setVelocity(b, {
              x: -ndx * speed,
              y: -ndy * speed,
            });
          } else if (mode === "vortex") {
            // Tangential velocity (perpendicular to radius)
            const speed = intensity * 0.8 + (intensity * 100) / dist;
            Body.setVelocity(b, {
              x: -ndy * speed,
              y: ndx * speed,
            });
          }
        }

        // Restore air friction after delay
        setTimeout(() => {
          for (const sv of savedValues) {
            if (sv.body) sv.body.frictionAir = sv.air;
          }
        }, 800);
      };

      let isResetting = false;
      actionsRef.current.reset = () => {
        isResetting = true;
        localStorage.removeItem("lookaway-state");
        window.location.reload();
      };

      actionsRef.current.updatePhysics = () => {
        for (const eye of eyes) {
          eye.body.restitution = bounceRef.current;
          eye.body.friction = frictionRef.current;
          eye.body.frictionAir = airDragRef.current;
          Body.setDensity(eye.body, densityRef.current * (eye.radius / 20));
        }
      };

      actionsRef.current.exportSVG = () => {
        const svgParts: string[] = [];
        svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);

        if (crossStitchRef.current) {
          // Cross-stitch SVG: read canvas pixels and generate SVG lines
          const canvasEl = containerRef.current?.querySelector("canvas");
          if (!canvasEl) return;
          const canvasCtx = canvasEl.getContext("2d");
          if (!canvasCtx) return;
          const dpr = window.devicePixelRatio || 1;
          const cw = W * dpr;
          const ch = H * dpr;
          const imgData = canvasCtx.getImageData(0, 0, cw, ch);
          const pixels = imgData.data;
          const grid = crossStitchSizeRef.current;
          const gridPx = grid * dpr;
          const thickness = crossStitchThicknessRef.current;
          const gap = crossStitchGapRef.current;
          const stitchStyle = crossStitchStyleRef.current;
          const bgColor = crossStitchBgRef.current;

          svgParts.push(`<rect width="${W}" height="${H}" fill="${bgColor}"/>`);

          for (let gy = 0; gy < ch; gy += gridPx) {
            for (let gx = 0; gx < cw; gx += gridPx) {
              const sx = Math.min(Math.floor(gx + gridPx / 2), cw - 1);
              const sy = Math.min(Math.floor(gy + gridPx / 2), ch - 1);
              const idx = (sy * cw + sx) * 4;
              let r = pixels[idx];
              let g = pixels[idx + 1];
              let b = pixels[idx + 2];

              if (r < 10 && g < 10 && b < 10) continue;

              const max = Math.max(r, g, b);
              if (max > 0) {
                const boost = 255 / max;
                r = Math.round(r * boost);
                g = Math.round(g * boost);
                b = Math.round(b * boost);
                const avg = (r + g + b) / 3;
                const sat = 2.5;
                r = Math.min(255, Math.max(0, Math.round(avg + (r - avg) * sat)));
                g = Math.min(255, Math.max(0, Math.round(avg + (g - avg) * sat)));
                b = Math.min(255, Math.max(0, Math.round(avg + (b - avg) * sat)));
              }

              // Convert from pixel coords to SVG coords
              const pad = grid * gap;
              const svgGx = gx / dpr;
              const svgGy = gy / dpr;
              const x1 = svgGx + pad;
              const y1 = svgGy + pad;
              const x2 = svgGx + grid - pad;
              const y2 = svgGy + grid - pad;
              const lw = Math.max(0.5, grid * thickness);
              const color = `rgb(${r},${g},${b})`;
              const cap = stitchStyle === "simple" ? "round" : "square";

              svgParts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${lw}" stroke-linecap="${cap}"/>`);
              svgParts.push(`<line x1="${x2}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="${color}" stroke-width="${lw}" stroke-linecap="${cap}"/>`);

              if (stitchStyle === "embroidery") {
                const cx = svgGx + grid / 2;
                const cy = svgGy + grid / 2;
                const dotS = lw * 0.6;
                svgParts.push(`<rect x="${cx - dotS / 2}" y="${cy - dotS / 2}" width="${dotS}" height="${dotS}" fill="${color}"/>`);
              }
            }
          }
        } else {
          // Normal SVG: vector shapes
          svgParts.push(`<rect width="${W}" height="${H}" fill="#000000"/>`);

          const isLookAway = lookAwayRef.current;
          const shape = eyeShapeRef.current;
          const sorted = [...eyes].sort((a, b) => b.radius - a.radius);

          for (const eye of sorted) {
            const { body, radius, irisColor, scleraColor } = eye;
            if (!body || !body.position) continue;
            const x = body.position.x;
            const y = body.position.y;

            let ncx = centers[0].x, ncy = centers[0].y, nd = Infinity;
            for (const c of centers) {
              const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
              if (d < nd) { ncx = c.x; ncy = c.y; nd = d; }
            }
            const angle = Math.atan2(ncy - y, ncx - x);
            const lookAngle = isLookAway ? angle + Math.PI : angle;

            if (shape === "circle") {
              svgParts.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="${scleraColor}"/>`);
              const irisRadius = radius * 0.53;
              const irisOffset = radius * 0.28;
              const ix = x + Math.cos(lookAngle) * irisOffset;
              const iy = y + Math.sin(lookAngle) * irisOffset;
              svgParts.push(`<circle cx="${ix}" cy="${iy}" r="${irisRadius}" fill="${irisColor}"/>`);
              const pupilRadius = irisRadius * 0.61;
              const pupilOffset = irisOffset * 1.1;
              const px = x + Math.cos(lookAngle) * pupilOffset;
              const py = y + Math.sin(lookAngle) * pupilOffset;
              svgParts.push(`<circle cx="${px}" cy="${py}" r="${pupilRadius}" fill="#000000"/>`);
              const hlRadius = Math.max(1.5, irisRadius * 0.12);
              const hlx = ix - Math.cos(lookAngle) * irisRadius * 0.3 + Math.cos(lookAngle + 1) * irisRadius * 0.15;
              const hly = iy - Math.sin(lookAngle) * irisRadius * 0.3 + Math.sin(lookAngle + 1) * irisRadius * 0.15;
              svgParts.push(`<circle cx="${hlx}" cy="${hly}" r="${hlRadius}" fill="${scleraColor}"/>`);

            } else if (shape === "triangle") {
              function triPoints(cx: number, cy: number, r: number, a: number): string {
                const pts: string[] = [];
                for (let i = 0; i < 3; i++) {
                  const va = a + (i * 2 * Math.PI) / 3;
                  pts.push(`${cx + Math.cos(va) * r},${cy + Math.sin(va) * r}`);
                }
                return pts.join(" ");
              }
              svgParts.push(`<polygon points="${triPoints(x, y, radius, lookAngle)}" fill="${scleraColor}"/>`);
              const irisShift = radius * 0.3;
              const ix = x + Math.cos(lookAngle) * irisShift;
              const iy = y + Math.sin(lookAngle) * irisShift;
              svgParts.push(`<polygon points="${triPoints(ix, iy, radius * 0.55, lookAngle)}" fill="${irisColor}"/>`);
              const pupilShift = radius * 0.38;
              const px = x + Math.cos(lookAngle) * pupilShift;
              const py = y + Math.sin(lookAngle) * pupilShift;
              svgParts.push(`<polygon points="${triPoints(px, py, radius * 0.35, lookAngle)}" fill="#000000"/>`);
              const hlR = radius * 0.08;
              const hlx = px + Math.cos(lookAngle + 2.5) * radius * 0.35 * 0.3;
              const hly = py + Math.sin(lookAngle + 2.5) * radius * 0.35 * 0.3;
              svgParts.push(`<polygon points="${triPoints(hlx, hly, hlR, lookAngle)}" fill="${scleraColor}"/>`);

            } else if (shape === "rect") {
              const outerW = radius * 2;
              const outerH = outerW * (191.085 / 214.325);
              const rotDeg = (lookAngle - Math.PI / 2) * (180 / Math.PI);
              svgParts.push(`<g transform="translate(${x},${y}) rotate(${rotDeg})">`);
              svgParts.push(`<rect x="${-outerW / 2}" y="${-outerH / 2}" width="${outerW}" height="${outerH}" fill="${irisColor}"/>`);
              const innerW = outerW * (142.231 / 214.325);
              const innerH = outerH * (126.428 / 191.085);
              const innerX = -outerW / 2 + outerW * (39.806 / 214.325);
              const innerY = -outerH / 2 + outerH * (52.592 / 191.085);
              svgParts.push(`<rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="#000000"/>`);
              const hlW = outerW * (24.834 / 214.325);
              const hlH = outerH * (22.576 / 191.085);
              const hlX = -outerW / 2 + outerW * (142.121 / 214.325);
              const hlY = -outerH / 2 + outerH * (71.058 / 191.085);
              svgParts.push(`<rect x="${hlX}" y="${hlY}" width="${hlW}" height="${hlH}" fill="#ffffff"/>`);
              svgParts.push(`</g>`);
            }
          }

          // Center logo
          for (const c of centers) {
            svgParts.push(`<g transform="translate(${c.x},${c.y}) scale(${c.scale}) translate(${-logoW / 2},${-logoH / 2})">`);
            for (const d of logoPaths) {
              svgParts.push(`<path d="${d}" fill="#ffffff"/>`);
            }
            svgParts.push(`</g>`);
          }
        }

        svgParts.push(`</svg>`);
        const svgContent = svgParts.join("\n");
        const blob = new Blob([svgContent], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "look-away.svg";
        a.click();
        URL.revokeObjectURL(url);
      };

      // MP4 video recording
      let mediaRecorder: MediaRecorder | null = null;
      let recordedChunks: Blob[] = [];

      actionsRef.current.startRecording = () => {
        const canvasEl = containerRef.current?.querySelector("canvas");
        if (!canvasEl) return;
        const stream = canvasEl.captureStream(30);
        recordedChunks = [];
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
        mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "look-away.webm";
          a.click();
          URL.revokeObjectURL(url);
          setIsRecording(false);
        };
        mediaRecorder.start();
        setIsRecording(true);
      };

      actionsRef.current.stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      };

      // Save state before page unload
      const saveState = () => {
        if (isResetting) return;
        const state = {
          eyes: eyes.map(e => ({
            x: e.body.position.x,
            y: e.body.position.y,
            vx: e.body.velocity.x,
            vy: e.body.velocity.y,
            radius: e.radius,
            irisColor: e.irisColor,
            scleraColor: e.scleraColor,
          })),
          centers: centers.map(c => ({ x: c.x, y: c.y, scale: c.scale })),
          settings: {
            activeStyle: activeStyleRef.current,
            eyeSize: eyeSizeRef.current,
            bounce: bounceRef.current,
            friction: frictionRef.current,
            airDrag: airDragRef.current,
            density: densityRef.current,
            attraction: attractionRef.current,
            shakeIntensity: shakeIntensityRef.current,
            shakeMode: shakeModeRef.current,
            eyeShape: eyeShapeRef.current,
            lookAway: lookAwayRef.current,
            motionSweep: motionSweepRef.current,
            crossStitch: crossStitchRef.current,
            crossStitchSize: crossStitchSizeRef.current,
            crossStitchThickness: crossStitchThicknessRef.current,
            crossStitchGap: crossStitchGapRef.current,
            crossStitchStyle: crossStitchStyleRef.current,
            crossStitchBg: crossStitchBgRef.current,
            posterSize: posterSizeRef.current,
          },
        };
        localStorage.setItem("lookaway-state", JSON.stringify(state));
      };
      window.addEventListener("beforeunload", saveState);

      cleanup = () => {
        window.removeEventListener("beforeunload", saveState);
        window.removeEventListener("wheel", onWheel);
        Runner.stop(runner);
        Engine.clear(engine);
        p5Instance.remove();
      };
    }

    init();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const STYLES: Record<string, {
    label: string;
    description: string;
    eyeShape: string;
    eyeSize: number;
    bounce: number;
    friction: number;
    airDrag: number;
    density: number;
    attraction: number;
    shakeIntensity: number;
    shakeMode: string;
  }> = {
    style1: {
      label: "style 1",
      description: "circle eyes",
      eyeShape: "circle",
      eyeSize: 24,
      bounce: 0.3,
      friction: 0.02,
      airDrag: 0.008,
      density: 0.0015,
      attraction: 0.0004,
      shakeIntensity: 10,
      shakeMode: "vortex",
    },
    style2: {
      label: "style 2",
      description: "triangle eyes",
      eyeShape: "triangle",
      eyeSize: 28,
      bounce: 0.8,
      friction: 0.05,
      airDrag: 0.003,
      density: 0.002,
      attraction: 0.0008,
      shakeIntensity: 20,
      shakeMode: "explode",
    },
    style3: {
      label: "style 3",
      description: "rectangle eyes",
      eyeShape: "rect",
      eyeSize: 38,
      bounce: 0.2,
      friction: 0.1,
      airDrag: 0.01,
      density: 0.005,
      attraction: 0.001,
      shakeIntensity: 25,
      shakeMode: "implode",
    },
  };

  function applyStyle(key: string) {
    const s = STYLES[key];
    eyeShapeRef.current = s.eyeShape;
    eyeSizeRef.current = s.eyeSize;
    bounceRef.current = s.bounce;
    frictionRef.current = s.friction;
    airDragRef.current = s.airDrag;
    densityRef.current = s.density;
    attractionRef.current = s.attraction;
    shakeIntensityRef.current = s.shakeIntensity;
    shakeModeRef.current = s.shakeMode;
    setShakeMode(s.shakeMode);
    setActiveStyle(key);
    activeStyleRef.current = key;
    actionsRef.current.updatePhysics();
  }

  const btnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 999,
    padding: "6px 16px",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "Helvetica, Arial, sans-serif",
  };

  const sliderStyle: React.CSSProperties = {
    width: "100%",
    accentColor: "#fff",
    height: 4,
  };

  const s = STYLES[activeStyle];

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      />

      {/* Toggle button */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        style={{
          position: "fixed",
          top: 24,
          left: 24,
          zIndex: 20,
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.2)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="2" width="14" height="14" rx="3" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
          {panelOpen ? (
            <path d="M6 6L12 12M12 6L6 12" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <>
              <line x1="5" y1="6.5" x2="13" y2="6.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="5" y1="9" x2="13" y2="9" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="5" y1="11.5" x2="13" y2="11.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {/* UI Controls */}
      <div
        style={{
          position: "fixed",
          top: 70,
          left: 24,
          display: panelOpen ? "flex" : "none",
          flexDirection: "column",
          gap: 10,
          zIndex: 10,
          fontFamily: "Helvetica, Arial, sans-serif",
          fontSize: 12,
          color: "#fff",
        }}
      >
        {/* Row 1: Styles */}
        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.6)", padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)" }}>
          {Object.entries(STYLES).map(([key, style]) => (
            <button key={key} onClick={() => applyStyle(key)}
              style={{ ...btnStyle, background: activeStyle === key ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)", fontSize: 9, padding: "3px 10px" }}>
              {style.label}
            </button>
          ))}
        </div>
        {/* Row 2: Actions */}
        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.6)", padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)" }}>
          <button id="look-away-btn"
            onClick={(e) => {
              lookAwayRef.current = !lookAwayRef.current;
              const btn = e.currentTarget;
              btn.textContent = lookAwayRef.current ? "look back" : "look away";
              btn.style.background = lookAwayRef.current ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)";
            }}
            style={{ ...btnStyle, fontSize: 9, padding: "3px 10px" }}>look away</button>
          <button onClick={() => actionsRef.current.reset()} style={{ ...btnStyle, fontSize: 9, padding: "3px 10px" }}>reset</button>
          <button onClick={() => actionsRef.current.exportSVG?.()} style={{ ...btnStyle, fontSize: 9, padding: "3px 10px" }}>save svg</button>
        </div>

        {/* Settings panel */}
        <div
          key={activeStyle}
          style={{
            background: "rgba(0,0,0,0.6)",
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 10,
            maxWidth: 220,
          }}
        >
          <span style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>eyes</span>
          <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: "3px 6px", alignItems: "center" }}>
            <span>size</span>
            <input type="range" min={8} max={55} defaultValue={s.eyeSize}
              onChange={(e) => { eyeSizeRef.current = Number(e.target.value); }}
              style={sliderStyle} />
            <span>motion</span>
            <input type="range" min={0} max={100} defaultValue={Math.round(motionSweepRef.current * 100)}
              onChange={(e) => { motionSweepRef.current = Number(e.target.value) / 100; }}
              style={sliderStyle} />
          </div>

          <span style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>cross-stitch</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button
              onClick={() => { const next = !crossStitch; setCrossStitch(next); crossStitchRef.current = next; }}
              style={{ ...btnStyle, background: crossStitch ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)", fontSize: 9, padding: "3px 8px" }}
            >{crossStitch ? "on" : "off"}</button>
            {crossStitch && (["simple", "embroidery"] as const).map((st) => (
              <button key={st}
                onClick={() => { setCrossStitchStyle(st); crossStitchStyleRef.current = st; }}
                style={{ ...btnStyle, background: crossStitchStyle === st ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)", fontSize: 9, padding: "3px 8px" }}
              >{st}</button>
            ))}
          </div>
          {crossStitch && (
            <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: "3px 6px", alignItems: "center" }}>
              <span>size</span>
              <input type="range" min={4} max={24} defaultValue={crossStitchSizeRef.current}
                onChange={(e) => { crossStitchSizeRef.current = Number(e.target.value); }} style={sliderStyle} />
              <span>thick</span>
              <input type="range" min={5} max={50} defaultValue={Math.round(crossStitchThicknessRef.current * 100)}
                onChange={(e) => { crossStitchThicknessRef.current = Number(e.target.value) / 100; }} style={sliderStyle} />
              <span>gap</span>
              <input type="range" min={0} max={40} defaultValue={Math.round(crossStitchGapRef.current * 100)}
                onChange={(e) => { crossStitchGapRef.current = Number(e.target.value) / 100; }} style={sliderStyle} />
              <span>bg</span>
              <input type="color" value={crossStitchBg}
                onChange={(e) => { crossStitchBgRef.current = e.target.value; setCrossStitchBg(e.target.value); }}
                style={{ width: "100%", height: 18, border: "none", borderRadius: 3, cursor: "pointer", background: "none" }} />
            </div>
          )}

          <span style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>physics</span>
          <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: "3px 6px", alignItems: "center" }}>
            <span>bounce</span>
            <input type="range" min={0} max={100} defaultValue={Math.round(s.bounce * 100)}
              onChange={(e) => { bounceRef.current = Number(e.target.value) / 100; actionsRef.current.updatePhysics(); }} style={sliderStyle} />
            <span>friction</span>
            <input type="range" min={0} max={100} defaultValue={Math.round(s.friction * 100)}
              onChange={(e) => { frictionRef.current = Number(e.target.value) / 100; actionsRef.current.updatePhysics(); }} style={sliderStyle} />
            <span>drag</span>
            <input type="range" min={0} max={100} defaultValue={Math.round(s.airDrag * 1000)}
              onChange={(e) => { airDragRef.current = Number(e.target.value) / 1000; actionsRef.current.updatePhysics(); }} style={sliderStyle} />
            <span>density</span>
            <input type="range" min={1} max={100} defaultValue={Math.round(s.density * 10000)}
              onChange={(e) => { densityRef.current = Number(e.target.value) / 10000; actionsRef.current.updatePhysics(); }} style={sliderStyle} />
            <span>attract</span>
            <input type="range" min={1} max={100} defaultValue={Math.round(s.attraction * 100000)}
              onChange={(e) => { attractionRef.current = Number(e.target.value) / 100000; }} style={sliderStyle} />
          </div>

          <span style={{ fontSize: 9, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>shake</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {(["explode", "implode", "vortex"] as const).map((mode) => (
              <button key={mode}
                onClick={() => { setShakeMode(mode); shakeModeRef.current = mode; }}
                style={{ ...btnStyle, background: shakeMode === mode ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)", fontSize: 9, padding: "3px 8px" }}
              >{mode}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "50px 1fr", gap: "3px 6px", alignItems: "center" }}>
            <span>intensity</span>
            <input type="range" min={0} max={30} defaultValue={s.shakeIntensity}
              onChange={(e) => { shakeIntensityRef.current = Number(e.target.value); }} style={sliderStyle} />
          </div>
          <button onClick={() => actionsRef.current.shake()} style={{ ...btnStyle, fontSize: 9, padding: "3px 10px", width: "100%" }}>shake</button>
        </div>

      </div>
    </>
  );
}
