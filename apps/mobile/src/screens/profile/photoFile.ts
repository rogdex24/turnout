import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_SIDE, photoResizeTarget } from "@/model/photo";

/** A picture ready to upload: a JPEG file on this phone, at most 1080 px on its long side. */
export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Makes the file that goes up. The picture is always drawn again and saved as a new JPEG, so the file carries pixels only: no EXIF,
 * no GPS position, and the camera's rotation is already applied. The server draws it again once more, so this is for size and for
 * not sending a location off the phone at all.
 */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  // The load options decode a large photo at the smaller size, so a 50 megapixel picture is never held whole.
  const drawn = await ImageManipulator.manipulate(uri, { maxWidth: PHOTO_MAX_SIDE, maxHeight: PHOTO_MAX_SIDE }).renderAsync();
  const target = photoResizeTarget(drawn.width, drawn.height);
  const resized =
    target.width === drawn.width && target.height === drawn.height
      ? drawn
      : await ImageManipulator.manipulate(drawn).resize(target).renderAsync();
  const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Opens the photo library and prepares the one picture chosen. Null when the person closed the picker. The system picker needs no permission. */
export async function choosePhoto(): Promise<PreparedPhoto | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    allowsEditing: false,
    quality: 1,
    exif: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? preparePhoto(asset.uri) : null;
}

/** Reads the prepared file as the body of the upload. */
export async function readPhoto(photo: PreparedPhoto): Promise<Blob> {
  const response = await fetch(photo.uri);
  return response.blob();
}
