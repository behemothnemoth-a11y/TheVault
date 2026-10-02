param(
  [string]$Baseline = "D:\Projects\Active\Vault\backups\data\stage-0-live-baseline-20260729-213508.json",
  [string]$LegacyPathReport = "D:\Projects\Active\Vault\recovery\stage-0-legacy-path-recovery.json",
  [string]$ScannerReport = "D:\Projects\Active\Vault\recovery\stage-0-recovery-dry-run-v5.json",
  [string]$Output = "D:\Projects\Active\Vault\recovery\vault-reconstruction-stage-0-repaired-2026-07-29.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Set-Property($object, [string]$name, $value) {
  $object | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force
}

$baselineHashBefore = (Get-FileHash -LiteralPath $Baseline -Algorithm SHA256).Hash
$save = Get-Content -LiteralPath $Baseline -Raw -Encoding UTF8 | ConvertFrom-Json
$legacy = Get-Content -LiteralPath $LegacyPathReport -Raw -Encoding UTF8 | ConvertFrom-Json
$scanner = Get-Content -LiteralPath $ScannerReport -Raw -Encoding UTF8 | ConvertFrom-Json

$items = @{}
foreach ($property in $save.items.PSObject.Properties) { $items[$property.Name] = $property.Value }

$descriptionsMoved = 0
foreach ($item in $items.Values) {
  $note = [string]$item.note
  if (
    ![string]::IsNullOrWhiteSpace($note) -and
    $null -ne $item.legacy -and
    $item.status -eq "backlog" -and
    $null -eq $item.rating
  ) {
    Set-Property $item "description" $note
    Set-Property $item "note" ""
    $descriptionsMoved++
  }
}

$linkedEpisodes = 0
$touchedShows = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($link in @($legacy.validLinks)) {
  if (!$items.ContainsKey([string]$link.showId)) { throw "Valid link references missing show: $($link.showId)" }
  $show = $items[[string]$link.showId]
  $episode = $show.episodes.PSObject.Properties |
    ForEach-Object { $_.Value } |
    Where-Object { [int]$_.season -eq [int]$link.season -and [int]$_.number -eq [int]$link.episode } |
    Select-Object -First 1
  if ($null -eq $episode) { throw "Valid link references missing episode: $($link.showId) S$($link.season)E$($link.episode)" }
  Set-Property $episode "sourcePath" ([string]$link.path)
  Set-Property $show "owned" $true
  [void]$touchedShows.Add([string]$show.id)
  $linkedEpisodes++
}

$restoredEpisodes = 0
foreach ($link in @($legacy.missingEpisodes)) {
  if (!$items.ContainsKey([string]$link.showId)) { throw "Missing-episode link references missing show: $($link.showId)" }
  $show = $items[[string]$link.showId]
  $existing = $show.episodes.PSObject.Properties |
    ForEach-Object { $_.Value } |
    Where-Object { [int]$_.season -eq [int]$link.season -and [int]$_.number -eq [int]$link.episode } |
    Select-Object -First 1
  if ($null -ne $existing) { throw "Episode marked missing already exists: $($link.showId) S$($link.season)E$($link.episode)" }

  $seasonToken = "{0:D2}" -f [int]$link.season
  $episodeToken = "{0:D2}" -f [int]$link.episode
  $episodeId = "$($show.id)_s${seasonToken}e${episodeToken}"
  $episode = [pscustomobject]@{
    id = $episodeId
    season = [int]$link.season
    number = [int]$link.episode
    status = "backlog"
    rating = $null
    note = ""
    rewatches = 0
    sourcePath = [string]$link.path
  }
  $show.episodes | Add-Member -NotePropertyName $episodeId -NotePropertyValue $episode
  Set-Property $show "owned" $true
  [void]$touchedShows.Add([string]$show.id)
  $linkedEpisodes++
  $restoredEpisodes++
}

