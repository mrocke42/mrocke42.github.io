#!/usr/bin/env node
const fs = require("fs");
const { extname, basename } = require("path");
const Remark = require("remark");
const Rehype = require("rehype");
const frontmatter = require("remark-frontmatter");
const { selectAll, select } = require("unist-util-select");
const sharp = require("sharp");
const MagicString = require("magic-string");
const got = require("got");
const slugg = require("slugg");
const hasha = require("hasha");
const yaml = require("js-yaml");
const path = require("path");

const imagemin = require("imagemin");
const imageminJpegtran = require("imagemin-jpegtran");
const imageminOptipng = require("imagemin-optipng");

const imageDir = "images";

async function localizeImage(image, base) {
  const content = image.url.match(/static\.?flickr/)
    ? (await got(image.url, { responseType: "buffer" })).body
    : fs.readFileSync(path.join(process.cwd(), image.url));
  const resized = await sharp(content)
    .resize(640 * 2, null, { withoutEnlargement: true })
    .toBuffer();

  const optimized = await imagemin.buffer(resized, {
    plugins: [imageminJpegtran(), imageminOptipng()],
  });

  let originalFiletype = extname(image.url);
  let imageSlug = image.alt
    ? slugg(image.alt)
    : hasha(resized, { algorithm: "md5" });
  let p = `${imageDir}/${base}-${imageSlug}${originalFiletype}`;
  fs.writeFileSync(p, optimized);
  image.url = `/${p}`;
  return image;
}

function isRemote(path) {
  return path && !path.startsWith("/images");
}

async function localizeFile(filename) {
  const rehype = Rehype().data("settings", {
    fragment: true,
  });
  const remark = Remark()
    .data("settings", {
      listItemIndent: "1",
      rule: "-",
    })
    .use(frontmatter, "yaml");
  const text = fs.readFileSync(filename, "utf8");
  const s = new MagicString(text);
  const base = basename(filename, ".md");
  const ast = remark.parse(text);
  const images = selectAll("image", ast);
  const htmls = selectAll("html", ast);
  const yamlNode = select("yaml", ast);
  if (!yamlNode) return;
  const parsedYaml = yaml.safeLoad(yamlNode.value);
  if (isRemote(parsedYaml.image)) {
    parsedYaml.image = (
      await localizeImage(
        {
          url: parsedYaml.image,
          alt: "thumbnail-image",
        },
        base
      )
    ).url;
    yamlNode.value = yaml.safeDump(parsedYaml);
    s.overwrite(
      yamlNode.position.start.offset,
      yamlNode.position.end.offset,
      remark.stringify(yamlNode)
    );
  }
  for (let imageTag of htmls.filter((html) => {
    return html.value.startsWith("<img");
  })) {
    try {
      const ast = rehype.parse(imageTag.value);
      const src = ast.children[0].properties.src;
      if (src.includes(" ") || ast.children.length > 1 || !isRemote(src))
        continue;
      s.overwrite(
        imageTag.position.start.offset,
        imageTag.position.end.offset,
        remark.stringify(
          await localizeImage(
            {
              type: "image",
              url: src,
              alt: ast.children[0].properties.alt || "",
            },
            base
          )
        )
      );
    } catch (err) {
      console.error(err);
    }
  }
  for (let image of images.filter((img) => isRemote(img.url))) {
    try {
      s.overwrite(
        image.position.start.offset,
        image.position.end.offset,
        remark.stringify(await localizeImage(image, base))
      );
    } catch (error) {
      console.log(image);
      console.error(error);
    }
  }

  if (s.toString() !== text) {
    console.log("rewrote ", filename);
    fs.writeFileSync(filename, s.toString());
  } else {
    console.log("skipped ", filename);
  }
}

localizeFile(process.argv[2]);
