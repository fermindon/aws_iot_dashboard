# Quick inquiry checker - Add this to your PowerShell profile
# Usage: inquiries  OR  inquiries -latest 5

function Get-Inquiries {
    param(
        [int]$Latest = 10,
        [switch]$New,
        [switch]$Raw
    )

    $items = aws dynamodb scan --table-name web-agency-inquiries --output json 2>&1 | ConvertFrom-Json | Select-Object -ExpandProperty Items
    
    if ($null -eq $items) {
        Write-Host "No inquiries found." -ForegroundColor Yellow
        return
    }

    # Filter to new only if requested
    if ($New) {
        $items = $items | Where-Object { $_.status.S -eq "new" }
    }

    # Sort by date descending and limit
    $items = $items | Sort-Object { [datetime]$_.createdAt.S } -Descending | Select-Object -First $Latest

    if ($Raw) {
        $items | ConvertTo-Json
        return
    }

    # Pretty print
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  INQUIRIES (Latest $Latest)" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    foreach ($item in $items) {
        $time = [datetime]$item.createdAt.S
        $status = $item.status.S
        $statusColor = if ($status -eq "new") { "Yellow" } else { "Green" }

        Write-Host "ID: " -ForegroundColor Gray -NoNewline
        Write-Host $item.id.S -ForegroundColor Cyan

        Write-Host "Time: " -ForegroundColor Gray -NoNewline
        Write-Host $time.ToString("ddd MMM dd, yyyy HH:mm:ss") -ForegroundColor White

        Write-Host "Name: " -ForegroundColor Gray -NoNewline
        Write-Host $item.name.S -ForegroundColor White

        Write-Host "Email: " -ForegroundColor Gray -NoNewline
        Write-Host $item.email.S -ForegroundColor Green

        Write-Host "Business: " -ForegroundColor Gray -NoNewline
        Write-Host $item.businessName.S -ForegroundColor White

        Write-Host "Details: " -ForegroundColor Gray -NoNewline
        Write-Host $item.details.S -ForegroundColor White

        Write-Host "Status: " -ForegroundColor Gray -NoNewline
        Write-Host $status -ForegroundColor $statusColor

        Write-Host ""
    }

    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "Total found: $($items.Count)" -ForegroundColor Cyan
    Write-Host ""
}

Set-Alias -Name inquiries -Value Get-Inquiries -Force