foreach ($showId in $touchedShows) {
  $show = $items[$showId]
  $episodes = @($show.episodes.PSObject.Properties | ForEach-Object { $_.Value })
  $completed = @($episodes | Where-Object { $_.status -eq "completed" }).Count
  Set-Property $show "progress" ([pscustomobject]@{ completed = $completed; total = $episodes.Count })
  Set-Property $show "status" $(if ($completed -gt 0 -and $completed -eq $episodes.Count) { "completed" } elseif ($completed -gt 0) { "in_progress" } else { "backlog" })
}

$scannerOnly = [int]$legacy.comparison.scannerOnly
$scannerDisagreements = [int]$legacy.comparison.differentPrimaryPath
$pendingByReason = [ordered]@{}
foreach ($group in @($scanner.reviewQueue | Group-Object reason | Sort-Object Name)) {
  $pendingByReason[$group.Name] = $group.Count
}

$recoveryTimestamp = (Get-Date).ToUniversalTime().ToString("o")
$recoveryMetadata = [pscustomobject]@{
  stage = 0
  completedAt = $recoveryTimestamp
  authority = "legacy_html_paths"
  sourceReports = [pscustomobject]@{
    legacyPaths = "recovery/stage-0-legacy-path-recovery.json"
    scanner = "recovery/stage-0-recovery-dry-run-v5.json"
  }
  imported = [pscustomobject]@{
    linkedEpisodes = $linkedEpisodes
    restoredCombinedFileEpisodes = $restoredEpisodes
    seriesMarkedOwned = $touchedShows.Count
    legacyDescriptionsMoved = $descriptionsMoved
  }
  review = [pscustomobject]@{
    scannerOnlyEpisodeProposals = $scannerOnly
    scannerLegacyPathDisagreements = $scannerDisagreements
    pendingFileGroupsByReason = [pscustomobject]$pendingByReason
  }
}

Set-Property $save.metadata "stage0Recovery" $recoveryMetadata
Set-Property $save.metadata "sampleData" $false
Set-Property $save "updatedAt" $recoveryTimestamp

$directory = Split-Path -Parent $Output
if (!(Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$save | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $Output -Encoding UTF8

$baselineHashAfter = (Get-FileHash -LiteralPath $Baseline -Algorithm SHA256).Hash
if ($baselineHashBefore -ne $baselineHashAfter) { throw "Baseline hash changed during repair generation." }

$written = Get-Content -LiteralPath $Output -Raw -Encoding UTF8 | ConvertFrom-Json
$writtenItems = @($written.items.PSObject.Properties | ForEach-Object { $_.Value })
$writtenEpisodes = @($writtenItems | Where-Object { $_.wing -eq "tv" } | ForEach-Object { $_.episodes.PSObject.Properties | ForEach-Object { $_.Value } })
$writtenLinked = @($writtenEpisodes | Where-Object { $_.PSObject.Properties["sourcePath"] -and ![string]::IsNullOrWhiteSpace([string]$_.sourcePath) })
$writtenNotes = @($writtenItems | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_.note) })
$writtenDescriptions = @($writtenItems | Where-Object { $_.PSObject.Properties["description"] -and ![string]::IsNullOrWhiteSpace([string]$_.description) })

$verification = [ordered]@{
  output = $Output
  outputSha256 = (Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash
  baselineSha256 = $baselineHashAfter
  topLevelItems = $writtenItems.Count
  tvEpisodes = $writtenEpisodes.Count
  episodesWithSourcePath = $writtenLinked.Count
  restoredEpisodes = $restoredEpisodes
  descriptionsMoved = $descriptionsMoved
  remainingNonEmptyItemNotes = $writtenNotes.Count
  nonEmptyDescriptions = $writtenDescriptions.Count
  touchedShows = $touchedShows.Count
}

$verification.GetEnumerator() | ForEach-Object { Write-Output "$($_.Key): $($_.Value)" }
