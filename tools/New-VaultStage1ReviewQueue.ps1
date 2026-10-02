param(
  [string]$LegacyReport = "D:\Projects\Active\Vault\recovery\stage-0-legacy-path-recovery.json",
  [string]$ScannerReport = "D:\Projects\Active\Vault\recovery\stage-0-recovery-dry-run-v5.json",
  [string]$Output = "D:\Projects\Active\Vault\data\stage1-review-queue.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Stable-Id([string]$value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($value)
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return "review_" + ([BitConverter]::ToString($hash).Replace("-", "").Substring(0, 16).ToLowerInvariant())
}

$legacy = Get-Content -LiteralPath $LegacyReport -Raw -Encoding UTF8 | ConvertFrom-Json
$scanner = Get-Content -LiteralPath $ScannerReport -Raw -Encoding UTF8 | ConvertFrom-Json
$createdAt = (Get-Date).ToUniversalTime().ToString("o")
$items = [Collections.Generic.List[object]]::new()

$legacyKeys = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($link in @($legacy.validLinks)) {
  [void]$legacyKeys.Add("$($link.showId)|$($link.season)|$($link.episode)")
}
foreach ($link in @($legacy.missingEpisodes)) {
  [void]$legacyKeys.Add("$($link.showId)|$($link.season)|$($link.episode)")
}

foreach ($difference in @($legacy.scannerDifferences)) {
  $parts = $difference.key.Split("|")
  $items.Add([pscustomobject]@{
    id = Stable-Id "semantic_conflict|$($difference.key)|$($difference.legacyPath)|$($difference.scannerPrimaryPath)"
    kind = "semantic_conflict"
    status = "pending"
    source = "stage0_reconciliation"
    title = "$($parts[0]) S$($parts[1])E$($parts[2])"
    reason = "The filename scan selected a different file than the original Vault."
    recommendedAction = "keep_original"
    createdAt = $createdAt
    payload = [pscustomobject]@{
      showId = $parts[0]
      season = [int]$parts[1]
      episode = [int]$parts[2]
      legacyPath = $difference.legacyPath
      scannerPath = $difference.scannerPrimaryPath
    }
  })
}

foreach ($link in @($scanner.episodeLinks)) {
  $key = "$($link.showId)|$($link.season)|$($link.episode)"
  if ($legacyKeys.Contains($key)) { continue }
  $items.Add([pscustomobject]@{
    id = Stable-Id "scanner_only|$key|$($link.primary.path)"
    kind = "scanner_only_episode"
    status = "pending"
    source = "stage0_filename_scan"
    title = "$($link.primary.showTitle) S$($link.season)E$($link.episode)"
    reason = "The filename scan found a catalog episode that the original Vault did not map."
    recommendedAction = "inspect_then_link"
    createdAt = $createdAt
    payload = [pscustomobject]@{
      showId = $link.showId
      season = [int]$link.season
      episode = [int]$link.episode
      scannerPath = $link.primary.path
      alternateCount = @($link.alternates).Count
    }
  })
}

$fileGroups = @($scanner.reviewQueue | Group-Object {
  $folder = if ([string]::IsNullOrWhiteSpace([string]$_.showFolder)) { "Unfiled" } else { [string]$_.showFolder }
  "$($_.reason)|$folder"
})
foreach ($group in $fileGroups) {
  $first = $group.Group[0]
  $folder = if ([string]::IsNullOrWhiteSpace([string]$first.showFolder)) { "Unfiled" } else { [string]$first.showFolder }
  $reason = [string]$first.reason
  $items.Add([pscustomobject]@{
    id = Stable-Id "file_group|$reason|$folder"
    kind = "file_group"
    status = "pending"
    source = "stage0_filename_scan"
    title = $folder
    reason = $reason
    recommendedAction = "inspect_group"
    createdAt = $createdAt
    payload = [pscustomobject]@{
      count = $group.Count
      matchMethod = [string]$first.matchMethod
      samplePaths = @($group.Group | Select-Object -First 3 -ExpandProperty path)
      sourceReport = "recovery/stage-0-recovery-dry-run-v5.json"
    }
  })
}

$summary = [ordered]@{
  generatedAt = $createdAt
  total = $items.Count
  semanticConflicts = @($items | Where-Object { $_.kind -eq "semantic_conflict" }).Count
  scannerOnlyEpisodes = @($items | Where-Object { $_.kind -eq "scanner_only_episode" }).Count
  fileGroups = @($items | Where-Object { $_.kind -eq "file_group" }).Count
  representedFiles = @($items | Where-Object { $_.kind -eq "file_group" } | ForEach-Object { $_.payload.count } | Measure-Object -Sum).Sum
}

$document = [ordered]@{
  schemaVersion = 1
  generatedAt = $createdAt
  sources = [ordered]@{
    legacy = "recovery/stage-0-legacy-path-recovery.json"
    scanner = "recovery/stage-0-recovery-dry-run-v5.json"
  }
  summary = $summary
  items = $items
}

$document | ConvertTo-Json -Depth 10 -Compress | Set-Content -LiteralPath $Output -Encoding UTF8
Write-Output "Review queue: $Output"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash)"
$summary.GetEnumerator() | ForEach-Object { Write-Output "$($_.Key): $($_.Value)" }
