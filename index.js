/*
telegram-bot-amazon

Author: Luca Zorzi (@LucaTNT)
License: MIT
*/

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const fullURLRegex = /https?:\/\/(www\.)?([^\s]*)amazon\.([a-z\.]{2,5})(\/d\/([^\s]*)|\/([^\s]*)\/?(?:dp|o|gp|-)\/)(aw\/d\/|product\/)?(B[0-9]{2}[0-9A-Z]{7}|[0-9]{9}(?:X|[0-9]))([^\s]*)/ig
const shortURLRegex = /https?:\/\/(www\.)?([^\s]*)amzn.to\/([0-9A-Za-z]+)/ig

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.log("Missing TELEGRAM_BOT_TOKEN env variable")
  process.exit(1)
}

if (!process.env.AMAZON_TAG) {
  console.log("Missing AMAZON_TAG env variable")
  process.exit(1)
}

var group_replacement_message

if (!process.env.GROUP_REPLACEMENT_MESSAGE) {
  console.log("Missing GROUP_REPLACEMENT_MESSAGE env variable, using the default one")
  group_replacement_message = "Message by {USER} with Amazon affiliate link:\n\n{MESSAGE}"
} else {
  group_replacement_message = process.env.GROUP_REPLACEMENT_MESSAGE
}

var amazon_tld

if (!process.env.AMAZON_TLD) {
  console.log("Missing AMAZON_TLD env variable, using the default one (.com)")
  amazon_tld = "com"
} else {
  amazon_tld = process.env.AMAZON_TLD
}

const token = process.env.TELEGRAM_BOT_TOKEN
const amazon_tag = process.env.AMAZON_TAG
const bot = new TelegramBot(token, {polling: true})

function log(msg) {
  const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
  console.log(date + " " + msg)
}

function buildAmazonUrl(asin) {
  return "https://www.amazon." + amazon_tld + "/dp/" + asin + "?tag=" + amazon_tag
}

function buildMention(user) {
  return user.username ? "@" + user.username : (user.first_name + (user.last_name ? " " + user.last_name : ""))
}

function buildMessage(chat, message, replacements, user) {
  if (isGroup(chat)) {
    var affiliate_message = message
    replacements.forEach(element => {
      affiliate_message = affiliate_message.replace(element.fullURL, buildAmazonUrl(element.asin))
    })
    return group_replacement_message.replace(/\\n/g, '\n')
                                    .replace("{USER}", buildMention(user))
                                    .replace("{MESSAGE}", affiliate_message)
                                    .replace("{ORIGINAL_MESSAGE}", message)
  } else {
    var text = ""
    if (replacements.length > 1) {
      replacements.forEach(element => {
        text += "• " + buildAmazonUrl(element.asin) + "\n"
      })
    } else {
      text = buildAmazonUrl(replacements[0].asin)
    }

    return text
  }
}

function isGroup(chat) {
  return (chat.type == "group" || chat.type == "supergroup")
}

function deleteAndSend(chat, messageId, text) {
  const chatId = chat.id
  var deleted = false

  if (isGroup(chat)) {
  	bot.deleteMessage(chatId, messageId)
    deleted = true
  }
  bot.sendMessage(chatId, text)

  return deleted
}

function getASINFromFullUrl(url) {
  const match = fullURLRegex.exec(url)

  return match[8]
}

function getLongUrl(shortURL) {
  return new Promise((resolve, reject) => {
    fetch(shortURL, {redirect: 'manual'}).then(res => {
      resolve({fullURL: res.headers.get('location'), shortURL: shortURL})
    }).catch(err => {
      reject('Short URL ' + shortURL + ' -> ERROR from ' + buildMention(msg.from))
      console.log(err)
    })
  })
}

bot.on('message', (msg) => {
  try {
    fullURLRegex.lastIndex = 0
    shortURLRegex.lastIndex = 0

    var replacements = []
    while ((match = fullURLRegex.exec(msg.text)) !== null) {
      const asin = match[8];
      const fullURL = match[0];
      replacements.push({asin: asin, fullURL: fullURL})
    }

    var promises = []
    while ((match = shortURLRegex.exec(msg.text)) !== null) {
      const shortURL = match[0]

      promises.push(getLongUrl(shortURL))
    }

    Promise.all(promises).then(fullURLs => {
      if (promises.length == 0) {
        return
      }
      fullURLs.forEach(element => {
        const asin = getASINFromFullUrl(element.fullURL)
        replacements.push({asin: asin, fullURL: element.shortURL})
      })
    }).then(_ => {
      if (replacements.length > 0) {
        const text = buildMessage(msg.chat, msg.text, replacements, msg.from)
        const deleted = deleteAndSend(msg.chat, msg.message_id, text)

        if (replacements.length > 1) {
          replacements.forEach(element => {
            log('Long URL ' + element.fullURL + ' -> ASIN ' + element.asin + ' from ' + buildMention(msg.from) + (deleted ? " (original message deleted)" : ""))
          })
        } else {
          log('Long URL ' + replacements[0].fullURL + ' -> ASIN ' + replacements[0].asin + ' from ' + buildMention(msg.from) + (deleted ? " (original message deleted)" : ""))
        }
      }
    }).catch(e => {console.log("Rejected promise"); console.log(e)})

  } catch (e) {
    log("ERROR, please file a bug report at https://github.com/LucaTNT/telegram-bot-amazon")
    console.log(e)
  }
})

