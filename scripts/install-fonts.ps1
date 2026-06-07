param(
  [string]$FontDir = "C:\Users\Juno\CodingProjects\~Programming Assets\PkgTTC-IosevkaAile-34.5.0"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$Dest = Join-Path $Root "extension\shared\fonts"
$Files = @(
  "IosevkaAile-Regular.ttc",
  "IosevkaAile-SemiBold.ttc",
  "IosevkaAile-Bold.ttc"
)

if (-not (Test-Path -LiteralPath $FontDir)) {
  Write-Error "Font directory not found: $FontDir"
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

foreach ($file in $Files) {
  $source = Join-Path $FontDir $file
  if (-not (Test-Path -LiteralPath $source)) {
    Write-Error "Missing font file: $source"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $Dest $file) -Force
  Write-Host "Installed $file"
}

Write-Host "Fonts installed to $Dest"
