// Kènè Pro — Utilitaire d'impression haute définition pour le Kit Commercial
// Ouvre une fenêtre popup dédiée et isolée calibrée au format A5 ou A6

export function printCommercialDocument(options: {
  title: string;
  format: "A5" | "A6";
  orientation?: "portrait" | "landscape";
  htmlContent: string;
}) {
  const isA5 = options.format === "A5";
  const orientation = options.orientation || "portrait";
  const sizeRule = isA5
    ? `size: A5 ${orientation}; margin: 8mm;`
    : `size: A6 ${orientation}; margin: 5mm;`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${options.title}</title>
  <style>
    @page {
      ${sizeRule}
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #FFFFFF;
      color: #18120C;
    }
    .print-doc-container {
      width: 100%;
      height: 100%;
      background: #FFFFFF !important;
      border: 2px solid #C8951E;
      border-radius: 16px;
      padding: ${isA5 ? "20px" : "12px"};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    @media screen {
      body {
        padding: 20px;
        background: #F4EFE6;
      }
      .print-doc-container {
        max-width: ${isA5 ? "148mm" : "105mm"};
        min-height: ${isA5 ? "210mm" : "148mm"};
        margin: 0 auto;
        box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      }
    }
  </style>
</head>
<body>
  <div class="print-doc-container">
    ${options.htmlContent}
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 300);
    });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=650,height=900,scrollbars=yes,resizable=yes");
  if (!win) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
