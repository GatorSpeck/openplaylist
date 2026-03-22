"""
Tests for the lib.normalize module functions.

These functions are used by the matching algorithm to normalize titles and artists
for more accurate matching by removing common words, formatting, and metadata.
"""

import pytest
from lib.normalize import normalize_title, normalize_artist


class TestNormalizeTitle:
    """Test cases for normalize_title function"""

    def test_basic_normalization(self):
        """Test basic title normalization"""
        result = normalize_title("Hello World")
        assert result == "hello world"

    def test_whitespace_trimming(self):
        """Test whitespace trimming"""
        result = normalize_title("  Hello World  ")
        assert result == "hello world"

    def test_empty_string(self):
        """Test empty string input"""
        result = normalize_title("")
        assert result == ""

    def test_whitespace_only(self):
        """Test whitespace-only input"""
        result = normalize_title("   ")
        assert result == "   "  # Function returns original input when no tokens remain

    def test_year_remaster_patterns(self):
        """Test removal of year remaster patterns"""
        result = normalize_title("Song Title 2020 Remaster")
        assert result == "song title"
        
        result = normalize_title("Song Title 2020 Remastered")
        assert result == "song title"
        
        result = normalize_title("Song Title 1995 Remaster")
        assert result == "song title"

    def test_year_remix_patterns(self):
        """Test removal of year remix patterns"""
        result = normalize_title("Song Title 2020 Remix")
        assert result == "song title"
        
        result = normalize_title("Song Title 2020 Mix") 
        assert result == "song title"
        
        result = normalize_title("Song Title 1999 Remix")
        assert result == "song title"

        result = normalize_title("Song Title 2010 Remixed")
        assert result == "song title ed"  # "Remixed" gets stripped to "ed" after removing "remix"

    def test_remaster_token_removal(self):
        """Test removal of tokens starting with 'remaster'"""
        result = normalize_title("Song Title Remastered")
        assert result == "song title"
        
        result = normalize_title("Song Title Remaster")
        assert result == "song title"
        
        result = normalize_title("Song Title Remastering")
        assert result == "song title"

    def test_filtered_words_removal(self):
        """Test removal of common filtered words"""
        filtered_words = ["edition", "deluxe", "special", "version", "album", "single", "remix", "mono", "stereo", "mix"]
        
        for word in filtered_words:
            result = normalize_title(f"Song Title {word}")
            assert result == "song title", f"Failed to filter word: {word}"
            
            # Test case insensitive filtering
            result = normalize_title(f"Song Title {word.upper()}")
            assert result == "song title", f"Failed to filter uppercase word: {word.upper()}"

    def test_multiple_filtered_words(self):
        """Test removal of multiple filtered words"""
        result = normalize_title("Song Title Deluxe Edition Special Version")
        assert result == "song title"
        
        result = normalize_title("Song Title Album Single Remix Mono")
        assert result == "song title"

    def test_bracket_removal(self):
        """Test removal of brackets and parentheses"""
        result = normalize_title("Song Title (Remastered)")
        assert result == "song title"
        
        result = normalize_title("Song Title [Deluxe Edition]")
        assert result == "song title"
        
        result = normalize_title("Song Title - (Special Version)")
        assert result == "song title"
        
        result = normalize_title("Song Title [2020 Remaster]")
        assert result == "song title"

    def test_hyphen_removal(self):
        """Test removal of hyphens around tokens"""
        result = normalize_title("Song Title -Deluxe-")
        assert result == "song title"
        
        result = normalize_title("Song -Title- Mix")
        assert result == "song title"

    def test_complex_normalization(self):
        """Test complex title with multiple patterns"""
        result = normalize_title("The Beatles - Hey Jude (2009 Remastered) [Deluxe Edition]")
        assert result == "the beatles hey jude"
        
        result = normalize_title("Artist Name - Song Title (2020 Remix) [Special Edition] - Single")
        assert result == "artist name song title"

    def test_fallback_when_all_filtered(self):
        """Test fallback when all tokens are filtered"""
        result = normalize_title("Edition Deluxe Special Version")
        assert result == "Edition Deluxe Special Version"  # Should return original
        
        result = normalize_title("Album Single Remix Mono Stereo")
        assert result == "Album Single Remix Mono Stereo"  # Should return original

    def test_preserve_important_content(self):
        """Test that important content is preserved"""
        result = normalize_title("Love Song Part Two")
        assert result == "love song part two"
        
        result = normalize_title("Symphony No. 9")
        assert result == "symphony no. 9"
        
        result = normalize_title("Track 01 - Intro")
        assert result == "track 01 intro"

    def test_multiple_year_patterns(self):
        """Test multiple year patterns in same title"""
        result = normalize_title("Song 1995 Remix 2020 Remaster")
        assert result == "song"
        
        result = normalize_title("Title 2000 Mix 2010 Remastered")
        assert result == "title"

    def test_unicode_handling(self):
        """Test unicode character handling"""
        result = normalize_title("Café Münchën (2020 Remaster)")
        assert result == "café münchën"
        
        result = normalize_title("São Paulo [Deluxe Edition]")
        assert result == "são paulo"

    def test_special_characters(self):
        """Test handling of special characters"""
        result = normalize_title("AC/DC - T.N.T. (Remastered)")
        assert result == "ac/dc t.n.t."
        
        result = normalize_title("Song & Dance [Special Edition]")
        assert result == "song & dance"

    def test_numeric_content(self):
        """Test handling of numeric content"""
        result = normalize_title("Track 01 (2020 Remaster)")
        assert result == "track 01"
        
        result = normalize_title("Song 2 U [Deluxe]")
        assert result == "song 2 u"

    def test_edge_cases(self):
        """Test edge cases"""
        # Single filtered word
        result = normalize_title("Deluxe")
        assert result == "Deluxe"
        
        # Only brackets
        result = normalize_title("()")
        assert result == "()"  # Returns original when no valid tokens remain
        
        # Only year pattern
        result = normalize_title("2020 Remaster")
        assert result == "2020 Remaster"  # Returns original when all tokens filtered
        
        # Mixed case year pattern
        result = normalize_title("Song Title 2020 REMASTER")
        assert result == "song title"


