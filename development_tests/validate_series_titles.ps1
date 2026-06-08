# ==========================================================================
# Series Book Definition Validation Script (NDL Search Version)
# 
# Verifies if hardcoded book titles in app.js actually exist in the National 
# Diet Library (NDL) database.
# Safe from Shift-JIS / UTF-8 encoding issues on Windows by using Unicode 
# properties for regular expressions and character codes. Includes caching,
# retry logic, author search scoping, and character normalization (e.g. 噓/嘘).
# ==========================================================================

$appJsPath = Join-Path $PSScriptRoot "..\app.js"
if (-not (Test-Path $appJsPath)) {
    Write-Error "Error: app.js not found at: $appJsPath"
    exit 1
}

# Read file contents as raw string
$content = Get-Content $appJsPath -Raw -Encoding utf8

# 1. Extract kaidanTitles
$kaidanTitles = @()
if ($content -match 'const kaidanTitles = \[\s*([\s\S]*?)\s*\];') {
    $rawKaidan = $Matches[1]
    $kaidanTitles = $rawKaidan -split ',' | ForEach-Object { $_.Trim().Trim("'").Trim('"') } | Where-Object { $_ }
}

# 2. Extract SERIES_VOLUME_MAP
$seriesVolumes = @{}
if ($content -match 'const SERIES_VOLUME_MAP = \{([\s\S]*?)\};') {
    $rawMap = $Matches[1]
    $seriesMatches = [regex]::Matches($rawMap, "'([^']+)':\s*\[\s*([\s\S]*?)\s*\]")
    foreach ($m in $seriesMatches) {
        $seriesName = $m.Groups[1].Value
        $rawTitles = $m.Groups[2].Value
        $titles = $rawTitles -split ',' | ForEach-Object { $_.Trim().Trim("'").Trim('"') } | Where-Object { $_ }
        $seriesVolumes[$seriesName] = $titles
    }
}

# Unicode character builders to prevent Shift-JIS parser errors on Japanese characters.
# No Japanese comments are allowed here to prevent line-wrapping/newline corruption.
$charNisio = [string][char]0x897f + [char]0x5c3e + [char]0x7dad + [char]0x65b0
$charKono = [string][char]0x6cb3 + [char]0x91ce + [char]0x88d5
$charKaidan = [string][char]0x968e + [char]0x6bb5 + [char]0x5cf6

$charUsoL = [string][char]0x5653
$charUsoR = [string][char]0x5618

# Collect all unique titles with their respective authors for precise NDL queries
$allTitles = @{}
# For Kaidanshima
foreach ($t in $kaidanTitles) { 
    $allTitles[$t] = $charKono
}
# For SERIES_VOLUME_MAP
foreach ($k in $seriesVolumes.Keys) {
    $author = $charNisio
    if ($k.Contains($charKaidan)) {
        $author = $charKono
    }
    foreach ($t in $seriesVolumes[$k]) {
        $allTitles[$t] = $author
    }
}

Write-Host "Unique book titles to verify: $($allTitles.Count)" -ForegroundColor Cyan

$failedCount = 0
$successCount = 0
$titlesArray = $allTitles.Keys | Sort-Object

# Cache for API results to reduce HTTP requests
$apiCache = @{}

$i = 1
foreach ($title in $titlesArray) {
    $author = $allTitles[$title]
    Write-Host "[$i/$($titlesArray.Count)] Verifying: `"$title`" by $author ... " -NoNewline
    
    # Strip parentheses and brackets for better API query
    $searchTitle = $title -replace '\([^)]+\)', ''
    $searchTitle = $searchTitle -replace '\uff08[^\uff09]+\uff09', ''
    $searchTitle = $searchTitle -replace '\u3008[^\u3009]+\u3009', ''
    $searchTitle = $searchTitle -replace '\u300a[^\u300b]+\u300b', ''
    $searchTitle = $searchTitle.Trim()
    
    $verified = $false
    $matchedTitle = ""
    $candidates = @()
    
    # Cache key combines search title and author
    $cacheKey = "$searchTitle`|$author"
    
    $items = $null
    if ($apiCache.ContainsKey($cacheKey)) {
        $items = $apiCache[$cacheKey]
    } else {
        # Query NDL Search API with author scope and retry logic
        $encodedTitle = [uri]::EscapeDataString($searchTitle)
        $encodedAuthor = [uri]::EscapeDataString($author)
        $url = "https://ndlsearch.ndl.go.jp/api/opensearch?title=$encodedTitle&creator=$encodedAuthor&cnt=15"
        
        $retryCount = 0
        $maxRetries = 3
        
        while ($retryCount -lt $maxRetries -and $null -eq $items) {
            try {
                $response = Invoke-RestMethod -Uri $url -Method Get -Headers @{ "User-Agent" = "Mozilla/5.0" }
                # Force wrap response into array to handle single, multiple, or null results
                $items = @($response)
                $apiCache[$cacheKey] = $items
            } catch {
                $status = $_.Exception.Message
                $retryCount++
                Write-Host "(Error, waiting 2s before retry $retryCount...) " -NoNewline
                Start-Sleep -Seconds 2
            }
        }
    }
    
    if ($null -ne $items -and $items.Count -gt 0) {
        # Normalize query title (strip spacing, punctuation, and brackets)
        $normQuery = [regex]::Replace($title, '[\p{P}\p{S}\s]', '')
        # Handle Japanese kanji variations (e.g. 噓 vs 嘘)
        $normQuery = $normQuery.Replace($charUsoL, $charUsoR)
        $normQuery = $normQuery.ToLower()
        
        foreach ($item in $items) {
            $apiTitle = $item.title
            if ($apiTitle) {
                if ($apiTitle -is [System.Array]) {
                    $apiTitle = $apiTitle[0]
                }
                
                $normApi = [regex]::Replace($apiTitle, '[\p{P}\p{S}\s]', '')
                $normApi = $normApi.Replace($charUsoL, $charUsoR)
                $normApi = $normApi.ToLower()
                
                $candidates += $apiTitle
                
                # Check for substring match in either direction
                if ($normApi.Contains($normQuery) -or $normQuery.Contains($normApi)) {
                    $verified = $true
                    $matchedTitle = $apiTitle
                    break
                }
            }
        }
        
        if ($verified) {
            Write-Host "✔ OK (Matched: `"$matchedTitle`")" -ForegroundColor Green
            $successCount++
        } else {
            Write-Host "✘ MISMATCH: No matching books found in NDL." -ForegroundColor Red
            if ($candidates.Count -gt 0) {
                # Distinct candidate list for cleaner output
                $uniqueCandidates = $candidates | Select-Object -Unique
                Write-Host "    NDL Candidates: $($uniqueCandidates -join ', ')" -ForegroundColor Yellow
            }
            $failedCount++
        }
    } else {
        Write-Host "⚠ NDL ERROR: Failed to retrieve details or 0 results found." -ForegroundColor Yellow
        $failedCount++
    }
    
    $i++
    Start-Sleep -Milliseconds 300 # Polite delay
}

Write-Host "`n======================================="
Write-Host "Validation Results: Success $successCount, Failed/Mismatch $failedCount"
Write-Host "======================================="

if ($failedCount -gt 0) {
    Write-Host "Error: Some book titles could not be verified. Please check for hallucinations." -ForegroundColor Red
    exit 1
} else {
    Write-Host "Success: All hardcoded book titles verified successfully in NDL." -ForegroundColor Green
    exit 0
}
