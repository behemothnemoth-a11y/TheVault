param(
  [string]$VaultExport = "D:\Projects\Active\Vault\backups\data\stage-0-live-baseline-20260729-213508.json",
  [string]$TvRoot = "D:\TV Shows",
  [string]$Output = "D:\Projects\Active\Vault\recovery\stage-0-recovery-dry-run-v2.json"
)
$videoExtensions = @(".mkv",".mp4",".avi",".m4v",".mov",".wmv",".webm")
function Normalize([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return "" }
  $value = $value.ToLowerInvariant() -replace "'","" -replace "&"," and "
  return (($value -replace "\b(the|a|an)\b"," " -replace "[^a-z0-9]+"," ") -replace "\s+"," ").Trim()
}
function Parse-Episode([string]$name) {
  $match=[regex]::Match($name,"(?i)s\s*(\d{1,2})\s*e\s*(\d{1,3})((?:\s*e\s*\d{1,3})*)")
  if($match.Success){$episodes=@([int]$match.Groups[2].Value);foreach($extra in [regex]::Matches($match.Groups[3].Value,"(?i)e\s*(\d{1,3})")){$episodes+=[int]$extra.Groups[1].Value};return @{season=[int]$match.Groups[1].Value;episodes=@($episodes|Select-Object -Unique);pattern="sxe"}}
  $match=[regex]::Match($name,"(?i)(?:^|[.\s_-])(\d{1,2})x(\d{1,3})(?:[.\s_-]|$)")
  if($match.Success){return @{season=[int]$match.Groups[1].Value;episodes=@([int]$match.Groups[2].Value);pattern="xstyle"}}
  $match=[regex]::Match($name,"^(?i)(?:episode[\s._-]*)?(\d{1,2})(\d{2})(?:[\s._-]|$)")
  if($match.Success){return @{season=[int]$match.Groups[1].Value;episodes=@([int]$match.Groups[2].Value);pattern="compact"}}
  $match=[regex]::Match($name,"^(?i).+?[.\s_-](\d{2})[.\s_-](\d{2})(?:[.\s_-]|$)")
  if($match.Success){return @{season=[int]$match.Groups[1].Value;episodes=@([int]$match.Groups[2].Value);pattern="dotstyle"}}
  return $null
}
function Resolution([string]$name){$m=[regex]::Match($name,"(?i)(2160|1080|720|576|480)p?");if($m.Success){return [int]$m.Groups[1].Value};return 0}
$save=(Get-Content -LiteralPath $VaultExport -Raw -Encoding UTF8)|ConvertFrom-Json
$shows=@($save.items.PSObject.Properties|ForEach-Object{$_.Value}|Where-Object{$_.wing-eq"tv"})
$index=@{};foreach($show in $shows){$key=Normalize $show.title;if(!$index.ContainsKey($key)){$index[$key]=@()};$index[$key]+=$show}
$aliases=@{
  "spongebob"="spongebob squarepants"
  "venture brothers"="venture bros"
  "trailer park boys"="trailer park boys animated series"
  "attack on titan"="attack on titan"
  "shingeki no kyojin"="attack on titan"
  "star trek tng"="star trek next generation"
}
function Resolve-Show([string]$relative){
  $parts=$relative.Split("\");$attempts=@()
  for($i=$parts.Length-2;$i-ge0;$i--){
    $candidate=$parts[$i];$key=Normalize $candidate;$attempts+=$key
    if($index.ContainsKey($key)-and@($index[$key]).Count-eq1){return @{show=$index[$key][0];folder=$candidate;method="ancestor_exact"}}
    $trimmed=$candidate-replace"(?i)\b(?:complete|season|seasons|s\d{1,2}|dvd|bluray|webrip|tvrip|dvdrip|x26[45]|10bits|dual.audio|eng.sub).*$",""
    $trimKey=Normalize $trimmed
    if($index.ContainsKey($trimKey)-and@($index[$trimKey]).Count-eq1){return @{show=$index[$trimKey][0];folder=$candidate;method="ancestor_trimmed"}}
    if($aliases.ContainsKey($key)){ $aliasKey=Normalize $aliases[$key];if($index.ContainsKey($aliasKey)-and@($index[$aliasKey]).Count-eq1){return @{show=$index[$aliasKey][0];folder=$candidate;method="explicit_alias"}}}
  }
  return @{show=$null;folder=if($parts.Length-ge2){$parts[$parts.Length-2]}else{""};method="unmatched";attempts=$attempts}
}
$matched=[Collections.Generic.List[object]]::new();$unmatched=[Collections.Generic.List[object]]::new();$unparsed=[Collections.Generic.List[object]]::new();$specials=[Collections.Generic.List[object]]::new()
$videos=Get-ChildItem -LiteralPath $TvRoot -Recurse -File -ErrorAction SilentlyContinue|Where-Object{$videoExtensions-contains$_.Extension.ToLowerInvariant()}
foreach($file in $videos){
  $relative=$file.FullName.Substring($TvRoot.Length).TrimStart("\");$resolved=Resolve-Show $relative;$episode=Parse-Episode $file.Name
  $record=[ordered]@{path=$file.FullName;relativePath=$relative;filename=$file.Name;bytes=$file.Length;modifiedAt=$file.LastWriteTimeUtc.ToString("o");showFolder=$resolved.folder;matchMethod=$resolved.method;resolution=Resolution $file.Name;extension=$file.Extension.ToLowerInvariant()}
  if(!$episode){if($relative-match"(?i)\\(movies?|specials?|extras|bonus features)\\"){$specials.Add([pscustomobject]$record)}else{$unparsed.Add([pscustomobject]$record)};continue}
  $record.season=$episode.season;$record.episodes=$episode.episodes;$record.pattern=$episode.pattern
  if(!$resolved.show){$unmatched.Add([pscustomobject]$record);continue}
  $record.showId=$resolved.show.id;$record.confidence="high";$matched.Add([pscustomobject]$record)
}
$notes=@();foreach($item in @($save.items.PSObject.Properties|ForEach-Object{$_.Value})){if([string]::IsNullOrWhiteSpace([string]$item.note)){continue};$kind=if($item.legacy-and$item.status-eq"backlog"-and$null-eq$item.rating){"likely_legacy_description"}else{"needs_review"};$notes+=[pscustomobject]@{itemId=$item.id;classification=$kind;characters=([string]$item.note).Length}}
$summary=[ordered]@{generatedAt=(Get-Date).ToUniversalTime().ToString("o");totalVideoFiles=@($videos).Count;highConfidenceFiles=$matched.Count;highConfidenceEpisodeLinks=@($matched|ForEach-Object{@($_.episodes).Count}|Measure-Object -Sum).Sum;unmatchedSeriesFiles=$unmatched.Count;unparsedFiles=$unparsed.Count;specialOrExtraFiles=$specials.Count;likelyLegacyDescriptions=@($notes|Where-Object{$_.classification-eq"likely_legacy_description"}).Count;notesNeedingReview=@($notes|Where-Object{$_.classification-eq"needs_review"}).Count}
$report=[ordered]@{schemaVersion=2;mode="dry_run";summary=$summary;highConfidenceMatches=$matched;unmatchedFiles=$unmatched;unparsedFiles=$unparsed;specialCandidates=$specials;noteClassifications=$notes}
$directory=Split-Path -Parent $Output;if(!(Test-Path -LiteralPath $directory)){New-Item -ItemType Directory -Path $directory -Force|Out-Null}
$report|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $Output -Encoding UTF8
Write-Output "Dry run: $Output";Write-Output "SHA256: $((Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash)";$summary.GetEnumerator()|ForEach-Object{Write-Output "$($_.Key): $($_.Value)"}
