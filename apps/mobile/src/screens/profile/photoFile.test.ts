import { ImageManipulator } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";
import { choosePhoto, preparePhoto } from "./photoFile";

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

const manipulate = jest.mocked(ImageManipulator.manipulate);
const launch = jest.mocked(launchImageLibraryAsync);

/** A manipulator that draws an image of the given size and saves a file named for what was done to it. */
function drawing(width: number, height: number) {
  const ref: { width: number; height: number; saveAsync: jest.Mock } = { width, height, saveAsync: jest.fn() };
  const saveAsync = ref.saveAsync;
  saveAsync.mockImplementation(async (options: { format: string; compress: number }) => ({
    uri: "file:///cache/out.jpg",
    width: ref.width,
    height: ref.height,
    options,
  }));
  const resize = jest.fn((size: { width: number; height: number }) => ({
    renderAsync: async () => {
      ref.width = size.width;
      ref.height = size.height;
      return ref;
    },
  }));
  manipulate.mockImplementation(((_source: unknown) => ({ renderAsync: async () => ref, resize })) as never);
  return { ref, saveAsync, resize };
}

beforeEach(() => jest.clearAllMocks());

describe("preparePhoto", () => {
  it("draws the picture again and saves a JPEG at the plan's quality, which drops the EXIF block", async () => {
    const { saveAsync } = drawing(800, 600);
    const out = await preparePhoto("file:///picked/photo.heic");
    expect(saveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.8 });
    expect(out).toEqual({ uri: "file:///cache/out.jpg", width: 800, height: 600 });
    // The save options never ask for base64 or a PNG, which would keep or inflate the data.
    expect(Object.keys(saveAsync.mock.calls[0]?.[0] ?? {}).sort()).toEqual(["compress", "format"]);
  });

  it("asks the decoder for a 1080 px box, so a huge photo is never held whole", async () => {
    drawing(800, 600);
    await preparePhoto("file:///picked/photo.jpg");
    expect(manipulate).toHaveBeenNthCalledWith(1, "file:///picked/photo.jpg", { maxWidth: 1080, maxHeight: 1080 });
  });

  it("does not resize a picture that already fits", async () => {
    const { resize } = drawing(1080, 720);
    await preparePhoto("file:///picked/photo.jpg");
    expect(resize).not.toHaveBeenCalled();
  });

  it("resizes a picture that came back too large, long side to 1080 and the ratio kept", async () => {
    const { resize } = drawing(4000, 3000);
    const out = await preparePhoto("file:///picked/photo.jpg");
    expect(resize).toHaveBeenCalledWith({ width: 1080, height: 810 });
    expect(out).toMatchObject({ width: 1080, height: 810 });
  });
});

describe("choosePhoto", () => {
  it("opens the library for one image, with no editing and no EXIF asked for", async () => {
    drawing(800, 600);
    launch.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///picked/a.jpg", width: 1, height: 1 }] });
    await choosePhoto();
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ["images"], allowsMultipleSelection: false, allowsEditing: false, exif: false }),
    );
    expect(manipulate.mock.calls[0]?.[0]).toBe("file:///picked/a.jpg");
  });

  it("is null when the picker is closed", async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });
    await expect(choosePhoto()).resolves.toBeNull();
    expect(manipulate).not.toHaveBeenCalled();
  });
});
