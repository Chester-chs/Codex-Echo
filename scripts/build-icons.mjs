import { readFile, writeFile, readdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
const root = new URL("../src/static/", import.meta.url);
for (const file of await readdir(new URL("icons/", root))) {
  if (!file.endsWith(".svg")) continue;
  const source = new URL(`icons/${file}`, root);
  const image = new Resvg(await readFile(source, "utf8"), {
    fitTo: { mode: "width", value: 72 },
  })
    .render()
    .asPng();
  await writeFile(
    new URL(`icons/${file.replace(".svg", ".png")}`, root),
    image,
  );
}
await writeFile(
  new URL("pulse.png", root),
  new Resvg(await readFile(new URL("pulse.svg", root), "utf8"), {
    fitTo: { mode: "width", value: 144 },
  })
    .render()
    .asPng(),
);
console.log("Mini-program PNG icons generated.");
