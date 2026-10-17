# Explorer Windows 11 may expose several tabs through the same outer HWND.
# Only return an HWND when the exact folder is known from Shell.Application
# and its tab can be identified without guessing from the Explorer window title.
$ErrorActionPreference = 'Stop'
try {
    $expected = [System.IO.Path]::GetFullPath($env:KREIS_FOLDER_QUERY).TrimEnd('\')
    $leaf = [System.IO.Path]::GetFileName($expected)
    $shell = New-Object -ComObject Shell.Application
    $matches = @()

    foreach ($item in $shell.Windows()) {
        try {
            $path = [string]$item.Document.Folder.Self.Path
            if ([string]::IsNullOrWhiteSpace($path)) { continue }
            $normalized = [System.IO.Path]::GetFullPath($path).TrimEnd('\')
            if (-not [string]::Equals($normalized, $expected, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
            $handle = [long]$item.HWND
            if ($handle -gt 0 -and -not ($matches -contains $handle)) {
                $matches += $handle
            }
        } catch {
            # Shell.Windows includes virtual or non-filesystem entries.
        }
    }

    if ($matches.Count -eq 0) { exit 0 }

    Add-Type -AssemblyName UIAutomationClient

    foreach ($handle in $matches) {
        try {
            $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$handle)
            if ($null -eq $root) { continue }

            $condition = [System.Windows.Automation.PropertyCondition]::new(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::TabItem
            )
            $items = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
            # On Windows 10, each Explorer window is a single folder.
            # A Windows 11 window might contain background tabs even if UIA
            # is unavailable, so never assume its active tab is our match.
            if ($items.Count -eq 0) {
                if ([System.Environment]::OSVersion.Version.Build -lt 22621) {
                    [Console]::WriteLine($handle)
                    exit 0
                }
                continue
            }

            $candidates = @()
            foreach ($tab in $items) {
                $name = [string]$tab.Current.Name
                # Explorer can append " - Tab" to accessible tab names.
                if ($name -ieq $leaf -or $name -ieq "$leaf - Tab") {
                    $candidates += $tab
                }
            }

            # Two unrelated directories can share a display name.
            # Don't select either when UI Automation cannot disambiguate.
            if ($candidates.Count -ne 1) { continue }
            $chosen = $candidates[0]
            $pattern = $chosen.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
            if ($null -eq $pattern) { continue }
            if (-not $pattern.Current.IsSelected) {
                $pattern.Select()
            }
            [Console]::WriteLine($handle)
            exit 0
        } catch {
            # UI Automation support differs across Explorer versions.
            # The native caller will safely open a new tab instead.
        }
    }
} catch {
    # Never let a failed folder lookup interrupt an otherwise valid shortcut.
}
