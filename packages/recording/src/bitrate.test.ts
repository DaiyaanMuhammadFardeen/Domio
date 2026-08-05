import { describe, it, expect } from "vitest";
import { computeBitrate, bitrateDelta } from "./bitrate.js";
import type { BitrateParams } from "./bitrate.js";

describe("computeBitrate", () => {
  it("computes expected kbps for 1920×1080 @ 30fps, med tier", () => {
    // base = 1920 * 1080 * 30 / 1000 = 62,208
    // med multiplier = 1.0 → 62,208 kbps → clamped to 20,000
    const params: BitrateParams = {
      width: 1920,
      height: 1080,
      fps: 30,
      tier: "med",
    };
    const result = computeBitrate(params);
    expect(result).toBe(20_000); // clamped
  });

  it("computes expected kbps for 1280×720 @ 30fps, med tier", () => {
    // base = 1280 * 720 * 30 / 1000 = 27,648
    // med multiplier = 1.0 → 27,648 → clamped to 20,000
    const params: BitrateParams = {
      width: 1280,
      height: 720,
      fps: 30,
      tier: "med",
    };
    const result = computeBitrate(params);
    expect(result).toBe(20_000); // clamped
  });

  it("computes expected kbps for 640×480 @ 30fps, med tier", () => {
    // base = 640 * 480 * 30 / 1000 = 9,216
    // med multiplier = 1.0 → 9,216
    const params: BitrateParams = {
      width: 640,
      height: 480,
      fps: 30,
      tier: "med",
    };
    const result = computeBitrate(params);
    expect(result).toBe(9_216);
  });

  it("applies low tier multiplier (0.5)", () => {
    // 640 * 480 * 30 / 1000 = 9,216 * 0.5 = 4,608
    const params: BitrateParams = {
      width: 640,
      height: 480,
      fps: 30,
      tier: "low",
    };
    const result = computeBitrate(params);
    expect(result).toBe(4_608);
  });

  it("applies high tier multiplier (2.0)", () => {
    // 640 * 480 * 30 / 1000 = 9,216 * 2.0 = 18,432
    const params: BitrateParams = {
      width: 640,
      height: 480,
      fps: 30,
      tier: "high",
    };
    const result = computeBitrate(params);
    expect(result).toBe(18_432);
  });

  it("clamps to minimum 100 kbps for very small resolutions", () => {
    // 1 * 1 * 1 / 1000 = 0.001 * 0.5 = 0.0005 → clamped to 100
    const params: BitrateParams = {
      width: 1,
      height: 1,
      fps: 1,
      tier: "low",
    };
    const result = computeBitrate(params);
    expect(result).toBe(100);
  });

  it("clamps to maximum 20,000 kbps for very high resolutions", () => {
    // 3840 * 2160 * 120 / 1000 = 995,328 * 2.0 → clamped to 20,000
    const params: BitrateParams = {
      width: 3840,
      height: 2160,
      fps: 120,
      tier: "high",
    };
    const result = computeBitrate(params);
    expect(result).toBe(20_000);
  });

  it("returns correct value for 1280×720 @ 60fps, low tier", () => {
    // base = 1280 * 720 * 60 / 1000 = 55,296
    // low multiplier = 0.5 → 27,648 → clamped to 20,000
    const params: BitrateParams = {
      width: 1280,
      height: 720,
      fps: 60,
      tier: "low",
    };
    const result = computeBitrate(params);
    expect(result).toBe(20_000);
  });
});

describe("bitrateDelta", () => {
  it("returns negative delta when resolution drops", () => {
    // 1080p med → 720p med: both clamped, delta = 0
    // Use smaller resolutions to see the delta
    const old: BitrateParams = {
      width: 1280,
      height: 720,
      fps: 30,
      tier: "med",
    };
    const newP: BitrateParams = {
      width: 640,
      height: 480,
      fps: 30,
      tier: "med",
    };
    const delta = bitrateDelta(old, newP);
    expect(delta).toBe(9_216 - 20_000);
  });

  it("returns positive delta when resolution increases", () => {
    const old: BitrateParams = {
      width: 640,
      height: 480,
      fps: 30,
      tier: "med",
    };
    const newP: BitrateParams = {
      width: 1280,
      height: 720,
      fps: 30,
      tier: "med",
    };
    const delta = bitrateDelta(old, newP);
    expect(delta).toBe(20_000 - 9_216);
  });

  it("returns 0 when resolution does not change", () => {
    const params: BitrateParams = {
      width: 640,
      height: 480,
      fps: 30,
      tier: "low",
    };
    const delta = bitrateDelta(params, params);
    expect(delta).toBe(0);
  });
});
