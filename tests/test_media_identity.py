"""Read-only regression checks for local filename classification."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vault_server import is_movie_extra_path, movie_file_title, clean_movie_release_title, comic_folder_identity, movie_exclusion_reason

class MediaIdentityTests(unittest.TestCase):
    def test_non_movies(self):
        for path in [r'D:\TV Shows\Futurama\movie.mp4', r'D:\Youtube Downloads\Film.mp4', r'D:\Movies\Show.1x02.mkv', r'D:\Show\Season 2\02.mkv', r'D:\Music Videos\Film.mp4']:
            self.assertTrue(movie_exclusion_reason(path), path)
        self.assertEqual(movie_exclusion_reason(r'D:\Movies\The Interview (2014).mkv'), '')
    def test_extras(self):
        for name in ['Film/sample.mkv', 'Film/Deleted Scenes (1).mp4', 'Film/Extras/clip.mkv', 'Film/film-sample.mkv']:
            self.assertTrue(is_movie_extra_path(name), name)
    def test_real_titles(self):
        for name in ['The Interview (2014).mkv', 'The Big Short (2015).mkv', 'Short Circuit (1986).mkv']:
            self.assertFalse(is_movie_extra_path(name), name)
    def test_filename_preferred(self):
        self.assertEqual(movie_file_title(Path('D:/Movies/Comedy/Kung Pow.mkv')), ('Kung Pow', None))
        self.assertEqual(clean_movie_release_title('1917.2019.1080p.BluRay'), ('1917', 2019))
        self.assertEqual(clean_movie_release_title('The.Ghost.and.Mr.Chicken.1966.1080p'), ('The Ghost and Mr Chicken', 1966))
    def test_matrix_folder(self):
        result=comic_folder_identity(r'D:\Unsorted\The Matrix Comics Collection[Team Nanban][TPB]\Series 1\01 - Goliath - Neil Gaiman.pdf')
        self.assertEqual(result['seriesName'], 'The Matrix Comics')
        self.assertEqual(result['title'], 'Series 1 · Goliath')
        self.assertEqual(result['authors'], ['Neil Gaiman'])
        self.assertIsNone(result['seriesPosition'])
    def test_generic_folder_not_invented(self):
        self.assertEqual(comic_folder_identity(r'D:\Books\01 - Dune - Frank Herbert.epub'), {})

if __name__ == '__main__': unittest.main()
