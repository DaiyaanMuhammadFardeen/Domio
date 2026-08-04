declare module 'gifenc' {
  export function createEncoder(options: {
    width: number;
    height: number;
    quantizer: { colors: number };
    fps: number;
  }): {
    addFrame(data: Uint8Array): void;
    finish(): Uint8Array;
  };
}
