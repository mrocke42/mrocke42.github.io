console.time("OPTIMIZE: requiring modules");
const glob = require("glob");
const fs = require("fs");
const path = require("path");
const { PurgeCSS } = require("purgecss");
const csso = require("csso");
const cheerio = require("cheerio");
const minify = require("html-minifier").minify;
const sharp = require("sharp");
console.timeEnd("OPTIMIZE: requiring modules");

// This runs on Netlify after Jekyll builds a full site.
// It implements two main optimizations:
// - Removes unused CSS classes
// - Minifies HTML

const timings = {
  purge: 0,
  nano: 0,
  minify: 0,
  img: 0,
  img: 0,
  cheerio: 0,
  nanoCacheHits: 0,
  imageCacheHits: 0,
  imageCacheMisses: 0,
};

async function processImage($, im) {
  const img = $(im);
  const src = img.attr("src");
  if (!src.startsWith("/images/")) return;
  const ext = path.extname(src);
  if (ext !== ".jpg") return;

  const input = sharp(path.join("_site/", src));
  const webpSrc = src.replace(ext, `.webp`);

  const cachePath = `./.image_cache/${path.basename(webpSrc)}`;
  if (fs.existsSync(cachePath)) {
    fs.renameSync(cachePath, path.join("_site/", webpSrc));
    timings.imageCacheHits++;
  } else {
    await Promise.all([input.webp().toFile(path.join("_site/", webpSrc))]);
    timings.imageCacheMisses++;
  }

  const $picture = cheerio.load(`<picture>
    <source srcset="${webpSrc}" type="image/webp" />
  </picture>`);

  $picture("picture").append(img.parent().html());
  return $picture("body").html();
}

let firstGlob = true;
console.time("glob");

const nanoCache = new Map();

Promise.all(
  glob.sync("_site/**/*.html").map(async (file, i, files) => {
    if (firstGlob) {
      console.timeEnd("glob");
      firstGlob = false;
    }
    if (file.includes("googleb4d9bcf58c690c60")) return;
    const htmlSource = await fs.promises.readFile(file, "utf8");

    const cheerioStart = Date.now();
    const $ = cheerio.load(htmlSource);

    const styles = $("style");

    const css = styles
      .map(function () {
        return $(this).html();
      })
      .get()
      .join("\n");

    styles.each(function (index) {
      if (index > 0) {
        $(this).remove();
      } else {
        $(this).html("");
      }
    });
    timings.cheerio += Date.now() - cheerioStart;

    const imgStart = Date.now();
    const imgs = $(".body > p > img").get();
    await Promise.all(
      imgs.map(async (im) => {
        const replacement = await processImage($, im);
        if (replacement) {
          $(im).replaceWith(replacement);
        }
      })
    );
    timings.img += Date.now() - imgStart;

    const purgeStart = Date.now();
    const [{ css: purified }] = await new PurgeCSS().purge({
      content: [
        {
          raw: $.html(),
          extension: "html",
        },
      ],
      css: [
        {
          raw: css,
        },
      ],
    });
    timings.purge += Date.now() - purgeStart;

    const nanoStart = Date.now();
    let minified;
    if (nanoCache.has(purified)) {
      timings.nanoCacheHits++;
      minified = nanoCache.get(purified);
    } else {
      minified = csso.minify(purified).css;
      nanoCache.set(purified, minified);
    }
    timings.nano += Date.now() - nanoStart;

    $(styles.get(0)).html(minified);

    const minifyStart = Date.now();
    const output = minify($.html(), {
      collapseWhitespace: true,
      removeAttributeQuotes: true,
      sortAttributes: true,
      collapseBooleanAttributes: true,
      decodeEntities: true,
    });
    timings.minify += Date.now() - minifyStart;

    // console.log(
    //   `${`${i + 1}/${files.length}`.padStart(
    //     String(files.length).length * 2 + 1,
    //     " "
    //   )} ${file}`
    // );
    await new Promise((resolve) => fs.writeFile(file, output, resolve));
  })
).then(() => {
  console.log("stats:");
  console.log(timings);
});
