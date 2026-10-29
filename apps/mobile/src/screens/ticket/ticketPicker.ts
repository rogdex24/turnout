import type { ProofKind } from "@turnout/contract/ticket";
import { PDF_MIME_TYPE, SCREENSHOT_MIME_TYPES } from "@turnout/contract/ticket";
import { getDocumentAsync } from "expo-document-picker";
import { launchImageLibraryAsync } from "expo-image-picker";
import { normaliseMime, type PickedTicket } from "@/model/ticketFile";

/** A file's size when the picker did not say: the length of what is stored at the address. */
async function sizeOf(uri: string): Promise<number> {
  const response = await fetch(uri);
  return (await response.blob()).size;
}

/**
 * Opens the picker for a show's proof kind and returns the chosen file, or null when the person closed it. A BookMyShow ticket is a
 * picture, so it opens the photo library, which needs no permission. A show from another seller also takes a PDF, so it opens the
 * document picker, which lists photos too. The file is sent as it is: a screenshot needs no resizing, and the server reads the bytes.
 */
export async function chooseTicket(proofKind: ProofKind): Promise<PickedTicket | null> {
  if (proofKind === "screenshot") {
    const result = await launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      exif: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return null;
    const name = asset.fileName ?? null;
    return { uri: asset.uri, name, mime: normaliseMime(asset.mimeType, name), bytes: asset.fileSize ?? (await sizeOf(asset.uri)) };
  }
  const result = await getDocumentAsync({ type: [...SCREENSHOT_MIME_TYPES, PDF_MIME_TYPE], multiple: false, copyToCacheDirectory: true });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.name,
    mime: normaliseMime(asset.mimeType, asset.name),
    bytes: asset.size ?? (await sizeOf(asset.uri)),
  };
}

/** Reads the chosen file as the body of the upload. It fails when the file is gone. */
export async function readTicket(file: PickedTicket): Promise<Blob> {
  const response = await fetch(file.uri);
  return response.blob();
}
