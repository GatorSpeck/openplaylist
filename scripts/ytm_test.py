import ytmusicapi
import argparse
import os
import dotenv
dotenv.load_dotenv(override=True)

parser = argparse.ArgumentParser()
parser.add_argument("--authfile", help="Path to YouTube Music authentication file", default="../backend/browser.json")
args = parser.parse_args()
print(f"Using {args.authfile}")

# ytm = ytmusicapi.YTMusic(args.authfile, oauth_credentials=ytmusicapi.OAuthCredentials(client_id=os.getenv("YOUTUBE_CLIENT_ID"), client_secret=os.getenv("YOUTUBE_CLIENT_SECRET")))
ytm = ytmusicapi.YTMusic(args.authfile)
print(ytm.get_library_playlists())
