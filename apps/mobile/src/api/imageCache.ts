import { Image } from "expo-image";

/** Photos of other members were saved on the phone as they were shown. Sign-out and deletion empty both the memory and the disk copy. */
export async function clearImageCache(): Promise<void> {
  Image.clearMemoryCache();
  await Image.clearDiskCache();
}
