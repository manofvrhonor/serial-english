import { tokenize, resolveLemma } from "../js/core/lemmatizer.js";
import fs from "node:fs";
import zlib from "node:zlib";

const dict = JSON.parse(zlib.gunzipSync(fs.readFileSync("./data/dictionary.json.gz")));
const forms = JSON.parse(zlib.gunzipSync(fs.readFileSync("./data/forms.json.gz")));

const samples = [
  "I decided to get going and it's nothing like gravity, let's go.",
  "there's no way he's getting away.",
];

console.log("=== Токены → лемма → перевод ===");
for (const text of samples) {
  console.log("\nТекст:", text);
  for (const tok of tokenize(text)) {
    const lemma = resolveLemma(tok, dict, forms);
    const trans = dict[lemma] || [];
    console.log(`  ${tok} → ${lemma} | ${trans.slice(0, 2).join(", ") || "нет"}`);
  }
}
