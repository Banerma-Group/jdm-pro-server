# logistics-backend

## Cities API

`GET /api/cities`

Query parameters:

- `countryId` – filter by country
- `limit` – maximum number of cities to return (default **100**)
- `offset` – number of cities to skip (default **0**)

Responses for city lists are cached using Redis to avoid redundant database queries.

## Redis availability.

If the Redis service becomes unavailable, connection errors are logged and
the application will attempt to reconnect automatically. During outages,
features relying on Redis (such as caching) may degrade or be temporarily
unavailable until the connection is restored.

## Environment Variables.

The application relies on the following environment variables:

- `PORT` – port number for the HTTP server.
- `DATABASE_URL` – connection string for PostgreSQL.
- `JWT_SECRET` – secret key for signing JSON Web Tokens.
- `FRONT_HOST_NAME` – base URL of the frontend application.
- `BACK_HOST_NAME` – base URL of this backend service.
- `TELEGRAM_BOT_TOKEN` – token for the primary Telegram bot.
- `SUBSCRIPTION_BOT_TOKEN` – token for the subscription notification bot.
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` – Telegram API credentials.
- `PAYCOM_PROD_API` – Paycom API endpoint.
- `PAYCOM_MERCHANT_ID` – Paycom merchant identifier.
- `PAYCOM_DEV_TOOL_KEY` – developer tool key for Paycom.
- `PAYCOM_TG_MERCHANT_ID` – Paycom Telegram merchant ID.
- `PAYCOM_DEV_TOOL_TG_KEY` – Paycom Telegram developer tool key.
- `PAYCOM_TOKEN` – Paycom provider token for invoices.
- `ESKIZ_UZ_EMAIL` – login email for Eskiz SMS service.
- `ESKIZ_UZ_PASSWORD` – password for Eskiz SMS service.
- `REDIS_URL` – Redis connection string.

Set these variables in a `.env` file before running the application.
