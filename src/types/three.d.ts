declare module "three" {
  export class Scene {
    add(object: any): void;
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    position: { x: number; y: number; z: number };
  }
  export class Mesh {
    constructor(geometry: any, material: any);
    rotation: { x: number; y: number; z: number };
    scale: { setScalar(s: number): void };
  }
  export class BoxGeometry {
    constructor(w: number, h: number, d: number);
  }
  export class SphereGeometry {
    constructor(radius: number, widthSeg: number, heightSeg: number);
  }
  export class IcosahedronGeometry {
    constructor(radius: number, detail: number);
  }
  export class MeshPhongMaterial {
    constructor(params?: Record<string, any>);
    emissiveIntensity: number;
    opacity: number;
  }
  export class AmbientLight {
    constructor(color: number, intensity: number);
  }
  export class PointLight {
    constructor(color: number, intensity: number, distance: number);
    position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  }
  export class DirectionalLight {
    constructor(color: number, intensity: number);
    position: { set(x: number, y: number, z: number): void };
  }
}
