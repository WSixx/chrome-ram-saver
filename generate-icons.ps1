# Icon generator for RAM Saver Chrome extension
# Uses .NET System.Drawing to create PNG icons from SVG data
# Run: powershell -ExecutionPolicy Bypass -File generate-icons.ps1

Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param([int]$Size, [string]$OutputPath)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Background rounded rect
    $scale = $Size / 128.0
    $margin = [int](8 * $scale)
    $radius = [int](20 * $scale)
    $rect = New-Object System.Drawing.Rectangle($margin, $margin, $Size - 2*$margin, $Size - 2*$margin)

    # Draw gradient background manually with solid color fallback
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 20, 40))
    $g.FillRectangle($bgBrush, 0, 0, $Size, $Size)

    # Draw a simple brain shape (circle approximation) with teal color
    $brainBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 148, 136))
    $chipBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 59, 130, 246))
    $pinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 200, 160, 60))
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

    # RAM chip body
    $chipX = [int](16 * $scale)
    $chipY = [int](44 * $scale)
    $chipW = [int](96 * $scale)
    $chipH = [int](56 * $scale)
    $g.FillRectangle($chipBrush, $chipX, $chipY, $chipW, $chipH)

    # Brain (upper left, teal)
    $brainX = [int](10 * $scale)
    $brainY = [int](8 * $scale)
    $brainW = [int](72 * $scale)
    $brainH = [int](60 * $scale)
    $g.FillEllipse($brainBrush, $brainX, $brainY, $brainW, $brainH)

    # Brain groove lines (white)
    $penWhite = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 0, 0, 0), [float](2 * $scale))
    $g.DrawLine($penWhite, [int](46*$scale), [int](14*$scale), [int](46*$scale), [int](62*$scale))
    $g.DrawArc($penWhite, [int](16*$scale), [int](22*$scale), [int](24*$scale), [int](24*$scale), 180, 180)
    $g.DrawArc($penWhite, [int](52*$scale), [int](16*$scale), [int](20*$scale), [int](20*$scale), 180, 180)

    # RAM pins (gold)
    $pinW = [int](6 * $scale)
    $pinH = [int](8 * $scale)
    $pinY = [int](($chipY + $chipH - 2) * 1.0)
    for ($i = 0; $i -lt 6; $i++) {
        $pinX = [int]($chipX + 8*$scale + $i * 14*$scale)
        $g.FillRectangle($pinBrush, $pinX, $pinY, $pinW, $pinH)
    }

    # RAM chips on board (dark)
    $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 40, 60))
    for ($i = 0; $i -lt 3; $i++) {
        $cx = [int]($chipX + 44*$scale + $i * 16*$scale)
        $cy = [int]($chipY + 14*$scale)
        $cw = [int](12 * $scale)
        $ch = [int](28 * $scale)
        $g.FillRectangle($darkBrush, $cx, $cy, $cw, $ch)
    }

    # Cleanup
    $g.Dispose()
    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $OutputPath ($Size x $Size)"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconsDir = Join-Path $scriptDir "icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

Create-Icon -Size 16  -OutputPath (Join-Path $iconsDir "icon16.png")
Create-Icon -Size 48  -OutputPath (Join-Path $iconsDir "icon48.png")
Create-Icon -Size 128 -OutputPath (Join-Path $iconsDir "icon128.png")

Write-Host ""
Write-Host "All icons generated successfully!" -ForegroundColor Green
