Add-Type -AssemblyName System.Drawing

$destDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$Brand = [System.Drawing.Color]::FromArgb(255, 0, 89, 118)
$Pale = [System.Drawing.Color]::FromArgb(255, 230, 244, 248)
$PaleBorder = [System.Drawing.Color]::FromArgb(255, 184, 221, 232)
$White = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$Line = [System.Drawing.Color]::FromArgb(255, 229, 231, 235)
$Text = [System.Drawing.Color]::FromArgb(255, 55, 65, 81)
$Muted = [System.Drawing.Color]::FromArgb(255, 107, 114, 128)

function RoundPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
	$path = New-Object System.Drawing.Drawing2D.GraphicsPath
	$d = [Math]::Max(0.1, [Math]::Min($r * 2, [Math]::Min($w, $h)))
	$path.AddArc($x, $y, $d, $d, 180, 90)
	$path.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
	$path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
	$path.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
	$path.CloseFigure()
	return $path
}

function FillRound([System.Drawing.Graphics]$g, [System.Drawing.Brush]$b, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
	$p = RoundPath $x $y $w $h $r
	$g.FillPath($b, $p)
	$p.Dispose()
}

function DrawRound([System.Drawing.Graphics]$g, [System.Drawing.Pen]$pen, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
	$p = RoundPath $x $y $w $h $r
	$g.DrawPath($pen, $p)
	$p.Dispose()
}

function SoftShadow([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
	for ($i = 4; $i -ge 1; $i--) {
		$a = [int](14 / $i)
		$expand = $i * 2.2
		$b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, 0, 20, 32))
		FillRound $g $b ($x - $expand * 0.15) ($y + $expand * 0.45) ($w + $expand * 0.3) ($h + $expand * 0.2) ($r + 2)
		$b.Dispose()
	}
}

