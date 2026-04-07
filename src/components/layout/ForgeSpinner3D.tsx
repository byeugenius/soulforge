import {
  type BoxRenderable,
  FrameBufferRenderable,
  createTimeline,
  type Timeline,
} from "@opentui/core";
import { ThreeCliRenderer } from "@opentui/core/3d";
import { useRenderer } from "@opentui/react";
import { memo, useEffect, useRef } from "react";
import {
  AmbientLight,
  IcosahedronGeometry,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
} from "three";
import { getThemeTokens } from "../../core/theme/index.js";

/**
 * 3D Soul Flame spinner — a glowing orb that pulses and rotates,
 * rendered with Three.js + WebGPU into a small framebuffer.
 *
 * The orb is an icosahedron (gem-like facets) with emissive glow
 * and an orbiting point light that creates shifting highlights —
 * like a soul being forged.
 */

const FB_WIDTH = 8;
const FB_HEIGHT = 4;

function hexToInt(hex: string): number {
  const clean = hex.replace("#", "");
  return parseInt(clean, 16) || 0x7844f0;
}

export const ForgeSpinner3D = memo(function ForgeSpinner3D() {
  const renderer = useRenderer();
  const containerRef = useRef<BoxRenderable>(null);
  const fbRef = useRef<FrameBufferRenderable | null>(null);
  const engineRef = useRef<ThreeCliRenderer | null>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const cleanedUp = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || cleanedUp.current) return;

    const tk = getThemeTokens();
    const brandColor = hexToInt(tk.brand);
    const sparkColor = hexToInt(tk.warning);

    // Create framebuffer and add to container
    const fb = new FrameBufferRenderable(renderer, {
      id: `forge-3d-${Date.now()}`,
      width: FB_WIDTH,
      height: FB_HEIGHT,
      respectAlpha: true,
    });
    container.add(fb);
    fbRef.current = fb;

    // Three.js scene
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, FB_WIDTH / FB_HEIGHT, 0.1, 100);
    camera.position.z = 2.5;

    // Soul orb — icosahedron for gem-like facets
    const orbGeo = new IcosahedronGeometry(0.6, 1);
    const orbMat = new MeshPhongMaterial({
      color: brandColor,
      emissive: brandColor,
      emissiveIntensity: 0.3,
      specular: 0xffffff,
      shininess: 60,
      transparent: true,
      opacity: 0.9,
    });
    const orb = new Mesh(orbGeo, orbMat);
    scene.add(orb);

    // Inner core glow
    const coreGeo = new SphereGeometry(0.25, 16, 16);
    const coreMat = new MeshPhongMaterial({
      color: sparkColor,
      emissive: sparkColor,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.7,
    });
    const core = new Mesh(coreGeo, coreMat);
    scene.add(core);

    // Lighting
    const ambient = new AmbientLight(0xffffff, 0.2);
    scene.add(ambient);

    const orbitLight = new PointLight(sparkColor, 1.5, 10);
    orbitLight.position.set(1.5, 0, 1);
    scene.add(orbitLight);

    // 3D engine
    const engine = new ThreeCliRenderer(renderer, {
      width: FB_WIDTH,
      height: FB_HEIGHT,
    });
    engineRef.current = engine;

    // Animation state
    const state = {
      orbRotY: 0,
      orbRotX: 0,
      lightAngle: 0,
      pulse: 0.3,
      coreScale: 0.8,
    };

    // Timeline — smooth looping animation
    const tl = createTimeline({ duration: 3000, loop: true });
    timelineRef.current = tl;

    // Orb rotation
    tl.add(
      state,
      {
        orbRotY: Math.PI * 2,
        duration: 3000,
        ease: "linear",
        onUpdate: () => {
          orb.rotation.y = state.orbRotY;
          orb.rotation.x = Math.sin(state.orbRotY * 0.5) * 0.3;
        },
      },
      0,
    );

    // Orbiting light
    tl.add(
      state,
      {
        lightAngle: Math.PI * 2,
        duration: 2000,
        ease: "linear",
        loop: true,
        onUpdate: () => {
          orbitLight.position.x = Math.cos(state.lightAngle) * 1.5;
          orbitLight.position.z = Math.sin(state.lightAngle) * 1.5;
          orbitLight.position.y = Math.sin(state.lightAngle * 2) * 0.5;
        },
      },
      0,
    );

    // Emissive pulse — breathing glow
    tl.add(
      state,
      {
        pulse: 0.8,
        duration: 1500,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        onUpdate: () => {
          orbMat.emissiveIntensity = state.pulse;
          coreMat.opacity = 0.4 + state.pulse * 0.5;
        },
      },
      0,
    );

    // Core scale pulse
    tl.add(
      state,
      {
        coreScale: 1.2,
        duration: 800,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        onUpdate: () => {
          core.scale.setScalar(state.coreScale);
        },
      },
      0,
    );

    // Init engine then start render loop
    let frameCallback: ((dt: number) => Promise<void>) | null = null;

    engine
      .init()
      .then(() => {
        if (cleanedUp.current) return;
        frameCallback = async (dt: number) => {
          if (cleanedUp.current || !fb) return;
          try {
            await engine.drawScene(scene, fb.frameBuffer, dt);
          } catch {}
        };
        renderer.setFrameCallback(frameCallback);
      })
      .catch(() => {});

    return () => {
      cleanedUp.current = true;
      timelineRef.current?.pause();
      if (frameCallback) {
        renderer.setFrameCallback(null as any);
      }
      try {
        engineRef.current?.destroy();
      } catch {}
      try {
        if (fbRef.current) {
          container.remove(fbRef.current.id);
        }
      } catch {}
    };
  }, [renderer]);

  return <box ref={containerRef} width={FB_WIDTH} height={FB_HEIGHT} />;
});
