# OpenClaw Starter Kit - API Reference

**Powered by AIsa**

Complete API documentation based on [aisa.mintlify.app](https://aisa.mintlify.app/api-reference/introduction).

## Base URL

```
https://api.aisa.one/apis/v1
```

## Authentication

All requests require a Bearer token:

```
Authorization: Bearer YOUR_AISA_API_KEY
```

---

## Twitter/X APIs

### GET /twitter/user/info

Get user information by username.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userName | string | Yes | Twitter username (without @) |

### GET /twitter/tweet/advanced_search

Advanced search for tweets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| queryType | string | Yes | "Latest" or "Top" |
| cursor | string | No | Pagination cursor |

### GET /twitter/user/user_last_tweet

Get user's recent tweets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userName | string | Yes | Twitter username |

### GET /twitter/tweet/tweetById

Get tweets by IDs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tweet_ids | string | Yes | Comma-separated tweet IDs |

### GET /twitter/trends

Get trending topics by WOEID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| woeid | integer | Yes | WOEID (1 = worldwide) |
| count | integer | No | Number of trends (default 30) |

### GET /twitter/user/search_user

Search for users by keyword.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| keyword | string | Yes | Search keyword |

---

## Search APIs

### POST /scholar/search/web

Web search with structured results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| max_num_results | integer | No | Max results (1-100, default 10) |
| as_ylo | integer | No | Year lower bound |
| as_yhi | integer | No | Year upper bound |

### POST /scholar/search/scholar

Academic paper search.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| max_num_results | integer | No | Max results (1-100, default 10) |
| as_ylo | integer | No | Year lower bound |
| as_yhi | integer | No | Year upper bound |

### POST /scholar/search/smart

Intelligent search combining web and academic results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query |
| max_num_results | integer | No | Max results |

---

## Tavily APIs

### POST /tavily/search

Tavily search integration.

### POST /tavily/extract

Extract content from URLs.

### POST /tavily/crawl

Crawl web pages.

---

## Financial APIs

### GET /financial/news/company

Company news by ticker.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ticker | string | Yes | Stock ticker (e.g., AAPL) |
| limit | integer | No | Number of articles |

### Other Financial Endpoints

- `/financial/stock/prices` - Historical stock prices
- `/financial/financial_statements/*` - Income, balance, cash flow
- `/financial/company/facts` - Company facts by CIK
- `/financial/search/stock` - Stock screener

---

## LLM APIs (OpenAI Compatible)

Base URL for LLM: `https://api.aisa.one/v1`

### POST /v1/chat/completions

OpenAI-compatible chat completions.

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 1000,
  "temperature": 0.7
}
```

**Supported Models:**

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4, gpt-4-turbo, gpt-3.5-turbo |
| Anthropic | claude-3-opus, claude-3-sonnet, claude-3-haiku |
| Google | gemini-pro, gemini-ultra |
| Alibaba | qwen-* |
| Deepseek | deepseek-* |
| xAI | grok-* |

---

## Error Handling

```json
{
  "error": "error message",
  "code": 400,
  "details": "additional info"
}
```

---

## Full Documentation

For complete API documentation including all endpoints:
- [AIsa API Reference](https://aisa.mintlify.app/api-reference/introduction)
- [Documentation Index](https://aisa.mintlify.app/llms.txt)
