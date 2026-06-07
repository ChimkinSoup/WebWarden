param(
  [string]$Config = "Release"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$Source = Join-Path $Root "companion"
$Build = Join-Path $Source "build"

$script:BuildMode = $null   # "nmake", "mingw", or "vs"
$script:VcVars = $null

function Reset-BuildDir {
  if (Test-Path $Build) {
    Write-Host "Removing CMake cache..."
    Remove-Item -Recurse -Force $Build
  }
  New-Item -ItemType Directory -Force -Path $Build | Out-Null
}

function Test-CMakeConfigure {
  param([string[]]$CmakeArgs)

  Write-Host "cmake $($CmakeArgs -join ' ')"
  & cmake @CmakeArgs 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  return (Test-Path (Join-Path $Build "CMakeCache.txt"))
}

function Find-VisualStudio {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) { return $null }

  $installPath = & $vswhere -latest -products * `
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
    -property installationPath 2>$null

  if (-not $installPath) { return $null }

  $vcvars = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
  if (-not (Test-Path $vcvars)) { return $null }

  return @{ InstallPath = $installPath; VcVars = $vcvars }
}

function Invoke-InVcVars {
  param([string]$Command)

  Write-Host "cmd /c $Command"
  cmd /c $Command 2>&1 | ForEach-Object { Write-Host $_ }
  return ($LASTEXITCODE -eq 0)
}

function Configure-WithNMake {
  param([hashtable]$Vs)

  Reset-BuildDir
  $configureCmd = "`"$($Vs.VcVars)`" && cmake -S `"$Source`" -B `"$Build`" -G `"NMake Makefiles`" -DCMAKE_BUILD_TYPE=$Config"
  if (-not (Invoke-InVcVars $configureCmd)) { return $false }
  if (-not (Test-Path (Join-Path $Build "CMakeCache.txt"))) { return $false }

  $script:BuildMode = "nmake"
  $script:VcVars = $Vs.VcVars
  return $true
}

function Configure-WithMinGW {
  $mingw = "C:/MinGW/bin/g++.exe"
  if (-not (Test-Path $mingw)) { return $false }

  Reset-BuildDir
  if (-not (Test-CMakeConfigure @(
    "-S", $Source, "-B", $Build,
    "-G", "MinGW Makefiles",
    "-DCMAKE_CXX_COMPILER=$mingw",
    "-DCMAKE_BUILD_TYPE=$Config"
  ))) { return $false }

  $script:BuildMode = "mingw"
  return $true
}

function Configure-WithVSGenerator {
  Reset-BuildDir
  if (-not (Test-CMakeConfigure @("-S", $Source, "-B", $Build, "-G", "Visual Studio 17 2022", "-A", "x64"))) {
    return $false
  }

  $script:BuildMode = "vs"
  return $true
}

function Build-Companion {
  switch ($script:BuildMode) {
    "nmake" {
      $buildCmd = "`"$($script:VcVars)`" && cmake --build `"$Build`" --config $Config"
      if (-not (Invoke-InVcVars $buildCmd)) { exit $LASTEXITCODE }
    }
    default {
      Write-Host "cmake --build `"$Build`" --config $Config"
      & cmake --build $Build --config $Config
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
  }
}

$configured = $false

$vs = Find-VisualStudio
if ($vs) {
  Write-Host "Trying MSVC via vcvars64.bat (NMake Makefiles)..."
  if (Configure-WithNMake $vs) {
    Write-Host "Configured with MSVC + NMake."
    $configured = $true
  }
}

if (-not $configured) {
  Write-Host "Trying MinGW Makefiles..."
  if (Configure-WithMinGW) {
    Write-Host "Configured with MinGW."
    $configured = $true
  }
}

if (-not $configured) {
  Write-Host "Trying Visual Studio 17 2022 generator..."
  if (Configure-WithVSGenerator) {
    Write-Host "Configured with Visual Studio 17 2022."
    $configured = $true
  }
}

if (-not $configured) {
  Write-Error @"
No usable C++ toolchain found.

Install one of:
  - Visual Studio Build Tools (Desktop development with C++)
  - MinGW-w64 at C:\MinGW\bin\g++.exe

Note: running vcvars64.bat directly in PowerShell does NOT persist environment
variables to your shell. Use 'npm run build:companion' instead.
"@
}

Write-Host "Building ($Config)..."
Build-Companion

$exeCandidates = @(
  (Join-Path $Build "WebWardenCompanion.exe"),
  (Join-Path $Build "$Config\WebWardenCompanion.exe")
)

$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) {
  Write-Host "Built: $exe"
} else {
  Write-Warning "Build finished but WebWardenCompanion.exe was not found in expected locations."
}
