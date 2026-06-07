param(
  [string]$ExePath = "",
  [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"

if (-not $ExePath) {
  $candidates = @(
    (Join-Path $PSScriptRoot "..\companion\build\WebWardenCompanion.exe"),
    (Join-Path $PSScriptRoot "..\companion\build\Release\WebWardenCompanion.exe")
  )
  foreach ($candidate in $candidates) {
    $resolved = Resolve-Path $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
      $ExePath = $resolved.Path
      break
    }
  }
}

if (-not (Test-Path $ExePath)) {
  Write-Error "Companion executable not found at $ExePath. Run 'npm run build:companion' first."
}

$manifestTemplate = Join-Path $PSScriptRoot "..\companion\com.webwarden.companion.json"
$manifestContent = Get-Content $manifestTemplate -Raw
$manifestContent = $manifestContent -replace "PLACEHOLDER_EXE_PATH", ($ExePath -replace '\\', '\\')

if (-not $ExtensionId) {
  Write-Error "ExtensionId is required. Get it from chrome://extensions, then run: npm run install:native-host -- -ExtensionId YOUR_ID"
}

$manifestContent = $manifestContent -replace "PLACEHOLDER_EXTENSION_ID", $ExtensionId

$installDir = Join-Path $env:APPDATA "WebWarden"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$manifestPath = Join-Path $installDir "com.webwarden.companion.json"
# Chrome requires UTF-8 without BOM; PowerShell Set-Content adds BOM by default.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($manifestPath, $manifestContent, $utf8NoBom)

$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.webwarden.companion"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath

Write-Host "Native messaging host installed."
Write-Host "Manifest: $manifestPath"
Write-Host "Executable: $ExePath"
