param([int]$Port = 4173)
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "The Vault is open at http://127.0.0.1:$Port/"
Write-Host "Press Ctrl+C to close it."
$mime = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="text/javascript; charset=utf-8"
  ".json"="application/json; charset=utf-8"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"
  ".webp"="image/webp"; ".svg"="image/svg+xml"
}
$mediaExtensions = @(".avi", ".m2ts", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".rmvb", ".ts", ".webm", ".wmv")
$rootBoundary = $root.TrimEnd('\') + '\'

function Test-ImageSignature([byte[]]$bytes, [string]$kind) {
  if ($kind -eq "jpeg") { return $bytes.Length -ge 3 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[2] -eq 0xFF }
  if ($kind -eq "png") { return $bytes.Length -ge 8 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47 -and $bytes[4] -eq 0x0D -and $bytes[5] -eq 0x0A -and $bytes[6] -eq 0x1A -and $bytes[7] -eq 0x0A }
  if ($kind -eq "webp") {
    return $bytes.Length -ge 12 -and [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -eq "RIFF" -and [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -eq "WEBP"
  }
  return $false
}

function Send-Json($response, [int]$status, [string]$json) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $status
  $response.ContentType = "application/json; charset=utf-8"
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

function Read-JsonBody($request) {
  $reader = [IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
  try { return $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Close() }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; media-src 'self' file:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"
    $context.Response.Headers["X-Content-Type-Options"] = "nosniff"
    $context.Response.Headers["Referrer-Policy"] = "no-referrer"
    $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))

    if ($relative -eq "__vault/open") {
      try {
        if ($context.Request.HttpMethod -ne "POST" -or $context.Request.Headers["X-Vault-Request"] -ne "open-episode") {
          Send-Json $context.Response 403 '{"opened":false,"error":"forbidden"}'
          continue
        }
        $payload = Read-JsonBody $context.Request
        $mediaPath = [IO.Path]::GetFullPath([string]$payload.path)
        $extension = [IO.Path]::GetExtension($mediaPath).ToLowerInvariant()
        if (-not $mediaPath.StartsWith("D:\", [StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $mediaPath -PathType Leaf) -or
            $extension -notin $mediaExtensions) {
          Send-Json $context.Response 400 '{"opened":false,"error":"invalid_path"}'
          continue
        }
        Start-Process -FilePath $mediaPath
        Send-Json $context.Response 200 '{"opened":true}'
      } catch {
        Send-Json $context.Response 500 '{"opened":false,"error":"launcher_failed"}'
      }
      continue
    }

    if ($relative -eq "__vault/artwork") {
      try {
        if ($context.Request.HttpMethod -ne "POST" -or $context.Request.Headers["X-Vault-Request"] -ne "save-artwork") {
          Send-Json $context.Response 403 '{"saved":false,"error":"forbidden"}'
          continue
        }
        $payload = Read-JsonBody $context.Request
        $itemId = [string]$payload.itemId
        $dataUrl = [string]$payload.dataUrl
        if ($itemId -notmatch '^[a-z0-9_-]{3,180}$' -or
            $dataUrl -notmatch '^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$') {
          Send-Json $context.Response 400 '{"saved":false,"error":"invalid_artwork"}'
          continue
        }
        $kind = $Matches[1]
        $encoded = $Matches[2]
        $imageBytes = [Convert]::FromBase64String($encoded)
        if (-not (Test-ImageSignature $imageBytes $kind)) {
          Send-Json $context.Response 400 '{"saved":false,"error":"invalid_image_signature"}'
          continue
        }
        if ($imageBytes.Length -gt 8MB) {
          Send-Json $context.Response 413 '{"saved":false,"error":"artwork_too_large"}'
          continue
        }
        $extension = if ($kind -eq "jpeg") { "jpg" } else { $kind }
        $artworkFolder = Join-Path $root "assets\artwork"
        [IO.Directory]::CreateDirectory($artworkFolder) | Out-Null
        $stamp = Get-Date -Format "yyyyMMddHHmmssfff"
        $fileName = "$itemId-$stamp.$extension"
        [IO.File]::WriteAllBytes((Join-Path $artworkFolder $fileName), $imageBytes)
        Send-Json $context.Response 200 ((@{ saved=$true; path="./assets/artwork/$fileName" } | ConvertTo-Json -Compress))
      } catch {
        Send-Json $context.Response 500 '{"saved":false,"error":"artwork_intake_failed"}'
      }
      continue
    }

    if ($relative -eq "__vault/inventory") {
      try {
        if ($context.Request.HttpMethod -ne "POST" -or $context.Request.Headers["X-Vault-Request"] -ne "scan-tv-library") {
          Send-Json $context.Response 403 '{"scanned":false,"error":"forbidden"}'
          continue
        }
        $scanRoot = "D:\TV Shows"
        if (-not (Test-Path -LiteralPath $scanRoot -PathType Container)) {
          Send-Json $context.Response 404 '{"scanned":false,"error":"tv_root_missing"}'
          continue
        }
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $files = [Collections.Generic.List[object]]::new()
        foreach ($file in Get-ChildItem -LiteralPath $scanRoot -Recurse -File -ErrorAction SilentlyContinue) {
          if ($file.Extension.ToLowerInvariant() -notin $mediaExtensions) { continue }
          $files.Add([pscustomobject]@{
            path = $file.FullName
            name = $file.Name
            bytes = $file.Length
            lastWriteUtc = $file.LastWriteTimeUtc.ToString("o")
          })
        }
        $timer.Stop()
        $result = [ordered]@{
          scanned = $true
          root = $scanRoot
          scannedAt = [DateTime]::UtcNow.ToString("o")
          durationMs = $timer.ElapsedMilliseconds
          fileCount = $files.Count
          files = $files
        }
        Send-Json $context.Response 200 ($result | ConvertTo-Json -Depth 4 -Compress)
      } catch {
        Send-Json $context.Response 500 '{"scanned":false,"error":"inventory_failed"}'
      }
      continue
    }

    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
    try {
      $candidate = [IO.Path]::GetFullPath((Join-Path $root $relative))
      $inside = $candidate.StartsWith($rootBoundary, [StringComparison]::OrdinalIgnoreCase)
      $local = if ($inside) { $candidate.Substring($rootBoundary.Length) } else { "" }
      # Secrets, recovery archives, and automation browser profiles are never served.
      $blocked = -not $inside -or
        [IO.Path]::GetFileName($candidate).StartsWith(".env", [StringComparison]::OrdinalIgnoreCase) -or
        $local -match '^(data\\private|backups)(\\|$)' -or
        $local -match '^tests\\edge-profile'
      if ($blocked -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $context.Response.Close()
        continue
      }
      $bytes = [IO.File]::ReadAllBytes($candidate)
      $extension = [IO.Path]::GetExtension($candidate).ToLowerInvariant()
      $context.Response.ContentType = if ($mime.ContainsKey($extension)) { $mime[$extension] } else { "application/octet-stream" }
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $context.Response.Close()
    } catch {
      # A malformed path or unreadable file must not stop the listener.
      try { $context.Response.StatusCode = 404; $context.Response.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
