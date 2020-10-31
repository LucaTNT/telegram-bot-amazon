/*
telegram-bot-amazon

Author: Luca Zorzi (@LucaTNT)
License: MIT
*/

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const fullURLRegex = /https?:\/\/(www\.)?(.*)amazon\.([a-z\.]{2,5})(\/d\/(.*)|\/(.*)\/?(?:dp|o|gp|-)\/)(aw\/d\/|product\/)?(B[0-9]{2}[0-9A-Z]{7}|[0-9]{9}(?:X|[0-9]))([^\s]*)/i
const shortURLRegex = /https?:\/\/(www\.)?(.*)amzn.to\/([0-9A-Za-z]+)/i

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.log("Missing TELEGRAM_BOT_TOKEN env variable")
  process.exit(1)
}

if (!process.env.AMAZON_TAG) {
  console.log("Missing AMAZON_TAG env variable")
  process.exit(1)
}

const token = process.env.TELEGRAM_BOT_TOKEN
const amazon_tag = process.env.AMAZON_TAG
const bot = new TelegramBot(token, {polling: true})

function log(msg) {
  const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
  console.log(date + " " + msg)
}

function buildAmazonUrl(asin) {
  return "https://www.amazon.it/dp/" + asin + "?tag=" + amazon_tag
}

function buildMention(user) {
  return user.username ? "@" + user.username : (user.first_name + (user.last_name ? " " + user.last_name : ""))
}

function buildMessage(message, fullURL, asin, user) {
  return "Messaggio di " + buildMention(user) + " con link Amazon sponsorizzato:\n\n" + message.replace(fullURL, buildAmazonUrl(asin))
}

function deleteAndSend(chat, messageId, text) {
  const chatId = chat.id

  if (chat.type == "group") {
  	bot.deleteMessage(chatId, messageId)
  }
  bot.sendMessage(chatId, text)
}

function getASINFromFullUrl(url) {
  const match = url.match(fullURLRegex)

  return match[8]
}

bot.onText(fullURLRegex, (msg, match) => {
  const asin = match[8];
  const fullURL = match[0];

  text = buildMessage(msg.text, fullURL, asin, msg.from)
  deleteAndSend(msg.chat, msg.message_id, text)

  log('Long URL ' + fullURL + ' -> ASIN ' + asin + ' from ' + buildMention(msg.from))
});

bot.onText(shortURLRegex, (msg, match) => {
  const shortURL = match[0];
  fetch(shortURL, {redirect: 'manual'}).then(res => {
    const fullURL = res.headers.get('location')

    const asin = getASINFromFullUrl(fullURL)
    text = buildMessage(msg.text, shortURL, asin, msg.from)
    deleteAndSend(msg.chat, msg.message_id, text)

    log('Short URL ' + shortURL + ' -> ASIN ' + asin + ' from ' + buildMention(msg.from))
  }).catch(err => {
    log('Short URL ' + shortURL + ' -> ERROR from ' + buildMention(msg.from))
  })
});
