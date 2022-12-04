/*
telegram-bot-amazon

Author: Luca Zorzi (@LucaTNT)
Contributers:
 - Nitesh Sahni (@nsniteshsahni)
License: MIT
*/

const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const URLRegex =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

const channelName = process.env.CHANNEL_NAME
  ? `@${process.env.CHANNEL_NAME}`
  : false;

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.log("Missing TELEGRAM_BOT_TOKEN env variable");
  process.exit(1);
}

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

const token = process.env.TELEGRAM_BOT_TOKEN;

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

function buildMention(user) {
  return user.username
    ? "@" + user.username
    : user.first_name + (user.last_name ? " " + user.last_name : "");
}

function buildMessage(chat, message, replacements, user) {
  if (isGroup(chat)) {
    var affiliate_message = message;
    for (const element of replacements) {
      affiliate_message = affiliate_message.replace(
        element.find,
        element.replace
      );
    }

    return group_replacement_message
      .replace(/\\n/g, "\n")
      .replace("{USER}", buildMention(user))
      .replace("{MESSAGE}", affiliate_message)
      .replace("{ORIGINAL_MESSAGE}", message);
  } else {
    var text = "";
      for (const element of replacements) {
        text += (replacements.length > 1 ? "• " : "") + (element.replace) + "\n";
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


function replaceTextLinks(msg) {
  var links = [];

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

        links.push(entity.url)

        new_text += msg.text.substring(offset + length);

        msg.text = new_text;
      }
      if (entity.type == "url") {
        links.push(msg.text.substring(entity.offset, entity.offset + entity.length))
      }
    });
  }
    return {text: msg.text, links: links};
}

async function getReplacements(links) {
  const headers = {
    "Content-Type": "application/json",
  };
  const body = { links: links };

  try {
    const res = await fetch("https://stocazzo123.com/affiliate", {
      method: "post",
      headers: headers,
      body: JSON.stringify(body),
    });
    const result = await res.json();

    if (result["replacements"]) {
      return result["replacements"];
    } else {
      log("Error in sponsor API response " + JSON.stringify(result));

      return [];
    }
  } catch (err) {
    log(`Error in sponsor API response ${err}`);
    return [];
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
      const text_and_links = replaceTextLinks(msg);
      msg.text = text_and_links['text']
      
      msg.text = msg.text || msg.caption;
      msg.captionSavedAsText = msg.text == msg.caption;

      if (msg.captionSavedAsText) {
        URLRegex.lastIndex = 0;
        while ((match = URLRegex.exec(msg.text)) !== null) {
          text_and_links['links'].push(match[0]);
        }
      }

      // var replacements = [];
      // text_and_links['links'].forEach((link) => {
      //   const replacement = {find: link, replace: link.toUpperCase()};
      //   replacements.push(replacement);
      // });

      const replacements = await getReplacements(text_and_links['links']);

      console.log(replacements);

      if (replacements.length > 0) {
        const text = await buildMessage(
          msg.chat,
          msg.text,
          replacements,
          msg.from
        );
        const deleted = deleteAndSend(msg, text);
        replacements.forEach((element) => {
          log(
            "Replaced URL " +
              element.find +
              " with URL " +
              element.replace +
              " from " +
              buildMention(msg.from) +
              (deleted ? " (original message deleted)" : "")
          );
        });
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
