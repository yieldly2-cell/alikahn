const fs = require("fs");
const path = require("path");

const distDir = path.join(process.cwd(), "server_dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

fs.writeFileSync(
  path.join(distDir, "package.json"),
  JSON.stringify({ type: "module" }, null, 2)
);

console.log("Added type:module to server_dist/package.json");
