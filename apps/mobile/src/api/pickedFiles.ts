import { Directory, File, Paths } from "expo-file-system";

/**
 * The folders under the cache that the pickers and the photo resizer copy files into: the image picker, the document picker (a
 * ticket PDF or screenshot) and the image manipulator (the profile photo, resized). They hold the person's own pictures, so
 * sign-out and deletion empty them.
 */
export const PICKED_FILE_FOLDERS = ["ImagePicker", "DocumentPicker", "ImageManipulator"] as const;

/** Deletes every picked file left on the phone. A folder that is not there is already empty, and one that fails does not stop the rest. */
export async function clearPickedFiles(): Promise<void> {
  let failure: unknown;
  for (const name of PICKED_FILE_FOLDERS) {
    try {
      const folder = new Directory(Paths.cache, name);
      if (folder.exists) folder.delete();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) throw failure;
}

/** Deletes one picked or prepared file once it has gone up (or been replaced). Only files the app's own cache holds; best effort. */
export function deletePickedFile(uri: string): void {
  try {
    if (!uri.startsWith(Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The folder is emptied at sign-out in any case.
  }
}