function DrawCornerFrame([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$size, [float]$arm, [float]$stroke, [System.Drawing.Color]$color) {
	DrawCornerFrameRect $g $x $y $size $size $arm $stroke $color
}

function DrawCornerFrameRect([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$arm, [float]$stroke, [System.Drawing.Color]$color) {
	$pen = New-Object System.Drawing.Pen $color, $stroke
	$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
	$right = $x + $w
	$bottom = $y + $h

	$tl = New-Object 'System.Drawing.PointF[]' 3
	$tl[0] = New-Object System.Drawing.PointF $x, ($y + $arm)
	$tl[1] = New-Object System.Drawing.PointF $x, $y
	$tl[2] = New-Object System.Drawing.PointF ($x + $arm), $y
	$g.DrawLines($pen, $tl)

	$tr = New-Object 'System.Drawing.PointF[]' 3
	$tr[0] = New-Object System.Drawing.PointF ($right - $arm), $y
	$tr[1] = New-Object System.Drawing.PointF $right, $y
	$tr[2] = New-Object System.Drawing.PointF $right, ($y + $arm)
	$g.DrawLines($pen, $tr)

	$bl = New-Object 'System.Drawing.PointF[]' 3
	$bl[0] = New-Object System.Drawing.PointF $x, ($bottom - $arm)
	$bl[1] = New-Object System.Drawing.PointF $x, $bottom
	$bl[2] = New-Object System.Drawing.PointF ($x + $arm), $bottom
	$g.DrawLines($pen, $bl)

	$br = New-Object 'System.Drawing.PointF[]' 3
	$br[0] = New-Object System.Drawing.PointF ($right - $arm), $bottom
	$br[1] = New-Object System.Drawing.PointF $right, $bottom
	$br[2] = New-Object System.Drawing.PointF $right, ($bottom - $arm)
	$g.DrawLines($pen, $br)

	$pen.Dispose()
}

function DrawCamera([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [System.Drawing.Color]$body, [System.Drawing.Color]$lens) {
	$bodyH = $w * 0.58
	$humpH = $w * 0.155
	$humpW = $w * 0.36
	$humpX = $x + (($w - $humpW) / 2.0)
	$bodyY = $y + $humpH
	$r = $w * 0.115
	$hr = $humpH * 0.42

	$path = New-Object System.Drawing.Drawing2D.GraphicsPath
	$path.AddArc($x, $bodyY, (2 * $r), (2 * $r), 180, 90)
	$path.AddLine(($x + $r), $bodyY, $humpX, $bodyY)
	$path.AddLine($humpX, $bodyY, $humpX, ($y + $hr))
	$path.AddArc($humpX, $y, (2 * $hr), (2 * $hr), 180, 90)
	$path.AddLine(($humpX + $hr), $y, ($humpX + $humpW - $hr), $y)
	$path.AddArc(($humpX + $humpW - (2 * $hr)), $y, (2 * $hr), (2 * $hr), 270, 90)
	$path.AddLine(($humpX + $humpW), ($y + $hr), ($humpX + $humpW), $bodyY)
	$path.AddLine(($humpX + $humpW), $bodyY, ($x + $w - $r), $bodyY)
	$path.AddArc(($x + $w - (2 * $r)), $bodyY, (2 * $r), (2 * $r), 270, 90)
	$path.AddLine(($x + $w), ($bodyY + $r), ($x + $w), ($bodyY + $bodyH - $r))
	$path.AddArc(($x + $w - (2 * $r)), ($bodyY + $bodyH - (2 * $r)), (2 * $r), (2 * $r), 0, 90)
	$path.AddLine(($x + $w - $r), ($bodyY + $bodyH), ($x + $r), ($bodyY + $bodyH))
	$path.AddArc($x, ($bodyY + $bodyH - (2 * $r)), (2 * $r), (2 * $r), 90, 90)
	$path.CloseFigure()

	$ink = New-Object System.Drawing.SolidBrush $body
	$g.FillPath($ink, $path)
	$ink.Dispose()
	$path.Dispose()

	$cx = $x + ($w / 2.0)
	$cy = $bodyY + ($bodyH * 0.52)
	$lensR = $bodyH * 0.34
	$ring = New-Object System.Drawing.SolidBrush $lens
	$g.FillEllipse($ring, ($cx - $lensR), ($cy - $lensR), ($lensR * 2), ($lensR * 2))
	$ring.Dispose()

	$inner = New-Object System.Drawing.SolidBrush $body
	$ir = $lensR * 0.55
	$g.FillEllipse($inner, ($cx - $ir), ($cy - $ir), ($ir * 2), ($ir * 2))
	$inner.Dispose()
}

function DrawMark([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$size, [System.Drawing.Color]$ink, [System.Drawing.Color]$hole) {
	$arm = $size * 0.15
	$stroke = [Math]::Max(2.0, $size * 0.052)
	DrawCornerFrame $g $x $y $size $arm $stroke $ink

	$camW = $size * 0.64
	$totalH = $camW * (0.155 + 0.58)
	$camX = $x + (($size - $camW) / 2.0)
	$camY = $y + (($size - $totalH) / 2.0)
	DrawCamera $g $camX $camY $camW $ink $hole
}

function DrawIconTile([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$size, [bool]$shadow) {
	if ($shadow) {
		SoftShadow $g $x $y $size $size ($size * 0.22)
	}
	$bg = New-Object System.Drawing.SolidBrush $Pale
	FillRound $g $bg $x $y $size $size ($size * 0.22)
	$bg.Dispose()

	$pad = $size * 0.105
	DrawMark $g ($x + $pad) ($y + $pad) ($size - (2 * $pad)) $Brand $Pale
}

function New-Icon([int]$size) {
	$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
	$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
	$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
	$g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
	DrawIconTile $g 0 0 $size $false
	$g.Dispose()
	return $bmp
}

function Draw-AreaIcon([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$s, [System.Drawing.Color]$color) {
	$pen = New-Object System.Drawing.Pen $color, ([Math]::Max(1.2, $s * 0.11))
	$pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Custom
	$pen.DashPattern = @(1.7, 1.25)
	DrawRound $g $pen $x ($y + $s * 0.06) ($s * 0.92) ($s * 0.78) ($s * 0.16)
	$pen.Dispose()
}

function Draw-WindowIcon([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$s, [System.Drawing.Color]$color) {
	$pen = New-Object System.Drawing.Pen $color, ([Math]::Max(1.2, $s * 0.11))
	$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
	DrawRound $g $pen $x ($y + $s * 0.08) $s ($s * 0.80) ($s * 0.14)
	$g.DrawLine($pen, ($x + $s * 0.02), ($y + $s * 0.38), ($x + $s * 0.98), ($y + $s * 0.38))
	$pen.Dispose()
	$dot = New-Object System.Drawing.SolidBrush $color
	$d = [Math]::Max(1.4, $s * 0.11)
	$g.FillEllipse($dot, ($x + $s * 0.16), ($y + $s * 0.16), $d, $d)
	$dot.Dispose()
}

function Draw-FullIcon([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$s, [System.Drawing.Color]$color) {
	DrawCornerFrame $g $x $y $s ($s * 0.32) ([Math]::Max(1.2, $s * 0.11)) $color
}

function Draw-CloseIcon([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$s, [System.Drawing.Color]$color) {
	$pen = New-Object System.Drawing.Pen $color, ([Math]::Max(1.3, $s * 0.12))
	$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$g.DrawLine($pen, ($x + $s * 0.22), ($y + $s * 0.22), ($x + $s * 0.78), ($y + $s * 0.78))
	$g.DrawLine($pen, ($x + $s * 0.78), ($y + $s * 0.22), ($x + $s * 0.22), ($y + $s * 0.78))
	$pen.Dispose()
}

function Draw-ModeButton([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$h, [string]$label, [string]$kind, [bool]$pressed, [System.Drawing.Font]$font, [float]$u) {
	$icon = 16 * $u
	$gap = 7 * $u
	$pad = 12 * $u
	$textSize = $g.MeasureString($label, $font)
	$w = $pad + $icon + $gap + $textSize.Width + (4 * $u)
	$color = $Text
	if ($pressed) {
		$color = $Brand
		$fill = New-Object System.Drawing.SolidBrush $Pale
		FillRound $g $fill $x $y $w $h (8 * $u)
		$fill.Dispose()
		$edge = New-Object System.Drawing.Pen $PaleBorder, ([Math]::Max(1.0, $u))
		DrawRound $g $edge $x $y $w $h (8 * $u)
		$edge.Dispose()
	}
	$ix = $x + $pad
	$iy = $y + (($h - $icon) / 2.0)
	switch ($kind) {
		'area' { Draw-AreaIcon $g $ix $iy $icon $color }
		'window' { Draw-WindowIcon $g $ix $iy $icon $color }
		'full' { Draw-FullIcon $g $ix $iy $icon $color }
	}
	$brush = New-Object System.Drawing.SolidBrush $color
	$fmt = New-Object System.Drawing.StringFormat
	$fmt.Alignment = [System.Drawing.StringAlignment]::Near
	$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
	$fmt.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
	$rect = New-Object System.Drawing.RectangleF ($ix + $icon + $gap), $y, ($textSize.Width + (8 * $u)), $h
	$g.DrawString($label, $font, $brush, $rect, $fmt)
	$fmt.Dispose()
	$brush.Dispose()
	return $w
}

function Draw-FloatingBar([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$radius) {
	SoftShadow $g $x ($y + 1) $w $h $radius
	$fill = New-Object System.Drawing.SolidBrush $White
	FillRound $g $fill $x $y $w $h $radius
	$fill.Dispose()
	$edge = New-Object System.Drawing.Pen $Line, 1
	DrawRound $g $edge $x $y $w $h $radius
	$edge.Dispose()
}

function DrawCaptureScene([System.Drawing.Graphics]$g, [float]$u) {
	$font = New-Object System.Drawing.Font "Segoe UI Semibold", (13.5 * $u), ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
	$small = New-Object System.Drawing.Font "Segoe UI Semibold", (12.5 * $u), ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)

	$selX = 32 * $u
	$selY = 76 * $u
	$selW = 448 * $u
	$selH = 104 * $u

	$page = New-Object System.Drawing.SolidBrush $White
	FillRound $g $page $selX $selY $selW $selH (6 * $u)
	$page.Dispose()
	$inset = 12 * $u
	$arm = 26 * $u
	$stroke = [Math]::Max(2.4, 3.4 * $u)
	DrawCornerFrameRect $g ($selX + $inset) ($selY + $inset) ($selW - (2 * $inset)) ($selH - (2 * $inset)) $arm $stroke $Brand

	$btnH = 32 * $u
	$barH = $btnH + (10 * $u)
	$areaW = Draw-ModeButton $g -1000 -1000 $btnH "Area" "area" $true $font $u
	$winW = Draw-ModeButton $g -1000 -1000 $btnH "Window" "window" $false $font $u
	$fullW = Draw-ModeButton $g -1000 -1000 $btnH "Full screen" "full" $false $font $u
	$gap = 2 * $u
	$pad = 5 * $u
	$sepGap = 8 * $u
	$close = $btnH
	$barW = $pad + $areaW + $gap + $winW + $gap + $fullW + $sepGap + 1 + $sepGap + $close + $pad
	$barX = $selX + (($selW - $barW) / 2.0)
	$barY = 22 * $u
	Draw-FloatingBar $g $barX $barY $barW $barH (10 * $u)

	$cursor = $barX + $pad
	$btnY = $barY + $pad
	Draw-ModeButton $g $cursor $btnY $btnH "Area" "area" $true $font $u | Out-Null
	$cursor += $areaW + $gap
	Draw-ModeButton $g $cursor $btnY $btnH "Window" "window" $false $font $u | Out-Null
	$cursor += $winW + $gap
	Draw-ModeButton $g $cursor $btnY $btnH "Full screen" "full" $false $font $u | Out-Null
	$cursor += $fullW + $sepGap
	$sepPen = New-Object System.Drawing.Pen $Line, ([Math]::Max(1.0, $u))
	$g.DrawLine($sepPen, $cursor, ($barY + (12 * $u)), $cursor, ($barY + $barH - (12 * $u)))
	$sepPen.Dispose()
	$cursor += $sepGap
	Draw-CloseIcon $g ($cursor + ($close - (16 * $u)) / 2.0) ($btnY + ($btnH - (16 * $u)) / 2.0) (16 * $u) $Muted

	$dimText = "685 " + [char]0x00D7 + " 293"
	$dimSize = $g.MeasureString($dimText, $small)
	$capSize = $g.MeasureString("Capture", $font)
	$cancelSize = $g.MeasureString("Cancel", $font)

	$chipH = 30 * $u
	$chipYPad = 4 * $u
	$actH = $chipH + ($chipYPad * 2)
	$capW = $capSize.Width + (26 * $u)
	$cancelW = $cancelSize.Width + (22 * $u)
	$actW = (12 * $u) + $dimSize.Width + (8 * $u) + $capW + (4 * $u) + $cancelW + (6 * $u)
	$actX = $selX + $selW - $actW
	$actY = $selY + $selH + (8 * $u)
	Draw-FloatingBar $g $actX $actY $actW $actH (10 * $u)

	$fmt = New-Object System.Drawing.StringFormat
	$fmt.Alignment = [System.Drawing.StringAlignment]::Near
	$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
	$fmt.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
	$dimBrush = New-Object System.Drawing.SolidBrush $Muted
	$dimRect = New-Object System.Drawing.RectangleF ($actX + (12 * $u)), $actY, ($dimSize.Width + (6 * $u)), $actH
	$g.DrawString($dimText, $small, $dimBrush, $dimRect, $fmt)
	$dimBrush.Dispose()

	$capX = $actX + (12 * $u) + $dimSize.Width + (8 * $u)
	$capY = $actY + $chipYPad
	$capFill = New-Object System.Drawing.SolidBrush $Brand
	FillRound $g $capFill $capX $capY $capW $chipH (8 * $u)
	$capFill.Dispose()
	$center = New-Object System.Drawing.StringFormat
	$center.Alignment = [System.Drawing.StringAlignment]::Center
	$center.LineAlignment = [System.Drawing.StringAlignment]::Center
	$center.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
	$whiteBrush = New-Object System.Drawing.SolidBrush $White
	$g.DrawString("Capture", $font, $whiteBrush, (New-Object System.Drawing.RectangleF $capX, $capY, $capW, $chipH), $center)
	$whiteBrush.Dispose()

	$textBrush = New-Object System.Drawing.SolidBrush $Text
	$cancelX = $capX + $capW + (2 * $u)
	$g.DrawString("Cancel", $font, $textBrush, (New-Object System.Drawing.RectangleF $cancelX, $actY, $cancelW, $actH), $center)
	$textBrush.Dispose()
	$fmt.Dispose()
	$center.Dispose()
	$font.Dispose()
	$small.Dispose()
}

function New-Banner([int]$W, [int]$H) {
	$bmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
	$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
	$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
	$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

	$u = $H / 250.0
	$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
	$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
		$rect,
		([System.Drawing.Color]::FromArgb(255, 1, 36, 48)),
		([System.Drawing.Color]::FromArgb(255, 0, 70, 92)),
		0.0
	)
	$g.FillRectangle($grad, $rect)
	$grad.Dispose()

	DrawCaptureScene $g $u

	$tile = 132 * $u
	$tx = $W - $tile - (64 * $u)
	$ty = ($H - $tile) / 2.0
	DrawIconTile $g $tx $ty $tile $true

	$g.Dispose()
	return $bmp
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$name) {
	$bmp.Save((Join-Path $destDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
}

$icon256 = New-Icon 256
$icon128 = New-Icon 128
Save-Png $icon256 "icon-256x256.png"
Save-Png $icon128 "icon-128x128.png"
$icon256.Dispose()
$icon128.Dispose()

$retina = New-Banner 1544 500
$std = New-Banner 772 250
Save-Png $retina "banner-1544x500.png"
Save-Png $std "banner-772x250.png"
Write-Host "OK icon 256/128 banner $($retina.Width)x$($retina.Height) / $($std.Width)x$($std.Height)"
$retina.Dispose()
$std.Dispose()
