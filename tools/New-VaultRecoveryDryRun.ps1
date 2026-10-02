param(
  [string]$VaultExport = "D:\Projects\Active\Vault\backups\data\stage-0-live-baseline-20260729-213508.json",
  [string]$TvRoot = "D:\TV Shows",
  [string]$Output = "D:\Projects\Active\Vault\recovery\stage-0-recovery-dry-run.json"
)

$videoExtensions = @(".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv", ".webm")

function Normalize-Title([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $normalized = $Value.ToLowerInvariant()
  $normalized = $normalized -replace "&", " and "
  $normalized = $normalized -replace "\b(the|a|an)\b", " "
  $normalized = $normalized -replace "[^a-z0-9]+", " "
  return ($normalized -replace "\s+", " ").Trim()
}

function Get-EpisodeNumbers([string]$Name) {
  $result = @()
  $compact = [regex]::Match($Name, "(?i)s\s*(\d{1,2})\s*e\s*(\d{1,3})((?:\s*e\s*\d{1,3})*)")
  if ($compact.Success) {
    $season = [int]$compact.Groups[1].Value
    $result += [int]$compact.Groups[2].Value
    foreach ($extra in [regex]::Matches($compact.Groups[3].Value, "(?i)e\s*(\d{1,3})")) {
      $result += [int]$extra.Groups[1].Value
    }
    return [pscustomobject]@{ Season = $season; Episodes = @($result | Select-Object -Unique); Pattern = "sxe" }
  }
  $xstyle = [regex]::Match($Name, "(?i)(?:^|[.\s_-])(\d{1,2})x(\d{1,3})(?:[.\s_-]|$)")
  if ($xstyle.Success) {
    return [pscustomobject]@{ Season = [int]$xstyle.Groups[1].Value; Episodes = @([int]$xstyle.Groups[2].Value); Pattern = "xstyle" }
  }
  return $null
}

function Get-Resolution([string]$Name) {
  $match = [regex]::Match($Name, "(?i)(2160|1080|720|576|480)p?")
  if ($match.Success) { return [int]$match.Groups[1].Value }
  return 0
}

function Get-ShowFolder([string]$RelativePath) {
  $parts = $RelativePath.Split("\")
  for ($index = 0; $index -lt $parts.Length - 1; $index++) {
    if ($parts[$index] -match "(?i)^season[\s._-]*\d+") {
      if ($index -gt 0) { return $parts[$index - 1] }
    }
  }
  if ($parts.Length -ge 3) { return $parts[$parts.Length - 2] }
  if ($parts.Length -ge 2) { return $parts[0] }
  return ""
}

if (-not (Test-Path -LiteralPath $VaultExport)) { throw "Vault export not found: $VaultExport" }
if (-not (Test-Path -LiteralPath $TvRoot)) { throw "TV root not found: $TvRoot" }

$save = (Get-Content -LiteralPath $VaultExport -Raw -Encoding UTF8) | ConvertFrom-Json
$shows = @($save.items.PSObject.Properties | ForEach-Object { $_.Value } | Where-Object { $_.wing -eq "tv" })
$showIndex = @{}
foreach ($show in $shows) {
  $key = Normalize-Title $show.title
  if (-not $showIndex.ContainsKey($key)) { $showIndex[$key] = @() }
  $showIndex[$key] += $show
}

$matched = [System.Collections.Generic.List[object]]::new()
$ambiguous = [System.Collections.Generic.List[object]]::new()
$unmatched = [System.Collections.Generic.List[object]]::new()
$unparsed = [System.Collections.Generic.List[object]]::new()
$specials = [System.Collections.Generic.List[object]]::new()

$videos = Get-ChildItem -LiteralPath $TvRoot -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() }

foreach ($file in $videos) {
  $relative = $file.FullName.Substring($TvRoot.Length).TrimStart("\")
  $showFolder = Get-ShowFolder $relative
  $showKey = Normalize-Title $showFolder
  $episodeInfo = Get-EpisodeNumbers $file.Name
  $record = [ordered]@{
    path = $file.FullName
    relativePath = $relative
    filename = $file.Name
    bytes = $file.Length
    modifiedAt = $file.LastWriteTimeUtc.ToString("o")
    showFolder = $showFolder
    normalizedShow = $showKey
    resolution = Get-Resolution $file.Name
    extension = $file.Extension.ToLowerInvariant()
  }
  if (-not $episodeInfo) {
    if ($relative -match "(?i)\\(movies?|specials?)\\") { $specials.Add([pscustomobject]$record) }
    else { $unparsed.Add([pscustomobject]$record) }
    continue
  }
  $record.season = $episodeInfo.Season
  $record.episodes = $episodeInfo.Episodes
  $record.pattern = $episodeInfo.Pattern
  if (-not $showIndex.ContainsKey($showKey)) {
    $unmatched.Add([pscustomobject]$record)
    continue
  }
  $candidates = @($showIndex[$showKey])
  if ($candidates.Count -ne 1) {
    $record.candidateIds = @($candidates | ForEach-Object { $_.id })
    $ambiguous.Add([pscustomobject]$record)
    continue
  }
  $record.showId = $candidates[0].id
  $record.confidence = "high"
  $matched.Add([pscustomobject]$record)
}

$noteCandidates = @()
foreach ($item in @($save.items.PSObject.Properties | ForEach-Object { $_.Value })) {
  if ([string]::IsNullOrWhiteSpace([string]$item.note)) { continue }
  $classification = if ($item.legacy -and $item.status -eq "backlog" -and $null -eq $item.rating) { "likely_legacy_description" } else { "needs_review" }
  $noteCandidates += [pscustomobject]@{ itemId = $item.id; classification = $classification; characters = ([string]$item.note).Length }
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  vaultExport = $VaultExport
  vaultExportSha256 = (Get-FileHash -LiteralPath $VaultExport -Algorithm SHA256).Hash
  tvRoot = $TvRoot
  totalVideoFiles = @($videos).Count
  highConfidenceFiles = $matched.Count
  highConfidenceEpisodeLinks = @($matched | ForEach-Object { @($_.episodes).Count } | Measure-Object -Sum).Sum
  ambiguousFiles = $ambiguous.Count
  unmatchedSeriesFiles = $unmatched.Count
  unparsedFiles = $unparsed.Count
  specialOrMovieFiles = $specials.Count
  noteCandidates = $noteCandidates.Count
  likelyLegacyDescriptions = @($noteCandidates | Where-Object { $_.classification -eq "likely_legacy_description" }).Count
  notesNeedingReview = @($noteCandidates | Where-Object { $_.classification -eq "needs_review" }).Count
}

$report = [ordered]@{
  schemaVersion = 1
  mode = "dry_run"
  summary = $summary
  highConfidenceMatches = $matched
  ambiguousMatches = $ambiguous
  unmatchedFiles = $unmatched
  unparsedFiles = $unparsed
  specialCandidates = $specials
  noteClassifications = $noteCandidates
}

$outputDirectory = Split-Path -Parent $Output
if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Output -Encoding UTF8
$outputHash = (Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash

Write-Output "Dry run: $Output"
Write-Output "SHA256: $outputHash"
$summary.GetEnumerator() | ForEach-Object { Write-Output "$($_.Key): $($_.Value)" }
