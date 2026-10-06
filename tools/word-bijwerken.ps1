# Stap 2 van het maken van de Word- en PDF-versies (stap 1 is tools/md-to-docx.cjs).
# Pakt de map van md-to-docx.cjs in tot een Word-bestand, laat Word de inhoudsopgave bijwerken en
# slaat het resultaat op als .docx (om te bewerken) en als .pdf. Nodig: Microsoft Word.
#
# Gebruik: word-bijwerken.ps1 -Map <map van md-to-docx.cjs> -Docx <uitvoer.docx> -Pdf <uitvoer.pdf>
# Sla -Docx en -Pdf op in een tijdelijke map (niet in een OneDrive-map: daar bleef Word hangen bij
# het opslaan) en kopieer de bestanden daarna naar docs/. Een volledig voorbeeld staat bovenin
# tools/md-to-docx.cjs.
param([string]$Map, [string]$Docx, [string]$Pdf)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tmp = "$Docx.tmp.docx"
if (Test-Path $tmp) { Remove-Item $tmp -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($Map, $tmp)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($tmp, $false, $false)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  foreach ($toc in $doc.TablesOfContents) { $toc.UpdatePageNumbers() }
  # Vult de inhoudsopgave precies een pagina, dan schuift de lege alinea erna door naar een nieuwe
  # pagina en geeft het volgende hoofdstuk (met "pagina-einde ervoor") een lege pagina. Staat zo'n
  # lege alinea al boven aan een pagina, dan is het pagina-einde voor de kop niet meer nodig.
  foreach ($toc in $doc.TablesOfContents) {
    # Begin bij de alinea waarin de inhoudsopgave eindigt en zoek de eerstvolgende kop.
    $p = $doc.Range($toc.Range.End, $toc.Range.End).Paragraphs(1)
    for ($i = 0; $i -lt 5 -and $null -ne $p; $i++) {
      if ($p.Format.PageBreakBefore) {
        $prev = $p.Previous()
        $before = if ($null -ne $prev) { $prev.Previous() } else { $null }
        # Is de alinea vóór de kop leeg en staat die als enige op een nieuwe pagina (de alinea
        # daarvoor staat op een eerdere pagina), dan zou het pagina-einde een lege pagina geven.
        if ($null -ne $prev -and $null -ne $before -and $prev.Range.Text.Trim() -eq "" -and
            $prev.Range.Information(3) -gt $before.Range.Information(3)) {   # 3 = wdActiveEndPageNumber
          $p.Format.PageBreakBefore = $false
        }
        break
      }
      $p = $p.Next()
    }
  }
  foreach ($toc in $doc.TablesOfContents) { $toc.UpdatePageNumbers() }
  if (Test-Path $Docx) { Remove-Item $Docx -Force }
  $doc.SaveAs2($Docx, 16)          # 16 = wdFormatDocumentDefault (.docx)
  $doc.ExportAsFixedFormat($Pdf, 17) # 17 = wdExportFormatPDF
  $pages = $doc.ComputeStatistics(2) # 2 = wdStatisticPages
  $doc.Close($false)
  "Klaar: $pages pagina's"
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
