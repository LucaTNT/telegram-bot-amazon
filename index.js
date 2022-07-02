/*
telegram-bot-amazon

Author: Luca Zorzi (@LucaTNT)
Contributers:
 - Nitesh Sahni (@nsniteshsahni)
License: MIT
*/

const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const fullURLRegex =
  /https?:\/\/(([^\s]*)\.)?amazon\.([a-z.]{2,5})(\/d\/([^\s]*)|\/([^\s]*)\/?(?:dp|o|gp|-)\/)(aw\/d\/|product\/)?(B[0-9]{2}[0-9A-Z]{7}|[0-9]{9}(?:X|[0-9]))([^\s]*)/gi;
const shortURLRegex = /https?:\/\/(([^\s]*)\.)?amzn\.to\/([0-9A-Za-z]+)/gi;
const URLRegex =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

const channelName = process.env.CHANNEL_NAME
  ? `@${process.env.CHANNEL_NAME}`
  : false;

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

const raw_links = process.env.RAW_LINKS && process.env.RAW_LINKS == "true";
const check_for_redirects =
  process.env.CHECK_FOR_REDIRECTS && process.env.CHECK_FOR_REDIRECTS == "true";
const check_for_redirect_chains =
  process.env.CHECK_FOR_REDIRECT_CHAINS &&
  process.env.CHECK_FOR_REDIRECT_CHAINS == "true";
const max_redirect_chain_depth = process.env.MAX_REDIRECT_CHAIN_DEPTH || 2;

var group_replacement_message;

if (!process.env.GROUP_REPLACEMENT_MESSAGE) {
  console.log(
    "Missing GROUP_REPLACEMENT_MESSAGE env variable, using the default one"
  );
  group_replacement_message =
    "Message by {USER} with Amazon affiliate link:\n\n{MESSAGE}";
} else {
  group_replacement_message = process.env.GROUP_REPLACEMENT_MESSAGE;
}

var amazon_tld;

