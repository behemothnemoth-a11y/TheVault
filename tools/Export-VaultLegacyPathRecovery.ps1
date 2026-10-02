param(
  [string]$LegacyHtml = "D:\TV Shows\The Vault.html",
  [string]$VaultExport = "D:\Projects\Active\Vault\backups\data\stage-0-live-baseline-20260729-213508.json",
  [string]$TvRoot = "D:\TV Shows",
  [string]$ScannerReport = "D:\Projects\Active\Vault\recovery\stage-0-recovery-dry-run-v5.json",
  [string]$Output = "D:\Projects\Active\Vault\recovery\stage-0-legacy-path-recovery.json"
)

function Extract-ObjectJson([string]$source, [string]$assignment) {
  $markerIndex = $source.IndexOf($assignment)
  if ($markerIndex -lt 0) { throw "Assignment not found: $assignment" }
  $braceIndex = $source.IndexOf("{", $markerIndex)
  if ($braceIndex -lt 0) { throw "Opening brace not found after: $assignment" }

  $depth = 0
  $inString = $false
  $escaped = $false
  for ($i = $braceIndex; $i -lt $source.Length; $i++) {
    $character = $source[$i]
    if ($inString) {
      if ($escaped) { $escaped = $false }
      elseif ($character -eq [char]92) { $escaped = $true }
      elseif ($character -eq [char]34) { $inString = $false }
      continue
    }
    if ($character -eq [char]34) { $inString = $true; continue }
    if ($character -eq "{") { $depth++ }
    elseif ($character -eq "}") {
      $depth--
      if ($depth -eq 0) { return $source.Substring($braceIndex, $i - $braceIndex + 1) }
    }
  }
  throw "Object assigned to $assignment is not balanced."
}

