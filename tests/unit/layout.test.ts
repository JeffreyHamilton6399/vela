import { describe, expect, it } from 'vitest';
import { boundsEqual, computeViewBounds, ZERO_INSETS } from '../../src/main/tabs/layout.js';

describe('computeViewBounds', () => {
  it('fills the window when there is no chrome', () => {
    expect(computeViewBounds({ width: 1280, height: 800 }, ZERO_INSETS)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 800,
    });
  });

  it('sits below the titlebar and toolbar', () => {
    const bounds = computeViewBounds(
      { width: 1280, height: 800 },
      { top: 88, right: 0, bottom: 0, left: 0 },
    );
    expect(bounds).toEqual({ x: 0, y: 88, width: 1280, height: 712 });
  });

  it('makes room for a sidebar', () => {
    const bounds = computeViewBounds(
      { width: 1000, height: 600 },
      { top: 88, right: 280, bottom: 0, left: 0 },
    );
    expect(bounds).toEqual({ x: 0, y: 88, width: 720, height: 512 });
  });

  it('never returns negative dimensions', () => {
    const bounds = computeViewBounds(
      { width: 100, height: 40 },
      { top: 88, right: 280, bottom: 0, left: 0 },
    );
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });

  it('rounds to whole device-independent pixels', () => {
    const bounds = computeViewBounds(
      { width: 1000.4, height: 600.6 },
      { top: 87.5, right: 0, bottom: 0, left: 0.4 },
    );
    expect(Number.isInteger(bounds.x)).toBe(true);
    expect(Number.isInteger(bounds.y)).toBe(true);
    expect(Number.isInteger(bounds.width)).toBe(true);
    expect(Number.isInteger(bounds.height)).toBe(true);
  });
});

describe('boundsEqual', () => {
  it('compares every edge', () => {
    const a = { x: 0, y: 88, width: 100, height: 100 };
    expect(boundsEqual(a, { ...a })).toBe(true);
    expect(boundsEqual(a, { ...a, height: 101 })).toBe(false);
  });
});
