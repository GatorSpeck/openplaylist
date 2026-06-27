from ytmusicapi import YTMusic
import sys
import argparse 

parser = argparse.ArgumentParser(description='Test YTMusic API')
parser.add_argument('auth_file', type=str, help='Path to the auth.json file')

args = parser.parse_args()

yt = YTMusic(args.auth_file)
print(yt.get_library_playlists())