function CanonicalPath([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return "" }
  return [IO.Path]::GetFullPath($path).TrimEnd("\").ToLowerInvariant()
}

$html = Get-Content -LiteralPath $LegacyHtml -Raw -Encoding UTF8
$pathsJson = Extract-ObjectJson $html "PATHS="
$legacyPaths = $pathsJson | ConvertFrom-Json
$save = Get-Content -LiteralPath $VaultExport -Raw -Encoding UTF8 | ConvertFrom-Json

$shows = @($save.items.PSObject.Properties | ForEach-Object { $_.Value } | Where-Object { $_.wing -eq "tv" })
$slugIndex = @{}
$episodeIndex = @{}

foreach ($show in $shows) {
  $slug = [string]$show.legacy.slug
  if (![string]::IsNullOrWhiteSpace($slug)) {
    if (!$slugIndex.ContainsKey($slug)) { $slugIndex[$slug] = @() }
    $slugIndex[$slug] += $show
  }
  $episodes = @{}
  foreach ($episode in @($show.episodes.PSObject.Properties | ForEach-Object { $_.Value })) {
    $episodes["$($episode.season)|$($episode.number)"] = $episode
  }
  $episodeIndex[$show.id] = $episodes
}

$validLinks = [Collections.Generic.List[object]]::new()
$missingFiles = [Collections.Generic.List[object]]::new()
$missingShows = [Collections.Generic.List[object]]::new()
$ambiguousShows = [Collections.Generic.List[object]]::new()
$missingEpisodes = [Collections.Generic.List[object]]::new()
$outOfRootPaths = [Collections.Generic.List[object]]::new()
$existingFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
Get-ChildItem -LiteralPath $TvRoot -Recurse -File -ErrorAction SilentlyContinue |
  ForEach-Object { [void]$existingFiles.Add((CanonicalPath $_.FullName)) }

foreach ($seriesProperty in $legacyPaths.PSObject.Properties) {
  $slug = $seriesProperty.Name
  $showMatches = if ($slugIndex.ContainsKey($slug)) { @($slugIndex[$slug]) } else { @() }
  foreach ($seasonProperty in $seriesProperty.Value.PSObject.Properties) {
    $season = [int]$seasonProperty.Name
    foreach ($episodeProperty in $seasonProperty.Value.PSObject.Properties) {
      $episodeNumber = [int]$episodeProperty.Name
      $legacyValue = @($episodeProperty.Value)
      $relativePath = [string]$legacyValue[1]
      $fullPath = [IO.Path]::GetFullPath((Join-Path $TvRoot $relativePath.Replace("/", "\")))
      $baseRecord = [ordered]@{
        legacySlug = $slug
        season = $season
        episode = $episodeNumber
        relativePath = $relativePath
        path = $fullPath
        legacyFlag = if ($legacyValue.Count -gt 0) { $legacyValue[0] } else { $null }
      }

      if (!(CanonicalPath $fullPath).StartsWith((CanonicalPath $TvRoot) + "\")) {
        $baseRecord.reason = "path_outside_tv_root"
        $outOfRootPaths.Add([pscustomobject]$baseRecord)
        continue
      }
      if ($showMatches.Count -eq 0) {
        $baseRecord.reason = "legacy_slug_not_in_export"
        $missingShows.Add([pscustomobject]$baseRecord)
        continue
      }
      if ($showMatches.Count -gt 1) {
        $baseRecord.reason = "legacy_slug_ambiguous"
        $baseRecord.showIds = @($showMatches | ForEach-Object { $_.id })
        $ambiguousShows.Add([pscustomobject]$baseRecord)
        continue
      }

      $show = $showMatches[0]
      $baseRecord.showId = $show.id
      $baseRecord.showTitle = $show.title
      $episodeKey = "$season|$episodeNumber"
      if (!$episodeIndex[$show.id].ContainsKey($episodeKey)) {
        $baseRecord.reason = "episode_not_in_export"
        $missingEpisodes.Add([pscustomobject]$baseRecord)
        continue
      }

      $baseRecord.episodeId = $episodeIndex[$show.id][$episodeKey].id
      $baseRecord.exists = $existingFiles.Contains((CanonicalPath $fullPath))
      $record = [pscustomobject]$baseRecord
      if ($record.exists) { $validLinks.Add($record) }
      else {
        $record | Add-Member -NotePropertyName reason -NotePropertyValue "file_missing_at_legacy_path"
        $missingFiles.Add($record)
      }
    }
  }
}

$comparison = [ordered]@{
  scannerReportAvailable = Test-Path -LiteralPath $ScannerReport -PathType Leaf
  inBoth = 0
  samePrimaryPath = 0
  differentPrimaryPath = 0
  legacyOnly = 0
  scannerOnly = 0
}
$differences = [Collections.Generic.List[object]]::new()

if ($comparison.scannerReportAvailable) {
  $scanner = Get-Content -LiteralPath $ScannerReport -Raw -Encoding UTF8 | ConvertFrom-Json
  $legacyByEpisode = @{}
  foreach ($link in $validLinks) { $legacyByEpisode["$($link.showId)|$($link.season)|$($link.episode)"] = $link }
  $scannerByEpisode = @{}
  foreach ($link in @($scanner.episodeLinks)) { $scannerByEpisode["$($link.showId)|$($link.season)|$($link.episode)"] = $link }

  foreach ($key in $legacyByEpisode.Keys) {
    if (!$scannerByEpisode.ContainsKey($key)) { $comparison.legacyOnly++; continue }
    $comparison.inBoth++
    $legacyPath = CanonicalPath $legacyByEpisode[$key].path
    $scannerPath = CanonicalPath $scannerByEpisode[$key].primary.path
    if ($legacyPath -eq $scannerPath) { $comparison.samePrimaryPath++ }
    else {
      $comparison.differentPrimaryPath++
      $differences.Add([pscustomobject]@{
        key = $key
        legacyPath = $legacyByEpisode[$key].path
        scannerPrimaryPath = $scannerByEpisode[$key].primary.path
      })
    }
  }
  foreach ($key in $scannerByEpisode.Keys) {
    if (!$legacyByEpisode.ContainsKey($key)) { $comparison.scannerOnly++ }
  }
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  legacyPathSeries = @($legacyPaths.PSObject.Properties).Count
  legacyPathMappings = $validLinks.Count + $missingFiles.Count + $missingShows.Count + $ambiguousShows.Count + $missingEpisodes.Count + $outOfRootPaths.Count
  validExistingEpisodeLinks = $validLinks.Count
  missingFiles = $missingFiles.Count
  missingShows = $missingShows.Count
  ambiguousShows = $ambiguousShows.Count
  missingEpisodes = $missingEpisodes.Count
  outOfRootPaths = $outOfRootPaths.Count
}

$report = [ordered]@{
  schemaVersion = 1
  mode = "read_only_recovery"
  authority = "legacy_html_paths"
  source = [ordered]@{
    legacyHtml = $LegacyHtml
    legacyHtmlSha256 = (Get-FileHash -LiteralPath $LegacyHtml -Algorithm SHA256).Hash
    vaultExport = $VaultExport
    vaultExportSha256 = (Get-FileHash -LiteralPath $VaultExport -Algorithm SHA256).Hash
    scannerReport = $ScannerReport
  }
  summary = $summary
  comparison = $comparison
  validLinks = $validLinks
  missingFiles = $missingFiles
  missingShows = $missingShows
  ambiguousShows = $ambiguousShows
  missingEpisodes = $missingEpisodes
  outOfRootPaths = $outOfRootPaths
  scannerDifferences = $differences
}

$directory = Split-Path -Parent $Output
if (!(Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$report | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $Output -Encoding UTF8
Write-Output "Legacy path recovery: $Output"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash)"
$summary.GetEnumerator() | ForEach-Object { Write-Output "$($_.Key): $($_.Value)" }
$comparison.GetEnumerator() | ForEach-Object { Write-Output "comparison.$($_.Key): $($_.Value)" }
