#!/usr/bin/env python3
"""
OpenClaw Starter Kit - AIsa API Client
Powered by AIsa (https://aisa.one)

Unified API access for autonomous agents.

Usage:
    python aisa_client.py twitter user-info --username <username>
    python aisa_client.py twitter tweets --username <username> [--count <n>]
    python aisa_client.py twitter search --query <query> [--count <n>]
    python aisa_client.py twitter detail --tweet-id <id>
    python aisa_client.py twitter trends
    python aisa_client.py search web --query <query> [--count <n>]
    python aisa_client.py search scholar --query <query> [--count <n>]
    python aisa_client.py news --query <query> [--count <n>]
    python aisa_client.py llm complete --model <model> --prompt <prompt>
    python aisa_client.py llm chat --model <model> --messages <json>
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.parse
import urllib.error
from typing import Any, Dict, Optional


class AIsaClient:
    """OpenClaw Starter Kit - AIsa API Client for unified access to AI-native data sources."""
    
    BASE_URL = "https://api.aisa.one/apis/v1"
    LLM_BASE_URL = "https://api.aisa.one/v1"
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the client with an API key."""
        self.api_key = api_key or os.environ.get("AISA_API_KEY")
        if not self.api_key:
            raise ValueError(
                "AISA_API_KEY is required. Set it via environment variable or pass to constructor."
            )
    
    def _request(
        self, 
        method: str, 
        endpoint: str, 
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make an HTTP request to the AIsa API."""
        url = f"{self.BASE_URL}{endpoint}"
        
        if params:
            query_string = urllib.parse.urlencode(
                {k: v for k, v in params.items() if v is not None}
            )
            url = f"{url}?{query_string}"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "OpenClaw-Starter-Kit/1.0"
        }
        
        request_data = None
        if data:
            request_data = json.dumps(data).encode("utf-8")
        
        # For POST requests without body, send empty JSON
        if method == "POST" and request_data is None:
            request_data = b"{}"
        
        req = urllib.request.Request(url, data=request_data, headers=headers, method=method)
        
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            try:
                return json.loads(error_body)
            except json.JSONDecodeError:
                return {"success": False, "error": {"code": str(e.code), "message": error_body}}
        except urllib.error.URLError as e:
            return {"success": False, "error": {"code": "NETWORK_ERROR", "message": str(e.reason)}}
    
    # ==================== Twitter APIs ====================
    
    def twitter_user_info(self, username: str) -> Dict[str, Any]:
        """Get Twitter user information by username."""
        return self._request("GET", "/twitter/user/info", params={"userName": username})
    
    def twitter_user_tweets(self, username: str, count: int = 20) -> Dict[str, Any]:
        """Get tweets from a specific user."""
        return self._request("GET", "/twitter/user/user_last_tweet", params={"userName": username})
    
    def twitter_search(self, query: str, query_type: str = "Latest") -> Dict[str, Any]:
        """Search for tweets matching a query (Advanced Search)."""
        return self._request("GET", "/twitter/tweet/advanced_search", params={
            "query": query,
            "queryType": query_type  # "Latest" or "Top"
        })
    
    def twitter_tweet_detail(self, tweet_ids: str) -> Dict[str, Any]:
        """Get detailed information about tweets by IDs (comma-separated)."""
        return self._request("GET", "/twitter/tweet/tweetById", params={"tweet_ids": tweet_ids})
    
    def twitter_trends(self, woeid: int = 1) -> Dict[str, Any]:
        """Get current Twitter trending topics by WOEID (1 = worldwide)."""
        return self._request("GET", "/twitter/trends", params={"woeid": woeid})
    
    def twitter_user_search(self, keyword: str) -> Dict[str, Any]:
        """Search for Twitter users by keyword."""
        return self._request("GET", "/twitter/user/search_user", params={"keyword": keyword})
    
    # ==================== Twitter Post APIs (V3 - requires login) ====================
    
    def twitter_login(self, username: str, email: str, password: str, proxy: str, totp_code: str = None) -> Dict[str, Any]:
        """Login to Twitter account (V3). Required before posting."""
        data = {
            "user_name": username,
            "email": email,
            "password": password,
            "proxy": proxy
        }
        if totp_code:
            data["totp_code"] = totp_code
        return self._request("POST", "/twitter/user_login_v3", data=data)
    
    def twitter_get_account(self, username: str) -> Dict[str, Any]:
        """Get logged-in account details (check login status)."""
        return self._request("GET", "/twitter/get_my_x_account_detail_v3", params={"user_name": username})
    
    def twitter_send_tweet(self, username: str, text: str, media_base64: str = None, media_type: str = None, community_id: str = None) -> Dict[str, Any]:
        """Send a tweet (requires prior login via twitter_login)."""
        data = {
            "user_name": username,
            "text": text
        }
        if media_base64:
            data["media_data_base64"] = media_base64
        if media_type:
            data["media_type"] = media_type
        if community_id:
            data["community_id"] = community_id
        return self._request("POST", "/twitter/send_tweet_v3", data=data)
    
    def twitter_like(self, username: str, tweet_id: str) -> Dict[str, Any]:
        """Like a tweet (requires prior login)."""
        return self._request("POST", "/twitter/like_tweet_v3", data={
            "user_name": username,
            "tweet_id": tweet_id
        })
    
    def twitter_retweet(self, username: str, tweet_id: str) -> Dict[str, Any]:
        """Retweet a tweet (requires prior login)."""
        return self._request("POST", "/twitter/retweet_v3", data={
            "user_name": username,
            "tweet_id": tweet_id
        })
    
    # ==================== Search APIs ====================
    
    def search_web(self, query: str, max_results: int = 10) -> Dict[str, Any]:
        """Perform a web search (POST method)."""
        return self._request("POST", "/scholar/search/web", params={
            "query": query,
            "max_num_results": max_results
        })
    
    def search_scholar(self, query: str, max_results: int = 10, year_from: int = None, year_to: int = None) -> Dict[str, Any]:
        """Search academic papers and scholarly content (POST method)."""
        params = {
            "query": query,
            "max_num_results": max_results
        }
        if year_from:
            params["as_ylo"] = year_from
        if year_to:
            params["as_yhi"] = year_to
        return self._request("POST", "/scholar/search/scholar", params=params)
    
    def search_smart(self, query: str, max_results: int = 10) -> Dict[str, Any]:
        """Perform intelligent search combining web and academic results."""
        return self._request("POST", "/scholar/search/smart", params={
            "query": query,
            "max_num_results": max_results
        })
    
    # ==================== News API ====================
    
    def news(self, ticker: str, count: int = 10) -> Dict[str, Any]:
        """Get company news by stock ticker."""
        return self._request("GET", "/financial/news", params={"ticker": ticker, "limit": count})
    
    # ==================== LLM APIs ====================
    
    def _llm_request(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Make an HTTP request to the AIsa LLM API (different base URL)."""
        url = f"{self.LLM_BASE_URL}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "OpenClaw-Starter-Kit/1.0"
        }
        
        request_data = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=request_data, headers=headers, method="POST")
        
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            try:
                return json.loads(error_body)
            except json.JSONDecodeError:
                return {"success": False, "error": {"code": str(e.code), "message": error_body}}
        except urllib.error.URLError as e:
            return {"success": False, "error": {"code": "NETWORK_ERROR", "message": str(e.reason)}}
    
    def llm_complete(self, model: str, prompt: str, **kwargs) -> Dict[str, Any]:
        """Generate a completion using the specified LLM model."""
        data = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            **kwargs
        }
        return self._llm_request("/chat/completions", data)
    
    def llm_chat(self, model: str, messages: list, **kwargs) -> Dict[str, Any]:
        """Perform a chat completion with message history."""
        data = {
            "model": model,
            "messages": messages,
            **kwargs
        }
        return self._llm_request("/chat/completions", data)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="OpenClaw Starter Kit - Unified API access for autonomous agents (Powered by AIsa)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    %(prog)s twitter user-info --username elonmusk
    %(prog)s twitter search --query "AI agents" --count 10
    %(prog)s search web --query "latest AI news"
    %(prog)s search scholar --query "transformer architecture"
    %(prog)s llm complete --model gpt-4 --prompt "Explain quantum computing"
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="API category")
    
    # Twitter commands
    twitter_parser = subparsers.add_parser("twitter", help="Twitter/X API operations")
    twitter_sub = twitter_parser.add_subparsers(dest="action", help="Twitter action")
    
    # twitter user-info
    user_info = twitter_sub.add_parser("user-info", help="Get user information")
    user_info.add_argument("--username", "-u", required=True, help="Twitter username")
    
    # twitter tweets
    tweets = twitter_sub.add_parser("tweets", help="Get user's last tweets")
    tweets.add_argument("--username", "-u", required=True, help="Twitter username")
    
    # twitter search
    search = twitter_sub.add_parser("search", help="Advanced tweet search")
    search.add_argument("--query", "-q", required=True, help="Search query")
    search.add_argument("--type", "-t", choices=["Latest", "Top"], default="Latest", help="Query type")
    
    # twitter detail
    detail = twitter_sub.add_parser("detail", help="Get tweets by IDs")
    detail.add_argument("--tweet-ids", "-t", required=True, help="Tweet IDs (comma-separated)")
    
    # twitter trends
    trends = twitter_sub.add_parser("trends", help="Get trending topics")
    trends.add_argument("--woeid", "-w", type=int, default=1, help="WOEID (1=worldwide)")
    
    # twitter user-search
    user_search = twitter_sub.add_parser("user-search", help="Search for users")
    user_search.add_argument("--keyword", "-k", required=True, help="Search keyword")
    
    # twitter login (V3)
    login = twitter_sub.add_parser("login", help="Login to Twitter account (required for posting)")
    login.add_argument("--username", "-u", required=True, help="Twitter username")
    login.add_argument("--email", "-e", required=True, help="Account email")
    login.add_argument("--password", "-p", required=True, help="Account password")
    login.add_argument("--proxy", required=True, help="Proxy URL (http://user:pass@ip:port)")
    login.add_argument("--totp", help="TOTP 2FA secret (recommended)")
    
    # twitter account (check login status)
    account = twitter_sub.add_parser("account", help="Check logged-in account status")
    account.add_argument("--username", "-u", required=True, help="Twitter username")
    
    # twitter post (send tweet)
    post = twitter_sub.add_parser("post", help="Send a tweet (requires login)")
    post.add_argument("--username", "-u", required=True, help="Twitter username")
    post.add_argument("--text", "-t", required=True, help="Tweet text content")
    post.add_argument("--media", help="Base64 encoded media data")
    post.add_argument("--media-type", choices=["image/jpeg", "image/png", "image/gif", "video/mp4"], help="Media MIME type")
    post.add_argument("--community", help="Community ID to post to")
    
    # twitter like
    like = twitter_sub.add_parser("like", help="Like a tweet (requires login)")
    like.add_argument("--username", "-u", required=True, help="Twitter username")
    like.add_argument("--tweet-id", "-t", required=True, help="Tweet ID to like")
    
    # twitter retweet
    retweet = twitter_sub.add_parser("retweet", help="Retweet a tweet (requires login)")
    retweet.add_argument("--username", "-u", required=True, help="Twitter username")
    retweet.add_argument("--tweet-id", "-t", required=True, help="Tweet ID to retweet")
    
    # Search commands
    search_parser = subparsers.add_parser("search", help="Search API operations")
    search_sub = search_parser.add_subparsers(dest="action", help="Search type")
    
    # search web
    web_search = search_sub.add_parser("web", help="Web search")
    web_search.add_argument("--query", "-q", required=True, help="Search query")
    web_search.add_argument("--count", "-c", type=int, default=10, help="Max results (up to 100)")
    
    # search scholar
    scholar_search = search_sub.add_parser("scholar", help="Academic paper search")
    scholar_search.add_argument("--query", "-q", required=True, help="Search query")
    scholar_search.add_argument("--count", "-c", type=int, default=10, help="Max results (up to 100)")
    scholar_search.add_argument("--year-from", type=int, help="Publication year lower bound")
    scholar_search.add_argument("--year-to", type=int, help="Publication year upper bound")
    
    # search smart
    smart_search = search_sub.add_parser("smart", help="Smart search (web + academic)")
    smart_search.add_argument("--query", "-q", required=True, help="Search query")
    smart_search.add_argument("--count", "-c", type=int, default=10, help="Max results")
    
    # News commands
    news_parser = subparsers.add_parser("news", help="Company news by ticker")
    news_parser.add_argument("--ticker", "-t", required=True, help="Stock ticker (e.g., AAPL)")
    news_parser.add_argument("--count", "-c", type=int, default=10, help="Number of results")
    
    # LLM commands
    llm_parser = subparsers.add_parser("llm", help="LLM API operations")
    llm_sub = llm_parser.add_subparsers(dest="action", help="LLM action")
    
    # llm complete
    complete = llm_sub.add_parser("complete", help="Generate completion")
    complete.add_argument("--model", "-m", required=True, help="Model name (e.g., gpt-4, claude-3)")
    complete.add_argument("--prompt", "-p", required=True, help="Prompt text")
    complete.add_argument("--max-tokens", type=int, help="Maximum tokens to generate")
    complete.add_argument("--temperature", type=float, help="Sampling temperature")
    
    # llm chat
    chat = llm_sub.add_parser("chat", help="Chat completion")
    chat.add_argument("--model", "-m", required=True, help="Model name")
    chat.add_argument("--messages", required=True, help="JSON array of messages")
    chat.add_argument("--max-tokens", type=int, help="Maximum tokens to generate")
    chat.add_argument("--temperature", type=float, help="Sampling temperature")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    try:
        client = AIsaClient()
    except ValueError as e:
        print(json.dumps({"success": False, "error": {"code": "AUTH_ERROR", "message": str(e)}}))
        sys.exit(1)
    
    result = None
    
    # Execute the appropriate command
    if args.command == "twitter":
        if args.action == "user-info":
            result = client.twitter_user_info(args.username)
        elif args.action == "tweets":
            result = client.twitter_user_tweets(args.username)
        elif args.action == "search":
            result = client.twitter_search(args.query, args.type)
        elif args.action == "detail":
            result = client.twitter_tweet_detail(args.tweet_ids)
        elif args.action == "trends":
            result = client.twitter_trends(args.woeid)
        elif args.action == "user-search":
            result = client.twitter_user_search(args.keyword)
        # V3 APIs (require login)
        elif args.action == "login":
            result = client.twitter_login(args.username, args.email, args.password, args.proxy, args.totp)
        elif args.action == "account":
            result = client.twitter_get_account(args.username)
        elif args.action == "post":
            result = client.twitter_send_tweet(args.username, args.text, args.media, args.media_type, args.community)
        elif args.action == "like":
            result = client.twitter_like(args.username, args.tweet_id)
        elif args.action == "retweet":
            result = client.twitter_retweet(args.username, args.tweet_id)
        else:
            twitter_parser.print_help()
            sys.exit(1)
    
    elif args.command == "search":
        if args.action == "web":
            result = client.search_web(args.query, args.count)
        elif args.action == "scholar":
            year_from = getattr(args, 'year_from', None)
            year_to = getattr(args, 'year_to', None)
            result = client.search_scholar(args.query, args.count, year_from, year_to)
        elif args.action == "smart":
            result = client.search_smart(args.query, args.count)
        else:
            search_parser.print_help()
            sys.exit(1)
    
    elif args.command == "news":
        result = client.news(args.ticker, args.count)
    
    elif args.command == "llm":
        kwargs = {}
        if hasattr(args, "max_tokens") and args.max_tokens:
            kwargs["max_tokens"] = args.max_tokens
        if hasattr(args, "temperature") and args.temperature is not None:
            kwargs["temperature"] = args.temperature
        
        if args.action == "complete":
            result = client.llm_complete(args.model, args.prompt, **kwargs)
        elif args.action == "chat":
            try:
                messages = json.loads(args.messages)
            except json.JSONDecodeError:
                print(json.dumps({"success": False, "error": {"code": "INVALID_JSON", "message": "Invalid JSON in --messages"}}))
                sys.exit(1)
            result = client.llm_chat(args.model, messages, **kwargs)
        else:
            llm_parser.print_help()
            sys.exit(1)
    
    # Output result
    if result:
        # Handle encoding for Windows console
        output = json.dumps(result, indent=2, ensure_ascii=False)
        try:
            print(output)
        except UnicodeEncodeError:
            # Fallback to ASCII-safe output
            print(json.dumps(result, indent=2, ensure_ascii=True))
        sys.exit(0 if result.get("success", True) else 1)


if __name__ == "__main__":
    main()
