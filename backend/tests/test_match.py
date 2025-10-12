import pytest
from lib.match import get_match_score, get_album_match_score, TrackStub, AlbumStub


class TestGetMatchScore:
    """Test cases for get_match_score function"""

    def test_perfect_match(self):
        """Test perfect match returns 80 points (50 for title + 30 for artist)"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="The Beatles 1967-1970")
        track2 = TrackStub(artist="The Beatles", title="Hey Jude", album="Greatest Hits")
        
        result = get_match_score(track1, track2)
        assert result == 80

    def test_artist_match_only(self):
        """Test matching artist only returns 30 points"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="The Beatles", title="Let It Be", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 30

    def test_title_match_only(self):
        """Test matching title only returns 50 points"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="The Rolling Stones", title="Hey Jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 50

    def test_no_match(self):
        """Test no match returns 0 points"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="The Rolling Stones", title="Let It Be", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 0

    def test_case_insensitive_matching(self):
        """Test that matching is case insensitive (50 for title + 30 for artist)"""
        track1 = TrackStub(artist="THE BEATLES", title="HEY JUDE", album="Album1")
        track2 = TrackStub(artist="the beatles", title="hey jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 80

    def test_mixed_case_partial_match(self):
        """Test case insensitive partial matching (30 for artist only)"""
        track1 = TrackStub(artist="The Beatles", title="HEY JUDE", album="Album1")
        track2 = TrackStub(artist="the beatles", title="Let It Be", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 30

    def test_empty_strings(self):
        """Test behavior with empty strings (50 for title + 30 for artist)"""
        track1 = TrackStub(artist="", title="", album="")
        track2 = TrackStub(artist="", title="", album="")
        
        result = get_match_score(track1, track2)
        assert result == 80

    def test_empty_vs_non_empty(self):
        """Test empty strings vs non-empty strings (gets substring match points)"""
        track1 = TrackStub(artist="", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="The Beatles", title="", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 45  # Empty strings are substrings of any string

    def test_whitespace_strings(self):
        """Test behavior with whitespace-only strings (50 for title + 30 for artist)"""
        track1 = TrackStub(artist="  ", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="  ", title="Hey Jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 80

    def test_special_characters(self):
        """Test matching with special characters (50 for title + 30 for artist)"""
        track1 = TrackStub(artist="AC/DC", title="T.N.T.", album="Album1")
        track2 = TrackStub(artist="AC/DC", title="T.N.T.", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 80

    def test_unicode_characters(self):
        """Test matching with unicode characters (50 for title + 30 for artist)"""
        track1 = TrackStub(artist="Björk", title="Café", album="Album1")
        track2 = TrackStub(artist="Björk", title="Café", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 80

    def test_long_strings(self):
        """Test matching with very long strings (50 for title + 30 for artist)"""
        long_artist = "A" * 1000
        long_title = "B" * 1000
        
        track1 = TrackStub(artist=long_artist, title=long_title, album="Album1")
        track2 = TrackStub(artist=long_artist, title=long_title, album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 80

    def test_normalized_title_match(self):
        """Test normalized title matching (40 for normalized title + 30 for exact artist)"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="The Beatles", title="Hey Jude (Remastered)", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 70

    def test_normalized_artist_match(self):
        """Test normalized artist matching (50 for exact title + 20 for normalized artist)"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="Beatles", title="Hey Jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 70

    def test_prefix_title_match(self):
        """Test prefix title matching (30 for prefix title + 30 for exact artist)"""
        track1 = TrackStub(artist="The Beatles", title="Hey", album="Album1")
        track2 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 60

    def test_prefix_artist_match(self):
        """Test prefix artist matching (50 for exact title + 15 for prefix artist)"""
        track1 = TrackStub(artist="Beat", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="Beatles", title="Hey Jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 65

    def test_substring_title_match(self):
        """Test substring title matching (20 for substring title + 30 for exact artist)"""
        track1 = TrackStub(artist="The Beatles", title="Jude", album="Album1")
        track2 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 50

    def test_substring_artist_match(self):
        """Test substring artist matching (50 for exact title + 10 for substring artist)"""
        track1 = TrackStub(artist="Beat", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 60

    def test_complex_normalized_match(self):
        """Test complex matching with both normalized artist and title"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album1")
        track2 = TrackStub(artist="Beatles", title="Hey Jude (2009 Remaster)", album="Album2")
        
        result = get_match_score(track1, track2)
        assert result == 60  # 40 for normalized title + 20 for normalized artist


class TestGetAlbumMatchScore:
    """Test cases for get_album_match_score function"""

    def test_perfect_album_match(self):
        """Test perfect album match returns 70 points (50 for title + 20 for artist)"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="The Beatles", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 70

    def test_album_artist_match_only(self):
        """Test matching album artist only returns 20 points"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="The Beatles", title="Sgt. Pepper's")
        
        result = get_album_match_score(album1, album2)
        assert result == 20

    def test_album_title_match_only(self):
        """Test matching album title only returns 50 points"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="Pink Floyd", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 50

    def test_album_no_match(self):
        """Test no album match returns 0 points"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="Pink Floyd", title="Dark Side of the Moon")
        
        result = get_album_match_score(album1, album2)
        assert result == 0

    def test_album_case_insensitive_matching(self):
        """Test that album matching is case insensitive (50 for title + 20 for artist)"""
        album1 = AlbumStub(artist="THE BEATLES", title="ABBEY ROAD")
        album2 = AlbumStub(artist="the beatles", title="abbey road")
        
        result = get_album_match_score(album1, album2)
        assert result == 70

    def test_album_mixed_case_partial_match(self):
        """Test case insensitive partial album matching (20 for artist only)"""
        album1 = AlbumStub(artist="The Beatles", title="ABBEY ROAD")
        album2 = AlbumStub(artist="the beatles", title="Sgt. Pepper's")
        
        result = get_album_match_score(album1, album2)
        assert result == 20

    def test_album_empty_strings(self):
        """Test album behavior with empty strings (50 for title + 20 for artist)"""
        album1 = AlbumStub(artist="", title="")
        album2 = AlbumStub(artist="", title="")
        
        result = get_album_match_score(album1, album2)
        assert result == 70

    def test_album_empty_vs_non_empty(self):
        """Test album empty strings vs non-empty strings (gets substring match points)"""
        album1 = AlbumStub(artist="", title="Abbey Road")
        album2 = AlbumStub(artist="The Beatles", title="")
        
        result = get_album_match_score(album1, album2)
        assert result == 40  # Empty strings are substrings of any string

    def test_album_whitespace_strings(self):
        """Test album behavior with whitespace-only strings (50 for title + 20 for artist)"""
        album1 = AlbumStub(artist="  ", title="Abbey Road")
        album2 = AlbumStub(artist="  ", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 70

    def test_album_special_characters(self):
        """Test album matching with special characters (50 for title + 20 for artist)"""
        album1 = AlbumStub(artist="AC/DC", title="Back in Black")
        album2 = AlbumStub(artist="AC/DC", title="Back in Black")
        
        result = get_album_match_score(album1, album2)
        assert result == 70

    def test_album_unicode_characters(self):
        """Test album matching with unicode characters (50 for title + 20 for artist)"""
        album1 = AlbumStub(artist="Björk", title="Medúlla")
        album2 = AlbumStub(artist="Björk", title="Medúlla")
        
        result = get_album_match_score(album1, album2)
        assert result == 70

    def test_album_normalized_title_match(self):
        """Test normalized album title matching (40 for normalized title + 20 for exact artist)"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="The Beatles", title="Abbey Road (Remastered)")
        
        result = get_album_match_score(album1, album2)
        assert result == 60

    def test_album_normalized_artist_match(self):
        """Test normalized album artist matching (50 for exact title + 15 for normalized artist)"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="Beatles", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 65

    def test_album_prefix_title_match(self):
        """Test prefix album title matching (30 for prefix title + 20 for exact artist)"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey")
        album2 = AlbumStub(artist="The Beatles", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 50

    def test_album_prefix_artist_match(self):
        """Test prefix album artist matching (50 for exact title + 10 for prefix artist)"""
        album1 = AlbumStub(artist="Beat", title="Abbey Road")
        album2 = AlbumStub(artist="Beatles", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 60

    def test_album_substring_title_match(self):
        """Test substring album title matching (20 for substring title + 20 for exact artist)"""
        album1 = AlbumStub(artist="The Beatles", title="Road")
        album2 = AlbumStub(artist="The Beatles", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 40

    def test_album_substring_artist_match(self):
        """Test substring album artist matching (50 for exact title + 5 for substring artist)"""
        album1 = AlbumStub(artist="Beat", title="Abbey Road")
        album2 = AlbumStub(artist="The Beatles", title="Abbey Road")
        
        result = get_album_match_score(album1, album2)
        assert result == 55

    def test_album_complex_normalized_match(self):
        """Test complex album matching with both normalized artist and title"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="Beatles", title="Abbey Road (2009 Remaster)")
        
        result = get_album_match_score(album1, album2)
        assert result == 55  # 40 for normalized title + 15 for normalized artist


class TestTrackStub:
    """Test cases for TrackStub namedtuple"""

    def test_track_stub_creation(self):
        """Test TrackStub creation and field access"""
        track = TrackStub(artist="The Beatles", title="Hey Jude", album="The Beatles 1967-1970")
        
        assert track.artist == "The Beatles"
        assert track.title == "Hey Jude"
        assert track.album == "The Beatles 1967-1970"

    def test_track_stub_immutability(self):
        """Test that TrackStub is immutable"""
        track = TrackStub(artist="The Beatles", title="Hey Jude", album="Album")
        
        with pytest.raises(AttributeError):
            track.artist = "New Artist"

    def test_track_stub_equality(self):
        """Test TrackStub equality comparison"""
        track1 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album")
        track2 = TrackStub(artist="The Beatles", title="Hey Jude", album="Album")
        track3 = TrackStub(artist="The Beatles", title="Let It Be", album="Album")
        
        assert track1 == track2
        assert track1 != track3


class TestAlbumStub:
    """Test cases for AlbumStub namedtuple"""

    def test_album_stub_creation(self):
        """Test AlbumStub creation and field access"""
        album = AlbumStub(artist="The Beatles", title="Abbey Road")
        
        assert album.artist == "The Beatles"
        assert album.title == "Abbey Road"

    def test_album_stub_immutability(self):
        """Test that AlbumStub is immutable"""
        album = AlbumStub(artist="The Beatles", title="Abbey Road")
        
        with pytest.raises(AttributeError):
            album.artist = "New Artist"

    def test_album_stub_equality(self):
        """Test AlbumStub equality comparison"""
        album1 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album2 = AlbumStub(artist="The Beatles", title="Abbey Road")
        album3 = AlbumStub(artist="The Beatles", title="Sgt. Pepper's")
        
        assert album1 == album2
        assert album1 != album3