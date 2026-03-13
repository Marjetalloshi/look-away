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
  const irisColorRef = useRef<string | null>(null);
  const scleraColorRef = useRef<string | null>(null);
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
  }>({ shake: () => {}, reset: () => {}, updatePhysics: () => {}, exportSVG: () => {} });

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
        positionIterations: 12,
        velocityIterations: 10,
      });
      const runner = Runner.create();
      Runner.run(runner, engine);

      const W = window.innerWidth;
      const H = window.innerHeight;
      interface CenterPoint {
        x: number;
        y: number;
        scale: number;
        bodies: Matter.Body[];
      }

      const logoW = 235;
      const logoH = 162;
      const logoPad = 15; // padding around each letter block
      const centers: CenterPoint[] = [];

      // Bounding boxes for each letter (from SVG path coordinates)
      const letterBoxes = [
        { x: 0,   y: 0,   w: 50,  h: 78.5 },  // L
        { x: 54,  y: 22.8, w: 51,  h: 55.7 },  // o
        { x: 109, y: 22.8, w: 50,  h: 55.7 },  // o
        { x: 163, y: 0,   w: 53,  h: 75.7 },  // k
        { x: 0,   y: 79.8, w: 50,  h: 55.7 },  // a
        { x: 54,  y: 82.6, w: 72,  h: 53.1 },  // w
        { x: 130, y: 79.8, w: 50,  h: 55.7 },  // a
        { x: 184, y: 82.6, w: 51,  h: 78.5 },  // y.
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
        c.scale = Math.max(0.3, Math.min(4, newScale));
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

      // "look away." logo SVG paths (235x162)
      const logoPaths = [
        "M50.1152 75.7059H25.5907V55.4466H50.1152V75.7059ZM24.5244 78.4782L0 64.2967V51.1814H17.487L24.5244 55.1267V78.4782ZM20.2593 50.1152H0V25.5907H20.2593V50.1152ZM20.2593 24.5244H0V0H20.2593V24.5244Z",
        "M78.9547 46.1699L71.9173 50.1152H54.4303V36.9999L78.9547 22.8184V46.1699ZM104.545 50.1152H87.0584L80.021 46.1699V22.8184L104.545 36.9999V50.1152ZM78.9547 78.4782L54.4303 64.2967V51.1814H71.9173L78.9547 55.1267V78.4782ZM104.545 64.2967L80.021 78.4782V55.1267L87.0584 51.1814H104.545V64.2967Z",
        "M133.385 46.1699L126.348 50.1152H108.861V36.9999L133.385 22.8184V46.1699ZM158.976 50.1152H141.489L134.451 46.1699V22.8184L158.976 36.9999V50.1152ZM133.385 78.4782L108.861 64.2967V51.1814H126.348L133.385 55.1267V78.4782ZM158.976 64.2967L134.451 78.4782V55.1267L141.489 51.1814H158.976V64.2967Z",
        "M183.55 50.1152H163.291V25.5907H183.55V50.1152ZM183.55 24.5244H163.291V0H183.55V24.5244ZM187.815 71.7606L180.778 75.7059H163.291V62.5906L187.815 48.4091V71.7606ZM213.406 46.1699L206.368 50.1152H188.881V36.9999L213.406 22.8184V46.1699ZM216.178 75.7059H192.827L188.881 68.6684V51.1814H201.997L216.178 75.7059Z",
        "M24.5244 103.17L17.487 107.115H0V93.9999L24.5244 79.8184V103.17ZM24.5244 135.478L0 121.297V108.181H17.487L24.5244 112.127V135.478ZM50.1152 107.115H32.6282L25.5907 103.17V79.8184L50.1152 93.9999V107.115ZM50.1152 135.478L25.5907 121.297V108.181H43.0777L50.1152 112.127V135.478Z",
        "M125.871 121.297L101.347 135.478V112.127L108.384 108.181H125.871V121.297ZM74.6896 107.115H54.4303V82.5907H74.6896V107.115ZM125.871 107.115H105.612V82.5907H125.871V107.115ZM100.28 121.297L75.7559 135.478V112.127L82.7933 108.181H100.28V121.297ZM100.28 107.115H80.021V82.5907H100.28V107.115ZM74.6896 132.706H54.4303V108.181H74.6896V132.706Z",
        "M154.627 103.17L147.59 107.115H130.103V93.9999L154.627 79.8184V103.17ZM154.627 135.478L130.103 121.297V108.181H147.59L154.627 112.127V135.478ZM180.218 107.115H162.731L155.694 103.17V79.8184L180.218 93.9999V107.115ZM180.218 135.478L155.694 121.297V108.181H173.181L180.218 112.127V135.478Z",
        "M209.058 135.478L184.533 121.297V108.181H202.02L209.058 112.127V135.478ZM234.648 121.297L210.124 135.478V112.127L217.161 108.181H234.648V121.297ZM209.058 161.069L184.533 146.887V133.772H202.02L209.058 137.717V161.069ZM234.648 146.887L210.124 161.069V137.717L217.161 133.772H234.648V146.887ZM204.792 107.115H184.533V82.5907H204.792V107.115ZM234.648 107.115H214.389V82.5907H234.648V107.115Z",
      ];

      // --- p5.js sketch ---
      let isHolding = false;
      let spawnX = 0;
      let spawnY = 0;

      const sketch = (p: import("p5")) => {
        p.setup = () => {
          const canvas = p.createCanvas(W, H);
          canvas.parent(containerRef.current!);
          p.noStroke();
        };

        // Draw circle eye
        function drawEye(
          x: number, y: number, radius: number,
          lookAngle: number, irisColor: string, scleraColor: string
        ) {
          // Sclera
          p.fill(scleraColor);
          p.noStroke();
          p.ellipse(x, y, radius * 2, radius * 2);

          // Iris — offset toward look direction
          const irisRadius = radius * 0.53;
          const irisOffset = radius * 0.28;
          const ix = x + Math.cos(lookAngle) * irisOffset;
          const iy = y + Math.sin(lookAngle) * irisOffset;
          p.fill(irisColor);
          p.ellipse(ix, iy, irisRadius * 2, irisRadius * 2);

          // Pupil
          const pupilRadius = irisRadius * 0.61;
          const pupilOffset = irisOffset * 1.1;
          const px = x + Math.cos(lookAngle) * pupilOffset;
          const py = y + Math.sin(lookAngle) * pupilOffset;
          p.fill(0);
          p.ellipse(px, py, pupilRadius * 2, pupilRadius * 2);

          // Highlight dot
          const hlRadius = Math.max(1.5, irisRadius * 0.12);
          const hlx = ix - Math.cos(lookAngle) * irisRadius * 0.3 + Math.cos(lookAngle + 1) * irisRadius * 0.15;
          const hly = iy - Math.sin(lookAngle) * irisRadius * 0.3 + Math.sin(lookAngle + 1) * irisRadius * 0.15;
          p.fill(scleraColor);
          p.ellipse(hlx, hly, hlRadius * 2, hlRadius * 2);
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

          // Continuous spawning while mouse held — 1 eye every other frame
          if (isHolding && p.frameCount % 2 === 0) {
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

          // Apply attraction/repulsion toward nearest center
          for (const eye of eyes) {
            const b = eye.body;
            if (!b || !b.position) continue;
            // Find nearest center
            let nearDx = 0, nearDy = 0, nearDist = Infinity;
            for (const c of centers) {
              const dx = c.x - b.position.x;
              const dy = c.y - b.position.y;
              const d = Math.sqrt(dx * dx + dy * dy);
              if (d < nearDist) { nearDx = dx; nearDy = dy; nearDist = d; }
            }
            if (nearDist > 1) {
              const gravityScale = Math.min(3, 300 / (nearDist + 50));
              const force = attractionStrength * b.mass * gravityScale;
              const dir = isLookAway ? -1 : 1;
              Body.applyForce(b, b.position, {
                x: (nearDx / nearDist) * force * dir,
                y: (nearDy / nearDist) * force * dir,
              });
            }
          }

          // Draw eyes — sort by size so small eyes draw on top
          const sorted = [...eyes].sort((a, b) => b.radius - a.radius);
          for (const eye of sorted) {
            const { body, radius, irisColor, scleraColor } = eye;
            if (!body || !body.position) continue;
            const x = body.position.x;
            const y = body.position.y;

            // Look toward nearest center
            let ncx = centers[0].x, ncy = centers[0].y, nd = Infinity;
            for (const c of centers) {
              const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
              if (d < nd) { ncx = c.x; ncy = c.y; nd = d; }
            }
            const angle = Math.atan2(ncy - y, ncx - x);
            const lookAngle = isLookAway ? angle + Math.PI : angle;

            const shape = eyeShapeRef.current;
            if (shape === "triangle") {
              drawTriangleEye(x, y, radius, lookAngle, irisColor, scleraColor);
            } else if (shape === "rect") {
              drawRectEye(x, y, radius, lookAngle, irisColor);
            } else {
              drawEye(x, y, radius, lookAngle, irisColor, scleraColor);
            }
          }

          // Center logo — draw for each center
          const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
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
              if (p.dist(p.mouseX, p.mouseY, centers[i].x, centers[i].y) < 60) {
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
              if (p.dist(p.mouseX, p.mouseY, c.x, c.y) < 60) {
                clickedCenter = c;
                break;
              }
            }

            // Option+Shift+click to duplicate
            if (altDown && shiftDown) {
              // Duplicate center text
              if (clickedCenter) {
                const newC = addCenter(p.mouseX, p.mouseY);
                isDuplicating = true;
                draggingCenter = newC;
                return;
              }
              // Duplicate eye
              const hit = findEyeAt(p.mouseX, p.mouseY);
              if (hit) {
                isDuplicating = true;
                duplicateSource = hit;
                duplicateEye(hit, p.mouseX, p.mouseY);
                return;
              }
            }

            if (clickedCenter) {
              draggingCenter = clickedCenter;
            } else {
              isHolding = true;
              spawnX = p.mouseX;
              spawnY = p.mouseY;
              for (let i = 0; i < 3; i++) {
                const ox = (Math.random() - 0.5) * 40;
                const oy = (Math.random() - 0.5) * 40;
                spawnEye(p.mouseX + ox, p.mouseY + oy);
              }
            }
          }
        };

        p.mouseDragged = () => {
          if (isDuplicating && duplicateSource) {
            // Move the last spawned (duplicated) eye to cursor
            const last = eyes[eyes.length - 1];
            if (last && last.body) {
              Body.setPosition(last.body, { x: p.mouseX, y: p.mouseY });
              Body.setVelocity(last.body, { x: 0, y: 0 });
            }
          } else if (draggingCenter) {
            repositionCenter(draggingCenter, p.mouseX, p.mouseY);
          } else {
            spawnX = p.mouseX;
            spawnY = p.mouseY;
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
            const delta = e.deltaY > 0 ? -0.08 : 0.08;
            rescaleCenter(c, c.scale + delta);
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
            // Sclera
            svgParts.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="${scleraColor}"/>`);
            // Iris
            const irisRadius = radius * 0.53;
            const irisOffset = radius * 0.28;
            const ix = x + Math.cos(lookAngle) * irisOffset;
            const iy = y + Math.sin(lookAngle) * irisOffset;
            svgParts.push(`<circle cx="${ix}" cy="${iy}" r="${irisRadius}" fill="${irisColor}"/>`);
            // Pupil
            const pupilRadius = irisRadius * 0.61;
            const pupilOffset = irisOffset * 1.1;
            const px = x + Math.cos(lookAngle) * pupilOffset;
            const py = y + Math.sin(lookAngle) * pupilOffset;
            svgParts.push(`<circle cx="${px}" cy="${py}" r="${pupilRadius}" fill="#000000"/>`);
            // Highlight
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
            // Sclera
            svgParts.push(`<polygon points="${triPoints(x, y, radius, lookAngle)}" fill="${scleraColor}"/>`);
            // Iris
            const irisShift = radius * 0.3;
            const ix = x + Math.cos(lookAngle) * irisShift;
            const iy = y + Math.sin(lookAngle) * irisShift;
            svgParts.push(`<polygon points="${triPoints(ix, iy, radius * 0.55, lookAngle)}" fill="${irisColor}"/>`);
            // Pupil
            const pupilShift = radius * 0.38;
            const px = x + Math.cos(lookAngle) * pupilShift;
            const py = y + Math.sin(lookAngle) * pupilShift;
            svgParts.push(`<polygon points="${triPoints(px, py, radius * 0.35, lookAngle)}" fill="#000000"/>`);
            // Highlight
            const hlR = radius * 0.08;
            const hlx = px + Math.cos(lookAngle + 2.5) * radius * 0.35 * 0.3;
            const hly = py + Math.sin(lookAngle + 2.5) * radius * 0.35 * 0.3;
            svgParts.push(`<polygon points="${triPoints(hlx, hly, hlR, lookAngle)}" fill="${scleraColor}"/>`);

          } else if (shape === "rect") {
            const outerW = radius * 2;
            const outerH = outerW * (191.085 / 214.325);
            const rotDeg = (lookAngle - Math.PI / 2) * (180 / Math.PI);
            svgParts.push(`<g transform="translate(${x},${y}) rotate(${rotDeg})">`);
            // Outer colored rect
            svgParts.push(`<rect x="${-outerW / 2}" y="${-outerH / 2}" width="${outerW}" height="${outerH}" fill="${irisColor}"/>`);
            // Inner black rect
            const innerW = outerW * (142.231 / 214.325);
            const innerH = outerH * (126.428 / 191.085);
            const innerX = -outerW / 2 + outerW * (39.806 / 214.325);
            const innerY = -outerH / 2 + outerH * (52.592 / 191.085);
            svgParts.push(`<rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="#000000"/>`);
            // White highlight
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
      <div ref={containerRef} style={{ position: "fixed", inset: 0, zIndex: 0 }} />

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
        {/* Styles */}
        <div
          style={{
            display: "flex",
            gap: 6,
            background: "rgba(0,0,0,0.6)",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {Object.entries(STYLES).map(([key, style]) => (
            <button
              key={key}
              onClick={() => applyStyle(key)}
              style={{
                ...btnStyle,
                background: activeStyle === key ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                fontSize: 11,
                padding: "5px 12px",
              }}
            >
              {style.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: "rgba(0,0,0,0.6)",
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <button
            id="look-away-btn"
            onClick={(e) => {
              lookAwayRef.current = !lookAwayRef.current;
              const btn = e.currentTarget;
              btn.textContent = lookAwayRef.current ? "look back" : "look away";
              btn.style.background = lookAwayRef.current
                ? "rgba(255,255,255,0.25)"
                : "rgba(255,255,255,0.1)";
            }}
            style={btnStyle}
          >
            look away
          </button>
          <button onClick={() => actionsRef.current.reset()} style={btnStyle}>
            reset
          </button>
          <button onClick={() => actionsRef.current.exportSVG?.()} style={btnStyle}>
            save svg
          </button>
        </div>

        {/* All settings in one panel */}
        <div
          key={activeStyle}
          style={{
            background: "rgba(0,0,0,0.6)",
            padding: "12px 14px",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.15)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Eye settings */}
          <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>
            eyes
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "6px 8px", alignItems: "center" }}>
            <span>size</span>
            <input type="range" min={8} max={55} defaultValue={s.eyeSize}
              onChange={(e) => { eyeSizeRef.current = Number(e.target.value); }}
              style={sliderStyle} />
          </div>

          {/* Physics */}
          <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>
            physics
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "6px 8px", alignItems: "center" }}>
            <span>bounce</span>
            <input type="range" min={0} max={100} defaultValue={Math.round(s.bounce * 100)}
              onChange={(e) => {
                bounceRef.current = Number(e.target.value) / 100;
                actionsRef.current.updatePhysics();
              }}
              style={sliderStyle} />

            <span>friction</span>
            <input type="range" min={0} max={100} defaultValue={Math.round(s.friction * 100)}
              onChange={(e) => {
                frictionRef.current = Number(e.target.value) / 100;
                actionsRef.current.updatePhysics();
              }}
              style={sliderStyle} />

            <span>air drag</span>
            <input type="range" min={0} max={100} defaultValue={Math.round(s.airDrag * 1000)}
              onChange={(e) => {
                airDragRef.current = Number(e.target.value) / 1000;
                actionsRef.current.updatePhysics();
              }}
              style={sliderStyle} />

            <span>density</span>
            <input type="range" min={1} max={100} defaultValue={Math.round(s.density * 10000)}
              onChange={(e) => {
                densityRef.current = Number(e.target.value) / 10000;
                actionsRef.current.updatePhysics();
              }}
              style={sliderStyle} />

            <span>attraction</span>
            <input type="range" min={1} max={100} defaultValue={Math.round(s.attraction * 100000)}
              onChange={(e) => {
                attractionRef.current = Number(e.target.value) / 100000;
              }}
              style={sliderStyle} />
          </div>

          {/* Shake */}
          <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>
            shake
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["explode", "implode", "vortex"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setShakeMode(mode); shakeModeRef.current = mode; }}
                style={{
                  ...btnStyle,
                  background: shakeMode === mode ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                  fontSize: 11,
                  padding: "5px 12px",
                }}
              >
                {mode}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "6px 8px", alignItems: "center" }}>
            <span>intensity</span>
            <input type="range" min={0} max={30} defaultValue={s.shakeIntensity}
              onChange={(e) => {
                shakeIntensityRef.current = Number(e.target.value);
              }}
              style={sliderStyle} />
          </div>
          <button onClick={() => actionsRef.current.shake()} style={{ ...btnStyle, width: "100%" }}>
            shake
          </button>
        </div>

      </div>
    </>
  );
}
