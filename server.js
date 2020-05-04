"use strict";

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const _fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const fs = _fs.promises;

const dirname = path.resolve();
const filePath = path.join(dirname, "items.json");

console.log("USER", process.env.USERNAME);

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
const WATCH = ["Alvar aalto bord"];
const BASE_URL = "https://www.blocket.se";
const INTERVAL = 600000;

const url = (_query) => {
  const query = encodeURIComponent(_query);

  return `${BASE_URL}/annonser/stockholm?q=${query}&r=${STOCKHOLM_REGION}`;
};

const getData = async () => {
  try {
    const saved = await fs.readFile(filePath);
    return JSON.parse(saved);
  } catch (_error) {
    return {};
  }
};

async function scrape(watch) {
  const data = await getData();
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
    .map((_index, element) => [
      [$(element).attr("aria-label"), $(element).attr("to")],
    ])
    .get();

  const newItems = [];
  items.forEach(([name, value]) => {
    if (data[watch][name] == null) {
      data[watch][name] = value;
      newItems.push({ [name]: value });
    }
  });

  await fs.writeFile(
    filePath,
    JSON.stringify({ ...data, [watch]: data[watch] })
  );

  await page.close();
  await browser.close();
  return newItems;
}

async function notify() {
  const mock = await getData();

  const html = Object.entries(mock).reduce(
    (string, [watchedTitle, values]) =>
      `${string}<h3>${watchedTitle}</h3>${Object.entries(values).reduce(
        (string2, [name, to]) =>
          `${string2}<p><a href=${BASE_URL + to}>${name}</a></p>`,
        ""
      )}`,
    ""
  );

  await transporter.sendMail({
    from: '"Blocket-watcher" <notify@hbystrom.com>',
    to: "herman.bystrom@live.com",
    subject: "Nya bevakningar",
    html,
  });
}

async function clean() {
  const data = await getData();

  for (const property in data) {
    if (!WATCH.includes(property)) {
      delete data[property];
    }
  }

  await fs.writeFile(filePath, JSON.stringify(data));
}

(async function init() {
  const rerun = () =>
    setTimeout(() => {
      init();
    }, INTERVAL);

  try {
    await clean();

    const fetch = async () => {
      const array = [];
      for (const item of WATCH) {
        const response = await scrape(item);
        array.push(...response);
      }
      return array;
    };

    console.log("Fetching data...");
    const newItems = await fetch();

    if (newItems.length) {
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
