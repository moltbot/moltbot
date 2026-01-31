---
name: market-watch
description: "Live financial markets: crypto prices, forex rates, stock market data, and financial news from worldwide exchanges."
homepage: https://github.com/openclaw/openclaw
metadata:
  openclaw:
    emoji: "📈"
    requires:
      bins:
        - curl
        - jq
---

# 📈 Market Watch

Live financial market data for crypto, forex, and stocks. All APIs are **FREE** with no API key required for basic usage.

## Quick Reference

| Market    | Data Available                     |
| --------- | ---------------------------------- |
| 🪙 Crypto | Bitcoin, Ethereum, all major coins |
| 💱 Forex  | USD, EUR, GBP, INR, all currencies |
| 📊 Stocks | US, India, Europe, Asia markets    |
| 📰 News   | Financial news & market updates    |

---

## 1. 🪙 Cryptocurrency Prices

### Get Bitcoin & Major Crypto Prices

```bash
# Bitcoin, Ethereum, and top 10 cryptos
curl -s "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,ripple,cardano,solana,dogecoin,polkadot,litecoin,avalanche-2&vs_currencies=usd,eur,inr&include_24hr_change=true" | jq '.'
```

### Search Any Cryptocurrency

```bash
# Get price for any coin (e.g., shiba-inu)
curl -s "https://api.coingecko.com/api/v3/simple/price?ids=shiba-inu&vs_currencies=usd,eur,inr&include_24hr_change=true&include_market_cap=true" | jq '.'
```

### Top Gainers & Losers (24h)

```bash
curl -s "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=percent_change_24h_desc&per_page=10&page=1" | jq '.[] | {name, symbol, current_price, price_change_percentage_24h}'
```

### Crypto Market Overview

```bash
curl -s "https://api.coingecko.com/api/v3/global" | jq '.data | {total_market_cap_usd: .total_market_cap.usd, total_volume_24h: .total_volume.usd, btc_dominance: .market_cap_percentage.btc, active_cryptocurrencies}'
```

### Trending Coins

```bash
curl -s "https://api.coingecko.com/api/v3/search/trending" | jq '.coins[] | {name: .item.name, symbol: .item.symbol, market_cap_rank: .item.market_cap_rank}'
```

---

## 2. 💱 Forex Exchange Rates

### Major Currency Pairs

```bash
# USD to major currencies
curl -s "https://api.exchangerate-api.com/v4/latest/USD" | jq '{base, rates: {EUR: .rates.EUR, GBP: .rates.GBP, INR: .rates.INR, JPY: .rates.JPY, AUD: .rates.AUD, CAD: .rates.CAD, CHF: .rates.CHF}}'
```

### Convert Any Currency

```bash
# EUR to all currencies
curl -s "https://api.exchangerate-api.com/v4/latest/EUR" | jq '.'
```

### INR (Indian Rupee) Rates

```bash
curl -s "https://api.exchangerate-api.com/v4/latest/INR" | jq '{base, rates: {USD: .rates.USD, EUR: .rates.EUR, GBP: .rates.GBP, AED: .rates.AED, SGD: .rates.SGD}}'
```

### Currency Conversion Calculator

```bash
# Convert 1000 USD to INR
curl -s "https://api.exchangerate-api.com/v4/latest/USD" | jq '.rates.INR * 1000'
```

---

## 3. 📊 Stock Market Data

### US Market - Major Indices (via Yahoo Finance)

```bash
# Get S&P 500, NASDAQ, Dow Jones quotes
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC" | jq '{symbol: .chart.result[0].meta.symbol, price: .chart.result[0].meta.regularMarketPrice, change: .chart.result[0].meta.regularMarketPrice - .chart.result[0].meta.previousClose}'
```

### Get Any Stock Quote

```bash
# Apple stock
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/AAPL" | jq '{symbol: .chart.result[0].meta.symbol, price: .chart.result[0].meta.regularMarketPrice, currency: .chart.result[0].meta.currency}'
```

### Indian Stock Market (NSE)

```bash
# NIFTY 50 Index
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI" | jq '{symbol: "NIFTY 50", price: .chart.result[0].meta.regularMarketPrice}'
```

