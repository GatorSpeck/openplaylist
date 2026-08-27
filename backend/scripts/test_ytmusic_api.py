from ytmusicapi import YTMusic
import argparse
import pytest

pytest.mark.skip("This test requires a valid auth.json file to run.")
def main():
    parser = argparse.ArgumentParser(description='Test YTMusic API')
    parser.add_argument('auth_file', type=str, help='Path to the auth.json file')

    args = parser.parse_args()

    yt = YTMusic(args.auth_file)
    print(yt.get_library_playlists())

if __name__ == "__main__":
    main()
