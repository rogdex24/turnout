import { clearPickedFiles, deletePickedFile, PICKED_FILE_FOLDERS } from "./pickedFiles";

const CACHE = "file:///data/cache/";
const mockDeleted: string[] = [];
const mockPresent = new Set<string>();

jest.mock("expo-file-system", () => {
  const join = (parts: unknown[]) =>
    parts
      .map((part) => (typeof part === "string" ? part : (part as { uri: string }).uri))
      .reduce((base, part) => `${base.replace(/\/+$/, "")}/${part}`);
  class Entry {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockPresent.has(this.uri);
    }
    delete() {
      mockDeleted.push(this.uri);
      mockPresent.delete(this.uri);
    }
  }
  return { Directory: Entry, File: Entry, Paths: { cache: { uri: "file:///data/cache/" } } };
});

beforeEach(() => {
  mockDeleted.length = 0;
  mockPresent.clear();
});

describe("clearPickedFiles", () => {
  it("deletes the folders the pickers and the photo resizer copy into", async () => {
    expect([...PICKED_FILE_FOLDERS].sort()).toEqual(["DocumentPicker", "ImageManipulator", "ImagePicker"]);
    for (const name of PICKED_FILE_FOLDERS) mockPresent.add(`${CACHE}${name}`);
    mockPresent.add(`${CACHE}other`);
    await clearPickedFiles();
    expect(mockDeleted.sort()).toEqual(PICKED_FILE_FOLDERS.map((name) => `${CACHE}${name}`).sort());
  });

  it("is quiet about a folder that is not there", async () => {
    await expect(clearPickedFiles()).resolves.toBeUndefined();
    expect(mockDeleted).toEqual([]);
  });
});

describe("deletePickedFile", () => {
  it("deletes a file under the cache", () => {
    const uri = `${CACHE}ImageManipulator/a.jpg`;
    mockPresent.add(uri);
    deletePickedFile(uri);
    expect(mockDeleted).toEqual([uri]);
  });

  it("leaves a file outside the cache alone", () => {
    const uri = "file:///data/documents/keep.jpg";
    mockPresent.add(uri);
    deletePickedFile(uri);
    expect(mockDeleted).toEqual([]);
  });
});
