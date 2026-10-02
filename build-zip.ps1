# Rebuild dist/stillframe.zip with standard forward-slash paths for WordPress compatibility

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path ".").Path
$zipPath = Join-Path $root "dist\stillframe.zip"

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

# 1. Root files
$rootFiles = @('readme.txt', 'stillframe.php', 'uninstall.php', 'LICENSE')
foreach ($f in $rootFiles) {
    $full = Join-Path $root $f
    if (Test-Path $full) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, "stillframe/$f", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}

# 2. Included directories
$dirs = @('assets', 'includes', 'languages')
foreach ($d in $dirs) {
    $files = Get-ChildItem -Path (Join-Path $root $d) -Recurse -File
    foreach ($file in $files) {
        $relPath = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
        $entryName = "stillframe/$relPath"
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}

$zip.Dispose()
Write-Host "Successfully built $zipPath"
