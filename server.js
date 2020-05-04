"use strict";

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const _fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const fs = _fs.promises;

const dirname = path.resolve();
const itemsPath = path.join(dirname, "items.json");
const watchPath = path.join(dirname, "watch.json");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.USERNAME,
    pass: process.env.PASSWORD,
  },
});

const STOCKHOLM_REGION = 11;
const BASE_URL = "https://www.blocket.se";
const INTERVAL = 600000;

const url = (_query) => {
  const query = encodeURIComponent(_query);

  return `${BASE_URL}/annonser/stockholm?q=${query}&r=${STOCKHOLM_REGION}`;
};

const getData = async (filePath) => {
  try {
    const saved = await fs.readFile(filePath);
    return JSON.parse(saved);
  } catch (_error) {
    return {};
  }
};

async function scrape(watch) {
  const data = await getData(itemsPath);
  if (typeof data[watch] === "undefined") {
    data[watch] = {};
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(url(watch));

  const html = await page.content();
  const $ = cheerio.load(html);

  const selector = $("main article > div");

  const items = selector
    .parents()
    .filter((_index, element) => $(element).attr("to") != null)
    .map((_index, element) => {
      const $element = $(element);

      return [
        [
          $element.attr("aria-label"),
          $element.attr("to"),
          $element.find("img").attr("src"),
        ],
      ];
    })
    .get();

  const newItems = {};
  items.forEach(([name, href, img]) => {
    if (data[watch][name] == null) {
      data[watch][name] = { href, img };
      newItems[name] = { href, img };
    }
  });

  await fs.writeFile(
    itemsPath,
    JSON.stringify({ ...data, [watch]: data[watch] })
  );

  await page.close();
  await browser.close();
  return newItems;
}

async function notify(newItems) {
  const html = Object.entries(newItems).reduce(
    (string, [watchedTitle, values]) => {
      const children = Object.entries(values);

      if (!children.length) {
        return string;
      }

      return `${string}<h3>${watchedTitle.toUpperCase()}</h3>${Object.entries(
        values
      ).reduce(
        (string2, [name, { href, img }]) =>
          `${string2}<p><a href=${
            BASE_URL + href
          }>${name}</a></p><p><img src=${img}></p>`,
        ""
      )} `;
    },
    ""
  );

  await transporter.sendMail({
    from: '"Blocket-watcher" <notify@hbystrom.com>',
    to: "herman.bystrom@live.com",
    subject: "Nya bevakningar",
    html,
  });
}

async function clean(items) {
  const data = await getData(itemsPath);

  for (const property in data) {
    if (!items.includes(property)) {
      delete data[property];
    }
  }

  await fs.writeFile(itemsPath, JSON.stringify(data));
}

(async function init() {
  const rerun = () =>
    setTimeout(() => {
      init();
    }, INTERVAL);

  try {
    const watched = await getData(watchPath);
    const { items = [] } = watched;

    await clean(items);

    const fetch = async () => {
      const object = {};
      for (const item of items) {
        const response = await scrape(item);
        if (Object.entries(response).length) {
          object[item] = response;
        }
      }
      return object;
    };

    console.log("Fetching data...");
    const newItems = await fetch();

    if (Object.entries(newItems).length) {
      console.log("New watched items: ", newItems);
      await notify(newItems);
    } else {
      console.log("No new items were found...");
    }
    rerun();
  } catch (error) {
    console.log("Error: Fetching failed: ", error);
    rerun();
  }
})();
