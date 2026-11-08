import re

def normalize_title(title: str) -> str:
    normalized_title = title.lower().strip()

    # search for year and remaster
    remastered_pattern = re.compile(r"[0-9]{4} remaster(ed)?")
    remix_pattern = re.compile(r"[0-9]{4} (re)?mix")
    normalized_title = re.sub(remastered_pattern, "", normalized_title)
    normalized_title = re.sub(remix_pattern, "", normalized_title)

    tokens = normalized_title.split()

    normalized_tokens = []

    for token in tokens:
        token = token.strip("-()[]")  # Remove brackets and parens

        if token.startswith("remaster"):
            continue

        if token.startswith("remix"):
            continue
            
        if token in ["edition", "deluxe", "special", "version", "album", "single", "remix", "mono", "stereo", "mix"]:
            continue

        if token:
            normalized_tokens.append(token)

    if not normalized_tokens:
        return title
    
    return ' '.join(normalized_tokens).strip()

def normalize_artist(artist: str) -> str:
    """
    Normalize artist names by removing common suffixes and extra spaces.
    """
    normalized_artist = artist.lower().strip().split()

    normalized_tokens = []

    for token in normalized_artist:
        token = token.strip("-()[]")
        
        if token in ["the", "&", "and", "band", "orchestra", "ensemble", "group", "trio", "quartet", "quintet", "sextet", "septet", "octet"]:
            continue

        if token:
            normalized_tokens.append(token)

    if not normalized_tokens:
        return artist

    return ' '.join(normalized_tokens)

# Straight and curly apostrophes are dropped (not split on) during search tokenizing, so
# "Don't" becomes "dont" rather than "don" + "t".
SEARCH_APOSTROPHES = ("'", "’", "‘", "`")


def tokenize_search_query(query: str) -> list[str]:
    """
    Split a free-text search query into lowercase word tokens, ignoring punctuation such as
    parens, brackets, quotes and dashes. Apostrophes are removed rather than split on.
    """
    value = (query or "").lower()
    for apostrophe in SEARCH_APOSTROPHES:
        value = value.replace(apostrophe, "")

    return [token for token in re.split(r"[^\w]+", value) if token]