class TestNormalizeArtist:
    """Test cases for normalize_artist function"""

    def test_basic_normalization(self):
        """Test basic artist normalization"""
        result = normalize_artist("The Beatles")
        assert result == "beatles"

    def test_whitespace_trimming(self):
        """Test whitespace trimming"""
        result = normalize_artist("  The Beatles  ")
        assert result == "beatles"

    def test_empty_string(self):
        """Test empty string input"""
        result = normalize_artist("")
        assert result == ""

    def test_whitespace_only(self):
        """Test whitespace-only input"""
        result = normalize_artist("   ")
        assert result == "   "  # Function returns original input when no tokens remain

    def test_the_removal(self):
        """Test removal of 'the' article"""
        result = normalize_artist("The Beatles")
        assert result == "beatles"
        
        result = normalize_artist("The Rolling Stones")
        assert result == "rolling stones"
        
        result = normalize_artist("the beatles")  # case insensitive
        assert result == "beatles"

    def test_conjunction_removal(self):
        """Test removal of conjunctions"""
        result = normalize_artist("Simon & Garfunkel")
        assert result == "simon garfunkel"
        
        result = normalize_artist("Artist and Band")
        assert result == "artist"  # "and" and "band" are both filtered out

    def test_ensemble_words_removal(self):
        """Test removal of ensemble/group words"""
        ensemble_words = ["band", "orchestra", "ensemble", "group", "trio", "quartet", "quintet", "sextet", "septet", "octet"]
        
        for word in ensemble_words:
            result = normalize_artist(f"Name {word}")
            assert result == "name", f"Failed to filter word: {word}"
            
            # Test case insensitive filtering
            result = normalize_artist(f"Name {word.upper()}")
            assert result == "name", f"Failed to filter uppercase word: {word.upper()}"

    def test_multiple_filtered_words(self):
        """Test removal of multiple filtered words"""
        result = normalize_artist("The Beatles Band")
        assert result == "beatles"
        
        result = normalize_artist("The Symphony Orchestra Ensemble")
        assert result == "symphony"

    def test_bracket_removal(self):
        """Test removal of brackets and parentheses"""
        result = normalize_artist("Artist (Band)")
        assert result == "artist"
        
        result = normalize_artist("Name [Orchestra]")
        assert result == "name"


