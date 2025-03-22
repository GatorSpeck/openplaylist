import requests_cache

requests_cache_session = requests_cache.CachedSession(
    "lastfm_cache", backend="memory", expire_after=3600
)