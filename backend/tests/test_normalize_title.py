import pytest
from repositories.plex_repository import normalize_title

def test_normalize_title_basic():
    """Test basic title normalization"""
    result = normalize_title("Hello World")
    assert result == "hello world"

def test_normalize_title_whitespace():
    """Test whitespace trimming"""
    result = normalize_title("  Hello World  ")
    assert result == "hello world"

def test_normalize_title_remaster_year():
    """Test removal of year remaster patterns"""
    result = normalize_title("Song Title 2020 Remaster")
    assert result == "song title"
    
    result = normalize_title("Song Title 2020 Remastered")
    assert result == "song title"

def test_normalize_title_remix_year():
    """Test removal of year remix patterns"""
    result = normalize_title("Song Title 2020 Remix")
    assert result == "song title"
    
    result = normalize_title("Song Title 2020 Mix")
    assert result == "song title"

def test_normalize_title_remaster_token():
    """Test removal of tokens starting with 'remaster'"""
    result = normalize_title("Song Title Remastered Edition")
    assert result == "song title"

def test_normalize_title_filtered_words():
    """Test removal of common filtered words"""
    result = normalize_title("Song Title Deluxe Edition Special Version")
    assert result == "song title"
    
    result = normalize_title("Song Title Album Single Remix")
    assert result == "song title"

def test_normalize_title_empty_result():
    """Test fallback when all tokens are filtered"""
    result = normalize_title("Edition Deluxe Special Version")
    assert result == "Edition Deluxe Special Version"  # Should return original

def test_normalize_title_empty_string():
    """Test empty string input"""
    result = normalize_title("")
    assert result == ""

def test_normalize_title_complex():
    """Test complex title with multiple patterns"""
    result = normalize_title("The Beatles - Hey Jude (2009 Remastered) [Deluxe Edition]")
    assert result == "the beatles hey jude"

def test_normalize_title_case_sensitivity():
    """Test case insensitive filtering"""
    result = normalize_title("Song Title DELUXE EDITION")
    assert result == "song title"

def test_normalize_title_multiple_years():
    """Test multiple year patterns"""
    result = normalize_title("Song 1995 Remix 2020 Remaster")
    assert result == "song"

def test_normalize_title_preserve_important_words():
    """Test that important words are preserved"""
    result = normalize_title("Love Song Part Two")
    assert result == "love song part two"