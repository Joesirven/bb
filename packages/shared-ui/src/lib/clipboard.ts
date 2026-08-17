/**
 * Copies through a hidden textarea and the legacy `document.execCommand`.
 *
 * `navigator.clipboard` only exists in a secure context: https, or http on
 * localhost/127.0.0.1. Reaching a bb server over a local network address such as
 * http://192.168.1.20:38886 leaves it undefined, so an unguarded copy button
 * throws there. `execCommand("copy")` is deprecated but carries no
 * secure-context requirement, so it still covers that origin.
 *
 * Must run inside the user gesture that requested the copy, which is why
 * {@link copyToClipboard} reaches it without awaiting anything first when the
 * Clipboard API is absent.
 */
function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  // `readonly` stops the mobile keyboard from opening; the fixed 1px box keeps
  // the page from scrolling to the element when we select it.
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.opacity = "0";

  const previouslyFocused = document.activeElement;
  document.body.appendChild(textarea);
  try {
    textarea.select();
    // Safari ignores select() on a readonly textarea without an explicit range.
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  }
}

/**
 * Copies text to the clipboard, falling back to `execCommand` outside a secure
 * context. Returns `true` on success, `false` on failure, and never throws, so
 * callers can surface their own success/failure affordance.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // The API can exist and still reject: permission denied, or the document
      // was not focused. The textarea path often succeeds where it does not.
    }
  }
  return copyViaExecCommand(text);
}
