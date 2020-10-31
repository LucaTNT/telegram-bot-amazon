This is a Telegram bot that, if made admin of a group, will delete any message
containing an Amazon link and re-post it tagged with the specified affiliate tag.

It takes two parameters as environment variables:

* TELEGRAM_BOT_TOKEN (required) is the token obtained from @Botfather
* AMAZON_TAG (required) is the Amazon affiliate tag to be used when rewriting URLs.

## Running the app

You can either run the app directly through NodeJS

    TELEGRAM_BOT_TOKEN=your-token AMAZON_TAG=your-tag node index.js

Or you can run it in Docker

    docker run -e TELEGRAM_BOT_TOKEN=your-token -e AMAZON_TAG=your-tag --init lucatnt/telegram-bot-amazon

Note that the `--init` option is highly recommended because it allows you to stop the container through a simple Ctrl+C when running in the foreground. Without it you need to use `docker stop`.
