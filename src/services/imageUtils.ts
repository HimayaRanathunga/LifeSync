import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Resizes and compresses a picked photo before it's sent to the AI analysis Cloud Function —
 * keeps the callable-function payload small (faster upload, lower per-call cost) without
 * meaningfully hurting the vision model's ability to recognise food.
 */
export async function prepareImageForUpload(uri: string): Promise<{ base64: string; mimeType: string }> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 800 });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });

  if (!result.base64) {
    throw new Error('Image processing failed to produce base64 data.');
  }
  return { base64: result.base64, mimeType: 'image/jpeg' };
}