if (!process.env.AMAZON_TLD) {
  console.log("Missing AMAZON_TLD env variable, using the default one (.com)");
  amazon_tld = "com";
} else {
  amazon_tld = process.env.AMAZON_TLD;
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const amazon_tag = process.env.AMAZON_TAG;
const rawUrlRegex = new RegExp(
  `https?://(([^\\s]*)\\.)?amazon\\.${amazon_tld}/?([^\\s]*)`,
  "ig"
);

var usernames_to_ignore = [];
var user_ids_to_ignore = [];

if (process.env.IGNORE_USERS) {
  const usernameRegex = /@([^\s]+)/gi;
  const userIdRegex = /([0-9]+)/gi;
  let to_ignore = process.env.IGNORE_USERS.split(",");
  to_ignore.forEach((ignore) => {
    let usernameResult = usernameRegex.exec(ignore.trim());
    if (usernameResult) {
      usernames_to_ignore.push(usernameResult[1].toLowerCase());
    } else {
      let userIdResult = userIdRegex.exec(ignore.trim());
      if (userIdResult) {
        user_ids_to_ignore.push(parseInt(userIdResult[1]));
      }
    }
  });
}

const bot = new TelegramBot(token, { polling: true });

function log(msg) {
  const date = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");
  console.log(date + " " + msg);
}

async function shortenURL(url) {
  const headers = {
    Authorization: `Bearer ${bitly_token}`,
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
    log(`Error in bitly response ${err}`);
    return url;
  }
}

function buildAmazonUrl(asin) {
  return `https://www.amazon.${amazon_tld}/dp/${asin}?tag=${amazon_tag}`;
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
}

function buildMention(user) {
  return user.username
    ? "@" + user.username
    : user.first_name + (user.last_name ? " " + user.last_name : "");
}

async function buildMessage(chat, message, replacements, user) {
  if (isGroup(chat)) {
    var affiliate_message = message;
    for await (const element of replacements) {
      const sponsored_url = await getAmazonURL(element);
      affiliate_message = affiliate_message.replace(
        element.fullURL,
        sponsored_url
      );
    }

    return group_replacement_message
      .replace(/\\n/g, "\n")
      .replace("{USER}", buildMention(user))
      .replace("{MESSAGE}", affiliate_message)
      .replace("{ORIGINAL_MESSAGE}", message);
  } else {
    var text = "";
    if (replacements.length > 1) {
      for await (const element of replacements) {
        text += "• " + (await getAmazonURL(element)) + "\n";
      }
    } else {
      text = await getAmazonURL(replacements[0]);
    }

    return text;
  }
}

function isGroup(chat) {
  return chat.type == "group" || chat.type == "supergroup";
}

function deleteAndSend(msg, text) {
  const chat = msg.chat;
  const messageId = msg.message_id;
  const chatId = chat.id;
  var deleted = false;

  if (isGroup(chat)) {
    bot.deleteMessage(chatId, messageId);
    deleted = true;
  }
  const options = msg.reply_to_message
    ? { reply_to_message_id: msg.reply_to_message.message_id }
    : {};

  if (msg.captionSavedAsText && isGroup(chat)) {
    bot.sendPhoto(chatId, msg.photo[0].file_id, { ...options, caption: text });
    if (channelName) {
      bot.sendPhoto(channelName, msg.photo[0].file_id, {
        ...options,
        caption: text,
      });
    }
  } else {
    bot.sendMessage(chatId, text, options);
    if (channelName) {
      bot.sendMessage(channelName, text, options);
    }
  }

  return deleted;
}

function getASINFromFullUrl(url) {
  const match = fullURLRegex.exec(url);

  return match != null ? match[8] : url;
}

async function getLongUrl(shortURL, chain_depth = 0) {
  try {
    chain_depth++;
    let res = await fetch(shortURL, { redirect: "manual" });
    let fullURL = res.headers.get("location");

    if (check_for_redirect_chains && chain_depth < max_redirect_chain_depth) {
      var nextRedirect = null;
      if (fullURL !== null) {
        nextRedirect = await getLongUrl(fullURL, chain_depth);
      }

      if (fullURL === null) {
        return { fullURL: shortURL, shortURL: shortURL };
      } else {
        return { fullURL: nextRedirect["fullURL"], shortURL: shortURL };
      }
    } else {
      if (fullURL === null) {
        return { fullURL: shortURL, shortURL: shortURL };
      } else {
        return { fullURL: fullURL, shortURL: shortURL };
      }
    }
  } catch (err) {
    log("Short URL " + shortURL + " -> ERROR");
    return null;
  }
}

function replaceTextLinks(msg) {
  if (msg.entities) {
    var offset_shift = 0;
    msg.entities.forEach((entity) => {
      if (entity.type == "text_link") {
        let offset = entity.offset + offset_shift;
        let length = entity.length;

        var new_text = "";

        if (offset > 0) {
          new_text += msg.text.substring(0, offset);
        }

        new_text += entity.url;
        offset_shift = entity.url.length - length;

        new_text += msg.text.substring(offset + length);

        msg.text = new_text;
      }
    });

    return msg.text;
  }
}

bot.on("message", async (msg) => {
  try {
    let from_username = msg.from.username
      ? msg.from.username.toLowerCase()
      : "";
    let from_id = msg.from.id;
    if (
      (!usernames_to_ignore.includes(from_username) &&
        !user_ids_to_ignore.includes(from_id)) ||
      !isGroup(msg.chat)
    ) {
      msg.text = replaceTextLinks(msg);

      msg.text = msg.text || msg.caption;
      msg.captionSavedAsText = msg.text == msg.caption;

      if (check_for_redirects) {
        URLRegex.lastIndex = 0;
        var longURLReplacements = [];
        while ((match = URLRegex.exec(msg.text)) !== null) {
          shortURLRegex.lastIndex = 0;
          rawUrlRegex.lastIndex = 0;
          if (
            shortURLRegex.exec(match[0]) === null &&
            rawUrlRegex.exec(match[0]) === null
          ) {
            log(`Found non-Amazon URL ${match[0]}`);
            let longURL = await getLongUrl(match[0]);
            longURLReplacements.push(longURL);
          }
        }

        longURLReplacements.forEach((element) => {
          if (element.fullURL !== null) {
            msg.text = msg.text.replace(element.shortURL, element.fullURL);
          }
        });
      }

      shortURLRegex.lastIndex = 0;
      var replacements = [];
      var match;
      if (raw_links) {
        rawUrlRegex.lastIndex = 0;

        while ((match = rawUrlRegex.exec(msg.text)) !== null) {
          const fullURL = match[0];

          replacements.push({ asin: null, fullURL: fullURL });
        }
      } else {
        fullURLRegex.lastIndex = 0;

        while ((match = fullURLRegex.exec(msg.text)) !== null) {
          const asin = match[8];
          const fullURL = match[0];
          replacements.push({ asin: asin, fullURL: fullURL });
        }
      }

      while ((match = shortURLRegex.exec(msg.text)) !== null) {
        const shortURL = match[0];
        fullURLRegex.lastIndex = 0; // Otherwise sometimes getASINFromFullUrl won't succeed
        const url = await getLongUrl(shortURL);

        if (url != null) {
          if (raw_links) {
            replacements.push({
              asin: null,
              expanded_url: url.fullURL,
              fullURL: shortURL,
            });
          } else {
            replacements.push({
              asin: getASINFromFullUrl(url.fullURL),
              fullURL: shortURL,
            });
          }
        }
      }

      if (replacements.length > 0) {
        const text = await buildMessage(
          msg.chat,
          msg.text,
          replacements,
          msg.from
        );
        const deleted = deleteAndSend(msg, text);

        if (replacements.length > 1) {
          replacements.forEach((element) => {
            log(
              "Long URL " +
                element.fullURL +
                " -> ASIN " +
                element.asin +
                " from " +
                buildMention(msg.from) +
                (deleted ? " (original message deleted)" : "")
            );
          });
        } else {
          log(
            "Long URL " +
              replacements[0].fullURL +
              " -> ASIN " +
              replacements[0].asin +
              " from " +
              buildMention(msg.from) +
              (deleted ? " (original message deleted)" : "")
          );
        }
      }
    } else {
      log(
        `Ignored message from ${buildMention(
          msg.from
        )} because it is included in the IGNORE_USERS env variable`
      );
    }
  } catch (e) {
    log(
      "ERROR, please file a bug report at https://github.com/LucaTNT/telegram-bot-amazon"
    );
    console.log(e);
  }
});
