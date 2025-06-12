#!/usr/bin/env node
const dedent = require("dedent");
const ejs = require("ejs");
const fs = require("fs");
const glob = require("glob");
const hljs = require("highlight.js");
const mkdirp = require("mkdirp");
const path = require("path");
const postcss = require("postcss");

const { homepage, version } = require("./package.json");

function buildCSS() {
  const input =
    `/*! system.css v${version} - ${homepage} */\n` + fs.readFileSync("style.css");

  return postcss()
    .use(require("postcss-inline-svg"))
    .use(require("postcss-css-variables"))
    .use(require("postcss-calc"))
    .use(require("postcss-copy")({ dest: "dist", template: "[name].[ext]" }))
    .use(require("cssnano"))
    .process(input, {
      from: "style.css",
      to: "dist/system.css",
      map: { inline: false },
    })
    .then((result) => {
      mkdirp.sync("dist");
      fs.writeFileSync("dist/system.css", result.css);
      fs.writeFileSync("dist/system.css.map", result.map.toString());
    });
}

// Renamed from buildDocs
function buildSystemCssDocsPage() {
  let id = 0;
  function getNewId() {
    return ++id;
  }
  function getCurrentId() {
    return id;
  }

  const template = fs.readFileSync("docs/index.html.ejs", "utf-8");
  function example(code) {
    const magicBrackets = /\[\[(.*)\]\]/g;
    const dedented = dedent(code);
    const inline = dedented.replace(magicBrackets, "$1");
    const escaped = hljs.highlight("html", dedented.replace(magicBrackets, ""))
      .value;

    return `<div class="example">
      ${inline}
      <details>
        <summary>Show code</summary>
        <pre><code>${escaped}</code></pre>
      </details>
    </div>`;
  }

  glob("docs/*", (err, files) => {
    if (!err) {
      files.forEach((srcFile) =>
        fs.copyFileSync(srcFile, path.join("dist", path.basename(srcFile)))
      );
    } else throw "error globbing dist directory.";
  });
  fs.writeFileSync(
    path.join(__dirname, "/dist/index.html"), // This still outputs to /dist for the original docs
    ejs.render(template, { getNewId, getCurrentId, example })
  );
}

function buildBbsClientAssets() {
  const outputDir = 'dist_bbs_client';
  const styleDir = path.join(outputDir, 'style');
  mkdirp.sync(outputDir);
  mkdirp.sync(styleDir);

  // Re-use buildCSS logic but change output destination for BBS client
  // Option 1: Modify buildCSS to take outputDir as param (more involved)
  // Option 2: Duplicate and modify buildCSS (simpler for now if buildCSS is not too complex)
  // For this task, let's assume buildCSS is run once for 'dist', and we copy/adapt its output or parts.
  // However, the prompt asks to call buildCSS() OR a MODIFIED version.
  // Let's try to make buildCSS flexible if possible, or simplify.

  // Simplified approach: Assume buildCSS already ran and created 'dist/system.css'
  // and its assets. We then copy necessary files.
  // This might not be ideal if 'dist' isn't guaranteed to be up-to-date before this step.

  // Per prompt: "Call the existing buildCSS() function (or a modified version of it)
  // to process style.css and output the final CSS to dist_bbs_client/style/system.css"

  // Let's try to adapt buildCSS's core logic for a new destination.
  // This is a re-implementation of buildCSS's core for a different output.
  // A better long-term solution would be to refactor buildCSS to accept output paths.
  console.log("Building BBS client CSS...");
  const input =
    `/*! system.css v${version} - ${homepage} - BBS Client */\n` + fs.readFileSync("style.css");

  return postcss()
    .use(require("postcss-inline-svg"))
    .use(require("postcss-css-variables"))
    .use(require("postcss-calc"))
    // Critical: ensure postcss-copy copies assets relative to the NEW output path
    .use(require("postcss-copy")({ dest: styleDir, template: "[name].[ext]" }))
    .use(require("cssnano"))
    .process(input, {
      from: "style.css", // Original source
      to: path.join(styleDir, "system.css"), // New destination
      map: { inline: false },
    })
    .then((result) => {
      fs.writeFileSync(path.join(styleDir, "system.css"), result.css);
      fs.writeFileSync(path.join(styleDir, "system.css.map"), result.map.toString());
      console.log("BBS client CSS built successfully.");

      // Copy HTML
      console.log("Copying BBS client HTML...");
      fs.copyFileSync("index.html", path.join(outputDir, "index.html"));
      console.log("BBS client HTML copied.");

      // Verify/copy fonts and icons if not handled by postcss-copy
      // postcss-copy with the above setup *should* copy referenced assets (fonts/icons from style.css)
      // into `dist_bbs_client/style/` (or subdirs like `dist_bbs_client/style/fonts`).
      // If index.html directly references root /fonts or /icon, manual copy is needed.
      // Assuming style.css correctly references fonts/icons for postcss-copy to work.
      // Example: If style.css has url('./fonts/somefont.woff'), postcss-copy will try to put it in styleDir.

      // Let's add explicit copy for top-level fonts and icon directories if they exist
      // and are needed by index.html directly (not just via CSS).
      // style.css uses url("./fonts/...") and url("./icon/..."), so postcss-copy should handle them
      // relative to the CSS output directory (`dist_bbs_client/style/`).

    })
    .catch(err => {
      console.error("Error building BBS client assets:", err);
      throw err; // Re-throw to be caught by main build
    });
}


function build() {
  // buildCSS() // Original buildCSS for the /dist folder (docs page)
  // It seems buildCSS() is for the documentation page's CSS.
  // The new buildBbsClientAssets will create its own CSS.
  // So, we might not need to call the original buildCSS() if its output isn't used elsewhere or by buildSystemCssDocsPage.
  // Let's assume buildSystemCssDocsPage might rely on `dist/system.css` from the original buildCSS.

  console.log("Starting main build process...");
  buildCSS() // This creates dist/system.css for the original docs/demo page
    .then(() => {
      console.log("Original system.css built (for docs).");
      return buildBbsClientAssets(); // This creates dist_bbs_client/style/system.css
    })
    .then(() => {
      console.log("BBS client assets built.");
      // buildSystemCssDocsPage might need to be adjusted if it expects CSS in a specific place
      // or if its links need to be relative to /dist.
      // For now, assume it works with dist/system.css created by the original buildCSS.
      // return buildSystemCssDocsPage(); // This line is now commented out/removed.
    })
    .then(() => {
      // console.log("System CSS docs page built."); // Corresponding log also commented out.
      console.log("Build completed successfully (BBS client assets only).");
    })
    .catch((err) => console.error("Build failed:", err));
}
module.exports = build;

// Only run build if the script is executed directly
if (require.main === module) {
  build();
}
