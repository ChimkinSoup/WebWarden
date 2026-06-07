$exe = "C:\Users\Juno\CodingProjects\WebWarden\companion\build\WebWardenCompanion.exe"
if (-not (Test-Path $exe)) {
  Write-Error "Build the companion first: npm run build:companion"
}

$tests = @(
  @{ Name = "PING"; Body = '{"type":"PING","requestId":"test-1"}' },
  @{ Name = "CHECK_RESTART"; Body = '{"type":"CHECK_RESTART","requestId":"test-2"}' },
  @{ Name = "DEV_SIMULATE_RESTART"; Body = '{"type":"DEV_SIMULATE_RESTART","requestId":"test-3"}' }
)

foreach ($test in $tests) {
  Write-Host "`n=== $($test.Name) ==="
  $msg = $test.Body
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
  $len = [BitConverter]::GetBytes([uint32]$bytes.Length)

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true

  $p = [System.Diagnostics.Process]::Start($psi)
  $p.StandardInput.BaseStream.Write($len, 0, 4)
  $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $p.StandardInput.Close()

  $out = $p.StandardOutput.BaseStream
  $lenBuf = New-Object byte[] 4
  $out.Read($lenBuf, 0, 4) | Out-Null
  $respLen = [BitConverter]::ToUInt32($lenBuf, 0)
  $respBuf = New-Object byte[] $respLen
  $out.Read($respBuf, 0, $respLen) | Out-Null
  $response = [System.Text.Encoding]::UTF8.GetString($respBuf)
  Write-Host "Companion response: $response"
  $p.WaitForExit(5000)
}
