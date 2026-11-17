// يبني apps-script/all.gs من core.gs + server.gs + photos.gs
// الاستخدام:  node apps-script/build-all.js
// all.gs هو الملف الذي ينشره GitHub Actions إلى Apps Script — لا تعدّله يدويًا.
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\r\n/g, "\n");
const header = "// ===== كود الحضور والانصراف — شركة جادو — الصقه كاملًا في Code.gs (بدل القديم) =====\n";
const out = [header, read("core.gs"), read("server.gs"), read("photos.gs")].join("\n");
fs.writeFileSync(path.join(__dirname, "all.gs"), out.replace(/\n/g, "\r\n"), "utf8");
console.log("all.gs ← core.gs + server.gs + photos.gs (" + out.length + " حرفًا)");
