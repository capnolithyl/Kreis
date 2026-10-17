# Create a SHA-256 manifest for the Windows NSIS installer and immediately
# verify that it names the correct installer and matches the EXE on disk.
param(
    [string]$InstallerDirectory = "src-tauri/target/release/bundle/nsis"
)
$ErrorActionPreference = 'Stop'
$installers = @(Get-ChildItem -LiteralPath $InstallerDirectory -Filter '*.exe' -File)
if ($installers.Count -ne 1) {
    throw "Expected exactly one NSIS installer; found $($installers.Count)."
}
$installer = $installers[0]
$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = Join-Path $InstallerDirectory 'SHA256SUMS.txt'
"$hash *$($installer.Name)" | Set-Content -LiteralPath $manifest -Encoding ascii

$record = (Get-Content -LiteralPath $manifest -TotalCount 1).Trim()
$parts = $record -split ' \*', 2
if ($parts.Count -ne 2 -or $parts[1] -cne $installer.Name) {
    throw "Invalid installer checksum manifest: $manifest"
}
$verified = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash
if ($parts[0] -ine $verified) {
    throw "Installer SHA-256 mismatch: $($installer.Name)"
}
Write-Host "Installer SHA-256 verified: $hash  $($installer.Name)"