```bash
# Reliance Industries
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS" | jq '{symbol: .chart.result[0].meta.symbol, price: .chart.result[0].meta.regularMarketPrice, currency: .chart.result[0].meta.currency}'
```

### Popular Indian Stocks

```bash
# TCS, Infosys, HDFC Bank
for symbol in TCS.NS INFY.NS HDFCBANK.NS; do
  curl -s "https://query1.finance.yahoo.com/v8/finance/chart/$symbol" | jq '{symbol: .chart.result[0].meta.symbol, price: .chart.result[0].meta.regularMarketPrice}'
done
```

### European Markets

```bash
# FTSE 100 (UK)
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/%5EFTSE" | jq '{symbol: "FTSE 100", price: .chart.result[0].meta.regularMarketPrice}'
```

### Asian Markets

```bash
# Nikkei 225 (Japan)
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/%5EN225" | jq '{symbol: "Nikkei 225", price: .chart.result[0].meta.regularMarketPrice}'

# Hang Seng (Hong Kong)
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/%5EHSI" | jq '{symbol: "Hang Seng", price: .chart.result[0].meta.regularMarketPrice}'
```

---

## 4. 📰 Financial News

### Crypto News

```bash
curl -s "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,ETH,Market" | jq '.Data[0:5][] | {title, source: .source_info.name, url}'
```

### General Financial News (via NewsAPI - needs free API key)

```bash
# Get free API key from newsapi.org
curl -s "https://newsapi.org/v2/top-headlines?category=business&country=us&apiKey=$NEWS_API_KEY" | jq '.articles[0:5][] | {title, source: .source.name, url}'
```

### Alternative: RSS Feeds as JSON

```bash
# CNBC Markets
curl -s "https://api.rss2json.com/v1/api.json?rss_url=https://www.cnbc.com/id/10001147/device/rss/rss.html" | jq '.items[0:5][] | {title, pubDate, link}'
```

---

## 5. 📊 Market Summary Dashboard

### Quick Market Overview

```bash
echo "=== CRYPTO ===" && \
curl -s "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true" | jq '.' && \
echo "=== FOREX (USD) ===" && \
curl -s "https://api.exchangerate-api.com/v4/latest/USD" | jq '{EUR: .rates.EUR, GBP: .rates.GBP, INR: .rates.INR, JPY: .rates.JPY}'
```

---

## 6. 🔔 Price Alerts (Example Logic)

Check if Bitcoin crosses a threshold:

```bash
BTC_PRICE=$(curl -s "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd" | jq -r '.bitcoin.usd')
THRESHOLD=50000
if (( $(echo "$BTC_PRICE > $THRESHOLD" | bc -l) )); then
  echo "🚀 Bitcoin is above $THRESHOLD! Current: $BTC_PRICE"
else
  echo "📉 Bitcoin is below $THRESHOLD. Current: $BTC_PRICE"
fi
```

---

## Popular Symbol Reference

### Crypto (CoinGecko IDs)

| Coin     | ID            |
| -------- | ------------- |
| Bitcoin  | `bitcoin`     |
| Ethereum | `ethereum`    |
| BNB      | `binancecoin` |
| XRP      | `ripple`      |
| Cardano  | `cardano`     |
| Solana   | `solana`      |
| Dogecoin | `dogecoin`    |

### Forex Codes

| Currency      | Code  |
| ------------- | ----- |
| US Dollar     | `USD` |
| Euro          | `EUR` |
| British Pound | `GBP` |
| Indian Rupee  | `INR` |
| Japanese Yen  | `JPY` |
| Chinese Yuan  | `CNY` |

### Stock Symbols

| Company          | Symbol        |
| ---------------- | ------------- |
| Apple            | `AAPL`        |
| Microsoft        | `MSFT`        |
| Google           | `GOOGL`       |
| Tesla            | `TSLA`        |
| Reliance (India) | `RELIANCE.NS` |
| TCS (India)      | `TCS.NS`      |

---

## Tips

- **CoinGecko** has rate limits - don't spam requests
- **Yahoo Finance** is unofficial but works well
- For real-time trading, use professional APIs (Alpha Vantage, IEX Cloud)
- Indian stocks use `.NS` suffix for NSE, `.BO` for BSE
