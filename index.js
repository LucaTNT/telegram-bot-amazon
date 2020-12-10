/*
telegram-bot-amazon
Author: Luca Zorzi (@LucaTNT)
License: MIT
*/

const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const fullURLRegex = /https?:\/\/(([^\s]*)\.)?amazon\.([a-z.]{2,5})(\/d\/([^\s]*)|\/([^\s]*)\/?(?:dp|o|gp|-)\/)(aw\/d\/|product\/)?(B[0-9]{2}[0-9A-Z]{7}|[0-9]{9}(?:X|[0-9]))([^\s]*)/gi;
const shortURLRegex = /https?:\/\/(([^\s]*)\.)?amzn\.to\/([0-9A-Za-z]+)/gi;

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.log("Missing TELEGRAM_BOT_TOKEN env variable");
  process.exit(1);
}

if (!process.env.AMAZON_TAG) {
  console.log("Missing AMAZON_TAG env variable");
  process.exit(1);
}

const shorten_links =
  process.env.SHORTEN_LINKS && process.env.SHORTEN_LINKS == "true";
const bitly_token = process.env.BITLY_TOKEN;
if (shorten_links && !bitly_token) {
  console.log(
    "Missing BITLY_TOKEN env variable (required when SHORTEN_LINKS is true)"
  );
  process.exit(1);
}

var amazon_tld;

if (!process.env.AMAZON_TLD) {
  console.log("Missing AMAZON_TLD env variable, using the default one (.in)");
  amazon_tld = "in";
} else {
  amazon_tld = process.env.AMAZON_TLD;
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const amazon_tag = process.env.AMAZON_TAG;
const rawUrlRegex = new RegExp(
  https?://(([^\\s]*)\\.)?amazon\\.${amazon_tld}/?([^\\s]*),
  "ig"
);


const bot = new TelegramBot(token, { polling: true });

function log(msg) {
  const date = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
  console.log(date + " " + msg);
}

async function shortenURL(url) {
  const headers = {
    Authorization: Bearer ${bitly_token},
    "Content-Type": "application/json",
  };
  const body = { long_url: url, domain: "bit.ly" };
  try {
    const res = await fetch("https://api-ssl.bitly.com/v4/shorten", {
      method: "post",
      headers: headers,
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (result.link) {
      return result.link;
    } else {
      log("Error in bitly response " + JSON.stringify(result));
      return url;
    }
  } catch (err) {
    log(Error in bitly response ${err});
    return url;
  }
}

function buildAmazonUrl(asin) {
  return https://www.amazon.${amazon_tld}/dp/${asin}?tag=${amazon_tag};
}

function buildRawAmazonUrl(element) {
  const url = element.expanded_url ? element.expanded_url : element.fullURL;
  const strucutredURL = new URL(url);
  strucutredURL.searchParams.set("tag", amazon_tag);

  return strucutredURL.toString();
}

async function getAmazonURL(element) {
  const url =
    element.asin != null
      ? buildAmazonUrl(element.asin)
      : buildRawAmazonUrl(element);
  return shorten_links ? await shortenURL(url) : url;
} catch (e) {
    log(
      "ERROR, please file a bug report at https://github.com/LucaTNT/telegram-bot-amazon"
}
});
