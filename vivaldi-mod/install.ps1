#requires -version 5.1
[CmdletBinding()]
param(
    [ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
    [string]$VivaldiRoot,
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
if (-not $Uninstall -and -not $ExtensionId) {
    throw 'Supply the Kreis extension ID using -ExtensionId followed by the 32-letter ID.'
}
if (Get-Process -Name vivaldi -ErrorAction SilentlyContinue) {
    throw 'Please completely quit Vivaldi before installing or removing the UI mod.'
}

function Find-Resources([string]$Root) {
    if (-not $Root -or -not (Test-Path -LiteralPath $Root)) { return }
    $locations = @($Root)
    $locations += @(Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName)
    foreach ($candidate in $locations) {
        $nested = Join-Path $candidate 'resources\vivaldi\window.html'
        $direct = Join-Path $candidate 'window.html'
        foreach ($candidateFile in @($nested, $direct)) {
            if (Test-Path -LiteralPath $candidateFile) {
                $file = Get-Item -LiteralPath $candidateFile
                [pscustomobject]@{ Folder = $file.DirectoryName; Modified = $file.LastWriteTime }
            }
        }
    }
}
if ($VivaldiRoot) {
    $roots = @($VivaldiRoot)
} else {
    $roots = @(
        (Join-Path $env:LOCALAPPDATA 'Vivaldi\Application'),
        (Join-Path $env:ProgramFiles 'Vivaldi\Application')
    )
    $x86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($x86) { $roots += (Join-Path $x86 'Vivaldi\Application') }
}
$all = @($roots | ForEach-Object { Find-Resources $_ } | Sort-Object Modified -Descending)
if (-not $all.Count) {
    throw 'Cannot find Vivaldi window.html. Provide -VivaldiRoot pointing to Application or resources\vivaldi.'
}
if ($all.Count -gt 1 -and -not $VivaldiRoot) {
    Write-Warning ('Multiple installs found. Using: ' + $all[0].Folder)
}
$dir = $all[0].Folder
$htmlPath = Join-Path $dir 'window.html'
$scriptPath = Join-Path $dir 'kreis-vivaldi.js'
$backupPath = Join-Path $dir 'window.html.kreis-backup'
$tag = '<script src="kreis-vivaldi.js"></script>'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $backupPath)) {
    Copy-Item -LiteralPath $htmlPath -Destination $backupPath
    Write-Host ('Created backup: ' + $backupPath)
}
$html = [System.IO.File]::ReadAllText($htmlPath)
if ($Uninstall) {
    $clean = [regex]::Replace($html, '(?m)^[ \t]*<script src="kreis-vivaldi\.js"></script>\r?\n?', '')
    if ($clean -ne $html) {
        [System.IO.File]::WriteAllText($htmlPath, $clean, $utf8)
    }
    if (Test-Path -LiteralPath $scriptPath) { Remove-Item -LiteralPath $scriptPath -Force }
    Write-Host ('Kreis mod removed from: ' + $dir)
    exit 0
}
$source = Join-Path $PSScriptRoot 'kreis-vivaldi.js'
if (-not (Test-Path -LiteralPath $source)) {
    throw 'kreis-vivaldi.js must be next to install.ps1.'
}
$script = [System.IO.File]::ReadAllText($source)
if (-not $script.Contains('__KREIS_EXTENSION_ID__')) { throw 'Missing extension ID placeholder in mod source.' }
$script = $script.Replace('__KREIS_EXTENSION_ID__', $ExtensionId)
[System.IO.File]::WriteAllText($scriptPath, $script, $utf8)

if (-not $html.Contains($tag)) {
    if ($html -notmatch '(?i)</body>') {
        throw 'Cannot find the closing body tag; no window.html modifications made.'
    }
    $pattern = [regex]::new('</body>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $html = $pattern.Replace($html, ($tag + [Environment]::NewLine + '</body>'), 1)
    [System.IO.File]::WriteAllText($htmlPath, $html, $utf8)
}
Write-Host ('Kreis mod installed in: ' + $dir)
Write-Host 'Restart Vivaldi; check the Kreis extension popup for Vivaldi UI mod: Connected.'
