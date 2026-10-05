import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type Photo = { uri: string; base64: string };

const LONGEST_SIDE = 2000; // sharp enough for handwriting, small enough to upload quickly

/** Take or choose a photo (of a prescription or a medicine package). Returns null if the person cancels. */
export async function getPhoto(source: 'camera' | 'library'): Promise<Photo | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('CareLoop needs the camera to take this photo. You can choose a saved photo instead.');
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  let context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > LONGEST_SIDE) {
    context = context.resize(asset.width >= asset.height ? { width: LONGEST_SIDE } : { height: LONGEST_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error("Couldn't prepare the photo. Please try again.");
  return { uri: saved.uri, base64: saved.base64 };
}
