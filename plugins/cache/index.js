const fs = require("fs");
const DIR = "./_site/images";

const printList = (items) => {
  console.log("---");
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${item}`);
  });
};

// After builds, cache _site/images
// Before builds, restore _site/images and move it to .image_cache
module.exports = {
  async onPreBuild({ utils }) {
    await utils.cache.restore(".jekyll-cache");
    const success = await utils.cache.restore(DIR);
    if (!success) return console.log(`No cache found for resources folder`);
    const cachedFiles = await utils.cache.list(DIR);
    if (fs.existsSync(".image_cache")) {
      fs.renameSync(".image_cache", `/tmp/${Date.now()}`);
    }
    fs.renameSync("./_site/images/", ".image_cache/");
    console.log(
      `Restored cached resources folder. Total files: ${cachedFiles.length}`
    );
    // printList(cachedFiles);
  },

  async onPostBuild({ utils }) {
    console.log(fs.readdirSync("./"));
    const success = await utils.cache.save(DIR);
    if (!success) return console.log(`No resources folder cached`);
    const cachedFiles = await utils.cache.list(DIR);
    console.log(
      `Saved resources folder to cache. Total files: ${cachedFiles.length}`
    );
    await utils.cache.save(".jekyll-cache");
    // printList(cachedFiles);
  },
};
