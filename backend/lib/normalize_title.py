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
            
        if token in ["edition", "deluxe", "special", "version", "album", "single", "remix", "mono", "stereo", "mix"]:
            continue

        if token:
            normalized_tokens.append(token)

    if not normalized_tokens:
        return title
    
    return ' '.join(normalized_tokens)
