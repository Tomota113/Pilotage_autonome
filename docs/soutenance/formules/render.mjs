import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import fs from "fs";
const adaptor = liteAdaptor(); RegisterHTMLHandler(adaptor);
const doc = mathjax.document("", { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: "none" }) });
const jobs = (await import(new URL(process.argv[2], import.meta.url))).default;
const out = {};
for (const [name, { tex, px, color, label }] of Object.entries(jobs)) {
  const node = doc.convert(tex, { display: true });
  let svg = adaptor.innerHTML(node).replace(/^<svg/, "<svg").match(/<svg[\s\S]*<\/svg>/)[0];
  const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  const w = Math.round(+vb[3] / 1000 * px), h = Math.round(+vb[4] / 1000 * px);
  svg = svg.replace(/ width="[^"]*"/, ` width="${w}"`).replace(/ height="[^"]*"/, ` height="${h}"`)
    .replace(/ style="[^"]*"/, "").replace(/ role="img"/, "").replace(/ focusable="false"/, "")
    .replace(/ xmlns:xlink="[^"]*"/, "").replace(/currentColor/g, color).replace(/ data-[a-z-]+="[^"]*"/g, "")
    .replace(/<svg /, `<svg aria-label="${label}" style="width:${w}px; height:${h}px;" `);
  out[name] = { svg, w, h, bytes: svg.length };
}
fs.writeFileSync(process.argv[3], JSON.stringify(out));
for (const [k, v] of Object.entries(out)) console.log(k, v.w + "x" + v.h, v.bytes + " octets");
