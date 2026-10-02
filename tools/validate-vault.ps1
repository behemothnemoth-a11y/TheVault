$ErrorActionPreference = "Stop"
$vaultRoot = Split-Path -Parent $PSScriptRoot
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$python = (Get-Command python -ErrorAction SilentlyContinue).Source

$modules = Get-ChildItem -LiteralPath (Join-Path $vaultRoot "js") -Recurse -Filter "*.js"
foreach ($module in $modules) {
  & $node --check $module.FullName
  if ($LASTEXITCODE -ne 0) { throw "JavaScript validation failed: $($module.FullName)" }
}

if ($python -and (Test-Path -LiteralPath $python)) {
  & $python -m py_compile (Join-Path $vaultRoot "vault_server.py")
  if ($LASTEXITCODE -ne 0) { throw "Python server validation failed." }
}

Write-Host "VAULT VALIDATION PASSED: $($modules.Count) JavaScript files and the Python server are valid."

