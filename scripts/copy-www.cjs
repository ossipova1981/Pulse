const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "www");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "icons"), { recursive: true });
fs.mkdirSync(path.join(dest, "sounds"), { recursive: true });

for (const file of ["index.html", "app.js", "cloud.js", "styles.css", "manifest.webmanifest", "sw.js"]) {
  fs.copyFileSync(path.join(root, file), path.join(dest, file));
}
for (const icon of fs.readdirSync(path.join(root, "icons"))) {
  fs.copyFileSync(path.join(root, "icons", icon), path.join(dest, "icons", icon));
}
const soundsDir = path.join(root, "sounds");
if (fs.existsSync(soundsDir)) {
  for (const sound of fs.readdirSync(soundsDir)) {
    fs.copyFileSync(path.join(soundsDir, sound), path.join(dest, "sounds", sound));
  }
}

console.log("www ready");
