import { describe, it, expect } from "vitest";
import { selectEncoder } from "./encoder.js";
import type { SupportMatrix } from "./encoder.js";

describe("selectEncoder", () => {
  it("prefers h264/mp4 when available", () => {
    const matrix: SupportMatrix = { h264: true, vp9: true, av1: true };
    const result = selectEncoder(matrix);
    expect(result).toEqual({
      mimeType: "video/mp4;codecs=h264",
      container: "mp4",
    });
  });

  it("falls back to vp9/webm when h264 is absent", () => {
    const matrix: SupportMatrix = { h264: false, vp9: true, av1: true };
    const result = selectEncoder(matrix);
    expect(result).toEqual({
      mimeType: "video/webm;codecs=vp9",
      container: "webm",
    });
  });

  it("falls back to av1/webm when only av1 is available", () => {
    const matrix: SupportMatrix = { h264: false, vp9: false, av1: true };
    const result = selectEncoder(matrix);
    expect(result).toEqual({
      mimeType: "video/webm;codecs=av1",
      container: "webm",
    });
  });

  it("returns unsupported when no codec is available", () => {
    const matrix: SupportMatrix = { h264: false, vp9: false, av1: false };
    const result = selectEncoder(matrix);
    expect(result).toEqual({ unsupported: true });
  });

  it("returns unsupported for empty matrix", () => {
    const result = selectEncoder({});
    expect(result).toEqual({ unsupported: true });
  });

  it("returns unsupported for a matrix with only undefined values", () => {
    const matrix: SupportMatrix = {};
    const result = selectEncoder(matrix);
    expect(result).toEqual({ unsupported: true });
  });

  it("selects h264 when it is the only available codec", () => {
    const matrix: SupportMatrix = { h264: true, vp9: false, av1: false };
    const result = selectEncoder(matrix);
    expect(result).toEqual({
      mimeType: "video/mp4;codecs=h264",
      container: "mp4",
    });
  });

  it("selects vp9 when h264 is absent and vp9 is available", () => {
    const matrix: SupportMatrix = { h264: false, vp9: true, av1: false };
    const result = selectEncoder(matrix);
    expect(result).toEqual({
      mimeType: "video/webm;codecs=vp9",
      container: "webm",
    });
  });
});