class TestNormalizeArtistAdditional:
    def test_dash_bracket_removal(self):
        result = normalize_artist("The Beatles - (Group)")
        assert result == "beatles"  # Properly handles the dash and filtering

    def test_hyphen_removal(self):
        """Test removal of hyphens around tokens"""
        result = normalize_artist("Artist -Name- Band")
        assert result == "artist name"
        
        result = normalize_artist("The -Beatles-")
        assert result == "beatles"

    def test_complex_normalization(self):
        """Test complex artist names with multiple patterns"""
        result = normalize_artist("The London Symphony Orchestra Ensemble")
        assert result == "london symphony"
        
        result = normalize_artist("Artist & The Band Group")
        assert result == "artist"

    def test_fallback_when_all_filtered(self):
        """Test fallback when all tokens are filtered"""
        result = normalize_artist("The Band Orchestra")
        assert result == "The Band Orchestra"  # Should return original
        
        result = normalize_artist("& and Ensemble")
        assert result == "& and Ensemble"  # Should return original

    def test_preserve_important_content(self):
        """Test that important content is preserved"""
        result = normalize_artist("John Lennon")
        assert result == "john lennon"
        
        result = normalize_artist("Lady Gaga")
        assert result == "lady gaga"
        
        result = normalize_artist("50 Cent")
        assert result == "50 cent"

    def test_unicode_handling(self):
        """Test unicode character handling"""
        result = normalize_artist("Björk")
        assert result == "björk"
        
        result = normalize_artist("The Café Orchestra")
        assert result == "café"

    def test_special_characters(self):
        """Test handling of special characters"""
        result = normalize_artist("AC/DC")
        assert result == "ac/dc"
        
        result = normalize_artist("N.W.A")
        assert result == "n.w.a"
        
        result = normalize_artist("The $uicideboy$")
        assert result == "$uicideboy$"

    def test_numeric_content(self):
        """Test handling of numeric content"""
        result = normalize_artist("Blink-182")
        assert result == "blink-182"
        
        result = normalize_artist("2Pac")
        assert result == "2pac"

    def test_real_world_examples(self):
        """Test real-world artist names"""
        result = normalize_artist("The Red Hot Chili Peppers")
        assert result == "red hot chili peppers"
        
        result = normalize_artist("Florence & The Machine")
        assert result == "florence machine"
        
        result = normalize_artist("Mumford & Sons")
        assert result == "mumford sons"
        
        result = normalize_artist("The Dave Matthews Band")
        assert result == "dave matthews"

    def test_edge_cases(self):
        """Test edge cases"""
        # Single filtered word
        result = normalize_artist("Band")
        assert result == "Band"
        
        # Only brackets
        result = normalize_artist("()")
        assert result == "()"  # Returns original when no valid tokens remain
        
        # Only filtered words
        result = normalize_artist("The Band")
        assert result == "The Band"  # Should return original since all tokens filtered
        
        # Mixed case
        result = normalize_artist("THE BEATLES BAND")
        assert result == "beatles"

    def test_case_sensitivity(self):
        """Test case insensitive filtering"""
        result = normalize_artist("THE Beatles BAND")
        assert result == "beatles"
        
        result = normalize_artist("Artist AND Group")
        assert result == "artist"


class TestNormalizeFunctionIntegration:
    """Integration tests for both normalize functions"""

    def test_consistency_with_matching_algorithm(self):
        """Test that normalization works as expected with matching"""
        # These should normalize to the same values
        title1 = normalize_title("Hey Jude")
        title2 = normalize_title("Hey Jude (Remastered)")
        assert title1 == title2 == "hey jude"
        
        artist1 = normalize_artist("The Beatles")
        artist2 = normalize_artist("Beatles")
        assert artist1 == artist2 == "beatles"

    def test_common_music_scenarios(self):
        """Test common music normalization scenarios"""
        # Album vs single versions
        album_title = normalize_title("Song Title [Album Version]")
        single_title = normalize_title("Song Title [Single Version]")
        assert album_title == single_title == "song title"
        
        # Remaster scenarios
        original = normalize_title("Classic Song")
        remaster = normalize_title("Classic Song (2020 Remaster)")
        deluxe = normalize_title("Classic Song [Deluxe Edition]")
        assert original == remaster == deluxe == "classic song"

    def test_empty_result_handling(self):
        """Test handling when normalization results in empty strings"""
        # Title that would be filtered but returns original
        result = normalize_title("2020 Remaster")
        assert result == "2020 Remaster"
        
        # Artist that would be filtered but returns original  
        result = normalize_artist("()")
        assert result == "()"

    def test_regex_pattern_edge_cases(self):
        """Test edge cases with regex patterns"""
        # Year patterns at different positions
        result = normalize_title("2020 Remaster Song Title")
        assert result == "song title"
        
        result = normalize_title("Song 2020 Remaster Title")
        assert result == "song title"
        
        # Multiple years
        result = normalize_title("1999 Remix 2020 Remaster")
        assert result == "1999 Remix 2020 Remaster"  # Returns original when nothing left

    def test_token_stripping_edge_cases(self):
        """Test edge cases with token stripping"""
        # Multiple brackets and hyphens
        result = normalize_title("Song [[[Title]]] ---")
        assert result == "song title"
        
        result = normalize_artist("Artist ((((Name))))")
        assert result == "artist name"
        
        # Mixed bracket types
        result = normalize_title("Song [(Title)]")
        assert result == "song title"

    def test_performance_considerations(self):
        """Test with inputs that might cause performance issues"""
        # Very long strings
        long_title = "A" * 1000 + " (2020 Remaster)"
        result = normalize_title(long_title)
        assert result == "a" * 1000
        
        # Many repeated filtered words
        many_filtered = " ".join(["deluxe"] * 100)
        result = normalize_title(many_filtered)
        assert result == many_filtered  # Returns original when all filtered