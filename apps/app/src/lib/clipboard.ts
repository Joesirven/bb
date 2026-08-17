import { copyToClipboard } from "@bb/shared-ui/lib/clipboard";
import { appToast } from "@/components/ui/app-toast";

export { copyToClipboard };

interface CopyToClipboardOptions {
  /** Toast message shown on success (set to `null` to suppress). */
  successMessage?: string | null;
  /** Toast message shown on failure (set to `null` to suppress). */
  errorMessage?: string | null;
}

/**
 * Copies text to the clipboard and surfaces success/failure via appToast.
 * Returns `true` on success, `false` on failure.
 */
export async function copyToClipboardWithToast(
  text: string,
  {
    successMessage = "Copied",
    errorMessage = "Failed to copy",
  }: CopyToClipboardOptions = {},
): Promise<boolean> {
  const copied = await copyToClipboard(text);
  if (copied) {
    if (successMessage) appToast.success(successMessage);
  } else if (errorMessage) {
    appToast.error(errorMessage);
  }
  return copied;
}
