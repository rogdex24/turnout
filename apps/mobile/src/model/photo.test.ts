import { PHOTO_JPEG_QUALITY, PHOTO_MAX_SIDE, photoResizeTarget, uploadProgress } from "./photo";

test("the photo is 1080 px on the long side at 0.8 quality", () => {
  expect(PHOTO_MAX_SIDE).toBe(1080);
  expect(PHOTO_JPEG_QUALITY).toBe(0.8);
});

describe("photoResizeTarget", () => {
  test("scales a landscape photo by its width", () => {
    expect(photoResizeTarget(4000, 3000)).toEqual({ width: 1080, height: 810 });
  });

  test("scales a portrait photo by its height", () => {
    expect(photoResizeTarget(3000, 4000)).toEqual({ width: 810, height: 1080 });
  });

  test("never scales a small photo up", () => {
    expect(photoResizeTarget(600, 800)).toEqual({ width: 600, height: 800 });
  });

  test("leaves a photo at exactly the limit alone", () => {
    expect(photoResizeTarget(1080, 1080)).toEqual({ width: 1080, height: 1080 });
  });

  test("keeps at least one pixel on the short side", () => {
    expect(photoResizeTarget(20000, 1)).toEqual({ width: 1080, height: 1 });
  });
});

describe("uploadProgress", () => {
  test("is a fraction clamped to 0..1", () => {
    expect(uploadProgress(50, 200)).toBe(0.25);
    expect(uploadProgress(300, 200)).toBe(1);
    expect(uploadProgress(-1, 200)).toBe(0);
  });

  test("is 0 when the total is unknown", () => {
    expect(uploadProgress(10, 0)).toBe(0);
  });
});
