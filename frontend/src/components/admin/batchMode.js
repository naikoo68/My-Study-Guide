// The admin's last choice in BatchModePicker, remembered per browser.
export const BATCH_MODE_KEY = "msg-ai-batch-mode";

export function loadBatchMode() {
  try { return localStorage.getItem(BATCH_MODE_KEY) === "max" ? "max" : "spread"; } catch { return "spread"; }
}
