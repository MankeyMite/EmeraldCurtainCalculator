"""Use the packaged DOCX rasterizer with installed Word as the PDF backend.
The Windows runtime does not bundle LibreOffice. No managed file is modified.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
skill=Path(r"C:\Users\augus\.codex\plugins\cache\openai-primary-runtime\documents\26.1022.11436\skills\documents")
poppler=Path(r"C:\Users\augus\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin")
os.environ["PATH"]=str(poppler)+os.pathsep+os.environ.get("PATH","")
spec=importlib.util.spec_from_file_location("packaged_render_docx",skill/"render_docx.py")
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
def word_pdf(doc_path,user_profile,convert_tmp_dir,stem,verbose):
    pdf=Path(convert_tmp_dir)/(stem+".pdf")
    # Invoke our authored commands inline without changing the machine's
    # execution policy or requiring unsigned script-file execution.
    quote=lambda value:"'"+str(value).replace("'","''")+"'"
    program=(root/"scripts/export-report-pdf.ps1").read_text(encoding="utf-8").split("\n",1)[1]
    inline=f"$InputDocx={quote(Path(doc_path).resolve())}\n$OutputPdf={quote(pdf)}\n"+program
    command=["powershell.exe","-NoProfile","-NonInteractive","-Command",inline]
    result=subprocess.run(command,capture_output=True,text=True)
    debug=result.stdout+result.stderr
    if verbose: print(debug)
    return (str(pdf),debug) if result.returncode==0 and pdf.exists() else ("",debug)
renderer.convert_to_pdf=word_pdf
source=root/"artifacts/Emerald-SID-Recovery-Simulation-Report.docx"
output=root/"artifacts/starter-sid-report-qa"
renderer.rasterize(str(source),str(output),120,True,True)
print(output)
