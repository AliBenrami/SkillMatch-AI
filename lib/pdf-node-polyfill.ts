/**
 * pdfjs-dist (pulled in by pdf-parse v2) optionally uses @napi-rs/canvas in Node.
 * On Vercel/serverless the native addon is often absent from the runtime bundle;
 * pdfjs then falls back to browser Canvas types that don't exist in Node
 * (DOMMatrix, Path2D, ImageData), which throws during module evaluation.
 *
 * These are no-op/minimal stubs for text extraction only—they are not used for
 * real rendering in our flow. Import this module before any dynamic import of
 * `pdf-parse`.
 */

type DomMatrixLike = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  multiply: (other?: DomMatrixLike) => DomMatrixLike;
  multiplySelf?: (other?: DomMatrixLike) => DomMatrixLike;
  translate: () => DomMatrixLike;
  scale: () => DomMatrixLike;
  rotate: () => DomMatrixLike;
  invert: () => DomMatrixLike;
};

if (typeof globalThis.DOMMatrix === "undefined") {
  const identity = (): DomMatrixLike => {
    const m: DomMatrixLike = {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      multiply(other?: DomMatrixLike) {
        return other ?? m;
      },
      translate() {
        return m;
      },
      scale() {
        return m;
      },
      rotate() {
        return m;
      },
      invert() {
        return m;
      },
    };
    m.multiplySelf = m.multiply;
    return m;
  };

  globalThis.DOMMatrix = class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: string | Iterable<number>) {
      if (Array.isArray(init) || (init && typeof init !== "string" && Symbol.iterator in init)) {
        const arr = Array.from(init as Iterable<number>);
        if (arr.length >= 6) {
          this.a = arr[0]!;
          this.b = arr[1]!;
          this.c = arr[2]!;
          this.d = arr[3]!;
          this.e = arr[4]!;
          this.f = arr[5]!;
        }
      }
    }

    multiply(other?: DOMMatrixPolyfill) {
      return other ?? this;
    }

    multiplySelf() {
      return this;
    }

    translate() {
      return this;
    }

    scale() {
      return this;
    }

    rotate() {
      return this;
    }

    invert() {
      return this;
    }

    static fromMatrix() {
      return identity();
    }
  } as unknown as typeof DOMMatrix;
}

if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class Path2DPolyfill {
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  } as unknown as typeof Path2D;
}

if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = width ?? 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = width ?? 0;
        this.height = height ?? 0;
      }
    }
  } as unknown as typeof ImageData;
}

export {};
