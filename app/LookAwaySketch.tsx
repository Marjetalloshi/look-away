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
  }>({ shake: () => {}, reset: () => {}, updatePhysics: () => {} });

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
        body: Matter.Body;
      }

      const centralRadius = 50;
      const centers: CenterPoint[] = [];

      function addCenter(x: number, y: number): CenterPoint {
        const body = Bodies.circle(x, y, centralRadius, {
          isStatic: true,
          label: "center",
        });
        Composite.add(engine.world, body);
        const c = { x, y, body };
        centers.push(c);
        return c;
      }

      // Restore or create initial center
      const saved = localStorage.getItem("lookaway-state");
      let savedState: {
        eyes: { x: number; y: number; vx: number; vy: number; radius: number; irisColor: string; scleraColor: string }[];
        centers: { x: number; y: number }[];
        settings: {
          activeStyle: string;
          eyeSize: number; bounce: number; friction: number; airDrag: number;
          density: number; attraction: number; shakeIntensity: number;
          shakeMode: string; eyeShape: string; lookAway: boolean;
        };
      } | null = null;
      try { if (saved) savedState = JSON.parse(saved); } catch {}

      if (savedState && savedState.centers.length > 0) {
        for (const c of savedState.centers) addCenter(c.x, c.y);
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

          // Center text — draw for each center
          const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
          ctx.fillStyle = "#ffffff";
          ctx.font = "14px Helvetica, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (const c of centers) {
            ctx.fillText("look away.", c.x, c.y);
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
            draggingCenter.x = p.mouseX;
            draggingCenter.y = p.mouseY;
            Body.setPosition(draggingCenter.body, { x: p.mouseX, y: p.mouseY });
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
          centers: centers.map(c => ({ x: c.x, y: c.y })),
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
