param(
  [Parameter(Mandatory = $true)][string]$Packages,
  [Parameter(Mandatory = $true)][string]$Verification
)
$ErrorActionPreference = 'Stop'
$sevenZip = Join-Path $env:ProgramFiles '7-Zip/7z.exe'
if (!(Test-Path $sevenZip)) { throw 'The Windows runner must provide 7-Zip' }
if (Test-Path $Verification) { throw 'The package verification directory must be fresh' }
New-Item -ItemType Directory -Path $Verification | Out-Null
& $sevenZip x (Join-Path $Packages 'orca-windows-x64.zip') "-o$Verification/zip" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Windows ZIP extraction failed' }
& $sevenZip x (Join-Path $Packages 'orca-windows-setup.exe') "-o$Verification/nsis" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'NSIS extraction failed' }
$payloads = @(Get-ChildItem (Join-Path $Verification 'nsis') -Recurse -Filter 'app-64.7z')
if ($payloads.Count -ne 1) { throw 'Expected exactly one Windows x64 installer payload' }
& $sevenZip x $payloads[0].FullName "-o$Verification/installer" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Windows installer payload extraction failed' }
function Get-ExecutableVersions([string]$Path) {
  $info = (Get-Item $Path).VersionInfo
  return @{ productVersion = $info.ProductVersion; fileVersion = $info.FileVersion }
}
$versions = @{
  zip = Get-ExecutableVersions (Join-Path $Verification 'zip/Orca.exe')
  installer = Get-ExecutableVersions (Join-Path $Verification 'installer/Orca.exe')
}
$versions | ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8NoBOM (Join-Path $Verification 'product-versions.json')
