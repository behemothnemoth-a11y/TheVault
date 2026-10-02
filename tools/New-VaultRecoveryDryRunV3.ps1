param(
  [string]$VaultExport = "D:\Projects\Active\Vault\backups\data\stage-0-live-baseline-20260729-213508.json",
  [string]$TvRoot = "D:\TV Shows",
  [string]$Output = "D:\Projects\Active\Vault\recovery\stage-0-recovery-dry-run-v3.json"
)

$videoExtensions = @(".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv", ".webm")
$extensionPriority = @{ ".mkv" = 3; ".mp4" = 2; ".m4v" = 1; ".avi" = 1; ".mov" = 1; ".wmv" = 1; ".webm" = 1 }

function Normalize([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return "" }
  $value = $value.ToLowerInvariant() -replace "'", "" -replace "&", " and "
  return (($value -replace "\b(the|a|an)\b", " " -replace "[^a-z0-9]+", " ") -replace "\s+", " ").Trim()
}

function Get-SeasonFromPath([string]$relativePath) {
  $parts = $relativePath.Split("\")
  for ($i = $parts.Length - 2; $i -ge 0; $i--) {
    $match = [regex]::Match($parts[$i], "(?i)\b(?:season|series)\s*0*(\d{1,2})\b")
    if ($match.Success) { return [int]$match.Groups[1].Value }
  }
  return $null
}

function Parse-Episode([string]$name, [string]$relativePath) {
  $match = [regex]::Match($name, "(?i)s\s*(\d{1,2})\s*e\s*(\d{1,3})((?:\s*e\s*\d{1,3})*)")
  if ($match.Success) {
    $episodes = @([int]$match.Groups[2].Value)
    foreach ($extra in [regex]::Matches($match.Groups[3].Value, "(?i)e\s*(\d{1,3})")) {
      $episodes += [int]$extra.Groups[1].Value
    }
    return @{ season = [int]$match.Groups[1].Value; episodes = @($episodes | Select-Object -Unique); pattern = "sxe" }
  }

  $match = [regex]::Match($name, "(?i)\bseason\s*0*(\d{1,2})\s*episode\s*0*(\d{1,3})(?:\s*(?:and|&)\s*0*(\d{1,3}))?")
  if ($match.Success) {
    $episodes = @([int]$match.Groups[2].Value)
    if ($match.Groups[3].Success) { $episodes += [int]$match.Groups[3].Value }
    return @{ season = [int]$match.Groups[1].Value; episodes = @($episodes | Select-Object -Unique); pattern = "season_episode" }
  }

  $match = [regex]::Match($name, "(?i)(?:^|[.\s_-])(\d{1,2})x(\d{1,3})(?:[.\s_-]|$)")
  if ($match.Success) {
    return @{ season = [int]$match.Groups[1].Value; episodes = @([int]$match.Groups[2].Value); pattern = "xstyle" }
  }

  $match = [regex]::Match($name, "^(?i)(?:episode[\s._-]*)?(\d{1,2})(\d{2})(?:[\s._-]|$)")
  if ($match.Success) {
    return @{ season = [int]$match.Groups[1].Value; episodes = @([int]$match.Groups[2].Value); pattern = "compact" }
  }

  $match = [regex]::Match($name, "^(?i).+?[.\s_-](\d{2})[.\s_-](\d{2})(?:[.\s_-]|$)")
  if ($match.Success) {
    return @{ season = [int]$match.Groups[1].Value; episodes = @([int]$match.Groups[2].Value); pattern = "dotstyle" }
  }

  $folderSeason = Get-SeasonFromPath $relativePath
  if ($null -ne $folderSeason) {
    $match = [regex]::Match($name, "(?i)^episode[\s._-]*0*(\d{1,3})(?:[\s._-]|$)")
    if (!$match.Success) { $match = [regex]::Match($name, "(?i)^e0*(\d{1,3})(?:[.\s_-]|$)") }
    if (!$match.Success) { $match = [regex]::Match($name, "(?i)^0*(\d{1,3})(?:\s+-|[.\s_])") }
    if ($match.Success) {
      $episodeNumber = [int]$match.Groups[1].Value
      if ($episodeNumber -ge 1 -and $episodeNumber -le 200) {
        return @{ season = $folderSeason; episodes = @($episodeNumber); pattern = "season_folder_episode" }
      }
    }
  }

  return $null
}

function Resolution([string]$name) {
  $match = [regex]::Match($name, "(?i)(2160|1080|720|576|480)p?")
  if ($match.Success) { return [int]$match.Groups[1].Value }
  return 0
}

function Is-ReviewOnlyPath([string]$relativePath) {
  return $relativePath -match "(?i)\\(?:movies?|specials?|extras?|bonus features?|featurettes?)\\"
}

$save = (Get-Content -LiteralPath $VaultExport -Raw -Encoding UTF8) | ConvertFrom-Json
$shows = @($save.items.PSObject.Properties | ForEach-Object { $_.Value } | Where-Object { $_.wing -eq "tv" })
$showIndex = @{}
$episodeIndex = @{}

foreach ($show in $shows) {
  $key = Normalize $show.title
  if (!$showIndex.ContainsKey($key)) { $showIndex[$key] = @() }
  $showIndex[$key] += $show
  $episodeSet = @{}
  foreach ($episode in @($show.episodes.PSObject.Properties | ForEach-Object { $_.Value })) {
    $episodeSet["$($episode.season)|$($episode.number)"] = $episode.id
  }
  $episodeIndex[$show.id] = $episodeSet
}

$aliases = @{
  "spongebob" = "spongebob squarepants"
  "venture brothers" = "venture bros"
  "trailer park boys" = "trailer park boys animated series"
  "attack on titan" = "attack on titan"
  "shingeki no kyojin" = "attack on titan"
  "star trek tng" = "star trek next generation"
}

function Resolve-Show([string]$relativePath) {
  $parts = $relativePath.Split("\")
  for ($i = $parts.Length - 2; $i -ge 0; $i--) {
    $candidate = $parts[$i]
    $key = Normalize $candidate
    if ($showIndex.ContainsKey($key) -and @($showIndex[$key]).Count -eq 1) {
      return @{ show = $showIndex[$key][0]; folder = $candidate; method = "ancestor_exact" }
    }

    $trimmed = $candidate -replace "(?i)\b(?:complete|season|seasons|s\d{1,2}|dvd|bluray|webrip|tvrip|dvdrip|x26[45]|10bits|dual.audio|eng.sub).*$", ""
    $trimKey = Normalize $trimmed
    if ($showIndex.ContainsKey($trimKey) -and @($showIndex[$trimKey]).Count -eq 1) {
      return @{ show = $showIndex[$trimKey][0]; folder = $candidate; method = "ancestor_trimmed" }
    }

    if ($aliases.ContainsKey($key)) {
      $aliasKey = Normalize $aliases[$key]
      if ($showIndex.ContainsKey($aliasKey) -and @($showIndex[$aliasKey]).Count -eq 1) {
        return @{ show = $showIndex[$aliasKey][0]; folder = $candidate; method = "explicit_alias" }
      }
    }
  }
  return @{ show = $null; folder = if ($parts.Length -ge 2) { $parts[$parts.Length - 2] } else { "" }; method = "unmatched" }
}

$matchedFiles = [Collections.Generic.List[object]]::new()
$unmatched = [Collections.Generic.List[object]]::new()
$unparsed = [Collections.Generic.List[object]]::new()
$specials = [Collections.Generic.List[object]]::new()
$catalogMismatches = [Collections.Generic.List[object]]::new()
$linkCandidates = @{}

$videos = Get-ChildItem -LiteralPath $TvRoot -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() }

foreach ($file in $videos) {
  $relative = $file.FullName.Substring($TvRoot.Length).TrimStart("\")
  $resolved = Resolve-Show $relative
  $episode = Parse-Episode $file.Name $relative
  $record = [ordered]@{
    path = $file.FullName
    relativePath = $relative
    filename = $file.Name
    bytes = $file.Length
    modifiedAt = $file.LastWriteTimeUtc.ToString("o")
    showFolder = $resolved.folder
    matchMethod = $resolved.method
    resolution = Resolution $file.Name
    extension = $file.Extension.ToLowerInvariant()
  }

  if (Is-ReviewOnlyPath $relative) {
    $record.reason = "special_extra_or_movie_path"
    $specials.Add([pscustomobject]$record)
    continue
  }

  if (!$episode) {
    $record.reason = "episode_number_not_parsed"
    $unparsed.Add([pscustomobject]$record)
    continue
  }

  $record.season = $episode.season
  $record.episodes = $episode.episodes
  $record.pattern = $episode.pattern

  if (!$resolved.show) {
    $record.reason = "series_not_matched"
    $unmatched.Add([pscustomobject]$record)
    continue
  }

  $record.showId = $resolved.show.id
  $record.showTitle = $resolved.show.title
  $missingEpisodes = @()
  foreach ($number in $episode.episodes) {
    if (!$episodeIndex[$resolved.show.id].ContainsKey("$($episode.season)|$number")) { $missingEpisodes += $number }
  }
  if ($missingEpisodes.Count -gt 0) {
    $record.reason = "episode_not_in_catalog"
    $record.missingEpisodes = $missingEpisodes
    $catalogMismatches.Add([pscustomobject]$record)
    continue
  }

  $record.confidence = "high"
  $matchedRecord = [pscustomobject]$record
  $matchedFiles.Add($matchedRecord)
  foreach ($number in $episode.episodes) {
    $linkKey = "$($resolved.show.id)|$($episode.season)|$number"
    if (!$linkCandidates.ContainsKey($linkKey)) { $linkCandidates[$linkKey] = @() }
    $linkCandidates[$linkKey] += $matchedRecord
  }
}

$episodeLinks = [Collections.Generic.List[object]]::new()
foreach ($entry in $linkCandidates.GetEnumerator()) {
  $parts = $entry.Key.Split("|")
  $ranked = @($entry.Value | Sort-Object `
    @{ Expression = { [int]$_.resolution }; Descending = $true }, `
    @{ Expression = { [int]$extensionPriority[$_.extension] }; Descending = $true }, `
    @{ Expression = { [long]$_.bytes }; Descending = $true }, `
    @{ Expression = { $_.path }; Descending = $false })
  $episodeLinks.Add([pscustomobject]@{
    showId = $parts[0]
    season = [int]$parts[1]
    episode = [int]$parts[2]
    primary = $ranked[0]
    alternates = @($ranked | Select-Object -Skip 1)
  })
}

$notes = @()
foreach ($item in @($save.items.PSObject.Properties | ForEach-Object { $_.Value })) {
  if ([string]::IsNullOrWhiteSpace([string]$item.note)) { continue }
  $kind = if ($item.legacy -and $item.status -eq "backlog" -and $null -eq $item.rating) { "likely_legacy_description" } else { "needs_review" }
  $notes += [pscustomobject]@{ itemId = $item.id; classification = $kind; characters = ([string]$item.note).Length }
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  totalVideoFiles = @($videos).Count
  highConfidenceFiles = $matchedFiles.Count
  highConfidenceEpisodeLinks = @($matchedFiles | ForEach-Object { @($_.episodes).Count } | Measure-Object -Sum).Sum
  primaryEpisodeLinks = $episodeLinks.Count
  episodeLinksWithAlternates = @($episodeLinks | Where-Object { @($_.alternates).Count -gt 0 }).Count
  unmatchedSeriesFiles = $unmatched.Count
  unparsedFiles = $unparsed.Count
  specialOrExtraFiles = $specials.Count
  catalogMismatchFiles = $catalogMismatches.Count
  likelyLegacyDescriptions = @($notes | Where-Object { $_.classification -eq "likely_legacy_description" }).Count
  notesNeedingReview = @($notes | Where-Object { $_.classification -eq "needs_review" }).Count
}

$reviewQueue = @(
  $unmatched
  $unparsed
  $specials
  $catalogMismatches
)

$report = [ordered]@{
  schemaVersion = 3
  mode = "dry_run"
  summary = $summary
  episodeLinks = $episodeLinks
  highConfidenceMatches = $matchedFiles
  reviewQueue = $reviewQueue
  unmatchedFiles = $unmatched
  unparsedFiles = $unparsed
  specialCandidates = $specials
  catalogMismatches = $catalogMismatches
  noteClassifications = $notes
}

$directory = Split-Path -Parent $Output
if (!(Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$report | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $Output -Encoding UTF8
Write-Output "Dry run: $Output"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash)"
$summary.GetEnumerator() | ForEach-Object { Write-Output "$($_.Key): $($_.Value)" }
