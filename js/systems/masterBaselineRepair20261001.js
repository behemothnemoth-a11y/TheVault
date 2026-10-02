import { createArchiveSnapshot, flushPersistence, getState, update } from "../core/store.js";

const FLAG = "masterBaselineRepair20261001";

export async function runMasterBaselineRepair() {
  const state = getState();
  if (state.metadata?.maintenance?.[FLAG]) return null;

  const recoveredAt = state.metadata?.maintenance?.pathRecovery20261001?.completedAt;
  const scan = state.metadata?.masterScan;
  if (!recoveredAt || !scan?.scannedAt) return null;

  // Only replace a scan that predates the path recovery. That first-run ledger
  // treated the already-organized library as thousands of brand-new files.
  if (new Date(scan.scannedAt).getTime() >= new Date(recoveredAt).getTime()) return null;

  await createArchiveSnapshot("Protected backup before Master Scan baseline repair", {
    kind: "master_scan_baseline_repair",
    protected: true
  });

  const response = await fetch("./__vault/master-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault-Request": "master-scan" },
    body: "{}"
  });  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.scanned) throw new Error("Could not rebuild the D: scan baseline.");

  const lastRun = {
    firstRun: true,
    baselineOnly: true,
    fileCount: Number(payload.fileCount || 0),
    durationMs: Number(payload.durationMs || 0),
    truncated: Boolean(payload.truncated),
    added: 0,
    moved: 0,
    changed: 0,
    removed: 0,
    repointed: 0,
    flagged: 0,
    unchanged: Number(payload.fileCount || 0),
    at: payload.scannedAt
  };

  update(save => {
    save.metadata.masterScan = {
      scannedAt: payload.scannedAt,
      fileCount: Number(payload.fileCount || 0),
      durationMs: Number(payload.durationMs || 0),
      truncated: Boolean(payload.truncated),
      files: (payload.files || []).map(file => ({
        id: file.id, path: file.path, bytes: file.bytes,
        lastWriteUtc: file.lastWriteUtc, kind: file.kind, extension: file.extension
      })),
      review: [],
      missing: [],
      lastRun
    };    save.metadata.maintenance ||= {};
    save.metadata.maintenance[FLAG] = {
      completedAt: new Date().toISOString(),
      replacedScanAt: scan.scannedAt,
      baselineAt: payload.scannedAt,
      clearedReviewEntries: (scan.review || []).length,
      fileCount: Number(payload.fileCount || 0)
    };
  });

  await flushPersistence();
  return {
    clearedReviewEntries: (scan.review || []).length,
    fileCount: Number(payload.fileCount || 0),
    scannedAt: payload.scannedAt
  };
}
