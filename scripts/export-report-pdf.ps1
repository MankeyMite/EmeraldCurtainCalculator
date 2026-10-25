param([Parameter(Mandatory=$true)][string]$InputDocx,[Parameter(Mandatory=$true)][string]$OutputPdf)
$ErrorActionPreference = 'Stop'
$reportWord = $null
$reportDocument = $null
$reportOwnsApplication = $false
try {
  $reportWord = New-Object -ComObject Word.Application
  $reportOwnsApplication = $reportWord.Documents.Count -eq 0
  if ($reportOwnsApplication) { $reportWord.Visible = $false; $reportWord.DisplayAlerts = 0 }
  $reportDocument = $reportWord.Documents.Open($InputDocx,$false,$true,$false)
  $reportDocument.Fields.Update() | Out-Null
  $reportDocument.ExportAsFixedFormat($OutputPdf,17)
  Write-Output $OutputPdf
} finally {
  if ($null -ne $reportDocument) { $reportDocument.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($reportDocument) }
  if ($null -ne $reportWord) {
    if ($reportOwnsApplication -and $reportWord.Documents.Count -eq 0) { $reportWord.Quit() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($reportWord)
  }
}
