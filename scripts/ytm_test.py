import ytmusicapi
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--authfile", help="Path to YouTube Music authentication file", default="../backend/browser.json")
args = parser.parse_args()
ytm = ytmusicapi.YTMusic(args.authfile)
print(ytm.get_account_info())
print(ytm.get_library_playlists())